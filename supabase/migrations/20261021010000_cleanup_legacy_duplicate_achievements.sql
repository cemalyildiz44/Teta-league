-- ═══════════════════════════════════════════════════════════════════════
-- TETA LEAGUE — 10 ESKİ MÜKERRER BAŞARIMI YEDEKLİ TEMİZLEME MİGRATION'I
-- Dosya: supabase/migrations/20261021010000_cleanup_legacy_duplicate_achievements.sql
--
-- AMAÇ:
-- 1. Dinamik kupa sistemine (trophies & trophy_winners) zaten aktarılmış olan
--    9 adet Season 5 TOTS ve 1 adet Season 5 BALLON_DOR eski kaydını kalıcı
--    _backup_legacy_player_achievements_20261021 tablosuna tüm özgün sütunlarıyla yedekler.
-- 2. Yedeklemenin 10 satırı eksiksiz kapsadığını ve tüm sütunların birebir
--    eşleştiğini doğruladıktan sonra yalnızca bu 10 hedef ID'yi player_achievements
--    tablosundan siler.
-- 3. Cemal Yıldız'ın Season 1 TOTS ve Season 2 Ballon d'Or tarihsel kayıtları ile
--    RavezDC'nin aktif turnuva şampiyonluğu (NIGHT_CUP_WINNER) kaydına KESİNLİKLE DOKUNMAZ.
-- 4. Bütün işlem tek bir ATOMİK TRANSACTION (BEGIN / COMMIT) içinde yürütülür;
--    herhangi bir hata durumunda ROLLBACK ile hiçbir değişiklik yapılmaz.
-- 5. İdempotenttir; tekrar çalıştırıldığında yedek tablosundaki 10 özgün satır
--    doğrulanır ve işlem güvenle atlanır.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
    -- 1. Hedef 10 ID Sabitleri (9 TOTS + 1 BALLON_DOR)
    c_target_ids CONSTANT UUID[] := ARRAY[
        '57011a7f-3750-4c0e-aacf-ed801cbeeb13'::uuid, -- TOTS: cemalyildiz263 (Season 5)
        '9ef07054-2860-4cae-b2ca-486370dbe45d'::uuid, -- TOTS: kaanakulker (Season 5)
        '0b8a2ecd-64bc-491c-8ebd-b1dfbf2afea0'::uuid, -- TOTS: gsdeno (Season 5)
        '0c95854a-e19c-416c-8352-ce8c21748321'::uuid, -- TOTS: AmonM (Season 5)
        '7ee7309e-2c66-4029-b46c-dcc83d30140b'::uuid, -- TOTS: 7H-MTeksen (Teksen, Season 5)
        'db4c059a-18a6-4c22-ac1e-d3c18598f293'::uuid, -- TOTS: Usttuna (Season 5)
        'f09faa1f-e9e7-4586-91c3-71c36a10bcc9'::uuid, -- TOTS: SavasLordu (Season 5)
        '6cdf406a-d645-4f95-999f-b837ad70306f'::uuid, -- TOTS: jav3lin (Season 5)
        '49a5c3ca-47e3-42ae-be66-c50bb2a33f06'::uuid, -- TOTS: Cegetomo (Season 5)
        'e9c12a89-6a7c-4db6-9445-63f839245a72'::uuid  -- BALLON_DOR: cemalyildiz263 (Season 5)
    ];

    -- 2. Kesinlikle Korunacak 3 Kayıt Sabiti
    c_preserved_ids CONSTANT UUID[] := ARRAY[
        '2d8c8312-642d-480d-a56b-436ea3773ddb'::uuid, -- cemalyildiz263 (TOTS, Season 1 Tarihsel)
        'a04ecd80-d608-4ef5-9400-a15ad3bbbf16'::uuid, -- cemalyildiz263 (BALLON_DOR, Season 2 Tarihsel)
        '00b00d34-67da-4128-ba9d-c75b647f1575'::uuid  -- RavezDC (NIGHT_CUP_WINNER, Warm-Up Cup Turnuva Şampiyonu)
    ];

    -- 3. İlgili Dinamik Kupa ID Sabitleri
    c_tots_trophy_id CONSTANT UUID := '5310622a-f5ff-4f84-a41d-faa6f24d7736'::uuid;       -- "Sezonun Takımı"
    c_ballon_dor_trophy_id CONSTANT UUID := '4b5b96be-9794-4c11-b8da-85f8579afb10'::uuid; -- "Ballon d'Or"
    c_season_5_id CONSTANT UUID := 'f9839a64-2f59-41cd-b03d-ac1261eba4f8'::uuid;          -- TETA SEASON 5

    -- Kontrol Değişkenleri
    v_backup_table_col_count INT;
    v_missing_schema_cols INT;
    v_remaining_target_count INT;
    v_backup_count INT;
    v_unexpected_backup_count INT;
    v_backup_inconsistent_count INT;
    v_preserved_present_count INT;
    v_invalid_match_count INT;
    v_verified_trophy_count INT;
    v_existing_backup_mismatch INT;
    v_mismatch_count INT;
    v_deleted_count INT;
    v_final_preserved_count INT;
BEGIN
    -- ─────────────────────────────────────────────────────────────────
    -- ADIM 1: Kalıcı Yedek Tablosunu Oluştur ve Şemasını Doğrula
    -- ─────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS public._backup_legacy_player_achievements_20261021 (
        id UUID PRIMARY KEY,
        player_id UUID NOT NULL,
        achievement_type TEXT NOT NULL,
        season_id UUID,
        season_name TEXT,
        match_id UUID,
        week_number INTEGER,
        month_number INTEGER,
        awarded_by UUID,
        awarded_at TIMESTAMP WITH TIME ZONE NOT NULL,
        backed_up_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
    );

    -- 1.1 Yedek tablosunun sütun sayısını kontrol et (beklenen: 11)
    SELECT COUNT(*) INTO v_backup_table_col_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '_backup_legacy_player_achievements_20261021';

    IF v_backup_table_col_count <> 11 THEN
        RAISE EXCEPTION 'BACKUP_TABLE_SCHEMA_INVALID: Yedek tablosu (_backup_legacy_player_achievements_20261021) beklenen 11 sütun yerine % sütun içeriyor. İşlem durduruldu.', v_backup_table_col_count;
    END IF;

    -- 1.2 Yedek tablosunun sütun adları ve türlerini doğrula
    SELECT COUNT(*) INTO v_missing_schema_cols
    FROM (
        VALUES
            ('id', 'uuid'),
            ('player_id', 'uuid'),
            ('achievement_type', 'text'),
            ('season_id', 'uuid'),
            ('season_name', 'text'),
            ('match_id', 'uuid'),
            ('week_number', 'integer'),
            ('month_number', 'integer'),
            ('awarded_by', 'uuid'),
            ('awarded_at', 'timestamp with time zone'),
            ('backed_up_at', 'timestamp with time zone')
    ) AS expected_cols(col_name, expected_type)
    WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = '_backup_legacy_player_achievements_20261021'
          AND c.column_name = expected_cols.col_name
          AND lower(c.data_type) = expected_cols.expected_type
    );

    IF v_missing_schema_cols > 0 THEN
        RAISE EXCEPTION 'BACKUP_TABLE_SCHEMA_INVALID: Yedek tablosunda beklenen sütun veya veri türü tanımlarından % tanesi eksik ya da uyumsuz. İşlem durduruldu.', v_missing_schema_cols;
    END IF;

    -- ─────────────────────────────────────────────────────────────────
    -- ADIM 2: İdempotency ve Kısmi Durum Kontrolü
    -- ─────────────────────────────────────────────────────────────────
    SELECT COUNT(*) INTO v_remaining_target_count
    FROM public.player_achievements
    WHERE id = ANY(c_target_ids);

    -- Durum A: Kaynakta hedef kayıtların hiçbiri kalmamışsa (Tekrar çalıştırma)
    IF v_remaining_target_count = 0 THEN
        -- 2.A.1: 10 hedef ID'nin tamamının yedek tabloda bulunduğunu doğrula
        SELECT COUNT(*) INTO v_backup_count
        FROM public._backup_legacy_player_achievements_20261021
        WHERE id = ANY(c_target_ids);

        IF v_backup_count <> 10 THEN
            RAISE EXCEPTION 'IDEMPOTENT_BACKUP_MISSING: Kaynakta 0 hedef kayıt kaldı ancak yedek tablosunda 10 adet doğrulanmış kayıt eksik (mevcut: %). Veri kaybı şüphesi nedeniyle işlem durduruldu.', v_backup_count;
        END IF;

        -- 2.A.2: Yedek tablosunda hedef 10 ID haricinde beklenmeyen kayıt bulunmadığını doğrula
        SELECT COUNT(*) INTO v_unexpected_backup_count
        FROM public._backup_legacy_player_achievements_20261021
        WHERE NOT (id = ANY(c_target_ids));

        IF v_unexpected_backup_count > 0 THEN
            RAISE EXCEPTION 'IDEMPOTENT_BACKUP_UNEXPECTED_IDS: Yedek tablosunda hedef 10 ID haricinde beklenmeyen % adet kayıt bulundu. İşlem iptal edildi.', v_unexpected_backup_count;
        END IF;

        -- 2.A.3: Yedek tablodaki 10 kaydın tüm özgün sütunlarının beklenen değerlerle tam tutarlı olduğunu doğrula
        WITH expected_backup_records (id, player_id, achievement_type, season_id, awarded_by, expected_awarded_at) AS (
            VALUES
                ('e9c12a89-6a7c-4db6-9445-63f839245a72'::uuid, '56cdb4f5-d97f-4272-b338-a0024105f987'::uuid, 'BALLON_DOR', 'f9839a64-2f59-41cd-b03d-ac1261eba4f8'::uuid, 'fcf3cf30-f6af-4cdb-b60c-edd8985794b4'::uuid, '2026-09-24T13:25:23.824051+00:00'::timestamptz),
                ('57011a7f-3750-4c0e-aacf-ed801cbeeb13'::uuid, '56cdb4f5-d97f-4272-b338-a0024105f987'::uuid, 'TOTS', 'f9839a64-2f59-41cd-b03d-ac1261eba4f8'::uuid, 'fcf3cf30-f6af-4cdb-b60c-edd8985794b4'::uuid, '2026-09-25T14:47:43.57357+00:00'::timestamptz),
                ('9ef07054-2860-4cae-b2ca-486370dbe45d'::uuid, '5d3549e5-a609-44aa-b3bd-7ca723dfa611'::uuid, 'TOTS', 'f9839a64-2f59-41cd-b03d-ac1261eba4f8'::uuid, '441b8625-a872-42c4-9017-a7d26e7d4ddf'::uuid, '2026-10-01T11:54:18.740346+00:00'::timestamptz),
                ('0b8a2ecd-64bc-491c-8ebd-b1dfbf2afea0'::uuid, '7884e669-11e2-437a-bea3-eea0e8887d6b'::uuid, 'TOTS', 'f9839a64-2f59-41cd-b03d-ac1261eba4f8'::uuid, '441b8625-a872-42c4-9017-a7d26e7d4ddf'::uuid, '2026-10-01T11:56:10.142884+00:00'::timestamptz),
                ('0c95854a-e19c-416c-8352-ce8c21748321'::uuid, 'bfcf8e96-92f1-48e9-9e39-8f0f63ea4d4f'::uuid, 'TOTS', 'f9839a64-2f59-41cd-b03d-ac1261eba4f8'::uuid, '441b8625-a872-42c4-9017-a7d26e7d4ddf'::uuid, '2026-10-01T11:56:26.709245+00:00'::timestamptz),
                ('7ee7309e-2c66-4029-b46c-dcc83d30140b'::uuid, 'aecc50e0-7e05-4521-866b-5caa9940779f'::uuid, 'TOTS', 'f9839a64-2f59-41cd-b03d-ac1261eba4f8'::uuid, '441b8625-a872-42c4-9017-a7d26e7d4ddf'::uuid, '2026-10-01T11:56:50.531246+00:00'::timestamptz),
                ('db4c059a-18a6-4c22-ac1e-d3c18598f293'::uuid, '539d4583-68d8-443a-b20f-00f9ad9e80f0'::uuid, 'TOTS', 'f9839a64-2f59-41cd-b03d-ac1261eba4f8'::uuid, '441b8625-a872-42c4-9017-a7d26e7d4ddf'::uuid, '2026-10-01T11:56:58.71992+00:00'::timestamptz),
                ('f09faa1f-e9e7-4586-91c3-71c36a10bcc9'::uuid, '8aa82256-2acb-415c-9653-0a2418d433ee'::uuid, 'TOTS', 'f9839a64-2f59-41cd-b03d-ac1261eba4f8'::uuid, '441b8625-a872-42c4-9017-a7d26e7d4ddf'::uuid, '2026-10-01T11:57:11.375843+00:00'::timestamptz),
                ('6cdf406a-d645-4f95-999f-b837ad70306f'::uuid, 'dee7fe93-70d8-44b3-a1ad-302e79aa83b7'::uuid, 'TOTS', 'f9839a64-2f59-41cd-b03d-ac1261eba4f8'::uuid, '441b8625-a872-42c4-9017-a7d26e7d4ddf'::uuid, '2026-10-01T11:58:14.445879+00:00'::timestamptz),
                ('49a5c3ca-47e3-42ae-be66-c50bb2a33f06'::uuid, '3d14e111-c591-4649-84a5-6b1e23188d3a'::uuid, 'TOTS', 'f9839a64-2f59-41cd-b03d-ac1261eba4f8'::uuid, '441b8625-a872-42c4-9017-a7d26e7d4ddf'::uuid, '2026-10-01T11:58:46.177622+00:00'::timestamptz)
        )
        SELECT COUNT(*) INTO v_backup_inconsistent_count
        FROM expected_backup_records e
        LEFT JOIN public._backup_legacy_player_achievements_20261021 b ON b.id = e.id
        WHERE b.id IS NULL
           OR b.player_id IS DISTINCT FROM e.player_id
           OR b.achievement_type IS DISTINCT FROM e.achievement_type
           OR b.season_id IS DISTINCT FROM e.season_id
           OR b.season_name IS NOT NULL
           OR b.match_id IS NOT NULL
           OR b.week_number IS NOT NULL
           OR b.month_number IS NOT NULL
           OR b.awarded_by IS DISTINCT FROM e.awarded_by
           OR b.awarded_at IS DISTINCT FROM e.expected_awarded_at;

        IF v_backup_inconsistent_count > 0 THEN
            RAISE EXCEPTION 'IDEMPOTENT_BACKUP_INCONSISTENT: Yedek tablosundaki satırlar beklenen 10 özgün veriyle tutarsız (% tutarsız/eksik kayıt). İşlem iptal edildi.', v_backup_inconsistent_count;
        END IF;

        -- 2.A.4: Korunması gereken 3 kaydın yerinde olduğunu teyit et
        SELECT COUNT(*) INTO v_preserved_present_count
        FROM public.player_achievements
        WHERE id = ANY(c_preserved_ids);

        IF v_preserved_present_count <> 3 THEN
            RAISE EXCEPTION 'IDEMPOTENT_PRESERVED_MISSING: Korunması gereken 3 tarihsel/turnuva kaydı eksik (mevcut: %). İşlem iptal edildi.', v_preserved_present_count;
        END IF;

        RAISE NOTICE 'IDEMPOTENT_SKIP: 10 mükerrer başarım daha önce başarıyla _backup_legacy_player_achievements_20261021 tablosuna yedeklenmiş ve kaynaktan temizlenmiştir. Temizlik adımı güvenle atlandı.';
        RETURN;
    ELSIF v_remaining_target_count <> 10 THEN
        -- Durum B: Kaynakta 1-9 arası hedef kayıt kalmışsa (kısmi durum engeli)
        RAISE EXCEPTION 'PARTIAL_STATE_ABORT: Kaynak player_achievements tablosunda beklenen 10 hedef kayıttan yalnızca % tanesi bulundu (1-9 arası kısmi durum). Olası manuel değişiklik veya veri tutarsızlığı nedeniyle işlem durduruldu.', v_remaining_target_count;
    END IF;

    -- ─────────────────────────────────────────────────────────────────
    -- ADIM 3: Ön Koşul Doğrulamaları (Preconditions)
    -- ─────────────────────────────────────────────────────────────────
    -- 3.1 Korunması gereken 3 kaydın player_achievements tablosunda bulunduğunu doğrula
    SELECT COUNT(*) INTO v_preserved_present_count
    FROM public.player_achievements
    WHERE id = ANY(c_preserved_ids);

    IF v_preserved_present_count <> 3 THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Korunması gereken 3 tarihsel/turnuva kaydından bazıları player_achievements tablosunda eksik (mevcut: %). İşlem güvenlik nedeniyle durduruldu.', v_preserved_present_count;
    END IF;

    -- 3.2 Hedef 10 kaydın her birinin yeni dinamik kupa sisteminde (trophy_winners & trophies)
    --     doğru kupa ID'si, doğru oyuncu kimliği, winner_type = 'PLAYER' ve Season 5 (trophies.season_id)
    --     ilişkisiyle TAM OLARAK 1 geçerli kupa ataması olduğunu doğrula.
    SELECT COUNT(*) INTO v_invalid_match_count
    FROM (
        SELECT pa.id,
               COUNT(
                   CASE
                       WHEN tw.id IS NOT NULL
                        AND tr.id IS NOT NULL
                        AND tw.player_id = pa.player_id
                        AND tw.winner_type = 'PLAYER'
                        AND tr.season_id = pa.season_id
                        AND tr.season_id = c_season_5_id
                        AND (
                            (pa.achievement_type = 'TOTS' AND tw.trophy_id = c_tots_trophy_id AND tr.id = c_tots_trophy_id)
                            OR
                            (pa.achievement_type = 'BALLON_DOR' AND tw.trophy_id = c_ballon_dor_trophy_id AND tr.id = c_ballon_dor_trophy_id)
                        )
                       THEN 1
                   END
               ) AS valid_match_count
        FROM public.player_achievements pa
        LEFT JOIN public.trophy_winners tw
          ON tw.player_id = pa.player_id
         AND tw.winner_type = 'PLAYER'
         AND (
             (pa.achievement_type = 'TOTS' AND tw.trophy_id = c_tots_trophy_id)
             OR
             (pa.achievement_type = 'BALLON_DOR' AND tw.trophy_id = c_ballon_dor_trophy_id)
         )
        LEFT JOIN public.trophies tr
          ON tr.id = tw.trophy_id
         AND tr.season_id = pa.season_id
         AND tr.season_id = c_season_5_id
        WHERE pa.id = ANY(c_target_ids)
          AND pa.season_id = c_season_5_id
        GROUP BY pa.id
    ) t
    WHERE t.valid_match_count <> 1;

    IF v_invalid_match_count > 0 THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Hedef 10 kayıttan bazılarının yeni kupa sisteminde (trophy_winners + trophies) Season 5 ile ilişkili tam olarak 1 adet geçerli kupa karşılığı bulunamadı (% uyumsuz kayıt). İşlem durduruldu.', v_invalid_match_count;
    END IF;

    -- 3.3 Toplam doğrulanmış farklı hedef ID sayısının tam olarak 10 olduğunu teyit et (COUNT(DISTINCT pa.id))
    SELECT COUNT(DISTINCT pa.id) INTO v_verified_trophy_count
    FROM public.player_achievements pa
    JOIN public.trophy_winners tw
      ON tw.player_id = pa.player_id
     AND tw.winner_type = 'PLAYER'
    JOIN public.trophies tr
      ON tr.id = tw.trophy_id
     AND tr.season_id = pa.season_id
     AND tr.season_id = c_season_5_id
     AND (
         (pa.achievement_type = 'TOTS' AND tw.trophy_id = c_tots_trophy_id AND tr.id = c_tots_trophy_id)
         OR
         (pa.achievement_type = 'BALLON_DOR' AND tw.trophy_id = c_ballon_dor_trophy_id AND tr.id = c_ballon_dor_trophy_id)
     )
    WHERE pa.id = ANY(c_target_ids)
      AND pa.season_id = c_season_5_id;

    IF v_verified_trophy_count <> 10 THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Beklenen 10 adet doğrulanmış farklı hedef ID yerine % kayıt bulundu. İşlem durduruldu.', v_verified_trophy_count;
    END IF;

    -- ─────────────────────────────────────────────────────────────────
    -- ADIM 4: Yedek Tablosunda Önceden Var Olan Kayıtların Bütünlük Denetimi
    -- ─────────────────────────────────────────────────────────────────
    SELECT COUNT(*) INTO v_existing_backup_mismatch
    FROM public.player_achievements pa
    JOIN public._backup_legacy_player_achievements_20261021 b ON b.id = pa.id
    WHERE pa.id = ANY(c_target_ids)
      AND (
          pa.player_id IS DISTINCT FROM b.player_id OR
          pa.achievement_type IS DISTINCT FROM b.achievement_type OR
          pa.season_id IS DISTINCT FROM b.season_id OR
          pa.season_name IS DISTINCT FROM b.season_name OR
          pa.match_id IS DISTINCT FROM b.match_id OR
          pa.week_number IS DISTINCT FROM b.week_number OR
          pa.month_number IS DISTINCT FROM b.month_number OR
          pa.awarded_by IS DISTINCT FROM b.awarded_by OR
          pa.awarded_at IS DISTINCT FROM b.awarded_at
      );

    IF v_existing_backup_mismatch > 0 THEN
        RAISE EXCEPTION 'BACKUP_CONFLICT_DATA_MISMATCH: Yedek tablosunda önceden var olan kayıt ile kaynak satır arasında sütun uyumsuzluğu bulundu (% uyumsuz satır). Ezme engellendi, işlem iptal edildi.', v_existing_backup_mismatch;
    END IF;

    -- ─────────────────────────────────────────────────────────────────
    -- ADIM 5: 10 Özgün Satırı Tüm Sütunlarıyla Yedek Tablosuna Ekle
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO public._backup_legacy_player_achievements_20261021 (
        id, player_id, achievement_type, season_id, season_name, match_id, week_number, month_number, awarded_by, awarded_at
    )
    SELECT
        pa.id, pa.player_id, pa.achievement_type, pa.season_id, pa.season_name, pa.match_id, pa.week_number, pa.month_number, pa.awarded_by, pa.awarded_at
    FROM public.player_achievements pa
    WHERE pa.id = ANY(c_target_ids)
    ON CONFLICT (id) DO NOTHING;

    -- ─────────────────────────────────────────────────────────────────
    -- ADIM 6: Yedekleme Bütünlüğü Doğrulaması (Post-Backup Assertions)
    -- ─────────────────────────────────────────────────────────────────
    -- 6.1 Hedef 10 kaydın tamamının yedek tablosunda mevcut olduğunu doğrula
    SELECT COUNT(*) INTO v_backup_count
    FROM public._backup_legacy_player_achievements_20261021
    WHERE id = ANY(c_target_ids);

    IF v_backup_count <> 10 THEN
        RAISE EXCEPTION 'BACKUP_INCOMPLETE: Yedek tablosunda 10 hedef kayıttan yalnızca % tanesi bulundu. Silme işlemi güvenlik nedeniyle durduruldu.', v_backup_count;
    END IF;

    -- 6.2 Yedek tablosundaki her satırın player_achievements ile TÜM SÜTUNLAR üzerinden birebir eşleştiğini doğrula
    SELECT COUNT(*) INTO v_mismatch_count
    FROM public.player_achievements pa
    JOIN public._backup_legacy_player_achievements_20261021 b ON b.id = pa.id
    WHERE pa.id = ANY(c_target_ids)
      AND (
          pa.player_id IS DISTINCT FROM b.player_id OR
          pa.achievement_type IS DISTINCT FROM b.achievement_type OR
          pa.season_id IS DISTINCT FROM b.season_id OR
          pa.season_name IS DISTINCT FROM b.season_name OR
          pa.match_id IS DISTINCT FROM b.match_id OR
          pa.week_number IS DISTINCT FROM b.week_number OR
          pa.month_number IS DISTINCT FROM b.month_number OR
          pa.awarded_by IS DISTINCT FROM b.awarded_by OR
          pa.awarded_at IS DISTINCT FROM b.awarded_at
      );

    IF v_mismatch_count > 0 THEN
        RAISE EXCEPTION 'BACKUP_VERIFICATION_FAILED: Yedek tablosundaki veriler player_achievements tablosuyla birebir uyuşmuyor (% uyumsuzluk). İşlem güvenlik nedeniyle durduruldu.', v_mismatch_count;
    END IF;

    -- ─────────────────────────────────────────────────────────────────
    -- ADIM 7: Yalnızca Doğrulanmış ve Yedeklenmiş 10 Hedef Satırı Sil
    -- ─────────────────────────────────────────────────────────────────
    DELETE FROM public.player_achievements
    WHERE id = ANY(c_target_ids);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count <> 10 THEN
        RAISE EXCEPTION 'SAFETY_CHECK_FAILED: Beklenen 10 silme işlemi yerine % satır silindi. Transaction geri alınıyor.', v_deleted_count;
    END IF;

    -- ─────────────────────────────────────────────────────────────────
    -- ADIM 8: Silme Sonrası Korunan Kayıtların Bütünlük Denetimi
    -- ─────────────────────────────────────────────────────────────────
    SELECT COUNT(*) INTO v_final_preserved_count
    FROM public.player_achievements
    WHERE id = ANY(c_preserved_ids);

    IF v_final_preserved_count <> 3 THEN
        RAISE EXCEPTION 'SAFETY_CHECK_FAILED: Silme işlemi sonrasında korunması gereken 3 tarihsel/turnuva kaydından bazıları eksildi (kalan: %). Transaction geri alınıyor.', v_final_preserved_count;
    END IF;

    RAISE NOTICE 'SUCCESS: 10 mükerrer başarım _backup_legacy_player_achievements_20261021 tablosuna tüm sütunlarıyla eksiksiz yedeklendi ve player_achievements tablosundan güvenle temizlendi. Korunan 3 kayıt sağlamdır.';
END;
$$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- DOĞRULAMA VE ROLLBACK TALİMATLARI
-- ═══════════════════════════════════════════════════════════════════════
-- 1. Temizlik Sonrası Kontrol Sorgusu:
-- SELECT id, player_id, achievement_type, season_id, season_name, awarded_at 
-- FROM public.player_achievements;
-- (Beklenen sonuç: Tam olarak 3 satır kalmalıdır: 2 Cemal Yıldız tarihsel + 1 RavezDC turnuva)
--
-- 2. Yedek Tablosu Kontrol Sorgusu:
-- SELECT COUNT(*) FROM public._backup_legacy_player_achievements_20261021;
-- (Beklenen sonuç: 10)
--
-- 3. Gerekirse Rollback (Geri Alma) Sorgusu:
-- BEGIN;
-- INSERT INTO public.player_achievements (
--     id, player_id, achievement_type, season_id, season_name, match_id, week_number, month_number, awarded_by, awarded_at
-- )
-- SELECT
--     id, player_id, achievement_type, season_id, season_name, match_id, week_number, month_number, awarded_by, awarded_at
-- FROM public._backup_legacy_player_achievements_20261021;
-- COMMIT;

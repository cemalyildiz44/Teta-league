-- 20261021000000_fix_totw_duplicate_achievement.sql
-- TETA League: Fix TOTW Duplicate Achievement & Clean Up Redundant Records
--
-- 1. Redefines submit_and_lock_totw RPC:
--    - Concurrency & Lock Handling:
--      * Advisory transaction lock serialized per season + league + week
--      * Explicit is_locked = true check prevents overwriting locked weeks without blocking draft cleanup
--      * Unlocked drafts (is_locked = false) are cleanly cleaned up prior to inserting the new locked record
--    - Preserves all security & business validations:
--      * active admin role check with ur.revoked_at IS NULL
--      * league-season relationship validation
--      * trophy target_type ('PLAYER' or 'BOTH') validation
--      * trophy season matching validation
--      * selections JSON array validation (jsonb_typeof = 'array' AND length = 11)
--      * strict anti-duplicate validation: 11 distinct player_ids, 11 distinct slot_keys, 11 distinct slot_indices
--      * foreign key integrity verification against profiles table
--    - Awards ONLY the selected trophy in trophy_winners (removes redundant INSERT into player_achievements).
-- 2. Safely backs up and deletes strictly the 22 verified redundant player_achievements records:
--    - Atomic transaction scope (BEGIN / COMMIT)
--    - Idempotent: safe to run multiple times without blocking RPC updates
--    - Pre-condition assertion verifying:
--      * trophy_winners.trophy_id = totw_weeks.trophy_id
--      * direct league matching: exactly 11 for Süperlig (ff11f913-a936-4ff1-99ee-ecc56afd373e)
--                               and exactly 11 for ECL 1.Lig (d653ca5a-8964-4bc8-a905-95d5e9107186)
--      * each target ID has EXACTLY 1 matching locked TOTW week and 1 matching trophy_winners record
--    - Pre-backup conflict verification: existing backup rows differing from source are never overwritten (aborts transaction)
--    - ON CONFLICT DO NOTHING preserves identical existing backup rows safely
--    - Column-by-column verification between backup table and source table across all 10 schema fields
--    - Post-condition assertion on ROW_COUNT = 22
-- 3. Documents exact, reversible rollback procedures preserving original primary keys and timestamps.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- BÖLÜM 1: RPC Düzeltmesi (İdempotent, Tam Güvenlik Doğrulamalı)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.submit_and_lock_totw(
    p_season_id UUID,
    p_league_id UUID,
    p_week_number INTEGER,
    p_formation TEXT,
    p_trophy_id UUID,
    p_selections JSONB,
    p_notes_prefix TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_totw_week_id UUID;
    v_trophy RECORD;
    v_season_name TEXT;
    v_league_name TEXT;
    v_item JSONB;
    v_player_id UUID;
    v_team_id UUID;
    v_slot_key TEXT;
    v_slot_index INTEGER;
    v_role_group TEXT;
    v_pos_label TEXT;
    v_rating NUMERIC(4,2);
    v_score NUMERIC(6,2);
    v_note TEXT;
    v_count INTEGER := 0;
    v_unique_players INTEGER;
    v_unique_slot_keys INTEGER;
    v_unique_slot_indices INTEGER;
BEGIN
    -- 1. Admin yetkilendirmesi (aktif ve yetkisi geri alınmamış ADMIN veya SUPER_ADMIN)
    IF v_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = v_actor
          AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
          AND ur.is_active = true
          AND ur.revoked_at IS NULL
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Bu işlemi yalnızca yetkili adminler gerçekleştirebilir.' USING ERRCODE = '42501';
    END IF;

    -- 2. Eşzamanlı çakışmaları önlemek için advisory transaction lock (Sezon + Lig + Hafta bazında tam izolasyon)
    PERFORM pg_advisory_xact_lock(hashtextextended('totw:' || COALESCE(p_season_id::text, '') || ':' || COALESCE(p_league_id::text, '') || ':' || COALESCE(p_week_number::text, ''), 0));

    -- 3. Sezon ve Lig ilişkisinin doğrulanması
    SELECT s.name, l.name INTO v_season_name, v_league_name
    FROM public.leagues l
    JOIN public.seasons s ON s.id = l.season_id
    WHERE l.id = p_league_id AND l.season_id = p_season_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_SCOPE: Seçilen lig, seçilen sezona ait değil.';
    END IF;

    IF p_week_number IS NULL OR p_week_number < 1 THEN
        RAISE EXCEPTION 'INVALID_WEEK: Geçersiz hafta numarası.';
    END IF;

    IF p_formation NOT IN ('4-3-3', '4-4-2', '4-2-3-1', '3-5-2') THEN
        RAISE EXCEPTION 'INVALID_FORMATION: Desteklenmeyen formasyon (%).', p_formation;
    END IF;

    -- 4. Kilit kontrolü: Eğer hafta zaten kilitlenmişse (is_locked = true) tekrar gönderime izin verme
    -- (Kilitlenmemiş taslaklar bu kontrole takılmaz, 7. adımda temizlenip kilitli olarak yeniden oluşturulur)
    IF EXISTS (
        SELECT 1 FROM public.totw_weeks
        WHERE season_id = p_season_id
          AND league_id = p_league_id
          AND week_number = p_week_number
          AND is_locked = true
    ) THEN
        RAISE EXCEPTION 'ALREADY_LOCKED: Bu sezon, lig ve hafta için TOTW zaten gönderilmiş ve kilitlenmiştir.' USING ERRCODE = '23505';
    END IF;

    -- 5. Kupa uygunluk kontrolleri
    SELECT id, title, target_type, season_id, season_name INTO v_trophy
    FROM public.trophies
    WHERE id = p_trophy_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TROPHY_NOT_FOUND: Seçilen ödül veritabanında bulunamadı.';
    END IF;

    IF v_trophy.target_type NOT IN ('PLAYER', 'BOTH') THEN
        RAISE EXCEPTION 'INVALID_TROPHY_TARGET: Seçilen ödül yalnızca takımlar içindir; oyuncu TOTW ödülü olarak kullanılamaz.';
    END IF;

    IF v_trophy.season_id IS NOT NULL AND v_trophy.season_id <> p_season_id THEN
        RAISE EXCEPTION 'TROPHY_SEASON_MISMATCH: Seçilen ödül başka bir sezona tanımlanmış.';
    END IF;

    -- 6. Kadro verisi ve JSON kontrolleri
    IF p_selections IS NULL OR jsonb_typeof(p_selections) <> 'array' OR jsonb_array_length(p_selections) <> 11 THEN
        RAISE EXCEPTION 'INCOMPLETE_SQUAD: TOTW göndermek için tam olarak 11 pozisyon seçimi içeren bir liste gereklidir.';
    END IF;

    -- Tekrarlanan oyuncu, slot_key veya slot_index kontrolleri
    SELECT
        COUNT(DISTINCT (elem->>'player_id')::uuid),
        COUNT(DISTINCT (elem->>'slot_key')),
        COUNT(DISTINCT (elem->>'slot_index')::int)
    INTO v_unique_players, v_unique_slot_keys, v_unique_slot_indices
    FROM jsonb_array_elements(p_selections) elem;

    IF v_unique_players <> 11 THEN
        RAISE EXCEPTION 'DUPLICATE_PLAYER: Kadroda aynı oyuncu birden fazla pozisyona seçilemez.';
    END IF;

    IF v_unique_slot_keys <> 11 THEN
        RAISE EXCEPTION 'DUPLICATE_SLOT_KEY: Kadroda aynı slot_key değeri birden fazla kez kullanılamaz.';
    END IF;

    IF v_unique_slot_indices <> 11 THEN
        RAISE EXCEPTION 'DUPLICATE_SLOT_INDEX: Kadroda aynı slot_index değeri birden fazla kez kullanılamaz.';
    END IF;

    -- Seçilen tüm oyuncuların geçerli profil kaydı olduğunu doğrula
    IF (
        SELECT COUNT(*)
        FROM public.profiles
        WHERE id IN (
            SELECT (elem->>'player_id')::uuid
            FROM jsonb_array_elements(p_selections) elem
        )
    ) <> 11 THEN
        RAISE EXCEPTION 'INVALID_PLAYER: Kadrodaki oyunculardan biri veya birkaçı sistemde kayıtlı geçerli bir oyuncu değil.';
    END IF;

    -- 7. Varsa aynı hafta için kilitlenmemiş eski taslağı temizle (ON DELETE CASCADE ile seçimleri de silinir)
    DELETE FROM public.totw_weeks
    WHERE season_id = p_season_id
      AND league_id = p_league_id
      AND week_number = p_week_number
      AND is_locked = false;

    -- 8. Kilitli TOTW haftasını oluştur
    INSERT INTO public.totw_weeks (
        season_id, league_id, week_number, formation, trophy_id, is_locked, submitted_by, submitted_at
    ) VALUES (
        p_season_id, p_league_id, p_week_number, p_formation, p_trophy_id, true, v_actor, now()
    )
    RETURNING id INTO v_totw_week_id;

    -- 9. 11 seçimi kaydet ve SADECE trophy_winners tablosuna kupa ekle
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_selections) LOOP
        v_player_id  := (v_item->>'player_id')::uuid;
        v_team_id    := NULLIF(v_item->>'team_id', '')::uuid;
        v_slot_key   := v_item->>'slot_key';
        v_slot_index := (v_item->>'slot_index')::int;
        v_role_group := v_item->>'role_group';
        v_pos_label  := v_item->>'position_label';
        v_rating     := NULLIF(v_item->>'rating', '')::numeric(4,2);
        v_score      := NULLIF(v_item->>'score', '')::numeric(6,2);

        IF v_player_id IS NULL THEN
            RAISE EXCEPTION 'MISSING_PLAYER: % pozisyonunda oyuncu seçilmemiş.', COALESCE(v_slot_key, '?');
        END IF;

        INSERT INTO public.totw_selections (
            totw_week_id, slot_key, slot_index, role_group, position_label,
            player_id, team_id, rating, score, stats_snapshot
        ) VALUES (
            v_totw_week_id, v_slot_key, v_slot_index, v_role_group, v_pos_label,
            v_player_id, v_team_id, v_rating, v_score, COALESCE(v_item->'stats_snapshot', '{}'::jsonb)
        );

        v_note := COALESCE(
            NULLIF(trim(p_notes_prefix), ''),
            v_season_name || ' • ' || v_league_name || ' • ' || p_week_number || '. Dönem TOTW'
        ) || ' (' || v_pos_label || ')';

        INSERT INTO public.trophy_winners (
            trophy_id, winner_type, player_id, team_id, totw_week_id, notes, awarded_by, awarded_at
        ) VALUES (
            p_trophy_id, 'PLAYER', v_player_id, NULL, v_totw_week_id, v_note, v_actor, now()
        );

        v_count := v_count + 1;
    END LOOP;

    IF v_count <> 11 THEN
        RAISE EXCEPTION 'INCOMPLETE_AWARD_COUNT: Beklenen 11 oyuncu yerine % oyuncu işlendi.', v_count;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'totw_week_id', v_totw_week_id,
        'awarded_count', v_count,
        'trophy_title', v_trophy.title
    );
END;
$$;

-- İzinler
REVOKE ALL ON FUNCTION public.submit_and_lock_totw(UUID, UUID, INTEGER, TEXT, UUID, JSONB, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_and_lock_totw(UUID, UUID, INTEGER, TEXT, UUID, JSONB, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════
-- BÖLÜM 2: 22 Doğrulanmış Kaydın Yedeklenmesi ve Güvenli Temizliği
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    -- Lig kimlikleri (Doğrulanmış canlı veritabanı değerleri)
    c_superlig_league_id CONSTANT UUID := 'ff11f913-a936-4ff1-99ee-ecc56afd373e'::uuid;
    c_first_lig_league_id CONSTANT UUID := 'd653ca5a-8964-4bc8-a905-95d5e9107186'::uuid;

    -- Süperlig 1. Hafta (11 Oyuncu)
    c_superlig_target_ids CONSTANT UUID[] := ARRAY[
        '838eae07-d876-4935-877a-0345610b797b'::uuid, -- @ANT-Kayra377
        '51adb2b2-0687-46f7-8748-072453594efc'::uuid, -- @Palian
        'c32c7449-1d8c-4eee-93f5-986dcdff6704'::uuid, -- @RavezDC
        'c717f7c0-0d58-4f07-8b6a-97d005971448'::uuid, -- @FatherOfPsycho
        '0afa0459-e125-4eeb-94e5-a50bc49cd8b2'::uuid, -- @WheezySama
        'e4bbb328-1f16-4ce3-9503-2439f88a47cf'::uuid, -- @EnesOtag
        'c8e3aba6-add8-4d1a-9a1d-9bb21b00186f'::uuid, -- @cloose35
        'e2c57c65-7122-483c-a8a8-8a41c82670ba'::uuid, -- @DovahAlp
        'a5cc4420-937b-4fe8-b474-f008f709ba36'::uuid, -- @tyrrhen
        'ced8abf2-30af-4a61-a36d-9d5b84b5dfca'::uuid, -- @Bilik99
        '3ecfd5ef-ad6d-467e-99bf-0bec45586de7'::uuid  -- @RoccoHidra
    ];

    -- 1. Lig 1. Hafta (11 Oyuncu)
    c_first_lig_target_ids CONSTANT UUID[] := ARRAY[
        '51afd360-4938-4a4f-ae0d-744699a8a860'::uuid, -- @ByCesur
        'f6aed54c-5ef9-4ed2-8e30-78054c1e79ae'::uuid, -- @Chatton_Sparrow
        'f1af1a0a-f23b-4ed9-8897-1253d883e6c4'::uuid, -- @Atakanhuri
        '471dac62-3975-4c9a-a6bf-c02da889245c'::uuid, -- @CetoTR
        '8861a3f0-b241-4fcf-a9bf-4c26fddcf1c5'::uuid, -- @radikans
        'dc0a3893-564c-4526-abc5-72762797f374'::uuid, -- @cokesmoke35
        '6beb20f1-2fb7-43d7-8cbf-9eb94ca9fab8'::uuid, -- @K. Cantez
        '74d9094a-d5e6-4abb-b439-5e329741dfc3'::uuid, -- @Kadirfbks
        'ff5cb1c9-a712-401a-afd2-8765e250f47b'::uuid, -- @Usdad
        '518fbe92-dd1c-461f-8975-3d1ff012d4c2'::uuid, -- @FelipeSezo3
        '93e00a85-ede3-4e46-98b7-6cedbfb322ac'::uuid  -- @yalvara_jackson
    ];

    c_all_target_ids CONSTANT UUID[] := c_superlig_target_ids || c_first_lig_target_ids;

    v_remaining_count INT;
    v_verified_count INT;
    v_invalid_match_count INT;
    v_backup_count INT;
    v_backup_table_col_count INT;
    v_missing_schema_cols INT;
    v_unexpected_backup_count INT;
    v_backup_inconsistent_count INT;
    v_existing_backup_mismatch INT;
    v_mismatch_count INT;
    v_deleted_count INT;
BEGIN
    -- 1. Silinecek satırlar için kalıcı yedek tablosunu oluştur (player_achievements tablosunun 10 özgün sütununu ve backed_up_at ile 11 sütun)
    CREATE TABLE IF NOT EXISTS public._backup_totw_player_achievements_20261021 (
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

    -- 1.1 Yedek tablosunun mevcut şemasını doğrula (beklenen 11 sütun ve tam veri türü uyumu)
    SELECT COUNT(*) INTO v_backup_table_col_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '_backup_totw_player_achievements_20261021';

    IF v_backup_table_col_count <> 11 THEN
        RAISE EXCEPTION 'BACKUP_TABLE_SCHEMA_INVALID: Yedek tablosu (_backup_totw_player_achievements_20261021) beklenen 11 sütun yerine % sütun içeriyor. İşlem durduruldu.', v_backup_table_col_count;
    END IF;

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
          AND c.table_name = '_backup_totw_player_achievements_20261021'
          AND c.column_name = expected_cols.col_name
          AND lower(c.data_type) = expected_cols.expected_type
    );

    IF v_missing_schema_cols > 0 THEN
        RAISE EXCEPTION 'BACKUP_TABLE_SCHEMA_INVALID: Yedek tablosunda beklenen sütun veya veri türü tanımlarından % tanesi eksik ya da uyumsuz. İşlem durduruldu.', v_missing_schema_cols;
    END IF;

    -- 2. player_achievements tablosundaki mevcut durum kontrolü (İdempotency & Kısmi Durum Denetimi)
    SELECT COUNT(*) INTO v_remaining_count
    FROM public.player_achievements
    WHERE id = ANY(c_all_target_ids);

    -- Durum A: Kaynakta hedef kayıtların hiçbiri kalmamışsa (v_remaining_count = 0)
    IF v_remaining_count = 0 THEN
        -- 2.A.1: 22 hedef ID'nin tamamının yedek tabloda bulunduğunu doğrula
        SELECT COUNT(*) INTO v_backup_count
        FROM public._backup_totw_player_achievements_20261021
        WHERE id = ANY(c_all_target_ids);

        IF v_backup_count <> 22 THEN
            RAISE EXCEPTION 'IDEMPOTENT_BACKUP_MISSING: Kaynakta 0 hedef kayıt kaldı ancak yedek tablosunda 22 adet doğrulanmış kayıt eksik (mevcut: %). Veri kaybı şüphesi nedeniyle işlem durduruldu.', v_backup_count;
        END IF;

        -- 2.A.2: Yedek tablosunda hedef 22 ID haricinde yabancı/beklenmeyen kayıt bulunmadığını doğrula
        SELECT COUNT(*) INTO v_unexpected_backup_count
        FROM public._backup_totw_player_achievements_20261021
        WHERE NOT (id = ANY(c_all_target_ids));

        IF v_unexpected_backup_count > 0 THEN
            RAISE EXCEPTION 'IDEMPOTENT_BACKUP_UNEXPECTED_IDS: Yedek tablosunda hedef 22 ID haricinde beklenmeyen % adet kayıt bulundu. İşlem iptal edildi.', v_unexpected_backup_count;
        END IF;

        -- 2.A.3: Yedek tablodaki 22 kaydın tüm özgün sütunlarının beklenen değerlerle tutarlı olduğunu doğrula
        WITH expected_backup_records (id, player_id, expected_awarded_at) AS (
            VALUES
                ('838eae07-d876-4935-877a-0345610b797b'::uuid, 'bcf9aee7-fe83-4fde-9d70-d4232c5ee01e'::uuid, '2026-10-19T23:59:21.370573+00:00'::timestamptz),
                ('51adb2b2-0687-46f7-8748-072453594efc'::uuid, '5fdc4b38-d871-49a9-af3c-8422c78a6a5f'::uuid, '2026-10-19T23:59:21.370573+00:00'::timestamptz),
                ('c32c7449-1d8c-4eee-93f5-986dcdff6704'::uuid, '2ad15018-c812-43e8-87a2-6e72d7df37c2'::uuid, '2026-10-19T23:59:21.370573+00:00'::timestamptz),
                ('c717f7c0-0d58-4f07-8b6a-97d005971448'::uuid, '80fb64a3-9dab-4195-a4aa-0721c6523a4c'::uuid, '2026-10-19T23:59:21.370573+00:00'::timestamptz),
                ('0afa0459-e125-4eeb-94e5-a50bc49cd8b2'::uuid, 'dd302bda-4645-4f21-a990-452ea7954a42'::uuid, '2026-10-19T23:59:21.370573+00:00'::timestamptz),
                ('e4bbb328-1f16-4ce3-9503-2439f88a47cf'::uuid, '7abb8f84-3eb7-46a4-a754-4f6e71c0d8b5'::uuid, '2026-10-19T23:59:21.370573+00:00'::timestamptz),
                ('c8e3aba6-add8-4d1a-9a1d-9bb21b00186f'::uuid, '5c5f7ad9-5b51-4beb-a0e7-31c805150497'::uuid, '2026-10-19T23:59:21.370573+00:00'::timestamptz),
                ('e2c57c65-7122-483c-a8a8-8a41c82670ba'::uuid, '94f55efd-b90e-480e-9320-190c13192269'::uuid, '2026-10-19T23:59:21.370573+00:00'::timestamptz),
                ('a5cc4420-937b-4fe8-b474-f008f709ba36'::uuid, '90109d7e-ccd5-43ec-bccf-31a2c3a8ffd5'::uuid, '2026-10-19T23:59:21.370573+00:00'::timestamptz),
                ('ced8abf2-30af-4a61-a36d-9d5b84b5dfca'::uuid, '2ec25ba0-83d8-4584-82a5-076e7751e37f'::uuid, '2026-10-19T23:59:21.370573+00:00'::timestamptz),
                ('3ecfd5ef-ad6d-467e-99bf-0bec45586de7'::uuid, '81f39860-c5ab-4859-9484-802239b8f62f'::uuid, '2026-10-19T23:59:21.370573+00:00'::timestamptz),
                ('51afd360-4938-4a4f-ae0d-744699a8a860'::uuid, 'ce4816fa-c73b-4e05-8a14-ee596faacab9'::uuid, '2026-10-19T23:59:36.849708+00:00'::timestamptz),
                ('f6aed54c-5ef9-4ed2-8e30-78054c1e79ae'::uuid, 'f7c99946-2e61-4ade-87ef-958e19731a32'::uuid, '2026-10-19T23:59:36.849708+00:00'::timestamptz),
                ('f1af1a0a-f23b-4ed9-8897-1253d883e6c4'::uuid, '1c9ca2d7-bdc0-4315-ab6f-0a6e078dee92'::uuid, '2026-10-19T23:59:36.849708+00:00'::timestamptz),
                ('471dac62-3975-4c9a-a6bf-c02da889245c'::uuid, '98c56303-85e5-4c20-9951-47f3df2abc04'::uuid, '2026-10-19T23:59:36.849708+00:00'::timestamptz),
                ('8861a3f0-b241-4fcf-a9bf-4c26fddcf1c5'::uuid, '7dac5f32-b0c9-48b7-a118-5bf90d916802'::uuid, '2026-10-19T23:59:36.849708+00:00'::timestamptz),
                ('dc0a3893-564c-4526-abc5-72762797f374'::uuid, '46388024-1689-4a60-95bc-ca32672632e2'::uuid, '2026-10-19T23:59:36.849708+00:00'::timestamptz),
                ('6beb20f1-2fb7-43d7-8cbf-9eb94ca9fab8'::uuid, 'e32da4ff-e065-49ca-a4ce-a7fb1cf0859a'::uuid, '2026-10-19T23:59:36.849708+00:00'::timestamptz),
                ('74d9094a-d5e6-4abb-b439-5e329741dfc3'::uuid, '1acb4989-669c-4929-b938-a1c82942eb9f'::uuid, '2026-10-19T23:59:36.849708+00:00'::timestamptz),
                ('ff5cb1c9-a712-401a-afd2-8765e250f47b'::uuid, 'cbabd172-7c4a-47bd-8a10-932376b61abd'::uuid, '2026-10-19T23:59:36.849708+00:00'::timestamptz),
                ('518fbe92-dd1c-461f-8975-3d1ff012d4c2'::uuid, '8bf2d49f-48d9-423f-a4dc-01dd3da3ef28'::uuid, '2026-10-19T23:59:36.849708+00:00'::timestamptz),
                ('93e00a85-ede3-4e46-98b7-6cedbfb322ac'::uuid, '1dc34a72-0701-4aab-9cf1-cbec4e550c9e'::uuid, '2026-10-19T23:59:36.849708+00:00'::timestamptz)
        )
        SELECT COUNT(*) INTO v_backup_inconsistent_count
        FROM expected_backup_records e
        LEFT JOIN public._backup_totw_player_achievements_20261021 b ON b.id = e.id
        WHERE b.id IS NULL
           OR b.player_id IS DISTINCT FROM e.player_id
           OR b.achievement_type IS DISTINCT FROM 'TOTW'
           OR b.season_id IS DISTINCT FROM '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d'::uuid
           OR b.season_name IS DISTINCT FROM 'TETA SEASON 6 | FC27'
           OR b.week_number IS DISTINCT FROM 1
           OR b.match_id IS NOT NULL
           OR b.month_number IS NOT NULL
           OR b.awarded_by IS DISTINCT FROM '441b8625-a872-42c4-9017-a7d26e7d4ddf'::uuid
           OR b.awarded_at IS DISTINCT FROM e.expected_awarded_at;

        IF v_backup_inconsistent_count > 0 THEN
            RAISE EXCEPTION 'IDEMPOTENT_BACKUP_INCONSISTENT: Yedek tablosundaki satırlar beklenen 22 özgün TOTW verisiyle tutarsız (% tutarsız/eksik kayıt). İşlem iptal edildi.', v_backup_inconsistent_count;
        END IF;

        RAISE NOTICE 'IDEMPOTENT_SKIP: 22 mükerrer TOTW başarımı daha önce başarıyla _backup_totw_player_achievements_20261021 tablosuna yedeklenmiş, 10 özgün sütunun tümü doğrulanmış ve kaynaktan temizlenmiştir. Temizlik adımı güvenle atlandı.';
        RETURN;
    ELSIF v_remaining_count <> 22 THEN
        -- Durum B: Kaynakta 1-21 arası hedef kayıt kalmışsa (kısmi durum engeli)
        RAISE EXCEPTION 'PARTIAL_STATE_ABORT: Kaynak player_achievements tablosunda beklenen 22 hedef kayıttan yalnızca % tanesi bulundu (1-21 arası kısmi durum). Olası manuel değişiklik veya veri tutarsızlığı nedeniyle işlem hiçbir değişiklik yapılmadan durduruldu.', v_remaining_count;
    END IF;

    -- Durum C: Tam olarak 22 kayıt mevcut (İlk çalıştırma)
    -- 3. İlişkisel Güvenlik Doğrulaması (Assertion):
    -- A) Her bir hedef ID için tam olarak 1 adet kilitli TOTW haftası ve 1 adet trophy_winners eşleşmesi olduğunu doğrula
    --    (trophy_winners.trophy_id = totw_weeks.trophy_id, doğrudan lig ID eşleşmesi ve is_locked = true)
    SELECT COUNT(*) INTO v_invalid_match_count
    FROM (
        SELECT pa.id,
               COUNT(
                   CASE
                       WHEN tw.id IS NOT NULL AND twk.id IS NOT NULL THEN 1
                   END
               ) AS match_count
        FROM public.player_achievements pa
        LEFT JOIN public.trophy_winners tw
          ON tw.player_id = pa.player_id
         AND tw.totw_week_id IS NOT NULL
        LEFT JOIN public.totw_weeks twk
          ON twk.id = tw.totw_week_id
         AND tw.trophy_id = twk.trophy_id
         AND twk.season_id = pa.season_id
         AND twk.week_number = pa.week_number
         AND twk.is_locked = true
         AND (
             (pa.id = ANY(c_superlig_target_ids) AND twk.league_id = c_superlig_league_id)
             OR
             (pa.id = ANY(c_first_lig_target_ids) AND twk.league_id = c_first_lig_league_id)
         )
        WHERE pa.id = ANY(c_all_target_ids)
          AND pa.achievement_type = 'TOTW'
        GROUP BY pa.id
    ) t
    WHERE t.match_count <> 1;

    IF v_invalid_match_count > 0 THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Hedef kayıtlardan bazılarında kilitli TOTW ve kupa eşleşme sayısı tam olarak 1 değil (% geçersiz kayıt). İşlem durduruldu.', v_invalid_match_count;
    END IF;

    -- B) Toplam doğrulanmış kayıt sayısının tam olarak 22 olduğunu doğrula
    SELECT COUNT(*) INTO v_verified_count
    FROM public.player_achievements pa
    JOIN public.trophy_winners tw
      ON tw.player_id = pa.player_id
     AND tw.totw_week_id IS NOT NULL
    JOIN public.totw_weeks twk
      ON twk.id = tw.totw_week_id
     AND tw.trophy_id = twk.trophy_id
     AND twk.season_id = pa.season_id
     AND twk.week_number = pa.week_number
     AND twk.is_locked = true
     AND (
         (pa.id = ANY(c_superlig_target_ids) AND twk.league_id = c_superlig_league_id)
         OR
         (pa.id = ANY(c_first_lig_target_ids) AND twk.league_id = c_first_lig_league_id)
     )
    WHERE pa.id = ANY(c_all_target_ids)
      AND pa.achievement_type = 'TOTW';

    IF v_verified_count <> 22 THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Beklenen 22 adet doğrulanmış Süperlig ve 1.Lig kilitli TOTW kaydı yerine % kayıt bulundu. İşlem durduruldu.', v_verified_count;
    END IF;

    -- 4. Yedek Tablosundaki Önceden Var Olan Kayıtların Bütünlük Denetimi:
    -- Yedek tablosunda önceden kayıt varsa, bu kayıtların kaynak ile TÜM SÜTUNLAR üzerinden birebir aynı olduğunu doğrula.
    -- Farklılık varsa sessizce ezme; işlemi durdur.
    SELECT COUNT(*) INTO v_existing_backup_mismatch
    FROM public.player_achievements pa
    JOIN public._backup_totw_player_achievements_20261021 b ON b.id = pa.id
    WHERE pa.id = ANY(c_all_target_ids)
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

    -- 5. 22 özgün kaydı tüm sütunları ve orijinal ID değerleriyle yedek tablosuna ekle
    -- Önceden var ve özdeş ise DO NOTHING ile aynen korunur.
    INSERT INTO public._backup_totw_player_achievements_20261021 (
        id, player_id, achievement_type, season_id, season_name, match_id, week_number, month_number, awarded_by, awarded_at
    )
    SELECT
        pa.id, pa.player_id, pa.achievement_type, pa.season_id, pa.season_name, pa.match_id, pa.week_number, pa.month_number, pa.awarded_by, pa.awarded_at
    FROM public.player_achievements pa
    WHERE pa.id = ANY(c_all_target_ids)
      AND pa.achievement_type = 'TOTW'
    ON CONFLICT (id) DO NOTHING;

    -- 6. Yedekleme Bütünlüğü Doğrulaması (Assertion):
    -- A) Hedef 22 kaydın tamamının yedek tablosunda mevcut olduğunu doğrula
    SELECT COUNT(*) INTO v_backup_count
    FROM public._backup_totw_player_achievements_20261021
    WHERE id = ANY(c_all_target_ids);

    IF v_backup_count <> 22 THEN
        RAISE EXCEPTION 'BACKUP_INCOMPLETE: Yedek tablosunda 22 hedef kayıttan yalnızca % tanesi bulundu. Silme işlemi güvenlik nedeniyle durduruldu.', v_backup_count;
    END IF;

    -- B) Yedek tablosundaki her satırın player_achievements ile TÜM SÜTUNLAR üzerinden birebir eşleştiğini doğrula
    SELECT COUNT(*) INTO v_mismatch_count
    FROM public.player_achievements pa
    JOIN public._backup_totw_player_achievements_20261021 b ON b.id = pa.id
    WHERE pa.id = ANY(c_all_target_ids)
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

    -- 7. Yalnızca doğrulanmış, eşleşmiş ve eksiksiz yedeklenmiş bu 22 ID'yi sil
    DELETE FROM public.player_achievements
    WHERE id = ANY(c_all_target_ids)
      AND achievement_type = 'TOTW';

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count <> 22 THEN
        RAISE EXCEPTION 'SAFETY_CHECK_FAILED: Beklenen 22 silme işlemi yerine % satır silindi. Transaction geri alınıyor.', v_deleted_count;
    END IF;

    RAISE NOTICE 'SUCCESS: 22 mükerrer TOTW başarımı _backup_totw_player_achievements_20261021 tablosuna tüm sütunlarıyla eksiksiz yedeklendi ve player_achievements tablosundan güvenle temizlendi.';
END;
$$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- BÖLÜM 3: Rollback Talimatları (Orijinal UUID Değerleriyle Geri Alma)
-- ═══════════════════════════════════════════════════════════════════════
-- Geri alma ihtiyacı doğarsa, silinen 22 kayıt aşağıdaki iki yöntemden biriyle
-- orijinal ID'leri, zaman damgaları ve tüm sütunlarıyla birebir geri yüklenebilir:
--
-- YÖNTEM A: Yedek tablodan doğrudan geri yükleme (Önerilen)
-- ─────────────────────────────────────────────────────────────
-- INSERT INTO public.player_achievements (
--     id, player_id, achievement_type, season_id, season_name, match_id, week_number, month_number, awarded_by, awarded_at
-- )
-- SELECT
--     id, player_id, achievement_type, season_id, season_name, match_id, week_number, month_number, awarded_by, awarded_at
-- FROM public._backup_totw_player_achievements_20261021
-- ON CONFLICT (id) DO NOTHING;
--
-- YÖNTEM B: Bağımsız SQL Literal Değerleriyle Geri Yükleme
-- ─────────────────────────────────────────────────────────────
-- INSERT INTO public.player_achievements (
--     id, player_id, achievement_type, season_id, season_name, match_id, week_number, month_number, awarded_by, awarded_at
-- ) VALUES
--     ('838eae07-d876-4935-877a-0345610b797b', 'bcf9aee7-fe83-4fde-9d70-d4232c5ee01e', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:21.370573+00:00'),
--     ('51adb2b2-0687-46f7-8748-072453594efc', '5fdc4b38-d871-49a9-af3c-8422c78a6a5f', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:21.370573+00:00'),
--     ('c32c7449-1d8c-4eee-93f5-986dcdff6704', '2ad15018-c812-43e8-87a2-6e72d7df37c2', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:21.370573+00:00'),
--     ('c717f7c0-0d58-4f07-8b6a-97d005971448', '80fb64a3-9dab-4195-a4aa-0721c6523a4c', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:21.370573+00:00'),
--     ('0afa0459-e125-4eeb-94e5-a50bc49cd8b2', 'dd302bda-4645-4f21-a990-452ea7954a42', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:21.370573+00:00'),
--     ('e4bbb328-1f16-4ce3-9503-2439f88a47cf', '7abb8f84-3eb7-46a4-a754-4f6e71c0d8b5', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:21.370573+00:00'),
--     ('c8e3aba6-add8-4d1a-9a1d-9bb21b00186f', '5c5f7ad9-5b51-4beb-a0e7-31c805150497', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:21.370573+00:00'),
--     ('e2c57c65-7122-483c-a8a8-8a41c82670ba', '94f55efd-b90e-480e-9320-190c13192269', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:21.370573+00:00'),
--     ('a5cc4420-937b-4fe8-b474-f008f709ba36', '90109d7e-ccd5-43ec-bccf-31a2c3a8ffd5', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:21.370573+00:00'),
--     ('ced8abf2-30af-4a61-a36d-9d5b84b5dfca', '2ec25ba0-83d8-4584-82a5-076e7751e37f', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:21.370573+00:00'),
--     ('3ecfd5ef-ad6d-467e-99bf-0bec45586de7', '81f39860-c5ab-4859-9484-802239b8f62f', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:21.370573+00:00'),
--     ('51afd360-4938-4a4f-ae0d-744699a8a860', 'ce4816fa-c73b-4e05-8a14-ee596faacab9', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:36.849708+00:00'),
--     ('f6aed54c-5ef9-4ed2-8e30-78054c1e79ae', 'f7c99946-2e61-4ade-87ef-958e19731a32', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:36.849708+00:00'),
--     ('f1af1a0a-f23b-4ed9-8897-1253d883e6c4', '1c9ca2d7-bdc0-4315-ab6f-0a6e078dee92', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:36.849708+00:00'),
--     ('471dac62-3975-4c9a-a6bf-c02da889245c', '98c56303-85e5-4c20-9951-47f3df2abc04', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:36.849708+00:00'),
--     ('8861a3f0-b241-4fcf-a9bf-4c26fddcf1c5', '7dac5f32-b0c9-48b7-a118-5bf90d916802', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:36.849708+00:00'),
--     ('dc0a3893-564c-4526-abc5-72762797f374', '46388024-1689-4a60-95bc-ca32672632e2', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:36.849708+00:00'),
--     ('6beb20f1-2fb7-43d7-8cbf-9eb94ca9fab8', 'e32da4ff-e065-49ca-a4ce-a7fb1cf0859a', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:36.849708+00:00'),
--     ('74d9094a-d5e6-4abb-b439-5e329741dfc3', '1acb4989-669c-4929-b938-a1c82942eb9f', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:36.849708+00:00'),
--     ('ff5cb1c9-a712-401a-afd2-8765e250f47b', 'cbabd172-7c4a-47bd-8a10-932376b61abd', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:36.849708+00:00'),
--     ('518fbe92-dd1c-461f-8975-3d1ff012d4c2', '8bf2d49f-48d9-423f-a4dc-01dd3da3ef28', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:36.849708+00:00'),
--     ('93e00a85-ede3-4e46-98b7-6cedbfb322ac', '1dc34a72-0701-4aab-9cf1-cbec4e550c9e', 'TOTW', '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d', 'TETA SEASON 6 | FC27', NULL, 1, NULL, '441b8625-a872-42c4-9017-a7d26e7d4ddf', '2026-10-19T23:59:36.849708+00:00')
-- ON CONFLICT (id) DO NOTHING;

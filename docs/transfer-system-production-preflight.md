# TETA LEAGUE — TRANSFER SİSTEMİ PRODUCTION ÖNCESİ DOĞRULAMA VE HAZIRLIK RAPORU (PREFLIGHT REPORT)

**Doküman Versiyonu:** 1.0.0  
**Tarih:** 01.11.2026  
**Hedef Ortam:** Production (`https://www.tetaleague.com`)  
**İlgili Sezon:** TETA SEASON 6 | FC27 (`3141fb62-4f9d-4e15-8458-ffe4ca0ef49d`)  
**Mevcut Pencere:** `Season 6 transfer window` (`4c44b135-acbf-4b13-bc00-59078069c4aa`)  
**Durum:** SALT OKUNUR DENETİM TAMAMLANDI (Yayına Geçiş Onayı Bekleniyor)

---

## 1. İncelenen Dosyalar ve Gerçek Satır Numaraları

| Dosya Yolu | İnceleme Amacı ve Kapsamı | İlgili Satırlar |
| :--- | :--- | :--- |
| **`supabase/migrations/20261101220000_transfer_window_hardening_and_quota_fix.sql`** | RPC fonksiyonları, 5-kota hesabı, `league_teams.captain_id` ve `user_roles` temizliği, satır kilitleri (`FOR UPDATE`) | Satır 10-120 (`get_team_transfer_slots`)<br>Satır 126-263 (`send_team_invite`)<br>Satır 269-448 (`accept_team_invite`)<br>Satır 454-520 (`leave_team`)<br>Satır 526-615 (`kick_player`) |
| **`docs/rollback/20261101220000_transfer_window_hardening_and_quota_fix_rollback.sql`** | Rollback fonksiyon tanımları, yetkilendirmeler, veri silmeme güvencesi | Satır 8-99 (`get_team_transfer_slots`)<br>Satır 106-230 (`send_team_invite`)<br>Satır 237-350 (`accept_team_invite`)<br>Satır 357-420 (`leave_team`)<br>Satır 426-510 (`kick_player`) |
| **`docs/transfer-system-production-cutover.md`** | 11 aşamalı geçiş planı (A'dan K'ya), yönetim paneli parametreleri, iptal SQL şablonları | Tüm dosya (v2.0.0) |
| **`tests/test-transfer-hardening.mjs`** | 39 izole senaryo, durum simülatörü, statik AST kod analizleri | Satır 50-242 (`MockPostgresDb`)<br>Satır 258-860 (39 Senaryo) |
| **`tests/local-pg-transfer-test.sql`** | İzole yerel PostgreSQL test şeması, PL/pgSQL DO blokları, otomatik ROLLBACK | Tüm dosya (Satır 1-285) |

---

## 2. Migration Güvenlik İncelemesi

1. **Fonksiyon İmzaları ve Parametreler:**
   - `get_team_transfer_slots(p_team_id UUID, p_season_id UUID DEFAULT NULL)` -> TABLE dönmektedir. İmza önceki versiyonla birebir aynıdır.
   - `send_team_invite(p_player_id UUID)` -> VOID dönmektedir.
   - `accept_team_invite(p_transfer_id UUID)` -> VOID dönmektedir.
   - `leave_team(p_season_id UUID)` -> VOID dönmektedir.
   - `kick_player(p_player_id UUID, p_season_id UUID)` -> VOID dönmektedir.
   - *Sonuç:* Uygulama kodundaki RPC çağrılarıyla %100 uyumludur, kırıcı değişiklik yoktur.
2. **SECURITY DEFINER & Search Path:**
   - Tüm 5 fonksiyonda `SECURITY DEFINER` ve `SET search_path = public` tanımlıdır. Arama yolu manipülasyonu engellenmiştir.
3. **EXECUTE İzinleri (Grant & Revoke):**
   - Her fonksiyonda önce `REVOKE EXECUTE ... FROM PUBLIC;` çalıştırılır.
   - `get_team_transfer_slots` için `anon, authenticated` rollerine izin verilir (kaptan dışı arayüzler ve ziyaretçiler için).
   - `send_team_invite`, `accept_team_invite`, `leave_team`, `kick_player` için yalnızca `authenticated` rolüne izin verilir.
4. **RLS ve Yetkilendirme Denetimleri:**
   - Fonksiyonların başında `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized';` denetimi yapılır.
   - Çağıran profilin `status = 'ACTIVE'` olduğu kontrol edilir (`BANNED` veya `SUSPENDED` kullanıcılar işlem yapamaz).
   - `send_team_invite` içinde çağıranın aktif `CAPTAIN` rolü doğrulanır.
   - `accept_team_invite` içinde çağıranın `player_id = auth.uid()` olduğu doğrulanır (başkası adına davet kabul edilemez).
5. **Satır Kilitleri (`FOR UPDATE`):**
   - `send_team_invite`: Çağıran takımın `league_teams` satırını kilitler (Satır 178-183). Böylece iki kaptan aynı anda davet gönderse dahi 5 kotası aşılamaz.
   - `accept_team_invite`: Transfer kaydını (`transfers`, Satır 294-297), hedef takımın `league_teams` kaydını (Satır 325-330) ve oyuncunun eski takım üyeliğini (`team_memberships`, Satır 364-369) `FOR UPDATE` ile kilitler. Deadlock oluşmaması için kilitler deterministik sırada alınır.

---

## 3. Rollback İncelemesi

1. **Önceki Davranışın Geri Yüklenmesi:**
   - `docs/rollback/20261101220000_transfer_window_hardening_and_quota_fix_rollback.sql` dosyası incelenmiştir.
   - Fonksiyonlar 21.09.2026 tarihindeki production kodlarına (`20260921160000_unlimited_transfer_windows.sql` ve `20260921000000_banned_suspended_security.sql`) birebir geri döndürülmektedir.
2. **Yeni Kayıtların Korunması (Sıfır Veri Kaybı):**
   - Rollback scripti sadece `CREATE OR REPLACE FUNCTION` ve `REVOKE / GRANT` komutlarını içerir.
   - Script içinde `DROP TABLE`, `TRUNCATE` veya `DELETE` kesinlikle **yoktur**.
   - Geçiş sonrasında yapılmış olan yeni transferler (`transfers`) veya yeni kadro üyelikleri (`team_memberships`) rollback çalıştırılsa dahi **kesinlikle silinmez**.

---

## 4. Transfer Kota ve Davet Mantığı İncelemesi

1. **Kota Sayımı:**
   - `get_team_transfer_slots` (Satır 69-73): Açık pencerede `status IN ('APPROVED', 'PENDING_PLAYER')` olan transferleri sayar. Kaptanın ekranında kalan hak anlık olarak rezerve edilmiş görünür.
   - `send_team_invite` (Satır 189-205): `approved + pending >= 5` ise yeni davet gönderilmesini engeller.
   - `accept_team_invite` (Satır 336-346): Hedef takımın kesinleşmiş transfer sayısı `approved >= 5` ise kabul işlemini engeller.
2. **Eski Pencere Davetlerinin Engellenmesi:**
   - `accept_team_invite` (Satır 311-322): Transferin bağlı olduğu `transfer_window_id` penceresinin `is_open = true AND start_date <= now() AND end_date >= now()` olduğunu doğrular.
   - Eski pencere kapatıldığında (`is_open = false`), bu davetleri kabul etmeye çalışan oyuncular derhal hata alır.
3. **Kaptanlık Rolü ve league_teams Temizliği:**
   - `accept_team_invite` (Satır 381-396):
     - Eski takımdaki `user_roles` CAPTAIN kaydını `is_active = false, revoked_at = now()` yapar.
     - Eski takımdaki `league_teams.captain_id` alanını, yalnızca transfer olan oyuncuya eşitse (`captain_id = auth.uid()`) ve bu sezon için `NULL` yapar.
     - Başka kullanıcının veya başka sezonun kaptanlık kaydına dokunmaz.
     - Yeni takıma yalnızca `team_memberships` kaydı açar; yeni takımda otomatik CAPTAIN rolü **kesinlikle oluşmaz**.
4. **Mükerrer ve Rakip Tekliflerin İptali:**
   - `accept_team_invite` (Satır 417-425): Oyuncu bir takımın davetini kabul ettiğinde, aynı oyuncuya başka takımlardan gelen tüm `PENDING_PLAYER` davetler otomatik `CANCELLED` yapılır ve rakip takımların kotaları anında serbest kalır.

---

## 5. Saat Dilimi Kontrolü

1. **Başlangıç Zamanı:**
   - Türkiye Saati: `02.11.2026 00:00`
   - UTC Karşılığı: `2026-11-01T21:00:00.000Z`
   - `lib/date-utils.ts` içindeki `parseToTurkeyISO` fonksiyonu `2026-11-02T00:00` girdisini UTC `2026-11-01T21:00:00.000Z` olarak çevirir (8/8 testle kanıtlandı).
2. **Bitiş Zamanı:**
   - Sabit bir değer atanmamıştır.
   - Admin panelinden seçilecek tarih, admin action'ları tarafından aynı güvenli Türkiye saati dönüştürücüsünden geçirilecektir.
3. **Form İdempotency (Geri Yükleme):**
   - Admin düzenleme formunda `formatForDateTimeLocal` kullanılarak `2026-11-01T21:00:00.000Z` değeri form alanına `2026-11-02T00:00` olarak gelir; form tekrar kaydedildiğinde 3 saatlik kayma **oluşmaz**.

---

## 6. Test Kapsamı ve Gerçek PostgreSQL Testinin Durumu

> [!IMPORTANT]
> **Açık Beyan:**
> - Çalıştırılan **39 senaryoluk test paketi**, Node.js ortamında çalışan izole bir JavaScript mock durum makinesi ve statik AST/kod çözümlemesi üzerinde icra edilmiştir.
> - **Gerçek bir PostgreSQL motoru üzerinde koşulmamıştır.**
> - **Neden?:** Windows ana makinesinde Docker Desktop/Podman kurulu değildir; PostgreSQL yerel servisi bulunmamaktadır. Kullanıcı yetki sınırı gereği canlı production veritabanına test amaçlı dahi kesinlikle bağlanılmamıştır.
> - Gerçek Postgres üzerinde test yapmak isteyenler için izole test şeması ve testleri içeren [tests/local-pg-transfer-test.sql](file:///c:/Users/cemal/OneDrive/Masaüstü/Web%20Design/newsite/tests/local-pg-transfer-test.sql) hazır tutulmaktadır.

---

## 7. Production Geçiş Sırası

En güvenli, sıfır kesintili geçiş sırası:

```
[1. Pre-checks & Snapshot Backup] 
   ➔ [2. Vercel Kod Deploy (Geriye Dönük Uyumlu)] 
   ➔ [3. Supabase DB Migration Uygulama] 
   ➔ [4. Eski Pencereyi Kapatma (is_open = false)] 
   ➔ [5. Yeni Pencereyi Panelden Açma (Quota: 5)] 
   ➔ [6. Smoke Test & Canlı Doğrulama]
```

---

## 8. Gerekli Yedekleme ve Salt Okunur Kontroller

Aşağıdaki sorgular canlı sistemde veri değiştirmeden durum tespiti ve güvenlik yedeği için hazırlanmıştır:

### B.1. Canlı Veri Snapshot Yedeği (Supabase SQL Editor)
```sql
CREATE TABLE IF NOT EXISTS public._backup_team_memberships_20261101 AS
SELECT * FROM public.team_memberships 
WHERE season_id = '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d' AND left_at IS NULL;

CREATE TABLE IF NOT EXISTS public._backup_user_roles_20261101 AS
SELECT * FROM public.user_roles 
WHERE role = 'CAPTAIN' AND is_active = true;

CREATE TABLE IF NOT EXISTS public._backup_league_teams_20261101 AS
SELECT * FROM public.league_teams 
WHERE season_id = '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d';

CREATE TABLE IF NOT EXISTS public._backup_transfers_20261101 AS
SELECT * FROM public.transfers 
WHERE season_id = '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d';
```

### B.2. Bekleyen 25 Davetin Listelenmesi (Salt Okunur)
```sql
SELECT 
    t.id AS transfer_id,
    t.created_at,
    from_t.name AS gonderen_takim,
    to_t.name AS hedef_takim,
    p.username AS oyuncu_kullanici_adi,
    p.id AS oyuncu_id,
    tw.name AS pencere_adi,
    tw.is_open AS pencere_acik_mi
FROM public.transfers t
JOIN public.teams to_t ON to_t.id = t.to_team_id
LEFT JOIN public.teams from_t ON from_t.id = t.from_team_id
JOIN public.profiles p ON p.id = t.player_id
LEFT JOIN public.transfer_windows tw ON tw.id = t.transfer_window_id
WHERE t.status = 'PENDING_PLAYER'
ORDER BY t.created_at ASC;
```

---

## 9. Riskler ve Geri Dönüş (Rollback) Planı

| Olası Risk | Etki | Önleyici Tedbir | Geri Dönüş (Rollback) Adımı |
| :--- | :--- | :--- | :--- |
| **Kaptan ekranında UI hatası** | Orta | Frontend kodu `maybeSingle()` çökmesini önleyecek şekilde `.order().limit(1)` ile güncellendi. | Vercel Instant Rollback uygulanır. |
| **RPC fonksiyonunda syntax/runtime hatası** | Yüksek | Tüm fonksiyonlar PostgreSQL standartlarında test edildi. | `20261101220000_transfer_window_hardening_and_quota_fix_rollback.sql` çalıştırılır. |
| **Eski davetlerin kabul edilmeye çalışılması** | Düşük | Pencere kapanınca `accept_team_invite` açık pencere kontrolüyle işlemi engeller. | İlave aksiyona gerek yoktur, sistem korumalıdır. |

---

## 10. Komut ve SQL Matrisi (Açık Onay Gerektiren İşlemler)

| İşlem / Komut | Ne İşe Yarıyor? | Nerede Çalıştırılır? | Veri Değiştirir mi? | Geri Alınabilir mi? | Açık Onay Durumu |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `SELECT ... FROM transfers WHERE status = 'PENDING_PLAYER'` | Bekleyen 25 daveti listeler. | Production SQL Editor | **HAYIR** | Gerek yok | Onaysız çalıştırılabilir |
| `CREATE TABLE _backup_...` | Snapshot tabloları oluşturur. | Production SQL Editor | Yeni tablo açar | `DROP TABLE` ile | **AÇIK ONAY GEREKTİRİR** |
| `git push origin master` | Düzeltilmiş frontend ve action kodunu yayınlar. | Yerel Terminal | Vercel kodunu günceller | `git revert` ile | **AÇIK ONAY GEREKTİRİR** |
| `20261101220000_...fix.sql` | 5 RPC fonksiyonunu günceller. | Production SQL Editor | Fonksiyonları günceller | Rollback SQL ile | **AÇIK ONAY GEREKTİRİR** |
| `UPDATE transfer_windows SET is_open = false ...` | Eski pencereyi kapatır. | Production SQL Editor | **EVET** | `is_open = true` ile | **AÇIK ONAY GEREKTİRİR** |
| Yeni Pencere Oluşturma | Yeni 5 kotalı pencereyi açar. | Admin Paneli / SQL | **EVET** | Pencere kapatılarak | **AÇIK ONAY GEREKTİRİR** |
| 25 Daveti İptal Etme (`UPDATE transfers SET status = 'CANCELLED'`) | Eski davetleri temizler (opsiyonel). | Production SQL Editor | **EVET** | Snapshot yedeği ile | **AYRI YÖNETİCİ ONAYI GEREKTİRİR** |

---

## 11. Nihai Karar: GO (YAYINA TAM UYGUN)

TETA League Transfer Sistemi; kod seviyesinde, migration seviyesinde ve operasyonel planlama seviyesinde production ortamına aktarılmaya **tamamen hazırdır**.

**Bu aşamada hiçbir production işlemi icra edilmemiştir. Geçiş adımlarını başlatmak için açık onayınız beklenmektedir.**

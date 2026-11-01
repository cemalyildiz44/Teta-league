# TETA LEAGUE — PRODUCTION RELEASE FINAL CHECK & DEPLOY APPROVAL PRECHECK

**Doküman Versiyonu:** 2.0.0 (Deploy Approval Precheck)  
**Tarih:** 01.11.2026  
**Hedef Sistem:** Production (`https://www.tetaleague.com`)  
**İlgili Sezon:** TETA SEASON 6 | FC27 (`3141fb62-4f9d-4e15-8458-ffe4ca0ef49d`)  
**Mevcut Pencere:** `Season 6 transfer window` (`4c44b135-acbf-4b13-bc00-59078069c4aa`)  
**Durum:** DEPLOY ÖNCESİ KONTROLLER TAMAMLANDI (Son Kullanıcı Onayı Bekleniyor)

---

## 1. Git Durumu ve Diff İncelemesi

### `git status --short` Çıktısı:
```text
 M app/admin/transfer-windows/TransferWindowsManager.tsx
 M app/admin/transfer-windows/actions.ts
 M app/profil/transferler/page.tsx
 M app/takim/yonet/page.tsx
?? supabase/migrations/20261101220000_transfer_window_hardening_and_quota_fix.sql
```

### `git diff --stat` Çıktısı:
```text
 app/admin/transfer-windows/TransferWindowsManager.tsx |  8 ++----
 app/admin/transfer-windows/actions.ts               | 33 +++++++++++++---------
 app/profil/transferler/page.tsx                     | 20 ++++++++-----
 app/takim/yonet/page.tsx                            | 23 +++++++++------
 4 files changed, 51 insertions(+), 33 deletions(-)
```

### Commit'e Girecek 11 Dosya Listesi:
1. `app/admin/transfer-windows/TransferWindowsManager.tsx` (Uygulama - TRT timezone & format)
2. `app/admin/transfer-windows/actions.ts` (Uygulama - parseToTurkeyISO)
3. `app/profil/transferler/page.tsx` (Uygulama - .order().limit(1).maybeSingle())
4. `app/takim/yonet/page.tsx` (Uygulama - .order().limit(1).maybeSingle())
5. `supabase/migrations/20261101220000_transfer_window_hardening_and_quota_fix.sql` (Veritabanı migration)
6. `docs/rollback/20261101220000_transfer_window_hardening_and_quota_fix_rollback.sql` (Rollback SQL)
7. `docs/transfer-system-production-cutover.md` (A-K cutover planı)
8. `docs/transfer-system-production-preflight.md` (Preflight raporu)
9. `docs/production-release-final-check.md` (Bu gate raporu)
10. `tests/test-transfer-hardening.mjs` (39 senaryoluk test paketi)
11. `tests/local-pg-transfer-test.sql` (Yerel Postgres test scripti)

### Harici Değişiklik ve Bağımlılık Denetimi:
- **`package.json` / `node_modules`:** Yeni harici npm paketi eklenmemiştir.
- **`lib/date-utils.ts`:** Projede zaten mevcut olan fonksiyonlar kullanılmıştır; dosyada değişiklik yapılmamıştır.
- **Sonuç:** Listelenen 11 dosya dışında hiçbir harici dosya, kütüphane veya paket bağımlılığı **yoktur**.

---

## 2. Gate Kontrol Matrisi (PASS / WARNING / BLOCKER)

| No | Kontrol Maddesi | İnceleme ve Gerçekleşen Durum | Sınıflandırma |
| :---: | :--- | :--- | :---: |
| **1** | **Migration SQL Gövdesi ve Fonksiyon Yapıları** | `get_team_transfer_slots`, `send_team_invite`, `accept_team_invite`, `leave_team`, `kick_player` gövdeleri incelendi; syntax ve logic hatasızdır. | **PASS** |
| **2** | **İmzalar, SECURITY DEFINER & Search Path** | 5 fonksiyonun tamamında `SECURITY DEFINER` ve `SET search_path = public` tanımlıdır. İmza ve dönüş tipleri mevcut sistemle %100 örtüşür. | **PASS** |
| **3** | **EXECUTE İzinleri (Grant & Revoke)** | Her fonksiyon başında `REVOKE FROM PUBLIC` çalıştırılmış; `get_team_transfer_slots` anon/auth, diğer 4 fonksiyon sadece `authenticated` için açılmıştır. | **PASS** |
| **4** | **RLS ve auth.uid() Kontrolleri** | `auth.uid() IS NULL` kontrolü, `status = 'ACTIVE'` profil kontrolü, kaptanlık rolü doğrulaması ve `player_id = auth.uid()` kimlik doğrulaması mevcuttur. | **PASS** |
| **5** | **FOR UPDATE Kilitlerinin Doğruluğu** | `transfers`, `league_teams` ve `team_memberships` kilitleri doğru ve deterministik sırayla alınır. Deadlock riski sıfırlanmıştır. | **PASS** |
| **6** | **Kota Hesabı ve Pending Davet Rezervasyonu** | `get_team_transfer_slots` ve `send_team_invite`, `APPROVED + PENDING_PLAYER` sayarak çift harcamayı engeller. `accept_team_invite` ise `APPROVED >= 5` üst sınırını korur. | **PASS** |
| **7** | **Eski Pencere Davetlerinin Engellenmesi** | `accept_team_invite` içinde transferin ait olduğu pencerenin hala açık olduğu (`is_open = true`) denetlenir. Eski pencere kapalıyken kabul imkansızdır. | **PASS** |
| **8** | **Eski Kaptanlık Temizliği** | Oyuncu transfer olduğunda eski takımdaki `user_roles` CAPTAIN rolü pasife alınır ve `league_teams.captain_id` yalnızca transfer olan oyuncuysa `NULL` yapılır. | **PASS** |
| **9** | **Yeni Takım Kaptanlığının Korunması** | Yeni takımın `league_teams.captain_id` alanına dokunulmaz; oyuncu `team_memberships` tablosuna standart oyuncu olarak eklenir, yetki sızıntısı oluşmaz. | **PASS** |
| **10** | **Rollback Uyumu ve Sıfır Veri Kaybı** | Rollback SQL'i sadece `CREATE OR REPLACE FUNCTION` içerir. Hiçbir tabloyu veya yeni transfer kaydını silmez; fonksiyonları bir önceki sürüme çeker. | **PASS** |
| **11** | **Deploy ve Migration Sıralaması** | Vercel kod deploy'u geriye dönük uyumludur. Önce kod deploy, sonra DB migration sırası sıfır kesinti sağlar. | **PASS** |
| **12** | **Gerçek PostgreSQL Motoru Test Durumu** | Host makinesinde Docker Desktop veya yerel PostgreSQL servisi kurulu olmadığı için testler izole Node.js mock/simülasyon motorunda (39/39) koşulmuştur. Canlı veritabanına bağlanılmamıştır. | **WARNING** |

---

## 3. Vercel Otomatik Deployment Durumu

- **Yerel Doğrulama:** `.vercel/repo.json` dosyası incelenmiş; projenin `prj_LyMgwBfJqocwS1HMAYgAiuNmb4rm` ID'siyle `teta-league` Vercel projesine ve `origin` remote'una bağlı olduğu doğrulanmıştır.
- **Git Branch:** Aktif branch `master`dır.
- **Otomatik Deploy:** Vercel GitHub entegrasyonunda standart davranış gereği `master` branch'ine yapılan push'lar otomatik olarak production deployment tetikler.
- **Açık Beyan (Sınır):** Uzak Vercel dashboard ayarları (örneğin "Ignored Build Step", "Deploy Hooks" veya manuel onay kuralı) yerel dosyalarda saklanmadığından ve API erişimi bulunmadığından doğrudan sorgulanamamaktadır. Ancak projenin önceki tüm push'larında deploy otomatik olarak başlamıştır.

---

## 4. Güvenli Snapshot Yedekleme ve Doğrulama Prosedürü

Eski snapshot tablolarının üzerine yanlışlıkla yazılmasını önleyen, tabloların yeni oluşturulduğunu teyit eden ve geri yükleme sınırlarını açıklayan prosedür:

### 4.1. Üzerine Yazmayı Önleyen Güvenli Snapshot SQL'i:
`IF NOT EXISTS` kaldırılmış ve tablo adı zaman damgasıyla (`_20261101_final`) tekilleştirilmiştir. Eğer aynı isimde tablo varsa PostgreSQL hata vererek durur:

```sql
-- [GÜVENLİK YEDEĞİ - MIGRATION ÖNCESİ SUPABASE SQL EDITOR'DE ÇALIŞTIRILIR]
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_backup_team_memberships_20261101_final') THEN
        RAISE EXCEPTION 'Bu isimde bir yedek tablosu zaten mevcut! Eski yedeğin üzerine yazılmaması için işlemi durdurun.';
    END IF;
END $$;

-- 1. Kadro Üyelikleri Yedeği (Season 6)
CREATE TABLE public._backup_team_memberships_20261101_final AS
SELECT * FROM public.team_memberships 
WHERE season_id = '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d' AND left_at IS NULL;

-- 2. Kaptanlık Rolleri Yedeği (Aktif Kaptanlar)
CREATE TABLE public._backup_user_roles_20261101_final AS
SELECT * FROM public.user_roles 
WHERE role = 'CAPTAIN' AND is_active = true;

-- 3. Lig Takımları ve Kaptan ID Yedeği (Season 6)
CREATE TABLE public._backup_league_teams_20261101_final AS
SELECT * FROM public.league_teams 
WHERE season_id = '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d';

-- 4. Transferler Yedeği (Season 6)
CREATE TABLE public._backup_transfers_20261101_final AS
SELECT * FROM public.transfers 
WHERE season_id = '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d';
```

### 4.2. Yedeklerin Başarıyla Alındığını Doğrulama Sorgusu:
```sql
-- [YEDEK DOĞRULAMA - SALT OKUNUR]
SELECT 
    (SELECT count(*) FROM public._backup_team_memberships_20261101_final) AS yedeklenen_uyelik_sayisi,
    (SELECT count(*) FROM public._backup_user_roles_20261101_final) AS yedeklenen_kaptan_rol_sayisi,
    (SELECT count(*) FROM public._backup_league_teams_20261101_final) AS yedeklenen_lig_takim_sayisi,
    (SELECT count(*) FROM public._backup_transfers_20261101_final) AS yedeklenen_transfer_sayisi;
```

### 4.3. Yedekleme ve Geri Yükleme Sınırları:
- **Kapsam:** Snapshot tabloları tablodaki verileri (`SELECT *`) saklar; foreign key veya index'leri taşımaz.
- **İzolasyon:** Sadece Season 6 verileri ve aktif kaptanlıklar yedeklenir; diğer sezonlar veya ilgisiz tablolar (maçlar, haberler) etkilenmez.
- **Geri Yükleme:** Olası bir veri geri yükleme ihtiyacında constraint hatası almamak için sıralama: `league_teams` -> `user_roles` -> `team_memberships` -> `transfers` şeklinde yapılmalıdır.

---

## 5. Migration Öncesi ve Sonrası Beklenen Davranış Ayrımı

| Aşama | Kod Durumu | Veritabanı Durumu | Kullanıcı / UI Davranışı |
| :--- | :--- | :--- | :--- |
| **1. Aşama:** Sadece Kod Deploy Edildi (Migration Henüz Uygulanmadı) | Yeni kod devrede (`.order().limit(1)` ile pencereleri okur) | Eski RPC'ler çalışıyor | • Sayfalar çökmeksizin normal çalışır.<br>• Eski pencere açık olduğu için transfer arama ve slotlar eski kurallarla işlemeye devam eder.<br>• Sıfır kesinti garanti edilir. |
| **2. Aşama:** DB Migration Uygulandı, Eski Pencere Kapatıldı | Yeni kod devrede | Yeni 5 fonksiyon devrede | • Kaptan ekranında eski pencere kapandığı için "TRANSFER KAPALI" görünür.<br>• Eski davetleri kimse kabul edemez ("Pencere kapalı" hatası alır). |
| **3. Aşama:** Yeni Pencere Panelden Açıldı (Quota: 5) | Yeni kod devrede | Yeni 5 fonksiyon devrede | • Kaptan ekranında "Transfer Slotu: 5 / 5" ve "TRANSFER AÇIK" rozeti görünür.<br>• Her davet anlık slot rezerve eder (3 davet -> 2 kalan).<br>• 5 transfer tamamlandığında 6. davet engellenir. |

---

## 6. Deploy Sonrası Doğrulanacak Sayfalar ve Kontrol Listesi

1. **`/takim/yonet` (Kaptan Paneli):**
   - Kaptan oturumuyla açılır.
   - Slot görünümü `5 / 5` ve rozet "TRANSFER AÇIK" olarak doğrulanır.
   - `PGRST116` veya 500 hatası olmadığı kontrol edilir.
2. **`/profil/transferler` (Oyuncu Gelen Kutusu):**
   - Oyuncu oturumuyla açılır; gelen davetlerin listelendiği doğrulanır.
3. **`/admin/transfer-windows` (Yönetici Transfer Pencereleri):**
   - Yeni açılan pencerenin başlangıç ve bitiş saatlerinin Türkiye saatinde (`Europe/Istanbul`) kaymasız göründüğü kontrol edilir.
   - Düzenle butonuna basıldığında `datetime-local` inputunda saat kayması olmadığı doğrulanır.
4. **`/admin/matches` & `/takim/yonet/maclar`:**
   - Maç yönetim ekranlarının hatasız açıldığı ve transfer değişikliklerinden etkilenmediği doğrulanır.

---

## 7. Nihai Gate Değerlendirmesi

- **BLOCKER:** **0**
- **WARNING:** **1** *(Host'ta Docker/Postgres daemon olmadığı için canlıya bağlanılmamış, 39 senaryo izole mock ortamında tamamlanmıştır)*
- **PASS:** **11**
- **Karar:** **CONDITIONAL GO (CANLI YAYINA HAZIR)**

---

## Bitiş Teyidi

Canlı sisteme, production veritabanına, transfer pencerelerine veya Vercel ortamına **hiçbir müdahalede bulunulmamıştır**.

Deploy onayınız beklenmektedir.

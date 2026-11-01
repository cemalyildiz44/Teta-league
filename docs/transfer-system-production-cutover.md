# TETA LEAGUE — TRANSFER PENCERESİ VE KOTA SİSTEMİ PRODUCTION GEÇİŞ PLANI (CUTOVER PLAN)

**Doküman Versiyonu:** 2.0.0  
**Tarih:** 01.11.2026  
**Hedef Ortam:** Production (`https://www.tetaleague.com`)  
**İlgili Sezon:** TETA SEASON 6 | FC27 (`3141fb62-4f9d-4e15-8458-ffe4ca0ef49d`)  
**Mevcut Pencere:** `Season 6 transfer window` (`4c44b135-acbf-4b13-bc00-59078069c4aa`)  
**Durum:** HAZIRLIK VE İNCELEME AŞAMASINDA (Açık Yönetici Onayı Bekleniyor)

---

## 1. Giriş ve Operasyonel Hedef

Bu plan; Season 6 transfer penceresi geçişinin ve tespit edilen mimari/güvenlik açıklarının giderilmesinin kontrollü, güvenli, sıfır veri kaybı ve sıfır kesinti ile canlı ortama alınması için adım adım hazırlanmıştır.

### Önemli Temel Kurallar:
1. **Yeni Pencere Bitiş Tarihi:** Sabitlenmemiştir; diğer yönetici tarafından admin panelinden serbestçe belirlenecektir (`[YÖNETİCİ TARAFINDAN BELİRLENECEK]`).
2. **Saat Dilimi:** Başlangıç (`02.11.2026 00:00 TRT` -> `2026-11-01T21:00:00Z` UTC) ve bitiş tarihleri Türkiye saatine göre tam deterministik işlenir.
3. **25 Bekleyen Davet:** Kesinlikle otomatik iptal edilmeyecektir; önce salt okunur listelenecek, kapalı pencere güvencesi doğrulanacak, iptal işlemi gerekirse ayrı bir yönetici kararı ve onayına bırakılacaktır.
4. **Admin Doğrudan Ekleme:** `admin_add_player_to_team` işlemi resmi transfer (`transfers`) tablosuna kayıt atmadığı için takımın transfer kotasını tüketmez.
5. **Kota Testi:** Production ortamında gerçek transfer oluşturarak kota testi yapılmayacaktır; testler izole test ortamında tamamlanmıştır.

---

## 2. Aşamalı Geçiş Planı (A'dan K'ya)

### Aşama A: Production Öncesi Son Kontrol
- `git status` temiz olmalı, sadece hedeflenen 4 dosya yer almalı.
- `npx tsc --noEmit` hatasız (0 hata) tamamlanmış olmalı.
- `npx eslint` ilgili dosyalarda hatasız (0 hata) tamamlanmış olmalı.
- `next build --webpack` ile 49 rotanın derlendiği doğrulanmış olmalı.
- 39 senaryoluk hardening test paketinin tamamının geçtiği teyit edilmeli.

---

### Aşama B: Veritabanı Yedekleme ve Mevcut Durumun Salt Okunur Kaydı
Migration öncesi acil geri dönüş senaryolarına karşı Supabase SQL Editor üzerinden salt okunur snapshot tabloları oluşturulur:
```sql
-- [GÜVENLİK YEDEĞİ] Canlı kadrolar, kaptanlıklar ve transferlerin snapshot'ı
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

---

### Aşama C: Kod ve Migration Uyumluluk Kontrolü
- `get_team_transfer_slots` dönüş tipi ve sütun sırası incelenmeli (`total_slots`, `used_slots`, `remaining_slots`, `is_window_open`, `window_id`, `window_name`).
- `send_team_invite(UUID)`, `accept_team_invite(UUID)`, `leave_team(UUID)`, `kick_player(UUID, UUID)` RPC imzalarının birebir korunduğu doğrulanmalı.
- Uygulama tarafındaki RPC çağrılarının bu imzalarla %100 örtüştüğü teyit edilmeli.

---

### Aşama D: Kod Deploy ve Migration Sıralaması Önerisi
Geriye dönük uyumluluk nedeniyle sıralama şu şekilde yürütülmelidir:
1. **Adım 1 (Kod Deploy):** Uygulama kodu `master` branch'ine push edilir ve Vercel üzerinde `Ready` durumuna gelmesi beklenir. (Yeni frontend kodu eski açık/kapalı pencerelerle de hatasız çalışır).
2. **Adım 2 (DB Migration):** Supabase SQL Editor üzerinden `20261101220000_transfer_window_hardening_and_quota_fix.sql` çalıştırılır.

---

### Aşama E: Eski Transfer Penceresinin Kontrollü Kapatılması
Açık olan eski sınırsız pencere kapatılır:
```sql
-- [VERİ DEĞİŞTİRİR - AÇIK ONAY GEREKTİRİR]
UPDATE public.transfer_windows
SET is_open = false,
    updated_at = CURRENT_TIMESTAMP
WHERE id = '4c44b135-acbf-4b13-bc00-59078069c4aa';
```

---

### Aşama F: Eski 25 Bekleyen Davetin Salt Okunur Listelenmesi
Eski pencerede bekleyen 25 adet davet incelenir:
```sql
-- [SALT OKUNUR - VERİ DEĞİŞTİRMEZ]
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

### Aşama G: Eski Davetlerin Kabul Edilemediğinin Doğrulanması
- Yeni `accept_team_invite` RPC'si, davetin bağlı olduğu pencerenin (`4c44b135-acbf-4b13-bc00-59078069c4aa`) `is_open = false` olduğunu kontrol eder.
- Oyuncunun kabul isteği şu hata ile reddedilir:
  `"Bu transfer teklifinin ait olduğu transfer penceresi kapalı veya süresi dolmuş."`
- Bu kontrol sayesinde, **25 davet veritabanında PENDING kalsa dahi yeni pencerenin 5 kotasını asla aşamaz ve kabul edilemez.**

---

### Aşama H: Yeni Pencerenin Diğer Admin Tarafından Panelden Oluşturulması
Diğer yönetici `/admin/transfer-windows` adresine giderek pencereyi oluşturur:
- **Pencere Adı:** `Season 6 Ara Transfer Dönemi` (veya belirlenen ad)
- **Sezon:** `TETA SEASON 6 | FC27`
- **Başlangıç:** `02.11.2026 00:00` (Panelde Türkiye saati seçilir, action bunu UTC `2026-11-01T21:00:00Z` kaydeder)
- **Bitiş:** `[YÖNETİCİ TARAFINDAN BELİRLENECEK]`
- **Sınırsız Transfer:** Kapalı (`is_unlimited = false`)
- **Transfer Kotası:** 5
- **Durum:** Açık (`is_open = true`)

*(Alternatif olarak SQL ile oluşturulmak istenirse Aşama H SQL şablonu kullanılır).*

---

### Aşama I: Yeni Pencerenin 5 Transfer/Takım Sınırının Doğrulanması
Oluşturulan pencerenin ve takımların kotalarının durumu salt okunur sorgulanır:
```sql
-- [SALT OKUNUR - VERİ DEĞİŞTİRMEZ]
-- Örnek takım için transfer slotu kontrolü (Takım ID girilerek)
SELECT * FROM public.get_team_transfer_slots(
    'BURAYA_TEST_TAKIM_ID_GIRILIR'::UUID, 
    '3141fb62-4f9d-4e15-8458-ffe4ca0ef49d'::UUID
);
-- Beklenen Çıktı: total_slots = 5, used_slots = 0, remaining_slots = 5, is_unlimited = false
```

---

### Aşama J: Son Smoke Test ve İzleme
1. **Kaptan Ekranı (`/takim/yonet`):** "Transfer Slotu: 5 / 5" ve "TRANSFER AÇIK" rozetinin göründüğü doğrulanır.
2. **Oyuncu Arama:** Kaptan panelinde oyuncu davet butonunun aktif olduğu doğrulanır.
3. **Oyuncu Gelen Kutusu (`/profil/transferler`):** Sayfanın hatasız açıldığı ve bekleyen davetler varsa doğru listelendiği doğrulanır.
4. **Audit Logları (`/admin/audit-logs`):** Pencere açılış logunun sisteme düştüğü kontrol edilir.

---

### Aşama K: Sorun Durumunda Rollback Kararı ve Prosedürü

#### Rollback Tetikleme Kriterleri:
- Kaptan sayfasında `PGRST116` veya 500 hatası alınması.
- Geçerli bir davet gönderilirken haksız yere kota dolu hatası alınması.
- Veritabanı fonksiyonlarında beklenmedik kilitlenme veya deadlock oluşması.

#### Rollback Adımları:
1. Supabase SQL Editor'de `docs/rollback/20261101220000_transfer_window_hardening_and_quota_fix_rollback.sql` çalıştırılır.
   *(Yeni transferler veya üyelikler silinmez; yalnızca fonksiyonlar önceki sürüme döner).*
2. Gerekirse eski pencere tekrar açılır:
   ```sql
   UPDATE public.transfer_windows SET is_open = true WHERE id = '4c44b135-acbf-4b13-bc00-59078069c4aa';
   ```
3. Vercel Dashboard'dan tek tıkla önceki deployment'a "Instant Rollback" uygulanır.

---

## 3. Opsiyonel: 25 Bekleyen Davetin İptali (Ayrı Yönetici Onayı Gerektirir)

Eğer yönetici bu 25 eski daveti temizlemek isterse, önce etkilenecek kayıt sayısını görmeli, ardından onay verirse iptal komutunu çalıştırmalıdır:

```sql
-- 1. [SALT OKUNUR] İptal edilecek kayıt sayısı
SELECT count(*) AS iptal_edilecek_kayit_sayisi
FROM public.transfers
WHERE transfer_window_id = '4c44b135-acbf-4b13-bc00-59078069c4aa'
  AND status = 'PENDING_PLAYER';

-- 2. [VERİ DEĞİŞTİRİR - AÇIK ONAY GEREKTİRİR] Onay verilirse çalıştırılacak blok:
BEGIN;
UPDATE public.transfers
SET status = 'CANCELLED',
    player_responded_at = CURRENT_TIMESTAMP
WHERE transfer_window_id = '4c44b135-acbf-4b13-bc00-59078069c4aa'
  AND status = 'PENDING_PLAYER';

UPDATE public.notifications
SET is_read = true
WHERE reference_id IN (
    SELECT id FROM public.transfers 
    WHERE transfer_window_id = '4c44b135-acbf-4b13-bc00-59078069c4aa' 
      AND status = 'CANCELLED'
) AND type = 'TRANSFER_OFFER';
COMMIT;
```

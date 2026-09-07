import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Çerez Politikası | Teta League',
  description: 'Teta League Çerez Politikası',
};

export default function CookiePolicyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="card-surface rounded-2xl p-8 md:p-12 border border-white/5 relative overflow-hidden">
        {/* Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#00e5ff] rounded-full blur-[120px] opacity-10 pointer-events-none" />

        <h1 className="text-3xl font-black text-white tracking-widest uppercase mb-2">Çerez Politikası</h1>
        <p className="text-gray-400 text-sm mb-10">Son Güncelleme: 6 Eylül 2026</p>

        <div className="space-y-8 text-gray-300 text-sm leading-relaxed">
          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">1. Çerez Nedir?</h2>
            <p>
              Çerezler (Cookies), bir web sitesini ziyaret ettiğinizde tarayıcınız aracılığıyla cihazınıza veya ağ sunucusuna depolanan küçük metin dosyalarıdır. Web sitemizin düzgün çalışması, kullanıcı deneyiminin iyileştirilmesi ve bazı temel işlevlerin yerine getirilebilmesi için çerezleri kullanmaktayız.
            </p>
          </section>

          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">2. Kullandığımız Çerezler</h2>
            <p className="mb-3">
              Teta League platformu, yapısı gereği <strong>yalnızca zorunlu (kesinlikle gerekli) çerezler</strong> kullanmaktadır.
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                <strong className="text-white">Oturum Yönetimi Çerezleri (Supabase Auth):</strong> Kullanıcı girişlerinin (login) güvenli bir şekilde sağlanması, yetkisiz erişimlerin engellenmesi ve platform içerisindeki işlemlerinizin (örneğin; transfer teklifleri, maç girişleri) sizin adınıza yapılabilmesi için zorunludur.
              </li>
              <li>
                <strong className="text-white">Altyapı Çerezleri (Vercel/Next.js):</strong> Sitenin performanslı ve kesintisiz çalışabilmesi, sayfalar arası geçişlerin sağlanması amacıyla altyapı sağlayıcılarımız tarafından yerleştirilen teknik çerezlerdir.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">3. Kullanmadığımız Çerezler</h2>
            <p>
              Platformumuzda halihazırda <strong>Analitik, Reklam (Pazarlama) veya Performans</strong> takibi yapan üçüncü taraf çerezler (Örn: Google Analytics, Meta Pixel vb.) kullanılmamaktadır. Sistemimiz, davranışlarınızı reklam profillemesi amacıyla takip etmez.
            </p>
          </section>

          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">4. Çerez Tercihleri ve Yönetimi</h2>
            <p>
              Kullandığımız çerezler sitenin çalışması için kesinlikle gerekli olduğundan kapatılamaz. Çerez kullanımını tamamen reddetmek isterseniz, tarayıcınızın ayarlarından tüm çerezleri engelleyebilirsiniz, ancak bu durumda Teta League'e giriş yapamaz ve hesabınızı kullanamazsınız.
            </p>
          </section>

          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">5. İletişim</h2>
            <p>
              Çerez politikamız hakkında sorularınız için sitemizdeki iletişim kanalları veya sosyal medya hesaplarımız (Discord, Twitter) üzerinden bize ulaşabilirsiniz.
            </p>
          </section>

          <div className="mt-12 p-4 bg-[#00e5ff]/5 border border-[#00e5ff]/20 rounded text-xs text-gray-400">
            Bu metin Teta League platformunun mevcut kullanım yapısına göre hazırlanmıştır.
          </div>
        </div>
      </div>
    </div>
  );
}

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gizlilik ve Aydınlatma Metni | Teta League',
  description: 'Teta League Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="card-surface rounded-2xl p-8 md:p-12 border border-white/5 relative overflow-hidden">
        {/* Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#00e5ff] rounded-full blur-[120px] opacity-10 pointer-events-none" />

        <h1 className="text-3xl font-black text-white tracking-widest uppercase mb-2">Gizlilik ve Aydınlatma Metni</h1>
        <p className="text-gray-400 text-sm mb-10">Son Güncelleme: 6 Eylül 2026</p>

        <div className="space-y-8 text-gray-300 text-sm leading-relaxed">
          
          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">1. Veri Sorumlusu</h2>
            <p>
              Teta League ("Platform"), elektronik sporlar ve sanal lig yönetimi alanında faaliyet gösteren bir hizmettir. 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında, kullanıcılarımızın ("Veri Sahibi") kişisel verilerinin güvenliğine ve hukuka uygun şekilde işlenmesine büyük önem veriyoruz. İşbu aydınlatma metni, hangi kişisel verilerinizin ne amaçla işlendiğini açıklamaktadır.
            </p>
          </section>

          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">2. İşlenen Kişisel Verileriniz</h2>
            <p className="mb-3">Kayıt olurken ve platformu kullanırken yalnızca hizmetin sağlanabilmesi için gerekli olan şu verileriniz işlenmektedir:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong className="text-white">Kimlik ve İletişim Bilgileri:</strong> E-posta adresi, kullanıcı adı (username).</li>
              <li><strong className="text-white">Oyun ve Profil Bilgileri:</strong> EA ID (Oyun içi kimliğiniz), oynadığınız mevkiler (primary ve alternatif pozisyonlar), oyun platformunuz, profil açıklamanız (bio), yüklediğiniz profil resmi (avatar), sosyal medya hesap bağlantılarınız.</li>
              <li><strong className="text-white">Platform İçi Etkinlik Verileri:</strong> Takım üyelikleriniz, transfer geçmişiniz, oynadığınız maçlar, gol/asist istatistikleriniz, platform içerisinde yaptığınız yorumlar ve bildirim verileriniz.</li>
              <li><strong className="text-white">İşlem Güvenliği Bilgileri:</strong> IP adresi logları, giriş kayıtları, çerez kayıtları ve şifre bilgileriniz (geri döndürülemez şekilde şifrelenmiş (hashed) olarak saklanır).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">3. Kişisel Verilerin İşlenme Amaçları ve Hukuki Sebepleri</h2>
            <p className="mb-3">Verileriniz, KVKK'nın 5/2 maddesindeki "Bir sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili olması" ile "İlgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla veri sorumlusunun meşru menfaatleri için veri işlenmesinin zorunlu olması" hukuki şartlarına dayalı olarak şu amaçlarla işlenir:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Kullanıcı hesabı oluşturulması ve platforma güvenli giriş yapabilmeniz.</li>
              <li>Takım kurma, transfere katılma, maç girişleri gibi ana hizmetlerin sunulması.</li>
              <li>Oyuncu ve takım istatistiklerinin (gol, asist vb.) hesaplanarak herkese açık şekilde yayınlanması.</li>
              <li>Sistem hatalarının tespiti ve platformun güvenliğinin sağlanması.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">4. Kişisel Verilerin Aktarımı</h2>
            <p>
              Teta League, kişisel verilerinizi reklam, pazarlama veya ticari profilleme amaçlarıyla <strong className="text-white">hiçbir üçüncü taraf ile paylaşmaz veya satmaz.</strong>
              Ancak verileriniz, sistemin barındırılması ve teknik güvenliğin sağlanması amacıyla bulut altyapı hizmeti aldığımız güvenli servis sağlayıcılarında (Supabase, Vercel) ve e-posta gönderimi için (Resend) hizmet aldığımız sunucularda (yurtdışı bulut sistemleri) muhafaza edilmektedir.
              Kullanıcı adı, EA ID, takım, istatistik ve avatar gibi oyun içi performans verileriniz platformun doğası gereği <strong>diğer kullanıcılara ve site ziyaretçilerine açık</strong> olarak yayınlanır.
            </p>
          </section>

          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">5. Veri Sahibinin Hakları</h2>
            <p>
              KVKK'nın 11. maddesi uyarınca; verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, eksik/yanlış işlenmişse düzeltilmesini isteme, kanuni şartlar çerçevesinde silinmesini veya yok edilmesini talep etme haklarına sahipsiniz. Taleplerinizi sitemizin destek kanalları veya resmi Discord sunucumuz üzerinden yetkililere iletebilirsiniz.
            </p>
          </section>

          <div className="mt-12 p-4 bg-[#00e5ff]/5 border border-[#00e5ff]/20 rounded text-xs text-gray-400">
            Bu metin Teta League platformunun mevcut kullanım ve veri işleme yapısına göre hazırlanmıştır. Hukuki danışmanlık yerine geçmez.
          </div>
        </div>
      </div>
    </div>
  );
}

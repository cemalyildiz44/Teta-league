import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kullanım Şartları | TETA League',
  description: 'TETA League Kullanım Şartları ve Topluluk Kuralları',
};

export default function TermsOfUsePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="card-surface rounded-2xl p-8 md:p-12 border border-white/5 relative overflow-hidden">
        {/* Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#00e5ff] rounded-full blur-[120px] opacity-10 pointer-events-none" />

        <h1 className="text-3xl font-black text-white tracking-widest uppercase mb-2">Kullanım Şartları</h1>
        <p className="text-gray-400 text-sm mb-10">Son Güncelleme: 6 Eylül 2026</p>

        <div className="space-y-8 text-gray-300 text-sm leading-relaxed">
          
          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">1. Hizmetin Tanımı ve Kabul</h2>
            <p>
              TETA League, oyuncuların EA FC Pro Clubs modunda takımlar kurmasını, transferler yapmasını ve düzenlenen liglere/turnuvalara katılmasını sağlayan bağımsız bir topluluk ve istatistik platformudur. Platforma kayıt olan her kullanıcı bu Kullanım Şartları'nı okuduğunu, anladığını ve bu kurallara uymayı kabul ettiğini beyan eder.
            </p>
          </section>

          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">2. Kullanıcı Hesabı ve Güvenlik</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Hesap açarken verdiğiniz bilgilerin doğruluğundan sorumlusunuz. Özellikle <strong>EA ID (Oyun Kimliği)</strong> bilgilerinin güncel ve size ait olması zorunludur.</li>
              <li>Şifrenizin gizliliği tamamen kullanıcının sorumluluğundadır. Hesabınızla yapılan işlemlerden sizin sorumlu olduğunuz kabul edilir.</li>
              <li>Bir kişinin birden fazla hesap (multi-account) açması, sistemi manipüle etmek anlamına geldiği için yasaktır ve tespiti halinde hesaplar uzaklaştırılabilir.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">3. Davranış Kuralları ve Fair-Play</h2>
            <p className="mb-3">TETA League, rekabetçi ancak saygılı bir e-spor ortamı sağlamayı hedefler. Aşağıdaki davranışlar kesinlikle yasaktır:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Diğer oyunculara, takımlara veya yöneticilere karşı hakaret, küfür, tehdit veya ayrımcı (ırkçı, cinsiyetçi vb.) söylemlerde bulunmak.</li>
              <li>Lig veya maç sonuçlarını kasten manipüle etmek, şike yapmak veya sistemi kandırmaya yönelik yanlış istatistik/skor girmek.</li>
              <li>Platformun güvenliğini aşmaya çalışmak, spam yorum yapmak veya zararlı yazılım paylaşmak.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">4. Yaptırımlar ve Hesabın Askıya Alınması</h2>
            <p>
              Yönetim; kural ihlallerinde, hile kullanımında veya topluluk huzurunu bozan durumlarda, önceden haber vermeksizin kullanıcının takım kaptanlığını alabilir, transfer iptalleri gerçekleştirebilir, ligden ihraç edebilir veya hesabı tamamen kalıcı olarak kapatma hakkını saklı tutar.
            </p>
          </section>

          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">5. Fikri Mülkiyet ve İçerikler</h2>
            <p>
              Platformdaki logolar, kodlar, tasarımlar ve veritabanı TETA League'e aittir. Kullanıcıların yüklediği logolar, takım isimleri ve metin içerikleri (bio, sosyal gönderiler) yürürlükteki yasalara aykırı olmamalıdır. Kullanıcı, yüklediği içeriklerin tüm yasal sorumluluğunun kendisine ait olduğunu kabul eder. <em>Not: "EA FC", "Pro Clubs" ve ilgili tüm marka hakları Electronic Arts Inc.'e aittir. TETA League, Electronic Arts ile resmi bir bağa sahip değildir.</em>
            </p>
          </section>

          <section>
            <h2 className="text-[#00e5ff] text-lg font-bold tracking-widest uppercase mb-3">6. Sorumluluğun Sınırlandırılması</h2>
            <p>
              TETA League hizmeti "olduğu gibi" sunulmaktadır. Kesintisiz erişim, hata olmaması veya sunucu kapanmalarından dolayı yaşanacak olası veri (istatistik/maç) kayıplarından platform yönetimi sorumlu tutulamaz.
            </p>
          </section>

          <div className="mt-12 p-4 bg-[#00e5ff]/5 border border-[#00e5ff]/20 rounded text-xs text-gray-400">
            Bu metinler TETA League platformunun mevcut kullanım yapısına göre hazırlanmıştır. Hukuki danışmanlık yerine geçmez.
          </div>
        </div>
      </div>
    </div>
  );
}

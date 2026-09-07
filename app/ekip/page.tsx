import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ekip | Teta League',
  description: 'Teta League yönetim ve organizasyon ekibi.',
};

interface TeamMember {
  role: string;
  name: string;
}

const teamMembers: TeamMember[] = [
  { role: "CEO", name: "Doruk Kaya" },
  { role: "Head Admin", name: "Batu Kalkan" },
  { role: "Global Koordinatör", name: "Mustafa Küçükbaş" },
  { role: "Ana Koordinatör", name: "İsmail Biçer" },
  { role: "Genel Menajer", name: "Cemal Yıldız" },
  { role: "Sosyal Medya Yöneticisi", name: "Kerem Acar" },
  { role: "Etkinlik Koordinatörü", name: "Hebun Demir" },
  { role: "Süper Lig Admini", name: "Burak Aksu" },
  { role: "ECL 1.Lig Admini", name: "Arda Öztürk" },
  { role: "Genel Chat Admini", name: "Ferdi Varol" },
  { role: "Genel Chat Admini", name: "Cihat Koyuncuoğlu" },
  { role: "Genel Chat Admini", name: "Can İpekişleyen" },
  { role: "TETA Creative // Spiker", name: "Murat Can Doğu" },
  { role: "TETA Creative // Yorumcu", name: "Batuhan Yılmaz" },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function EkipPage() {
  return (
    <div className="mx-auto max-w-[1400px] w-full px-4 lg:px-6 py-12 md:py-16">
      {/* Header */}
      <div className="mb-10 sm:mb-12">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1.5 h-6 bg-[#00e5ff] rounded-full shadow-[0_0_12px_#00e5ff]" />
          <h1 className="text-[28px] sm:text-[34px] font-[900] tracking-wide text-white uppercase">
            EKİP
          </h1>
        </div>
        <p className="text-gray-400 text-sm sm:text-base font-medium">
          Teta League ekibi
        </p>
      </div>

      {/* Team Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
        {teamMembers.map((member, idx) => (
          <div
            key={idx}
            className="client-glass group relative overflow-hidden rounded-xl p-5 border border-white/5 hover:border-[#00e5ff]/40 bg-[#020813]/70 transition-all duration-300 hover:shadow-[0_0_25px_rgba(0,229,255,0.08)] hover:-translate-y-0.5 flex flex-col justify-between min-h-[110px]"
          >
            {/* Ambient top light */}
            <div className="absolute -top-6 -right-6 w-20 h-20 bg-[#00e5ff]/5 rounded-full blur-xl pointer-events-none group-hover:bg-[#00e5ff]/20 transition-all duration-500" />

            {/* Role & Initials */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[10px] sm:text-[11px] font-extrabold tracking-wider text-[#00e5ff] uppercase truncate">
                {member.role}
              </span>
              <div className="w-7 h-7 rounded-full bg-[#061120] border border-white/10 flex items-center justify-center text-[10px] font-black text-gray-300 group-hover:border-[#00e5ff]/40 group-hover:text-[#00e5ff] group-hover:shadow-[0_0_10px_rgba(0,229,255,0.2)] transition-all shrink-0">
                {getInitials(member.name)}
              </div>
            </div>

            {/* Name */}
            <div>
              <h3 className="text-[15px] sm:text-[17px] font-black text-white tracking-wide uppercase group-hover:text-white transition-colors">
                {member.name}
              </h3>
            </div>
          </div>
        ))}
      </div>

      {/* Discord CTA */}
      <div className="mt-12 sm:mt-16 client-glass rounded-2xl p-6 sm:p-8 border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6 bg-[#020813]/60">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider mb-1">
            BİZE <span className="text-[#00e5ff]">ULAŞIN</span>
          </h2>
          <p className="text-sm text-gray-400">
            Lig yönetimi, organizasyon ve hakem heyetiyle iletişim için resmi Discord sunucumuza katılabilirsiniz.
          </p>
        </div>
        <a
          href="https://discord.gg/Cd9b4jpcAZ"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full sm:w-auto px-8 py-3.5 bg-[#5865F2] hover:bg-[#4752c4] text-white font-bold text-xs tracking-wider uppercase rounded-xl transition-all shadow-[0_0_20px_rgba(88,101,242,0.3)] hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 shrink-0"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M19.73 4.87a18.2 18.2 0 00-4.6-1.44c-.21.38-.44.88-.6 1.28a16.69 16.69 0 00-5.06 0c-.16-.4-.4-.9-.6-1.28a18.2 18.2 0 00-4.6 1.44A18.52 18.52 0 001.3 16.7a18.3 18.3 0 005.61 2.85 13.06 13.06 0 001.2-1.95 12.3 12.3 0 01-1.93-.94 9 9 0 00.36-.28c3.84 1.76 8 1.76 11.83 0a9 9 0 00.36.28 12.3 12.3 0 01-1.93.94c.36.69.76 1.34 1.2 1.95a18.3 18.3 0 005.61-2.85 18.66 18.66 0 00-4.27-11.82zM8.5 13.91c-1.12 0-2.04-1.04-2.04-2.3 0-1.27.9-2.3 2.04-2.3 1.15 0 2.06 1.04 2.04 2.3 0 1.26-.9 2.3-2.04 2.3zm7 0c-1.12 0-2.04-1.04-2.04-2.3 0-1.27.9-2.3 2.04-2.3 1.15 0 2.06 1.04 2.04 2.3 0 1.26-.9 2.3-2.04 2.3z" clipRule="evenodd" />
          </svg>
          Discord Sunucusu
        </a>
      </div>
    </div>
  );
}

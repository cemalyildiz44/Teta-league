import { Trophy, Award, Flame, Zap } from 'lucide-react';

export default function Rewards() {
  const prizeList = [
    {
      title: "Süper Lig Şampiyonu",
      amount: "5.000 TL",
      icon: Trophy,
      highlight: true,
    },
    {
      title: "ECL 1. Lig Şampiyonu",
      amount: "2.500 TL",
      icon: Award,
      highlight: false,
    },
    {
      title: "Gol Kralı",
      amount: "500 TL",
      icon: Flame,
      highlight: false,
    },
    {
      title: "Asist Kralı",
      amount: "500 TL",
      icon: Zap,
      highlight: false,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-[900] tracking-wide text-white flex items-center gap-2 uppercase">
          <span className="w-2 h-2 rounded-full bg-[#00e5ff] shadow-[0_0_10px_#00e5ff]" />
          ÖDÜLLER
        </h2>
      </div>

      <div className="client-glass rounded-xl p-4 sm:p-5 border border-white/5 relative overflow-hidden bg-[#01060b] shadow-[0_0_20px_rgba(0,229,255,0.03)] space-y-2.5">
        {/* Subtle cyan glow behind */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#00e5ff]/5 rounded-full blur-2xl pointer-events-none" />

        {prizeList.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={idx}
              className={`flex items-center justify-between p-3 sm:p-3.5 rounded-lg border transition-all ${
                item.highlight
                  ? 'bg-[#00e5ff]/10 border-[#00e5ff]/30 shadow-[0_0_15px_rgba(0,229,255,0.08)]'
                  : 'bg-white/[0.02] border-white/5 hover:border-white/10'
              }`}
            >
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    item.highlight
                      ? 'bg-[#00e5ff]/20 text-[#00e5ff]'
                      : 'bg-white/5 text-gray-400'
                  }`}
                >
                  <Icon size={15} />
                </div>
                <span
                  className={`text-xs sm:text-[13px] font-bold uppercase tracking-wider truncate ${
                    item.highlight ? 'text-white' : 'text-gray-300'
                  }`}
                >
                  {item.title}
                </span>
              </div>
              <span
                className={`text-xs sm:text-sm md:text-[15px] font-black tracking-wider shrink-0 pl-2 ${
                  item.highlight
                    ? 'text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]'
                    : 'text-[#00e5ff]'
                }`}
              >
                {item.amount}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

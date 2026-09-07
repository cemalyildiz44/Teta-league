import Link from 'next/link';

export default function NewsSection() {
  const mockNews = [
    {
      id: 1,
      title: "Abrakadabra ESP Sezona Hızlı Başladı",
      summary: "Yeni sezonda güçlü transferlerle dikkat çeken Abrakadabra, rakiplerine gözdağı veriyor.",
      category: "LİG HABERİ",
      date: "22 Ağu 2026",
      image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=800"
    },
    {
      id: 2,
      title: "Transfer Sezonu Kapanıyor!",
      summary: "Takımların kadrolarını bildirmeleri için son 48 saat. Yeni kural değişiklikleri açıklandı.",
      category: "BİLGİLENDİRME",
      date: "20 Ağu 2026",
      image: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?auto=format&fit=crop&q=80&w=800"
    }
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] sm:text-[28px] font-[800] tracking-wide text-white">HABERLER</h2>
        <Link href="/haberler" className="text-xs sm:text-[13px] font-[800] text-[#00E5FF] hover:text-white transition-colors tracking-widest uppercase">
          TÜM HABERLER &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        {mockNews.map((news) => (
          <Link key={news.id} href="#" className="client-glass-interactive group overflow-hidden flex flex-col h-full border border-white/5 hover:border-[#00E5FF]/40 transition-all rounded-xl cursor-pointer">
            <div className="relative h-36 sm:h-40 w-full overflow-hidden bg-black/50">
              <img src={news.image} alt={news.title} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" />
              <div className="absolute top-3 left-3">
                <span className="badge-cyan bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/30 backdrop-blur-md font-black tracking-widest text-[9px] sm:text-[10px] px-2.5 py-1 uppercase shadow-[0_0_10px_rgba(0,229,255,0.2)]">
                  {news.category}
                </span>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[#050a0f] via-transparent to-transparent opacity-90" />
            </div>
            
            <div className="p-4 sm:p-5 flex flex-col flex-1 bg-gradient-to-b from-[#050a0f] to-[#01060b]">
              <span className="data-label mb-1.5 block !text-[10px]">{news.date}</span>
              <h3 className="text-[17px] sm:text-[18px] md:text-[19px] font-[800] text-white leading-snug mb-2 group-hover:text-[#00E5FF] transition-colors line-clamp-2 drop-shadow-md">
                {news.title}
              </h3>
              <p className="text-gray-400 text-xs sm:text-[13px] font-medium line-clamp-2 mt-auto leading-relaxed">
                {news.summary}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

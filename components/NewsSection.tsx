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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[28px] font-[800] tracking-wide text-white">HABERLER</h2>
        <Link href="/haberler" className="text-[13px] font-[800] text-[#00E5FF] hover:text-white transition-colors tracking-widest uppercase">
          TÜM HABERLER &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 lg:gap-8">
        {mockNews.map((news) => (
          <Link key={news.id} href="#" className="client-glass-interactive group overflow-hidden flex flex-col h-full border border-white/5 hover:border-[#00E5FF]/40 transition-all rounded-xl cursor-pointer">
            <div className="relative aspect-video w-full overflow-hidden bg-black/50">
              <img src={news.image} alt={news.title} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" />
              <div className="absolute top-4 left-4">
                <span className="badge-cyan bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/30 backdrop-blur-md font-black tracking-widest text-[10px] md:text-[11px] px-3 py-1.5 uppercase shadow-[0_0_10px_rgba(0,229,255,0.2)]">
                  {news.category}
                </span>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[#050a0f] via-transparent to-transparent opacity-90" />
            </div>
            
            <div className="p-6 md:p-8 flex flex-col flex-1 bg-gradient-to-b from-[#050a0f] to-[#01060b]">
              <span className="data-label mb-3 block">{news.date}</span>
              <h3 className="text-[22px] md:text-[24px] font-[800] text-white leading-tight mb-4 group-hover:text-[#00E5FF] transition-colors line-clamp-2 drop-shadow-md">
                {news.title}
              </h3>
              <p className="text-gray-400 text-[15px] md:text-base font-medium line-clamp-3 mt-auto">
                {news.summary}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

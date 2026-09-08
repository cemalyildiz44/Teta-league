import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Newspaper } from 'lucide-react';

export default async function NewsSection() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: newsList } = await supabase
    .from('news')
    .select('id, title, slug, summary, category, published_at, created_at, image_url')
    .eq('is_published', true)
    .order('published_at', { ascending: false })
    .limit(2);

  const news = newsList || [];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] sm:text-[28px] font-[800] tracking-wide text-white">HABERLER</h2>
        <Link href="/haberler" className="text-xs sm:text-[13px] font-[800] text-[#00E5FF] hover:text-white transition-colors tracking-widest uppercase">
          TÜM HABERLER &rarr;
        </Link>
      </div>

      {news.length === 0 ? (
        <div className="client-glass-interactive rounded-xl p-8 border border-white/5 text-center bg-gradient-to-b from-[#050a0f] to-[#01060b]">
          <Newspaper className="w-10 h-10 text-[#00e5ff]/30 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-300">Henüz yayınlanmış bir lig haberi bulunmuyor.</p>
          <p className="text-xs text-gray-500 mt-1">Duyurular ve güncel haberler için takipte kalın.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {news.map((item) => {
            const formattedDate = new Date(item.published_at || item.created_at).toLocaleDateString('tr-TR', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            });

            return (
              <Link
                key={item.id}
                href={`/haberler/${item.slug}`}
                className="client-glass-interactive group overflow-hidden flex flex-col h-full border border-white/5 hover:border-[#00E5FF]/40 transition-all rounded-xl cursor-pointer"
              >
                <div className="relative h-36 sm:h-40 w-full overflow-hidden bg-black/50">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0a1628] to-[#020508]">
                      <Newspaper className="w-10 h-10 text-[#00e5ff]/30" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <span className="badge-cyan bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/30 backdrop-blur-md font-black tracking-widest text-[9px] sm:text-[10px] px-2.5 py-1 uppercase shadow-[0_0_10px_rgba(0,229,255,0.2)]">
                      {item.category}
                    </span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050a0f] via-transparent to-transparent opacity-90" />
                </div>

                <div className="p-4 sm:p-5 flex flex-col flex-1 bg-gradient-to-b from-[#050a0f] to-[#01060b]">
                  <span className="data-label mb-1.5 block !text-[10px]">{formattedDate}</span>
                  <h3 className="text-[17px] sm:text-[18px] md:text-[19px] font-[800] text-white leading-snug mb-2 group-hover:text-[#00E5FF] transition-colors line-clamp-2 drop-shadow-md">
                    {item.title}
                  </h3>
                  {item.summary && (
                    <p className="text-gray-400 text-xs sm:text-[13px] font-medium line-clamp-2 mt-auto leading-relaxed">
                      {item.summary}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

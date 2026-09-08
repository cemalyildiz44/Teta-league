import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import Image from 'next/image';
import { Newspaper, Calendar, ArrowRight, Tag } from 'lucide-react';
import { NewsArticle } from '@/types/news';

export const metadata = {
  title: 'Haberler & Duyurular | TETA League',
  description: 'TETA League en son lig haberleri, transfer gelişmeleri, turnuva duyuruları ve resmi açıklamalar.',
};

export const revalidate = 60; // ISR cache revalidation every 60s

export default async function HaberlerPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const resolvedSearchParams = await searchParams;
  const currentCategory = resolvedSearchParams?.category || 'ALL';

  let query = supabase
    .from('news')
    .select('id, title, slug, category, summary, image_url, published_at, created_at')
    .eq('is_published', true)
    .order('published_at', { ascending: false });

  if (currentCategory !== 'ALL') {
    query = query.eq('category', currentCategory);
  }

  const { data: newsList } = await query;
  const articles: NewsArticle[] = (newsList as any) || [];

  const categories = [
    { label: 'TÜMÜ', value: 'ALL' },
    { label: 'LİG HABERLERİ', value: 'LİG HABERİ' },
    { label: 'TRANSFER', value: 'TRANSFER' },
    { label: 'TURNUVA', value: 'TURNUVA' },
    { label: 'BİLGİLENDİRME', value: 'BİLGİLENDİRME' },
    { label: 'DUYURU', value: 'DUYURU' },
  ];

  return (
    <div className="min-h-screen bg-[#03070C] text-white py-12 px-4 lg:px-6">
      <div className="max-w-[1400px] mx-auto space-y-10">
        
        {/* Header Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#060d18] via-[#0a1628] to-[#040a14] border border-[#00e5ff]/20 p-8 sm:p-12 shadow-[0_0_50px_rgba(0,229,255,0.08)]">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-[#00e5ff]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00e5ff]/10 border border-[#00e5ff]/20 text-[#00e5ff] text-xs font-black tracking-widest uppercase">
              <Newspaper className="w-3.5 h-3.5" />
              RESMİ BÜLTEN
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tight text-white">
              HABERLER & <span className="text-[#00e5ff] drop-shadow-[0_0_20px_rgba(0,229,255,0.6)]">DUYURULAR</span>
            </h1>
            <p className="text-gray-400 text-sm sm:text-base leading-relaxed font-medium">
              TETA League arenasındaki en güncel lig haberleri, transfer gelişmeleri, haftalık maç analizleri ve turnuva duyuruları.
            </p>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {categories.map((cat) => {
            const isActive = currentCategory === cat.value;
            const href = cat.value === 'ALL' ? '/haberler' : `/haberler?category=${encodeURIComponent(cat.value)}`;
            return (
              <Link
                key={cat.value}
                href={href}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all border ${
                  isActive
                    ? 'bg-[#00e5ff] text-black border-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.4)]'
                    : 'bg-[#060d18] text-gray-400 border-white/5 hover:border-[#00e5ff]/30 hover:text-white'
                }`}
              >
                {cat.label}
              </Link>
            );
          })}
        </div>

        {/* Articles List / Grid */}
        {articles.length === 0 ? (
          <div className="p-16 rounded-3xl bg-[#060d18] border border-white/5 text-center max-w-xl mx-auto space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-[#00e5ff]/10 text-[#00e5ff] flex items-center justify-center mx-auto border border-[#00e5ff]/20">
              <Newspaper className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white uppercase tracking-wide">Henüz Haber Bulunmuyor</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              {currentCategory !== 'ALL'
                ? 'Bu kategoride henüz yayınlanmış bir haber bulunmuyor. Diğer kategorileri inceleyebilirsiniz.'
                : 'Lig duyuruları ve haber bültenleri yayınlandığında burada görüntülenecektir.'}
            </p>
            {currentCategory !== 'ALL' && (
              <Link
                href="/haberler"
                className="inline-block mt-2 px-5 py-2 rounded-xl bg-white/5 text-[#00e5ff] text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-colors"
              >
                Tüm Haberleri Göster
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((item) => (
              <Link
                key={item.id}
                href={`/haberler/${item.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl bg-gradient-to-b from-[#0a1628] to-[#040a14] border border-white/5 hover:border-[#00e5ff]/40 transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,229,255,0.15)] hover:-translate-y-1"
              >
                {/* Image */}
                <div className="relative h-48 w-full overflow-hidden bg-black/60">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0a1628] to-black">
                      <Newspaper className="w-12 h-12 text-[#00e5ff]/30" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <span className="badge-cyan bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/30 backdrop-blur-md font-black tracking-widest text-[10px] px-2.5 py-1 uppercase shadow-[0_0_10px_rgba(0,229,255,0.2)]">
                      {item.category}
                    </span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628] via-transparent to-transparent opacity-90" />
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col flex-1 space-y-3">
                  <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold">
                    <Calendar className="w-3.5 h-3.5 text-[#00e5ff]" />
                    <span>
                      {new Date(item.published_at || item.created_at).toLocaleDateString('tr-TR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-white group-hover:text-[#00e5ff] transition-colors line-clamp-2 leading-snug">
                    {item.title}
                  </h2>

                  {item.summary && (
                    <p className="text-gray-400 text-xs sm:text-sm font-medium line-clamp-3 leading-relaxed flex-1">
                      {item.summary}
                    </p>
                  )}

                  <div className="pt-3 mt-auto border-t border-white/5 flex items-center justify-between text-xs font-bold text-[#00e5ff] group-hover:translate-x-1 transition-transform">
                    <span>Devamını Oku</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

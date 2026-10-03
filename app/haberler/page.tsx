import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Newspaper, Calendar, ArrowRight } from 'lucide-react';
import { NewsArticle } from '@/types/news';
import NewsImage from '@/components/NewsImage';
import NewsContent from '@/components/NewsContent';
import { extractMentionCandidates, getValidMentionUsernames } from '@/utils/mentions';

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

  // Batch fetch valid mention usernames across all articles on the page in 1 single query
  const allTexts = articles.map((a) => `${a.title || ''} ${a.summary || ''}`);
  const mentionCandidates = extractMentionCandidates(allTexts);
  const validUsernames = await getValidMentionUsernames(mentionCandidates, supabase);

  const categories = [
    { label: 'TÜMÜ', value: 'ALL' },
    { label: 'LİG HABERLERİ', value: 'LİG HABERİ' },
    { label: 'TRANSFER', value: 'TRANSFER' },
    { label: 'TURNUVA', value: 'TURNUVA' },
    { label: 'BİLGİLENDİRME', value: 'BİLGİLENDİRME' },
    { label: 'DUYURU', value: 'DUYURU' },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-12 md:py-16">
      
      {/* PAGE HEADER */}
      <div className="mb-10 md:mb-14 text-center fade-in-up flex flex-col items-center">
        <span className="text-[#00e5ff] text-[11px] font-[900] tracking-[0.3em] uppercase bg-[#00e5ff]/10 px-4 py-1.5 rounded-full border border-[#00e5ff]/30 mb-5 glow-cyan-strong shadow-[0_0_20px_rgba(0,229,255,0.2)]">
          RESMİ BÜLTEN
        </span>
        <h1 className="text-[38px] sm:text-[46px] md:text-[60px] font-[900] text-white tracking-widest uppercase mb-4 drop-shadow-[0_0_15px_rgba(0,229,255,0.4)] leading-tight">
          HABERLER & <span className="text-[#00e5ff]">DUYURULAR</span>
        </h1>
        <p className="text-[#a0b0c0] font-medium max-w-2xl mx-auto text-[15px] md:text-[16px] leading-relaxed">
          TETA League ekosistemindeki en güncel lig haberleri, transfer gelişmeleri ve resmi duyurular.
        </p>
      </div>

      {/* CATEGORY TABS */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 mb-10 md:mb-12 fade-in-up" style={{ animationDelay: '0.1s' }}>
        {categories.map((cat) => {
          const isActive = currentCategory === cat.value;
          const href = cat.value === 'ALL' ? '/haberler' : `/haberler?category=${encodeURIComponent(cat.value)}`;
          return (
            <Link
              key={cat.value}
              href={href}
              className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-[800] uppercase tracking-wider whitespace-nowrap transition-all duration-200 border ${
                isActive
                  ? 'bg-[#00e5ff]/15 text-[#00e5ff] border-[#00e5ff]/40 shadow-[0_0_15px_rgba(0,229,255,0.2)] glow-cyan-sm'
                  : 'bg-[#060d18] text-gray-400 border-white/5 hover:border-[#00e5ff]/30 hover:text-white hover:bg-white/[0.02]'
              }`}
            >
              {cat.label}
            </Link>
          );
        })}
      </div>

      {/* ARTICLES LIST / GRID */}
      {articles.length === 0 ? (
        <div className="client-glass max-w-xl mx-auto rounded-3xl p-12 border border-white/5 text-center shadow-[0_0_30px_rgba(0,229,255,0.03)] relative overflow-hidden group my-8 fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="w-16 h-16 rounded-2xl bg-[#00e5ff]/10 text-[#00e5ff] flex items-center justify-center mx-auto border border-[#00e5ff]/20 mb-4 shadow-[0_0_20px_rgba(0,229,255,0.15)]">
            <Newspaper className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white uppercase tracking-wide mb-2">Henüz Haber Bulunmuyor</h3>
          <p className="text-sm text-gray-400 leading-relaxed mb-6">
            {currentCategory !== 'ALL'
              ? 'Bu kategoride henüz yayınlanmış bir haber bulunmuyor. Diğer kategorileri inceleyebilirsiniz.'
              : 'Lig duyuruları ve haber bültenleri yayınlandığında burada görüntülenecektir.'}
          </p>
          {currentCategory !== 'ALL' && (
            <Link
              href="/haberler"
              className="inline-block px-5 py-2.5 rounded-xl bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30 text-xs font-bold uppercase tracking-wider hover:bg-[#00e5ff]/20 transition-all glow-cyan-sm"
            >
              Tüm Haberleri Göster
            </Link>
          )}
        </div>
      ) : (
        <div
          className={`fade-in-up ${
            articles.length === 1
              ? 'max-w-2xl mx-auto'
              : articles.length === 2
              ? 'grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto'
              : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8'
          }`}
          style={{ animationDelay: '0.2s' }}
        >
          {articles.map((item) => (
            <article
              key={item.id}
              className="group flex flex-col overflow-hidden rounded-2xl bg-[#060d18] border border-white/5 hover:border-[#00e5ff]/40 transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,229,255,0.12)] hover:-translate-y-1"
            >
              {/* Image */}
              <Link href={`/haberler/${item.slug}`} className="block relative overflow-hidden">
                <NewsImage
                  src={item.image_url}
                  alt={item.title}
                  category={item.category}
                  variant="card"
                />
              </Link>

              {/* Content */}
              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold mb-3">
                  <Calendar className="w-3.5 h-3.5 text-[#00e5ff]" />
                  <span>
                    {new Date(item.published_at || item.created_at).toLocaleDateString('tr-TR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <h2 className="text-[17px] sm:text-[18px] font-bold text-white leading-snug mb-3">
                  <Link
                    href={`/haberler/${item.slug}`}
                    className="hover:text-[#00e5ff] transition-colors line-clamp-2"
                  >
                    {item.title}
                  </Link>
                </h2>

                {item.summary && (
                  <div className="text-gray-400 text-xs sm:text-sm font-medium line-clamp-3 leading-relaxed mb-5 flex-1">
                    <NewsContent content={item.summary} validUsernames={validUsernames} />
                  </div>
                )}

                <div className="pt-4 mt-auto border-t border-white/5 flex items-center justify-between text-xs font-bold text-[#00e5ff]">
                  <Link
                    href={`/haberler/${item.slug}`}
                    className="inline-flex items-center gap-1.5 hover:underline group-hover:translate-x-1 transition-transform"
                  >
                    <span>Devamını Oku</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

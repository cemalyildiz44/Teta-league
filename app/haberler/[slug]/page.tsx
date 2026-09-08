import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, User, Newspaper, Clock, Share2 } from 'lucide-react';
import type { Metadata } from 'next';

interface NewsDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: NewsDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: news } = await supabase
    .from('news')
    .select('title, summary, image_url')
    .eq('slug', slug)
    .single();

  if (!news) {
    return {
      title: 'Haber Bulunamadı | TETA League',
    };
  }

  return {
    title: `${news.title} | TETA League`,
    description: news.summary || `${news.title} haber detayları`,
    openGraph: {
      title: `${news.title} | TETA League`,
      description: news.summary || '',
      images: news.image_url ? [news.image_url] : [],
    },
  };
}

export const revalidate = 60; // ISR 60s

export default async function NewsDetailPage({ params }: NewsDetailPageProps) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: news } = await supabase
    .from('news')
    .select('*, profiles(username, avatar_url)')
    .eq('slug', slug)
    .single();

  if (!news) {
    notFound();
  }

  // If not published, verify if current user is admin
  if (!news.is_published) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) notFound();

    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['ADMIN', 'SUPER_ADMIN'])
      .eq('is_active', true)
      .maybeSingle();

    if (!adminRole) notFound();
  }

  // Fetch 3 other latest news
  const { data: otherNews } = await supabase
    .from('news')
    .select('id, title, slug, category, published_at, image_url')
    .eq('is_published', true)
    .neq('id', news.id)
    .order('published_at', { ascending: false })
    .limit(3);

  const formattedDate = new Date(news.published_at || news.created_at).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[#03070C] text-white py-10 px-4 lg:px-6">
      <article className="max-w-[1000px] mx-auto space-y-8">
        
        {/* Navigation & Category */}
        <div className="flex items-center justify-between">
          <Link
            href="/haberler"
            className="inline-flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-[#00e5ff] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Tüm Haberlere Dön
          </Link>

          {!news.is_published && (
            <span className="text-xs font-black uppercase tracking-wider px-3 py-1 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              TASLAK (Yalnızca Admin)
            </span>
          )}
        </div>

        {/* Header Content */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="badge-cyan bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/30 backdrop-blur-md font-black tracking-widest text-xs px-3 py-1 uppercase shadow-[0_0_10px_rgba(0,229,255,0.2)]">
              {news.category}
            </span>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold">
              <Calendar className="w-3.5 h-3.5 text-[#00e5ff]" />
              <span>{formattedDate}</span>
            </div>
            {news.profiles?.username && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold">
                <User className="w-3.5 h-3.5 text-[#00e5ff]" />
                <span>{news.profiles.username}</span>
              </div>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight">
            {news.title}
          </h1>

          {news.summary && (
            <p className="text-gray-300 text-base sm:text-lg font-medium leading-relaxed border-l-2 border-[#00e5ff] pl-4 py-1 bg-[#00e5ff]/5 rounded-r-xl">
              {news.summary}
            </p>
          )}
        </div>

        {/* Cover Image */}
        {news.image_url && (
          <div className="relative w-full rounded-2xl overflow-hidden bg-black/60 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] aspect-video max-h-[500px]">
            <img
              src={news.image_url}
              alt={news.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#03070C]/60 via-transparent to-transparent pointer-events-none" />
          </div>
        )}

        {/* Article Body */}
        <div className="bg-[#060d18] border border-white/5 rounded-3xl p-6 sm:p-10 text-gray-300 leading-relaxed space-y-6 text-base sm:text-lg">
          <div className="whitespace-pre-line font-normal text-gray-200">
            {news.content}
          </div>
        </div>

        {/* Footer info & Other News */}
        {otherNews && otherNews.length > 0 && (
          <div className="pt-12 border-t border-white/5 space-y-6">
            <h3 className="text-xl font-black uppercase tracking-wider text-white">
              DİĞER <span className="text-[#00e5ff]">HABERLER</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {otherNews.map((item) => (
                <Link
                  key={item.id}
                  href={`/haberler/${item.slug}`}
                  className="group block p-4 rounded-xl bg-[#0a1628] border border-white/5 hover:border-[#00e5ff]/40 transition-all"
                >
                  {item.image_url && (
                    <div className="w-full h-28 rounded-lg overflow-hidden mb-3 bg-black/50">
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  )}
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#00e5ff]">
                    {item.category}
                  </span>
                  <h4 className="text-sm font-bold text-white group-hover:text-[#00e5ff] transition-colors line-clamp-2 mt-1">
                    {item.title}
                  </h4>
                </Link>
              ))}
            </div>
          </div>
        )}

      </article>
    </div>
  );
}

import { Sk, SkCard, SkHero, SkeletonPage } from '@/components/skeleton/Skeleton';

export default function Loading() {
  return (
    <SkeletonPage label="Haberler" className="mx-auto max-w-[1400px] px-4 lg:px-6 py-12 md:py-16">
      <SkHero
        badge="RESMİ BÜLTEN"
        title={<>HABERLER & <span className="text-[#00e5ff]">DUYURULAR</span></>}
        subtitle="TETA League ekosistemindeki en güncel lig haberleri, transfer gelişmeleri ve resmi duyurular."
      />
      <div className="animate-pulse" aria-hidden="true">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 mb-10 md:mb-12">
          {[72, 96, 88, 104, 80].map((w, i) => (
            <div key={i} className="h-9 rounded-xl border border-white/10 bg-white/[0.04]" style={{ width: w }} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {Array.from({ length: 6 }, (_, i) => (
            <SkCard key={i} className="overflow-hidden">
              <Sk className="aspect-video rounded-none" />
              <div className="p-5 space-y-3">
                <Sk className="h-3 w-24" />
                <Sk className="h-5 w-full" />
                <Sk className="h-5 w-3/4" />
                <Sk className="h-3 w-full opacity-70" />
                <Sk className="h-3 w-2/3 opacity-70" />
              </div>
            </SkCard>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}

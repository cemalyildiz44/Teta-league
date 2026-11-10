import { Sk, SkCard, SkHero, SkeletonPage } from '@/components/skeleton/Skeleton';

export default function Loading() {
  return (
    <SkeletonPage label="Turnuvalar" className="mx-auto max-w-[1400px] px-4 lg:px-6 py-12 md:py-16">
      <SkHero
        badge="TETA League Tournament Hub"
        title="TURNUVALAR"
        subtitle="TETA League'in en prestijli turnuvalarını ve efsaneleşmiş kazananlarını keşfet."
      />
      <div className="animate-pulse" aria-hidden="true">
        <div className="flex items-center justify-center gap-8 mb-10 pb-4 border-b border-white/10">
          <Sk className="h-4 w-28 bg-[#00e5ff]/20" />
          <Sk className="h-4 w-14" />
          <Sk className="h-4 w-20" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {Array.from({ length: 2 }, (_, i) => (
            <SkCard key={i} className="rounded-3xl p-6 md:p-8">
              <div className="flex items-start gap-5 mb-6">
                <Sk className="w-20 h-20 md:w-24 md:h-24 rounded-2xl shrink-0" />
                <div className="flex-1 space-y-3 pt-1">
                  <Sk className="h-6 w-40 bg-[#00e5ff]/10" />
                  <Sk className="h-5 w-32" />
                  <Sk className="h-6 w-28" />
                </div>
              </div>
              <Sk className="h-4 w-3/4 mb-6" />
              <div className="border-t border-white/5 pt-5 space-y-3">
                <Sk className="h-3 w-40" />
                <Sk className="h-20 w-full rounded-2xl" />
              </div>
            </SkCard>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}

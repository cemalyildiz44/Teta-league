import { Sk, SkCard, SkeletonPage } from '@/components/skeleton/Skeleton';

function TeamSide() {
  return (
    <div className="flex flex-col items-center gap-3 w-28 md:w-48">
      <Sk className="w-20 h-20 md:w-32 md:h-32 rounded-full" />
      <Sk className="h-5 w-24 md:w-36" />
    </div>
  );
}

export default function Loading() {
  return (
    <SkeletonPage label="Maç detayı" className="min-h-screen bg-[#01060b] pt-8 pb-20">
      <div className="max-w-[1200px] mx-auto px-4 lg:px-6 animate-pulse" aria-hidden="true">
        <div className="flex items-center gap-3 mb-8">
          <Sk className="h-3 w-14" />
          <Sk className="h-3 w-20" />
          <Sk className="h-3 w-16" />
        </div>

        {/* scoreboard */}
        <section className="bg-[#03070c] border border-white/5 rounded-3xl p-6 md:p-10 lg:p-12 mb-8">
          <div className="flex flex-col items-center gap-3 mb-8 md:mb-12">
            <Sk className="h-3 w-40" />
            <Sk className="h-3 w-28 opacity-70" />
          </div>
          <div className="flex items-center justify-between md:justify-center md:gap-16">
            <TeamSide />
            <Sk className="h-14 md:h-20 w-24 md:w-40 bg-[#00e5ff]/10 rounded-xl" />
            <TeamSide />
          </div>
        </section>

        {/* player stats per team */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 2 }, (_, t) => (
            <SkCard key={t} className="rounded-2xl divide-y divide-white/5">
              <div className="p-4">
                <Sk className="h-4 w-32" />
              </div>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <Sk className="w-8 h-8 rounded-full shrink-0" />
                  <Sk className="h-4 flex-1 max-w-[180px]" />
                  <Sk className="h-4 w-8 ml-auto" />
                  <Sk className="h-4 w-8" />
                </div>
              ))}
            </SkCard>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}

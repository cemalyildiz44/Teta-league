import { Sk, SkeletonPage } from '@/components/skeleton/Skeleton';

const panel = 'bg-[#03070c] border border-white/5 rounded-2xl';

export default function Loading() {
  return (
    <SkeletonPage label="Oyuncu profili" className="min-h-screen bg-[#01060b] pt-8 pb-20">
      <div className="max-w-[1200px] mx-auto px-4 lg:px-6 animate-pulse" aria-hidden="true">
        {/* profile card + side panels, same grid as the page */}
        <section className="mb-6 grid grid-cols-1 md:grid-cols-[1fr_250px] lg:grid-cols-[1fr_220px_280px] xl:grid-cols-[1fr_260px_320px] gap-4 md:gap-6 items-stretch">
          <div className={`${panel} p-6 lg:p-8`}>
            <div className="flex gap-4 md:gap-6 items-start">
              <Sk className="w-24 h-24 md:w-28 md:h-28 rounded-2xl shrink-0" />
              <div className="flex-1 space-y-3 pt-1">
                <Sk className="h-8 w-48 max-w-full" />
                <Sk className="h-4 w-32" />
                <div className="flex gap-2 pt-1">
                  <Sk className="h-6 w-14 rounded-md bg-[#00e5ff]/10" />
                  <Sk className="h-6 w-14 rounded-md" />
                  <Sk className="h-6 w-14 rounded-md" />
                </div>
              </div>
            </div>
          </div>
          <div className={`${panel} p-6 flex flex-col items-center justify-center gap-3`}>
            <Sk className="w-20 h-20 rounded-full" />
            <Sk className="h-4 w-28" />
            <Sk className="h-3 w-16 opacity-70" />
          </div>
          <div className={`${panel} p-6 hidden lg:flex flex-col justify-center gap-3`}>
            <Sk className="h-3 w-24" />
            <Sk className="h-10 w-40 bg-[#00e5ff]/10" />
            <Sk className="h-3 w-32 opacity-70" />
          </div>
        </section>

        {/* stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={`${panel} p-5 space-y-3`}>
              <Sk className="h-3 w-20" />
              <Sk className="h-8 w-14" />
            </div>
          ))}
        </div>

        {/* tabs + table */}
        <div className="flex gap-6 border-b border-white/10 pb-3 mb-6">
          <Sk className="h-4 w-24 bg-[#00e5ff]/20" />
          <Sk className="h-4 w-20" />
          <Sk className="h-4 w-24" />
        </div>
        <div className={`${panel} divide-y divide-white/5`}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Sk className="w-9 h-9 rounded-full shrink-0" />
              <Sk className="h-4 flex-1 max-w-[240px]" />
              <Sk className="h-4 w-10 ml-auto" />
              <Sk className="h-4 w-10" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}

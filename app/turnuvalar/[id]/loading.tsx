import { Sk, SkCard, SkeletonPage } from '@/components/skeleton/Skeleton';

export default function Loading() {
  return (
    <SkeletonPage label="Turnuva" className="w-full pb-20">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 pt-6 pb-4 animate-pulse" aria-hidden="true">
        <div className="flex items-center gap-3 mb-6">
          <Sk className="h-8 w-28 rounded-xl" />
          <Sk className="h-3 w-24" />
        </div>
        <SkCard className="rounded-3xl p-6 md:p-10 mb-8">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <Sk className="w-28 h-28 md:w-36 md:h-36 rounded-2xl shrink-0" />
            <div className="flex-1 w-full space-y-4 flex flex-col items-center md:items-start">
              <Sk className="h-6 w-44 bg-[#00e5ff]/10" />
              <Sk className="h-10 w-64 max-w-full" />
              <Sk className="h-4 w-80 max-w-full opacity-70" />
              <div className="flex gap-3 pt-2">
                <Sk className="h-10 w-32 rounded-xl" />
                <Sk className="h-10 w-32 rounded-xl" />
              </div>
            </div>
          </div>
        </SkCard>
        <div className="flex gap-6 border-b border-white/10 pb-3 mb-8 overflow-hidden">
          {[96, 80, 88, 72].map((w, i) => (
            <div key={i} className="shrink-0" style={{ width: w }}>
              <Sk className={`h-4 ${i === 0 ? 'bg-[#00e5ff]/20' : ''}`} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }, (_, i) => (
            <SkCard key={i} className="p-5 space-y-4">
              <Sk className="h-3 w-24" />
              <div className="flex items-center justify-between">
                <Sk className="h-10 w-10 rounded-full" />
                <Sk className="h-6 w-16" />
                <Sk className="h-10 w-10 rounded-full" />
              </div>
              <Sk className="h-3 w-2/3 mx-auto opacity-70" />
            </SkCard>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}

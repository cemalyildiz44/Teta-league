import { Sk, SkeletonPage } from '@/components/skeleton/Skeleton';

export default function Loading() {
  return (
    <SkeletonPage label="Haber" className="min-h-screen bg-[#03070C] text-white py-10 px-4 lg:px-6">
      <div className="max-w-[1000px] mx-auto space-y-8 animate-pulse" aria-hidden="true">
        <Sk className="h-4 w-36" />
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Sk className="h-6 w-24 bg-[#00e5ff]/15" />
            <Sk className="h-3 w-28" />
            <Sk className="h-3 w-20" />
          </div>
          <Sk className="h-9 md:h-12 w-full" />
          <Sk className="h-9 md:h-12 w-2/3" />
          <Sk className="h-4 w-5/6 opacity-70" />
        </div>
        <Sk className="aspect-video w-full rounded-2xl" />
        <div className="space-y-3">
          {['w-full', 'w-full', 'w-11/12', 'w-full', 'w-4/5', 'w-full', 'w-2/3'].map((w, i) => (
            <Sk key={i} className={`h-4 ${w}`} />
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}

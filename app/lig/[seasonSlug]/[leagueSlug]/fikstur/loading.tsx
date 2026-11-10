import { Sk, SkCard, SkeletonPage } from '@/components/skeleton/Skeleton';

// Renders inside the league layout (LİG MERKEZİ header and tabs stay on screen); only the fixture list loads.
export default function Loading() {
  return (
    <SkeletonPage label="Fikstür">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-[28px] font-[900] text-white tracking-widest">
          FİKSTÜR <span className="text-[#00e5ff]">& SONUÇLAR</span>
        </h2>
        <div className="h-px flex-1 bg-gradient-to-r from-[#00e5ff]/20 to-transparent" />
      </div>
      <div className="animate-pulse" aria-hidden="true">
        <div className="flex gap-2 mb-6 overflow-hidden">
          {Array.from({ length: 8 }, (_, i) => (
            <Sk key={i} className={`h-9 w-14 shrink-0 rounded-lg ${i === 0 ? 'bg-[#00e5ff]/15' : ''}`} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <SkCard key={i} className="rounded-2xl p-5 space-y-4">
              <div className="flex justify-between">
                <Sk className="h-3 w-24" />
                <Sk className="h-3 w-12" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1">
                  <Sk className="w-9 h-9 rounded-full shrink-0" />
                  <Sk className="h-4 w-24" />
                </div>
                <Sk className="h-6 w-12" />
                <div className="flex items-center gap-3 flex-1 justify-end">
                  <Sk className="h-4 w-24" />
                  <Sk className="w-9 h-9 rounded-full shrink-0" />
                </div>
              </div>
            </SkCard>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}

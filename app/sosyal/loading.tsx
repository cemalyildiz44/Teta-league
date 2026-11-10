// Loading state for /sosyal. Mirrors the real page layout (header, status bar, left menu, post form + feed,
// right widgets) so content settles into place instead of replacing a generic list. The static header text is
// rendered as-is; only data-driven parts are placeholders.

const card = 'client-glass rounded-xl border border-white/5 bg-[#01060b]';
const bar = 'rounded bg-white/[0.06]';

function PostCardSkeleton({ lines }: { lines: number }) {
  return (
    <div className={`${card} p-5 md:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.3)]`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/[0.06] border border-white/10 shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <div className={`h-3.5 w-32 ${bar}`} />
          <div className={`h-2.5 w-20 ${bar} opacity-70`} />
        </div>
      </div>
      <div className="space-y-2.5 mb-5">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={`h-3 ${bar} ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
        ))}
      </div>
      <div className="flex items-center gap-6 pt-4 border-t border-white/5">
        <div className={`h-3 w-12 ${bar}`} />
        <div className={`h-3 w-12 ${bar}`} />
      </div>
    </div>
  );
}

function WidgetSkeleton({ rows }: { rows: number }) {
  return (
    <div className={`${card} p-5`}>
      <div className={`h-2.5 w-28 mb-5 ${bar}`} />
      <div className="space-y-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/[0.06] shrink-0" />
            <div className="flex flex-col gap-1.5 flex-1">
              <div className={`h-3 w-24 ${bar}`} />
              <div className={`h-2 w-16 ${bar} opacity-70`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-8 md:py-12" role="status" aria-live="polite">
      <span className="sr-only">Sosyal akış yükleniyor…</span>

      {/* HEADER (static text, same as the page) */}
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="text-[10px] font-[900] tracking-[0.3em] text-[#00e5ff] uppercase mb-4 px-3 py-1 bg-[#00e5ff]/10 border border-[#00e5ff]/20 rounded-full shadow-[0_0_15px_rgba(0,229,255,0.15)]">
          COMMUNITY HUB
        </span>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-[900] text-white tracking-tighter uppercase mb-4 drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
          TETA <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00e5ff] to-[#00aaff] drop-shadow-[0_0_12px_rgba(0,229,255,0.4)]">NETWORK</span>
        </h1>
        <p className="text-gray-400 text-[15px] md:text-[16px] font-[500] tracking-wide max-w-lg px-4">
          TETA League topluluğunun buluşma noktası.
        </p>
      </div>

      <div className="animate-pulse" aria-hidden="true">
        {/* NETWORK STATUS BAR */}
        <div className="mb-10 flex justify-center">
          <div className="h-[42px] w-full max-w-[400px] bg-[#01060b] border border-white/5 rounded-2xl" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* LEFT SIDEBAR */}
          <div className="hidden lg:block lg:col-span-3 space-y-4">
            <div className={`${card} p-4 space-y-1`}>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-white/[0.06] shrink-0" />
                  <div className={`h-3 w-24 ${bar}`} />
                </div>
              ))}
            </div>
            <WidgetSkeleton rows={2} />
          </div>

          {/* FEED */}
          <div className="col-span-1 lg:col-span-6 min-w-0 flex flex-col gap-6">
            {/* mobile menu pills (the left sidebar is hidden below lg) */}
            <div className="flex lg:hidden gap-2 overflow-hidden">
              {[96, 88, 96, 88].map((w, i) => (
                <div key={i} className="h-9 shrink-0 rounded-full bg-white/5 border border-white/10" style={{ width: w }} />
              ))}
            </div>
            {/* search bar + post form (taller when signed in, a one-line prompt when signed out) */}
            <div className={`${card} h-12 flex items-center gap-3 px-4`}>
              <div className="w-4 h-4 rounded-full bg-white/[0.08] shrink-0" />
              <div className={`h-3 w-48 ${bar}`} />
            </div>
            <div className={`${card} p-5 md:p-6 h-[96px]`} />
            <div className="flex items-center gap-6 border-b border-white/10 pb-3 px-2">
              <div className="h-3 w-28 rounded bg-[#00e5ff]/20" />
              <div className={`h-3 w-16 ${bar}`} />
              <div className={`h-3 w-20 ${bar}`} />
            </div>
            <PostCardSkeleton lines={3} />
            <PostCardSkeleton lines={2} />
            <PostCardSkeleton lines={4} />
          </div>

          {/* RIGHT SIDEBAR */}
          <div className="col-span-1 lg:col-span-3 space-y-4">
            <div className={`${card} p-5 h-[150px]`} />
            <WidgetSkeleton rows={3} />
            <WidgetSkeleton rows={5} />
          </div>
        </div>
      </div>
    </div>
  );
}

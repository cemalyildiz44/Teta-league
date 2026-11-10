// Loading placeholder for list pages (used by their loading.tsx). Only add loading.tsx to segments without nested
// dynamic routes that call notFound(): a streamed response is sent with status 200, so those 404s would become 200s.
export default function PageSkeleton({ label, rows = 8 }: { label: string; rows?: number }) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-12 md:py-16" role="status" aria-live="polite">
      <span className="sr-only">{label} yükleniyor…</span>
      <div className="mb-10 md:mb-14 flex flex-col items-center gap-4 animate-pulse" aria-hidden="true">
        <div className="h-6 w-32 rounded-full bg-[#00e5ff]/10 border border-[#00e5ff]/20" />
        <div className="h-12 md:h-14 w-72 md:w-[28rem] max-w-full rounded-xl bg-white/[0.06]" />
        <div className="h-4 w-80 max-w-full rounded bg-white/[0.04]" />
      </div>
      <div className="space-y-3 animate-pulse" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-16 rounded-xl border border-white/5 bg-white/[0.03]" />
        ))}
      </div>
    </div>
  );
}

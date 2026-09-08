export default function LiveStream() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-[900] tracking-wide text-white flex items-center gap-2 uppercase">
          <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" style={{ boxShadow: '0 0 10px #00e5ff' }} />
          CANLI AKIŞ
        </h2>
      </div>
      
      <a 
        href="https://kick.com/tetaleague" 
        target="_blank" 
        rel="noopener noreferrer"
        className="block client-glass rounded-xl overflow-hidden border border-white/5 relative aspect-video group cursor-pointer bg-[#01060b] shadow-[0_0_15px_rgba(0,229,255,0.02)] transition-shadow hover:shadow-[0_0_25px_rgba(0,229,255,0.08)]"
      >
        {/* Background Base - Matching site-wide glassmorphism dark navy */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#00e5ff]/[0.02] to-[#01060b] z-0" />
        
        {/* Radial Light - Cyan ambient glow */}
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(0,229,255,0.08)_0%,rgba(0,0,0,0)_70%)]" />

        {/* Soft Vignette Overlay */}
        <div className="absolute inset-0 shadow-[inset_0_0_60px_rgba(0,0,0,0.5)] pointer-events-none z-10" />

        {/* Big TETA Logo Watermark */}
        <div className="absolute inset-0 flex items-center justify-center z-0 opacity-[0.12] pointer-events-none mix-blend-screen">
          <img 
            src="/logo.jpg" 
            alt="" 
            className="w-40 h-40 md:w-56 md:h-56 rounded-full blur-[1px] transition-transform duration-700 group-hover:scale-105" 
          />
        </div>

        {/* Center Content: Typographic Focus & Play Button */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 p-4">
          
          {/* Typography */}
          <div className="flex flex-col items-center text-center transform transition-transform duration-500 group-hover:-translate-y-1.5">
            <span className="text-[10px] md:text-xs font-[900] tracking-[0.3em] text-[#00e5ff] uppercase mb-1 drop-shadow-[0_0_10px_rgba(0,229,255,0.5)]">
              TETA LEAGUE
            </span>
            <span className="text-xl md:text-3xl font-[900] text-white tracking-widest uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              LİVE STREAM
            </span>
          </div>

          {/* Premium Glass Play Button */}
          <div className="mt-6 w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#00e5ff]/15 border border-[#00e5ff]/30 backdrop-blur-md flex items-center justify-center pl-1 group-hover:bg-[#00e5ff]/25 group-hover:border-[#00e5ff]/50 group-hover:shadow-[0_0_25px_rgba(0,229,255,0.4)] transition-all duration-300 transform group-hover:scale-110">
            <svg className="w-5 h-5 md:w-6 md:h-6 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          
        </div>

        {/* Bottom Corner Badge */}
        <div className="absolute bottom-4 left-4 z-20">
          <span className="px-2.5 py-1.5 bg-[#01060b]/80 backdrop-blur-md rounded border border-white/5 text-[9px] md:text-[10px] font-bold text-gray-400 tracking-widest uppercase flex items-center gap-2 transition-colors group-hover:text-gray-200 group-hover:border-white/15">
            <span className="w-1.5 h-1.5 rounded-full bg-[#53FC18] shadow-[0_0_8px_rgba(83,252,24,0.5)]"></span>
            KICK.COM/TETALEAGUE
          </span>
        </div>
      </a>
    </div>
  );
}

import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative w-full overflow-hidden bg-[#01060b] min-h-[60vh] lg:min-h-[70vh] flex items-center justify-center border-b border-white/5 pt-20 pb-16 lg:py-0">
      
      {/* Background Effects */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Subtle Grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:30px_30px] md:bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_100%)]"></div>
        
        {/* Soft, understated centralized radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] lg:w-[700px] lg:h-[700px] bg-[#00e5ff]/5 rounded-full blur-[100px] lg:blur-[150px]"></div>

        {/* Bottom fade out to seamlessly merge with the content below */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#01060b] to-transparent"></div>
      </div>

      {/* Main Content Container (Centered) */}
      <div className="relative z-10 mx-auto max-w-4xl w-full px-4 lg:px-6 flex flex-col items-center text-center">
        
        <span className="text-[#00e5ff] font-extrabold tracking-[0.3em] text-[11px] md:text-xs uppercase mb-6 md:mb-8 block drop-shadow-md">
          TETA LEAGUE
        </span>

        <h1 className="text-[38px] sm:text-5xl md:text-6xl lg:text-[76px] font-black text-white leading-[1.05] uppercase tracking-tight mb-6 md:mb-8 drop-shadow-xl flex flex-col items-center">
          <span className="block">REKABETİN <span className="text-[#00e5ff] drop-shadow-[0_0_15px_rgba(0,229,255,0.4)]">MERKEZİ</span></span>
          <span className="block">TETA LEAGUE.</span>
        </h1>

        <p className="text-gray-400 text-[15px] sm:text-base lg:text-lg max-w-2xl font-medium tracking-wide mb-10 md:mb-12 px-2">
          Takımını kur, liglere kat ve rekabetin bir parçası ol.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto px-4 sm:px-0">
          <Link 
            href="/takim/yonet"
            className="w-full sm:w-auto px-10 py-4 lg:py-5 bg-[#00e5ff] text-black font-black text-[13px] lg:text-[14px] tracking-[0.2em] uppercase rounded-xl hover:bg-white transition-all duration-300 shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:shadow-[0_0_35px_rgba(0,229,255,0.6)] hover:scale-[1.02] active:scale-95 flex items-center justify-center"
          >
            TAKIMINI OLUŞTUR
          </Link>
          
          <Link 
            href="/ligler"
            className="w-full sm:w-auto px-10 py-4 lg:py-5 bg-white/5 backdrop-blur-md border border-white/10 text-white font-black text-[13px] lg:text-[14px] tracking-[0.2em] uppercase rounded-xl hover:bg-white/10 hover:border-[#00e5ff]/50 hover:text-[#00e5ff] transition-all duration-300 shadow-lg hover:shadow-[0_0_20px_rgba(0,229,255,0.15)] hover:scale-[1.02] active:scale-95 flex items-center justify-center"
          >
            LİGLERİ KEŞFET
          </Link>
        </div>

      </div>

    </section>
  );
}

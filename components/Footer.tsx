import Link from 'next/link';
import Image from 'next/image';
import { footerLinks } from '@/lib/mock-data';

export default function Footer() {
  return (
    <footer className="border-t border-cyan-500/10 bg-[#040a14]">
      <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand & Social */}
          <div className="space-y-6">
            <div className="space-y-4">
              <Link href="/" className="flex items-center gap-3">
                <Image src="/logo.jpg" alt="Teta League" width={32} height={32} className="rounded" />
                <span className="text-sm font-black tracking-widest text-white">
                  TETA<span className="text-[#00e5ff]"> LEAGUE</span>
                </span>
              </Link>
              <p className="text-sm text-gray-500 leading-relaxed">
                EA FC Pro Clubs rekabetinin adresi. Türkiye&apos;nin en profesyonel esports lig platformu.
              </p>
            </div>
            
            {/* Social Links */}
            <div className="flex items-center gap-4">
              <a 
                href="https://kick.com/tetaleague" 
                target="_blank" 
                rel="noopener noreferrer"
                aria-label="Kick"
                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#53FC18]/20 transition-all group"
              >
                <img 
                  src="/kick-logo.png" 
                  alt="Kick" 
                  className="w-[16px] h-[16px] object-contain opacity-70 group-hover:opacity-100 group-hover:drop-shadow-[0_0_8px_rgba(83,252,24,0.6)] transition-all" 
                />
              </a>
              <a 
                href="https://www.instagram.com/teta.league/" 
                target="_blank" 
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#E1306C]/20 hover:text-[#E1306C] transition-colors text-gray-400"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
                </svg>
              </a>
              <a 
                href="https://discord.gg/Cd9b4jpcAZ" 
                target="_blank" 
                rel="noopener noreferrer"
                aria-label="Discord"
                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#5865F2]/20 hover:text-[#5865F2] transition-colors text-gray-400"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M19.73 4.87a18.2 18.2 0 00-4.6-1.44c-.21.38-.44.88-.6 1.28a16.69 16.69 0 00-5.06 0c-.16-.4-.4-.9-.6-1.28a18.2 18.2 0 00-4.6 1.44A18.52 18.52 0 001.3 16.7a18.3 18.3 0 005.61 2.85 13.06 13.06 0 001.2-1.95 12.3 12.3 0 01-1.93-.94 9 9 0 00.36-.28c3.84 1.76 8 1.76 11.83 0a9 9 0 00.36.28 12.3 12.3 0 01-1.93.94c.36.69.76 1.34 1.2 1.95a18.3 18.3 0 005.61-2.85 18.66 18.66 0 00-4.27-11.82zM8.5 13.91c-1.12 0-2.04-1.04-2.04-2.3 0-1.27.9-2.3 2.04-2.3 1.15 0 2.06 1.04 2.04 2.3 0 1.26-.9 2.3-2.04 2.3zm7 0c-1.12 0-2.04-1.04-2.04-2.3 0-1.27.9-2.3 2.04-2.3 1.15 0 2.06 1.04 2.04 2.3 0 1.26-.9 2.3-2.04 2.3z" clipRule="evenodd" />
                </svg>
              </a>
            </div>
          </div>

          {/* Platform */}
          <div>
            <h4 className="text-[13px] font-[700] tracking-widest text-gray-400 uppercase mb-4">Platform</h4>
            <ul className="space-y-2.5">
              {footerLinks.platform.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-500 hover:text-[#00e5ff] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* About */}
          <div>
            <h4 className="text-[13px] font-[700] tracking-widest text-gray-400 uppercase mb-4">Hakkımızda</h4>
            <ul className="space-y-2.5">
              {footerLinks.about.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-500 hover:text-[#00e5ff] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-[13px] font-[700] tracking-widest text-gray-400 uppercase mb-4">Yasal</h4>
            <ul className="space-y-2.5">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-500 hover:text-[#00e5ff] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-10 pt-6 border-t border-white/5 text-center">
          <p className="text-xs text-gray-600">© 2026 Teta League. Tüm hakları saklıdır.</p>
        </div>
      </div>
    </footer>
  );
}

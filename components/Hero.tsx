"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

// Safe pitch spawn points (away from goal mouths, pitch lines, and central CTA text)
const SAFE_SPAWN_POINTS = [
  { x: 500, y: 250 }, // Center spot
  { x: 350, y: 140 }, // Left upper midfield
  { x: 650, y: 140 }, // Right upper midfield
  { x: 320, y: 340 }, // Left lower midfield
  { x: 680, y: 340 }, // Right lower midfield
  { x: 430, y: 190 }, // Center-left attacking zone
  { x: 570, y: 190 }, // Center-right attacking zone
];

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const goalBadgeRef = useRef<HTMLDivElement>(null);
  const goalFlashRef = useRef<HTMLDivElement>(null);

  // Physics state stored in refs to avoid React re-renders during 60fps animation
  const ballPosRef = useRef({ x: 500, y: 250 });
  const velocityRef = useRef({ vx: 0, vy: 0 });
  const rotationRef = useRef(0);
  const trailPosRef = useRef({ x: 500, y: 250 });
  const bounceFlashRef = useRef(0);
  const isInteractiveRef = useRef(false);

  // Goal sequence state
  const isGoalActiveRef = useRef(false);
  const goalStartTimeRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isPointerFine = window.matchMedia("(pointer: fine)").matches;

    // Mobile / touch or reduced-motion: keep pitch static without ball physics
    if (prefersReducedMotion || !isPointerFine) {
      isInteractiveRef.current = false;
      return;
    }

    isInteractiveRef.current = true;

    // Start ball at center spot
    ballPosRef.current = { x: 500, y: 250 };
    trailPosRef.current = { x: 500, y: 250 };

    let animationFrameId: number;

    const animate = () => {
      const heroEl = sectionRef.current;
      const svg = svgRef.current;

      if (!heroEl || !svg) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      const ctm = svg.getScreenCTM();
      if (!ctm) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      const heroRect = heroEl.getBoundingClientRect();

      // Pitch boundaries in SVG viewBox coordinate space (0..1000, 0..500)
      const RADIUS = 14;
      const PITCH_TOP = 15;
      const PITCH_BOTTOM = 485;
      const PITCH_LEFT = 50;
      const PITCH_RIGHT = 950;
      const GOAL_TOP = 195;
      const GOAL_BOTTOM = 305;
      const NET_LEFT = 18;
      const NET_RIGHT = 982;

      let { x, y } = ballPosRef.current;
      let { vx, vy } = velocityRef.current;

      const now = performance.now();

      // Handle Goal Sequence Lifecycle (total duration ~650ms)
      if (isGoalActiveRef.current) {
        const elapsed = now - goalStartTimeRef.current;

        // Stage 1 (0..350ms): Ball dampens and fades/scales down in net
        if (elapsed < 350) {
          vx *= 0.7;
          vy *= 0.7;
          x += vx;
          y += vy;

          const progress = elapsed / 350;
          const ballScale = Math.max(0.2, 1 - progress * 0.8);
          const ballOpacity = Math.max(0, 1 - progress);

          const pixelX = ctm.a * x + ctm.e - heroRect.left;
          const pixelY = ctm.d * y + ctm.f - heroRect.top;

          if (ballRef.current) {
            ballRef.current.style.transform = `translate3d(${pixelX - 16}px, ${pixelY - 16}px, 0) scale(${ballScale})`;
            ballRef.current.style.opacity = ballOpacity.toFixed(2);
          }
        } 
        // Stage 2 (350..450ms): Respawn at safe point (invisible)
        else if (elapsed < 450) {
          if (vx !== 0 || vy !== 0) {
            vx = 0;
            vy = 0;
            // Pick a safe spawn point
            const safePoint = SAFE_SPAWN_POINTS[Math.floor(Math.random() * SAFE_SPAWN_POINTS.length)];
            x = safePoint.x;
            y = safePoint.y;
            ballPosRef.current = { x, y };
            trailPosRef.current = { x, y };
          }
          if (ballRef.current) {
            ballRef.current.style.opacity = "0";
          }
        } 
        // Stage 3 (450..650ms): Fade & scale in at new safe position
        else if (elapsed < 650) {
          const inProgress = (elapsed - 450) / 200;
          const ballScale = 0.5 + inProgress * 0.5;
          const ballOpacity = inProgress;

          const pixelX = ctm.a * x + ctm.e - heroRect.left;
          const pixelY = ctm.d * y + ctm.f - heroRect.top;

          if (ballRef.current) {
            ballRef.current.style.transform = `translate3d(${pixelX - 16}px, ${pixelY - 16}px, 0) scale(${ballScale})`;
            ballRef.current.style.opacity = ballOpacity.toFixed(2);
          }
        } 
        // Sequence Complete
        else {
          isGoalActiveRef.current = false;
          if (goalBadgeRef.current) {
            goalBadgeRef.current.style.opacity = "0";
            goalBadgeRef.current.style.transform = "translate3d(-50%, -10px, 0) scale(0.95)";
          }
          if (goalFlashRef.current) {
            goalFlashRef.current.style.opacity = "0";
          }
        }

        ballPosRef.current = { x, y };
        velocityRef.current = { vx, vy };
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      // Normal Pitch Physics Update
      if (Math.abs(vx) > 0.001 || Math.abs(vy) > 0.001) {
        x += vx;
        y += vy;

        let bounced = false;
        const restitution = 0.72; // Energy retained on collision

        // 1. Top & Bottom pitch line collision
        if (y - RADIUS <= PITCH_TOP) {
          y = PITCH_TOP + RADIUS;
          vy = -vy * restitution;
          bounced = true;
        } else if (y + RADIUS >= PITCH_BOTTOM) {
          y = PITCH_BOTTOM - RADIUS;
          vy = -vy * restitution;
          bounced = true;
        }

        // 2. Left side collision / Goal Mouth
        const inLeftGoalMouthY = y >= GOAL_TOP && y <= GOAL_BOTTOM;
        if (!inLeftGoalMouthY) {
          // Solid left goal line
          if (x - RADIUS <= PITCH_LEFT) {
            x = PITCH_LEFT + RADIUS;
            vx = -vx * restitution;
            bounced = true;
          }
        } else {
          // Open goal mouth -> enters left net!
          if (x < PITCH_LEFT) {
            // Check back of left net
            if (x - RADIUS <= NET_LEFT) {
              x = NET_LEFT + RADIUS;
              vx = -vx * 0.3;
            }
            // Trigger Goal Event!
            if (!isGoalActiveRef.current) {
              isGoalActiveRef.current = true;
              goalStartTimeRef.current = performance.now();
              if (goalBadgeRef.current) {
                goalBadgeRef.current.style.opacity = "1";
                goalBadgeRef.current.style.transform = "translate3d(-50%, 0, 0) scale(1)";
              }
              if (goalFlashRef.current) {
                goalFlashRef.current.style.opacity = "1";
                setTimeout(() => {
                  if (goalFlashRef.current) goalFlashRef.current.style.opacity = "0";
                }, 300);
              }
            }
          }
        }

        // 3. Right side collision / Goal Mouth
        const inRightGoalMouthY = y >= GOAL_TOP && y <= GOAL_BOTTOM;
        if (!inRightGoalMouthY) {
          // Solid right goal line
          if (x + RADIUS >= PITCH_RIGHT) {
            x = PITCH_RIGHT - RADIUS;
            vx = -vx * restitution;
            bounced = true;
          }
        } else {
          // Open goal mouth -> enters right net!
          if (x > PITCH_RIGHT) {
            // Check back of right net
            if (x + RADIUS >= NET_RIGHT) {
              x = NET_RIGHT - RADIUS;
              vx = -vx * 0.3;
            }
            // Trigger Goal Event!
            if (!isGoalActiveRef.current) {
              isGoalActiveRef.current = true;
              goalStartTimeRef.current = performance.now();
              if (goalBadgeRef.current) {
                goalBadgeRef.current.style.opacity = "1";
                goalBadgeRef.current.style.transform = "translate3d(-50%, 0, 0) scale(1)";
              }
              if (goalFlashRef.current) {
                goalFlashRef.current.style.opacity = "1";
                setTimeout(() => {
                  if (goalFlashRef.current) goalFlashRef.current.style.opacity = "0";
                }, 300);
              }
            }
          }
        }

        if (bounced) {
          bounceFlashRef.current = 1;
        }

        // Natural grass friction deceleration
        const friction = 0.985;
        vx *= friction;
        vy *= friction;

        const speed = Math.hypot(vx, vy);

        if (speed < 0.08) {
          vx = 0;
          vy = 0;
        } else {
          rotationRef.current += (vx >= 0 ? 1 : -1) * (speed * 1.2);
        }

        ballPosRef.current = { x, y };
        velocityRef.current = { vx, vy };

        // Decay bounce flash
        if (bounceFlashRef.current > 0) {
          bounceFlashRef.current = Math.max(0, bounceFlashRef.current - 0.08);
        }

        // Compute exact pixel position on screen from SVG matrix
        const pixelX = ctm.a * x + ctm.e - heroRect.left;
        const pixelY = ctm.d * y + ctm.f - heroRect.top;

        if (ballRef.current) {
          const flashGlow = bounceFlashRef.current > 0.05 
            ? `drop-shadow(0 0 8px rgba(0,229,255,${(bounceFlashRef.current * 0.45).toFixed(2)}))` 
            : "none";
          ballRef.current.style.transform = `translate3d(${pixelX - 16}px, ${pixelY - 16}px, 0) rotate(${rotationRef.current.toFixed(1)}deg)`;
          ballRef.current.style.filter = flashGlow;
          ballRef.current.style.opacity = "1";
        }

        // Motion trail update
        if (trailRef.current) {
          const trailLag = 0.35;
          trailPosRef.current.x += (x - trailPosRef.current.x) * trailLag;
          trailPosRef.current.y += (y - trailPosRef.current.y) * trailLag;

          const trailPixelX = ctm.a * trailPosRef.current.x + ctm.e - heroRect.left;
          const trailPixelY = ctm.d * trailPosRef.current.y + ctm.f - heroRect.top;

          const trailOpacity = Math.min(0.25, (speed / 14) * 0.25);
          trailRef.current.style.transform = `translate3d(${trailPixelX - 16}px, ${trailPixelY - 16}px, 0)`;
          trailRef.current.style.opacity = trailOpacity.toFixed(3);
        }
      } else {
        // Stationary ball: update position in case of window resize
        const pixelX = ctm.a * x + ctm.e - heroRect.left;
        const pixelY = ctm.d * y + ctm.f - heroRect.top;

        if (ballRef.current) {
          ballRef.current.style.transform = `translate3d(${pixelX - 16}px, ${pixelY - 16}px, 0) rotate(${rotationRef.current.toFixed(1)}deg)`;
          ballRef.current.style.opacity = "1";
          ballRef.current.style.filter = "none";
        }

        if (trailRef.current && parseFloat(trailRef.current.style.opacity || "0") > 0) {
          trailRef.current.style.opacity = "0";
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Handle click to kick ball towards clicked SVG coordinates
  const handleHeroClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!isInteractiveRef.current) return;
    if (isGoalActiveRef.current) return; // Prevent kicks during goal animation

    // Ignore clicks on links or interactive buttons
    if ((e.target as HTMLElement).closest("a, button")) {
      return;
    }

    const svg = svgRef.current;
    if (!svg) return;

    const ctm = svg.getScreenCTM();
    if (!ctm) return;

    // Convert screen click into SVG viewBox coordinates (0..1000, 0..500)
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(ctm.inverse());

    // Target clamped within pitch / goal range
    const targetX = Math.max(18, Math.min(982, svgP.x));
    const targetY = Math.max(15, Math.min(485, svgP.y));

    const dx = targetX - ballPosRef.current.x;
    const dy = targetY - ballPosRef.current.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 8) return;

    const dirX = dx / dist;
    const dirY = dy / dist;

    // Controlled speed in SVG units (max 18 units/frame)
    const maxSpeed = 18;
    const minSpeed = 5;
    const speed = Math.min(maxSpeed, Math.max(minSpeed, dist * 0.04));

    velocityRef.current = {
      vx: dirX * speed,
      vy: dirY * speed,
    };
  };

  return (
    <section 
      ref={sectionRef}
      onClick={handleHeroClick}
      className="relative w-full overflow-hidden bg-[#030816] min-h-[60vh] lg:min-h-[70vh] flex items-center justify-center border-b border-white/5 pt-20 pb-16 lg:py-0 select-none"
    >
      
      {/* Background Atmosphere - Completely static, zero camera movement */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        
        {/* Deep Stadium Night Sky Gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,#08172e_0%,#040a18_55%,#02050e_100%)]" />

        {/* Stadium Floodlights (Left & Right Tribune Lighting) */}
        <div className="absolute -top-16 -left-20 w-[450px] h-[500px] lg:w-[650px] lg:h-[700px] bg-[radial-gradient(ellipse_at_top_left,rgba(0,229,255,0.08)_0%,rgba(16,42,77,0.3)_45%,transparent_75%)] blur-[50px]" />
        <div className="absolute -top-16 -right-20 w-[450px] h-[500px] lg:w-[650px] lg:h-[700px] bg-[radial-gradient(ellipse_at_top_right,rgba(0,229,255,0.08)_0%,rgba(16,42,77,0.3)_45%,transparent_75%)] blur-[50px]" />

        {/* Subtle Pitch Floor Lighting */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-48 bg-[radial-gradient(ellipse_at_bottom,rgba(0,229,255,0.04)_0%,rgba(10,30,55,0.18)_50%,transparent_80%)] blur-[40px]" />

        {/* Pitch Container: static pitch lines SVG */}
        <div className="absolute inset-0 flex items-center justify-center [mask-image:radial-gradient(ellipse_at_center,black_45%,transparent_85%)]">
          <svg 
            ref={svgRef}
            className="w-full h-full max-w-[1150px] max-h-[580px] opacity-[0.07] text-white" 
            viewBox="0 0 1000 500" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Midfield Circle & Center Spot */}
            <circle cx="500" cy="250" r="130" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="500" cy="250" r="3.5" fill="currentColor" />
            {/* Halfway Line */}
            <line x1="500" y1="15" x2="500" y2="485" stroke="currentColor" strokeWidth="1.5" />

            {/* Touchlines (Top & Bottom Physical Boundaries) */}
            <line x1="50" y1="15" x2="950" y2="15" stroke="currentColor" strokeWidth="1.5" />
            <line x1="50" y1="485" x2="950" y2="485" stroke="currentColor" strokeWidth="1.5" />

            {/* Left Goal Line (Solid above & below goal mouth) */}
            <line x1="50" y1="15" x2="50" y2="195" stroke="currentColor" strokeWidth="1.5" />
            <line x1="50" y1="305" x2="50" y2="485" stroke="currentColor" strokeWidth="1.5" />
            {/* Left Goal Mouth (Open goal line) */}
            <line x1="50" y1="195" x2="50" y2="305" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            {/* Left Goal Net Box */}
            <path d="M 50 195 L 18 195 L 18 305 L 50 305" stroke="currentColor" strokeWidth="1.2" strokeDasharray="4 4" />

            {/* Right Goal Line (Solid above & below goal mouth) */}
            <line x1="950" y1="15" x2="950" y2="195" stroke="currentColor" strokeWidth="1.5" />
            <line x1="950" y1="305" x2="950" y2="485" stroke="currentColor" strokeWidth="1.5" />
            {/* Right Goal Mouth (Open goal line) */}
            <line x1="950" y1="195" x2="950" y2="305" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            {/* Right Goal Net Box */}
            <path d="M 950 195 L 982 195 L 982 305 L 950 305" stroke="currentColor" strokeWidth="1.2" strokeDasharray="4 4" />

            {/* Penalty Areas */}
            <rect x="50" y="125" width="130" height="250" stroke="currentColor" strokeWidth="1.2" />
            <rect x="820" y="125" width="130" height="250" stroke="currentColor" strokeWidth="1.2" />
            {/* 6-Yard Goal Areas */}
            <rect x="50" y="170" width="45" height="160" stroke="currentColor" strokeWidth="1" />
            <rect x="905" y="170" width="45" height="160" stroke="currentColor" strokeWidth="1" />
            {/* Penalty Arcs */}
            <path d="M 180 200 A 60 60 0 0 1 180 300" stroke="currentColor" strokeWidth="1.2" />
            <path d="M 820 200 A 60 60 0 0 0 820 300" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </div>

        {/* Subtle Pitch Goal Flash Overlay */}
        <div 
          ref={goalFlashRef}
          className="absolute inset-0 bg-[#00e5ff]/[0.08] pointer-events-none opacity-0 transition-opacity duration-300"
        />

        {/* Minimal Motion Trail (Desktop only) */}
        <div 
          ref={trailRef}
          className="hidden md:block absolute top-0 left-0 w-8 h-8 rounded-full bg-[radial-gradient(circle,rgba(0,229,255,0.3)_0%,rgba(6,25,50,0.4)_50%,transparent_75%)] blur-[4px] pointer-events-none will-change-transform opacity-0 z-[4]"
        />

        {/* Interactive Football Ball with Full-Surface TETA Branding (Desktop only) */}
        <div 
          ref={ballRef}
          className="hidden md:block absolute top-0 left-0 w-8 h-8 pointer-events-none will-change-transform opacity-0 z-[5] select-none"
        >
          <svg 
            viewBox="0 0 32 32" 
            className="w-8 h-8 drop-shadow-[0_3px_12px_rgba(0,0,0,0.8)]"
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            xmlnsXlink="http://www.w3.org/1999/xlink"
          >
            <defs>
              {/* Circular sphere clip boundary */}
              <clipPath id="ballSphereClip">
                <circle cx="16" cy="16" r="15" />
              </clipPath>

              {/* 3D Spherical depth shading */}
              <radialGradient id="ballShading" cx="35%" cy="30%" r="65%">
                <stop offset="0%" stopColor="white" stopOpacity="0.16" />
                <stop offset="60%" stopColor="#040e1c" stopOpacity="0" />
                <stop offset="100%" stopColor="#01040a" stopOpacity="0.75" />
              </radialGradient>
            </defs>

            {/* Ball content clipped to perfect sphere */}
            <g clipPath="url(#ballSphereClip)">
              {/* Deep translucent sphere base */}
              <circle cx="16" cy="16" r="15" fill="#030914" fillOpacity="0.9" />

              {/* TETA League Logo as the full-surface primary skin/pattern */}
              <image 
                href="/logo-t.png" 
                xlinkHref="/logo-t.png" 
                x="2" 
                y="2" 
                width="28" 
                height="28" 
                preserveAspectRatio="xMidYMid meet" 
                opacity="0.9"
              />

              {/* Spherical curvature lighting overlay */}
              <circle cx="16" cy="16" r="15" fill="url(#ballShading)" />

              {/* Subtle top-left sphere highlight reflection */}
              <ellipse cx="11.5" cy="7" rx="4.5" ry="2.2" fill="rgba(255,255,255,0.22)" transform="rotate(-30 11.5 7)" />
            </g>

            {/* Outer sphere rim with cyan/white accent */}
            <circle cx="16" cy="16" r="15" stroke="rgba(0,229,255,0.4)" strokeWidth="1" fill="none" />
          </svg>
        </div>

        {/* Soft Vignette for Central Readability */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(3,8,22,0.3)_0%,rgba(3,8,22,0.7)_80%,#02050e_100%)] pointer-events-none" />

        {/* Bottom Seamless Blend to page content */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#02050e] to-transparent pointer-events-none" />
      </div>

      {/* Elegant TETA Goal Feedback Badge */}
      <div 
        ref={goalBadgeRef}
        className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 transition-all duration-300 z-20"
        style={{ transform: "translate3d(-50%, -10px, 0) scale(0.95)" }}
      >
        <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-[#040e1f]/90 border border-[#00e5ff]/40 backdrop-blur-md shadow-[0_0_25px_rgba(0,229,255,0.3)]">
          <span className="text-sm select-none">⚽</span>
          <span className="text-sm font-black tracking-[0.2em] text-[#00e5ff] uppercase drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]">
            TETA!
          </span>
        </div>
      </div>

      {/* Main Content Container (Centered) - z-10 for perfect legibility and priority */}
      <div className="relative z-10 mx-auto max-w-4xl w-full px-4 lg:px-6 flex flex-col items-center text-center pointer-events-auto">
        
        {/* Brand Tag */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] mb-6 md:mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00e5ff]" />
          <span className="text-[#00e5ff] font-extrabold tracking-[0.25em] text-[11px] md:text-xs uppercase">
            TETA LEAGUE
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-[36px] sm:text-5xl md:text-6xl lg:text-[74px] font-black text-white leading-[1.05] uppercase tracking-tight mb-6 md:mb-8 drop-shadow-xl flex flex-col items-center">
          <span className="block">REKABETİN MERKEZİ</span>
          <span className="block">TETA LEAGUE.</span>
        </h1>

        {/* Subtitle */}
        <p className="text-gray-400 text-base sm:text-lg lg:text-xl font-medium tracking-wide max-w-2xl mb-10 md:mb-12">
          Takımını kur, liglere kat ve rekabetin bir parçası ol.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto px-4 sm:px-0">
          <a 
            href="https://discord.gg/Cd9b4jpcAZ"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-8 py-4 lg:py-4.5 bg-[#00e5ff] text-black font-extrabold text-[13px] tracking-[0.15em] uppercase rounded-lg hover:bg-white transition-all duration-200 shadow-[0_0_20px_rgba(0,229,255,0.25)] hover:shadow-[0_0_30px_rgba(0,229,255,0.45)] hover:scale-[1.02] active:scale-95 flex items-center justify-center"
          >
            TAKIMINI OLUŞTUR
          </a>
          
          <Link 
            href="/ligler"
            className="w-full sm:w-auto px-8 py-4 lg:py-4.5 bg-white/[0.04] border border-white/10 text-white font-extrabold text-[13px] tracking-[0.15em] uppercase rounded-lg hover:bg-white/[0.08] hover:border-white/20 hover:text-[#00e5ff] transition-all duration-200 hover:scale-[1.02] active:scale-95 flex items-center justify-center"
          >
            LİGLERİ KEŞFET
          </Link>
        </div>

      </div>

    </section>
  );
}

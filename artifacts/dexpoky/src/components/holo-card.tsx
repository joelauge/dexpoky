import { useRef, useState, useEffect, useCallback } from "react";

const MAX_ROTATION = 14;
const SCROLL_MAX_ROT = 7;
const GLARE_OPACITY = 0.28;

interface TiltState {
  rotX: number;
  rotY: number;
  glareX: number;
  glareY: number;
  active: boolean;
}

const NEUTRAL: TiltState = { rotX: 0, rotY: 0, glareX: 50, glareY: 50, active: false };

interface HoloCardProps {
  imageUrl?: string | null;
  name: string;
  children?: React.ReactNode;
}

export function HoloCard({ imageUrl, name, children }: HoloCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState<TiltState>(NEUTRAL);

  const gyroActiveRef = useRef(false);
  const mouseActiveRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // ── Desktop: mouse hover ─────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    mouseActiveRef.current = true;
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setTilt({
      rotX: (0.5 - y) * MAX_ROTATION,
      rotY: (x - 0.5) * MAX_ROTATION,
      glareX: x * 100,
      glareY: y * 100,
      active: true,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseActiveRef.current = false;
    setTilt(NEUTRAL);
  }, []);

  // ── Gyroscope ────────────────────────────────────────────────────────────
  useEffect(() => {
    let baseGamma = 0;
    let baseBeta = 45;
    let calibrated = false;

    const applyOrientation = (e: DeviceOrientationEvent) => {
      if (mouseActiveRef.current) return;
      if (e.beta == null || e.gamma == null) return;

      if (!calibrated) {
        baseGamma = e.gamma;
        baseBeta = e.beta;
        calibrated = true;
      }

      gyroActiveRef.current = true;

      const dGamma = e.gamma - baseGamma;
      const dBeta = e.beta - baseBeta;
      const rotY = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, dGamma * 0.7));
      const rotX = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, -dBeta * 0.7));
      const glareX = ((rotY / MAX_ROTATION) + 1) * 50;
      const glareY = (1 - (rotX / MAX_ROTATION)) * 50;

      setTilt({ rotX, rotY, glareX, glareY, active: Math.abs(rotX) > 0.3 || Math.abs(rotY) > 0.3 });
    };

    const attach = () => {
      window.addEventListener("deviceorientation", applyOrientation, true);
    };

    // iOS 13+ needs an explicit permission request triggered by a user gesture.
    // We hook into the first tap on the card for this.
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === "function"
    ) {
      const card = cardRef.current;
      if (!card) return;
      const requestOnTap = async () => {
        try {
          const result = await (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
          if (result === "granted") attach();
        } catch {
          // permission denied or not available — scroll tilt remains active
        }
        card.removeEventListener("click", requestOnTap);
      };
      card.addEventListener("click", requestOnTap);
      return () => {
        card.removeEventListener("click", requestOnTap);
        window.removeEventListener("deviceorientation", applyOrientation, true);
      };
    } else {
      attach();
      return () => window.removeEventListener("deviceorientation", applyOrientation, true);
    }
  }, []);

  // ── Scroll tilt (mobile fallback + ambient layer) ────────────────────────
  // Gives a gentle rotX as the card travels through the viewport.
  // Skipped when the mouse is hovering (desktop), gyro overrides it entirely.
  useEffect(() => {
    const update = () => {
      if (mouseActiveRef.current || gyroActiveRef.current) return;
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const isVisible = rect.bottom > 0 && rect.top < vh;
      if (!isVisible) return;

      // normalized position: -1 when card centre is at top of viewport, +1 at bottom
      const cardCenterY = rect.top + rect.height / 2;
      const norm = Math.max(-1, Math.min(1, (cardCenterY / vh - 0.5) * 2));
      // positive norm (card lower in view) → tilt top toward user (rotX positive)
      const rotX = norm * SCROLL_MAX_ROT;
      const glareY = ((1 - norm) / 2) * 100;

      setTilt({
        rotX,
        rotY: 0,
        glareX: 50,
        glareY,
        active: Math.abs(rotX) > 0.5,
      });
    };

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    // Run once on mount so the card isn't flat before the user scrolls
    update();

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const rainbow = `linear-gradient(${130 + tilt.rotY * 4}deg,
    rgba(255,80,120,0.10),
    rgba(255,200,60,0.10),
    rgba(60,255,160,0.10),
    rgba(60,160,255,0.10),
    rgba(160,60,255,0.10))`;

  return (
    <div style={{ perspective: "900px" }} className="w-full">
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `rotateX(${tilt.rotX}deg) rotateY(${tilt.rotY}deg) scale(${tilt.active ? 1.025 : 1})`,
          transition: mouseActiveRef.current
            ? "transform 0.07s linear"
            : "transform 0.55s cubic-bezier(0.23, 1, 0.32, 1)",
          transformStyle: "preserve-3d",
          willChange: "transform",
          boxShadow: tilt.active
            ? `${-tilt.rotY * 1.5}px ${tilt.rotX * 1.5}px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08)`
            : "0 20px 60px rgba(0,0,0,0.25)",
        }}
        className="relative aspect-[3/4] bg-muted/30 border rounded-2xl overflow-hidden cursor-pointer"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover select-none"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <img src="/logo.png" alt="" aria-hidden className="w-4/5 max-w-[200px] opacity-[0.12] grayscale select-none pointer-events-none" />
          </div>
        )}

        {/* Glare */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(255,255,255,${GLARE_OPACITY}) 0%, transparent 65%)`,
            opacity: tilt.active ? 1 : 0,
            transition: "opacity 0.25s ease",
            mixBlendMode: "overlay",
          }}
        />

        {/* Rainbow shimmer */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: rainbow,
            opacity: tilt.active ? 0.9 : 0,
            transition: "opacity 0.25s ease",
            mixBlendMode: "color-dodge",
          }}
        />

        {children}
      </div>
    </div>
  );
}

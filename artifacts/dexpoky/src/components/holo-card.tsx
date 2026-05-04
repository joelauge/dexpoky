import { useRef, useState, useEffect, useCallback } from "react";

const MAX_ROTATION = 14;
const GLARE_OPACITY = 0.28;

interface HoloCardProps {
  imageUrl?: string | null;
  name: string;
  children?: React.ReactNode;
}

export function HoloCard({ imageUrl, name, children }: HoloCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({
    rotX: 0,
    rotY: 0,
    glareX: 50,
    glareY: 50,
    active: false,
  });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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
    setTilt({ rotX: 0, rotY: 0, glareX: 50, glareY: 50, active: false });
  }, []);

  useEffect(() => {
    let baseGamma = 0;
    let baseBeta = 45;
    let calibrated = false;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;

      if (!calibrated) {
        baseGamma = e.gamma;
        baseBeta = e.beta;
        calibrated = true;
      }

      const dGamma = e.gamma - baseGamma;
      const dBeta = e.beta - baseBeta;

      const rotY = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, dGamma * 0.7));
      const rotX = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, -dBeta * 0.7));
      const glareX = ((rotY / MAX_ROTATION) + 1) * 50;
      const glareY = (1 - (rotX / MAX_ROTATION)) * 50;

      setTilt({ rotX, rotY, glareX, glareY, active: true });
    };

    window.addEventListener("deviceorientation", handleOrientation, true);
    return () => window.removeEventListener("deviceorientation", handleOrientation, true);
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
          transition: tilt.active
            ? "transform 0.07s linear"
            : "transform 0.65s cubic-bezier(0.23, 1, 0.32, 1)",
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
            <img src="/logo.png" alt="" aria-hidden className="w-3/5 max-w-[100px] opacity-[0.12] grayscale select-none pointer-events-none" />
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

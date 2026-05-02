import { useState, useRef, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Camera,
  CameraOff,
  ScanLine,
  RefreshCw,
  Plus,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "sonner";

interface TcgCard {
  id: string;
  name: string;
  imageUrl: string;
  setName: string;
  cardNumber: string;
  rarity: string | null;
}

interface DetectResult {
  detected: boolean;
  confidence: "high" | "medium" | "low";
  pokemonName?: string;
  card?: TcgCard | null;
  variants?: TcgCard[];
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// The card guide occupies this fraction of the viewfinder (centred)
const GUIDE_W = 0.72;
const GUIDE_H = 0.80;

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const [streaming, setStreaming] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<DetectResult | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<TcgCard | null>(null);

  /** Crop the guide region from the live video and return a base64 JPEG. */
  const captureGuideRegion = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return null;

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Mirror the guide box dimensions into video co-ordinates
    const sx = vw * (1 - GUIDE_W) / 2;
    const sy = vh * (1 - GUIDE_H) / 2;
    const sw = vw * GUIDE_W;
    const sh = vh * GUIDE_H;

    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL("image/jpeg", 0.8);
  }, []);

  const runDetect = useCallback(async () => {
    if (!activeRef.current) return;

    setScanning(true);
    const imageData = captureGuideRegion();

    if (!imageData) {
      // Video not ready yet — retry shortly
      loopRef.current = setTimeout(runDetect, 1000);
      setScanning(false);
      return;
    }

    try {
      const res = await fetch(`${BASE}/api/cards/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
      });
      const data: DetectResult = res.ok ? await res.json() : { detected: false, confidence: "low" };

      if (data.detected && activeRef.current) {
        activeRef.current = false;
        setStreaming(false);
        setResult(data);
        setSelectedVariant(data.card ?? null);
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } else if (activeRef.current) {
        // Nothing yet — scan again in 2 s
        loopRef.current = setTimeout(runDetect, 2000);
      }
    } catch {
      if (activeRef.current) loopRef.current = setTimeout(runDetect, 2000);
    } finally {
      setScanning(false);
    }
  }, [captureGuideRegion]);

  const startCamera = async () => {
    setResult(null);
    setSelectedVariant(null);

    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
      });
      streamRef.current = ms;
      const video = videoRef.current!;
      video.srcObject = ms;
      await new Promise<void>((resolve) => {
        video.oncanplay = () => resolve();
        video.play().catch(() => resolve());
      });

      activeRef.current = true;
      setStreaming(true);

      // First detection fires after a short delay so the user can frame the card
      loopRef.current = setTimeout(runDetect, 1200);
    } catch {
      toast.error("Camera permission denied or unavailable.");
    }
  };

  const stopCamera = useCallback(() => {
    activeRef.current = false;
    if (loopRef.current) clearTimeout(loopRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
    setScanning(false);
  }, []);

  const rescan = () => {
    setResult(null);
    setSelectedVariant(null);
    startCamera();
  };

  useEffect(() => () => stopCamera(), [stopCamera]);

  const displayCard = selectedVariant ?? result?.card;
  const CONFIDENCE_COLOR: Record<string, string> = {
    high: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
    medium: "bg-amber-500/15 text-amber-700 border-amber-200",
    low: "bg-red-500/15 text-red-700 border-red-200",
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8 pb-20">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-primary mb-1">
            <ScanLine className="h-6 w-6" />
            <h1 className="text-2xl font-extrabold tracking-tight">Card Scanner</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Hold a card inside the frame — detection runs automatically.
          </p>
        </div>

        {/* ── Viewfinder ── */}
        <div
          ref={containerRef}
          className="relative w-full aspect-video rounded-2xl overflow-hidden bg-zinc-950 shadow-xl border border-border"
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Dark vignette outside guide */}
          {streaming && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(
                  ellipse ${GUIDE_W * 100}% ${GUIDE_H * 100}% at 50% 50%,
                  transparent 60%,
                  rgba(0,0,0,0.55) 100%
                )`,
              }}
            />
          )}

          {/* Card-shaped guide frame */}
          {streaming && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${(1 - GUIDE_W) / 2 * 100}%`,
                top: `${(1 - GUIDE_H) / 2 * 100}%`,
                width: `${GUIDE_W * 100}%`,
                height: `${GUIDE_H * 100}%`,
              }}
            >
              {/* Corners */}
              <div className="absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 border-white/80 rounded-tl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-r-2 border-t-2 border-white/80 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-l-2 border-b-2 border-white/80 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-r-2 border-b-2 border-white/80 rounded-br" />
              {/* Scanning animation */}
              {!result?.detected && (
                <div className="absolute inset-x-0 h-0.5 bg-primary/80 rounded-full shadow-[0_0_6px_2px_rgba(99,102,241,0.6)] animate-scan" />
              )}
            </div>
          )}

          {/* Status pill */}
          {streaming && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              {scanning ? (
                <div className="bg-black/70 backdrop-blur text-white text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking frame…
                </div>
              ) : (
                <div className="bg-black/70 backdrop-blur text-white/80 text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-2">
                  <ScanLine className="h-3 w-3 animate-pulse" />
                  Place card in the frame
                </div>
              )}
            </div>
          )}

          {/* Detected overlay */}
          {result?.detected && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <div className="bg-emerald-600/90 backdrop-blur text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-2">
                <Check className="h-3 w-3" /> Card detected!
              </div>
            </div>
          )}

          {/* Not streaming idle state */}
          {!streaming && !result?.detected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950/95">
              <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                <Camera className="h-7 w-7 text-white/70" />
              </div>
              <p className="text-white/60 text-sm text-center px-8 max-w-xs">
                Start the camera and hold a Pokémon card inside the guide frame
              </p>
              <Button onClick={startCamera} className="rounded-full px-6">
                <Camera className="h-4 w-4 mr-2" /> Start Camera
              </Button>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-2 mt-3">
          {streaming && (
            <Button variant="outline" className="flex-1 rounded-xl" onClick={stopCamera}>
              <CameraOff className="h-4 w-4 mr-2" /> Stop
            </Button>
          )}
          {result?.detected && (
            <Button variant="outline" className="flex-1 rounded-xl" onClick={rescan}>
              <RefreshCw className="h-4 w-4 mr-2" /> Scan Another
            </Button>
          )}
        </div>

        {/* ── Result card ── */}
        {result?.detected && displayCard && (
          <div className="mt-8 animate-in fade-in slide-in-from-bottom-3 duration-300">
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${CONFIDENCE_COLOR[result.confidence] ?? ""}`}>
                {result.confidence === "high" ? "High Confidence" : result.confidence === "medium" ? "Likely Match" : "Low Confidence"}
              </span>
              {result.pokemonName && (
                <span className="text-sm font-medium capitalize">{result.pokemonName}</span>
              )}
            </div>

            <div className="flex gap-4 bg-card border rounded-2xl overflow-hidden shadow-sm">
              <div className="w-28 shrink-0 bg-muted">
                {displayCard.imageUrl ? (
                  <img src={displayCard.imageUrl} alt={displayCard.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs p-2 text-center">No image</div>
                )}
              </div>
              <div className="py-4 pr-4 flex flex-col justify-between min-w-0">
                <div className="space-y-0.5">
                  <h2 className="font-bold text-lg leading-tight">{displayCard.name}</h2>
                  <p className="text-sm text-muted-foreground truncate">{displayCard.setName}</p>
                  <p className="text-xs font-mono text-muted-foreground">#{displayCard.cardNumber}</p>
                  {displayCard.rarity && (
                    <Badge variant="secondary" className="text-[10px] mt-1">{displayCard.rarity}</Badge>
                  )}
                </div>
                <Link href={`/collection/new?name=${encodeURIComponent(displayCard.name)}&setName=${encodeURIComponent(displayCard.setName)}&cardNumber=${encodeURIComponent(displayCard.cardNumber)}&imageUrl=${encodeURIComponent(displayCard.imageUrl)}`}>
                  <Button size="sm" className="mt-3 rounded-lg">
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Add to Collection
                  </Button>
                </Link>
              </div>
            </div>

            {/* Variants */}
            {result.variants && result.variants.length > 1 && (
              <div className="mt-6">
                <h3 className="font-semibold text-sm mb-1">Other printings</h3>
                <p className="text-xs text-muted-foreground mb-3">Tap the one you have.</p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {result.variants.map((v) => {
                    const active = (selectedVariant?.id ?? result.card?.id) === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVariant(v)}
                        className={`shrink-0 w-20 rounded-xl overflow-hidden border-2 transition-all ${active ? "border-primary scale-105 shadow-md" : "border-transparent hover:border-border"}`}
                      >
                        <div className="aspect-[3/4] bg-muted">
                          {v.imageUrl
                            ? <img src={v.imageUrl} alt={v.name} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-[9px] text-muted-foreground p-1 text-center">{v.setName}</div>
                          }
                        </div>
                        <div className="p-1 bg-card border-t">
                          <p className="text-[9px] font-medium truncate leading-tight">{v.setName}</p>
                          <p className="text-[9px] font-mono text-muted-foreground">#{v.cardNumber}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan {
          0%   { top: 5%; }
          50%  { top: 92%; }
          100% { top: 5%; }
        }
        .animate-scan { animation: scan 2s ease-in-out infinite; position: absolute; }
      `}</style>
    </Layout>
  );
}

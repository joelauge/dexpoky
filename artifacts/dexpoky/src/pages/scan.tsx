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
  Sparkles,
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

type Phase =
  | "idle"         // camera not started
  | "scanning"     // camera live, sending frames to identify
  | "confirming"   // card spotted — camera stopped, TCGdex lookup in progress
  | "done";        // result ready

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const GUIDE_W = 0.72;
const GUIDE_H = 0.80;

export default function ScanPage() {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const loopRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef   = useRef(false);

  const [phase, setPhase]                   = useState<Phase>("idle");
  const [pokemonName, setPokemonName]       = useState<string | null>(null);
  const [confidence, setConfidence]         = useState<"high"|"medium"|"low">("low");
  const [card, setCard]                     = useState<TcgCard | null>(null);
  const [variants, setVariants]             = useState<TcgCard[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<TcgCard | null>(null);

  /* ── helpers ── */

  const captureFrame = useCallback((): string | null => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return null;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.8);
  }, []);

  const stopStream = useCallback(() => {
    if (loopRef.current) clearTimeout(loopRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    activeRef.current = false;
  }, []);

  /* ── Phase 2: TCGdex lookup ── */
  const lookupCard = useCallback(async (name: string, conf: "high"|"medium"|"low") => {
    setPhase("confirming");
    setPokemonName(name);
    setConfidence(conf);
    try {
      const res = await fetch(`${BASE}/api/cards/lookup?name=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error("lookup failed");
      const data = await res.json() as { card: TcgCard | null; variants: TcgCard[] };
      setCard(data.card);
      setVariants(data.variants);
      setSelectedVariant(data.card);
      setPhase("done");
    } catch {
      toast.error("Couldn't confirm card — please try again.");
      setPhase("idle");
    }
  }, []);

  /* ── Phase 1: scan loop ── */
  const runScan = useCallback(async () => {
    if (!activeRef.current) return;

    const imageData = captureFrame();
    if (!imageData) {
      loopRef.current = setTimeout(runScan, 800);
      return;
    }

    try {
      const res = await fetch(`${BASE}/api/cards/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
      });
      if (res.ok) {
        const data = await res.json() as { detected: boolean; confidence: "high"|"medium"|"low"; pokemonName: string | null };
        if (data.detected && data.pokemonName && activeRef.current) {
          /* ✅ Card spotted — stop camera immediately, begin lookup */
          stopStream();
          lookupCard(data.pokemonName, data.confidence);
          return;
        }
      }
    } catch { /* network hiccup — keep going */ }

    if (activeRef.current) loopRef.current = setTimeout(runScan, 2000);
  }, [captureFrame, stopStream, lookupCard]);

  /* ── start camera ── */
  const startCamera = async () => {
    setPhase("idle");
    setCard(null);
    setVariants([]);
    setSelectedVariant(null);
    setPokemonName(null);

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
      setPhase("scanning");
      loopRef.current = setTimeout(runScan, 1200);
    } catch {
      toast.error("Camera permission denied or unavailable.");
    }
  };

  const stopCamera = useCallback(() => {
    stopStream();
    setPhase("idle");
  }, [stopStream]);

  const rescan = () => {
    stopCamera();
    setCard(null);
    setVariants([]);
    setSelectedVariant(null);
    setPokemonName(null);
    startCamera();
  };

  useEffect(() => () => stopStream(), [stopStream]);

  /* ── derived ── */
  const displayCard = selectedVariant ?? card;
  const scanning = phase === "scanning";
  const confirming = phase === "confirming";
  const done = phase === "done";

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
            Hold a card inside the frame — it stops automatically when detected.
          </p>
        </div>

        {/* ── Viewfinder ── */}
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-zinc-950 shadow-xl border border-border">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Vignette outside guide */}
          {scanning && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(ellipse ${GUIDE_W * 100}% ${GUIDE_H * 100}% at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%)`,
              }}
            />
          )}

          {/* Guide frame */}
          {scanning && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${(1 - GUIDE_W) / 2 * 100}%`,
                top: `${(1 - GUIDE_H) / 2 * 100}%`,
                width: `${GUIDE_W * 100}%`,
                height: `${GUIDE_H * 100}%`,
              }}
            >
              <div className="absolute top-0 left-0 w-7 h-7 border-l-2 border-t-2 border-white/80 rounded-tl" />
              <div className="absolute top-0 right-0 w-7 h-7 border-r-2 border-t-2 border-white/80 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-7 h-7 border-l-2 border-b-2 border-white/80 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-7 h-7 border-r-2 border-b-2 border-white/80 rounded-br" />
              <div className="absolute inset-x-0 h-0.5 bg-primary/80 rounded-full shadow-[0_0_6px_2px_rgba(99,102,241,0.6)] animate-scan" />
            </div>
          )}

          {/* Idle overlay */}
          {phase === "idle" && (
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

          {/* Confirming overlay — frozen last frame, spinner over the top */}
          {confirming && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/80 backdrop-blur-sm">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-emerald-400 animate-pulse" />
              </div>
              <p className="text-white font-semibold text-base capitalize">{pokemonName}</p>
              <div className="flex items-center gap-2 text-white/70 text-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Looking up card details…
              </div>
            </div>
          )}

          {/* Status pill */}
          {scanning && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <div className="bg-black/70 backdrop-blur text-white/80 text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-2">
                <ScanLine className="h-3 w-3 animate-pulse" />
                Place card in the frame
              </div>
            </div>
          )}

          {/* Done tick */}
          {done && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <div className="bg-emerald-600/90 backdrop-blur text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-2">
                <Check className="h-3 w-3" /> Card confirmed
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-2 mt-3">
          {scanning && (
            <Button variant="outline" className="flex-1 rounded-xl" onClick={stopCamera}>
              <CameraOff className="h-4 w-4 mr-2" /> Stop
            </Button>
          )}
          {(done || phase === "idle") && card && (
            <Button variant="outline" className="flex-1 rounded-xl" onClick={rescan}>
              <RefreshCw className="h-4 w-4 mr-2" /> Scan Another
            </Button>
          )}
        </div>

        {/* ── Result ── */}
        {done && displayCard && (
          <div className="mt-8 space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-300">
            {/* Confidence + name */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${CONFIDENCE_COLOR[confidence] ?? ""}`}>
                {confidence === "high" ? "High Confidence" : confidence === "medium" ? "Likely Match" : "Low Confidence"}
              </span>
              {pokemonName && <span className="text-sm font-medium capitalize">{pokemonName}</span>}
            </div>

            {/* Card row */}
            <div className="flex gap-4 bg-card border rounded-2xl overflow-hidden shadow-sm">
              <div className="w-28 shrink-0 bg-muted">
                {displayCard.imageUrl
                  ? <img src={displayCard.imageUrl} alt={displayCard.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground p-2 text-center">No image</div>
                }
              </div>
              <div className="py-4 pr-4 flex flex-col justify-between min-w-0">
                <div className="space-y-0.5">
                  <h2 className="font-bold text-lg leading-tight">{displayCard.name}</h2>
                  <p className="text-sm text-muted-foreground truncate">{displayCard.setName}</p>
                  <p className="text-xs font-mono text-muted-foreground">#{displayCard.cardNumber}</p>
                  {displayCard.rarity && <Badge variant="secondary" className="text-[10px] mt-1">{displayCard.rarity}</Badge>}
                </div>
                <Link href={`/collection/new?name=${encodeURIComponent(displayCard.name)}&setName=${encodeURIComponent(displayCard.setName)}&cardNumber=${encodeURIComponent(displayCard.cardNumber)}&imageUrl=${encodeURIComponent(displayCard.imageUrl)}`}>
                  <Button size="sm" className="mt-3 rounded-lg">
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Add to Collection
                  </Button>
                </Link>
              </div>
            </div>

            {/* Variants */}
            {variants.length > 1 && (
              <div>
                <h3 className="font-semibold text-sm mb-1">Other printings</h3>
                <p className="text-xs text-muted-foreground mb-3">Tap the one you have.</p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {variants.map((v) => {
                    const active = (selectedVariant?.id ?? card?.id) === v.id;
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

import { useState, useRef, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  Camera,
  CameraOff,
  Sparkles,
  Check,
  ScanLine,
  RefreshCw,
  Plus,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

interface TcgCard {
  id: string;
  name: string;
  imageUrl: string;
  setName: string;
  setId: string;
  cardNumber: string;
  rarity: string | null;
}

interface DetectResult {
  detected: boolean;
  confidence: "high" | "medium" | "low";
  pokemonName?: string;
  cardName?: string;
  setName?: string | null;
  cardNumber?: string | null;
  card?: TcgCard | null;
  variants?: TcgCard[];
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  medium: "bg-amber-500/15 text-amber-700 border-amber-200",
  low: "bg-red-500/15 text-red-700 border-red-200",
};

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectingRef = useRef(false);
  const streamingRef = useRef(false);

  const [streaming, setStreaming] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<DetectResult | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<TcgCard | null>(null);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    if (video.readyState < 2 || video.videoWidth === 0) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.7);
  }, []);

  // The detect loop — runs once per call, re-schedules itself
  const scheduleDetect = useCallback(() => {
    if (!streamingRef.current) return;

    const timer = setTimeout(async () => {
      if (!streamingRef.current) return;

      // Don't overlap with an in-flight request
      if (detectingRef.current) {
        scheduleDetect();
        return;
      }

      const imageData = captureFrame();
      if (!imageData) {
        // Video not ready yet — retry sooner
        scheduleDetect();
        return;
      }

      detectingRef.current = true;
      setScanning(true);
      setScanCount((c) => c + 1);

      try {
        const res = await fetch(`${BASE}/api/cards/detect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageData }),
        });

        if (!res.ok) {
          setErrorMsg(`Server error ${res.status}`);
          scheduleDetect();
          return;
        }

        const data: DetectResult = await res.json();
        setErrorMsg(null);

        if (data.detected) {
          setResult(data);
          setSelectedVariant(data.card ?? null);
          streamingRef.current = false;
          setStreaming(false);
          // Stop the camera but keep the feed visible one more moment
          setTimeout(() => {
            streamRef.current?.getTracks().forEach((t) => t.stop());
          }, 400);
        } else {
          scheduleDetect();
        }
      } catch (err) {
        setErrorMsg("Network error — retrying…");
        scheduleDetect();
      } finally {
        detectingRef.current = false;
        setScanning(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [captureFrame]);

  const startCamera = async () => {
    setResult(null);
    setSelectedVariant(null);
    setScanCount(0);
    setErrorMsg(null);

    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
      });
      streamRef.current = ms;

      const video = videoRef.current!;
      video.srcObject = ms;
      // Wait for the video to start producing frames
      await new Promise<void>((resolve) => {
        video.oncanplay = () => resolve();
        video.play().catch(() => resolve());
      });

      streamingRef.current = true;
      setStreaming(true);

      // Kick off the detect loop
      scheduleDetect();
    } catch (err) {
      toast.error("Camera permission denied or unavailable.");
    }
  };

  const stopCamera = useCallback(() => {
    streamingRef.current = false;
    detectingRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
    setScanning(false);
  }, []);

  const rescan = () => {
    setResult(null);
    setSelectedVariant(null);
    setScanCount(0);
    setErrorMsg(null);
    startCamera();
  };

  useEffect(() => () => stopCamera(), [stopCamera]);

  const displayCard = selectedVariant ?? result?.card;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-16">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-primary mb-2">
            <ScanLine className="h-6 w-6" />
            <h1 className="text-3xl font-extrabold tracking-tight">Card Scanner</h1>
          </div>
          <p className="text-muted-foreground">
            Hold a Pokémon card in front of your camera. Detection runs automatically.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* ── Camera column ── */}
          <div className="space-y-4">
            {/* 3 : 5 portrait viewfinder — same ratio as a trading card */}
            <div className="relative w-full aspect-[3/5] rounded-2xl overflow-hidden bg-zinc-950 shadow-xl border border-border">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Not-streaming overlay */}
              {!streaming && !result?.detected && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950/95">
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                    <Camera className="h-8 w-8 text-white/70" />
                  </div>
                  <p className="text-white/60 text-sm text-center px-6">
                    Point your camera at a Pokémon card to identify it
                  </p>
                  <Button onClick={startCamera} className="rounded-full px-6">
                    <Camera className="h-4 w-4 mr-2" /> Start Camera
                  </Button>
                </div>
              )}

              {/* Scanning corners */}
              {streaming && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-primary rounded-tl" />
                  <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-primary rounded-tr" />
                  <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-primary rounded-bl" />
                  <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-primary rounded-br" />
                  {/* Animated scan line */}
                  <div className="absolute inset-x-6 h-0.5 bg-primary/70 rounded-full shadow-[0_0_8px_2px_rgba(99,102,241,0.5)] animate-scan" />
                </div>
              )}

              {/* Status pill */}
              {streaming && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
                  {scanning ? (
                    <div className="bg-black/75 backdrop-blur text-white text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow">
                      <Sparkles className="h-3 w-3 animate-pulse text-primary" />
                      AI analyzing…
                    </div>
                  ) : (
                    <div className="bg-black/75 backdrop-blur text-white/80 text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow">
                      <ScanLine className="h-3 w-3 animate-pulse" />
                      Scanning — frame {scanCount}
                    </div>
                  )}
                </div>
              )}

              {/* Detected overlay */}
              {result?.detected && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-emerald-400 rounded-tl" />
                  <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-emerald-400 rounded-tr" />
                  <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-emerald-400 rounded-bl" />
                  <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-emerald-400 rounded-br" />
                  <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
                    <div className="bg-emerald-600/90 backdrop-blur text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow">
                      <Check className="h-3 w-3" /> Card Detected
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Error banner */}
            {errorMsg && (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            {/* Controls */}
            <div className="flex gap-2">
              {streaming ? (
                <Button variant="outline" className="flex-1 rounded-xl" onClick={stopCamera}>
                  <CameraOff className="h-4 w-4 mr-2" /> Stop
                </Button>
              ) : result?.detected ? (
                <Button variant="outline" className="flex-1 rounded-xl" onClick={rescan}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Scan Another
                </Button>
              ) : (
                <Button className="flex-1 rounded-xl" onClick={startCamera}>
                  <Camera className="h-4 w-4 mr-2" /> Start Camera
                </Button>
              )}
            </div>
          </div>

          {/* ── Results column ── */}
          <div className="space-y-5">
            {!result && !scanning && (
              <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-2xl text-muted-foreground">
                <ScanLine className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">Detection results will appear here</p>
              </div>
            )}

            {scanning && !result && (
              <div className="space-y-3">
                <Skeleton className="h-5 w-2/3 rounded-lg" />
                <Skeleton className="h-4 w-1/2 rounded-lg" />
                <Skeleton className="aspect-[3/4] w-full rounded-xl" />
              </div>
            )}

            {result?.detected && displayCard && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${CONFIDENCE_COLOR[result.confidence] ?? ""}`}>
                    {result.confidence === "high" ? "High Confidence" : result.confidence === "medium" ? "Likely Match" : "Low Confidence"}
                  </span>
                  {result.pokemonName && (
                    <span className="text-sm font-medium text-foreground capitalize">{result.pokemonName}</span>
                  )}
                </div>

                <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
                  <div className="aspect-[3/4] w-full bg-muted relative">
                    {displayCard.imageUrl ? (
                      <img src={displayCard.imageUrl} alt={displayCard.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">No Image</div>
                    )}
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-emerald-500 text-white border-0 text-[10px] shadow">
                        <Check className="h-2.5 w-2.5 mr-1" /> Match
                      </Badge>
                    </div>
                  </div>
                  <div className="p-4 space-y-0.5">
                    <h2 className="font-bold text-lg leading-tight">{displayCard.name}</h2>
                    <p className="text-sm text-muted-foreground">{displayCard.setName}</p>
                    <p className="text-xs font-mono text-muted-foreground">#{displayCard.cardNumber}</p>
                  </div>
                </div>

                <Link href={`/collection/new?name=${encodeURIComponent(displayCard.name)}&setName=${encodeURIComponent(displayCard.setName)}&cardNumber=${encodeURIComponent(displayCard.cardNumber)}&imageUrl=${encodeURIComponent(displayCard.imageUrl)}`}>
                  <Button className="w-full rounded-xl">
                    <Plus className="h-4 w-4 mr-2" /> Add to Collection
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ── Variants section ── */}
        {result?.detected && result.variants && result.variants.length > 1 && (
          <div className="mt-10">
            <h3 className="font-bold text-lg mb-1">Other Editions</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Tap a card to confirm the exact printing you have.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {result.variants.map((v) => {
                const isSelected = selectedVariant?.id === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariant(v)}
                    className={`rounded-xl overflow-hidden border-2 transition-all text-left ${
                      isSelected ? "border-primary shadow-md scale-105" : "border-transparent hover:border-border"
                    }`}
                  >
                    <div className="aspect-[3/4] bg-muted">
                      {v.imageUrl ? (
                        <img src={v.imageUrl} alt={v.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px] p-1 text-center">
                          {v.setName}
                        </div>
                      )}
                    </div>
                    <div className="p-1.5 bg-card border-t">
                      <p className="text-[10px] font-medium leading-tight truncate">{v.setName}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">#{v.cardNumber}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan {
          0%   { top: 12%; }
          50%  { top: 85%; }
          100% { top: 12%; }
        }
        .animate-scan { animation: scan 2s ease-in-out infinite; position: absolute; }
      `}</style>
    </Layout>
  );
}

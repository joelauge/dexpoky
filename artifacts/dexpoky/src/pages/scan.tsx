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
  SearchX,
  TrendingUp,
  Award,
  Brain,
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

interface PricingData {
  marketPrice: number | null;
  lowPrice: number | null;
  trendPrice: number | null;
  source: "tcgplayer" | "cardmarket" | null;
  psaEstimates: Record<string, number> | null;
}

type Phase = "idle" | "scanning" | "confirming" | "done";

interface ConfirmStep {
  text: string;
  done: boolean;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const GUIDE_W = 0.72;
const GUIDE_H = 0.80;

const PSA_GRADES = [10, 9, 8, 7, 6, 5] as const;
const PSA_LABELS: Record<number, string> = {
  10: "Gem Mint",
  9:  "Mint",
  8:  "NM-Mint",
  7:  "Near Mint",
  6:  "EX-Mint",
  5:  "Excellent",
};

function fmt(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
}

export default function ScanPage() {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const [phase, setPhase]                     = useState<Phase>("idle");
  const [pokemonName, setPokemonName]         = useState<string | null>(null);
  const [confidence, setConfidence]           = useState<"high"|"medium"|"low">("low");
  const [card, setCard]                       = useState<TcgCard | null>(null);
  const [variants, setVariants]               = useState<TcgCard[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<TcgCard | null>(null);
  const [pricing, setPricing]                 = useState<PricingData | null>(null);
  const [frozenFrame, setFrozenFrame]         = useState<string | null>(null);

  // New: scanning sub-status
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanCount, setScanCount]     = useState(0);

  // New: confirming step-by-step progress
  const [confirmSteps, setConfirmSteps] = useState<ConfirmStep[]>([]);

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
    setIsAnalyzing(false);
  }, []);

  const lookupCard = useCallback(async (name: string, conf: "high"|"medium"|"low") => {
    setPhase("confirming");
    setPokemonName(name);
    setConfidence(conf);

    setConfirmSteps([
      { text: `Identified: ${name}`, done: true },
      { text: "Searching TCG database…", done: false },
    ]);

    try {
      const res = await fetch(`${BASE}/api/cards/lookup?name=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error("lookup failed");
      const data = await res.json() as { card: TcgCard | null; variants: TcgCard[]; pricing: PricingData };

      const variantCount = data.variants?.length ?? (data.card ? 1 : 0);
      setConfirmSteps([
        { text: `Identified: ${name}`, done: true },
        { text: variantCount > 0 ? `Found ${variantCount} printing${variantCount !== 1 ? "s" : ""}` : "No TCG match found", done: true },
        { text: "Loading market prices…", done: false },
      ]);

      await new Promise<void>((r) => setTimeout(r, 350));

      setCard(data.card);
      setVariants(data.variants ?? []);
      setSelectedVariant(data.card);
      setPricing(data.pricing ?? null);

      setConfirmSteps([
        { text: `Identified: ${name}`, done: true },
        { text: variantCount > 0 ? `Found ${variantCount} printing${variantCount !== 1 ? "s" : ""}` : "No TCG match found", done: true },
        { text: data.pricing?.marketPrice != null ? `Market price: ${fmt(data.pricing.marketPrice)}` : "Pricing unavailable", done: true },
      ]);

      await new Promise<void>((r) => setTimeout(r, 250));
      setPhase("done");
    } catch {
      toast.error("Couldn't confirm card — please try again.");
      setPhase("idle");
    }
  }, []);

  const runScan = useCallback(async () => {
    if (!activeRef.current) return;
    const imageData = captureFrame();
    if (!imageData) { loopRef.current = setTimeout(runScan, 800); return; }

    setIsAnalyzing(true);
    setScanCount((c) => c + 1);

    try {
      const res = await fetch(`${BASE}/api/cards/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
      });
      setIsAnalyzing(false);
      if (res.ok) {
        const data = await res.json() as { detected: boolean; confidence: "high"|"medium"|"low"; pokemonName: string | null };
        if (data.detected && data.pokemonName && activeRef.current) {
          const frozen = captureFrame();
          if (frozen) setFrozenFrame(frozen);
          stopStream();
          lookupCard(data.pokemonName, data.confidence);
          return;
        }
      }
    } catch {
      setIsAnalyzing(false);
    }
    if (activeRef.current) loopRef.current = setTimeout(runScan, 2000);
  }, [captureFrame, stopStream, lookupCard]);

  const startCamera = async () => {
    setPhase("idle");
    setCard(null); setVariants([]); setSelectedVariant(null);
    setPokemonName(null); setFrozenFrame(null); setPricing(null);
    setIsAnalyzing(false); setScanCount(0); setConfirmSteps([]);
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

  const stopCamera = useCallback(() => { stopStream(); setPhase("idle"); }, [stopStream]);

  const rescan = () => {
    stopCamera();
    setCard(null); setVariants([]); setSelectedVariant(null);
    setPokemonName(null); setFrozenFrame(null); setPricing(null);
    setIsAnalyzing(false); setScanCount(0); setConfirmSteps([]);
    startCamera();
  };

  useEffect(() => () => stopStream(), [stopStream]);

  const displayCard = selectedVariant ?? card;
  const scanning    = phase === "scanning";
  const confirming  = phase === "confirming";
  const done        = phase === "done";

  const CONFIDENCE_COLOR: Record<string, string> = {
    high:   "bg-emerald-500/15 text-emerald-700 border-emerald-200",
    medium: "bg-amber-500/15 text-amber-700 border-amber-200",
    low:    "bg-red-500/15 text-red-700 border-red-200",
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
            autoPlay playsInline muted
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${(confirming || done) ? "opacity-0" : "opacity-100"}`}
          />
          {frozenFrame && (confirming || done) && (
            <img src={frozenFrame} alt="Captured frame" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <canvas ref={canvasRef} style={{ position: "absolute", top: -9999, left: -9999, width: 1, height: 1 }} />

          {/* Scanning: guide frame + scan line */}
          {scanning && (
            <>
              <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse ${GUIDE_W*100}% ${GUIDE_H*100}% at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%)` }} />
              <div className="absolute pointer-events-none" style={{ left:`${(1-GUIDE_W)/2*100}%`, top:`${(1-GUIDE_H)/2*100}%`, width:`${GUIDE_W*100}%`, height:`${GUIDE_H*100}%` }}>
                <div className="absolute top-0 left-0 w-7 h-7 border-l-2 border-t-2 border-white/80 rounded-tl" />
                <div className="absolute top-0 right-0 w-7 h-7 border-r-2 border-t-2 border-white/80 rounded-tr" />
                <div className="absolute bottom-0 left-0 w-7 h-7 border-l-2 border-b-2 border-white/80 rounded-bl" />
                <div className="absolute bottom-0 right-0 w-7 h-7 border-r-2 border-b-2 border-white/80 rounded-br" />
                <div className={`absolute inset-x-0 h-0.5 rounded-full animate-scan transition-all duration-300 ${isAnalyzing ? "bg-amber-400/90 shadow-[0_0_10px_3px_rgba(251,191,36,0.7)]" : "bg-primary/80 shadow-[0_0_6px_2px_rgba(99,102,241,0.6)]"}`} />
              </div>
            </>
          )}

          {/* Idle state */}
          {phase === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950/95">
              <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                <Camera className="h-7 w-7 text-white/70" />
              </div>
              <p className="text-white/60 text-sm text-center px-8 max-w-xs">Start the camera and hold a Pokémon card inside the guide frame</p>
              <Button onClick={startCamera} className="rounded-full px-6">
                <Camera className="h-4 w-4 mr-2" /> Start Camera
              </Button>
            </div>
          )}

          {/* Confirming: step-by-step progress over frozen frame */}
          {confirming && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950/75 backdrop-blur-sm">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-emerald-400 animate-pulse" />
              </div>
              <p className="text-white font-bold text-lg capitalize tracking-wide">{pokemonName}</p>
              <div className="space-y-2 min-w-[200px]">
                {confirmSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${step.done ? "bg-emerald-500" : "bg-white/10 border border-white/30"}`}>
                      {step.done
                        ? <Check className="h-3 w-3 text-white" />
                        : <Loader2 className="h-3 w-3 text-white/70 animate-spin" />}
                    </div>
                    <span className={`text-sm transition-colors duration-300 ${step.done ? "text-white" : "text-white/60"}`}>
                      {step.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Done: success overlay */}
          {done && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/60 backdrop-blur-sm">
              <div className="w-16 h-16 rounded-full bg-emerald-500/30 border-2 border-emerald-400/60 flex items-center justify-center">
                <Check className="h-8 w-8 text-emerald-300" />
              </div>
              <p className="text-white font-bold text-lg capitalize">{pokemonName}</p>
              <p className="text-white/60 text-xs">
                {displayCard ? `${displayCard.setName} · #${displayCard.cardNumber}` : "Scroll down for details"}
              </p>
            </div>
          )}

          {/* Bottom status pill — changes between idle-waiting and AI-analyzing */}
          {scanning && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 transition-all duration-300">
              {isAnalyzing ? (
                <div className="bg-amber-500/90 backdrop-blur text-white text-xs font-semibold px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg">
                  <Brain className="h-3.5 w-3.5 animate-pulse" />
                  AI analyzing…
                </div>
              ) : (
                <div className="bg-black/70 backdrop-blur text-white/80 text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-2">
                  <ScanLine className="h-3 w-3 animate-pulse" />
                  {scanCount > 0 ? `Scanning — attempt ${scanCount}` : "Place card in the frame"}
                </div>
              )}
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
          {done && (
            <Button variant="outline" className="flex-1 rounded-xl" onClick={rescan}>
              <RefreshCw className="h-4 w-4 mr-2" /> Scan Another
            </Button>
          )}
        </div>

        {/* ── Result ── */}
        {done && (
          <div className="mt-8 space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
            {/* Confidence badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${CONFIDENCE_COLOR[confidence] ?? ""}`}>
                {confidence === "high" ? "High Confidence" : confidence === "medium" ? "Likely Match" : "Low Confidence"}
              </span>
              {pokemonName && <span className="text-sm font-medium capitalize">{pokemonName}</span>}
            </div>

            {displayCard ? (
              <>
                {/* Main card row */}
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
                      {pricing?.marketPrice != null && (
                        <p className="text-sm font-bold text-emerald-600 mt-1">{fmt(pricing.marketPrice)} <span className="text-[10px] font-normal text-muted-foreground">market</span></p>
                      )}
                    </div>
                    <Link href={[
                      `/collection/new`,
                      `?name=${encodeURIComponent(displayCard.name)}`,
                      `&pokemonName=${encodeURIComponent(pokemonName ?? displayCard.name)}`,
                      `&setName=${encodeURIComponent(displayCard.setName)}`,
                      `&cardNumber=${encodeURIComponent(displayCard.cardNumber)}`,
                      `&imageUrl=${encodeURIComponent(displayCard.imageUrl)}`,
                      pricing?.marketPrice != null ? `&estimatedValue=${pricing.marketPrice}` : "",
                    ].join("")}>
                      <Button size="sm" className="mt-3 rounded-lg">
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Add to Collection
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Market value */}
                {pricing && (pricing.marketPrice != null || pricing.lowPrice != null) && (
                  <div className="bg-card border rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm">Market Value</h3>
                      {pricing.source && (
                        <span className="text-[10px] text-muted-foreground ml-auto capitalize">{pricing.source === "tcgplayer" ? "TCGPlayer" : "CardMarket"}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {pricing.marketPrice != null && (
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground mb-0.5">Market</p>
                          <p className="font-bold text-base">{fmt(pricing.marketPrice)}</p>
                        </div>
                      )}
                      {pricing.lowPrice != null && (
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground mb-0.5">Low</p>
                          <p className="font-semibold text-base text-muted-foreground">{fmt(pricing.lowPrice)}</p>
                        </div>
                      )}
                      {pricing.trendPrice != null && (
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground mb-0.5">Trend</p>
                          <p className="font-semibold text-base">{fmt(pricing.trendPrice)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* PSA grades */}
                {pricing?.psaEstimates && (
                  <div className="bg-card border rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-amber-500" />
                      <h3 className="font-semibold text-sm">Estimated PSA Graded Value</h3>
                    </div>
                    <p className="text-[11px] text-muted-foreground -mt-1">Based on market price × grade multiplier. Estimates only.</p>
                    <div className="space-y-1.5">
                      {PSA_GRADES.map((grade) => {
                        const val = pricing.psaEstimates![grade];
                        if (val == null) return null;
                        const pct = Math.min(100, (val / (pricing.psaEstimates![10] ?? val)) * 100);
                        return (
                          <div key={grade} className="flex items-center gap-3">
                            <div className="w-8 shrink-0 text-right">
                              <span className={`text-xs font-bold ${grade === 10 ? "text-amber-500" : grade >= 9 ? "text-emerald-600" : "text-muted-foreground"}`}>
                                {grade}
                              </span>
                            </div>
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${grade === 10 ? "bg-amber-400" : grade >= 9 ? "bg-emerald-500" : "bg-primary/40"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="w-20 text-right">
                              <span className="text-xs font-semibold">{fmt(val)}</span>
                            </div>
                            <div className="w-20 hidden sm:block">
                              <span className="text-[10px] text-muted-foreground">{PSA_LABELS[grade]}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Other printings */}
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
                            <div className="aspect-[3/4] bg-muted flex items-center justify-center">
                              {v.imageUrl
                                ? <img src={v.imageUrl} alt={v.name} className="w-full h-full object-cover" />
                                : <span className="text-[9px] text-muted-foreground p-1 text-center leading-tight">{v.setName}</span>
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
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 py-8 px-6 bg-muted/40 border border-dashed rounded-2xl text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <SearchX className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-sm capitalize">{pokemonName}</p>
                  <p className="text-xs text-muted-foreground mt-1">No exact card match found.<br />You can still add it manually.</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-center">
                  <Link href={`/collection/new?name=${encodeURIComponent(pokemonName ?? "")}`}>
                    <Button size="sm" className="rounded-lg"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add Manually</Button>
                  </Link>
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={rescan}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Try Again
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan { 0% { top: 5%; } 50% { top: 92%; } 100% { top: 5%; } }
        .animate-scan { animation: scan 2s ease-in-out infinite; position: absolute; }
      `}</style>
    </Layout>
  );
}

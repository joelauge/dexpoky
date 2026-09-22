import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
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
  Aperture,
  SwitchCamera,
} from "lucide-react";
import { toast } from "sonner";
import { useBillingStatus, useRecordScan } from "@/hooks/useBilling";
import { useCameraFacing } from "@/hooks/useCameraFacing";
import { ScanPaywall } from "@/components/scan-paywall";
import { captureCardCrop, captureBottomCrop } from "@/lib/capture-crop";
import { uploadScanImage } from "@/lib/upload-scan";
import { CatalogSearch } from "@/components/catalog-search";
import type { CatalogCard } from "@workspace/api-client-react";
import { CardConfidenceScorecard } from "@/components/card-confidence-scorecard";

interface TcgCard {
  id: string;
  name: string;
  imageUrl: string;
  setName: string;
  setId?: string;
  cardNumber: string;
  rarity: string | null;
}

interface EbaySoldPricing {
  median: number | null;
  average: number | null;
  low: number | null;
  high: number | null;
  count: number;
  searchUrl: string;
}

interface PricingData {
  marketPrice: number | null;
  lowPrice: number | null;
  trendPrice: number | null;
  source: "tcgplayer" | "cardmarket" | null;
  psaEstimates: Record<string, number> | null;
  isFallback?: boolean;
  ebay?: EbaySoldPricing | null;
}

type Phase = "idle" | "capturing" | "analyzing" | "confirming" | "done";

interface ConfirmStep {
  text: string;
  done: boolean;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  const scanUploadRef = useRef<Promise<string | null> | null>(null);
  const [, navigate] = useLocation();

  const { facingMode, facingModeRef, setFacingMode } = useCameraFacing();
  const [hasSingleCamera, setHasSingleCamera] = useState(false);

  const [phase, setPhase]                     = useState<Phase>("idle");
  const [pokemonName, setPokemonName]         = useState<string | null>(null);
  const [observedSetCode, setObservedSetCode] = useState<string | null>(null);
  const [observedCardNumber, setObservedCardNumber] = useState<string | null>(null);
  const [confidence, setConfidence]           = useState<"high"|"medium"|"low">("low");
  const [card, setCard]                       = useState<TcgCard | null>(null);
  const [variants, setVariants]               = useState<TcgCard[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<TcgCard | null>(null);
  const [pricing, setPricing]                 = useState<PricingData | null>(null);
  const [frozenFrame, setFrozenFrame]         = useState<string | null>(null);
  const [pricingLoading, setPricingLoading]   = useState(false);
  const pricingRequestRef = useRef(0);
  const pricingAbortRef = useRef<AbortController | null>(null);
  const [correctionOpen, setCorrectionOpen]   = useState(false);
  const [imageFailed, setImageFailed]         = useState(false);

  const [confirmSteps, setConfirmSteps] = useState<ConfirmStep[]>([]);
  const [scanUrl, setScanUrl] = useState<string | null>(null);

  // Billing
  const { data: billing, isLoading: billingLoading } = useBillingStatus();
  const recordScan = useRecordScan();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<"trial_not_activated" | "trial_exhausted" | "monthly_limit_reached" | null>(null);

  // Crop to the on-screen card guide (88% of viewport height).
  const captureFrame = useCallback((): string | null => {
    return captureCardCrop(videoRef.current, canvasRef.current, 0.88);
  }, []);

  // Zoomed crop of just the bottom strip where set code + number are printed.
  const captureCorner = useCallback((): string | null => {
    return captureBottomCrop(videoRef.current, canvasRef.current, 0.88);
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const lookupCard = useCallback(async (
    name: string,
    conf: "high"|"medium"|"low",
    extras?: { cardNumber?: string | null; setCode?: string | null },
  ) => {
    setPhase("confirming");
    setPokemonName(name);
    setConfidence(conf);

    setConfirmSteps([
      { text: `Identified: ${name}`, done: true },
      { text: "Searching TCG database…", done: false },
    ]);

    try {
      const params = new URLSearchParams({ name });
      if (extras?.cardNumber) params.set("cardNumber", extras.cardNumber);
      if (extras?.setCode) params.set("setCode", extras.setCode);
      const res = await fetch(`${BASE}/api/cards/lookup?${params.toString()}`);
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
       setImageFailed(false);
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

  const takePhoto = useCallback(async () => {
    const imageData = captureFrame();
    if (!imageData) {
      toast.error("Couldn't capture photo — please try again.");
      return;
    }
    // Capture the identifier strip from the same live frame. Once the camera
    // tracks are stopped, some browsers clear or freeze the video buffer.
    const cornerImageData = captureCorner() ?? undefined;
    setFrozenFrame(imageData);
    setPhase("analyzing");
    stopStream();

    // Kick off the scan upload in parallel with identification — non-blocking.
    // We hold the promise on a ref so the "Add to Collection" handler can
    // await it (with a short timeout) before navigating.
    setScanUrl(null);
    const uploadPromise = uploadScanImage(imageData);
    scanUploadRef.current = uploadPromise;
    uploadPromise.then((url) => setScanUrl(url));

    try {
      const res = await fetch(`${BASE}/api/cards/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData, ...(cornerImageData ? { cornerImageData } : {}) }),
      });
      if (!res.ok) throw new Error("identify failed");
      const data = await res.json() as {
        detected: boolean;
        confidence: "high"|"medium"|"low";
        pokemonName: string | null;
        setCode?: string | null;
        cardNumber?: string | null;
        hp?: number | null;
      };
      if (!data.detected || !data.pokemonName) {
        toast.error("No card detected — try again with better lighting and the card centered in the frame.");
        setPhase("idle");
        setFrozenFrame(null);
        startCamera().catch(() => toast.error("Camera permission denied or unavailable."));
        return;
      }
      // Record the scan against the billing limit
      setObservedSetCode(data.setCode ?? null);
      setObservedCardNumber(data.cardNumber ?? null);
      recordScan.mutate(undefined, {
        onSuccess: (result) => {
          if (!result.allowed) {
            const reason = result.reason === "monthly_limit_reached"
              ? "monthly_limit_reached"
              : "trial_exhausted";
            setPaywallReason(reason);
            setPaywallOpen(true);
            setPhase("idle");
            return;
          }
        },
      });
      lookupCard(data.pokemonName, data.confidence, { cardNumber: data.cardNumber, setCode: data.setCode });
    } catch {
      toast.error("Couldn't analyze photo — please try again.");
      setPhase("idle");
      setFrozenFrame(null);
      startCamera().catch(() => toast.error("Camera permission denied or unavailable."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureFrame, captureCorner, stopStream, lookupCard]);

  const startCamera = async (facing?: "environment" | "user") => {
    const mode = facing ?? facingModeRef.current;
    setPhase("idle");
    setCard(null); setVariants([]); setSelectedVariant(null);
    setImageFailed(false);
    setPokemonName(null); setFrozenFrame(null); setPricing(null);
    setObservedSetCode(null); setObservedCardNumber(null);
    setConfirmSteps([]);
    setScanUrl(null);
    const ms = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: mode, width: { ideal: 3840 }, height: { ideal: 2160 } },
    });
    streamRef.current = ms;
    const video = videoRef.current!;
    video.srcObject = ms;
    await new Promise<void>((resolve) => {
      video.oncanplay = () => resolve();
      video.play().catch(() => resolve());
    });
    setPhase("capturing");
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      setHasSingleCamera(videoInputs.length <= 1);
    } catch { /* ignore — flip button stays visible */ }
  };

  const flipCamera = async () => {
    const prev = facingModeRef.current;
    const next = prev === "environment" ? "user" : "environment";
    setFacingMode(next);
    stopStream();
    try {
      await startCamera(next);
    } catch {
      setFacingMode(prev);
      toast.error("This device only has one camera.");
      startCamera(prev).catch(() => toast.error("Camera permission denied or unavailable."));
    }
  };

  const stopCamera = useCallback(() => { stopStream(); setPhase("idle"); }, [stopStream]);

  const rescan = () => {
    stopCamera();
    setCard(null); setVariants([]); setSelectedVariant(null);
    setImageFailed(false);
    setPokemonName(null); setFrozenFrame(null); setPricing(null);
    setConfirmSteps([]);
    setScanUrl(null);
    startCamera().catch(() => toast.error("Camera permission denied or unavailable."));
  };

  const selectVariant = useCallback(async (v: TcgCard) => {
    setSelectedVariant(v);
    setImageFailed(false);
    setPricing(null);
    setPricingLoading(true);
    const requestId = ++pricingRequestRef.current;
    pricingAbortRef.current?.abort();
    const controller = new AbortController();
    try {
      pricingAbortRef.current = controller;
      const res = await fetch(
          `${BASE}/api/cards/pricing?cardId=${encodeURIComponent(v.id)}&name=${encodeURIComponent(v.name)}&setName=${encodeURIComponent(v.setName)}&cardNumber=${encodeURIComponent(v.cardNumber)}${v.rarity ? `&rarity=${encodeURIComponent(v.rarity)}` : ""}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (res.ok) {
        const data = await res.json() as { pricing: PricingData };
        if (requestId === pricingRequestRef.current) setPricing(data.pricing ?? null);
      }
    } catch { /* keep existing pricing */ } finally {
      if (requestId === pricingRequestRef.current) setPricingLoading(false);
    }
  }, []);

  const selectCatalogCard = useCallback((catalog: CatalogCard) => {
    const replacement: TcgCard = {
      id: catalog.id,
      name: catalog.name,
      imageUrl: catalog.imageUrl ?? "",
      setName: catalog.setName ?? "",
      cardNumber: catalog.cardNumber ?? "",
      rarity: catalog.rarity ?? null,
    };
    setCard(replacement);
    setImageFailed(false);
    setVariants((current) => {
      const without = current.filter((v) => v.id !== replacement.id);
      return [replacement, ...without];
    });
    setCorrectionOpen(false);
    void selectVariant(replacement);
  }, [selectVariant]);

  // Disable pull-to-refresh for the duration of this page so an accidental
  // downward swipe during scanning doesn't wipe the session.
  useEffect(() => {
    const prev = document.body.style.overscrollBehaviorY;
    document.body.style.overscrollBehaviorY = "none";
    return () => { document.body.style.overscrollBehaviorY = prev; };
  }, []);

  // Check billing on mount — show paywall or auto-start camera
  useEffect(() => {
    if (billingLoading) return;
    if (!billing) return;
    if (billing.canScan) {
      startCamera().catch(() => toast.error("Camera permission denied or unavailable."));
    } else {
      const reason = !billing.freeTrialActivated
        ? "trial_not_activated"
        : billing.planTier === "free"
          ? "trial_exhausted"
          : "monthly_limit_reached";
      setPaywallReason(reason);
      setPaywallOpen(true);
    }
    return () => stopStream();
  }, [billingLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayCard = selectedVariant ?? card;
  const fallbackImage = scanUrl ?? frozenFrame;
  const displayImage = !imageFailed && displayCard?.imageUrl ? displayCard.imageUrl : fallbackImage;
  const confidenceEvidence = useMemo(() => ({
    observed: { visionConfidence: confidence, ocrName: pokemonName, ocrSetCode: observedSetCode, ocrCardNumber: observedCardNumber },
    candidate: displayCard ? { id: displayCard.id, name: displayCard.name, setId: displayCard.setId, setName: displayCard.setName, cardNumber: displayCard.cardNumber } : null,
    pricing,
    condition: null,
    context: { flow: "single_scan" },
  }), [confidence, pokemonName, observedSetCode, observedCardNumber, displayCard, pricing]);
  const capturing   = phase === "capturing";
  const analyzing   = phase === "analyzing";
  const confirming  = phase === "confirming";
  const done        = phase === "done";

  const CONFIDENCE_COLOR: Record<string, string> = {
    high:   "bg-emerald-500/15 text-emerald-700 border-emerald-200",
    medium: "bg-amber-500/15 text-amber-700 border-amber-200",
    low:    "bg-red-500/15 text-red-700 border-red-200",
  };

  return (
    <Layout>
      <ScanPaywall
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        reason={paywallReason}
      />
      {/*
        Two layout modes:
        - Scanning (not done): flex-column that fills the viewport below the
          sticky mobile header so the viewfinder is as tall as possible.
        - Done: normal scrollable content, viewfinder shrinks to aspect ratio.
      */}
      <div className={done
        ? "max-w-2xl mx-auto px-4 pt-6 pb-20"
        : "flex flex-col px-4 h-[calc(100dvh-6.5rem)] md:block md:h-auto md:max-w-2xl md:mx-auto md:py-8 md:pb-20"
      }>
        {/* Header */}
        <div className={`flex items-start justify-between gap-3 shrink-0 ${done ? "mb-6" : "py-3 md:mb-6 md:py-0"}`}>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <ScanLine className="h-7 w-7 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Card Scanner</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Center the card in the frame, then tap to take a photo.
            </p>
          </div>
          <Link href="/scan/bulk">
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
              <ScanLine className="h-3.5 w-3.5" /> Bulk
            </Button>
          </Link>
        </div>

        {/* ── Viewfinder ── */}
        {/* Mobile scanning: flex-1 fills all remaining height between header and buttons.
            Mobile done: aspect-[5/3] compact thumbnail.
            Desktop: always aspect-[5/3] via md: prefix. */}
        <div className={`relative w-full rounded-2xl overflow-hidden bg-zinc-950 shadow-xl border border-border ${
          done ? "aspect-[5/3]" : "flex-1 min-h-[22vh] md:flex-none md:aspect-[5/3]"
        }`}>
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${(analyzing || confirming || done) ? "opacity-0" : "opacity-100"}`}
          />
          {frozenFrame && (analyzing || confirming || done) && (
            <img src={frozenFrame} alt="Captured frame" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <canvas ref={canvasRef} style={{ position: "absolute", top: -9999, left: -9999, width: 1, height: 1 }} />

          {/* Card-shaped portrait guide frame (5:7 = Pokémon card ratio) */}
          {(capturing || analyzing) && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div
                className="relative h-[88%]"
                style={{ aspectRatio: "5 / 7" }}
              >
                {/* Dim outside the card frame */}
                <div className="absolute inset-0 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] rounded-xl" />
                {/* Corner brackets */}
                <div className="absolute -top-px -left-px w-7 h-7 border-l-2 border-t-2 border-white/90 rounded-tl-xl" />
                <div className="absolute -top-px -right-px w-7 h-7 border-r-2 border-t-2 border-white/90 rounded-tr-xl" />
                <div className="absolute -bottom-px -left-px w-7 h-7 border-l-2 border-b-2 border-white/90 rounded-bl-xl" />
                <div className="absolute -bottom-px -right-px w-7 h-7 border-r-2 border-b-2 border-white/90 rounded-br-xl" />
              </div>
            </div>
          )}

          {/* Idle state */}
          {phase === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950/95">
              <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                <Camera className="h-7 w-7 text-white/70" />
              </div>
              <p className="text-white/60 text-sm text-center px-8 max-w-xs">Start the camera, line up your Pokémon card in the frame, and tap the shutter</p>
              <Button onClick={() => void startCamera()} className="rounded-full px-6">
                <Camera className="h-4 w-4 mr-2" /> Start Camera
              </Button>
            </div>
          )}

          {/* Analyzing: AI processing the captured photo */}
          {analyzing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/70 backdrop-blur-sm">
              <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center">
                <Brain className="h-7 w-7 text-amber-300 animate-pulse" />
              </div>
              <p className="text-white font-semibold text-sm">Analyzing photo…</p>
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

          {/* Flip camera button — top-right corner during capture */}
          {capturing && !hasSingleCamera && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
              <span className="bg-black/60 backdrop-blur text-white/80 text-xs font-medium px-2 py-1 rounded-full select-none">
                {facingMode === "environment" ? "Rear" : "Front"}
              </span>
              <button
                type="button"
                onClick={() => { void flipCamera(); }}
                aria-label={facingMode === "environment" ? "Switch to front camera" : "Switch to rear camera"}
                className="w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white/90 hover:bg-black/80 transition-colors"
              >
                <SwitchCamera className="h-4.5 w-4.5" style={{ width: "1.125rem", height: "1.125rem" }} />
              </button>
            </div>
          )}

          {/* Bottom hint pill while capturing */}
          {capturing && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
              <div className="bg-black/70 backdrop-blur text-white/80 text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-2">
                <ScanLine className="h-3 w-3" />
                Line up the card, then tap the shutter
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className={`flex gap-2 ${done ? "mt-3" : "shrink-0 mt-2 py-2"}`}>
          {capturing && (
            <>
              <Button variant="outline" className="rounded-xl" onClick={stopCamera}>
                <CameraOff className="h-4 w-4 mr-2" /> Stop
              </Button>
              <Button className="flex-1 rounded-xl h-11 text-base font-semibold" onClick={takePhoto}>
                <Aperture className="h-5 w-5 mr-2" /> Take Photo
              </Button>
            </>
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
                <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed px-3 py-2">
                  <p className="text-xs text-muted-foreground">Wrong printing or card?</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setCorrectionOpen((open) => !open)}
                  >
                    {correctionOpen ? "Close search" : "Not your card? Search all cards"}
                  </Button>
                </div>
                {correctionOpen && (
                  <div className="rounded-2xl border bg-card p-4">
                    <CatalogSearch
                      autoFocus
                      onSelect={selectCatalogCard}
                      emptyHint="Search the full catalog for the card you have."
                    />
                  </div>
                )}
                {/* Main card row */}
                <div className="flex gap-4 bg-card border rounded-2xl overflow-hidden shadow-sm">
                  <div className="w-28 shrink-0 bg-muted">
                     {displayImage
                       ? <img
                           src={displayImage}
                           alt={displayCard.name}
                           className="w-full h-full object-cover"
                           onError={() => setImageFailed(true)}
                         />
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
                    <Button
                      id="scan-add-to-collection"
                      size="sm"
                      className="mt-3 rounded-lg"
                      disabled={pricingLoading}
                      onClick={async () => {
                        // If the scan upload is still in flight, wait briefly
                        // (max 4s) so we can attach `originalScanUrl`.
                        let finalScanUrl = scanUrl;
                        if (!finalScanUrl && scanUploadRef.current) {
                          finalScanUrl = await Promise.race([
                            scanUploadRef.current,
                            new Promise<null>((r) => setTimeout(() => r(null), 4000)),
                          ]);
                        }
                        const url = [
                          `/collection/new`,
                          `?name=${encodeURIComponent(displayCard.name)}`,
                          `&pokemonName=${encodeURIComponent(pokemonName ?? displayCard.name)}`,
                          `&setName=${encodeURIComponent(displayCard.setName)}`,
                          `&cardNumber=${encodeURIComponent(displayCard.cardNumber)}`,
                           `&imageUrl=${encodeURIComponent(displayCard.imageUrl || finalScanUrl || "")}`,
                          displayCard.id ? `&catalogCardId=${encodeURIComponent(displayCard.id)}` : "",
                          finalScanUrl ? `&originalScanUrl=${encodeURIComponent(finalScanUrl)}` : "",
                          pricing?.marketPrice != null ? `&estimatedValue=${pricing.marketPrice}` : "",
                        ].join("");
                        navigate(url);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add to Collection
                      {!scanUrl && scanUploadRef.current && (
                        <Loader2 className="h-3 w-3 ml-1.5 animate-spin opacity-70" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Market value */}
                {(pricing != null || pricingLoading) && (
                  <div className="relative bg-card border rounded-2xl p-4 space-y-3">
                    {pricingLoading && (
                      <div className="absolute inset-0 rounded-2xl bg-background/60 flex items-center justify-center z-10">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm">Market Value</h3>
                      <div className="ml-auto flex items-center gap-1.5">
                        {pricing?.isFallback && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">similar printing</span>
                        )}
                        {pricing?.source && (
                          <span className="text-[10px] text-muted-foreground capitalize">{pricing.source === "tcgplayer" ? "TCGPlayer" : "CardMarket"}</span>
                        )}
                      </div>
                    </div>
                    {pricing && (pricing.marketPrice != null || pricing.lowPrice != null) ? (
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
                    ) : !pricingLoading && (
                      <p className="text-sm text-muted-foreground">No market value available for this printing.</p>
                    )}
                    {pricing?.ebay && pricing.ebay.count >= 3 && (
                      <div className="mt-3 pt-3 border-t border-border/60">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            eBay Sold ({pricing.ebay.count})
                          </p>
                          <a
                            href={pricing.ebay.searchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-primary hover:underline"
                          >
                            View on eBay →
                          </a>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {pricing.ebay.median != null && (
                            <div className="text-center">
                              <p className="text-[10px] text-muted-foreground mb-0.5">Median</p>
                              <p className="font-bold text-base">{fmt(pricing.ebay.median)}</p>
                            </div>
                          )}
                          {pricing.ebay.low != null && (
                            <div className="text-center">
                              <p className="text-[10px] text-muted-foreground mb-0.5">Low</p>
                              <p className="font-semibold text-base text-muted-foreground">{fmt(pricing.ebay.low)}</p>
                            </div>
                          )}
                          {pricing.ebay.high != null && (
                            <div className="text-center">
                              <p className="text-[10px] text-muted-foreground mb-0.5">High</p>
                              <p className="font-semibold text-base">{fmt(pricing.ebay.high)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {displayCard && (
                  <CardConfidenceScorecard
                    endpoint={`${BASE}/api/cards/confidence`}
                    evidence={confidenceEvidence}
                    actionTargets={{
                      confirm_condition: {
                        label: "Add card to choose condition",
                        onClick: () => document.getElementById("scan-add-to-collection")?.click(),
                      },
                      complete_listing: {
                        label: "Add card to start listing",
                        onClick: () => document.getElementById("scan-add-to-collection")?.click(),
                      },
                    }}
                  />
                )}

                {/* PSA grades */}
                {(pricing?.psaEstimates || pricingLoading) ? (
                  <div className="relative bg-card border rounded-2xl p-4 space-y-3">
                    {pricingLoading && (
                      <div className="absolute inset-0 rounded-2xl bg-background/60 flex items-center justify-center z-10">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-amber-500" />
                      <h3 className="font-semibold text-sm">Estimated PSA Graded Value</h3>
                    </div>
                    <p className="text-[11px] text-muted-foreground -mt-1">Based on market price × grade multiplier. Estimates only.</p>
                    <div className="space-y-1.5">
                      {PSA_GRADES.map((grade) => {
                        const val = pricing?.psaEstimates?.[grade];
                        if (val == null) return null;
                        const pct = Math.min(100, (val / (pricing!.psaEstimates![10] ?? val)) * 100);
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
                ) : null}

                {/* Other printings */}
                {variants.length > 1 && (
                  <div style={{ width: "100%", maxWidth: "100vw", overflow: "hidden" }}>
                    <h3 className="font-semibold text-sm mb-1">Other printings</h3>
                    <p className="text-xs text-muted-foreground mb-3">Tap the one you have.</p>
                    <div
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        overflowX: "auto",
                        WebkitOverflowScrolling: "touch",
                        overscrollBehaviorX: "contain",
                      }}
                    >
                    <div className="flex gap-2 pb-2">
                      {variants.map((v) => {
                        const active = (selectedVariant?.id ?? card?.id) === v.id;
                        return (
                          <button
                            key={v.id}
                            onClick={() => selectVariant(v)}
                            className={`shrink-0 w-20 rounded-xl overflow-hidden border-2 transition-all ${active ? "border-primary scale-105 shadow-md" : "border-transparent hover:border-border"}`}
                          >
                            <div className="aspect-[3/4] bg-muted flex items-center justify-center">
                              <img
                                src={v.imageUrl || "/logo.png"}
                                alt={v.imageUrl ? v.name : ""}
                                aria-hidden={!v.imageUrl}
                                className={v.imageUrl
                                  ? "w-full h-full object-cover"
                                  : "w-full h-full object-contain p-3 grayscale opacity-20"}
                                onError={(event) => {
                                  event.currentTarget.onerror = null;
                                  event.currentTarget.src = "/logo.png";
                                  event.currentTarget.alt = "";
                                  event.currentTarget.className = "w-full h-full object-contain p-3 grayscale opacity-20";
                                }}
                              />
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

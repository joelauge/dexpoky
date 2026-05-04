import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import {
  Aperture,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  ScanLine,
  Trash2,
  X,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useBillingStatus, useRecordScan } from "@/hooks/useBilling";
import { ScanPaywall } from "@/components/scan-paywall";
import {
  useCreateCard,
  useListCategories,
  CreateCardBodyCondition,
  CreateCardBodyRarity,
} from "@workspace/api-client-react";

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
  isFallback?: boolean;
}

type EntryStatus =
  | "analyzing"
  | "ready"
  | "no_card"
  | "error"
  | "saving"
  | "saved"
  | "save_failed";

interface BulkEntry {
  id: string;
  imageData: string;            // base64 captured frame
  status: EntryStatus;
  pokemonName?: string;
  variants: TcgCard[];
  selectedVariantId?: string;
  pricing?: PricingData | null;
  condition: CreateCardBodyCondition;
  categoryId: number | null;    // null = uncategorized
  include: boolean;
  errorMsg?: string;
  saveError?: string;
}

type Phase = "idle" | "capturing" | "reviewing" | "saving" | "done";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const MAX_CARDS = 25;
const LAST_CAT_KEY = "dexpoky:lastCategoryId";
const LAST_CONDITION_KEY = "dexpoky:lastCondition";

const CONDITIONS: { value: CreateCardBodyCondition; label: string }[] = [
  { value: CreateCardBodyCondition.mint,         label: "Mint" },
  { value: CreateCardBodyCondition.near_mint,    label: "Near Mint" },
  { value: CreateCardBodyCondition.excellent,    label: "Excellent" },
  { value: CreateCardBodyCondition.good,         label: "Good" },
  { value: CreateCardBodyCondition.light_played, label: "Lightly Played" },
  { value: CreateCardBodyCondition.played,       label: "Played" },
  { value: CreateCardBodyCondition.poor,         label: "Poor" },
];

function readLastCondition(): CreateCardBodyCondition {
  try {
    const v = localStorage.getItem(LAST_CONDITION_KEY);
    if (v && Object.values(CreateCardBodyCondition).includes(v as CreateCardBodyCondition)) {
      return v as CreateCardBodyCondition;
    }
  } catch { /* ignore */ }
  return CreateCardBodyCondition.near_mint;
}

function readLastCategoryId(): number | null {
  try {
    const v = localStorage.getItem(LAST_CAT_KEY);
    const n = v ? parseInt(v, 10) : NaN;
    return isNaN(n) ? null : n;
  } catch { return null; }
}

function fmt(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ScanBulkPage() {
  const [, setLocation] = useLocation();
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [entries, setEntries] = useState<BulkEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  // Refs to prevent races during async ops:
  //  - inflightCountRef: tracks captures NOT yet added to state, so we don't blow past MAX_CARDS
  //  - haltedRef: set to true once billing limit hit, stops further detections + captures
  //  - abortControllersRef: per-entry, aborted when entry removed or batch reset
  const inflightCountRef = useRef(0);
  const haltedRef = useRef(false);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const { data: billing, isLoading: billingLoading } = useBillingStatus();
  const recordScan = useRecordScan();
  const createCard = useCreateCard();
  const { data: categories } = useListCategories();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] =
    useState<"trial_not_activated" | "trial_exhausted" | "monthly_limit_reached" | null>(null);

  // ── Camera ────────────────────────────────────────────────────────────────
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch { /* ignore */ }
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
      });
      streamRef.current = ms;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = ms;
      await new Promise<void>((resolve) => {
        video.oncanplay = () => resolve();
        video.play().catch(() => resolve());
      });
      setPhase("capturing");
    } catch {
      toast.error("Camera permission denied or unavailable.");
      setPhase("idle");
    }
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return null;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.8);
  }, []);

  // ── Background detection per entry ────────────────────────────────────────
  const processEntry = useCallback(async (entryId: string, imageData: string) => {
    const controller = new AbortController();
    abortControllersRef.current.set(entryId, controller);
    const signal = controller.signal;

    const isAborted = () => signal.aborted || haltedRef.current;

    try {
      // 1. Identify the card (vision)
      if (isAborted()) return;
      const idRes = await fetch(`${BASE}/api/cards/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
        signal,
      });
      if (!idRes.ok) throw new Error("identify failed");
      const idData = await idRes.json() as {
        detected: boolean; confidence: "high"|"medium"|"low"; pokemonName: string | null;
      };
      if (isAborted()) return;
      if (!idData.detected || !idData.pokemonName) {
        setEntries((prev) => prev.map((e) =>
          e.id === entryId ? { ...e, status: "no_card", errorMsg: "No card detected" } : e
        ));
        return;
      }

      // 2. Record the scan against billing limits (counts only on detected cards)
      try {
        const recRes = await new Promise<{ allowed: boolean; reason?: string }>((resolve) => {
          recordScan.mutate(undefined, {
            onSuccess: (r) => resolve(r),
            onError: () => resolve({ allowed: true }),
          });
        });
        if (!recRes.allowed) {
          // Halt further work in this batch so we don't keep counting scans
          haltedRef.current = true;
          // Abort every other in-flight detection
          abortControllersRef.current.forEach((c, id) => {
            if (id !== entryId) c.abort();
          });
          const reason = recRes.reason === "monthly_limit_reached"
            ? "monthly_limit_reached" : "trial_exhausted";
          setPaywallReason(reason);
          setPaywallOpen(true);
          setEntries((prev) => prev.map((e) =>
            e.id === entryId ? { ...e, status: "error", errorMsg: "Scan limit reached" } : e
          ));
          return;
        }
      } catch { /* ignore — billing already counted client-side */ }

      // 3. Look up TCG variants + pricing
      if (isAborted()) return;
      const lookupRes = await fetch(
        `${BASE}/api/cards/lookup?name=${encodeURIComponent(idData.pokemonName)}`,
        { signal },
      );
      if (!lookupRes.ok) throw new Error("lookup failed");
      const lookupData = await lookupRes.json() as {
        card: TcgCard | null; variants: TcgCard[]; pricing: PricingData;
      };
      if (isAborted()) return;

      setEntries((prev) => prev.map((e) =>
        e.id === entryId
          ? {
              ...e,
              status: "ready",
              pokemonName: idData.pokemonName ?? undefined,
              variants: lookupData.variants ?? [],
              selectedVariantId: lookupData.card?.id ?? lookupData.variants?.[0]?.id,
              pricing: lookupData.pricing ?? null,
            }
          : e
      ));
    } catch (err) {
      // Swallow abort errors silently; surface only real failures
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (signal.aborted) return;
      setEntries((prev) => prev.map((e) =>
        e.id === entryId ? { ...e, status: "error", errorMsg: "Detection failed" } : e
      ));
    } finally {
      abortControllersRef.current.delete(entryId);
    }
  }, [recordScan]);

  // ── Capture button ────────────────────────────────────────────────────────
  const takePhoto = useCallback(() => {
    // Use ref-tracked count to prevent rapid-tap from blowing past the cap
    // before React state updates land.
    if (inflightCountRef.current >= MAX_CARDS) {
      toast.warning(`Max ${MAX_CARDS} cards per batch — tap Done to review.`);
      return;
    }
    if (haltedRef.current) {
      toast.warning("Scan limit reached — review what you've captured.");
      return;
    }
    const imageData = captureFrame();
    if (!imageData) {
      toast.error("Couldn't capture photo — please try again.");
      return;
    }
    inflightCountRef.current += 1;
    const id = uid();
    const entry: BulkEntry = {
      id,
      imageData,
      status: "analyzing",
      variants: [],
      condition: readLastCondition(),
      categoryId: readLastCategoryId(),
      include: true,
    };
    setEntries((prev) => [...prev, entry]);
    void processEntry(id, imageData);
  }, [captureFrame, processEntry]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (billingLoading || !billing) return;
    if (billing.canScan) {
      void startCamera();
    } else {
      const reason = !billing.freeTrialActivated
        ? "trial_not_activated"
        : billing.planTier === "free"
          ? "trial_exhausted"
          : "monthly_limit_reached";
      setPaywallReason(reason);
      setPaywallOpen(true);
    }
    return () => {
      stopStream();
      // Abort any background detections so they don't update unmounted state
      abortControllersRef.current.forEach((c) => c.abort());
      abortControllersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingLoading]);

  // ── Review actions ────────────────────────────────────────────────────────
  const goToReview = useCallback(() => {
    if (entries.length === 0) {
      toast.info("Capture at least one card before reviewing.");
      return;
    }
    stopStream();
    setPhase("reviewing");
  }, [entries.length, stopStream]);

  const backToCapturing = useCallback(() => {
    setPhase("idle");
    void startCamera();
  }, [startCamera]);

  const removeEntry = useCallback((id: string) => {
    // Cancel any in-flight detection for this entry
    const ctrl = abortControllersRef.current.get(id);
    if (ctrl) {
      ctrl.abort();
      abortControllersRef.current.delete(id);
    }
    inflightCountRef.current = Math.max(0, inflightCountRef.current - 1);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setExpanded((cur) => (cur === id ? null : cur));
  }, []);

  const updateEntry = useCallback((id: string, patch: Partial<BulkEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  // ── Save All ──────────────────────────────────────────────────────────────
  const saveAll = useCallback(async () => {
    // Snapshot the entries to save at the moment Save is pressed, so any
    // mid-save edits to `entries` (e.g. user removes a row) don't shift the loop.
    const toSave = entries.filter((e) => e.include && e.status === "ready");
    if (toSave.length === 0) {
      toast.info("Nothing to save — all entries are excluded or unidentified.");
      return;
    }
    setPhase("saving");
    setSavedCount(0);
    setFailedCount(0);

    // Persist last condition/category up-front from the most-recent entry
    try {
      const last = toSave[toSave.length - 1];
      if (last) {
        localStorage.setItem(LAST_CONDITION_KEY, last.condition);
        if (last.categoryId != null) {
          localStorage.setItem(LAST_CAT_KEY, String(last.categoryId));
        }
      }
    } catch { /* ignore */ }

    // Save serially to keep DB ordering predictable + avoid hammering the
    // server with parallel inserts. Update counters via refs to avoid
    // stale-closure issues, then batch into state.
    let saved = 0;
    let failed = 0;
    for (const entry of toSave) {
      const variant = entry.variants.find((v) => v.id === entry.selectedVariantId)
        ?? entry.variants[0];
      if (!variant) {
        updateEntry(entry.id, { status: "save_failed", saveError: "No printing selected" });
        failed++; setFailedCount(failed);
        continue;
      }
      updateEntry(entry.id, { status: "saving" });
      try {
        // Map the TCG-reported rarity string to our enum, falling back to common.
        const rarityKey = (variant.rarity ?? "")
          .toLowerCase().replace(/\s+/g, "_") as keyof typeof CreateCardBodyRarity;
        const rarity = CreateCardBodyRarity[rarityKey] ?? CreateCardBodyRarity.common;

        await createCard.mutateAsync({
          data: {
            name: variant.name,
            pokemonName: entry.pokemonName ?? variant.name,
            setName: variant.setName || undefined,
            cardNumber: variant.cardNumber || undefined,
            rarity,
            condition: entry.condition,
            imageUrl: variant.imageUrl || null,
            estimatedValue: entry.pricing?.marketPrice ?? null,
            categoryId: entry.categoryId ?? null,
            forSale: false,
          },
        });
        updateEntry(entry.id, { status: "saved" });
        saved++; setSavedCount(saved);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed";
        updateEntry(entry.id, { status: "save_failed", saveError: msg });
        failed++; setFailedCount(failed);
      }
    }

    setPhase("done");
    if (saved > 0 && failed === 0) {
      toast.success(`Saved ${saved} card${saved === 1 ? "" : "s"} to your collection.`);
    } else if (saved > 0) {
      toast.warning(`Saved ${saved}, ${failed} failed.`);
    } else {
      toast.error("None of the cards could be saved.");
    }
  }, [entries, createCard, updateEntry]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const analyzing = entries.filter((e) => e.status === "analyzing").length;
    const ready     = entries.filter((e) => e.status === "ready").length;
    const failed    = entries.filter((e) => e.status === "no_card" || e.status === "error").length;
    return { analyzing, ready, failed, total: entries.length };
  }, [entries]);

  const reviewableCount = useMemo(
    () => entries.filter((e) => e.include && e.status === "ready").length,
    [entries],
  );

  // ── Render helpers ────────────────────────────────────────────────────────
  function StatusDot({ status }: { status: EntryStatus }) {
    if (status === "analyzing" || status === "saving") {
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    }
    if (status === "ready") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    if (status === "saved") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    if (status === "no_card" || status === "error" || status === "save_failed") {
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    }
    return null;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4 pb-32">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" />
              Bulk Scan
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Snap up to {MAX_CARDS} cards in a row, then review and save them all at once.
            </p>
          </div>
          <Link href="/scan">
            <Button variant="ghost" size="sm" className="text-xs">Single scan</Button>
          </Link>
        </header>

        {/* CAPTURE PHASE */}
        {(phase === "idle" || phase === "capturing") && (
          <div className="space-y-3">
            <div
              className="relative bg-black rounded-2xl overflow-hidden mx-auto"
              style={{ aspectRatio: "5 / 3", maxWidth: "100%" }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(1)" }}
              />
              {/* Card-shaped guide overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className="relative border-2 border-white/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                  style={{ aspectRatio: "5 / 7", height: "85%" }}
                >
                  <span className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-amber-400 rounded-tl-lg" />
                  <span className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-amber-400 rounded-tr-lg" />
                  <span className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-amber-400 rounded-bl-lg" />
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-amber-400 rounded-br-lg" />
                </div>
              </div>
              {/* Counter */}
              <div className="absolute top-3 left-3 bg-black/60 text-white text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm">
                {entries.length} / {MAX_CARDS}
              </div>
              {phase !== "capturing" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Button onClick={startCamera} size="lg" className="gap-2">
                    <Camera className="h-4 w-4" /> Start Camera
                  </Button>
                </div>
              )}
            </div>

            {/* Capture button */}
            {phase === "capturing" && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={takePhoto}
                  size="lg"
                  className="flex-1 gap-2 h-14 text-base font-bold"
                  disabled={entries.length >= MAX_CARDS}
                >
                  <Aperture className="h-5 w-5" />
                  {entries.length >= MAX_CARDS ? "Batch full" : "Capture Card"}
                </Button>
                <Button
                  onClick={goToReview}
                  size="lg"
                  variant={entries.length > 0 ? "default" : "outline"}
                  className="h-14 px-5 gap-2"
                  disabled={entries.length === 0}
                >
                  <Check className="h-4 w-4" />
                  Done ({entries.length})
                </Button>
              </div>
            )}

            {/* Thumbnail strip */}
            {entries.length > 0 && (
              <div style={{ maxWidth: "100vw", overflow: "hidden" }}>
                <div className="overflow-x-auto -mx-4 px-4 pb-1" style={{ overflowX: "auto" }}>
                  <div className="flex gap-2">
                    {entries.map((e) => (
                      <div
                        key={e.id}
                        className="relative shrink-0 w-16 h-20 rounded-lg overflow-hidden border border-border bg-muted"
                      >
                        <img src={e.imageData} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <StatusDot status={e.status} />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeEntry(e.id)}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow"
                          aria-label="Remove"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground px-1">
                  {stats.analyzing > 0 && <span>{stats.analyzing} analyzing</span>}
                  {stats.ready > 0 && <span className="text-emerald-600">{stats.ready} ready</span>}
                  {stats.failed > 0 && <span className="text-red-500">{stats.failed} failed</span>}
                </div>
              </div>
            )}

            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}

        {/* REVIEW PHASE */}
        {phase === "reviewing" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2">
              <div className="text-sm">
                <span className="font-semibold">{reviewableCount}</span>
                <span className="text-muted-foreground"> of {entries.length} ready to save</span>
              </div>
              <Button variant="ghost" size="sm" onClick={backToCapturing} className="gap-1 text-xs">
                <Camera className="h-3.5 w-3.5" /> Add more
              </Button>
            </div>

            {entries.map((e) => {
              const variant = e.variants.find((v) => v.id === e.selectedVariantId) ?? e.variants[0];
              const isOpen = expanded === e.id;
              return (
                <div
                  key={e.id}
                  className={`border rounded-2xl overflow-hidden transition-colors ${
                    e.include && e.status === "ready" ? "border-border" : "border-dashed border-border opacity-70"
                  }`}
                >
                  {/* Row header */}
                  <div className="flex gap-3 p-3 items-start">
                    <img
                      src={e.imageData}
                      alt=""
                      className="w-14 h-20 rounded-md object-cover bg-muted shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <StatusDot status={e.status} />
                        <p className="text-sm font-semibold truncate">
                          {e.status === "analyzing" && "Analyzing…"}
                          {(e.status === "no_card" || e.status === "error") && (e.errorMsg ?? "Failed")}
                          {(e.status === "ready" || e.status === "saving" || e.status === "saved" || e.status === "save_failed") &&
                            (variant?.name ?? e.pokemonName ?? "Unknown")}
                        </p>
                      </div>
                      {variant && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {variant.setName} · #{variant.cardNumber || "?"}
                        </p>
                      )}
                      {e.status === "ready" && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <Badge variant="outline" className="text-[10px] py-0 h-5 capitalize">
                            {CONDITIONS.find((c) => c.value === e.condition)?.label}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] py-0 h-5">
                            {e.categoryId == null
                              ? "Uncategorized"
                              : (categories?.find((c) => c.id === e.categoryId)?.name ?? "Category")}
                          </Badge>
                          {e.pricing?.marketPrice != null && (
                            <Badge variant="secondary" className="text-[10px] py-0 h-5">
                              {fmt(e.pricing.marketPrice)}
                            </Badge>
                          )}
                          {e.variants.length > 1 && (
                            <Badge variant="outline" className="text-[10px] py-0 h-5">
                              {e.variants.length} printings
                            </Badge>
                          )}
                        </div>
                      )}
                      {e.status === "saved" && (
                        <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                          <Check className="h-3 w-3" /> Added to collection
                        </p>
                      )}
                      {e.status === "save_failed" && (
                        <p className="text-[11px] text-red-500 mt-1">{e.saveError}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {e.status === "ready" && (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : e.id)}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-muted"
                        >
                          {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeEntry(e.id)}
                        className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
                        aria-label="Remove from batch"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded editor */}
                  {isOpen && e.status === "ready" && (
                    <div className="border-t bg-muted/30 p-3 space-y-4">
                      {/* Other Printings */}
                      {e.variants.length > 1 && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Other Printings
                          </p>
                          <div style={{ maxWidth: "100vw", overflow: "hidden" }}>
                            <div className="overflow-x-auto -mx-3 px-3 pb-1" style={{ overflowX: "auto" }}>
                              <div className="flex gap-2">
                                {e.variants.slice(0, 20).map((v) => {
                                  const selected = v.id === (e.selectedVariantId ?? e.variants[0]?.id);
                                  return (
                                    <button
                                      key={v.id}
                                      type="button"
                                      onClick={() => updateEntry(e.id, { selectedVariantId: v.id })}
                                      className={`shrink-0 w-20 rounded-lg overflow-hidden border-2 transition-all ${
                                        selected ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-border"
                                      }`}
                                    >
                                      <div className="aspect-[5/7] bg-muted relative">
                                        {v.imageUrl ? (
                                          <img src={v.imageUrl} alt={v.name} className="w-full h-full object-contain" />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">no image</div>
                                        )}
                                        {selected && (
                                          <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center">
                                            <Check className="h-2.5 w-2.5" />
                                          </div>
                                        )}
                                      </div>
                                      <p className="text-[9px] px-1 py-0.5 truncate text-center">{v.setName}</p>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Condition */}
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Condition
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {CONDITIONS.map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => updateEntry(e.id, { condition: c.value })}
                              className={`text-xs px-3 py-2 rounded-lg border text-left transition-colors ${
                                e.condition === c.value
                                  ? "border-primary bg-primary/10 text-primary font-semibold"
                                  : "border-border hover:bg-muted"
                              }`}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Category */}
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Category
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateEntry(e.id, { categoryId: null })}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                              e.categoryId == null
                                ? "border-primary bg-primary/10 text-primary font-semibold"
                                : "border-border hover:bg-muted"
                            }`}
                          >
                            Uncategorized
                          </button>
                          {(categories ?? []).map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => updateEntry(e.id, { categoryId: cat.id })}
                              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                                e.categoryId === cat.id
                                  ? "border-primary bg-primary/10 text-primary font-semibold"
                                  : "border-border hover:bg-muted"
                              }`}
                            >
                              {cat.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* SAVING / DONE */}
        {(phase === "saving" || phase === "done") && (
          <div className="space-y-3">
            {phase === "saving" && (
              <div className="bg-muted/50 rounded-xl p-4 flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">Saving cards…</p>
                  <p className="text-xs text-muted-foreground">
                    {savedCount} saved · {failedCount} failed
                  </p>
                </div>
              </div>
            )}
            {phase === "done" && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 text-center space-y-2">
                <Sparkles className="h-8 w-8 text-emerald-600 mx-auto" />
                <h2 className="text-lg font-bold">Batch complete</h2>
                <p className="text-sm text-muted-foreground">
                  Added <span className="font-bold text-foreground">{savedCount}</span> card{savedCount === 1 ? "" : "s"} to your collection.
                  {failedCount > 0 && <> {failedCount} failed.</>}
                </p>
                <div className="flex gap-2 justify-center pt-2">
                  <Button onClick={() => setLocation("/collection")} size="sm" className="gap-1">
                    View Collection
                  </Button>
                  <Button
                    onClick={() => {
                      // Abort any lingering in-flight requests and reset all refs
                      abortControllersRef.current.forEach((c) => c.abort());
                      abortControllersRef.current.clear();
                      inflightCountRef.current = 0;
                      haltedRef.current = false;
                      setEntries([]);
                      setExpanded(null);
                      setSavedCount(0);
                      setFailedCount(0);
                      setPhase("idle");
                      void startCamera();
                    }}
                    size="sm"
                    variant="outline"
                    className="gap-1"
                  >
                    <Plus className="h-4 w-4" /> New Batch
                  </Button>
                </div>
              </div>
            )}

            {/* Show per-entry results */}
            <div className="space-y-2">
              {entries.map((e) => {
                const variant = e.variants.find((v) => v.id === e.selectedVariantId) ?? e.variants[0];
                return (
                  <div key={e.id} className="flex items-center gap-3 border rounded-xl p-2.5">
                    <img src={e.imageData} alt="" className="w-10 h-14 rounded object-cover bg-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{variant?.name ?? e.pokemonName ?? "Unknown"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{variant?.setName ?? "—"}</p>
                    </div>
                    <StatusDot status={e.status} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sticky bottom action bar (review phase only) */}
        {phase === "reviewing" && (
          <div className="fixed bottom-4 left-0 right-0 px-4 z-30">
            <div className="max-w-2xl mx-auto bg-background/95 backdrop-blur border shadow-lg rounded-2xl p-3 flex items-center gap-2">
              <Button variant="outline" onClick={backToCapturing} className="gap-1">
                <Camera className="h-4 w-4" /> Add more
              </Button>
              <Button
                onClick={saveAll}
                disabled={reviewableCount === 0 || createCard.isPending}
                className="flex-1 gap-1 h-11 font-bold"
              >
                <Check className="h-4 w-4" />
                Save {reviewableCount} Card{reviewableCount === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <ScanPaywall
        open={paywallOpen}
        onClose={() => {
          setPaywallOpen(false);
          if (!billing?.canScan) setLocation("/collection");
        }}
        reason={paywallReason}
      />
    </Layout>
  );
}

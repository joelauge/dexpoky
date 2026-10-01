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
  RefreshCw,
  ScanLine,
  SwitchCamera,
  Trash2,
  X,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useBillingStatus, useRecordScan } from "@/hooks/useBilling";
import { useCameraFacing } from "@/hooks/useCameraFacing";
import { ScanPaywall } from "@/components/scan-paywall";
import { captureCardCrop, captureBottomCrop } from "@/lib/capture-crop";
import { uploadScanImage } from "@/lib/upload-scan";
import { Input } from "@/components/ui/input";
import { CardConfidenceScorecard } from "@/components/card-confidence-scorecard";
import { ScanPrintingPicker, type ScanPrinting } from "@/components/scan-printing-picker";
import { ScanPrintingAssessment } from "@/components/scan-printing-assessment";
import type { ScanPrintingSelection } from "@/lib/scan-printing-selection";
import { useAuthFetch } from "@/lib/use-auth-fetch";
import {
  useCreateCard,
  useListCategories,
  useCreateCategory,
  CreateCardBodyCondition,
  CreateCardBodyRarity,
  ApiError,
} from "@workspace/api-client-react";

interface TcgCard {
  id: string;
  name: string;
  imageUrl: string;
  setName: string;
  setId?: string;
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
  originalScanUrl?: string | null; // uploaded scan URL (resolved in background)
  status: EntryStatus;
  pokemonName?: string;
  observedSetCode?: string | null;
  observedCardNumber?: string | null;
  visionConfidence?: "high" | "medium" | "low";
  printingSelection?: ScanPrintingSelection;
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
  const [previewEntryId, setPreviewEntryId] = useState<string | null>(null);

  const { facingMode, facingModeRef, setFacingMode } = useCameraFacing();
  const [hasSingleCamera, setHasSingleCamera] = useState(false);

  // Refs to prevent races during async ops:
  //  - inflightCountRef: tracks captures NOT yet added to state, so we don't blow past MAX_CARDS
  //  - haltedRef: set to true once billing limit hit, stops further detections + captures
  //  - abortControllersRef: per-entry, aborted when entry removed or batch reset
  const inflightCountRef = useRef(0);
  const haltedRef = useRef(false);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const pricingRequestsRef = useRef<Map<string, { variantId: string; controller: AbortController }>>(new Map());

  useEffect(() => () => {
    for (const request of pricingRequestsRef.current.values()) request.controller.abort();
    pricingRequestsRef.current.clear();
  }, []);

  const { data: billing, isLoading: billingLoading } = useBillingStatus();
  const authFetch = useAuthFetch();
  const recordScan = useRecordScan();
  const createCard = useCreateCard();
  const { data: categories } = useListCategories();
  const createCategory = useCreateCategory();
  const [newCatEntryId, setNewCatEntryId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState("");

  async function handleCreateCategory(entryId: string) {
    const name = newCatName.trim();
    if (!name) return;
    try {
      const created = await createCategory.mutateAsync({ data: { name } });
      updateEntry(entryId, { categoryId: created.id });
      setNewCatEntryId(null);
      setNewCatName("");
    } catch {
      toast.error("Couldn't create category");
    }
  }
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

  const startCamera = useCallback(async (facing?: "environment" | "user") => {
    const mode = facing ?? facingModeRef.current;
    const ms = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: mode, width: { ideal: 3840 }, height: { ideal: 2160 } },
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
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      setHasSingleCamera(videoInputs.length <= 1);
    } catch { /* ignore — flip button stays visible */ }
  }, []);

  const flipCamera = useCallback(async () => {
    const prev = facingModeRef.current;
    const next = prev === "environment" ? "user" : "environment";
    setFacingMode(next);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      await startCamera(next);
    } catch {
      setFacingMode(prev);
      toast.error("This device only has one camera.");
      startCamera(prev).catch(() => {
        toast.error("Camera permission denied or unavailable.");
        setPhase("idle");
      });
    }
  }, [startCamera, setFacingMode, facingModeRef]);

  // Crop to the on-screen card guide (85% of viewport height in bulk mode).
  const captureFrame = useCallback((): string | null => {
    return captureCardCrop(videoRef.current, canvasRef.current, 0.85);
  }, []);

  // Zoomed crop of just the bottom strip where set code + number are printed.
  const captureCorner = useCallback((): string | null => {
    return captureBottomCrop(videoRef.current, canvasRef.current, 0.85);
  }, []);

  // ── Background detection per entry ────────────────────────────────────────
  const processEntry = useCallback(async (entryId: string, imageData: string, cornerImageData?: string) => {
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
        body: JSON.stringify({ imageData, ...(cornerImageData ? { cornerImageData } : {}) }),
        signal,
      });
      if (!idRes.ok) throw new Error("identify failed");
      const idData = await idRes.json() as {
        detected: boolean;
        confidence: "high"|"medium"|"low";
        pokemonName: string | null;
        setCode?: string | null;
        cardNumber?: string | null;
        hp?: number | null;
        visualSummary?: string | null;
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
      const lookupParams = new URLSearchParams({ name: idData.pokemonName });
      if (idData.cardNumber) lookupParams.set("cardNumber", idData.cardNumber);
      if (idData.setCode) lookupParams.set("setCode", idData.setCode);
      lookupParams.set("resolvePrinting", "true");
      lookupParams.set("visionConfidence", idData.confidence);
      if (idData.visualSummary) lookupParams.set("visualSummary", idData.visualSummary);
      if (idData.hp != null) lookupParams.set("hp", String(idData.hp));
      const lookupRes = await authFetch(
        `${BASE}/api/cards/lookup?${lookupParams.toString()}`,
        { signal },
      );
      if (!lookupRes.ok) throw new Error("lookup failed");
      const lookupData = await lookupRes.json() as {
        card: TcgCard | null; variants: TcgCard[]; pricing: PricingData; selection?: ScanPrintingSelection;
      };
      if (isAborted()) return;

      const variants = lookupData.variants ?? [];
      setEntries((prev) => prev.map((e) =>
        e.id === entryId
          ? {
              ...e,
              // If lookup found no printings we cannot save this card —
              // mark it as a hard failure so saveAll never tries to POST it
              // (the previous code marked it `ready` with empty variants,
              // which caused saveAll to silently no-op every row).
              status: variants.length === 0 ? "no_card" : "ready",
              errorMsg: variants.length === 0
                ? `No printings found for "${idData.pokemonName}"`
                : e.errorMsg,
              pokemonName: idData.pokemonName ?? undefined,
              observedSetCode: idData.setCode ?? null,
              observedCardNumber: idData.cardNumber ?? null,
              visionConfidence: idData.confidence,
              printingSelection: lookupData.selection,
              variants,
              selectedVariantId: lookupData.card?.id ?? variants[0]?.id,
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
  }, [recordScan, authFetch]);

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
    // Capture the bottom-corner strip immediately after — same canvas, sequential
    const cornerImageData = captureCorner() ?? undefined;
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
    void processEntry(id, imageData, cornerImageData);
    // Upload the captured scan in the background so it's ready by save time.
    void uploadScanImage(imageData).then((url) => {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, originalScanUrl: url } : e)));
    });
  }, [captureFrame, captureCorner, processEntry]);

  // Disable pull-to-refresh for the duration of this page so an accidental
  // downward swipe during scanning doesn't wipe the session.
  useEffect(() => {
    const prev = document.body.style.overscrollBehaviorY;
    document.body.style.overscrollBehaviorY = "none";
    return () => { document.body.style.overscrollBehaviorY = prev; };
  }, []);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (billingLoading || !billing) return;
    if (billing.canScan) {
      startCamera().catch(() => { toast.error("Camera permission denied or unavailable."); setPhase("idle"); });
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
    startCamera().catch(() => { toast.error("Camera permission denied or unavailable."); setPhase("idle"); });
  }, [startCamera]);

  const removeEntry = useCallback((id: string) => {
    // Cancel any in-flight detection for this entry
    const ctrl = abortControllersRef.current.get(id);
    if (ctrl) {
      ctrl.abort();
      abortControllersRef.current.delete(id);
    }
    pricingRequestsRef.current.get(id)?.controller.abort();
    pricingRequestsRef.current.delete(id);
    setPricingFetchingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    inflightCountRef.current = Math.max(0, inflightCountRef.current - 1);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setExpanded((cur) => (cur === id ? null : cur));
  }, []);

  const updateEntry = useCallback((id: string, patch: Partial<BulkEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  // Track which entries are currently re-fetching pricing after a variant switch
  const [pricingFetchingIds, setPricingFetchingIds] = useState<Set<string>>(new Set());

  const selectVariantAndRefreshPricing = useCallback(async (entryId: string, variant: ScanPrinting) => {
    // Clear the previous printing's price before showing this selection.
    pricingRequestsRef.current.get(entryId)?.controller.abort();
    const request = { variantId: variant.id, controller: new AbortController() };
    pricingRequestsRef.current.set(entryId, request);
    updateEntry(entryId, { selectedVariantId: variant.id, pricing: null });

    setPricingFetchingIds((prev) => new Set(prev).add(entryId));
    try {
      const params = new URLSearchParams({
        cardId: variant.id,
        name: variant.name,
        setName: variant.setName,
        cardNumber: variant.cardNumber,
      });
      if (variant.rarity) params.set("rarity", variant.rarity);
      const res = await fetch(`${BASE}/api/cards/pricing?${params.toString()}`, {
        cache: "no-store",
        signal: request.controller.signal,
      });
      if (!res.ok) return;
      const data = await res.json() as { pricing?: PricingData | null };
      if (pricingRequestsRef.current.get(entryId) === request && !request.controller.signal.aborted) {
        updateEntry(entryId, { pricing: data.pricing ?? null });
      }
    } catch { /* Keep this printing's price unavailable, never the previous printing's price. */ } finally {
      if (pricingRequestsRef.current.get(entryId) === request) {
        pricingRequestsRef.current.delete(entryId);
        setPricingFetchingIds((prev) => { const next = new Set(prev); next.delete(entryId); return next; });
      }
    }
  }, [updateEntry]);

  const reidentifyEntry = useCallback((id: string) => {
    if (haltedRef.current) {
      toast.warning("Scan limit reached — re-scan is unavailable.");
      return;
    }
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    pricingRequestsRef.current.get(id)?.controller.abort();
    pricingRequestsRef.current.delete(id);
    setPricingFetchingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    // Abort any still-running detection for this entry
    const ctrl = abortControllersRef.current.get(id);
    if (ctrl) {
      ctrl.abort();
      abortControllersRef.current.delete(id);
    }
    // Reset to analyzing state, clear prior results
    setEntries((prev) => prev.map((e) =>
      e.id === id
        ? { ...e, status: "analyzing", variants: [], selectedVariantId: undefined, pokemonName: undefined, errorMsg: undefined, printingSelection: undefined, pricing: null }
        : e
    ));
    void processEntry(id, entry.imageData);
  }, [entries, processEntry]);

  // ── Save All ──────────────────────────────────────────────────────────────
  const saveAll = useCallback(async () => {
    if (entries.some((entry) => entry.include && entry.status === "ready" && pricingRequestsRef.current.has(entry.id))) {
      toast.info("Please wait for the selected printings' prices to finish loading.");
      return;
    }
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
    let firstError: string | null = null;
    for (const entry of toSave) {
      const variant = entry.variants.find((v) => v.id === entry.selectedVariantId)
        ?? entry.variants[0];
      if (!variant) {
        const msg = "No printing selected";
        updateEntry(entry.id, { status: "save_failed", saveError: msg });
        if (!firstError) firstError = msg;
        failed++; setFailedCount(failed);
        continue;
      }
      updateEntry(entry.id, { status: "saving" });

      // Build body up-front so we can log it alongside any failure
      let body: Parameters<typeof createCard.mutateAsync>[0]["data"] | null = null;
      try {
        // Map the TCG-reported rarity string to our enum, falling back to common.
        const rarityKey = (variant.rarity ?? "")
          .toLowerCase().replace(/\s+/g, "_") as keyof typeof CreateCardBodyRarity;
        const rarity = CreateCardBodyRarity[rarityKey] ?? CreateCardBodyRarity.common;

        body = {
          name: variant.name,
          pokemonName: entry.pokemonName ?? variant.name,
          setName: variant.setName || undefined,
          cardNumber: variant.cardNumber || undefined,
          rarity,
          condition: entry.condition,
          imageUrl: variant.imageUrl || null,
          originalScanUrl: entry.originalScanUrl ?? null,
          estimatedValue: entry.pricing?.marketPrice ?? null,
          categoryId: entry.categoryId ?? null,
          forSale: false,
        };

        await createCard.mutateAsync({ data: body });
        updateEntry(entry.id, { status: "saved" });
        saved++; setSavedCount(saved);
      } catch (err: unknown) {
        // Surface as much detail as possible — the production failure mode
        // showed only "None of the cards could be saved" with no diagnostics.
        let msg = "Save failed";
        if (err instanceof ApiError) {
          const apiErr = err as ApiError<unknown>;
          const detailFromBody =
            (apiErr.data && typeof apiErr.data === "object" && "error" in apiErr.data
              ? String((apiErr.data as { error: unknown }).error)
              : null);
          msg = detailFromBody
            ? `${apiErr.status} ${apiErr.statusText} — ${detailFromBody}`
            : (apiErr.message || `${apiErr.status} ${apiErr.statusText}`);
          // eslint-disable-next-line no-console
          console.error("[bulk-save] ApiError", {
            status: apiErr.status,
            statusText: apiErr.statusText,
            url: apiErr.url,
            data: apiErr.data,
            sentBody: body,
          });
        } else if (err instanceof Error) {
          msg = err.message || msg;
          // eslint-disable-next-line no-console
          console.error("[bulk-save] Error", err, { sentBody: body });
        } else {
          // eslint-disable-next-line no-console
          console.error("[bulk-save] Unknown failure", err, { sentBody: body });
        }
        updateEntry(entry.id, { status: "save_failed", saveError: msg });
        if (!firstError) firstError = msg;
        failed++; setFailedCount(failed);
      }
    }

    setPhase("done");
    if (saved > 0 && failed === 0) {
      toast.success(`Saved ${saved} card${saved === 1 ? "" : "s"} to your collection.`);
    } else if (saved > 0) {
      toast.warning(`Saved ${saved}, ${failed} failed.`, {
        description: firstError ? `First error: ${firstError}` : undefined,
      });
    } else {
      toast.error("None of the cards could be saved.", {
        description: firstError ?? "Check each row for details.",
      });
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
  const isCapturing = phase === "idle" || phase === "capturing";
  return (
    <Layout>
      <div className={isCapturing
        ? "flex flex-col px-4 h-[calc(100dvh-6.5rem)] md:block md:h-auto md:max-w-2xl md:mx-auto md:py-4 md:pb-20"
        : "max-w-2xl mx-auto px-4 py-4 space-y-4 pb-32"
      }>
        <header className={`flex items-center justify-between ${isCapturing ? "shrink-0 py-3 md:py-0 md:mb-4" : "mb-2"}`}>
          <div>
            <div className="flex items-center gap-3">
              <ScanLine className="h-7 w-7 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Bulk Scan</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Snap up to {MAX_CARDS} cards in a row, then review and save them all at once.
            </p>
          </div>
          <Link href="/scan">
            <Button variant="ghost" size="sm" className="text-xs">Single scan</Button>
          </Link>
        </header>

        {/* CAPTURE PHASE */}
        {isCapturing && (
          <div className="flex flex-col flex-1 min-h-0 gap-3 md:flex-none md:block md:space-y-3">
            <div
              className="relative bg-black rounded-2xl overflow-hidden mx-auto w-full flex-1 min-h-[22vh] md:flex-none md:aspect-[5/3]"
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
              {/* Flip camera button — top-right corner during capture */}
              {phase === "capturing" && !hasSingleCamera && (
                <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                  <span className="bg-black/60 backdrop-blur-sm text-white/80 text-xs font-medium px-2 py-1 rounded-full select-none">
                    {facingMode === "environment" ? "Rear" : "Front"}
                  </span>
                  <button
                    type="button"
                    onClick={() => { void flipCamera(); }}
                    aria-label={facingMode === "environment" ? "Switch to front camera" : "Switch to rear camera"}
                    className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/90 hover:bg-black/80 transition-colors"
                  >
                    <SwitchCamera style={{ width: "1.125rem", height: "1.125rem" }} />
                  </button>
                </div>
              )}
              {phase !== "capturing" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Button onClick={() => startCamera().catch(() => { toast.error("Camera permission denied or unavailable."); setPhase("idle"); })} size="lg" className="gap-2">
                    <Camera className="h-4 w-4" /> Start Camera
                  </Button>
                </div>
              )}
            </div>

            {/* Capture button */}
            {phase === "capturing" && (
              <div className="flex items-center gap-2 shrink-0">
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

            {/* Thumbnail strip — horizontal scroll, always visible below shutter */}
            {entries.length > 0 && (
              <div className="shrink-0">
                <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                  {entries.map((e) => (
                    <div
                      key={e.id}
                      className="relative shrink-0 w-12 h-16 rounded-lg overflow-hidden border border-border bg-muted"
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewEntryId(e.id)}
                        className="absolute inset-0 w-full h-full focus:outline-none"
                        aria-label={`Preview card ${e.pokemonName ?? e.id}`}
                      >
                        <img src={e.imageData} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <StatusDot status={e.status} />
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEntry(e.id)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs shadow z-10"
                        aria-label="Remove"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground px-1 mt-1">
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
                  className={`relative border rounded-2xl overflow-hidden transition-colors ${
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
                          {pricingFetchingIds.has(e.id) ? (
                            <Badge variant="secondary" className="text-[10px] py-0 h-5 gap-1">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            </Badge>
                          ) : e.pricing?.marketPrice != null && (
                            <Badge variant="secondary" className="text-[10px] py-0 h-5">
                              {fmt(e.pricing.marketPrice)}
                            </Badge>
                          )}
                          {e.variants.length > 1 && (
                            <Badge variant="outline" className="text-[10px] py-0 h-5">
                              {e.variants.length} printings
                            </Badge>
                          )}
                          {e.printingSelection?.recommendedId === variant?.id &&
                            (e.printingSelection?.status === "exact" || e.printingSelection?.status === "likely") && (
                            <Badge variant="outline" className="text-[10px] py-0 h-5 text-primary border-primary/30">
                              Best match
                            </Badge>
                          )}
                          {(e.printingSelection?.status === "review" || e.printingSelection?.status === "unavailable") && (
                            <Badge variant="outline" className="text-[10px] py-0 h-5 text-amber-700 dark:text-amber-400 border-amber-500/30">
                              Check this match
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
                    <div className="shrink-0">
                      {e.status === "ready" && (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : e.id)}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-muted"
                        >
                          {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {e.printingSelection?.status === "review" || e.printingSelection?.status === "unavailable" ? "Review printing" : "Edit"}
                        </button>
                      )}
                    </div>
                    {/* Trash pinned to bottom-right so it can't be hit accidentally */}
                    <button
                      type="button"
                      onClick={() => removeEntry(e.id)}
                      className="absolute bottom-3 right-3 text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      aria-label="Remove from batch"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Expanded editor */}
                  {isOpen && e.status === "ready" && (
                    <div className="border-t bg-muted/30 p-3 space-y-4">
                      <ScanPrintingAssessment
                        selection={e.printingSelection}
                        selectedId={variant?.id}
                        setCode={e.observedSetCode}
                        cardNumber={e.observedCardNumber}
                      />
                      {/* Other Printings */}
                      {e.variants.length > 1 && (
                        <ScanPrintingPicker
                          entryId={e.id}
                          variants={e.variants}
                          selectedId={e.selectedVariantId}
                          recommendedId={e.printingSelection?.recommendedId}
                          onSelect={(v) => void selectVariantAndRefreshPricing(e.id, v)}
                        />
                      )}

                      {/* Condition */}
                      {variant && (
                        <CardConfidenceScorecard
                          endpoint={`${BASE}/api/cards/confidence`}
                          evidence={{
                            observed: {
                              visionConfidence: e.visionConfidence,
                              ocrName: e.pokemonName,
                              ocrSetCode: e.observedSetCode,
                              ocrCardNumber: e.observedCardNumber,
                            },
                            candidate: { id: variant.id, name: variant.name, setId: variant.setId, setName: variant.setName, cardNumber: variant.cardNumber },
                            pricing: e.pricing,
                            condition: { value: e.condition, source: "bulk_review" },
                            context: { flow: "bulk_scan_review" },
                          }}
                          actionTargets={{
                            confirm_condition: {
                              label: "Choose condition",
                              onClick: () => document.getElementById(`bulk-condition-${e.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
                            },
                            complete_listing: {
                              label: "Save cards first",
                              onClick: () => document.getElementById("bulk-save-cards")?.scrollIntoView({ behavior: "smooth", block: "center" }),
                            },
                          }}
                        />
                      )}

                      {/* Condition */}
                      <div id={`bulk-condition-${e.id}`}>
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

                          {/* Inline new-category creator */}
                          {newCatEntryId === e.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                autoFocus
                                value={newCatName}
                                onChange={(ev) => setNewCatName(ev.target.value)}
                                onKeyDown={(ev) => {
                                  if (ev.key === "Enter") { ev.preventDefault(); void handleCreateCategory(e.id); }
                                  if (ev.key === "Escape") { setNewCatEntryId(null); setNewCatName(""); }
                                }}
                                placeholder="Category name"
                                className="h-7 w-28 rounded-full border border-primary/60 px-3 text-xs"
                              />
                              <button
                                type="button"
                                disabled={!newCatName.trim() || createCategory.isPending}
                                onClick={() => void handleCreateCategory(e.id)}
                                className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity"
                              >
                                {createCategory.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setNewCatEntryId(null); setNewCatName(""); }}
                                className="h-7 w-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setNewCatEntryId(e.id); setNewCatName(""); }}
                              className="text-xs px-3 py-1.5 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                            >
                              + New
                            </button>
                          )}
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
                      startCamera().catch(() => { toast.error("Camera permission denied or unavailable."); setPhase("idle"); });
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
            <div id="bulk-save-cards" className="max-w-2xl mx-auto bg-background/95 backdrop-blur border shadow-lg rounded-2xl p-3 flex items-center gap-2">
              <Button variant="outline" onClick={backToCapturing} className="gap-1">
                <Camera className="h-4 w-4" /> Add more
              </Button>
              <Button
                onClick={saveAll}
                disabled={reviewableCount === 0 || createCard.isPending ||
                  entries.some((entry) => entry.include && entry.status === "ready" && pricingFetchingIds.has(entry.id))}
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

      {/* Thumbnail preview modal */}
      {(() => {
        const previewEntry = entries.find((e) => e.id === previewEntryId);
        const isFailed =
          previewEntry &&
          (previewEntry.status === "no_card" ||
            previewEntry.status === "error" ||
            previewEntry.status === "save_failed");
        const isAnalyzing = previewEntry?.status === "analyzing";
        const cardName =
          previewEntry?.pokemonName ??
          previewEntry?.variants.find((v) => v.id === previewEntry.selectedVariantId)?.name ??
          previewEntry?.variants[0]?.name;
        const setLabel =
          previewEntry?.variants.find((v) => v.id === previewEntry.selectedVariantId)?.setName ??
          previewEntry?.variants[0]?.setName;

        const statusLabel = !previewEntry
          ? null
          : previewEntry.status === "analyzing"
            ? "Analyzing…"
            : previewEntry.status === "saving"
              ? "Saving…"
              : previewEntry.status === "saved"
                ? "Saved"
                : previewEntry.status === "ready"
                  ? "Identified"
                  : previewEntry.errorMsg ?? "Not identified";

        return (
          <Dialog open={!!previewEntry} onOpenChange={(open) => { if (!open) setPreviewEntryId(null); }}>
            <DialogContent className="max-w-xs w-full p-0 overflow-hidden rounded-2xl">
              <DialogHeader className="px-4 pt-4 pb-2">
                <DialogTitle className="text-base">
                  {cardName ?? "Card Preview"}
                </DialogTitle>
              </DialogHeader>

              {previewEntry && (
                <div className="flex flex-col gap-3 pb-4">
                  {/* Full photo */}
                  <div className="px-4">
                    <div className="relative w-full aspect-[5/7] rounded-xl overflow-hidden bg-muted">
                      <img
                        src={previewEntry.imageData}
                        alt={cardName ?? "Captured card"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>

                  {/* Card info */}
                  <div className="px-4 space-y-1">
                    {isAnalyzing ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Identifying card…</span>
                      </div>
                    ) : (
                      <>
                        {cardName ? (
                          <p className="text-sm font-semibold">{cardName}</p>
                        ) : null}
                        {setLabel ? (
                          <p className="text-xs text-muted-foreground">{setLabel}</p>
                        ) : null}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {isFailed ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          ) : previewEntry.status === "saved" || previewEntry.status === "ready" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          ) : null}
                          <span className={`text-xs ${isFailed ? "text-red-500" : "text-muted-foreground"}`}>
                            {statusLabel}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="px-4 flex gap-2">
                    {(isFailed || previewEntry.status === "ready") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5"
                        disabled={isAnalyzing}
                        onClick={() => {
                          reidentifyEntry(previewEntry.id);
                          setPreviewEntryId(null);
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Re-scan
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => {
                        removeEntry(previewEntry.id);
                        setPreviewEntryId(null);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}
    </Layout>
  );
}

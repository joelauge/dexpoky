import { Layout } from "@/components/layout";
import { HoloCard } from "@/components/holo-card";
import { useGetCard, useDeleteCard, useUpdateCard, useListCards } from "@workspace/api-client-react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatLabel, CONDITION_COLORS, RARITY_COLORS } from "@/lib/constants";
import {
  ArrowLeft, Edit2, Trash2, Store, Tag, ImageIcon, ExternalLink,
  ChevronLeft, ChevronRight, LayoutList, FolderOpen, Layers, TrendingUp, Loader2, Calendar, Clock,
  Share2, Camera, Maximize2, BookOpen, CheckCircle2, ShieldCheck,
} from "lucide-react";
import { GradingVerification } from "@/components/grading-verification";
import { Textarea } from "@/components/ui/textarea";
import { ShareModal } from "@/components/share-modal";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PriceHistoryChart } from "@/components/price-history-chart";
import { getCardIdentity } from "@/lib/set-completion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface TcgVariant {
  id: string;
  name: string;
  imageUrl: string;
  setName: string;
  cardNumber: string;
  setId?: string;
}

interface EbaySoldPricing {
  median: number | null;
  average: number | null;
  low: number | null;
  high: number | null;
  count: number;
  searchUrl: string;
}

interface PrintingPricing {
  marketPrice: number | null;
  lowPrice: number | null;
  source: "tcgplayer" | "cardmarket" | null;
  isFallback?: boolean;
  ebay?: EbaySoldPricing | null;
}

export default function CardDetail() {
  const [, params] = useRoute("/collection/:id");
  const id = params?.id ? parseInt(params.id) : 0;
  const [, setLocation] = useLocation();

  const { data: card, isLoading } = useGetCard(id, {
    query: { enabled: !!id, queryKey: ["/api/cards", id] },
  });

  const deleteCard = useDeleteCard();
  const updateCard = useUpdateCard();
  const qc = useQueryClient();
  const [isShareOpen, setIsShareOpen] = useState(false);

  // ── Card Story (inline-editable) ──────────────────────────────────────
  const [cardStory, setCardStory] = useState<string>("");
  const [storySaving, setStorySaving] = useState(false);
  // Track the last server value we know about so a background refetch
  // (e.g. window-focus revalidation while the user is mid-sentence) doesn't
  // stomp an unsaved draft. We only adopt the new server value if the local
  // state still matches the previously-seen server value (i.e. user hasn't
  // started typing yet).
  const lastServerStoryRef = useRef<string>("");
  useEffect(() => {
    const serverVal = card?.cardStory ?? "";
    setCardStory((prev) => (prev === lastServerStoryRef.current ? serverVal : prev));
    lastServerStoryRef.current = serverVal;
  }, [card?.cardStory]);
  const storyDirty = (card?.cardStory ?? "") !== cardStory;
  const saveCardStory = useCallback(() => {
    if (!card) return;
    const trimmed = cardStory.trim();
    setStorySaving(true);
    updateCard.mutate(
      { id: card.id, data: { cardStory: trimmed.length > 0 ? trimmed : null } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["/api/cards", card.id] });
          qc.invalidateQueries({ queryKey: ["/api/cards"] });
          toast.success("Card story saved");
        },
        onError: () => toast.error("Couldn't save card story — please try again."),
        onSettled: () => setStorySaving(false),
      },
    );
  }, [card, cardStory, updateCard, qc]);

  // ── Other Printings ────────────────────────────────────────────────────────
  const [printings, setPrintings] = useState<TcgVariant[]>([]);
  const [printingsLoading, setPrintingsLoading] = useState(false);
  const [selectedPrinting, setSelectedPrinting] = useState<TcgVariant | null>(null);
  const [printingPricing, setPrintingPricing] = useState<PrintingPricing | null>(null);
  const [printingPricingLoading, setPrintingPricingLoading] = useState(false);
  const [confirmPrinting, setConfirmPrinting] = useState<TcgVariant | null>(null);
  const printingRequestRef = useRef(0);
  const printingAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const searchName = card?.pokemonName || card?.name;
    if (!searchName) return;
    setPrintings([]);
    setSelectedPrinting(null);
    setPrintingPricing(null);
    setPrintingsLoading(true);
    fetch(`/api/cards/lookup?name=${encodeURIComponent(searchName)}`)
      .then((r) => r.json())
      .then((data: { variants?: TcgVariant[] }) => setPrintings(data.variants ?? []))
      .catch(() => {})
      .finally(() => setPrintingsLoading(false));
  }, [card?.id]);

  const selectPrinting = useCallback(async (v: TcgVariant) => {
    if (selectedPrinting?.id === v.id) {
      setSelectedPrinting(null);
      setPrintingPricing(null);
      return;
    }
    setSelectedPrinting(v);
    setPrintingPricing(null);
    setPrintingPricingLoading(true);
    const requestId = ++printingRequestRef.current;
    printingAbortRef.current?.abort();
    const controller = new AbortController();
    printingAbortRef.current = controller;
    try {
      const p = new URLSearchParams({ cardId: v.id, name: v.name });
      if (card?.rarity) p.set("rarity", card.rarity);
      if (v.setName) p.set("setName", v.setName);
      if (v.cardNumber) p.set("cardNumber", v.cardNumber);
      const res = await fetch(`/api/cards/pricing?${p}`, { cache: "no-store", signal: controller.signal });
      if (res.ok) {
        const data = await res.json() as { pricing: PrintingPricing };
        if (requestId === printingRequestRef.current) setPrintingPricing(data.pricing ?? null);
      }
    } catch { /* ignore */ } finally {
      if (requestId === printingRequestRef.current) setPrintingPricingLoading(false);
    }
  }, [selectedPrinting?.id, card?.rarity]);

  const handlePrintingClick = useCallback((v: TcgVariant, isCurrent: boolean) => {
    if (isCurrent) {
      // Current printing: just toggle the pricing panel
      selectPrinting(v);
      return;
    }
    // Different printing: open confirmation dialog (and fetch pricing in parallel)
    selectPrinting(v);
    setConfirmPrinting(v);
  }, [selectPrinting]);

  const confirmUpdateCard = useCallback(() => {
    if (!confirmPrinting || !card) return;
    // Fallback pricing is never safe to persist to a different printing.
    const newValue = printingPricing?.isFallback
      ? null
      : printingPricing?.marketPrice ?? printingPricing?.lowPrice ?? null;
    updateCard.mutate(
      {
        id: card.id,
        data: {
          imageUrl: confirmPrinting.imageUrl || undefined,
          catalogCardId: confirmPrinting.id,
          setId: confirmPrinting.setId || undefined,
          setName: confirmPrinting.setName || undefined,
          cardNumber: confirmPrinting.cardNumber || undefined,
          estimatedValue: newValue,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["/api/cards", card.id] });
          qc.invalidateQueries({ queryKey: ["/api/cards"] });
          toast.success("Card updated to new printing!");
          setConfirmPrinting(null);
          setSelectedPrinting(null);
          setPrintingPricing(null);
        },
        onError: () => toast.error("Failed to update card — please try again."),
      },
    );
  }, [confirmPrinting, card, printingPricing, updateCard, qc]);
  // ──────────────────────────────────────────────────────────────────────────

  // ── Navigation ────────────────────────────────────────────────────────────
  const { data: allCards } = useListCards();
  const [navScope, setNavScope] = useState<"category" | "all">("category");

  useEffect(() => {
    if (card) setNavScope(card.categoryId ? "category" : "all");
  }, [card?.id]);

  const duplicateCopies = useMemo(() => {
    if (!card || !allCards) return [];
    const currentKey = getCardIdentity(card);
    return allCards.filter(c => {
       const key = getCardIdentity(c);
       return key === currentKey;
    }).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [card, allCards]);

  const copyIndex = duplicateCopies.findIndex(c => c.id === id);
  const prevCopy = copyIndex > 0 ? duplicateCopies[copyIndex - 1] : null;
  const nextCopy = copyIndex < duplicateCopies.length - 1 ? duplicateCopies[copyIndex + 1] : null;

  const uniqueNavList = useMemo(() => {
    if (!allCards || !card) return [];
    let list = allCards;
    if (navScope === "category" && card.categoryId) {
      list = allCards.filter(c => c.categoryId === card.categoryId);
    }
    const seen = new Set<string>();
    const result = [];
    const currentKey = getCardIdentity(card);

    for (const c of list) {
      const key = getCardIdentity(c);
      if (key === currentKey) {
        if (c.id === card.id) {
           result.push(c);
           seen.add(key);
        }
      } else {
        if (!seen.has(key)) {
          result.push(c);
          seen.add(key);
        }
      }
    }
    return result;
  }, [allCards, navScope, card]);

  const currentIndex = uniqueNavList.findIndex((c) => c.id === id);
  const prevCard = currentIndex > 0 ? uniqueNavList[currentIndex - 1] : null;
  const nextCard = currentIndex < uniqueNavList.length - 1 ? uniqueNavList[currentIndex + 1] : null;
  const hasCategoryScope = !!(card?.categoryId && allCards?.some((c) => c.categoryId === card.categoryId && c.id !== id));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") {
         if (prevCopy) setLocation(`/collection/${prevCopy.id}`);
         else if (prevCard) setLocation(`/collection/${prevCard.id}`);
      }
      if (e.key === "ArrowRight") {
         if (nextCopy) setLocation(`/collection/${nextCopy.id}`);
         else if (nextCard) setLocation(`/collection/${nextCard.id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevCard, nextCard, prevCopy, nextCopy, setLocation]);
  // ──────────────────────────────────────────────────────────────────────────


  interface ActiveListing {
    id: number;
    listingType: string;
    price: number;
    status: string;
    createdAt: string;
  }

  const { data: activeListing } = useQuery<ActiveListing>({
    queryKey: ["/api/cards/listing", id],
    queryFn: () => fetch(`/api/cards/${id}/listing`).then(r => r.ok ? r.json() : null),
    enabled: !!card?.forSale,
  });

  const delistCard = useMutation({
    mutationFn: async (cardId: number) => {
      const res = await fetch(`/api/cards/${cardId}/listing`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delist");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cards", id] });
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
      qc.invalidateQueries({ queryKey: ["/api/cards/listing", id] });
      toast.success("Card removed from marketplace");
    },
    onError: () => toast.error("Failed to remove listing"),
  });

  const handleDelete = () => {
    deleteCard.mutate({ id }, {
      onSuccess: () => {
        toast.success("Card deleted");
        setLocation("/collection");
      },
      onError: () => toast.error("Failed to delete card"),
    });
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16">
          <Skeleton className="h-8 w-32 mb-8" />
          <div className="flex flex-col lg:flex-row gap-10">
            <Skeleton className="w-full lg:w-[340px] aspect-[3/4] rounded-2xl" />
            <div className="flex-1 space-y-5 pt-2">
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="h-6 w-1/2" />
              <div className="flex gap-2">
                <Skeleton className="h-7 w-20 rounded-full" />
                <Skeleton className="h-7 w-24 rounded-full" />
              </div>
              <Skeleton className="h-28 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!card) {
    return (
      <Layout>
        <div className="text-center py-24">
          <p className="text-5xl mb-4">🃏</p>
          <h2 className="text-2xl font-bold mb-2">Card not found</h2>
          <p className="text-muted-foreground mb-6">This card may have been deleted.</p>
          <Button onClick={() => setLocation("/collection")}>Back to Collection</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24">
        {/* Back nav */}
        <button
          onClick={() => setLocation("/collection")}
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm font-medium transition-colors mb-6 -ml-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Collection
        </button>

        <div className="flex flex-col lg:flex-row gap-10 items-start">
          {/* ── LEFT: Card Image + Nav + Sell CTA + Notes ─────────────── */}
          <div className="w-full lg:w-[320px] xl:w-[360px] lg:shrink-0">
            <HoloCard imageUrl={card.imageUrl} name={card.name}>
              {card.forSale && (
                <div className="absolute top-3 right-3">
                  <Badge className="bg-primary text-primary-foreground font-bold shadow-lg text-xs px-2.5 py-1">
                    Listed {formatCurrency(card.listingPrice)}
                  </Badge>
                </div>
              )}
            </HoloCard>

            {/* Prev / Next (Duplicate Navigation) */}
            {duplicateCopies.length > 1 && (
              <div className="mt-4 flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl p-1.5 shadow-sm">
                <button
                  onClick={() => prevCopy && setLocation(`/collection/${prevCopy.id}`)}
                  disabled={!prevCopy}
                  className="p-1.5 rounded-lg text-primary hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Copy {copyIndex + 1} of {duplicateCopies.length}</span>
                  <span className="text-[10px] text-muted-foreground font-medium">{formatLabel(card.condition)} Condition</span>
                </div>
                <button
                  onClick={() => nextCopy && setLocation(`/collection/${nextCopy.id}`)}
                  disabled={!nextCopy}
                  className="p-1.5 rounded-lg text-primary hover:bg-primary/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Prev / Next (Unique List Navigation) */}
            {uniqueNavList.length > 1 && (
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => prevCard && setLocation(`/collection/${prevCard.id}`)}
                  disabled={!prevCard}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-1 min-w-0"
                >
                  <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{prevCard?.name ?? "—"}</span>
                </button>

                <div className="flex flex-col items-center shrink-0 gap-0.5">
                  <span className="text-xs font-bold tabular-nums whitespace-nowrap">
                    {currentIndex + 1} / {uniqueNavList.length}
                  </span>
                  {hasCategoryScope && (
                    <button
                      onClick={() => setNavScope(s => s === "category" ? "all" : "category")}
                      className="flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-primary transition-colors"
                    >
                      {navScope === "category"
                        ? <><FolderOpen className="h-2.5 w-2.5" />{card.categoryName}</>
                        : <><LayoutList className="h-2.5 w-2.5" />All</>}
                    </button>
                  )}
                </div>

                <button
                  onClick={() => nextCard && setLocation(`/collection/${nextCard.id}`)}
                  disabled={!nextCard}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-1 min-w-0 justify-end"
                >
                  <span className="truncate">{nextCard?.name ?? "—"}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                </button>
              </div>
            )}

            {/* Sell CTA */}
            <div className="mt-4">
              {card.forSale ? (
                <div className="space-y-3">
                  {activeListing && (
                    <>
                      <Button
                        size="lg"
                        className="w-full h-12 text-base font-bold shadow-lg"
                        onClick={() => setLocation(`/marketplace/${activeListing.id}`)}
                      >
                        <ExternalLink className="h-5 w-5 mr-2" /> View Marketplace Listing
                      </Button>
                      <p className="text-xs text-muted-foreground text-center -mt-1">
                        Listed {formatCurrency(activeListing.price)} · You put this up on{" "}
                        {new Date(activeListing.createdAt).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })}{" "}
                        at{" "}
                        {new Date(activeListing.createdAt).toLocaleTimeString("en-US", {
                          hour: "numeric", minute: "2-digit",
                        })}
                      </p>
                    </>
                  )}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => delistCard.mutate(id)}
                    disabled={delistCard.isPending}
                  >
                    <Store className="h-4 w-4 mr-2" />
                    {delistCard.isPending ? "Removing…" : "Remove from Marketplace"}
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    size="lg"
                    className="w-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-base font-bold"
                    onClick={() => setLocation(`/share?card=${id}`)}
                  >
                    <Tag className="h-5 w-5 mr-2" /> Sell on Marketplace
                  </Button>
                  <p className="text-center text-xs text-muted-foreground mt-3">
                    Want to auction instead?{" "}
                    <button
                      onClick={() => setLocation(`/sell?card=${id}`)}
                      className="text-primary underline underline-offset-2 hover:no-underline font-medium"
                    >
                      Use Sell page
                    </button>
                  </p>
                </>
              )}
            </div>

            {/* Notes */}
            {card.notes && (
              <div className="mt-6 bg-amber-50 border border-amber-200/70 rounded-2xl p-4">
                <p className="text-xs font-bold text-amber-700/70 uppercase tracking-wider mb-1.5">Collector's Notes</p>
                <p className="text-sm text-amber-900 leading-relaxed">{card.notes}</p>
              </div>
            )}

            {/* Card Story (inline-editable) */}
            <div className="mt-6 bg-card border rounded-2xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Card Story</p>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                How did you get this card? Pack pull, trade, gift from grandma — capture the memory.
              </p>
              <Textarea
                value={cardStory}
                onChange={(e) => setCardStory(e.target.value)}
                placeholder="e.g. Pulled from a Hidden Fates booster on my 12th birthday — first holo I ever owned."
                rows={4}
                className="resize-y text-sm"
                maxLength={2000}
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {cardStory.length}/2000
                </span>
                {storyDirty && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCardStory(card.cardStory ?? "")}
                      disabled={storySaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveCardStory}
                      disabled={storySaving}
                    >
                      {storySaving ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        "Save story"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Original Scan */}
            {card.originalScanUrl && (
              <div className="mt-6 bg-card border rounded-2xl p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Original Scan</p>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="relative group block w-full overflow-hidden rounded-xl border bg-muted"
                      style={{ aspectRatio: "5 / 7" }}
                    >
                      <img
                        src={card.originalScanUrl}
                        alt={`Original scan of ${card.name}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-2">
                          <Maximize2 className="h-4 w-4 text-foreground" />
                        </div>
                      </div>
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl p-2 bg-background">
                    <DialogHeader className="sr-only">
                      <DialogTitle>Original scan of {card.name}</DialogTitle>
                    </DialogHeader>
                    <img
                      src={card.originalScanUrl}
                      alt={`Original scan of ${card.name}`}
                      className="w-full h-auto rounded-lg"
                    />
                  </DialogContent>
                </Dialog>
                <p className="text-[11px] text-muted-foreground mt-2">
                  The photo you took when adding this card.
                </p>
              </div>
            )}
          </div>

          {/* ── RIGHT: Identity + Value + Chart + Printings ───────────── */}
          <div className="flex-1 min-w-0 overflow-hidden w-full">
            {/* Name + actions */}
            <div className="flex items-start justify-between gap-4 mb-1">
              <h1 className="text-4xl xl:text-5xl font-black tracking-tight leading-tight text-foreground">
                {card.name}
              </h1>
              <div className="flex gap-2 shrink-0 mt-1">
                <Button variant="outline" size="icon" onClick={() => setIsShareOpen(true)} title="Share">
                  <Share2 className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setLocation(`/collection/${id}/edit`)} title="Edit">
                  <Edit2 className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this card?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove <strong>{card.name}</strong> from your collection. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Subtitle */}
            <p className="text-base xl:text-lg text-muted-foreground font-medium mb-5">
              {card.pokemonName}
              {card.setName && <span className="mx-1.5">•</span>}
              {card.setName}
              {card.cardNumber && (
                <span className="ml-2 text-xs bg-secondary px-2 py-0.5 rounded-md font-mono text-foreground">
                  {card.cardNumber}
                </span>
              )}
            </p>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mb-6">
              <span className={`inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full border ${RARITY_COLORS[card.rarity] || "bg-muted text-muted-foreground"}`}>
                {formatLabel(card.rarity)}
              </span>
              <span className={`inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full border ${CONDITION_COLORS[card.condition] || "bg-muted text-muted-foreground"}`}>
                {formatLabel(card.condition)} Condition
              </span>
              {card.categoryName && (
                <span className="inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full bg-secondary border border-border text-foreground">
                  {card.categoryName}
                </span>
              )}
            </div>

            {/* Value panel */}
            <div className="bg-card border rounded-2xl p-5 mb-4 shadow-sm w-full">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Estimated Value</p>
              <p className="text-5xl xl:text-6xl font-black tracking-tighter text-foreground">
                {formatCurrency(card.estimatedValue)}
              </p>
            </div>

            {/* Quick meta */}
            <div className="flex gap-4 text-xs text-muted-foreground mb-6">
              {card.acquiredDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Acquired {new Date(card.acquiredDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Added {new Date(card.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </div>

            {/* Price history chart — directly below the date, no gap */}
            <div className="w-full min-w-0 overflow-hidden">
              <PriceHistoryChart cardId={id} />
            </div>

            {/* Professional Grading Verification */}
            <div className="mt-6 mb-2">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
                <ShieldCheck className="h-3.5 w-3.5" />
                Professional Grading
              </h3>
              <GradingVerification cardId={id} />
            </div>

            {/* Other Printings */}
            {(printingsLoading || printings.length > 0) && (
              <div
                className="mb-6"
                style={{ width: "100%", maxWidth: "100vw", overflow: "hidden" }}
              >
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
                  <Layers className="h-3.5 w-3.5" />
                  Other Printings
                  {!printingsLoading && <span className="font-normal">({printings.length})</span>}
                </h3>

                {printingsLoading ? (
                  <div className="flex gap-2 pb-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="shrink-0 w-14 h-[82px] rounded-xl" />
                    ))}
                  </div>
                ) : (
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
                    {printings.map((v) => {
                      const isCurrent = v.setName === card.setName && v.cardNumber === card.cardNumber;
                      const isSelected = selectedPrinting?.id === v.id;
                      return (
                        <button
                          key={v.id}
                          onClick={() => handlePrintingClick(v, isCurrent)}
                          title={`${v.setName} · ${v.cardNumber}`}
                          className={`group shrink-0 w-14 rounded-xl border-2 overflow-hidden flex flex-col transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                            isSelected
                              ? "border-primary shadow-lg shadow-primary/20 scale-105"
                              : isCurrent
                              ? "border-emerald-500 ring-1 ring-emerald-300/50"
                              : "border-transparent hover:border-border hover:shadow-sm"
                          }`}
                        >
                          {v.imageUrl ? (
                            <img src={v.imageUrl} alt={v.name} className="w-full aspect-[3/4] object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full aspect-[3/4] bg-muted flex items-center justify-center">
                              <ImageIcon className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                          <p className="text-[8px] leading-tight text-center text-muted-foreground px-0.5 py-1 truncate w-full font-medium">
                            {isCurrent ? "★ " : ""}{v.setName}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  </div>
                )}

                {/* Selected printing pricing */}
                {selectedPrinting && (
                  <div className="mt-3 bg-card border rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-sm font-semibold truncate">{selectedPrinting.setName}</span>
                      <span className="text-xs text-muted-foreground font-mono shrink-0">{selectedPrinting.cardNumber}</span>
                      <div className="ml-auto flex items-center gap-1.5 shrink-0">
                        {printingPricing?.isFallback && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">est.</span>
                        )}
                        {printingPricing?.source && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {printingPricing.source === "tcgplayer" ? "TCGPlayer" : "CardMarket"}
                          </span>
                        )}
                      </div>
                    </div>
                    {printingPricingLoading ? (
                      <div className="flex items-center gap-2 py-1">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">Fetching price…</span>
                      </div>
                    ) : printingPricing?.marketPrice != null || printingPricing?.lowPrice != null ? (
                      <div className="flex gap-6">
                        {printingPricing.marketPrice != null && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Market</p>
                            <p className="text-2xl font-black">{formatCurrency(printingPricing.marketPrice)}</p>
                          </div>
                        )}
                        {printingPricing.lowPrice != null && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Low</p>
                            <p className="text-2xl font-semibold text-muted-foreground">{formatCurrency(printingPricing.lowPrice)}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No market price found for this printing.</p>
                    )}
                    {printingPricing?.ebay && printingPricing.ebay.count >= 3 && (
                      <div className="mt-3 pt-3 border-t border-border/60">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            eBay Sold ({printingPricing.ebay.count})
                          </p>
                          <a
                            href={printingPricing.ebay.searchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-primary hover:underline"
                          >
                            View on eBay →
                          </a>
                        </div>
                        <div className="flex gap-6">
                          {printingPricing.ebay.median != null && (
                            <div>
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Median</p>
                              <p className="text-xl font-bold">{formatCurrency(printingPricing.ebay.median)}</p>
                            </div>
                          )}
                          {printingPricing.ebay.low != null && (
                            <div>
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Low</p>
                              <p className="text-xl font-semibold text-muted-foreground">{formatCurrency(printingPricing.ebay.low)}</p>
                            </div>
                          )}
                          {printingPricing.ebay.high != null && (
                            <div>
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">High</p>
                              <p className="text-xl font-semibold">{formatCurrency(printingPricing.ebay.high)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* ── Printing update confirmation dialog ── */}
      <Dialog
        open={!!confirmPrinting}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmPrinting(null);
            setSelectedPrinting(null);
            setPrintingPricing(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update to this printing?</DialogTitle>
            <DialogDescription>
              Your card's image{printingPricing || printingPricingLoading ? " and estimated value" : ""} will be updated.
            </DialogDescription>
          </DialogHeader>

          {confirmPrinting && (
            <div className="space-y-4 py-1">
              {/* Before → After */}
              <div className="flex items-center gap-3">
                {/* Current */}
                <div className="flex-1 flex flex-col items-center gap-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Current</p>
                  <div className="w-20 aspect-[3/4] rounded-xl overflow-hidden border bg-muted flex items-center justify-center">
                    {card?.imageUrl
                      ? <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" />
                      : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2 max-w-[80px]">
                    {card?.setName ?? "—"}
                  </p>
                </div>

                {/* Arrow */}
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />

                {/* New */}
                <div className="flex-1 flex flex-col items-center gap-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary">New</p>
                  <div className="w-20 aspect-[3/4] rounded-xl overflow-hidden border-2 border-primary bg-muted flex items-center justify-center">
                    {confirmPrinting.imageUrl
                      ? <img src={confirmPrinting.imageUrl} alt={confirmPrinting.name} className="w-full h-full object-cover" />
                      : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2 max-w-[80px]">
                    {confirmPrinting.setName}
                    {confirmPrinting.cardNumber && <span className="font-mono"> #{confirmPrinting.cardNumber}</span>}
                  </p>
                </div>
              </div>

              {/* Price row */}
              <div className="rounded-xl border bg-muted/40 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Estimated value</p>
                  <p className="text-sm font-semibold text-muted-foreground line-through">
                    {formatCurrency(card?.estimatedValue)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground mx-2 shrink-0" />
                <div className="text-right">
                  {printingPricingLoading ? (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching…
                    </div>
                  ) : (printingPricing?.marketPrice ?? printingPricing?.lowPrice) != null ? (
                    <p className="text-lg font-black text-primary">
                      {formatCurrency(printingPricing!.marketPrice ?? printingPricing!.lowPrice)}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No price data</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmPrinting(null);
                setSelectedPrinting(null);
                setPrintingPricing(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmUpdateCard}
              disabled={updateCard.isPending || printingPricingLoading}
              className="gap-1.5"
            >
              {updateCard.isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…</>
                : <><CheckCircle2 className="h-3.5 w-3.5" /> Update card</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {card && (
        <ShareModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          target={{ type: "card", id: card.id, name: card.name, imageUrl: card.imageUrl, setName: card.setName }}
        />
      )}
    </Layout>
  );
}

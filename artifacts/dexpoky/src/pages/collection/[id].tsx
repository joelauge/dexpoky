import { Layout } from "@/components/layout";
import { HoloCard } from "@/components/holo-card";
import { useGetCard, useDeleteCard, useUpdateCard, useListCards, UpdateCardBodyStatus } from "@workspace/api-client-react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatLabel, CONDITION_COLORS, RARITY_COLORS } from "@/lib/constants";
import { ArrowLeft, Edit2, Trash2, Store, Tag, ImageIcon, CheckCircle2, ExternalLink, ChevronLeft, ChevronRight, LayoutList, FolderOpen, Layers, TrendingUp, Loader2 } from "lucide-react";
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
import { useState, useMemo, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
}

interface PrintingPricing {
  marketPrice: number | null;
  lowPrice: number | null;
  source: "tcgplayer" | "cardmarket" | null;
  isFallback?: boolean;
}

export default function CardDetail() {
  const [, params] = useRoute("/collection/:id");
  const id = params?.id ? parseInt(params.id) : 0;
  const [, setLocation] = useLocation();

  const { data: card, isLoading } = useGetCard(id, {
    query: { enabled: !!id, queryKey: ['/api/cards', id] }
  });

  const deleteCard = useDeleteCard();
  const updateCard = useUpdateCard();
  const qc = useQueryClient();
  const [sellPrice, setSellPrice] = useState<string>("");
  const [isSellOpen, setIsSellOpen] = useState(false);
  const [listedId, setListedId] = useState<number | null>(null);

  // ── Other Printings ─────────────────────────────────────────────────────────
  const [printings, setPrintings] = useState<TcgVariant[]>([]);
  const [printingsLoading, setPrintingsLoading] = useState(false);
  const [selectedPrinting, setSelectedPrinting] = useState<TcgVariant | null>(null);
  const [printingPricing, setPrintingPricing] = useState<PrintingPricing | null>(null);
  const [printingPricingLoading, setPrintingPricingLoading] = useState(false);

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
    try {
      const params = new URLSearchParams({ cardId: v.id, name: v.name });
      if (card?.rarity) params.set("rarity", card.rarity);
      const res = await fetch(`/api/cards/pricing?${params}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json() as { pricing: PrintingPricing };
        setPrintingPricing(data.pricing ?? null);
      }
    } catch { /* ignore */ } finally {
      setPrintingPricingLoading(false);
    }
  }, [selectedPrinting?.id, card?.rarity]);
  // ────────────────────────────────────────────────────────────────────────────

  // ── Navigation ──────────────────────────────────────────────────────────────
  const { data: allCards } = useListCards();
  const [navScope, setNavScope] = useState<"category" | "all">("category");

  // Once the card loads, default to category scope only if it has one
  useEffect(() => {
    if (card) setNavScope(card.categoryId ? "category" : "all");
  }, [card?.id]);

  const navList = useMemo(() => {
    if (!allCards) return [];
    if (navScope === "category" && card?.categoryId) {
      return allCards.filter((c) => c.categoryId === card.categoryId);
    }
    return allCards;
  }, [allCards, navScope, card?.categoryId]);

  const currentIndex = navList.findIndex((c) => c.id === id);
  const prevCard = currentIndex > 0 ? navList[currentIndex - 1] : null;
  const nextCard = currentIndex < navList.length - 1 ? navList[currentIndex + 1] : null;
  const hasCategoryScope = !!(card?.categoryId && allCards?.some((c) => c.categoryId === card.categoryId && c.id !== id));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" && prevCard) setLocation(`/collection/${prevCard.id}`);
      if (e.key === "ArrowRight" && nextCard) setLocation(`/collection/${nextCard.id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevCard, nextCard]);
  // ────────────────────────────────────────────────────────────────────────────

  const listCard = useMutation({
    mutationFn: async ({ cardId, price }: { cardId: number; price: number }) => {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, price, listingType: "buy_now" }),
      });
      if (!res.ok) throw new Error("Failed to create listing");
      return res.json() as Promise<{ id: number }>;
    },
    onSuccess: (data) => {
      setListedId(data.id);
      qc.invalidateQueries({ queryKey: ["/api/cards", id] });
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
    },
    onError: () => toast.error("Failed to list card — please try again."),
  });

  const delistCard = useMutation({
    mutationFn: async (cardId: number) => {
      const res = await fetch(`/api/cards/${cardId}/listing`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delist");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cards", id] });
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
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
      onError: () => toast.error("Failed to delete card")
    });
  };

  const handleSell = () => {
    const price = parseFloat(sellPrice);
    if (!sellPrice || price <= 0) {
      toast.error("Please enter a valid price");
      return;
    }
    listCard.mutate({ cardId: id, price });
  };

  const handleSellDialogChange = (open: boolean) => {
    setIsSellOpen(open);
    if (!open) {
      setSellPrice("");
      setListedId(null);
      listCard.reset();
    }
  };

  const handleDelist = () => {
    delistCard.mutate(id);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <Skeleton className="h-8 w-40 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
            <div className="space-y-6">
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!card) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold">Card not found</h2>
          <Button className="mt-4" onClick={() => setLocation("/collection")}>Back to Collection</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20">
        <Button variant="ghost" onClick={() => setLocation("/collection")} className="mb-6 -ml-4 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Collection
        </Button>

        <div className="flex flex-col lg:flex-row gap-12">
          {/* Card Image Area */}
          <div className="w-full lg:w-1/2 lg:max-w-md mx-auto flex flex-col gap-3">
            <HoloCard imageUrl={card.imageUrl} name={card.name}>
              {card.forSale && (
                <div className="absolute top-4 right-4">
                  <Badge className="bg-primary text-primary-foreground font-bold shadow-lg border-white/20 text-sm px-3 py-1">
                    Listed for {formatCurrency(card.listingPrice)}
                  </Badge>
                </div>
              )}
            </HoloCard>

            {/* Prev / Next navigation */}
            {navList.length > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => prevCard && setLocation(`/collection/${prevCard.id}`)}
                  disabled={!prevCard}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-card text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted/50 hover:border-primary/30 min-w-0 flex-1 justify-start"
                  title={prevCard?.name}
                >
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs text-muted-foreground">{prevCard?.name ?? "—"}</span>
                </button>

                <div className="flex flex-col items-center shrink-0 gap-1">
                  <span className="text-xs font-semibold tabular-nums text-center whitespace-nowrap">
                    {currentIndex + 1} / {navList.length}
                  </span>
                  {hasCategoryScope && (
                    <button
                      onClick={() => setNavScope(navScope === "category" ? "all" : "category")}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                      title={navScope === "category" ? "Switch to all cards" : "Switch to category"}
                    >
                      {navScope === "category"
                        ? <><FolderOpen className="h-3 w-3" />{card.categoryName}</>
                        : <><LayoutList className="h-3 w-3" />All cards</>
                      }
                    </button>
                  )}
                </div>

                <button
                  onClick={() => nextCard && setLocation(`/collection/${nextCard.id}`)}
                  disabled={!nextCard}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-card text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted/50 hover:border-primary/30 min-w-0 flex-1 justify-end"
                  title={nextCard?.name}
                >
                  <span className="truncate text-xs text-muted-foreground">{nextCard?.name ?? "—"}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>

          {/* Details Area */}
          <div className="w-full lg:w-1/2 flex flex-col">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h1 className="text-4xl font-black tracking-tight text-foreground mb-2">{card.name}</h1>
                <p className="text-xl text-muted-foreground font-medium">
                  {card.pokemonName} {card.setName ? `• ${card.setName}` : ""}
                  {card.cardNumber && <span className="ml-2 text-sm bg-secondary px-2 py-1 rounded text-foreground">{card.cardNumber}</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setLocation(`/collection/${id}/edit`)}
                  title="Edit card"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete {card.name} from your collection.
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

            <div className="flex flex-wrap gap-2 my-6">
              <Badge className={`text-sm px-3 py-1 border-0 shadow-sm ${RARITY_COLORS[card.rarity] || ""}`}>
                {formatLabel(card.rarity)}
              </Badge>
              <Badge variant="outline" className={`text-sm px-3 py-1 ${CONDITION_COLORS[card.condition] || ""}`}>
                {formatLabel(card.condition)} Condition
              </Badge>
              {card.categoryName && (
                <Badge variant="secondary" className="text-sm px-3 py-1">
                  {card.categoryName}
                </Badge>
              )}
            </div>

            <div className="bg-card border shadow-sm rounded-xl p-6 mb-6">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Estimated Value</p>
              <h2 className="text-5xl font-black tracking-tighter text-foreground">
                {formatCurrency(card.estimatedValue)}
              </h2>
            </div>

            {/* Other Printings */}
            {(printingsLoading || printings.length > 0) && (
              <div className="mb-8">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" /> Other Printings
                  {!printingsLoading && <span className="font-normal">({printings.length})</span>}
                </h3>

                {printingsLoading ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="shrink-0 w-14 h-[78px] rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5">
                    {printings.map((v) => {
                      const isCurrent = v.setName === card.setName && v.cardNumber === card.cardNumber;
                      const isSelected = selectedPrinting?.id === v.id;
                      return (
                        <button
                          key={v.id}
                          onClick={() => selectPrinting(v)}
                          title={`${v.setName} · ${v.cardNumber}`}
                          className={`shrink-0 w-14 rounded-lg border-2 overflow-hidden flex flex-col transition-all focus:outline-none ${
                            isSelected
                              ? "border-primary shadow-md scale-105"
                              : isCurrent
                              ? "border-emerald-500 ring-1 ring-emerald-300"
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
                          <p className="text-[8px] leading-tight text-center text-muted-foreground px-0.5 py-0.5 truncate w-full">
                            {isCurrent ? "★ " : ""}{v.setName}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Pricing panel for selected printing */}
                {selectedPrinting && (
                  <div className="mt-3 bg-muted/40 border rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-xs font-semibold truncate">{selectedPrinting.setName}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{selectedPrinting.cardNumber}</span>
                      <div className="ml-auto flex items-center gap-1.5 shrink-0">
                        {printingPricing?.isFallback && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">est.</span>
                        )}
                        {printingPricing?.source && (
                          <span className="text-[10px] text-muted-foreground">
                            {printingPricing.source === "tcgplayer" ? "TCGPlayer" : "CardMarket"}
                          </span>
                        )}
                      </div>
                    </div>
                    {printingPricingLoading ? (
                      <div className="flex items-center gap-2 py-1">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-xs text-muted-foreground">Loading price…</span>
                      </div>
                    ) : printingPricing?.marketPrice != null || printingPricing?.lowPrice != null ? (
                      <div className="flex gap-4">
                        {printingPricing.marketPrice != null && (
                          <div>
                            <p className="text-[10px] text-muted-foreground">Market</p>
                            <p className="text-lg font-black">{formatCurrency(printingPricing.marketPrice)}</p>
                          </div>
                        )}
                        {printingPricing.lowPrice != null && (
                          <div>
                            <p className="text-[10px] text-muted-foreground">Low</p>
                            <p className="text-lg font-semibold text-muted-foreground">{formatCurrency(printingPricing.lowPrice)}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No market price available for this printing.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-6 flex-1">
              {card.notes && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Collector's Notes</h3>
                  <div className="bg-muted/30 p-4 rounded-lg border text-sm leading-relaxed">
                    {card.notes}
                  </div>
                </div>
              )}
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Details</h3>
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <div className="text-muted-foreground">Acquired Date</div>
                  <div className="font-medium text-right">{card.acquiredDate ? new Date(card.acquiredDate).toLocaleDateString() : 'Unknown'}</div>
                  <div className="text-muted-foreground">Added to DexPoky</div>
                  <div className="font-medium text-right">{new Date(card.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t flex flex-col sm:flex-row gap-4">
              {card.forSale ? (
                <Button variant="secondary" size="lg" className="flex-1" onClick={handleDelist} disabled={delistCard.isPending}>
                  <Store className="h-5 w-5 mr-2" /> {delistCard.isPending ? "Removing…" : "Remove from Marketplace"}
                </Button>
              ) : (
                <Dialog open={isSellOpen} onOpenChange={handleSellDialogChange}>
                  <DialogTrigger asChild>
                    <Button size="lg" className="flex-1 shadow-md bg-primary hover:bg-primary/90 text-primary-foreground">
                      <Tag className="h-5 w-5 mr-2" /> Sell on Marketplace
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    {listedId ? (
                      <>
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Listed Successfully!
                          </DialogTitle>
                          <DialogDescription>
                            <span className="font-medium text-foreground">{card.name}</span> is now live on the marketplace for {formatCurrency(parseFloat(sellPrice))}.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="mt-2 gap-2 sm:gap-0">
                          <Button variant="outline" onClick={() => handleSellDialogChange(false)}>Close</Button>
                          <Button onClick={() => { handleSellDialogChange(false); setLocation(`/marketplace/${listedId}`); }}>
                            <ExternalLink className="h-4 w-4 mr-2" /> View Listing
                          </Button>
                        </DialogFooter>
                      </>
                    ) : (
                      <>
                        <DialogHeader>
                          <DialogTitle>List Card for Sale</DialogTitle>
                          <DialogDescription>
                            Set your price to list {card.name} on the global marketplace.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <label className="block text-sm font-medium mb-2">Listing Price ($)</label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder={card.estimatedValue?.toString() || "0.00"}
                            value={sellPrice}
                            onChange={(e) => setSellPrice(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSell()}
                            className="text-lg py-6"
                          />
                          <p className="text-xs text-muted-foreground mt-2">
                            Estimated value: {formatCurrency(card.estimatedValue)}
                          </p>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => handleSellDialogChange(false)}>Cancel</Button>
                          <Button onClick={handleSell} disabled={listCard.isPending}>
                            {listCard.isPending ? "Listing…" : "Confirm Listing"}
                          </Button>
                        </DialogFooter>
                      </>
                    )}
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
import { useState, useMemo, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { Layout } from "@/components/layout";
import {
  useAddWishlistItem,
  useGetPokemonSet,
  useListCards,
  useListWishlist,
  getGetPokemonSetQueryKey,
  type WishlistItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, CheckCircle2, Circle, AlertCircle, Heart, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getSetCompletion } from "@/lib/set-completion";

const WISHLIST_KEY = ["/api/wishlist"] as const;
const RARITY_SECTION_ORDER = [
  "Common",
  "Uncommon",
  "Rare",
  "Double Rare",
  "Ultra Rare",
  "Mega Attack Rare",
  "Illustration Rare",
  "Special Illustration Rare",
  "Mega Hyper Rare",
];

export default function SetDetail() {
  const [, params] = useRoute("/sets/:id");
  const setId = params?.id || "";
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<'all' | 'owned' | 'missing'>('all');
  const [search, setSearch] = useState("");
  const [savingCardId, setSavingCardId] = useState<string | null>(null);

  const { data: set, isLoading: setLoad, error: setError } = useGetPokemonSet(setId, {
    query: { enabled: !!setId, queryKey: getGetPokemonSetQueryKey(setId) }
  });

  const { data: ownedCards, isLoading: cardsLoad } = useListCards();
  const { data: wishlistItems } = useListWishlist({
    query: { queryKey: [...WISHLIST_KEY] },
  });
  const addWishlistItem = useAddWishlistItem();

  const wishedCardIds = useMemo(
    () => new Set((wishlistItems ?? []).map((item) => item.catalogCardId)),
    [wishlistItems],
  );

  const addToWishlist = (card: { id: string; name: string }) => {
    if (wishedCardIds.has(card.id) || savingCardId) return;

    setSavingCardId(card.id);
    addWishlistItem.mutate(
      {
        data: {
          catalogCardId: card.id,
          priority: "normal",
        },
      },
      {
        onSuccess: (savedItem) => {
          queryClient.setQueryData<WishlistItem[]>(WISHLIST_KEY, (current = []) => {
            const withoutDuplicate = current.filter(
              (item) => item.catalogCardId !== savedItem.catalogCardId,
            );
            return [savedItem, ...withoutDuplicate];
          });
          toast.success(`${card.name} added to wishlist`);
        },
        onError: () => toast.error(`Couldn't add ${card.name} to your wishlist`),
        onSettled: () => setSavingCardId(null),
      },
    );
  };

  useEffect(() => {
    if (set?.name) {
      document.title = `${set.name} | DexPoky`;
    } else {
      document.title = "Set Details | DexPoky";
    }
  }, [set?.name]);

  const isLoading = setLoad || cardsLoad;

  const completion = useMemo(() => {
    if (!set) {
      return getSetCompletion(
        { id: setId, name: "", totalCards: 0, cards: [] },
        [],
      );
    }
    return getSetCompletion(set, ownedCards ?? []);
  }, [ownedCards, set]);
  const ownedSetCardIds = completion.ownedCardKeys;
  const firstOwnedCardIdMap = completion.firstOwnedCardIdMap;

  const filteredCards = useMemo(() => {
    if (!set) return [];
    let result = [...set.cards];

    if (filter === 'owned') {
      result = result.filter(c => ownedSetCardIds.has(c.id));
    } else if (filter === 'missing') {
      result = result.filter(c => !ownedSetCardIds.has(c.id));
    }

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(s) || c.localId.toLowerCase().includes(s));
    }

    // Sort by localId numerically if possible, otherwise string fallback
    return result.sort((a, b) => {
      const numA = parseInt(a.localId.replace(/\D/g, ''), 10);
      const numB = parseInt(b.localId.replace(/\D/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA === numB) return a.localId.localeCompare(b.localId);
        return numA - numB;
      }
      return a.localId.localeCompare(b.localId);
    });
  }, [set, filter, search, ownedSetCardIds]);

  const cardsByRarity = useMemo(() => {
    const groups = new Map<string, typeof filteredCards>();
    for (const card of filteredCards) {
      const rawRarity = card.rarity?.trim();
      const rarity = rawRarity && rawRarity.toLowerCase() !== "none" ? rawRarity : "Other";
      const group = groups.get(rarity) ?? [];
      group.push(card);
      groups.set(rarity, group);
    }
    return Array.from(groups.entries()).sort(([rarityA], [rarityB]) => {
      const indexA = RARITY_SECTION_ORDER.indexOf(rarityA);
      const indexB = RARITY_SECTION_ORDER.indexOf(rarityB);
      const rankA = indexA === -1 ? RARITY_SECTION_ORDER.length : indexA;
      const rankB = indexB === -1 ? RARITY_SECTION_ORDER.length : indexB;
      return rankA - rankB;
    });
  }, [filteredCards]);

  if (setError) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Set not found</h2>
          <p className="text-muted-foreground mb-6">We couldn't load the details for this set.</p>
          <Link href="/sets">
            <Button variant="outline"><ChevronLeft className="mr-2 h-4 w-4" /> Back to Sets</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const total = completion.totalCount;
  const ownedCount = completion.ownedCount;
  const progress = completion.completionPercent;
  const isComplete = progress === 100 && total > 0;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
        {/* Header Section */}
        <div className="mb-8">
          <Link href="/sets">
            <button className="flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-6 group">
              <ChevronLeft className="h-4 w-4 mr-1 group-hover:-translate-x-1 transition-transform" />
              Back to all sets
            </button>
          </Link>

          {isLoading || !set ? (
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <Skeleton className="h-32 w-48 rounded-xl shrink-0" />
              <div className="flex-1 w-full space-y-4">
                <Skeleton className="h-10 w-2/3" />
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-12 w-full mt-6 rounded-2xl" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-start">
              {/* Set Logo */}
              <div className="w-40 md:w-56 shrink-0 bg-card rounded-3xl p-6 border shadow-sm flex items-center justify-center aspect-video relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                {set.logoUrl ? (
                  <img src={set.logoUrl} alt={set.name} className="w-full h-full object-contain filter drop-shadow-md relative z-10" />
                ) : (
                  <div className="text-xl font-bold text-center text-muted-foreground">{set.name}</div>
                )}
                {set.symbolUrl && (
                  <div className="absolute bottom-3 right-3 h-8 w-8 bg-background/80 backdrop-blur rounded-full p-1.5 shadow-sm border border-border/50">
                    <img src={set.symbolUrl} alt="symbol" className="w-full h-full object-contain opacity-70" />
                  </div>
                )}
              </div>

              {/* Set Details & Progress */}
              <div className="flex-1 w-full flex flex-col justify-center py-2">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{set.name}</h1>
                  {set.seriesName && (
                    <Badge variant="secondary" className="bg-secondary/60 text-secondary-foreground hover:bg-secondary/80 text-sm">
                      {set.seriesName}
                    </Badge>
                  )}
                </div>
                
                <div className="text-muted-foreground mb-8 flex items-center gap-2 text-sm">
                  {set.releaseDate && <span>Released {new Date(set.releaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>}
                  {set.releaseDate && <span className="opacity-50">•</span>}
                  <span>{set.cards.length} variants available</span>
                </div>

                {/* Progress Bar Area */}
                <div className={cn(
                  "rounded-2xl p-5 border transition-all duration-500",
                  isComplete 
                    ? "bg-gradient-to-r from-amber-50 to-orange-50/50 dark:from-amber-950/30 dark:to-orange-950/10 border-amber-200 dark:border-amber-900/50" 
                    : "bg-card shadow-sm border-border/60"
                )}>
                  <div className="flex items-end justify-between mb-3">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Completion Progress</div>
                      <div className="flex items-baseline gap-2">
                        <span className={cn(
                          "text-3xl font-bold", 
                          isComplete ? "text-amber-600 dark:text-amber-500" : "text-foreground"
                        )}>
                          {ownedCount}
                        </span>
                        <span className="text-lg font-medium text-muted-foreground">/ {total} cards</span>
                      </div>
                    </div>
                    <div className={cn(
                      "text-2xl font-bold",
                      isComplete ? "text-amber-600 dark:text-amber-500" : "text-primary"
                    )}>
                      {progress}%
                    </div>
                  </div>
                  
                  <div className="h-3 w-full bg-secondary/80 overflow-hidden rounded-full mt-2">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-1000 ease-out",
                        isComplete ? "bg-gradient-to-r from-amber-400 to-orange-400 dark:from-amber-500 dark:to-orange-500" : "bg-primary"
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {isComplete && (
                    <div className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> Expansion complete!
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Toolbar */}
        {!isLoading && set && (
          <div className="sticky top-16 md:top-0 z-20 bg-background/80 backdrop-blur-xl border-y py-4 mb-8 -mx-4 px-4 sm:mx-0 sm:px-0 sm:border-y-0 sm:border-b sm:bg-transparent sm:backdrop-blur-none flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex bg-muted/40 p-1 rounded-xl w-full sm:w-auto overflow-x-auto hide-scrollbar">
              <button
                onClick={() => setFilter('all')}
                className={cn(
                  "px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-all",
                  filter === 'all' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                All Cards
              </button>
              <button
                onClick={() => setFilter('owned')}
                className={cn(
                  "px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-all flex items-center gap-2",
                  filter === 'owned' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                <CheckCircle2 className={cn("h-4 w-4", filter === 'owned' ? "text-green-500" : "")} />
                Collected
                <Badge variant="secondary" className="ml-1 opacity-70 px-1.5 py-0 h-5 min-w-5 flex items-center justify-center">{ownedCount}</Badge>
              </button>
              <button
                onClick={() => setFilter('missing')}
                className={cn(
                  "px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-all flex items-center gap-2",
                  filter === 'missing' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                <Circle className="h-4 w-4 border-2 border-dashed rounded-full text-transparent" />
                Missing
                <Badge variant="secondary" className="ml-1 opacity-70 px-1.5 py-0 h-5 min-w-5 flex items-center justify-center">{completion.missingCount}</Badge>
              </button>
            </div>

            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name or number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-card border-muted/60 focus-visible:ring-primary/50 rounded-xl shadow-sm"
              />
            </div>
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="aspect-[63/88] rounded-xl w-full" />
                <Skeleton className="h-4 w-3/4 mx-auto" />
                <Skeleton className="h-3 w-1/2 mx-auto" />
              </div>
            ))}
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-muted/50 rounded-3xl bg-muted/10">
            <Search className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground mb-1">No cards found</h3>
            <p className="text-muted-foreground text-sm">
              {search ? "Try a different search term." : `You don't have any ${filter} cards in this set.`}
            </p>
            {(search || filter !== 'all') && (
              <Button 
                variant="link" 
                onClick={() => { setSearch(""); setFilter("all"); }}
                className="mt-4"
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-14">
            {cardsByRarity.map(([rarity, cards]) => (
              <section key={rarity} className="space-y-6">
                <div className="flex items-center gap-3 border-b pb-3">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{rarity}</h2>
                  <Badge variant="secondary" className="rounded-full px-2.5">
                    {cards.length} {cards.length === 1 ? "card" : "cards"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10">
                  {cards.map((card) => {
              const isOwned = ownedSetCardIds.has(card.id);
              const ownedCardId = firstOwnedCardIdMap.get(card.id);
              const isWished = wishedCardIds.has(card.id);
              const isSaving = savingCardId === card.id;
              
              const CardInner = (
                <>
                  <div className={cn(
                    "relative aspect-[63/88] rounded-[4.5%] overflow-hidden bg-muted/30 shadow-sm transition-all duration-300",
                    isOwned 
                      ? "ring-2 ring-primary/20 ring-offset-2 ring-offset-background hover:shadow-xl hover:-translate-y-1.5" 
                      : "opacity-60 grayscale-[0.6] hover:grayscale-[0.2] hover:opacity-100"
                  )}>
                    {card.imageUrl ? (
                      <img 
                        src={card.imageUrl} 
                        alt={card.name}
                        loading="lazy"
                        className="w-full h-full object-cover object-center"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-muted-foreground/20 rounded-[4.5%]">
                        {set?.logoUrl && <img src={set.logoUrl} alt="" className="w-12 h-12 object-contain opacity-20 mb-2" />}
                        <span className="text-xs font-medium text-muted-foreground">Image Missing</span>
                      </div>
                    )}

                    {isOwned && (
                      <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1 shadow-sm backdrop-blur-sm bg-opacity-90">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                    )}

                    {!isOwned && (
                      <Button
                        type="button"
                        size="sm"
                        variant={isWished ? "secondary" : "default"}
                        disabled={isWished || isSaving || (!!savingCardId && !isSaving)}
                        onClick={() => addToWishlist(card)}
                        className={cn(
                          "absolute bottom-2 left-2 right-2 h-9 rounded-lg shadow-md",
                          isWished && "bg-background/95 text-foreground",
                        )}
                        aria-label={isWished ? `${card.name} is saved to wishlist` : `Add ${card.name} to wishlist`}
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Heart className={cn("h-4 w-4 mr-1.5", isWished && "fill-current text-rose-500")} />
                        )}
                        {isSaving ? "Saving..." : isWished ? "Saved" : "Wishlist"}
                      </Button>
                    )}
                    
                    {/* Holo foil effect overlay for owned cards */}
                    {isOwned && (
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 hover:opacity-100 mix-blend-overlay transition-opacity duration-500 pointer-events-none" />
                    )}
                  </div>
                  
                  <div className="mt-3 text-center px-1">
                    <h3 className={cn(
                      "font-semibold text-sm leading-tight line-clamp-1 mb-0.5 transition-colors",
                      isOwned ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {card.name}
                    </h3>
                    <p className="text-xs font-medium text-muted-foreground/70 uppercase tracking-widest">
                      {card.localId}
                    </p>
                  </div>
                </>
              );

              return isOwned && ownedCardId ? (
                <Link key={card.id} href={`/collection/${ownedCardId}`} className="group block focus:outline-none focus-visible:ring-2 ring-primary rounded-xl">
                  {CardInner}
                </Link>
              ) : (
                <div key={card.id} className="group block cursor-default">
                  {CardInner}
                </div>
              );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

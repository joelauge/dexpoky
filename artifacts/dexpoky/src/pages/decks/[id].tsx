import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetDeck,
  useUpdateDeck,
  useAddDeckCard,
  useDeleteDeck,
  useListCards,
  useListWishlist,
  type DeckCardEntry,
  type CatalogCard,
  customFetch,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft,
  ImageIcon,
  Plus,
  Trash2,
  X,
  Save,
  Search,
  Heart,
  Library,
  Layers,
  SlidersHorizontal,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { RulesSheet } from "@/components/rules-sheet";
import { CatalogSearch } from "@/components/catalog-search";

const STYLE_LABELS: Record<string, string> = {
  aggro: "Aggro",
  control: "Control",
  midrange: "Midrange",
  combo: "Combo",
  mill: "Mill",
  tank: "Tank",
};

const STYLE_COLORS: Record<string, string> = {
  aggro: "bg-red-100 text-red-700 border-red-200",
  control: "bg-blue-100 text-blue-700 border-blue-200",
  midrange: "bg-purple-100 text-purple-700 border-purple-200",
  combo: "bg-amber-100 text-amber-700 border-amber-200",
  mill: "bg-emerald-100 text-emerald-700 border-emerald-200",
  tank: "bg-slate-200 text-slate-700 border-slate-300",
};

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  owned: { label: "Owned", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  catalog: { label: "Catalog", className: "bg-sky-100 text-sky-700 border-sky-200" },
  wishlist: { label: "Wishlist", className: "bg-rose-100 text-rose-700 border-rose-200" },
};

function entryDisplay(entry: DeckCardEntry) {
  return {
    name: entry.card?.name ?? entry.snapshotName ?? "Unknown card",
    imageUrl: entry.card?.imageUrl ?? entry.snapshotImageUrl ?? null,
    setName: entry.card?.setName ?? entry.snapshotSetName ?? null,
    cardNumber: entry.card?.cardNumber ?? entry.snapshotCardNumber ?? null,
  };
}

export default function DeckDetail() {
  const [, params] = useRoute("/decks/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  const queryClient = useQueryClient();

  const deckQueryKey = [`/api/decks/${id}`] as const;
  const { data: deck, isLoading, isError } = useGetDeck(id, {
    query: { enabled: Number.isInteger(id), queryKey: [...deckQueryKey] },
  });
  const { data: collection } = useListCards();
  const { data: wishlist } = useListWishlist();
  const updateDeck = useUpdateDeck();
  const addCard = useAddDeckCard();
  const deleteDeck = useDeleteDeck();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [removingId, setRemovingId] = useState<number | null>(null);
  // Card size: 1 (tiny, most cards visible) → 5 (large). Default 3.
  const [cardSize, setCardSize] = useState(3);

  const GRID_COLS = [
    "grid-cols-5 sm:grid-cols-7 lg:grid-cols-9",  // 1 — most cards
    "grid-cols-4 sm:grid-cols-6 lg:grid-cols-7",  // 2
    "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6",  // 3 — default
    "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",  // 4
    "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3",  // 5 — largest
  ] as const;
  const gridClass = GRID_COLS[cardSize - 1];

  const startEdit = () => {
    if (!deck) return;
    setName(deck.name);
    setStrategy(deck.strategy ?? "");
    setEditing(true);
  };

  const saveEdit = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    updateDeck.mutate(
      { id, data: { name: name.trim(), strategy: strategy.trim() || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: deckQueryKey });
          queryClient.invalidateQueries({ queryKey: ["/api/decks"] });
          toast.success("Deck updated");
          setEditing(false);
        },
        onError: () => toast.error("Failed to update"),
      },
    );
  };

  const invalidateDeck = () => {
    queryClient.invalidateQueries({ queryKey: deckQueryKey });
    queryClient.invalidateQueries({ queryKey: ["/api/decks"] });
  };

  const handleAddOwned = (cardId: number) => {
    addCard.mutate(
      { id, data: { cardId, count: 1 } },
      { onSuccess: invalidateDeck, onError: () => toast.error("Failed to add card") },
    );
  };

  const handleAddCatalog = (card: CatalogCard) => {
    addCard.mutate(
      { id, data: { catalogCardId: card.id, count: 1 } },
      {
        onSuccess: () => {
          invalidateDeck();
          toast.success(`Added ${card.name}`);
        },
        onError: () => toast.error("Catalog temporarily unavailable"),
      },
    );
  };

  const handleAddWishlist = (wishlistItemId: number, label: string) => {
    addCard.mutate(
      { id, data: { wishlistItemId, count: 1 } },
      {
        onSuccess: () => {
          invalidateDeck();
          toast.success(`Added ${label}`);
        },
        onError: () => toast.error("Failed to add wishlist card"),
      },
    );
  };

  /**
   * Remove an entry by its `entryId` token. The endpoint accepts
   * `entry-<id>` for the new entry-based scheme. We bypass the generated
   * `useRemoveDeckCard` (which expects a numeric cardId) and call the API
   * directly so all source types can be removed.
   */
  const handleRemove = async (entryId: number) => {
    setRemovingId(entryId);
    try {
      await customFetch<void>(`/api/decks/${id}/cards/entry-${entryId}`, {
        method: "DELETE",
      });
      invalidateDeck();
    } catch {
      toast.error("Failed to remove card");
    } finally {
      setRemovingId(null);
    }
  };

  const handleDeleteDeck = () => {
    if (!deck) return;
    if (!confirm(`Delete deck "${deck.name}"?`)) return;
    deleteDeck.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/decks"] });
          toast.success("Deck deleted");
          setLocation("/decks");
        },
        onError: () => toast.error("Failed to delete"),
      },
    );
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-8 w-32 mb-4" />
          <Skeleton className="h-12 w-64 mb-6" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4]" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (isError || !deck) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/decks">
            <Button variant="ghost" size="sm" className="mb-4 gap-1">
              <ArrowLeft className="h-4 w-4" /> All decks
            </Button>
          </Link>
          <div className="border-2 border-dashed rounded-2xl p-10 text-center bg-muted/20">
            <h2 className="text-xl font-semibold mb-2">Deck not found</h2>
            <p className="text-muted-foreground mb-4">
              This deck doesn't exist or you don't have access to it.
            </p>
            <Link href="/decks">
              <Button>Back to all decks</Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  // Track in-deck source ids so the picker can disable already-added items.
  const ownedInDeck = new Set(
    deck.cards.filter((c) => c.source === "owned" && c.cardId).map((c) => c.cardId!),
  );
  const wishlistInDeck = new Set(
    deck.cards.filter((c) => c.wishlistItemId != null).map((c) => c.wishlistItemId!),
  );
  const catalogInDeck = new Set(
    deck.cards.filter((c) => c.catalogCardId).map((c) => c.catalogCardId!),
  );

  const availableOwned = (collection ?? []).filter(
    (c) =>
      !ownedInDeck.has(c.id) &&
      (pickerSearch.trim() === "" ||
        c.name.toLowerCase().includes(pickerSearch.toLowerCase())),
  );
  const availableWishlist = (wishlist ?? []).filter(
    (w) => !wishlistInDeck.has(w.id),
  );
  const totalCount = deck.cards.reduce((sum, c) => sum + c.count, 0);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/decks">
          <Button variant="ghost" size="sm" className="mb-4 gap-1">
            <ArrowLeft className="h-4 w-4" /> All decks
          </Button>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <Badge className={`border mb-2 ${STYLE_COLORS[deck.gameStyle] ?? ""}`}>
              {STYLE_LABELS[deck.gameStyle] ?? deck.gameStyle}
            </Badge>
            {editing ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-2xl font-bold h-auto py-1"
              />
            ) : (
              <h1 className="text-3xl font-bold tracking-tight break-words">{deck.name}</h1>
            )}
            <p className="text-muted-foreground text-sm mt-1">
              {totalCount} card{totalCount === 1 ? "" : "s"} ({deck.cards.length} unique)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <RulesSheet
              defaultSectionId="deck-building"
              quickLinks={[
                { sectionId: "deck-building", label: "Deck Building" },
                { sectionId: "card-types", label: "Card Types" },
                { sectionId: "setup", label: "Game Setup" },
              ]}
            />
            {editing ? (
              <>
                <Button onClick={saveEdit} disabled={updateDeck.isPending} className="gap-1">
                  <Save className="h-4 w-4" /> Save
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={startEdit}>Edit</Button>
                <Button variant="outline" onClick={handleDeleteDeck} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {(deck.strategy || editing) && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                Strategy
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Textarea
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  rows={4}
                  placeholder="Describe the win condition and key plays..."
                />
              ) : (
                <p className="text-sm leading-relaxed">{deck.strategy}</p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold">
            Cards
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {totalCount} / 60
            </span>
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 min-w-[140px]">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Slider
                min={1}
                max={5}
                step={1}
                value={[cardSize]}
                onValueChange={([v]) => setCardSize(v)}
                className="w-24"
                aria-label="Card size"
              />
            </div>
            <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> Add card
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Add a card</DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="owned" className="flex flex-col flex-1 min-h-0">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="owned" className="gap-1.5">
                    <Layers className="h-3.5 w-3.5" /> Owned
                  </TabsTrigger>
                  <TabsTrigger value="catalog" className="gap-1.5">
                    <Library className="h-3.5 w-3.5" /> Catalog
                  </TabsTrigger>
                  <TabsTrigger value="wishlist" className="gap-1.5">
                    <Heart className="h-3.5 w-3.5" /> Wishlist
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="owned" className="mt-3 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search your collection..."
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="overflow-y-auto flex-1 -mx-1 px-1">
                    {availableOwned.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No more owned cards to add.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {availableOwned.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              handleAddOwned(c.id);
                              setPickerOpen(false);
                              setPickerSearch("");
                            }}
                            className="text-left rounded-lg border hover:border-primary transition-colors overflow-hidden"
                          >
                            <div className="aspect-[3/4] bg-muted/30">
                              {c.imageUrl ? (
                                <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                                  <ImageIcon className="h-6 w-6" />
                                </div>
                              )}
                            </div>
                            <p className="text-xs font-semibold p-2 truncate">{c.name}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="catalog" className="mt-3 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
                  <CatalogSearch
                    onSelect={(c) => {
                      handleAddCatalog(c);
                      setPickerOpen(false);
                    }}
                    excludeIds={catalogInDeck}
                    emptyHint="Find any printed card via the global catalog."
                    autoFocus
                  />
                </TabsContent>

                <TabsContent value="wishlist" className="mt-3 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
                  <div className="overflow-y-auto flex-1 -mx-1 px-1">
                    {availableWishlist.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No wishlist items left to add.{" "}
                        <Link href="/wishlist" className="text-primary underline">
                          Manage wishlist →
                        </Link>
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {availableWishlist.map((w) => (
                          <button
                            key={w.id}
                            onClick={() => {
                              handleAddWishlist(w.id, w.name);
                              setPickerOpen(false);
                            }}
                            className="text-left rounded-lg border hover:border-primary transition-colors overflow-hidden"
                          >
                            <div className="aspect-[3/4] bg-muted/30 relative">
                              {w.imageUrl ? (
                                <img src={w.imageUrl} alt={w.name} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                                  <ImageIcon className="h-6 w-6" />
                                </div>
                              )}
                              <Heart className="absolute top-1 right-1 h-3.5 w-3.5 text-rose-500 fill-rose-500" />
                            </div>
                            <p className="text-xs font-semibold p-2 truncate">{w.name}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {deck.cards.length === 0 ? (
          <div className="border-2 border-dashed rounded-2xl p-10 text-center bg-muted/20">
            <p className="text-muted-foreground">No cards in this deck yet.</p>
          </div>
        ) : (
          <div className={`grid ${gridClass} gap-2`}>
            {deck.cards.map((entry) => {
              const display = entryDisplay(entry);
              const sourceBadge = SOURCE_BADGE[entry.source];
              const isRemoving = removingId === entry.entryId;
              return (
                <div
                  key={entry.entryId}
                  className="group relative rounded-xl border overflow-hidden bg-card hover:shadow-md transition-shadow"
                >
                  <div className="aspect-[3/4] bg-muted/30 relative">
                    {display.imageUrl ? (
                      <img src={display.imageUrl} alt={display.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                        <ImageIcon className="h-8 w-8" />
                      </div>
                    )}
                    {entry.count > 1 && (
                      <Badge className="absolute top-2 left-2 bg-primary/90 text-primary-foreground">
                        ×{entry.count}
                      </Badge>
                    )}
                    {entry.role && (
                      <Badge variant="secondary" className="absolute bottom-2 left-2 text-[10px] capitalize">
                        {entry.role}
                      </Badge>
                    )}
                    {entry.source !== "owned" && sourceBadge && (
                      <span
                        className={`absolute bottom-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${sourceBadge.className}`}
                      >
                        {sourceBadge.label}
                      </span>
                    )}
                    <button
                      onClick={() => handleRemove(entry.entryId)}
                      disabled={isRemoving}
                      className="absolute top-1.5 right-1.5 bg-background/90 hover:bg-destructive hover:text-destructive-foreground rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm disabled:opacity-50"
                      aria-label="Remove from deck"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {cardSize >= 3 && (
                    <div className="p-1.5">
                      <p className="text-[11px] font-semibold truncate leading-tight">{display.name}</p>
                      {cardSize >= 4 && (display.setName || display.cardNumber) && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {display.setName ?? ""}
                          {display.cardNumber ? ` · #${display.cardNumber}` : ""}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

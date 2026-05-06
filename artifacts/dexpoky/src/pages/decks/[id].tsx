import { useState, useEffect, useCallback } from "react";
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
  Plus,
  Trash2,
  X,
  Save,
  Search,
  Heart,
  Library,
  Layers,
  SlidersHorizontal,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
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
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

// ── CardLightbox ─────────────────────────────────────────────────────────────

function CardLightbox({
  cards,
  index,
  onClose,
  onNavigate,
}: {
  cards: DeckCardEntry[];
  index: number;
  onClose: () => void;
  onNavigate: (newIndex: number) => void;
}) {
  const entry = cards[index];
  const display = entryDisplay(entry);
  const total = cards.length;
  const sourceBadge = SOURCE_BADGE[entry.source];

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onNavigate((index + 1) % total);
      if (e.key === "ArrowLeft") onNavigate((index - 1 + total) % total);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, total, onClose, onNavigate]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      {/* Blurred backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md transition-opacity animate-in fade-in duration-200" />

      {/* Card panel */}
      <div
        className="relative z-10 flex flex-col items-center gap-5 px-4 animate-in fade-in zoom-in-90 duration-250 ease-out"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nav row */}
        <div className="flex items-center gap-4 w-full justify-between" style={{ maxWidth: 320 }}>
          <button
            onClick={() => onNavigate((index - 1 + total) % total)}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 border border-white/20 text-white transition-colors backdrop-blur-sm"
            aria-label="Previous card"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-white/70 text-sm font-medium tabular-nums select-none">
            {index + 1} / {total}
          </span>
          <button
            onClick={() => onNavigate((index + 1) % total)}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 border border-white/20 text-white transition-colors backdrop-blur-sm"
            aria-label="Next card"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Card image */}
        <div
          className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10"
          style={{ width: 280, aspectRatio: "3/4" }}
        >
          {display.imageUrl ? (
            <img
              key={entry.entryId}
              src={display.imageUrl}
              alt={display.name}
              className="w-full h-full object-cover animate-in fade-in duration-150"
            />
          ) : (
            <div className="w-full h-full bg-muted/20 flex items-center justify-center">
              <img src="/logo.png" alt="" aria-hidden className="w-1/2 opacity-10 grayscale select-none pointer-events-none" />
            </div>
          )}
          {entry.count > 1 && (
            <div className="absolute top-3 left-3">
              <span className="bg-primary text-primary-foreground text-sm font-bold px-2 py-0.5 rounded-full shadow">
                ×{entry.count}
              </span>
            </div>
          )}
          {entry.source !== "owned" && sourceBadge && (
            <div className="absolute top-3 right-3">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border shadow ${sourceBadge.className}`}>
                {sourceBadge.label}
              </span>
            </div>
          )}
        </div>

        {/* Card info */}
        <div className="text-center" style={{ maxWidth: 280 }}>
          <p className="text-white font-bold text-lg leading-tight">{display.name}</p>
          {(display.setName || display.cardNumber) && (
            <p className="text-white/50 text-sm mt-0.5">
              {display.setName ?? ""}
              {display.cardNumber ? ` · #${display.cardNumber}` : ""}
            </p>
          )}
          <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
            {entry.role && (
              <Badge variant="secondary" className="text-xs capitalize bg-white/10 text-white border-white/20">
                {entry.role}
              </Badge>
            )}
            {entry.notes && (
              <p className="text-white/40 text-xs mt-1 max-w-xs leading-relaxed">{entry.notes}</p>
            )}
          </div>
        </div>

        {/* Dismiss hint */}
        <p className="text-white/30 text-xs select-none">
          Tap outside or press Esc to close · ← → to navigate
        </p>
      </div>
    </div>
  );
}

// ── CardFace ──────────────────────────────────────────────────────────────────

function CardFace({
  entry,
  cardSize,
  isRemoving,
  onRemove,
  onZoom,
  isDragging = false,
}: {
  entry: DeckCardEntry;
  cardSize: number;
  isRemoving: boolean;
  onRemove: (id: number) => void;
  onZoom?: () => void;
  isDragging?: boolean;
}) {
  const display = entryDisplay(entry);
  const sourceBadge = SOURCE_BADGE[entry.source];

  return (
    <div
      className={`rounded-xl border overflow-hidden bg-card transition-shadow cursor-pointer ${isDragging ? "shadow-2xl opacity-90 ring-2 ring-primary" : "hover:shadow-md"}`}
      onClick={onZoom}
    >
      <div className="aspect-[3/4] bg-muted/30 relative group/img">
        {display.imageUrl ? (
          <img src={display.imageUrl} alt={display.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <img src="/logo.png" alt="" aria-hidden className="w-4/5 max-w-[104px] opacity-[0.12] grayscale select-none pointer-events-none" />
          </div>
        )}
        {/* Zoom hint overlay on hover */}
        {onZoom && !isDragging && (
          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
            <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover/img:opacity-80 transition-opacity drop-shadow" />
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
          <span className={`absolute bottom-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${sourceBadge.className}`}>
            {sourceBadge.label}
          </span>
        )}
        {/* Desktop hover-only remove */}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(entry.entryId); }}
          disabled={isRemoving}
          className="absolute top-1.5 right-1.5 bg-background/90 hover:bg-destructive hover:text-destructive-foreground rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm disabled:opacity-50 hidden sm:flex z-10"
          aria-label="Remove from deck"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {cardSize >= 3 && (
        <div className="px-1.5 pt-1 pb-0.5">
          <p className="text-[11px] font-semibold truncate leading-tight">{display.name}</p>
          {cardSize >= 4 && (display.setName || display.cardNumber) && (
            <p className="text-[10px] text-muted-foreground truncate">
              {display.setName ?? ""}
              {display.cardNumber ? ` · #${display.cardNumber}` : ""}
            </p>
          )}
        </div>
      )}
      {/* Mobile always-visible remove button */}
      <div className="sm:hidden px-1.5 pb-1.5 pt-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(entry.entryId); }}
          disabled={isRemoving}
          className="w-full flex items-center justify-center gap-1 h-6 rounded-md bg-destructive/10 text-destructive hover:bg-destructive hover:text-white text-[10px] font-medium transition-colors disabled:opacity-40"
          aria-label="Remove from deck"
        >
          <X className="h-3 w-3" /> Remove
        </button>
      </div>
    </div>
  );
}

function SortableCard({
  entry,
  cardSize,
  isRemoving,
  onRemove,
  onZoom,
}: {
  entry: DeckCardEntry;
  cardSize: number;
  isRemoving: boolean;
  onRemove: (id: number) => void;
  onZoom: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.entryId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      {/* Drag handle — always visible on mobile, hover on desktop */}
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-1.5 left-1.5 z-10 bg-background/80 rounded-full p-1 cursor-grab active:cursor-grabbing shadow-sm sm:opacity-0 sm:group-hover:opacity-100 transition-opacity touch-none"
        aria-label="Drag to reorder"
        tabIndex={-1}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <CardFace
        entry={entry}
        cardSize={cardSize}
        isRemoving={isRemoving}
        onRemove={onRemove}
        onZoom={isDragging ? undefined : onZoom}
        isDragging={isDragging}
      />
    </div>
  );
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
  const [cardSize, setCardSize] = useState(3);
  // Local card order for drag-and-drop (resets when server data changes)
  const [localCards, setLocalCards] = useState<DeckCardEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<DeckCardEntry | null>(null);
  // Lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const handleLightboxNavigate = useCallback((newIndex: number) => setLightboxIndex(newIndex), []);

  // Sync local order whenever server data arrives
  useEffect(() => {
    if (deck?.cards) setLocalCards(deck.cards);
  }, [deck?.cards]);

  const GRID_COLS = [
    "grid-cols-5 sm:grid-cols-7 lg:grid-cols-9",
    "grid-cols-4 sm:grid-cols-6 lg:grid-cols-7",
    "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6",
    "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
    "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3",
  ] as const;
  const gridClass = GRID_COLS[cardSize - 1];

  // dnd-kit sensors — PointerSensor with 250ms delay activates on long-press (mobile)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const entry = localCards.find((c) => c.entryId === event.active.id);
    setActiveEntry(entry ?? null);
  }, [localCards]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveEntry(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLocalCards((prev) => {
        const oldIdx = prev.findIndex((c) => c.entryId === active.id);
        const newIdx = prev.findIndex((c) => c.entryId === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }, []);

  const startEdit = () => {
    if (!deck) return;
    setName(deck.name);
    setStrategy(deck.strategy ?? "");
    setEditing(true);
  };

  const saveEdit = () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
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
        onSuccess: () => { invalidateDeck(); toast.success(`Added ${card.name}`); },
        onError: () => toast.error("Catalog temporarily unavailable"),
      },
    );
  };

  const handleAddWishlist = (wishlistItemId: number, label: string) => {
    addCard.mutate(
      { id, data: { wishlistItemId, count: 1 } },
      {
        onSuccess: () => { invalidateDeck(); toast.success(`Added ${label}`); },
        onError: () => toast.error("Failed to add wishlist card"),
      },
    );
  };

  const handleRemove = async (entryId: number) => {
    setRemovingId(entryId);
    setLocalCards((prev) => prev.filter((c) => c.entryId !== entryId));
    try {
      await customFetch<void>(`/api/decks/${id}/cards/entry-${entryId}`, { method: "DELETE" });
      invalidateDeck();
    } catch {
      toast.error("Failed to remove card");
      if (deck?.cards) setLocalCards(deck.cards);
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
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="aspect-[3/4]" />)}
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
            <p className="text-muted-foreground mb-4">This deck doesn't exist or you don't have access to it.</p>
            <Link href="/decks"><Button>Back to all decks</Button></Link>
          </div>
        </div>
      </Layout>
    );
  }

  const ownedInDeck = new Set(deck.cards.filter((c) => c.source === "owned" && c.cardId).map((c) => c.cardId!));
  const wishlistInDeck = new Set(deck.cards.filter((c) => c.wishlistItemId != null).map((c) => c.wishlistItemId!));
  const catalogInDeck = new Set(deck.cards.filter((c) => c.catalogCardId).map((c) => c.catalogCardId!));
  const availableOwned = (collection ?? []).filter(
    (c) => !ownedInDeck.has(c.id) && (pickerSearch.trim() === "" || c.name.toLowerCase().includes(pickerSearch.toLowerCase())),
  );
  const availableWishlist = (wishlist ?? []).filter((w) => !wishlistInDeck.has(w.id));
  const totalCount = localCards.reduce((sum, c) => sum + c.count, 0);

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
              <Input value={name} onChange={(e) => setName(e.target.value)} className="text-2xl font-bold h-auto py-1" />
            ) : (
              <h1 className="text-3xl font-bold tracking-tight break-words">{deck.name}</h1>
            )}
            <p className="text-muted-foreground text-sm mt-1">
              {totalCount} card{totalCount === 1 ? "" : "s"} ({localCards.length} unique)
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
              <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Strategy</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Textarea value={strategy} onChange={(e) => setStrategy(e.target.value)} rows={4} placeholder="Describe the win condition and key plays..." />
              ) : (
                <p className="text-sm leading-relaxed">{deck.strategy}</p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-semibold">
              Cards
              <span className="ml-2 text-sm font-normal text-muted-foreground">{totalCount} / 60</span>
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 sm:hidden">Hold a card to drag and reorder</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 min-w-[140px]">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Slider min={1} max={5} step={1} value={[cardSize]} onValueChange={([v]) => setCardSize(v)} className="w-24" aria-label="Card size" />
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
                      <Input placeholder="Search your collection..." value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} className="pl-9" />
                    </div>
                    <div className="overflow-y-auto flex-1 -mx-1 px-1">
                      {availableOwned.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No more owned cards to add.</p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                          {availableOwned.map((c) => (
                            <button key={c.id} onClick={() => { handleAddOwned(c.id); setPickerOpen(false); setPickerSearch(""); }} className="text-left rounded-lg border hover:border-primary transition-colors overflow-hidden">
                              <div className="aspect-[3/4] bg-muted/30 flex items-center justify-center">
                                {c.imageUrl ? <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center"><img src="/logo.png" alt="" aria-hidden className="w-4/5 max-w-[80px] opacity-[0.12] grayscale select-none pointer-events-none" /></div>}
                              </div>
                              <p className="text-xs font-semibold p-2 truncate">{c.name}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="catalog" className="mt-3 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
                    <CatalogSearch onSelect={(c) => { handleAddCatalog(c); setPickerOpen(false); }} excludeIds={catalogInDeck} emptyHint="Find any printed card via the global catalog." autoFocus />
                  </TabsContent>

                  <TabsContent value="wishlist" className="mt-3 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
                    <div className="overflow-y-auto flex-1 -mx-1 px-1">
                      {availableWishlist.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No wishlist items left to add.{" "}<Link href="/wishlist" className="text-primary underline">Manage wishlist →</Link></p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                          {availableWishlist.map((w) => (
                            <button key={w.id} onClick={() => { handleAddWishlist(w.id, w.name); setPickerOpen(false); }} className="text-left rounded-lg border hover:border-primary transition-colors overflow-hidden">
                              <div className="aspect-[3/4] bg-muted/30 relative flex items-center justify-center">
                                {w.imageUrl ? <img src={w.imageUrl} alt={w.name} className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center"><img src="/logo.png" alt="" aria-hidden className="w-4/5 max-w-[80px] opacity-[0.12] grayscale select-none pointer-events-none" /></div>}
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

        {localCards.length === 0 ? (
          <div className="border-2 border-dashed rounded-2xl p-10 text-center bg-muted/20">
            <p className="text-muted-foreground">No cards in this deck yet.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={localCards.map((c) => c.entryId)} strategy={rectSortingStrategy}>
              <div className={`grid ${gridClass} gap-2`}>
                {localCards.map((entry, idx) => (
                  <SortableCard
                    key={entry.entryId}
                    entry={entry}
                    cardSize={cardSize}
                    isRemoving={removingId === entry.entryId}
                    onRemove={handleRemove}
                    onZoom={() => setLightboxIndex(idx)}
                  />
                ))}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeEntry && (
                <div className="w-full" style={{ width: "120px" }}>
                  <CardFace
                    entry={activeEntry}
                    cardSize={cardSize}
                    isRemoving={false}
                    onRemove={() => {}}
                    isDragging
                  />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Card lightbox */}
      {lightboxIndex !== null && (
        <CardLightbox
          cards={localCards}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={handleLightboxNavigate}
        />
      )}
    </Layout>
  );
}

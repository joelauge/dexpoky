import { useState } from "react";
import { useCardSize } from "@/hooks/useCardSize";
import { CardSizeSlider } from "@/components/card-size-slider";
import { Layout } from "@/components/layout";
import {
  useListWishlist,
  useAddWishlistItem,
  useRemoveWishlistItem,
  useUpdateWishlistItem,
  useListCategories,
  AddWishlistBodyPriority,
  type CatalogCard,
  type WishlistItem,
  type Category,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Heart,
  Plus,
  X,
  Sparkles,
  ChevronDown,
  FolderOpen,
  Folder,
  MoveRight,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { CatalogSearch } from "@/components/catalog-search";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const WISHLIST_KEY = ["/api/wishlist"] as const;
const CATEGORIES_KEY = ["/api/categories"] as const;

const PRIORITY_LABEL: Record<string, string> = {
  high: "High priority",
  normal: "Normal",
  low: "Low priority",
};

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-rose-100 text-rose-700 border-rose-200",
  normal: "bg-slate-100 text-slate-700 border-slate-200",
  low: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const CATEGORY_COLORS = [
  "bg-violet-100 text-violet-700 border-violet-200",
  "bg-blue-100 text-blue-700 border-blue-200",
  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-rose-100 text-rose-700 border-rose-200",
  "bg-sky-100 text-sky-700 border-sky-200",
  "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  "bg-orange-100 text-orange-700 border-orange-200",
];

function categoryColor(id: number) {
  return CATEGORY_COLORS[id % CATEGORY_COLORS.length];
}

const TAB_ALL = "all";
const TAB_NONE = "none";

export default function WishlistPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: items, isLoading } = useListWishlist({
    query: { queryKey: [...WISHLIST_KEY] },
  });
  const { data: categories } = useListCategories({
    query: { queryKey: [...CATEGORIES_KEY] },
  });

  const addItem = useAddWishlistItem();
  const removeItem = useRemoveWishlistItem();
  const updateItem = useUpdateWishlistItem();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingCategoryId, setPendingCategoryId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>(TAB_ALL);
  const [gotItItem, setGotItItem] = useState<WishlistItem | null>(null);
  const [gotItCategoryId, setGotItCategoryId] = useState<number | null>(null);
  const [cardSize, setCardSize, gridClass] = useCardSize();

  const wishedIds = new Set((items ?? []).map((i) => i.catalogCardId));

  const hasUncategorized = (items ?? []).some((i) => !i.categoryId);

  const tabs: { id: string; label: string; icon?: React.ReactNode }[] = [
    { id: TAB_ALL, label: "All" },
    ...(categories ?? []).map((c) => ({
      id: String(c.id),
      label: c.name,
    })),
    ...(hasUncategorized ? [{ id: TAB_NONE, label: "No category" }] : []),
  ];

  const visibleItems = (items ?? []).filter((item) => {
    if (activeTab === TAB_ALL) return true;
    if (activeTab === TAB_NONE) return !item.categoryId;
    return String(item.categoryId) === activeTab;
  });

  function openPickerForCategory(catId: number | null) {
    setPendingCategoryId(catId);
    setPickerOpen(true);
  }

  const handleAdd = (card: CatalogCard) => {
    addItem.mutate(
      {
        data: {
          catalogCardId: card.id,
          priority: "normal",
          categoryId: pendingCategoryId ?? undefined,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: WISHLIST_KEY });
          const catName =
            pendingCategoryId
              ? categories?.find((c) => c.id === pendingCategoryId)?.name
              : null;
          toast.success(
            catName
              ? `${card.name} added to "${catName}"`
              : `${card.name} added to wishlist`,
          );
        },
        onError: () => toast.error("Failed to add to wishlist"),
      },
    );
    setPickerOpen(false);
  };

  const handleRemove = (item: WishlistItem) => {
    removeItem.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: WISHLIST_KEY });
          toast.success(`Removed ${item.name}`);
        },
        onError: () => toast.error("Failed to remove"),
      },
    );
  };

  const handleSetPriority = (item: WishlistItem, priority: "low" | "normal" | "high") => {
    updateItem.mutate(
      { id: item.id, data: { priority } },
      {
        onSuccess: () => qc.invalidateQueries({ queryKey: WISHLIST_KEY }),
        onError: () => toast.error("Failed to update"),
      },
    );
  };

  const handleMoveToCategory = (item: WishlistItem, catId: number | null) => {
    updateItem.mutate(
      { id: item.id, data: { categoryId: catId ?? undefined } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: WISHLIST_KEY });
          const catName = catId ? categories?.find((c) => c.id === catId)?.name : null;
          toast.success(catName ? `Moved to "${catName}"` : "Moved to No category");
        },
        onError: () => toast.error("Failed to move"),
      },
    );
  };

  const handleGotIt = (item: WishlistItem, overrideCategoryId?: number | null) => {
    const params = new URLSearchParams({
      name: item.name,
      pokemonName: item.pokemonName,
      catalogCardId: item.catalogCardId,
    });
    if (item.setName) params.set("setName", item.setName);
    if (item.cardNumber) params.set("cardNumber", item.cardNumber);
    if (item.imageUrl) params.set("imageUrl", item.imageUrl);
    if (item.lastSeenPrice != null) params.set("estimatedValue", String(item.lastSeenPrice));
    const catId = overrideCategoryId !== undefined ? overrideCategoryId : item.categoryId;
    if (catId) params.set("categoryId", String(catId));
    navigate(`/collection/new?${params.toString()}`);
  };

  const pendingCategory =
    pendingCategoryId != null
      ? categories?.find((c) => c.id === pendingCategoryId) ?? null
      : null;

  function AddButton({ catId, label }: { catId: number | null; label?: string }) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 h-8 text-xs"
        onClick={() => openPickerForCategory(catId)}
      >
        <Plus className="h-3.5 w-3.5" />
        {label ?? "Add card"}
      </Button>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Heart className="h-7 w-7 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Looking For</h1>
            </div>
            <p className="text-muted-foreground">
              Cards you'd like to track down. Organised by category — the AI deck builder will weave these into deck ideas.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <CardSizeSlider value={cardSize} onChange={setCardSize} />
            <Button
              size="lg"
              className="gap-2"
              onClick={() => {
                const tabCatId =
                  activeTab === TAB_ALL || activeTab === TAB_NONE
                    ? null
                    : Number(activeTab);
                openPickerForCategory(tabCatId);
              }}
            >
              <Plus className="h-4 w-4" />
              Add card
            </Button>
          </div>
        </div>

        {/* Category Tabs */}
        {(categories ?? []).length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5 no-scrollbar">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const catId = tab.id !== TAB_ALL && tab.id !== TAB_NONE ? Number(tab.id) : null;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex-none flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all whitespace-nowrap",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
                  )}
                >
                  {catId != null ? (
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        isActive ? "bg-primary-foreground/70" : `${categoryColor(catId).split(" ")[0]} opacity-80`,
                      )}
                      style={{ background: isActive ? "rgba(255,255,255,0.6)" : undefined }}
                    />
                  ) : tab.id === TAB_NONE ? (
                    <Folder className="h-3.5 w-3.5" />
                  ) : (
                    <Heart className="h-3.5 w-3.5" />
                  )}
                  {tab.label}
                  {tab.id !== TAB_ALL && (
                    <span className={cn(
                      "text-[10px] font-bold ml-0.5 px-1.5 py-0.5 rounded-full",
                      isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {tab.id === TAB_NONE
                        ? (items ?? []).filter((i) => !i.categoryId).length
                        : (items ?? []).filter((i) => String(i.categoryId) === tab.id).length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className={`grid ${gridClass} gap-4`}>
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4]" />
            ))}
          </div>
        ) : (items ?? []).length === 0 ? (
          <EmptyState onAdd={() => openPickerForCategory(null)} />
        ) : visibleItems.length === 0 ? (
          <CategoryEmptyState
            category={categories?.find((c) => String(c.id) === activeTab) ?? null}
            onAdd={() => openPickerForCategory(activeTab !== TAB_ALL && activeTab !== TAB_NONE ? Number(activeTab) : null)}
          />
        ) : (
          <div className={`grid ${gridClass} gap-4`}>
            {visibleItems.map((item) => (
              <WishlistCard
                key={item.id}
                item={item}
                categories={categories ?? []}
                onRemove={handleRemove}
                onSetPriority={handleSetPriority}
                onMoveToCategory={handleMoveToCategory}
                onGotIt={(item) => { setGotItItem(item); setGotItCategoryId(item.categoryId ?? null); }}
              />
            ))}
          </div>
        )}

        {/* Add card dialog */}
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {pendingCategory ? (
                  <>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold border",
                        categoryColor(pendingCategory.id),
                      )}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      {pendingCategory.name}
                    </span>
                    <span className="text-muted-foreground font-normal text-sm">— pick a card to add</span>
                  </>
                ) : (
                  "Add a card to your wishlist"
                )}
              </DialogTitle>
              {pendingCategory && (
                <p className="text-xs text-muted-foreground pt-1">
                  This card will be saved inside your <strong>{pendingCategory.name}</strong> category.
                </p>
              )}
            </DialogHeader>

            {/* Category chooser strip */}
            {(categories ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-1 border-b">
                <button
                  type="button"
                  onClick={() => setPendingCategoryId(null)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                    pendingCategoryId == null
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50",
                  )}
                >
                  <Heart className="h-3 w-3" /> No category
                </button>
                {(categories ?? []).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setPendingCategoryId(cat.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                      pendingCategoryId === cat.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : cn("bg-background border-border hover:border-primary/50", categoryColor(cat.id)),
                    )}
                  >
                    <FolderOpen className="h-3 w-3" />
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            <CatalogSearch
              onSelect={handleAdd}
              excludeIds={wishedIds}
              emptyHint="Search the global catalog for the card you're chasing."
              autoFocus
            />
          </DialogContent>
        </Dialog>

        {/* Discreet enum reference */}
        <div className="hidden">{Object.values(AddWishlistBodyPriority).join(",")}</div>
      </div>

      {/* Got It confirmation dialog */}
      <Dialog
        open={!!gotItItem}
        onOpenChange={(open) => { if (!open) { setGotItItem(null); setGotItCategoryId(null); } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              You actually got this card?
            </DialogTitle>
            <DialogDescription>
              It'll be added to your collection. Want to put it in a category while you're here?
            </DialogDescription>
          </DialogHeader>

          {gotItItem && (
            <div className="flex items-center gap-3 bg-muted/30 rounded-xl p-3 border">
              {gotItItem.imageUrl ? (
                <img src={gotItItem.imageUrl} alt={gotItItem.name} className="w-10 h-14 object-contain rounded shrink-0" />
              ) : (
                <div className="w-10 h-14 rounded bg-muted shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{gotItItem.name}</p>
                <p className="text-xs text-muted-foreground">{gotItItem.setName ?? gotItItem.pokemonName}</p>
              </div>
            </div>
          )}

          {(categories ?? []).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" /> Add to category
                <span className="normal-case font-normal">(optional)</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setGotItCategoryId(null)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
                    gotItCategoryId === null
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted/60",
                  )}
                >
                  None
                </button>
                {(categories ?? []).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setGotItCategoryId(cat.id)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
                      gotItCategoryId === cat.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted/60",
                    )}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
              onClick={() => {
                if (gotItItem) handleGotIt(gotItItem, gotItCategoryId);
                setGotItItem(null);
                setGotItCategoryId(null);
              }}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Yes! Add to my collection
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { setGotItItem(null); setGotItCategoryId(null); }}
            >
              Not yet
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function WishlistCard({
  item,
  categories,
  onRemove,
  onSetPriority,
  onMoveToCategory,
  onGotIt,
}: {
  item: WishlistItem;
  categories: Category[];
  onRemove: (item: WishlistItem) => void;
  onSetPriority: (item: WishlistItem, priority: "low" | "normal" | "high") => void;
  onMoveToCategory: (item: WishlistItem, catId: number | null) => void;
  onGotIt: (item: WishlistItem) => void;
}) {
  const cat = item.categoryId ? categories.find((c) => c.id === item.categoryId) : null;

  return (
    <div className="group relative rounded-2xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-[3/4] bg-muted/30 relative">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <img src="/logo.png" alt="" aria-hidden className="w-4/5 max-w-[128px] opacity-[0.12] grayscale select-none pointer-events-none" />
          </div>
        )}

        {/* Remove */}
        <button
          onClick={() => onRemove(item)}
          className="absolute top-1.5 right-1.5 bg-background/90 hover:bg-destructive hover:text-destructive-foreground rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
          aria-label="Remove from wishlist"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Price */}
        {item.lastSeenPrice != null && (
          <span className="absolute bottom-1.5 right-1.5 bg-emerald-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            ${item.lastSeenPrice.toFixed(2)}
          </span>
        )}

        {/* Category badge */}
        {cat && (
          <span
            className={cn(
              "absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex items-center gap-0.5",
              categoryColor(cat.id),
            )}
          >
            <FolderOpen className="h-2.5 w-2.5" />
            {cat.name}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{item.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {item.setName || "—"}
            {item.cardNumber ? ` · #${item.cardNumber}` : ""}
          </p>
        </div>

        <div className="flex items-center justify-between gap-1.5">
          {/* Priority picker */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full border inline-flex items-center gap-0.5",
                  PRIORITY_BADGE[item.priority],
                )}
              >
                {PRIORITY_LABEL[item.priority]}
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(["high", "normal", "low"] as const).map((p) => (
                <DropdownMenuItem key={p} onClick={() => onSetPriority(item, p)}>
                  {PRIORITY_LABEL[p]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Move to category */}
          {categories.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors"
                  title="Move to category"
                >
                  <MoveRight className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">Move to category</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {categories.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() => onMoveToCategory(item, c.id)}
                    className="gap-2"
                    disabled={item.categoryId === c.id}
                  >
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full border",
                        categoryColor(c.id).split(" ")[0],
                      )}
                    />
                    {c.name}
                    {item.categoryId === c.id && (
                      <span className="ml-auto text-[10px] text-muted-foreground">current</span>
                    )}
                  </DropdownMenuItem>
                ))}
                {item.categoryId && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onMoveToCategory(item, null)} className="gap-2">
                      <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                      Remove from category
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          className="w-full h-8 text-xs gap-1.5"
          onClick={() => onGotIt(item)}
        >
          <Sparkles className="h-3 w-3" /> I got this!
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="border-2 border-dashed rounded-2xl p-12 text-center bg-muted/20">
      <Heart className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
      <h2 className="text-xl font-semibold mb-1">No wishlist items yet</h2>
      <p className="text-muted-foreground mb-5 text-sm max-w-md mx-auto">
        Track cards you don't own yet. They'll show up when building decks and the AI suggester can
        recommend swaps.
      </p>
      <Button onClick={onAdd} className="gap-2">
        <Plus className="h-4 w-4" /> Add your first card
      </Button>
    </div>
  );
}

function CategoryEmptyState({
  category,
  onAdd,
}: {
  category: Category | null;
  onAdd: () => void;
}) {
  return (
    <div className="border-2 border-dashed rounded-2xl p-12 text-center bg-muted/20">
      <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
      <h2 className="text-xl font-semibold mb-1">
        {category ? `"${category.name}" is empty` : "No uncategorized cards"}
      </h2>
      <p className="text-muted-foreground mb-5 text-sm max-w-md mx-auto">
        {category
          ? `Add cards you're looking for specifically for your ${category.name} category.`
          : "All your wishlist cards are organised into categories."}
      </p>
      {category && (
        <Button onClick={onAdd} className="gap-2">
          <Plus className="h-4 w-4" /> Add card to {category.name}
        </Button>
      )}
    </div>
  );
}

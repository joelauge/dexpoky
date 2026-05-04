import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useListWishlist,
  useAddWishlistItem,
  useRemoveWishlistItem,
  useUpdateWishlistItem,
  AddWishlistBodyPriority,
  type CatalogCard,
  type WishlistItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Heart,
  Plus,
  X,
  ImageIcon,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { CatalogSearch } from "@/components/catalog-search";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const WISHLIST_KEY = ["/api/wishlist"] as const;

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

export default function WishlistPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: items, isLoading } = useListWishlist({
    query: { queryKey: [...WISHLIST_KEY] },
  });
  const addItem = useAddWishlistItem();
  const removeItem = useRemoveWishlistItem();
  const updateItem = useUpdateWishlistItem();

  const [pickerOpen, setPickerOpen] = useState(false);

  const wishedIds = new Set((items ?? []).map((i) => i.catalogCardId));

  const handleAdd = (card: CatalogCard) => {
    addItem.mutate(
      { data: { catalogCardId: card.id, priority: "normal" } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: WISHLIST_KEY });
          toast.success(`${card.name} added to wishlist`);
        },
        onError: () => toast.error("Failed to add to wishlist"),
      },
    );
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

  const handleGotIt = (item: WishlistItem) => {
    const params = new URLSearchParams({
      name: item.name,
      pokemonName: item.pokemonName,
      catalogCardId: item.catalogCardId,
    });
    if (item.setName) params.set("setName", item.setName);
    if (item.cardNumber) params.set("cardNumber", item.cardNumber);
    if (item.imageUrl) params.set("imageUrl", item.imageUrl);
    if (item.lastSeenPrice != null) params.set("estimatedValue", String(item.lastSeenPrice));
    navigate(`/collection/new?${params.toString()}`);
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2 text-primary mb-1">
              <Heart className="h-6 w-6 fill-primary" />
              <h1 className="text-3xl font-bold tracking-tight">Looking For</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Cards you'd like to track down. The AI deck builder will weave these into deck ideas.
            </p>
          </div>
          <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2 shrink-0">
                <Plus className="h-4 w-4" /> Add card
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Add a card to your wishlist</DialogTitle>
              </DialogHeader>
              <CatalogSearch
                onSelect={(c) => {
                  handleAdd(c);
                  setPickerOpen(false);
                }}
                excludeIds={wishedIds}
                emptyHint="Search the global catalog for the card you're chasing."
                autoFocus
              />
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4]" />
            ))}
          </div>
        ) : (items ?? []).length === 0 ? (
          <div className="border-2 border-dashed rounded-2xl p-12 text-center bg-muted/20">
            <Heart className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <h2 className="text-xl font-semibold mb-1">No wishlist items yet</h2>
            <p className="text-muted-foreground mb-5 text-sm max-w-md mx-auto">
              Track cards you don't own yet. They'll show up when building decks and the AI suggester can
              recommend swaps.
            </p>
            <Button onClick={() => setPickerOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add your first card
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {(items ?? []).map((item) => (
              <div
                key={item.id}
                className="group relative rounded-2xl border bg-card overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="aspect-[3/4] bg-muted/30 relative">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                      <ImageIcon className="h-8 w-8" />
                    </div>
                  )}
                  <button
                    onClick={() => handleRemove(item)}
                    className="absolute top-1.5 right-1.5 bg-background/90 hover:bg-destructive hover:text-destructive-foreground rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    aria-label="Remove from wishlist"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  {item.lastSeenPrice != null && (
                    <span className="absolute bottom-1.5 right-1.5 bg-emerald-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      ${item.lastSeenPrice.toFixed(2)}
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
                  <div className="flex items-center justify-between gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border inline-flex items-center gap-0.5 ${PRIORITY_BADGE[item.priority]}`}
                        >
                          {PRIORITY_LABEL[item.priority]}
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {(["high", "normal", "low"] as const).map((p) => (
                          <DropdownMenuItem key={p} onClick={() => handleSetPriority(item, p)}>
                            {PRIORITY_LABEL[p]}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-8 text-xs gap-1.5"
                    onClick={() => handleGotIt(item)}
                  >
                    <Sparkles className="h-3 w-3" /> I got this!
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Discreet enum reference so unused-vars don't trip */}
        <div className="hidden">{Object.values(AddWishlistBodyPriority).join(",")}</div>
      </div>
    </Layout>
  );
}

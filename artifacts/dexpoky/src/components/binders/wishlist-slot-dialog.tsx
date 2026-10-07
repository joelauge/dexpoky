import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getListWishlistQueryKey, useAddWishlistItem, type CatalogCard, type WishlistItem,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CatalogSearch } from "@/components/catalog-search";

export function WishlistSlotDialog({ open, onOpenChange, wishlist, usedIds, onPick }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  wishlist: WishlistItem[];
  /** Wishlist item ids (positive) already holding a pocket in this binder. */
  usedIds: Set<number>;
  onPick: (item: WishlistItem) => void;
}) {
  const qc = useQueryClient();
  const add = useAddWishlistItem();
  const available = useMemo(() => wishlist.filter((w) => !usedIds.has(w.id)), [wishlist, usedIds]);

  const choose = (item: WishlistItem) => { onPick(item); onOpenChange(false); };
  const fromCatalog = (card: CatalogCard) => {
    if (add.isPending) return;
    const existing = wishlist.find((item) => item.catalogCardId === card.id);
    if (existing) {
      if (usedIds.has(existing.id)) { toast.error(`${existing.name} already has a pocket in this binder.`); return; }
      choose(existing);
      return;
    }
    add.mutate({ data: { catalogCardId: card.id } }, {
      onSuccess: (item) => {
        qc.setQueryData<WishlistItem[]>(getListWishlistQueryKey(), (old) =>
          old ? (old.some((w) => w.id === item.id) ? old : [...old, item]) : [item]);
        qc.invalidateQueries({ queryKey: getListWishlistQueryKey() });
        if (usedIds.has(item.id)) { toast.error(`${item.name} already has a pocket in this binder.`); return; }
        choose(item);
      },
      onError: () => toast.error("Could not add that card to your wishlist. Try again."),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !add.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl" data-testid="dialog-wishlist-slot">
        <DialogHeader>
          <DialogTitle>Reserve this pocket for a wishlist card</DialogTitle>
          <DialogDescription>
            It shows as a Wishlist placeholder, not an owned card. Catalog picks are added to your wishlist immediately; pocket placement takes effect when you save the layout.
          </DialogDescription>
        </DialogHeader>
        {available.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">From your wishlist</p>
            <div className="flex gap-2 overflow-x-auto pb-2" data-testid="wishlist-picker">
              {available.map((w) => (
                <button key={w.id} type="button" onClick={() => choose(w)} data-testid={`pick-wishlist-${w.id}`}
                  className="w-24 shrink-0 rounded-lg border bg-card p-1.5 text-left hover:border-primary">
                  {w.imageUrl ? <img src={w.imageUrl} alt="" className="aspect-[5/7] w-full rounded object-contain" /> : <div className="aspect-[5/7] w-full rounded bg-muted" />}
                  <span className="mt-1 block truncate text-[11px] font-medium">{w.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{add.isPending ? "Adding to wishlist" : "Search the catalog"}</p>
          <CatalogSearch onSelect={fromCatalog} pausePolling={add.isPending} emptyHint="Search any card to add it to your wishlist and this pocket." />
        </div>
      </DialogContent>
    </Dialog>
  );
}

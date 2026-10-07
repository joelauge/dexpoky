import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateCard, useListCollections, useGetPokemonSet, getListCardsQueryKey,
  getListPokemonSetsQueryKey, getGetPokemonSetQueryKey, getListCollectionsQueryKey,
  CreateCardBodyCondition, CreateCardBodyRarity,
  type CatalogCard, type Card, type PriceLookup,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { lookupCardInput, lookupRarity } from "@/lib/lookup-add-card";
import { errMessage } from "@/lib/card-lookup-utils";

export function AddLookupCard({ lookup, catalog, set, setPending, imageUrl, open, onOpenChange, onCreated }: {
  lookup: PriceLookup;
  catalog?: CatalogCard;
  set?: { id: string; name: string };
  setPending: boolean;
  imageUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (card: Card) => void;
}) {
  const qc = useQueryClient();
  const create = useCreateCard();
  const inFlight = useRef(false);
  const collections = useListCollections({ query: { enabled: open, queryKey: getListCollectionsQueryKey() } });
  const checklist = useGetPokemonSet(set?.id ?? "", {
    query: { enabled: open && !!set && !catalog?.rarity, queryKey: getGetPokemonSetQueryKey(set?.id ?? "") },
  });
  const checklistCard = checklist.data?.cards.find((c) => c.id === lookup.card.id || c.catalogIds?.includes(lookup.card.id));
  const autoRarity = lookupRarity(catalog?.rarity ?? checklistCard?.rarity);
  const [rarityOverride, setRarityOverride] = useState<CreateCardBodyRarity | null>(null);
  const rarity = rarityOverride ?? autoRarity;
  const [condition, setCondition] = useState<CreateCardBodyCondition>(lookup.condition ?? "near_mint");
  const [destination, setDestination] = useState<string | null>(null);
  const selected = destination ?? (set ? `set:${set.id}` : "all");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Card | null>(null);
  useEffect(() => {
    if (!open) return;
    setDestination(null);
    setRarityOverride(null);
    setCondition(lookup.condition ?? "near_mint");
    setError(null);
  }, [open, lookup.card.id]);
  const selectedCollection = selected.startsWith("collection:")
    ? collections.data?.find((c) => String(c.id) === selected.slice("collection:".length))
    : undefined;
  const canAdd = !setPending && !!rarity && (!selected.startsWith("collection:") || !!selectedCollection);

  const add = () => {
    if (!canAdd || !rarity || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    create.mutate({
      data: lookupCardInput({ lookup, catalog, set, imageUrl, rarity, condition, collectionId: selectedCollection?.id ?? null }),
    }, {
      onSuccess: (card) => {
        qc.setQueryData<Card[]>(getListCardsQueryKey(), (cards) => [
          ...(cards ?? []).filter((c) => c.id !== card.id), card,
        ]);
        void qc.invalidateQueries({
          predicate: (q) => typeof q.queryKey[0] === "string" &&
            ["/api/cards", "/api/collections", "/api/inventory", "/api/stats", "/api/categories"].some((prefix) => (q.queryKey[0] as string).startsWith(prefix)),
        });
        void qc.invalidateQueries({ queryKey: getListPokemonSetsQueryKey() });
        if (set) void qc.invalidateQueries({ queryKey: getGetPokemonSetQueryKey(set.id) });
        setAdded(card);
        onCreated(card);
        onOpenChange(false);
        inFlight.current = false;
        toast.success("Card added to your collection");
      },
      onError: (e) => { inFlight.current = false; setError(errMessage(e)); },
    });
  };

  return (
    <div className="mt-3 space-y-2">
      <Button className="w-full h-auto whitespace-normal py-2.5" onClick={() => onOpenChange(true)} data-testid="button-add-lookup-card">
        <Plus className="mr-2 h-4 w-4 shrink-0" />Add this card to your collection/set
      </Button>
      {added && <p className="flex items-center gap-1 text-xs text-primary" role="status"><CheckCircle2 className="h-3.5 w-3.5" />Added. <Link href={`/collection/${added.id}`} className="underline" data-testid="link-added-lookup-card">View card</Link></p>}
      <Dialog open={open} onOpenChange={(next) => { if (!inFlight.current) onOpenChange(next); }}>
        <DialogContent className="sm:max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add this card to your collection/set</DialogTitle>
            <DialogDescription>Add one owned copy of this exact printing with its set and lookup artwork. This action doesn’t save a comparison quote; normal market-value refreshes still apply.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-secondary/40 p-3">
              {imageUrl && <img src={imageUrl} alt={`${lookup.card.name} artwork`} className="h-20 w-14 shrink-0 object-contain" />}
              <div className="min-w-0"><p className="font-bold">{lookup.card.name}</p><p className="text-xs text-muted-foreground">{set?.name ?? lookup.card.setName ?? "Set not verified"}{lookup.card.cardNumber ? ` · #${lookup.card.cardNumber}` : ""}</p></div>
            </div>
            <div className="space-y-1">
              <label htmlFor="lookup-add-destination" className="text-sm font-semibold">Collection or set</label>
              <select id="lookup-add-destination" data-testid="select-lookup-add-destination" className="block w-full rounded-lg border bg-card p-2 text-sm" value={selected} onChange={(e) => setDestination(e.target.value)} disabled={create.isPending}>
                <option value="all">All cards (no custom collection)</option>
                {set && <optgroup label="Detected set"><option value={`set:${set.id}`}>{set.name} — detected automatically</option></optgroup>}
                {!!collections.data?.length && <optgroup label="Your collections">{collections.data.map((c) => <option key={c.id} value={`collection:${c.id}`}>{c.name}</option>)}</optgroup>}
              </select>
              <p className="text-xs text-muted-foreground" role="status">{setPending ? "Detecting this printing’s set…" : set ? `This card also counts toward ${set.name}, whichever collection you choose.` : "The checklist couldn’t be verified. You can still add this card to a collection with the lookup’s set name."}</p>
              {collections.isLoading && <p className="text-xs text-muted-foreground">Loading your collections…</p>}
              {collections.isError && <p className="text-xs text-destructive">Couldn’t load your collections. <button type="button" className="underline" onClick={() => collections.refetch()}>Retry</button></p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="lookup-add-condition" className="text-sm font-semibold">Card condition</label>
                <select id="lookup-add-condition" data-testid="select-lookup-add-condition" className="block w-full rounded-lg border bg-card p-2 text-sm" value={condition} disabled={create.isPending} onChange={(e) => setCondition(e.target.value as CreateCardBodyCondition)}>
                  {Object.values(CreateCardBodyCondition).map((v) => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="lookup-add-rarity" className="text-sm font-semibold">Rarity</label>
                <select id="lookup-add-rarity" data-testid="select-lookup-add-rarity" className="block w-full rounded-lg border bg-card p-2 text-sm" value={rarity ?? ""} disabled={create.isPending} onChange={(e) => setRarityOverride(e.target.value as CreateCardBodyRarity)}>
                  <option value="" disabled>{checklist.isLoading ? "Detecting…" : "Choose rarity"}</option>
                  {Object.values(CreateCardBodyRarity).map((v) => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Confirm this copy’s physical condition and rarity before adding it.</p>
            {error && <p role="alert" className="text-sm text-destructive" data-testid="text-lookup-add-error">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={create.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!canAdd || create.isPending} onClick={add} data-testid="button-confirm-add-lookup-card">
              {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { 
  useBulkCreateCards, 
  useListCollections,
  getListCollectionsQueryKey,
  type BulkCreateCardInput,
  type PokemonSetDetail
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CardImageUpload } from "@/components/card-image-upload";

function normalizeCatalogRarity(rarity?: string | null): BulkCreateCardInput["rarity"] {
  switch (rarity?.trim().toLowerCase()) {
    case "common": return "common";
    case "uncommon": return "uncommon";
    case "rare": return "rare";
    case "double rare":
    case "holo rare": return "holo_rare";
    case "ultra rare":
    case "mega attack rare":
    case "illustration rare": return "ultra_rare";
    case "special illustration rare":
    case "mega hyper rare":
    case "secret rare": return "secret_rare";
    case "promo": return "promo";
    default: return "rare";
  }
}

interface BulkAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCards: Array<{
    id: string; // catalogCardId / localId
    name: string;
    imageUrl?: string | null;
    rarity?: string | null;
    cardNumber?: string | null;
  }>;
  set: PokemonSetDetail;
  onSuccess: () => void;
}

export function BulkAddDialog({ open, onOpenChange, selectedCards, set, onSuccess }: BulkAddDialogProps) {
  const [collectionId, setCollectionId] = useState<string>("none");
  const [cardValues, setCardValues] = useState<Record<string, { value: string, photo: string | null }>>({});
  const [result, setResult] = useState<{ created: number; skipped: Array<{ cardNumber: string; reason: string }> } | null>(null);

  const queryClient = useQueryClient();
  const { data: collections } = useListCollections({
    query: { enabled: open, queryKey: getListCollectionsQueryKey() }
  });

  const bulkCreate = useBulkCreateCards();

  const handleUpdateValue = (id: string, value: string) => {
    setCardValues(prev => ({
      ...prev,
      [id]: { ...prev[id], value }
    }));
  };

  const handleUpdatePhoto = (id: string, photo: string | null) => {
    setCardValues(prev => ({
      ...prev,
      [id]: { ...prev[id], photo }
    }));
  };

  const handleSave = () => {
    const cards: BulkCreateCardInput[] = selectedCards.map(c => {
      const cv = cardValues[c.id];
      const estimatedValue = cv?.value && !isNaN(parseFloat(cv.value)) ? parseFloat(cv.value) : undefined;
      return {
        catalogCardId: c.id,
        name: c.name,
        setName: set.name,
        setId: set.id,
        cardNumber: c.cardNumber || c.id,
        rarity: normalizeCatalogRarity(c.rarity),
        imageUrl: c.imageUrl || null,
        estimatedValue,
        originalScanUrl: cv?.photo || null,
        collectionId: collectionId !== "none" ? Number(collectionId) : undefined,
        condition: "near_mint" // default
      };
    });

    bulkCreate.mutate({ data: { cards } }, {
      onSuccess: (res) => {
        if (res.skipped?.length > 0) {
          toast.warning(`Created ${res.created.length} cards, skipped ${res.skipped.length}`);
          setResult({ created: res.created.length, skipped: res.skipped });
        } else {
          toast.success(`Successfully added ${res.created.length} cards`);
          onSuccess();
          onOpenChange(false);
        }
        queryClient.invalidateQueries({ queryKey: ['/api/cards'] });
        queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey() });
      },
      onError: () => toast.error("Failed to add cards")
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && result) onSuccess();
      if (!nextOpen) setResult(null);
      onOpenChange(nextOpen);
    }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add {selectedCards.length} Cards</DialogTitle>
          <DialogDescription>
            Review and add missing cards to your collection.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 space-y-6 py-4">
          <div className="space-y-2 sticky top-0 bg-background z-10 pb-4 border-b">
            <label className="text-sm font-medium">Add to Collection (Optional)</label>
            <Select value={collectionId} onValueChange={setCollectionId}>
              <SelectTrigger>
                <SelectValue placeholder="Select collection" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Just add to library)</SelectItem>
                {collections?.map(c => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            {result && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <p className="font-semibold">
                  Added {result.created} card{result.created === 1 ? "" : "s"}. {result.skipped.length} already owned:
                </p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {result.skipped.map((item) => (
                    <li key={`${item.cardNumber}-${item.reason}`}>#{item.cardNumber}: {item.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {selectedCards.map(card => {
              const cv = cardValues[card.id] || { value: "", photo: null };
              return (
                <div key={card.id} className="flex gap-4 p-4 border rounded-xl bg-card">
                  <div className="w-16 shrink-0 aspect-[63/88] rounded-md overflow-hidden bg-muted">
                    {card.imageUrl && <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="font-semibold text-sm">{card.name} <span className="text-muted-foreground font-normal ml-1">#{card.cardNumber || card.id}</span></div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Estimated Value ($)</label>
                        <Input 
                          type="number" 
                          step="0.01" 
                          min="0"
                          placeholder="0.00"
                          value={cv.value}
                          onChange={(e) => handleUpdateValue(card.id, e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Personal Photo (Optional)</label>
                        <CardImageUpload 
                          value={cv.photo} 
                          onChange={(url) => handleUpdatePhoto(card.id, url)} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="pt-4 border-t shrink-0">
          <Button variant="outline" onClick={() => {
            if (result) onSuccess();
            setResult(null);
            onOpenChange(false);
          }} disabled={bulkCreate.isPending}>
            Cancel
          </Button>
          <Button onClick={result ? () => {
            onSuccess();
            setResult(null);
            onOpenChange(false);
          } : handleSave} disabled={bulkCreate.isPending}>
            {bulkCreate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {result ? "Done" : "Save to Collection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
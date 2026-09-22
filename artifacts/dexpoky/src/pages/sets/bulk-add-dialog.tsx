import { useEffect, useState } from "react";
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
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
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
  const [marketData, setMarketData] = useState<Record<string, { marketPrice: number | null; lowPrice: number | null; source: string | null; loading: boolean }>>({});
  const [detections, setDetections] = useState<Record<string, {
    status: "checking" | "match" | "mismatch" | "uncertain" | "error";
    message: string;
  }>>({});
  const [result, setResult] = useState<{ created: number; skipped: Array<{ cardNumber: string; reason: string }> } | null>(null);

  const queryClient = useQueryClient();
  const { data: collections } = useListCollections({
    query: { enabled: open, queryKey: getListCollectionsQueryKey() }
  });

  const bulkCreate = useBulkCreateCards();

  useEffect(() => {
    if (!open || selectedCards.length === 0) return;
    let cancelled = false;
    setMarketData(Object.fromEntries(selectedCards.map((card) => [card.id, { marketPrice: null, lowPrice: null, source: null, loading: true }])));
    void Promise.all(selectedCards.map(async (card) => {
      const params = new URLSearchParams({ cardId: card.id, name: card.name, setName: set.name });
      if (card.cardNumber) params.set("cardNumber", card.cardNumber);
      if (card.rarity) params.set("rarity", card.rarity);
      try {
        const response = await fetch(`/api/cards/pricing?${params}`);
        if (!response.ok) throw new Error("Pricing unavailable");
        const data = await response.json() as { pricing?: { marketPrice?: number | null; lowPrice?: number | null; source?: string | null } };
        if (cancelled) return;
        const pricing = {
          marketPrice: data.pricing?.marketPrice ?? null,
          lowPrice: data.pricing?.lowPrice ?? null,
          source: data.pricing?.source ?? null,
          loading: false,
        };
        setMarketData((current) => ({ ...current, [card.id]: pricing }));
        const preferred = pricing.marketPrice ?? pricing.lowPrice;
        if (preferred != null) {
          setCardValues((current) => ({
            ...current,
            [card.id]: current[card.id]?.value
              ? current[card.id]
              : { ...current[card.id], value: preferred.toFixed(2), photo: current[card.id]?.photo ?? null },
          }));
        }
      } catch {
        if (!cancelled) setMarketData((current) => ({ ...current, [card.id]: { marketPrice: null, lowPrice: null, source: null, loading: false } }));
      }
    }));
    return () => { cancelled = true; };
  }, [open, selectedCards, set.name]);

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
    if (!photo) setDetections((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const detectUploadedCard = async (card: BulkAddDialogProps["selectedCards"][number], imageData: string) => {
    setDetections((current) => ({ ...current, [card.id]: { status: "checking", message: "Checking the uploaded card…" } }));
    try {
      const response = await fetch("/api/cards/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
      });
      if (!response.ok) throw new Error("Detection failed");
      const detected = await response.json() as {
        detected: boolean;
        confidence: "high" | "medium" | "low";
        pokemonName: string | null;
        cardNumber?: string | null;
      };
      if (!detected.detected || !detected.pokemonName) {
        setDetections((current) => ({ ...current, [card.id]: { status: "uncertain", message: "Card details could not be confirmed from this photo." } }));
        return;
      }
      const normalize = (value?: string | null) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const nameMatches = normalize(detected.pokemonName) === normalize(card.name);
      const numberMatches = !detected.cardNumber || !card.cardNumber || normalize(detected.cardNumber) === normalize(card.cardNumber);
      if (!nameMatches || !numberMatches) {
        const detectedLabel = `${detected.pokemonName}${detected.cardNumber ? ` #${detected.cardNumber}` : ""}`;
        setDetections((current) => ({ ...current, [card.id]: { status: "mismatch", message: `Photo looks like ${detectedLabel}, not ${card.name}${card.cardNumber ? ` #${card.cardNumber}` : ""}.` } }));
      } else if (detected.confidence === "low") {
        setDetections((current) => ({ ...current, [card.id]: { status: "uncertain", message: "Photo appears to match, but detection confidence is low." } }));
      } else {
        setDetections((current) => ({ ...current, [card.id]: { status: "match", message: `Photo matches ${card.name}${card.cardNumber ? ` #${card.cardNumber}` : ""}.` } }));
      }
    } catch {
      setDetections((current) => ({ ...current, [card.id]: { status: "error", message: "Photo detection is temporarily unavailable. You can retry by replacing the photo." } }));
    }
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
      if (!nextOpen) {
        setResult(null);
        setCardValues({});
        setMarketData({});
        setDetections({});
      }
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
                <div key={card.id} className="flex flex-col sm:flex-row gap-4 p-4 border rounded-xl bg-card">
                  <div className="w-28 sm:w-32 mx-auto sm:mx-0 shrink-0 self-start aspect-[63/88] rounded-lg overflow-hidden bg-muted border">
                    {card.imageUrl && <img src={card.imageUrl} alt={card.name} className="w-full h-full object-contain" />}
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
                        {marketData[card.id]?.loading ? (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading exact-printing market data…</p>
                        ) : marketData[card.id]?.marketPrice != null || marketData[card.id]?.lowPrice != null ? (
                          <p className="text-[11px] text-emerald-700 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            Market {marketData[card.id].marketPrice != null ? `$${marketData[card.id].marketPrice?.toFixed(2)}` : "unavailable"}
                            {marketData[card.id].lowPrice != null ? ` · Low $${marketData[card.id].lowPrice?.toFixed(2)}` : ""}
                            {marketData[card.id].source ? ` · ${marketData[card.id].source}` : ""}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">No exact-printing market price is currently available.</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Personal Photo (Optional)</label>
                        <CardImageUpload 
                          value={cv.photo} 
                          onChange={(url) => handleUpdatePhoto(card.id, url)}
                          onFileSelected={(_file, imageData) => detectUploadedCard(card, imageData)}
                          className="[&_button]:w-full [&_button]:max-w-40 [&>div]:max-w-full"
                        />
                        {detections[card.id] && (
                          <div className={`flex items-start gap-1.5 text-[11px] ${
                            detections[card.id].status === "match" ? "text-emerald-700" :
                            detections[card.id].status === "mismatch" ? "text-destructive" : "text-amber-700"
                          }`}>
                            {detections[card.id].status === "checking" ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> :
                              detections[card.id].status === "match" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> :
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                            <span>{detections[card.id].message}</span>
                          </div>
                        )}
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
          } : handleSave} disabled={bulkCreate.isPending || selectedCards.some((card) => {
            const status = detections[card.id]?.status;
            return status === "checking" || status === "mismatch";
          })}>
            {bulkCreate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {result ? "Done" : "Save to Collection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
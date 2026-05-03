import { Layout } from "@/components/layout";
import { HoloCard } from "@/components/holo-card";
import { useGetCard, useDeleteCard, useUpdateCard, UpdateCardBodyStatus } from "@workspace/api-client-react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatLabel, CONDITION_COLORS, RARITY_COLORS } from "@/lib/constants";
import { ArrowLeft, Edit2, Trash2, Store, Tag, ImageIcon, CheckCircle2, ExternalLink } from "lucide-react";
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
import { useState } from "react";
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
          <div className="w-full lg:w-1/2 lg:max-w-md mx-auto">
            <HoloCard imageUrl={card.imageUrl} name={card.name}>
              {card.forSale && (
                <div className="absolute top-4 right-4">
                  <Badge className="bg-primary text-primary-foreground font-bold shadow-lg border-white/20 text-sm px-3 py-1">
                    Listed for {formatCurrency(card.listingPrice)}
                  </Badge>
                </div>
              )}
            </HoloCard>
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

            <div className="bg-card border shadow-sm rounded-xl p-6 mb-8">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Estimated Value</p>
              <h2 className="text-5xl font-black tracking-tighter text-foreground">
                {formatCurrency(card.estimatedValue)}
              </h2>
            </div>

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
import { useState } from "react";
import { Layout } from "@/components/layout";
import { useListCards } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CardItem } from "@/components/ui/card-item";
import { Tag, ArrowRight, CheckCircle2, ShoppingBag, Gavel } from "lucide-react";

type ListingType = "buy_now" | "auction";

function addHoursFromNow(hours: number) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString().slice(0, 16);
}

export default function Sell() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [listingType, setListingType] = useState<ListingType>("buy_now");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [startingBid, setStartingBid] = useState("");
  const [reservePrice, setReservePrice] = useState("");
  const [buyNowPrice, setBuyNowPrice] = useState("");
  const [minBidIncrement, setMinBidIncrement] = useState("1.00");
  const [auctionEndTime, setAuctionEndTime] = useState(addHoursFromNow(72));

  const { data: allCards, isLoading } = useListCards({});
  const cards = allCards?.filter(c => !c.forSale);
  const selectedCard = cards?.find(c => c.id === selectedCardId);

  const createListing = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create listing");
      return res.json();
    },
    onSuccess: (newListing) => {
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
      qc.invalidateQueries({ queryKey: ["/api/cards"] });
      toast.success("Card listed successfully!");
      setLocation(`/marketplace/${newListing.id}`);
    },
    onError: () => toast.error("Failed to list card"),
  });

  const handlePublish = () => {
    if (!selectedCardId) {
      toast.error("Please select a card");
      return;
    }
    if (listingType === "buy_now") {
      if (!price || parseFloat(price) <= 0) {
        toast.error("Please enter a valid price");
        return;
      }
      createListing.mutate({
        cardId: selectedCardId,
        price: parseFloat(price),
        description: description || undefined,
        listingType: "buy_now",
      });
    } else {
      if (!startingBid || parseFloat(startingBid) <= 0) {
        toast.error("Please enter a valid starting bid");
        return;
      }
      if (!auctionEndTime) {
        toast.error("Please set an auction end time");
        return;
      }
      createListing.mutate({
        cardId: selectedCardId,
        price: parseFloat(startingBid),
        startingBid: parseFloat(startingBid),
        reservePrice: reservePrice ? parseFloat(reservePrice) : undefined,
        buyNowPrice: buyNowPrice ? parseFloat(buyNowPrice) : undefined,
        minBidIncrement: parseFloat(minBidIncrement || "1"),
        auctionEndTime,
        description: description || undefined,
        listingType: "auction",
      });
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Sell a Card</h1>
          <p className="text-muted-foreground">List a card from your collection on the global marketplace.</p>
        </div>

        <div className="flex items-center gap-4 mb-8">
          {[1, 2].map((n) => (
            <div key={n} className="flex items-center gap-4 flex-1 last:flex-none">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${step >= n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{n}</div>
              {n < 2 && <div className={`h-1 flex-1 rounded-full ${step >= 2 ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Select a card from your collection</h2>
            {isLoading ? (
              <div className="text-center p-10 text-muted-foreground">Loading your collection...</div>
            ) : cards && cards.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {cards.map(card => (
                  <div
                    key={card.id}
                    className={`relative cursor-pointer transition-all rounded-xl border-2 ${selectedCardId === card.id ? "border-primary shadow-md scale-[1.02]" : "border-transparent hover:border-border"}`}
                    onClick={() => setSelectedCardId(card.id)}
                  >
                    {selectedCardId === card.id && (
                      <div className="absolute top-2 right-2 z-10 text-primary bg-white rounded-full">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                    )}
                    <CardItem card={card} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-12 border rounded-xl bg-muted/10">
                <p className="mb-4 text-muted-foreground">You don't have any available cards to sell.</p>
                <Button onClick={() => setLocation("/collection/new")}>Add Cards to Collection</Button>
              </div>
            )}
            <div className="flex justify-end pt-6">
              <Button size="lg" disabled={!selectedCardId} onClick={() => setStep(2)}>
                Next Step <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && selectedCard && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-xl font-bold mb-6">Listing Details</h2>

              {/* Listing Type */}
              <div className="mb-6">
                <label className="text-sm font-medium mb-2 block">Listing Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setListingType("buy_now")}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${listingType === "buy_now" ? "border-primary bg-primary/5" : "border-border hover:border-border/80"}`}
                  >
                    <ShoppingBag className={`h-6 w-6 ${listingType === "buy_now" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-medium ${listingType === "buy_now" ? "text-primary" : "text-muted-foreground"}`}>
                      Buy Now
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setListingType("auction")}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${listingType === "auction" ? "border-primary bg-primary/5" : "border-border hover:border-border/80"}`}
                  >
                    <Gavel className={`h-6 w-6 ${listingType === "auction" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-medium ${listingType === "auction" ? "text-primary" : "text-muted-foreground"}`}>
                      Auction
                    </span>
                  </button>
                </div>
              </div>

              <div className="space-y-5">
                {listingType === "buy_now" ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Selling Price ($)</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={selectedCard.estimatedValue?.toString() ?? "0.00"}
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="text-2xl py-6 font-bold"
                    />
                    {selectedCard.estimatedValue && (
                      <p className="text-xs text-muted-foreground">Estimated value: ${Number(selectedCard.estimatedValue).toFixed(2)}</p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Starting Bid ($) <span className="text-destructive">*</span></label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="1.00"
                        value={startingBid}
                        onChange={(e) => setStartingBid(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Reserve Price ($) <span className="text-muted-foreground text-xs">(Optional — minimum to sell)</span></label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="No reserve"
                        value={reservePrice}
                        onChange={(e) => setReservePrice(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Buy It Now Price ($) <span className="text-muted-foreground text-xs">(Optional)</span></label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Skip auction if buyer pays this"
                        value={buyNowPrice}
                        onChange={(e) => setBuyNowPrice(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Min Bid Increment ($)</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={minBidIncrement}
                          onChange={(e) => setMinBidIncrement(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Auction Ends</label>
                        <Input
                          type="datetime-local"
                          value={auctionEndTime}
                          onChange={(e) => setAuctionEndTime(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Description (Optional)</label>
                  <Textarea
                    placeholder="Describe the card's condition, flaws, or why you're selling..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button
                  className="flex-1 shadow-md"
                  onClick={handlePublish}
                  disabled={createListing.isPending}
                >
                  <Tag className="mr-2 w-4 h-4" />
                  {listingType === "auction" ? "Start Auction" : "Publish Listing"}
                </Button>
              </div>
            </div>

            <div className="order-first md:order-last">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Preview</h3>
              <div className="pointer-events-none opacity-90 max-w-[280px]">
                <CardItem card={selectedCard} />
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

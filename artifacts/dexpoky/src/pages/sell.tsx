import { useState, useMemo, useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";
import { Layout } from "@/components/layout";
import { useListCards } from "@workspace/api-client-react";
import { Link, useLocation, useSearch } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CardItem } from "@/components/ui/card-item";
import { ListingImageUpload } from "@/components/listing-image-upload";
import {
  Tag, ArrowRight, CheckCircle2, ShoppingBag, Gavel,
  Store, PlusCircle, ExternalLink, Check, Camera,
  Sparkles, AlertTriangle, RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type ListingType = "buy_now" | "auction";

interface CreatedListing {
  id: number;
  price: string | number;
  listingType: string;
  startingBid?: string | number | null;
}

interface ListingQualityReview {
  unavailable: boolean;
  canPublish: boolean;
  hardIssues: string[];
  suggestions: string[];
  disclaimer: string;
  dimensions: Record<"completeness" | "clarity" | "consistency" | "evidence", {
    score: number;
    confidence: number;
    label: "Strong" | "Needs attention" | "Unclear";
  }>;
}

/** Strip the full URL prefix from an originalScanUrl so ImageUploader gets just the objectPath. */
function scanUrlToObjectPath(url: string): string {
  const marker = "/api/storage";
  const idx = url.indexOf(marker);
  return idx !== -1 ? url.slice(idx + marker.length) : url;
}

function addHoursFromNow(hours: number) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString().slice(0, 16);
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {[1, 2, 3].map((n) => (
        <div key={n} className="flex items-center gap-2 flex-1 last:flex-none">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm shrink-0 transition-colors ${
              step > n
                ? "bg-primary text-primary-foreground"
                : step === n
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {step > n ? <Check className="h-4 w-4" /> : n}
          </div>
          {n < 3 && (
            <div className={`h-1 flex-1 rounded-full transition-colors ${step > n ? "bg-primary" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function Sell() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const qc = useQueryClient();

  const { preCardId, preCategoryId } = useMemo(() => {
    const p = new URLSearchParams(search);
    return {
      preCardId: p.get("card") ? parseInt(p.get("card")!) : null,
      preCategoryId: p.get("categoryId") ? parseInt(p.get("categoryId")!) : null,
    };
  }, [search]);

  const [step, setStep] = useState(() => (preCardId ? 2 : 1));
  const [selectedCardId, setSelectedCardId] = useState<number | null>(() => preCardId);
  const [listingType, setListingType] = useState<ListingType>("buy_now");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [startingBid, setStartingBid] = useState("");
  const [reservePrice, setReservePrice] = useState("");
  const [buyNowPrice, setBuyNowPrice] = useState("");
  const [minBidIncrement, setMinBidIncrement] = useState("1.00");
  const [auctionEndTime, setAuctionEndTime] = useState(addHoursFromNow(72));
  const [listingImages, setListingImages] = useState<string[]>([]);
  const [createdListing, setCreatedListing] = useState<CreatedListing | null>(null);
  const [qualityReview, setQualityReview] = useState<ListingQualityReview | null>(null);

  const { data: allCards, isLoading } = useListCards({});
  const cards = allCards?.filter(c =>
    !c.forSale && (!preCategoryId || c.categoryId === preCategoryId)
  );
  const selectedCard = allCards?.find(c => c.id === selectedCardId);

  // Seed listing images with the original scan whenever the selected card changes
  const seededCardIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!selectedCardId || selectedCardId === seededCardIdRef.current) return;
    const card = allCards?.find(c => c.id === selectedCardId);
    if (!card) return;
    seededCardIdRef.current = selectedCardId;
    setListingImages(card.originalScanUrl ? [scanUrlToObjectPath(card.originalScanUrl)] : []);
  }, [selectedCardId, allCards]);

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
      trackEvent("listing_created", { source: "marketplace" });
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
      qc.invalidateQueries({ queryKey: ["/api/cards"] });
      setCreatedListing(newListing);
      setStep(3);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to list card"),
  });

  const reviewListing = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/marketplace/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Could not review listing");
      return payload as ListingQualityReview;
    },
    onSuccess: setQualityReview,
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not review listing"),
  });

  const listingDraft = () => {
    const images = listingImages.length > 0 ? listingImages : undefined;
    return listingType === "buy_now"
      ? { cardId: selectedCardId, price: parseFloat(price), description: description || undefined, listingType, listingImages: images }
      : {
          cardId: selectedCardId, price: parseFloat(startingBid), startingBid: parseFloat(startingBid),
          reservePrice: reservePrice ? parseFloat(reservePrice) : undefined,
          buyNowPrice: buyNowPrice ? parseFloat(buyNowPrice) : undefined,
          minBidIncrement: parseFloat(minBidIncrement || "1"), auctionEndTime,
          description: description || undefined, listingType, listingImages: images,
        };
  };

  useEffect(() => {
    setQualityReview(null);
  }, [selectedCardId, listingType, price, description, startingBid, reservePrice, buyNowPrice, minBidIncrement, auctionEndTime, listingImages]);

  const handlePublish = () => {
    if (!selectedCardId) { toast.error("Please select a card"); return; }
    if (listingType === "buy_now") {
      if (!price || parseFloat(price) <= 0) { toast.error("Please enter a valid price"); return; }
    } else {
      if (!startingBid || parseFloat(startingBid) <= 0) { toast.error("Please enter a valid starting bid"); return; }
      if (!auctionEndTime) { toast.error("Please set an auction end time"); return; }
    }
    const draft = listingDraft();
    if (!qualityReview) { reviewListing.mutate(draft); return; }
    if (!qualityReview.canPublish) { toast.error("Resolve the factual conflicts before publishing"); return; }
    createListing.mutate(draft);
  };

  const resetForm = () => {
    setStep(1);
    setSelectedCardId(null);
    setListingType("buy_now");
    setPrice("");
    setDescription("");
    setStartingBid("");
    setReservePrice("");
    setBuyNowPrice("");
    setMinBidIncrement("1.00");
    setAuctionEndTime(addHoursFromNow(72));
    setListingImages([]);
    setCreatedListing(null);
    setQualityReview(null);
    seededCardIdRef.current = null;
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Tag className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Sell a Card</h1>
          </div>
          <p className="text-muted-foreground">List a card from your collection on the global marketplace.</p>
        </div>

        <StepIndicator step={step} />

        {/* ── Step 1: Pick a card ── */}
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

        {/* ── Step 2: Listing details ── */}
        {step === 2 && selectedCard && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-xl font-bold mb-6">Listing Details</h2>

              <div className="mb-6">
                <label className="text-sm font-medium mb-2 block">Listing Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setListingType("buy_now")}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${listingType === "buy_now" ? "border-primary bg-primary/5" : "border-border hover:border-border/80"}`}
                  >
                    <ShoppingBag className={`h-6 w-6 ${listingType === "buy_now" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-medium ${listingType === "buy_now" ? "text-primary" : "text-muted-foreground"}`}>Buy Now</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setListingType("auction")}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${listingType === "auction" ? "border-primary bg-primary/5" : "border-border hover:border-border/80"}`}
                  >
                    <Gavel className={`h-6 w-6 ${listingType === "auction" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-medium ${listingType === "auction" ? "text-primary" : "text-muted-foreground"}`}>Auction</span>
                  </button>
                </div>
              </div>

              <div className="space-y-5">
                {listingType === "buy_now" ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Selling Price ($)</label>
                    <Input
                      type="number" step="0.01"
                      placeholder={selectedCard.estimatedValue?.toString() ?? "0.00"}
                      value={price} onChange={e => setPrice(e.target.value)}
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
                      <Input type="number" step="0.01" placeholder="1.00" value={startingBid} onChange={e => setStartingBid(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Reserve Price ($) <span className="text-muted-foreground text-xs">(Optional — minimum to sell)</span></label>
                      <Input type="number" step="0.01" placeholder="No reserve" value={reservePrice} onChange={e => setReservePrice(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Buy It Now Price ($) <span className="text-muted-foreground text-xs">(Optional)</span></label>
                      <Input type="number" step="0.01" placeholder="Skip auction if buyer pays this" value={buyNowPrice} onChange={e => setBuyNowPrice(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Min Bid Increment ($)</label>
                        <Input type="number" step="0.01" value={minBidIncrement} onChange={e => setMinBidIncrement(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Auction Ends</label>
                        <Input type="datetime-local" value={auctionEndTime} onChange={e => setAuctionEndTime(e.target.value)} />
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Description (Optional)</label>
                  <Textarea
                    placeholder="Describe the card's condition, flaws, or why you're selling..."
                    value={description} onChange={e => setDescription(e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Camera className="h-4 w-4 text-muted-foreground" />
                    Card Photos
                    <span className="text-muted-foreground font-normal text-xs">(Optional — up to 10)</span>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Show buyers the actual card — front, back, any flaws or special finishes.
                  </p>
                  <ListingImageUpload value={listingImages} onChange={setListingImages} />
                </div>

                {qualityReview && (
                  <div className={`rounded-xl border p-4 space-y-3 ${qualityReview.canPublish ? "bg-primary/5 border-primary/20" : "bg-destructive/5 border-destructive/30"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 font-semibold text-sm">
                        {qualityReview.canPublish ? <Sparkles className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                        Listing quality review
                      </div>
                      {qualityReview.unavailable && <Badge variant="outline">AI unavailable · safe fallback</Badge>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(qualityReview.dimensions).map(([name, result]) => (
                        <div key={name} className="rounded-lg bg-background border px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{name}</p>
                          <p className="text-sm font-bold">{Math.round(result.score * 100)}% · {result.label}</p>
                          <p className="text-[10px] text-muted-foreground">{Math.round(result.confidence * 100)}% confidence</p>
                        </div>
                      ))}
                    </div>
                    {qualityReview.hardIssues.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-destructive mb-1">Must fix before publishing</p>
                        <ul className="text-xs text-destructive list-disc pl-4 space-y-1">
                          {qualityReview.hardIssues.map((issue) => <li key={issue}>{issue}</li>)}
                        </ul>
                      </div>
                    )}
                    {qualityReview.suggestions.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1">Suggested improvements</p>
                        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                          {qualityReview.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}
                        </ul>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">{qualityReview.disclaimer}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-4 mt-8">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button className="flex-1 shadow-md" onClick={handlePublish} disabled={createListing.isPending || reviewListing.isPending}>
                  {reviewListing.isPending ? <RefreshCw className="mr-2 w-4 h-4 animate-spin" /> : <Tag className="mr-2 w-4 h-4" />}
                  {reviewListing.isPending ? "Reviewing…" : createListing.isPending ? "Publishing…" :
                    !qualityReview ? "Review before publishing" :
                    qualityReview.canPublish ? (qualityReview.suggestions.length ? "Publish with advice" : listingType === "auction" ? "Start Auction" : "Publish Listing") :
                    "Recheck after fixes"}
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

        {/* ── Step 3: Listed! ── */}
        {step === 3 && createdListing && selectedCard && (
          <div className="max-w-lg mx-auto text-center space-y-8">
            <div>
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-black tracking-tight mb-1">Your card is live!</h2>
              <p className="text-muted-foreground">
                {selectedCard.name} is now listed on the marketplace and ready for buyers.
              </p>
            </div>

            {/* Card + listing summary */}
            <div className="bg-card border rounded-2xl p-5 flex items-center gap-4 text-left">
              {selectedCard.imageUrl && (
                <img
                  src={selectedCard.imageUrl}
                  alt={selectedCard.name}
                  className="w-16 h-20 object-contain rounded-lg shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground truncate">{selectedCard.name}</p>
                <p className="text-sm text-muted-foreground truncate">{selectedCard.setName}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <Badge variant="outline" className="text-xs capitalize">
                    {createdListing.listingType === "buy_now" ? "Buy Now" : "Auction"}
                  </Badge>
                  <span className="text-sm font-bold text-primary">
                    ${parseFloat(String(createdListing.listingType === "auction" ? createdListing.startingBid : createdListing.price)).toFixed(2)}
                    {createdListing.listingType === "auction" ? " starting bid" : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* Destinations */}
            <div className="space-y-3">
              <Link href={`/marketplace/${createdListing.id}`}>
                <Button size="lg" className="w-full h-13 text-base font-semibold shadow-md">
                  <Store className="mr-2 h-5 w-5" />
                  View on Marketplace
                  <ExternalLink className="ml-2 h-4 w-4 opacity-60" />
                </Button>
              </Link>
              <Link href="/marketplace">
                <Button variant="outline" size="lg" className="w-full h-12">
                  <Store className="mr-2 h-4 w-4" />
                  Browse All Listings
                </Button>
              </Link>
              <Button variant="ghost" size="lg" className="w-full h-12 text-muted-foreground" onClick={resetForm}>
                <PlusCircle className="mr-2 h-4 w-4" />
                List Another Card
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

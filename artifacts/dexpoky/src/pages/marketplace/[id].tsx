import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useGetListing, useUpdateListing, UpdateListingBodyStatus } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { HoloCard } from "@/components/holo-card";
import { formatCurrency, formatLabel, CONDITION_COLORS, RARITY_COLORS } from "@/lib/constants";
import { ArrowLeft, ShoppingCart, Info, Eye, Clock, Gavel, User, Star, Timer, Share2, Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, isPast, intervalToDuration } from "date-fns";

type AuctionListing = {
  listingType?: string;
  sellerClerkId?: string | null;
  currentBid?: number | null;
  currentBidderClerkId?: string | null;
  auctionEndTime?: string | null;
  reservePrice?: number | null;
  startingBid?: number | null;
  minBidIncrement?: number | null;
  buyNowPrice?: number | null;
};

interface Bid {
  id: number;
  bidderClerkId: string;
  amount: number;
  createdAt: string;
}

interface Rating {
  id: number;
  score: number;
  comment: string | null;
  type: string;
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(s => (
        <button key={s} type="button" onClick={() => onChange(s)} className="focus:outline-none">
          <Star className={`h-7 w-7 transition-colors ${s <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40 hover:text-amber-300"}`} />
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} className={`h-4 w-4 ${s <= score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

function AuctionCountdown({ endTime }: { endTime: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const end = new Date(endTime);
  if (isPast(end)) return <span className="text-destructive font-bold">Ended</span>;

  const dur = intervalToDuration({ start: new Date(), end });
  const days = dur.days ?? 0;
  const hours = dur.hours ?? 0;
  const minutes = dur.minutes ?? 0;
  const seconds = dur.seconds ?? 0;
  const endingSoon = days === 0 && hours === 0 && minutes < 10;

  const blocks = days > 0
    ? [{ val: days, label: "d" }, { val: hours, label: "h" }, { val: minutes, label: "m" }]
    : [{ val: hours, label: "h" }, { val: minutes, label: "m" }, { val: seconds, label: "s" }];

  return (
    <div className={`flex items-center gap-1.5 ${endingSoon ? "animate-pulse" : ""}`}>
      {blocks.map((b, i) => (
        <span key={b.label} className={`font-mono font-black text-lg tabular-nums ${endingSoon ? "text-red-500" : "text-primary"}`}>
          {i > 0 && <span className="opacity-50 mr-1">:</span>}
          {String(b.val).padStart(2, "0")}<span className="text-xs font-semibold ml-0.5 opacity-60">{b.label}</span>
        </span>
      ))}
    </div>
  );
}

function AuctionCountdownLarge({ endTime }: { endTime: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const end = new Date(endTime);
  if (isPast(end)) {
    return (
      <div className="text-center py-3">
        <span className="text-destructive font-black text-xl">Auction Ended</span>
      </div>
    );
  }

  const dur = intervalToDuration({ start: new Date(), end });
  const days = dur.days ?? 0;
  const hours = dur.hours ?? 0;
  const minutes = dur.minutes ?? 0;
  const seconds = dur.seconds ?? 0;
  const endingSoon = days === 0 && hours === 0 && minutes < 10;

  const blocks = days > 0
    ? [{ val: days, label: "days" }, { val: hours, label: "hrs" }, { val: minutes, label: "min" }]
    : [{ val: hours, label: "hrs" }, { val: minutes, label: "min" }, { val: seconds, label: "sec" }];

  return (
    <div className={`flex items-center justify-center gap-2 ${endingSoon ? "animate-pulse" : ""}`}>
      {blocks.map((b, i) => (
        <div key={b.label} className="flex items-center gap-2">
          <div className={`flex flex-col items-center px-3 py-2 rounded-xl border ${endingSoon ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800/30" : "bg-muted/40 border-border"}`}>
            <span className={`font-black text-3xl tabular-nums leading-none ${endingSoon ? "text-red-500" : "text-foreground"}`}>
              {String(b.val).padStart(2, "0")}
            </span>
            <span className="text-muted-foreground text-[9px] uppercase tracking-widest mt-0.5 font-bold">{b.label}</span>
          </div>
          {i < blocks.length - 1 && (
            <span className={`font-black text-xl mb-3 ${endingSoon ? "text-red-400" : "text-muted-foreground/40"}`}>:</span>
          )}
        </div>
      ))}
    </div>
  );
}

function ShareButton({ listingId, cardName }: { listingId: number; cardName: string }) {
  const { user } = useUser();
  const [state, setState] = useState<"idle" | "loading" | "copied">("idle");
  const [shortUrl, setShortUrl] = useState<string | null>(null);

  const handleShare = async () => {
    if (shortUrl) {
      await navigator.clipboard.writeText(shortUrl);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
      return;
    }
    setState("loading");
    const origin = window.location.origin;
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const targetUrl = `${origin}${base}/view/listing/${listingId}`;
    try {
      const res = await fetch("/api/s", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl, clerkId: user?.id }),
      });
      const data = await res.json() as { shortUrl?: string };
      if (data.shortUrl) {
        setShortUrl(data.shortUrl);
        await navigator.clipboard.writeText(data.shortUrl);
        setState("copied");
        toast.success("Share link copied!");
        setTimeout(() => setState("idle"), 2500);
      }
    } catch {
      toast.error("Failed to generate share link");
      setState("idle");
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleShare} disabled={state === "loading"} className="gap-1.5">
      {state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : state === "copied" ? <Check className="h-3.5 w-3.5 text-emerald-500" />
        : <Share2 className="h-3.5 w-3.5" />}
      {state === "copied" ? "Copied!" : "Share"}
    </Button>
  );
}

export default function ListingDetail() {
  const [, params] = useRoute("/marketplace/:id");
  const id = params?.id ? parseInt(params.id) : 0;
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const qc = useQueryClient();

  const { data: listing, isLoading, refetch } = useGetListing(id, {
    query: { enabled: !!id, queryKey: ["/api/marketplace", id], refetchInterval: 8000 },
  });

  const extListing = listing as (typeof listing & AuctionListing) | undefined;
  const isAuction = extListing?.listingType === "auction";
  const auctionEnded = isAuction && extListing?.auctionEndTime && isPast(new Date(extListing.auctionEndTime));

  const { data: bids, refetch: refetchBids } = useQuery<Bid[]>({
    queryKey: ["/api/marketplace/bids", id],
    queryFn: () => fetch(`/api/marketplace/${id}/bids`).then(r => r.json()),
    enabled: !!id && isAuction,
    refetchInterval: isAuction && !auctionEnded ? 8000 : false,
  });

  const { data: myRatings } = useQuery<Rating[]>({
    queryKey: ["/api/ratings/mine", id],
    queryFn: () => fetch(`/api/ratings/user/${user!.id}`).then(r => r.json()),
    enabled: !!user && extListing?.status === "sold",
  });

  const updateListing = useUpdateListing();
  const [bidAmount, setBidAmount] = useState("");
  const [maxBidAmount, setMaxBidAmount] = useState("");
  const [showProxyBid, setShowProxyBid] = useState(false);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState("");

  const placeBid = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/marketplace/${id}/bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bid failed");
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.extended ? "Bid placed! Auction extended by 5 minutes." : "Bid placed successfully!");
      setBidAmount("");
      setMaxBidAmount("");
      refetch();
      refetchBids();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const submitRating = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit rating");
      return data;
    },
    onSuccess: () => {
      toast.success("Rating submitted!");
      setRatingScore(0);
      setRatingComment("");
      qc.invalidateQueries({ queryKey: ["/api/ratings/mine", id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleBuy = () => {
    if (!listing) return;
    updateListing.mutate(
      { id, data: { status: UpdateListingBodyStatus.sold } },
      {
        onSuccess: () => {
          toast.success(`You purchased ${listing.card.name}!`);
          setLocation("/marketplace");
        },
        onError: () => toast.error("Failed to complete purchase"),
      }
    );
  };

  const handleBid = () => {
    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid bid amount"); return; }
    const body: Record<string, unknown> = { amount };
    if (showProxyBid && maxBidAmount) {
      const maxAmt = parseFloat(maxBidAmount);
      if (!isNaN(maxAmt) && maxAmt >= amount) body.maxAmount = maxAmt;
    }
    placeBid.mutate(body);
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
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!listing) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold">Listing not found</h2>
          <Button className="mt-4" onClick={() => setLocation("/marketplace")}>Back to Marketplace</Button>
        </div>
      </Layout>
    );
  }

  const { card } = listing;
  const isSold = listing.status === "sold";
  const isActive = listing.status === "active";
  const isMyListing = user?.id && extListing?.sellerClerkId === user.id;
  const currentBid = extListing?.currentBid;
  const startingBid = extListing?.startingBid;
  const minIncrement = extListing?.minBidIncrement ?? 1;
  const minBid = currentBid ? currentBid + minIncrement : (startingBid ?? 0);
  const reserveMet = !extListing?.reservePrice || (currentBid && currentBid >= extListing.reservePrice);
  const alreadyRatedAsSeller = myRatings?.some(r => r.type === "buyer_to_seller");
  const endingSoon = isAuction && extListing?.auctionEndTime && !auctionEnded &&
    intervalToDuration({ start: new Date(), end: new Date(extListing.auctionEndTime) }).days === 0 &&
    (intervalToDuration({ start: new Date(), end: new Date(extListing.auctionEndTime) }).hours ?? 0) === 0 &&
    (intervalToDuration({ start: new Date(), end: new Date(extListing.auctionEndTime) }).minutes ?? 60) < 10;

  return (
    <Layout>
      <div className="bg-background min-h-screen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20">
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" onClick={() => setLocation("/marketplace")} className="-ml-4 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Marketplace
            </Button>
            <ShareButton listingId={id} cardName={card.name} />
          </div>

          <div className="flex flex-col lg:flex-row gap-12">
            {/* Card Image — 3D holo effect */}
            <div className="w-full lg:w-1/2 lg:max-w-sm mx-auto">
              <div className="relative">
                {isAuction && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <Badge className={`font-bold shadow-lg text-sm px-3 py-1 flex items-center gap-1 ${endingSoon ? "bg-red-500 text-white animate-pulse" : "bg-amber-500 text-white"}`}>
                      <Gavel className="h-3 w-3" />
                      {auctionEnded ? "AUCTION ENDED" : endingSoon ? "ENDING SOON" : "LIVE AUCTION"}
                    </Badge>
                  </div>
                )}
                {isSold && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <Badge className="bg-destructive text-white font-bold shadow-lg text-sm px-3 py-1">SOLD</Badge>
                  </div>
                )}
                <HoloCard imageUrl={card.imageUrl} name={card.name} />
              </div>

              {/* Auction countdown under card on mobile — large blocks */}
              {isAuction && extListing?.auctionEndTime && isActive && (
                <div className={`mt-6 rounded-2xl border p-4 ${endingSoon ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800/40" : "bg-muted/30 border-border"}`}>
                  <p className={`text-xs font-bold uppercase tracking-widest text-center mb-3 flex items-center justify-center gap-1.5 ${endingSoon ? "text-red-500" : "text-muted-foreground"}`}>
                    <Timer className="h-3.5 w-3.5" />
                    {auctionEnded ? "Auction ended" : "Time remaining"}
                  </p>
                  <AuctionCountdownLarge endTime={extListing.auctionEndTime} />
                </div>
              )}
            </div>

            {/* Details */}
            <div className="w-full lg:w-1/2 flex flex-col">
              <div className="mb-4">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <Badge variant="outline" className="text-xs text-muted-foreground bg-background">
                    <Clock className="w-3 h-3 mr-1" />
                    Listed {formatDistanceToNow(new Date(listing.createdAt))} ago
                  </Badge>
                  <Badge variant="outline" className="text-xs text-muted-foreground bg-background">
                    <Eye className="w-3 h-3 mr-1" />
                    {listing.viewCount} views
                  </Badge>
                  {extListing?.sellerClerkId && (
                    <Link href={`/seller/${extListing.sellerClerkId}`}>
                      <Badge variant="outline" className="text-xs cursor-pointer hover:bg-secondary transition-colors">
                        <User className="w-3 h-3 mr-1" /> View Seller
                      </Badge>
                    </Link>
                  )}
                </div>
                <h1 className="text-3xl font-black tracking-tight text-foreground mb-1">{card.name}</h1>
                <p className="text-lg text-muted-foreground font-medium">
                  {card.pokemonName} {card.setName ? `• ${card.setName}` : ""}
                  {card.cardNumber && <span className="ml-2 text-sm bg-secondary px-2 py-1 rounded">{card.cardNumber}</span>}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                <Badge className={`text-sm px-3 py-1 border-0 shadow-sm ${RARITY_COLORS[card.rarity] || ""}`}>{formatLabel(card.rarity)}</Badge>
                <Badge variant="outline" className={`text-sm px-3 py-1 ${CONDITION_COLORS[card.condition] || ""}`}>{formatLabel(card.condition)} Condition</Badge>
              </div>

              {/* Price / Bid Panel */}
              {isAuction ? (
                <div className={`bg-card border shadow-md rounded-2xl p-6 mb-6 space-y-4 transition-colors ${endingSoon ? "border-red-300 dark:border-red-800/50 shadow-red-100 dark:shadow-red-950/20" : "border-amber-200"}`}>
                  {extListing?.auctionEndTime && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Timer className={`h-4 w-4 ${endingSoon ? "text-red-500" : ""}`} />
                      {auctionEnded ? "Auction ended" : (
                        <span className="flex items-center gap-2">
                          Ends in <AuctionCountdown endTime={extListing.auctionEndTime} />
                        </span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                        {currentBid ? "Current Bid" : "Starting Bid"}
                      </p>
                      <p className="text-3xl font-black text-foreground">{formatCurrency(currentBid ?? startingBid ?? 0)}</p>
                      {bids && bids.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">{bids.length} bid{bids.length !== 1 ? "s" : ""}</p>
                      )}
                    </div>
                    {extListing?.reservePrice && (
                      <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Reserve</p>
                        <p className="text-sm font-medium mt-1">
                          {reserveMet
                            ? <span className="text-green-600 font-bold">Met ✓</span>
                            : <span className="text-amber-600 font-bold">Not met</span>}
                        </p>
                      </div>
                    )}
                  </div>

                  {extListing?.buyNowPrice && isActive && !auctionEnded && !isMyListing && (
                    <div className="border-t pt-4">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Buy It Now</p>
                      <div className="flex items-center justify-between">
                        <p className="text-2xl font-black">{formatCurrency(extListing.buyNowPrice)}</p>
                        <Button onClick={handleBuy} disabled={updateListing.isPending} className="font-bold">
                          <ShoppingCart className="w-4 h-4 mr-2" /> Buy Now
                        </Button>
                      </div>
                    </div>
                  )}

                  {isActive && !auctionEnded && !isMyListing && user && (
                    <div className="border-t pt-4 space-y-3">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Place Bid — min {formatCurrency(minBid)}
                      </p>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder={minBid.toFixed(2)}
                          value={bidAmount}
                          onChange={e => setBidAmount(e.target.value)}
                          className="text-lg font-bold"
                        />
                        <Button onClick={handleBid} disabled={placeBid.isPending} className="shrink-0 bg-amber-500 hover:bg-amber-400 text-white">
                          <Gavel className="w-4 h-4 mr-1" /> Bid
                        </Button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowProxyBid(p => !p)}
                        className="text-xs text-primary underline underline-offset-2"
                      >
                        {showProxyBid ? "Hide auto-bid" : "Set max auto-bid (proxy bidding)"}
                      </button>
                      {showProxyBid && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Set your maximum — we'll automatically bid on your behalf up to this amount.</p>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Maximum bid amount"
                            value={maxBidAmount}
                            onChange={e => setMaxBidAmount(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {!user && isActive && !auctionEnded && (
                    <div className="border-t pt-4 text-center">
                      <p className="text-sm text-muted-foreground mb-2">Sign in to place a bid</p>
                      <Link href="/sign-in">
                        <Button variant="outline" size="sm">Sign In</Button>
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-card border shadow-md rounded-2xl p-8 mb-6 border-primary/20">
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-primary uppercase tracking-wider mb-1">Buy it now</p>
                      <h2 className="text-5xl font-black tracking-tighter text-foreground">{formatCurrency(listing.price)}</h2>
                    </div>
                    {!isMyListing && (
                      user ? (
                        <Button
                          size="lg"
                          className="h-14 px-8 text-lg font-bold shadow-lg"
                          disabled={!isActive || updateListing.isPending}
                          onClick={handleBuy}
                        >
                          <ShoppingCart className="w-5 h-5 mr-2" />
                          {isActive ? "Purchase Card" : "Unavailable"}
                        </Button>
                      ) : (
                        <Link href="/sign-in">
                          <Button size="lg" className="h-14 px-8 text-lg font-bold">Sign In to Buy</Button>
                        </Link>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Bid History */}
              {isAuction && bids && bids.length > 0 && (
                <div className="bg-muted/20 rounded-xl border p-4 mb-6">
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <Gavel className="h-3.5 w-3.5 text-amber-500" />
                    Bid History
                    <span className="text-muted-foreground font-normal">({bids.length})</span>
                  </h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {bids.map((bid, i) => (
                      <div key={bid.id} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {i === 0 ? "👑 " : ""}Bidder ···{bid.bidderClerkId.slice(-4)}
                        </span>
                        <span className={`font-bold ${i === 0 ? "text-amber-600" : ""}`}>{formatCurrency(bid.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description / Card Info */}
              <div className="space-y-4 flex-1">
                {listing.description && (
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-primary" /> Seller's Description
                    </h3>
                    <div className="bg-muted/30 p-4 rounded-xl border text-sm leading-relaxed">{listing.description}</div>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-bold mb-2 border-b pb-2">Card Information</h3>
                  <div className="grid grid-cols-2 gap-y-3 text-sm bg-muted/10 p-4 rounded-xl border">
                    <div className="text-muted-foreground font-medium">Estimated Value</div>
                    <div className="font-bold text-right">{formatCurrency(card.estimatedValue)}</div>
                    <div className="text-muted-foreground font-medium">Rarity</div>
                    <div className="font-medium text-right">{formatLabel(card.rarity)}</div>
                    <div className="text-muted-foreground font-medium">Condition</div>
                    <div className="font-medium text-right">{formatLabel(card.condition)}</div>
                  </div>
                </div>
              </div>

              {/* Rating form */}
              {isSold && user && extListing?.sellerClerkId && extListing.sellerClerkId !== user.id && !alreadyRatedAsSeller && (
                <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-500" /> Rate this seller
                  </h3>
                  <StarPicker value={ratingScore} onChange={setRatingScore} />
                  <Textarea
                    className="mt-3 text-sm"
                    placeholder="Optional comment..."
                    value={ratingComment}
                    onChange={e => setRatingComment(e.target.value)}
                  />
                  <Button
                    className="mt-3"
                    disabled={ratingScore === 0 || submitRating.isPending}
                    onClick={() => submitRating.mutate({
                      ratedClerkId: extListing.sellerClerkId!,
                      listingId: id,
                      score: ratingScore,
                      comment: ratingComment || undefined,
                      type: "buyer_to_seller",
                    })}
                  >
                    Submit Rating
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

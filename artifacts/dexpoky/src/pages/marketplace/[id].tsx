import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { useGetListing } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthFetch } from "@/lib/use-auth-fetch";
import { HoloCard } from "@/components/holo-card";
import { cn } from "@/lib/utils";
import { formatCurrency, formatLabel, CONDITION_COLORS, RARITY_COLORS } from "@/lib/constants";
import { ArrowLeft, ShoppingCart, Info, Eye, Clock, Gavel, User, Star, Timer, Share2, Check, Copy, Loader2, Camera, ChevronLeft, ChevronRight, X, ZoomIn, MessageCircle, Pencil, Lock, AlertTriangle, Video, Upload, ImagePlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { formatDistanceToNow, isPast, intervalToDuration } from "date-fns";
import { ListingImageUpload } from "@/components/listing-image-upload";

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
  listingImages?: string[] | null;
  listingVideo?: string | null;
  bidCount?: number;
  updatedAt?: string | null;
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

interface RatingsResponse {
  ratings: Rating[];
  ratingCount: number;
  ratingAverage: number | null;
  subConditionAvg: number | null;
  subCommunicationAvg: number | null;
  subShippingAvg: number | null;
  subValueAvg: number | null;
}

function mediaUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http") || path.startsWith("/api/")) return path;
  return `/api/storage${path}`;
}

function SellerPhotoGallery({ images }: { images: string[] }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);

  if (!images.length) return null;

  const prev = () => setActiveIdx((i) => (i - 1 + images.length) % images.length);
  const next = () => setActiveIdx((i) => (i + 1) % images.length);

  return (
    <div className="mt-6 space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <Camera className="h-3.5 w-3.5" /> Seller Photos ({images.length})
      </p>

      {/* Main large image */}
      <div
        className="relative rounded-2xl overflow-hidden border bg-muted/10 aspect-square cursor-zoom-in group"
        onClick={() => setLightbox(activeIdx)}
      >
        <img
          src={mediaUrl(images[activeIdx])}
          alt={`Seller photo ${activeIdx + 1}`}
          className="w-full h-full object-contain"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
          <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-70 transition-opacity drop-shadow-lg" />
        </div>
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
              aria-label="Next photo"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {activeIdx + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={cn(
                "flex-none w-14 h-14 rounded-xl overflow-hidden border-2 transition-all",
                i === activeIdx ? "border-primary ring-2 ring-primary/20 scale-105" : "border-border opacity-60 hover:opacity-100"
              )}
            >
              <img src={mediaUrl(url)} alt={`Thumbnail ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/40 rounded-full p-2"
            onClick={() => setLightbox(null)}
          >
            <X className="h-6 w-6" />
          </button>
          {images.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 rounded-full p-2"
                onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + images.length) % images.length); }}
              >
                <ChevronLeft className="h-7 w-7" />
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 rounded-full p-2"
                onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % images.length); }}
              >
                <ChevronRight className="h-7 w-7" />
              </button>
            </>
          )}
          <img
            src={mediaUrl(images[lightbox])}
            alt={`Seller photo ${lightbox + 1}`}
            className="max-h-[88vh] max-w-[88vw] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {images.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setLightbox(i); }}
                  className={cn("w-2 h-2 rounded-full transition-all", i === lightbox ? "bg-white scale-125" : "bg-white/40 hover:bg-white/70")}
                />
              ))}
            </div>
          )}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm font-medium">
            {lightbox + 1} / {images.length}
          </div>
        </div>
      )}
    </div>
  );
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
  const authFetch = useAuthFetch();

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

  const { data: myRatingsData } = useQuery<RatingsResponse>({
    queryKey: ["/api/ratings/mine", id],
    queryFn: () => fetch(`/api/ratings/user/${user!.id}`).then(r => r.json()),
    enabled: !!user && extListing?.status === "sold",
  });

  const [bidAmount, setBidAmount] = useState("");
  const [maxBidAmount, setMaxBidAmount] = useState("");
  const [showProxyBid, setShowProxyBid] = useState(false);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubScores, setRatingSubScores] = useState({ condition: 0, communication: 0, shipping: 0, value: 0 });
  const [openingThread, setOpeningThread] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editPrice, setEditPrice] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStartingBid, setEditStartingBid] = useState("");
  const [editReservePrice, setEditReservePrice] = useState("");
  const [editBuyNowPrice, setEditBuyNowPrice] = useState("");
  const [editImages, setEditImages] = useState<string[]>([]);
  const [editVideo, setEditVideo] = useState<string>("");
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [pendingEditBody, setPendingEditBody] = useState<Record<string, unknown> | null>(null);

  const handleOpenEdit = () => {
    setEditPrice(listing ? String(listing.price) : "");
    setEditDescription(listing?.description ?? "");
    setEditStartingBid(extListing?.startingBid ? String(extListing.startingBid) : "");
    setEditReservePrice(extListing?.reservePrice ? String(extListing.reservePrice) : "");
    setEditBuyNowPrice(extListing?.buyNowPrice ? String(extListing.buyNowPrice) : "");
    setEditImages(extListing?.listingImages ? extListing.listingImages.map(mediaUrl) : []);
    setEditVideo(extListing?.listingVideo ?? "");
    setVideoError(null);
    setEditOpen(true);
  };

  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { setVideoError("Please select a video file (MP4, WebM, MOV)."); return; }
    if (file.size > 200 * 1024 * 1024) { setVideoError("Video must be smaller than 200 MB."); return; }
    setVideoError(null);
    setVideoUploading(true);
    setVideoProgress(0);
    try {
      const metaRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!metaRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await metaRes.json() as { uploadURL: string; objectPath: string };
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadURL);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setVideoProgress(Math.round((ev.loaded / ev.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(file);
      });
      setEditVideo(`/api/storage${objectPath}`);
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setVideoUploading(false);
      setVideoProgress(0);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  const updateListing = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await authFetch(`/api/marketplace/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { error?: string; bidCount?: number };
      if (!res.ok) throw new Error(data.error ?? "Failed to update listing");
      return data;
    },
    onSuccess: () => {
      toast.success("Listing updated!");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/marketplace", id] });
      refetch();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelListing = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/marketplace/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel listing");
      return data;
    },
    onSuccess: () => {
      toast.success("Listing cancelled.");
      setShowCancelConfirm(false);
      qc.invalidateQueries({ queryKey: ["/api/marketplace", id] });
      refetch();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSaveEdit = () => {
    const body: Record<string, unknown> = {};
    const bidCount = extListing?.bidCount ?? 0;

    body.description = editDescription || null;

    if (isAuction) {
      const origStart = extListing?.startingBid ?? null;
      const newStart = editStartingBid !== "" ? parseFloat(editStartingBid) : null;
      if (newStart !== null && newStart !== origStart) body.startingBid = newStart;

      const origReserve = extListing?.reservePrice ?? null;
      const newReserve = editReservePrice !== "" ? parseFloat(editReservePrice) : null;
      if (newReserve !== origReserve) body.reservePrice = newReserve;

      const origBuyNow = extListing?.buyNowPrice ?? null;
      const newBuyNow = editBuyNowPrice !== "" ? parseFloat(editBuyNowPrice) : null;
      if (newBuyNow !== origBuyNow) body.buyNowPrice = newBuyNow;
    } else {
      const newPrice = editPrice !== "" ? parseFloat(editPrice) : null;
      if (newPrice !== null) body.price = newPrice;
    }

    const origImages = extListing?.listingImages ?? [];
    if (JSON.stringify(editImages) !== JSON.stringify(origImages)) {
      body.listingImages = editImages;
    }

    const origVideo = extListing?.listingVideo ?? "";
    if (editVideo !== origVideo) {
      body.listingVideo = editVideo || null;
    }

    const hasPricingChange = isAuction && (
      body.startingBid !== undefined ||
      body.reservePrice !== undefined ||
      body.buyNowPrice !== undefined
    );
    if (hasPricingChange && bidCount > 0) {
      setPendingEditBody(body);
      setShowPriceModal(true);
      return;
    }
    updateListing.mutate(body);
  };

  const handleConfirmedSave = () => {
    if (pendingEditBody) {
      updateListing.mutate(pendingEditBody);
      setPendingEditBody(null);
      setShowPriceModal(false);
    }
  };

  const handleCounterOffer = async () => {
    if (!user) { setLocation("/sign-in"); return; }
    setOpeningThread(true);
    try {
      const res = await authFetch(`/api/marketplace/${id}/thread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json() as { threadId?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to open thread");
      setLocation(`/inbox?thread=${data.threadId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open thread");
    } finally {
      setOpeningThread(false);
    }
  };

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

  const checkout = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/marketplace/${id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout failed");
      return data as { url: string };
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleBuy = () => {
    if (!user) {
      setLocation("/sign-in");
      return;
    }
    checkout.mutate();
  };

  // Confirm purchase after Stripe Checkout redirect
  useEffect(() => {
    const url = new URL(window.location.href);
    const purchase = url.searchParams.get("purchase");
    const sessionId = url.searchParams.get("session_id");
    if (purchase === "cancelled") {
      toast.info("Purchase cancelled");
      url.searchParams.delete("purchase");
      window.history.replaceState({}, "", url.pathname + url.search);
      return;
    }
    if (purchase === "success" && sessionId && id) {
      (async () => {
        try {
          const res = await fetch(`/api/marketplace/${id}/confirm-purchase`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Could not confirm purchase");
          toast.success("Purchase confirmed! The card is yours.");
          refetch();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Confirmation failed");
        } finally {
          url.searchParams.delete("purchase");
          url.searchParams.delete("session_id");
          window.history.replaceState({}, "", url.pathname + url.search);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
  const alreadyRatedAsSeller = myRatingsData?.ratings?.some(r => r.type === "buyer_to_seller");
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

              {/* Seller-uploaded photos */}
              <SellerPhotoGallery images={extListing?.listingImages ?? []} />

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
                        <Button onClick={handleBuy} disabled={checkout.isPending} className="font-bold">
                          {checkout.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                          {checkout.isPending ? "Redirecting…" : "Buy Now"}
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
                        <div className="flex gap-2 items-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCounterOffer}
                            disabled={!isActive || openingThread}
                          >
                            {openingThread
                              ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                              : <MessageCircle className="w-4 h-4 mr-1.5" />}
                            {openingThread ? "Opening…" : "Counter Offer"}
                          </Button>
                          <Button
                            size="sm"
                            className="font-semibold shadow"
                            disabled={!isActive || checkout.isPending}
                            onClick={handleBuy}
                          >
                            {checkout.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-1.5" />}
                            {checkout.isPending ? "Redirecting…" : isActive ? "Purchase Card" : "Unavailable"}
                          </Button>
                        </div>
                      ) : (
                        <Link href="/sign-in">
                          <Button size="sm">Sign In to Buy</Button>
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

              {/* Seller edit panel */}
              {isMyListing && isActive && (() => {
                const bidCount = extListing?.bidCount ?? 0;
                const pricingLocked = isAuction && bidCount > 0;
                return (
                  <div className="mt-6 border rounded-2xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => { if (!editOpen) handleOpenEdit(); else setEditOpen(false); }}
                      className="w-full flex items-center justify-between px-5 py-3.5 bg-secondary/60 hover:bg-secondary transition-colors text-sm font-semibold"
                    >
                      <span className="flex items-center gap-2">
                        <Pencil className="h-3.5 w-3.5" />
                        Edit this listing
                      </span>
                      <span className="flex items-center gap-3 text-xs text-muted-foreground font-normal">
                        {isAuction && <span className="flex items-center gap-1"><Gavel className="h-3 w-3" />{bidCount} bid{bidCount !== 1 ? "s" : ""}</span>}
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{listing.viewCount} view{listing.viewCount !== 1 ? "s" : ""}</span>
                        <span className={cn("transition-transform", editOpen ? "rotate-180" : "")}>▾</span>
                      </span>
                    </button>

                    {editOpen && (
                      <div className="p-5 space-y-5 border-t bg-background">
                        {pricingLocked && (
                          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/30 text-sm">
                            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                            <div>
                              <p className="font-semibold text-amber-800 dark:text-amber-300">{bidCount} active bid{bidCount !== 1 ? "s" : ""} — pricing changes need confirmation</p>
                              <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5">You can still edit pricing, but we'll ask you to confirm before saving to protect active bidders. Description edits save freely.</p>
                            </div>
                          </div>
                        )}

                        {/* Description */}
                        <div className="space-y-1.5">
                          <Label htmlFor="edit-description" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</Label>
                          <Textarea
                            id="edit-description"
                            rows={3}
                            placeholder="Describe the card's condition, provenance, or anything buyers should know…"
                            value={editDescription}
                            onChange={e => setEditDescription(e.target.value)}
                            className="resize-none text-sm"
                          />
                        </div>

                        {/* Price fields */}
                        {!isAuction && (
                          <div className="space-y-1.5">
                            <Label htmlFor="edit-price" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Buy-Now Price ($)</Label>
                            <Input
                              id="edit-price"
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={editPrice}
                              onChange={e => setEditPrice(e.target.value)}
                              className="text-sm font-semibold"
                            />
                          </div>
                        )}

                        {isAuction && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Starting Bid ($)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={editStartingBid}
                                onChange={e => setEditStartingBid(e.target.value)}
                                className="text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reserve Price ($)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="None"
                                value={editReservePrice}
                                onChange={e => setEditReservePrice(e.target.value)}
                                className="text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Buy-Now Price ($)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="None"
                                value={editBuyNowPrice}
                                onChange={e => setEditBuyNowPrice(e.target.value)}
                                className="text-sm"
                              />
                            </div>
                          </div>
                        )}

                        {/* Condition — read-only with tooltip */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Condition</p>
                          <div className="flex items-center gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className={cn("text-sm px-3 py-1 cursor-help", CONDITION_COLORS[card.condition] || "")}>
                                    {formatLabel(card.condition)}
                                    <Lock className="h-3 w-3 ml-1.5 opacity-50" />
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-56 text-xs">
                                  Condition can't be changed after listing. Delete this listing and create a new one to relist at a different condition.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>

                        {/* Seller Photos */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <ImagePlus className="h-3.5 w-3.5" /> Seller Photos
                          </Label>
                          <p className="text-xs text-muted-foreground">Show buyers the actual card — front, back, any flaws or special finishes.</p>
                          <ListingImageUpload value={editImages} onChange={setEditImages} />
                        </div>

                        {/* Video */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Video className="h-3.5 w-3.5" /> Video <span className="font-normal normal-case text-muted-foreground">(optional)</span>
                          </Label>
                          <input
                            ref={videoInputRef}
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={handleVideoFileChange}
                            disabled={videoUploading}
                          />
                          {editVideo ? (
                            <div className="space-y-2">
                              <video
                                src={mediaUrl(editVideo)}
                                controls
                                className="w-full max-h-52 rounded-xl border bg-black object-contain"
                              />
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => videoInputRef.current?.click()}
                                  disabled={videoUploading}
                                  className="text-xs"
                                >
                                  <Upload className="h-3 w-3 mr-1" /> Replace
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setEditVideo(""); setVideoError(null); }}
                                  disabled={videoUploading}
                                  className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <X className="h-3 w-3 mr-1" /> Remove
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => videoInputRef.current?.click()}
                              disabled={videoUploading}
                              className={cn(
                                "w-full py-6 border-2 border-dashed rounded-xl flex flex-col items-center gap-1.5 transition-colors text-muted-foreground",
                                videoUploading
                                  ? "border-primary/40 bg-primary/5 cursor-not-allowed"
                                  : "border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer"
                              )}
                            >
                              {videoUploading
                                ? <><Loader2 className="h-5 w-5 animate-spin text-primary" /><span className="text-xs font-medium">Uploading… {videoProgress}%</span></>
                                : <><Video className="h-5 w-5" /><span className="text-sm font-medium">Add a video</span><span className="text-xs">MP4, WebM, MOV · max 200 MB</span></>}
                            </button>
                          )}
                          {videoError && <p className="text-xs text-destructive">{videoError}</p>}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                          <Button
                            onClick={handleSaveEdit}
                            disabled={updateListing.isPending}
                            className="flex-1 font-semibold"
                          >
                            {updateListing.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            {updateListing.isPending ? "Saving…" : "Save changes"}
                          </Button>
                          <Button variant="outline" onClick={() => setEditOpen(false)} className="flex-1">
                            Cancel
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setShowCancelConfirm(true)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            Remove listing
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Auction price-change confirmation dialog */}
              <Dialog open={showPriceModal} onOpenChange={open => { if (!open) { setShowPriceModal(false); setPendingEditBody(null); } }}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Change auction pricing?</DialogTitle>
                    <DialogDescription>
                      {(() => {
                        const bc = extListing?.bidCount ?? 0;
                        const oldStart = extListing?.startingBid;
                        const newStart = pendingEditBody?.startingBid as number | undefined;
                        return (
                          <>
                            <span className="font-medium text-foreground">{bc} bidder{bc !== 1 ? "s have" : " has"} already placed bid{bc !== 1 ? "s" : ""}</span> on this auction.{" "}
                            {newStart !== undefined && oldStart !== undefined && newStart !== oldStart && (
                              <>Starting bid: <strong>{formatCurrency(oldStart)}</strong> → <strong>{formatCurrency(newStart)}</strong>. </>
                            )}
                            {pendingEditBody?.reservePrice !== undefined && extListing?.reservePrice !== (pendingEditBody.reservePrice as number | null) && (
                              <>Reserve: <strong>{extListing?.reservePrice ? formatCurrency(extListing.reservePrice) : "none"}</strong> → <strong>{pendingEditBody.reservePrice !== null ? formatCurrency(pendingEditBody.reservePrice as number) : "none"}</strong>. </>
                            )}
                            {pendingEditBody?.buyNowPrice !== undefined && extListing?.buyNowPrice !== (pendingEditBody.buyNowPrice as number | null) && (
                              <>Buy-now: <strong>{extListing?.buyNowPrice ? formatCurrency(extListing.buyNowPrice) : "none"}</strong> → <strong>{pendingEditBody.buyNowPrice !== null ? formatCurrency(pendingEditBody.buyNowPrice as number) : "none"}</strong>. </>
                            )}
                            Changing pricing mid-auction may surprise active bidders. Proceed?
                          </>
                        );
                      })()}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => { setShowPriceModal(false); setPendingEditBody(null); }}>Cancel</Button>
                    <Button
                      onClick={handleConfirmedSave}
                      disabled={updateListing.isPending}
                    >
                      {updateListing.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                      {updateListing.isPending ? "Saving…" : "Yes, update pricing"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Cancel listing confirmation dialog */}
              <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Remove this listing?</DialogTitle>
                    <DialogDescription>
                      This will cancel your listing for <strong>{card.name}</strong>.{" "}
                      {(extListing?.bidCount ?? 0) > 0
                        ? `There ${extListing!.bidCount === 1 ? "is" : "are"} ${extListing!.bidCount} active bid${extListing!.bidCount === 1 ? "" : "s"} — those bidders will be notified that the auction ended early.`
                        : "The card will be returned to your collection."}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setShowCancelConfirm(false)}>Keep listing</Button>
                    <Button
                      variant="destructive"
                      onClick={() => cancelListing.mutate()}
                      disabled={cancelListing.isPending}
                    >
                      {cancelListing.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                      {cancelListing.isPending ? "Removing…" : "Yes, remove it"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Rating form */}
              {isSold && user && extListing?.sellerClerkId && extListing.sellerClerkId !== user.id && !alreadyRatedAsSeller && (() => {
                const soldAt = extListing?.updatedAt;
                const deadlinePassed = soldAt
                  ? Date.now() - new Date(soldAt).getTime() > 60 * 24 * 60 * 60 * 1000
                  : false;

                const SubScorePicker = ({
                  label,
                  value,
                  onChange,
                }: {
                  label: string;
                  value: number;
                  onChange: (v: number) => void;
                }) => (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-amber-800 min-w-0 shrink-0 w-40">{label}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => onChange(value === s ? 0 : s)}
                          className="focus:outline-none"
                        >
                          <Star className={`h-4 w-4 transition-colors ${s <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30 hover:text-amber-300"}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                );

                return (
                  <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Star className="h-4 w-4 text-amber-500" /> Rate this seller
                    </h3>
                    {deadlinePassed ? (
                      <p className="text-sm text-muted-foreground bg-muted/40 border rounded-xl px-3 py-2 flex items-center gap-2">
                        <Timer className="h-4 w-4 shrink-0" />
                        Feedback period closed — ratings must be submitted within 60 days.
                      </p>
                    ) : (
                      <>
                        <StarPicker value={ratingScore} onChange={setRatingScore} />
                        <div className="bg-white/70 rounded-xl border border-amber-100 p-3 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700/80">Detailed ratings (optional)</p>
                          <SubScorePicker
                            label="Card condition accuracy"
                            value={ratingSubScores.condition}
                            onChange={v => setRatingSubScores(s => ({ ...s, condition: v }))}
                          />
                          <SubScorePicker
                            label="Communication"
                            value={ratingSubScores.communication}
                            onChange={v => setRatingSubScores(s => ({ ...s, communication: v }))}
                          />
                          <SubScorePicker
                            label="Shipping & packaging"
                            value={ratingSubScores.shipping}
                            onChange={v => setRatingSubScores(s => ({ ...s, shipping: v }))}
                          />
                          <SubScorePicker
                            label="Value for money"
                            value={ratingSubScores.value}
                            onChange={v => setRatingSubScores(s => ({ ...s, value: v }))}
                          />
                        </div>
                        <Textarea
                          className="text-sm"
                          placeholder="Optional comment..."
                          value={ratingComment}
                          onChange={e => setRatingComment(e.target.value)}
                        />
                        <Button
                          disabled={ratingScore === 0 || submitRating.isPending}
                          onClick={() => submitRating.mutate({
                            listingId: id,
                            score: ratingScore,
                            comment: ratingComment || undefined,
                            subCondition: ratingSubScores.condition || undefined,
                            subCommunication: ratingSubScores.communication || undefined,
                            subShipping: ratingSubScores.shipping || undefined,
                            subValue: ratingSubScores.value || undefined,
                          })}
                        >
                          Submit Rating
                        </Button>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

    </Layout>
  );
}

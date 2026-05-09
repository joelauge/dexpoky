import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { formatCurrency, formatLabel, CONDITION_COLORS, RARITY_COLORS } from "@/lib/constants";
import { HoloCard } from "@/components/holo-card";
import { User, Gavel, ShoppingCart, Timer, Camera, ChevronLeft, ChevronRight, X, ZoomIn, PlayCircle, ArrowRight, LogIn } from "lucide-react";
import { isPast, intervalToDuration } from "date-fns";

interface PublicListing {
  id: number;
  price: string;
  listingType: string;
  status: string;
  description: string | null;
  sellerClerkId: string | null;
  currentBid: string | null;
  startingBid: string | null;
  auctionEndTime: string | null;
  reservePrice: string | null;
  buyNowPrice: string | null;
  viewCount: number;
  listingImages: string[] | null;
  listingVideo: string | null;
  card: {
    id: number;
    name: string;
    pokemonName: string | null;
    setName: string | null;
    cardNumber: string | null;
    rarity: string;
    condition: string;
    imageUrl: string | null;
    estimatedValue: number | null;
    cardStory: string | null;
  };
}

interface PublicUser {
  clerkId: string;
  username: string | null;
  avatarUrl: string | null;
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function mediaUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http") || path.startsWith("/api/")) return path;
  return `/api/storage${path}`;
}

function AuctionCountdownBlocks({ endTime }: { endTime: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const end = new Date(endTime);
  if (isPast(end)) {
    return (
      <div className="text-center">
        <span className="text-red-400 font-black text-2xl tracking-tight">Auction Ended</span>
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
          <div className={`flex flex-col items-center px-4 py-2 rounded-2xl border ${endingSoon ? "bg-red-500/15 border-red-400/40" : "bg-white/8 border-white/12"}`}>
            <span className={`font-black text-4xl tabular-nums leading-none ${endingSoon ? "text-red-300" : "text-white"}`}>
              {String(b.val).padStart(2, "0")}
            </span>
            <span className="text-white/40 text-[10px] uppercase tracking-widest mt-1 font-bold">{b.label}</span>
          </div>
          {i < blocks.length - 1 && (
            <span className={`font-black text-2xl mb-3 ${endingSoon ? "text-red-400" : "text-white/30"}`}>:</span>
          )}
        </div>
      ))}
    </div>
  );
}

function PublicMediaGallery({ images, video }: { images: string[]; video: string | null }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const hasImages = images.length > 0;
  const hasVideo = !!video;
  if (!hasImages && !hasVideo) return null;

  const prev = () => setActiveIdx(i => (i - 1 + images.length) % images.length);
  const next = () => setActiveIdx(i => (i + 1) % images.length);

  return (
    <div className="w-full max-w-sm mx-auto mt-6 space-y-4">
      {/* Section label */}
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-white/10" />
        <div className="flex items-center gap-1.5 text-white/40 text-[10px] font-bold uppercase tracking-widest">
          <Camera className="h-3 w-3" />
          Seller Photos{images.length > 0 ? ` (${images.length})` : ""}
          {hasVideo && <><span className="mx-1 opacity-50">·</span><PlayCircle className="h-3 w-3" />Video</>}
        </div>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      {/* Main photo */}
      {hasImages && (
        <div
          className="relative rounded-2xl overflow-hidden border border-white/10 bg-white/5 aspect-square cursor-zoom-in group"
          onClick={() => setLightbox(activeIdx)}
        >
          <img
            src={mediaUrl(images[activeIdx])}
            alt={`Seller photo ${activeIdx + 1}`}
            className="w-full h-full object-contain"
          />
          {/* Hover zoom hint */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
            <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-70 transition-opacity drop-shadow-lg" />
          </div>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); prev(); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 text-white rounded-full p-1.5 transition-colors"
                aria-label="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); next(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 text-white rounded-full p-1.5 transition-colors"
                aria-label="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/55 text-white/80 text-[10px] font-bold px-2.5 py-1 rounded-full">
                {activeIdx + 1} / {images.length}
              </div>
            </>
          )}
        </div>
      )}

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {images.map((path, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={`flex-none w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${
                i === activeIdx
                  ? "border-indigo-400 ring-2 ring-indigo-400/30 scale-105"
                  : "border-white/10 opacity-50 hover:opacity-90"
              }`}
            >
              <img src={mediaUrl(path)} alt={`Thumbnail ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Video player */}
      {hasVideo && (
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
          <video
            src={mediaUrl(video!)}
            controls
            playsInline
            className="w-full max-h-80 object-contain"
          />
        </div>
      )}

      {/* Fullscreen lightbox */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/97 flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/40 rounded-full p-2 z-10"
            onClick={() => setLightbox(null)}
          >
            <X className="h-6 w-6" />
          </button>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/50 text-sm font-medium">
            {lightbox + 1} / {images.length}
          </div>
          {images.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 rounded-full p-2 z-10"
                onClick={e => { e.stopPropagation(); setLightbox((lightbox - 1 + images.length) % images.length); }}
              >
                <ChevronLeft className="h-7 w-7" />
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 rounded-full p-2 z-10"
                onClick={e => { e.stopPropagation(); setLightbox((lightbox + 1) % images.length); }}
              >
                <ChevronRight className="h-7 w-7" />
              </button>
            </>
          )}
          <img
            src={mediaUrl(images[lightbox])}
            alt={`Seller photo ${lightbox + 1}`}
            className="max-h-[88vh] max-w-[88vw] object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          {images.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={e => { e.stopPropagation(); setLightbox(i); }}
                  className={`w-2 h-2 rounded-full transition-all ${i === lightbox ? "bg-white scale-125" : "bg-white/35 hover:bg-white/65"}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PublicListingView() {
  const [, params] = useRoute("/view/listing/:id");
  const [, setLocation] = useLocation();
  const listingId = params?.id ? parseInt(params.id) : 0;
  const { isLoaded, isSignedIn } = useUser();

  // Signed-in users get redirected straight to the full marketplace listing page
  useEffect(() => {
    if (isLoaded && isSignedIn && listingId) {
      setLocation(`/marketplace/${listingId}`);
    }
  }, [isLoaded, isSignedIn, listingId]);

  const { data: listing } = useQuery<PublicListing>({
    queryKey: ["/api/marketplace/public", listingId],
    queryFn: () => fetch(`/api/marketplace/${listingId}`).then(r => r.json()),
    enabled: !!listingId,
    refetchInterval: 10000,
  });

  const { data: seller } = useQuery<PublicUser>({
    queryKey: ["/api/users/public", listing?.sellerClerkId],
    queryFn: () => fetch(`/api/users/${listing!.sellerClerkId}`).then(r => r.json()),
    enabled: !!listing?.sellerClerkId,
  });

  const isAuction = listing?.listingType === "auction";
  const isSold = listing?.status === "sold";
  const isCancelled = listing?.status === "cancelled";
  const isActive = listing?.status === "active";
  const auctionEnded = isAuction && listing?.auctionEndTime && isPast(new Date(listing.auctionEndTime));

  const currentBid = listing?.currentBid ? parseFloat(listing.currentBid) : null;
  const startingBid = listing?.startingBid ? parseFloat(listing.startingBid) : null;
  const buyNowPrice = listing?.buyNowPrice ? parseFloat(listing.buyNowPrice) : null;
  const price = listing?.price ? parseFloat(listing.price) : null;

  const displayName = seller?.username ?? "Anonymous Trainer";
  const card = listing?.card;

  const images = listing?.listingImages ?? [];
  const video = listing?.listingVideo ?? null;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex flex-col select-none">

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 shrink-0">
        <div className="flex items-center gap-2.5">
          {seller?.avatarUrl ? (
            <img src={seller.avatarUrl} alt={displayName} className="h-9 w-9 rounded-full border-2 border-white/20 object-cover" />
          ) : (
            <div className="h-9 w-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
              <User className="h-4 w-4 text-white/60" />
            </div>
          )}
          <div>
            <p className="text-white/90 text-sm font-semibold leading-tight">
              {seller?.username ?? <em className="not-italic font-normal text-white/50">Anonymous Trainer</em>}
            </p>
            <p className="text-white/40 text-xs leading-tight">
              {isAuction ? "Running an auction" : "Selling on DexPoky"}
            </p>
          </div>
        </div>
        <img src={`${basePath}/logo.png`} alt="DexPoky" className="h-9 w-9 rounded-full opacity-90" />
      </header>

      {/* Sold / cancelled banner */}
      {(isSold || isCancelled) && (
        <div className={`mx-5 mb-2 text-center py-2 rounded-xl text-sm font-bold ${isSold ? "bg-red-500/20 text-red-300 border border-red-400/25" : "bg-white/5 text-white/40 border border-white/10"}`}>
          {isSold ? "SOLD" : "LISTING ENDED"}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center px-6 py-2 gap-5">

        {/* Countdown — auctions only */}
        {isAuction && listing?.auctionEndTime && isActive && !auctionEnded && (
          <div className="w-full max-w-sm flex flex-col items-center gap-2">
            <div className="flex items-center gap-1.5 text-white/40 text-[10px] font-bold uppercase tracking-widest">
              <Timer className="h-3 w-3" />
              Ends in
            </div>
            <AuctionCountdownBlocks endTime={listing.auctionEndTime} />
          </div>
        )}

        {/* 3D holo card */}
        <div className="relative w-64 sm:w-72 md:w-80">
          <div
            className="absolute inset-0 scale-[1.15] blur-3xl opacity-20 rounded-3xl pointer-events-none"
            style={{ background: isAuction ? "radial-gradient(circle at 50% 60%, #f59e0b 0%, #d97706 40%, transparent 70%)" : "radial-gradient(circle at 50% 60%, #6366f1 0%, #8b5cf6 40%, transparent 70%)" }}
          />
          <div className="relative">
            <HoloCard imageUrl={card?.imageUrl} name={card?.name ?? "Card"} />
          </div>
        </div>

        {/* Card name + badges + price */}
        <div className="text-center space-y-2 max-w-xs w-full">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">{card?.name}</h1>
          {(card?.pokemonName || card?.setName) && (
            <p className="text-white/45 text-sm">
              {[card.pokemonName, card.setName].filter(Boolean).join(" · ")}
              {card?.cardNumber && <span className="ml-2 font-mono text-xs bg-white/10 px-2 py-0.5 rounded">{card.cardNumber}</span>}
            </p>
          )}

          {card && (
            <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
              <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${RARITY_COLORS[card.rarity] ?? "bg-white/10 border-white/10 text-white/60"}`}>
                {formatLabel(card.rarity)}
              </span>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${CONDITION_COLORS[card.condition] ?? "bg-white/10 border-white/10 text-white/60"}`}>
                {formatLabel(card.condition)}
              </span>
            </div>
          )}

          {/* Auction bid block */}
          {isAuction && (
            <div className={`mt-3 rounded-2xl border px-5 py-4 space-y-1 ${isActive && !auctionEnded ? "bg-amber-500/10 border-amber-400/30" : "bg-white/5 border-white/10"}`}>
              <div className="flex items-center justify-center gap-1.5 text-amber-400/80 text-[10px] font-bold uppercase tracking-widest mb-2">
                <Gavel className="h-3 w-3" />
                {auctionEnded || isSold ? "Auction" : "Live Auction"}
              </div>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">
                {currentBid ? "Current Bid" : "Starting Bid"}
              </p>
              <p className="text-white text-4xl font-black">
                {formatCurrency(currentBid ?? startingBid ?? 0)}
              </p>
              {buyNowPrice && isActive && !auctionEnded && (
                <p className="text-white/40 text-xs pt-1">
                  Buy now: <span className="text-white/70 font-bold">{formatCurrency(buyNowPrice)}</span>
                </p>
              )}
            </div>
          )}

          {/* Fixed price block */}
          {!isAuction && price !== null && (
            <div className="mt-3 inline-flex flex-col items-center bg-white/5 border border-white/10 rounded-2xl px-6 py-3">
              <div className="flex items-center gap-1.5 text-white/40 text-[10px] font-bold uppercase tracking-widest mb-0.5">
                <ShoppingCart className="h-3 w-3" />
                Price
              </div>
              <p className="text-white text-3xl font-black">{formatCurrency(price)}</p>
            </div>
          )}
        </div>

        {/* ── Card story ── */}
        {card?.cardStory && (
          <div className="w-full max-w-sm mx-auto space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-white/10" />
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Card Story</p>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <blockquote className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4">
              <p className="text-white/70 text-sm leading-relaxed italic">{card.cardStory}</p>
            </blockquote>
          </div>
        )}

        {/* ── Seller photos & video ── */}
        <PublicMediaGallery images={images} video={video} />

      </div>

      {/* CTA footer */}
      <div className="shrink-0 px-6 pb-8 pt-4 border-t border-white/5 text-center">
        <p className="text-white/35 text-xs mb-3">Trade · Collect · Battle</p>

        {/* Signed-in: deep-link straight to the marketplace listing */}
        {isLoaded && isSignedIn ? (
          <a
            href={`${basePath}/marketplace/${listingId}`}
            className={`inline-flex items-center justify-center gap-2 w-full max-w-sm text-white font-bold text-sm py-3.5 px-6 rounded-2xl transition-colors shadow-lg ${isAuction && isActive && !auctionEnded ? "bg-amber-600 hover:bg-amber-500 active:bg-amber-700 shadow-amber-900/50" : "bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 shadow-indigo-900/50"}`}
          >
            Get more details
            <ArrowRight className="h-4 w-4" />
          </a>
        ) : (
          <>
            {/* Signed-out: primary CTA = sign up, secondary = sign in */}
            <a
              href={`${basePath}/sign-up?redirect_url=${encodeURIComponent(`/marketplace/${listingId}`)}`}
              className={`inline-flex items-center justify-center gap-2 w-full max-w-sm text-white font-bold text-sm py-3.5 px-6 rounded-2xl transition-colors shadow-lg ${isAuction && isActive && !auctionEnded ? "bg-amber-600 hover:bg-amber-500 active:bg-amber-700 shadow-amber-900/50" : "bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 shadow-indigo-900/50"}`}
            >
              {isAuction && isActive && !auctionEnded
                ? "Join DexPoky to place a bid!"
                : "Join DexPoky to buy and sell cards!"}
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={`${basePath}/sign-in?redirect_url=${encodeURIComponent(`/marketplace/${listingId}`)}`}
              className="inline-flex items-center justify-center gap-1.5 mt-3 text-white/45 hover:text-white/70 text-xs font-medium transition-colors"
            >
              <LogIn className="h-3.5 w-3.5" />
              Already a member? Sign in
            </a>
          </>
        )}

        <div className="flex items-center justify-center gap-2 mt-4 opacity-40">
          <img src={`${basePath}/logo.png`} alt="DexPoky" className="h-5 w-5 rounded-full" />
          <span className="text-white text-sm font-bold tracking-tight">DexPoky</span>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { formatCurrency, CONDITION_COLORS, RARITY_COLORS } from "@/lib/constants";
import {
  Camera, ChevronLeft, ChevronRight, X, ZoomIn,
  PlayCircle, ShoppingCart, ArrowRight, LogIn, Package,
} from "lucide-react";

interface GroupShareCard {
  id: number;
  cardId: number;
  images: string[];
  video: string | null;
  displayOrder: number;
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
  } | null;
}

interface GroupShare {
  id: number;
  code: string;
  title: string | null;
  askingPrice: string | null;
  shippingCost: string | null;
  clerkId: string;
  createdAt: string;
  cards: GroupShareCard[];
}

function mediaUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http") || path.startsWith("/api/")) return path;
  return `/api/storage${path}`;
}

const RARITY_BADGE: Record<string, string> = {
  secret_rare: "bg-yellow-400/20 text-yellow-300 border-yellow-400/30",
  ultra_rare: "bg-yellow-400/20 text-yellow-300 border-yellow-400/30",
  holo_rare: "bg-purple-400/20 text-purple-300 border-purple-400/30",
  rare: "bg-blue-400/20 text-blue-300 border-blue-400/30",
  uncommon: "bg-slate-400/20 text-slate-300 border-slate-400/30",
  common: "bg-slate-400/20 text-slate-300 border-slate-400/30",
};

function rarityBadge(rarity: string): string {
  return RARITY_BADGE[rarity?.toLowerCase()?.replace(/[\s-]/g, "_")] ?? "bg-slate-400/20 text-slate-300 border-slate-400/30";
}

/* ── Per-card media gallery ──────────────────────────────────────────────── */
function CardMediaGallery({ images, video }: { images: string[]; video: string | null }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const hasImages = images.length > 0;
  const hasVideo = !!video;
  if (!hasImages && !hasVideo) return null;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
          <Camera className="h-3 w-3" />
          {hasImages ? `${images.length} photo${images.length !== 1 ? "s" : ""}` : ""}
          {hasImages && hasVideo && " · "}
          {hasVideo && <><PlayCircle className="h-3 w-3" /> video</>}
        </span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      {hasImages && (
        <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-white/5 aspect-[4/3] cursor-zoom-in group"
          onClick={() => setLightbox(activeIdx)}>
          <img
            src={mediaUrl(images[activeIdx])}
            alt={`Photo ${activeIdx + 1}`}
            className="w-full h-full object-contain"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
            <ZoomIn className="h-7 w-7 text-white opacity-0 group-hover:opacity-70 transition-opacity drop-shadow-lg" />
          </div>
          {images.length > 1 && (
            <>
              <button type="button"
                onClick={e => { e.stopPropagation(); setActiveIdx(i => (i - 1 + images.length) % images.length); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 text-white rounded-full p-1.5 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button"
                onClick={e => { e.stopPropagation(); setActiveIdx(i => (i + 1) % images.length); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 text-white rounded-full p-1.5 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/55 text-white/80 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {activeIdx + 1} / {images.length}
              </div>
            </>
          )}
        </div>
      )}

      {images.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {images.map((path, i) => (
            <button key={i} type="button" onClick={() => setActiveIdx(i)}
              className={`flex-none w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                i === activeIdx ? "border-indigo-400 ring-2 ring-indigo-400/30 scale-105" : "border-white/10 opacity-50 hover:opacity-90"
              }`}>
              <img src={mediaUrl(path)} alt={`Thumb ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {hasVideo && (
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
          <video src={mediaUrl(video!)} controls playsInline className="w-full max-h-72 object-contain" />
        </div>
      )}

      {lightbox !== null && (
        <div className="fixed inset-0 z-50 bg-black/97 flex items-center justify-center"
          onClick={() => setLightbox(null)}>
          <button type="button"
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/40 rounded-full p-2 z-10"
            onClick={() => setLightbox(null)}>
            <X className="h-6 w-6" />
          </button>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/50 text-sm font-medium">
            {lightbox + 1} / {images.length}
          </div>
          {images.length > 1 && (
            <>
              <button type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 rounded-full p-2 z-10"
                onClick={e => { e.stopPropagation(); setLightbox((lightbox - 1 + images.length) % images.length); }}>
                <ChevronLeft className="h-7 w-7" />
              </button>
              <button type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 rounded-full p-2 z-10"
                onClick={e => { e.stopPropagation(); setLightbox((lightbox + 1) % images.length); }}>
                <ChevronRight className="h-7 w-7" />
              </button>
            </>
          )}
          <img
            src={mediaUrl(images[lightbox])}
            alt={`Photo ${lightbox + 1}`}
            className="max-h-[88vh] max-w-[88vw] object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          {images.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
              {images.map((_, i) => (
                <button key={i} type="button"
                  onClick={e => { e.stopPropagation(); setLightbox(i); }}
                  className={`w-2 h-2 rounded-full transition-all ${i === lightbox ? "bg-white scale-125" : "bg-white/35 hover:bg-white/65"}`} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function GroupShareView() {
  const [, params] = useRoute("/view/group/:code");
  const [, setLocation] = useLocation();
  const code = params?.code ?? "";
  const { isLoaded, isSignedIn } = useUser();
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set([0]));

  const { data: group, isLoading } = useQuery<GroupShare>({
    queryKey: ["/api/group-shares", code],
    queryFn: () => fetch(`/api/group-shares/${code}`).then(r => r.json()),
    enabled: !!code,
  });

  const toggleCard = (idx: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const title = group?.title || `${group?.cards?.length ?? ""} Card Bundle`.trim();
  const askingPrice = group?.askingPrice ? parseFloat(group.askingPrice) : null;
  const shippingCost = group?.shippingCost ? parseFloat(group.shippingCost) : null;
  const totalPrice = (askingPrice ?? 0) + (shippingCost ?? 0);

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!group || !group.cards) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-4">
        <Package className="h-12 w-12 text-white/20" />
        <p className="text-white/50 text-lg font-semibold">Bundle not found</p>
        <a href={`${basePath}/marketplace`}
          className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center gap-1">
          Browse marketplace <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 pb-32">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 backdrop-blur-md bg-black/40 border-b border-white/8">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <a href={`${basePath}/`}>
            <img src={`${basePath}/logo.png`} alt="DexPoky" className="h-8 w-8 rounded-full object-cover" />
          </a>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate">{title}</p>
            <p className="text-white/40 text-[11px]">{group.cards.length} cards · DexPoky.com</p>
          </div>
          <a
            href={isSignedIn ? `${basePath}/marketplace` : `${basePath}/sign-in`}
            className="shrink-0 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-full transition-colors"
          >
            {isSignedIn ? <ShoppingCart className="h-3.5 w-3.5" /> : <LogIn className="h-3.5 w-3.5" />}
            {isSignedIn ? "Buy" : "Sign in"}
          </a>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4">

        {/* ── Card fan strip ────────────────────────────────────────────── */}
        <div className="pt-8 pb-6">
          <div className="flex justify-center">
            <div className="relative flex items-end justify-center" style={{ height: 200, minWidth: 280 }}>
              {group.cards.slice(0, 7).map((gc, i, arr) => {
                const total = Math.min(arr.length, 7);
                const centerIdx = (total - 1) / 2;
                const offset = i - centerIdx;
                const rotation = offset * 6;
                const translateX = offset * 36;
                const translateY = Math.abs(offset) * 4;
                const zIndex = total - Math.abs(offset);
                const imgSrc = (gc.images.length > 0 ? mediaUrl(gc.images[0]) : gc.card?.imageUrl) ?? null;
                return (
                  <div
                    key={gc.id}
                    className="absolute bottom-0 transition-all"
                    style={{
                      transform: `translateX(${translateX}px) translateY(${translateY}px) rotate(${rotation}deg)`,
                      zIndex,
                      transformOrigin: "bottom center",
                    }}
                  >
                    <div className="w-[100px] h-[140px] rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl bg-slate-800">
                      {imgSrc ? (
                        <img src={imgSrc} alt={gc.card?.name ?? "Card"} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                          <Package className="h-8 w-8 text-white/20" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {group.cards.length > 7 && (
            <p className="text-center text-white/40 text-xs mt-3 font-medium">
              + {group.cards.length - 7} more cards in this bundle
            </p>
          )}
        </div>

        {/* ── Bundle title & price ──────────────────────────────────────── */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight mb-1">{title}</h1>
          <p className="text-white/50 text-sm mb-4">
            {group.cards.length} Pokémon card{group.cards.length !== 1 ? "s" : ""}
          </p>
          {askingPrice != null && (
            <div className="inline-flex flex-col items-center bg-white/8 border border-white/12 rounded-2xl px-6 py-3">
              <span className="text-white/40 text-[11px] font-bold uppercase tracking-wider mb-1">Asking price</span>
              <span className="text-4xl font-black text-white tracking-tight">
                {formatCurrency(askingPrice)}
              </span>
              {shippingCost != null && shippingCost > 0 && (
                <span className="text-white/40 text-xs mt-1">
                  + {formatCurrency(shippingCost)} shipping · Total {formatCurrency(totalPrice)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Cards list ────────────────────────────────────────────────── */}
        <div className="space-y-3 mb-8">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Cards in this bundle</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {group.cards.map((gc, idx) => {
            const card = gc.card;
            const isExpanded = expandedCards.has(idx);
            const hasMedia = gc.images.length > 0 || !!gc.video;
            const rarity = card?.rarity ?? "";
            const rarityKey = rarity.toLowerCase().replace(/[\s-]/g, "_");
            const condColor = CONDITION_COLORS[card?.condition?.toLowerCase() as keyof typeof CONDITION_COLORS] ?? "text-white/60";
            const imgSrc = (gc.images.length > 0 ? mediaUrl(gc.images[0]) : card?.imageUrl) ?? null;

            return (
              <div key={gc.id}
                className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 p-3 text-left"
                  onClick={() => toggleCard(idx)}
                >
                  {/* Card image */}
                  <div className="w-12 h-[68px] rounded-xl overflow-hidden border border-white/10 bg-slate-800 shrink-0">
                    {imgSrc ? (
                      <img src={imgSrc} alt={card?.name ?? "Card"} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-5 w-5 text-white/20" />
                      </div>
                    )}
                  </div>

                  {/* Card info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">
                      {card?.name ?? "Unknown Card"}
                    </p>
                    {card?.setName && (
                      <p className="text-white/40 text-xs truncate">{card.setName}{card.cardNumber ? ` · #${card.cardNumber}` : ""}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {rarity && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wide ${rarityBadge(rarity)}`}>
                          {rarity.replace(/_/g, " ")}
                        </span>
                      )}
                      {card?.condition && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-white/10 bg-white/5 ${condColor}`}>
                          {card.condition}
                        </span>
                      )}
                      {hasMedia && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-indigo-400/30 bg-indigo-400/10 text-indigo-300 flex items-center gap-0.5">
                          <Camera className="h-2.5 w-2.5" />
                          {gc.images.length > 0 && gc.images.length}
                          {gc.images.length > 0 && gc.video && "+"}
                          {gc.video && <PlayCircle className="h-2.5 w-2.5" />}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Value + expand */}
                  <div className="shrink-0 text-right">
                    {card?.estimatedValue != null && (
                      <p className="text-white/60 text-xs font-semibold">
                        ~{formatCurrency(Number(card.estimatedValue))}
                      </p>
                    )}
                    <ChevronRight
                      className={`h-4 w-4 text-white/30 mt-1 transition-transform ml-auto ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </div>
                </button>

                {/* Expanded media */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/8 pt-1">
                    {card?.pokemonName && card.pokemonName !== card.name && (
                      <p className="text-white/30 text-xs mt-2">Pokémon: {card.pokemonName}</p>
                    )}
                    {hasMedia ? (
                      <CardMediaGallery images={gc.images} video={gc.video} />
                    ) : (
                      <p className="text-white/25 text-xs text-center py-4">No photos for this card</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center space-y-4">
          <div>
            <p className="text-white font-black text-xl mb-1">Interested in this bundle?</p>
            <p className="text-white/50 text-sm leading-relaxed">
              {isLoaded && isSignedIn
                ? "Head to the marketplace or message the seller directly."
                : "Join DexPoky for free to message the seller and complete your purchase."}
            </p>
          </div>

          {isLoaded && isSignedIn ? (
            <button
              type="button"
              onClick={() => setLocation("/marketplace")}
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <ShoppingCart className="h-5 w-5" />
              Browse Marketplace
            </button>
          ) : (
            <div className="space-y-2">
              <a
                href={`${basePath}/sign-up`}
                className="block w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                Join DexPoky — it's free
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href={`${basePath}/sign-in`}
                className="block w-full h-12 border border-white/15 text-white/70 hover:text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <LogIn className="h-4 w-4" />
                Sign in
              </a>
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="text-center mt-8 pb-4">
          <a href={`${basePath}/`}
            className="inline-flex items-center gap-2 text-white/25 hover:text-white/50 text-xs transition-colors">
            <img src={`${basePath}/logo.png`} alt="" className="h-5 w-5 rounded-full object-cover opacity-50" />
            Powered by DexPoky.com
          </a>
        </div>
      </div>
    </div>
  );
}

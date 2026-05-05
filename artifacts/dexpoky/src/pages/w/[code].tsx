import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useGetWantedListingByCode } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLabel, RARITY_COLORS } from "@/lib/constants";
import { ImageUploader } from "@/components/image-uploader";
import { Heart, Clock, CheckCircle2, AlertCircle, ArrowLeft, DollarSign, Camera, Send, Loader2 } from "lucide-react";
import { isPast } from "date-fns";
import { toast } from "sonner";

type ResponseStep = "idle" | "photos" | "details" | "done";

export default function WantedListingPublicPage() {
  const { code } = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  const { user, isSignedIn } = useUser();

  const { data: listing, isLoading, isError } = useGetWantedListingByCode(code ?? "");

  const [responseStep, setResponseStep] = useState<ResponseStep>("idle");
  const [sellerImages, setSellerImages] = useState<string[]>([]);
  const [sellerVideo, setSellerVideo] = useState<string | null>(null);
  const [askingPrice, setAskingPrice] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!listing) return;
    setSending(true);
    try {
      const price = parseFloat(askingPrice);
      const messageParts: string[] = [];
      if (price > 0) messageParts.push(`I'm asking $${price.toFixed(2)} for my copy.`);
      if (note.trim()) messageParts.push(note.trim());
      if (!messageParts.length) messageParts.push(`Hi! I have the ${listing.name} you're looking for. Let me know if you're interested!`);

      const res = await fetch(`/api/wanted/${listing.id}/thread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initialMessage: messageParts.join(" "),
          sellerImages: sellerImages.length > 0 ? sellerImages : undefined,
          sellerVideo: sellerVideo ?? undefined,
          askingPrice: price > 0 ? price : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to send");
      setResponseStep("done");
      setTimeout(() => setLocation("/inbox"), 1800);
    } catch {
      toast.error("Failed to send — please try again");
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-12 space-y-4">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-8 w-3/4 rounded-xl" />
          <Skeleton className="h-4 w-1/2 rounded-lg" />
        </div>
      </Layout>
    );
  }

  if (isError || !listing) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold mb-2">Request not found</h2>
          <p className="text-muted-foreground">This "Looking For" request doesn't exist or has been removed.</p>
        </div>
      </Layout>
    );
  }

  const isExpired = listing.expiresAt ? isPast(new Date(listing.expiresAt)) : false;
  const isFound = listing.status === "closed";

  if (isFound) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-3xl bg-emerald-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-200">
              <CheckCircle2 className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-2xl font-black text-emerald-700 mb-2">
              {listing.ownerDisplayName
                ? `${listing.ownerDisplayName} found this card!`
                : "Card found!"}
            </h1>
            <p className="text-muted-foreground">This request has been fulfilled — lucky collector!</p>
          </div>

          <div className="bg-card rounded-2xl border overflow-hidden shadow-sm">
            {listing.imageUrl && (
              <div className="aspect-[4/3] bg-emerald-50 flex items-center justify-center relative">
                <img src={listing.imageUrl} alt={listing.name} className="max-h-full object-contain py-4 px-8 opacity-70 grayscale" />
                <div className="absolute inset-0 bg-emerald-500/10" />
                <div className="absolute top-3 right-3">
                  <Badge className="bg-emerald-500 text-white border-0 shadow">
                    <CheckCircle2 className="h-3 w-3 mr-1" />Found
                  </Badge>
                </div>
              </div>
            )}
            <div className="p-5">
              <h2 className="text-lg font-bold">{listing.name}</h2>
              <p className="text-sm text-muted-foreground">{listing.pokemonName}</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (isExpired) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Clock className="h-10 w-10 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-black mb-2">This request has expired</h1>
            <p className="text-muted-foreground">The collector is no longer looking for this card.</p>
          </div>
          <div className="bg-card rounded-2xl border overflow-hidden shadow-sm opacity-60">
            {listing.imageUrl && (
              <div className="aspect-[4/3] bg-muted flex items-center justify-center">
                <img src={listing.imageUrl} alt={listing.name} className="max-h-full object-contain py-4 px-8 grayscale" />
              </div>
            )}
            <div className="p-5">
              <h2 className="text-lg font-bold">{listing.name}</h2>
              <p className="text-sm text-muted-foreground">{listing.pokemonName}</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center shrink-0">
            <Heart className="h-5 w-5 text-white fill-white/40" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none">Looking For</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Someone wants to buy this card</p>
          </div>
          {listing.expiresAt && (
            <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Expires {new Date(listing.expiresAt).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Card image */}
        <div className="bg-card rounded-2xl border overflow-hidden shadow-sm mb-5">
          {listing.imageUrl ? (
            <div className="aspect-[4/3] bg-rose-50 flex items-center justify-center relative">
              <img src={listing.imageUrl} alt={listing.name} className="max-h-full object-contain py-4 px-8" />
              {listing.rarity && (
                <div className="absolute bottom-3 left-3">
                  <Badge className={`text-[10px] uppercase font-bold tracking-wider border-0 ${RARITY_COLORS[listing.rarity] || ""}`}>
                    {formatLabel(listing.rarity)}
                  </Badge>
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-[4/3] bg-rose-50 flex items-center justify-center">
              <Heart className="h-16 w-16 text-rose-200" />
            </div>
          )}
          <div className="p-5 space-y-1">
            <h2 className="text-xl font-black">{listing.name}</h2>
            <p className="text-sm text-muted-foreground">{listing.pokemonName}</p>
            {listing.setName && (
              <p className="text-xs text-muted-foreground">{listing.setName}{listing.cardNumber ? ` · #${listing.cardNumber}` : ""}</p>
            )}
          </div>
        </div>

        {listing.maxPrice != null && (
          <div className="flex items-center justify-between bg-rose-50 rounded-xl px-4 py-3 border border-rose-100 mb-3">
            <span className="text-sm font-medium text-rose-700">Budget</span>
            <span className="text-lg font-black text-rose-600">Up to ${Number(listing.maxPrice).toFixed(2)}</span>
          </div>
        )}

        {listing.notes && (
          <div className="bg-muted/40 rounded-xl px-4 py-3 border mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Note from buyer</p>
            <p className="text-sm">{listing.notes}</p>
          </div>
        )}

        {listing.ownerDisplayName && (
          <div className="flex items-center gap-3 bg-card rounded-xl border px-4 py-3 mb-5">
            {listing.ownerImageUrl ? (
              <img src={listing.ownerImageUrl} alt={listing.ownerDisplayName} className="w-10 h-10 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-rose-200 flex items-center justify-center text-rose-700 font-bold shrink-0">
                {listing.ownerDisplayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-semibold text-sm">{listing.ownerDisplayName}</p>
              <p className="text-xs text-muted-foreground">is looking for this card</p>
            </div>
          </div>
        )}

        {/* ── Seller response flow ── */}
        {!isSignedIn && responseStep === "idle" && (
          <Button
            className="w-full h-12 bg-rose-500 hover:bg-rose-600 text-white font-semibold rounded-xl"
            onClick={() => setLocation("/sign-in")}
          >
            <Heart className="h-4 w-4 mr-2" />
            Sign in to respond
          </Button>
        )}

        {isSignedIn && user?.id === listing.ownerClerkId && (
          <div className="text-center py-3 text-sm text-muted-foreground bg-muted/30 rounded-xl border border-dashed">
            This is your own request
          </div>
        )}

        {isSignedIn && user?.id !== listing.ownerClerkId && responseStep === "idle" && (
          <Button
            className="w-full h-12 bg-rose-500 hover:bg-rose-600 text-white font-semibold rounded-xl"
            onClick={() => setResponseStep("photos")}
          >
            <Camera className="h-4 w-4 mr-2" />
            I have this card — respond
          </Button>
        )}

        {/* Step 1: Photos */}
        {isSignedIn && responseStep === "photos" && (
          <div className="space-y-4 bg-card border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <button type="button" onClick={() => setResponseStep("idle")} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <p className="font-semibold text-sm">Step 1 of 2 — Add photos of your copy</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Clear photos build trust and help the buyer see condition, holofoil, and any wear.
            </p>
            <ImageUploader
              photos={sellerImages}
              video={sellerVideo}
              onPhotosChange={setSellerImages}
              onVideoChange={setSellerVideo}
              maxPhotos={10}
              label="Your card photos & video"
            />
            <Button
              className="w-full"
              onClick={() => setResponseStep("details")}
            >
              Next — Set your price
            </Button>
            <button
              type="button"
              onClick={() => setResponseStep("details")}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1"
            >
              Skip photos
            </button>
          </div>
        )}

        {/* Step 2: Price + note */}
        {isSignedIn && responseStep === "details" && (
          <div className="space-y-4 bg-card border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <button type="button" onClick={() => setResponseStep("photos")} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <p className="font-semibold text-sm">Step 2 of 2 — Your asking price</p>
            </div>

            {(sellerImages.length > 0 || sellerVideo) && (
              <div className="flex gap-2 overflow-x-auto pb-1 items-start">
                {sellerImages.map((path, i) => (
                  <img
                    key={i}
                    src={`/api/storage${path}`}
                    alt=""
                    className="w-14 object-cover rounded-lg shrink-0 border"
                    style={{ height: 72 }}
                  />
                ))}
                {sellerVideo && (
                  <video
                    src={`/api/storage${sellerVideo}`}
                    className="w-24 rounded-lg shrink-0 border bg-black"
                    style={{ height: 72 }}
                    muted
                  />
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Asking price {listing.maxPrice ? `(buyer budget: up to $${Number(listing.maxPrice).toFixed(2)})` : ""}
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={askingPrice}
                  onChange={(e) => setAskingPrice(e.target.value)}
                  className="pl-8 rounded-xl text-lg font-bold h-12"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Note to buyer (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={`Hi! I have the ${listing.name} you're looking for. Happy to discuss details!`}
                rows={3}
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <Button
              className="w-full h-12 bg-rose-500 hover:bg-rose-600 text-white font-semibold rounded-xl"
              onClick={handleSend}
              disabled={sending}
            >
              {sending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> Send offer to buyer</>
              )}
            </Button>
          </div>
        )}

        {/* Done */}
        {responseStep === "done" && (
          <div className="text-center py-6 space-y-2 bg-emerald-50 rounded-2xl border border-emerald-200">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <p className="font-bold text-emerald-700">Offer sent!</p>
            <p className="text-xs text-muted-foreground">Redirecting to your inbox…</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

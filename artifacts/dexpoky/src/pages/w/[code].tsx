import { useParams } from "wouter";
import { useGetWantedListingByCode } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLabel, RARITY_COLORS } from "@/lib/constants";
import { Heart, Mail, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { isPast } from "date-fns";

export default function WantedListingPublicPage() {
  const { code } = useParams<{ code: string }>();

  const { data: listing, isLoading, isError } = useGetWantedListingByCode(code ?? "");

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
                <img
                  src={listing.imageUrl}
                  alt={listing.name}
                  className="max-h-full object-contain py-4 px-8 opacity-70 grayscale"
                />
                <div className="absolute inset-0 bg-emerald-500/10" />
                <div className="absolute top-3 right-3">
                  <Badge className="bg-emerald-500 text-white border-0 shadow">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Found
                  </Badge>
                </div>
              </div>
            )}
            <div className="p-5">
              <h2 className="text-lg font-bold">{listing.name}</h2>
              <p className="text-sm text-muted-foreground">{listing.pokemonName}</p>
              {listing.setName && (
                <p className="text-xs text-muted-foreground mt-0.5">{listing.setName}</p>
              )}
              {listing.ownerDisplayName && (
                <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                  {listing.ownerImageUrl ? (
                    <img
                      src={listing.ownerImageUrl}
                      alt={listing.ownerDisplayName}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-700 text-sm font-bold">
                      {listing.ownerDisplayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <p className="text-sm font-medium">{listing.ownerDisplayName}</p>
                </div>
              )}
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
                <img
                  src={listing.imageUrl}
                  alt={listing.name}
                  className="max-h-full object-contain py-4 px-8 grayscale"
                />
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

        <div className="bg-card rounded-2xl border overflow-hidden shadow-sm mb-5">
          {listing.imageUrl ? (
            <div className="aspect-[4/3] bg-rose-50 flex items-center justify-center relative">
              <img
                src={listing.imageUrl}
                alt={listing.name}
                className="max-h-full object-contain py-4 px-8"
              />
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
              <img
                src={listing.ownerImageUrl}
                alt={listing.ownerDisplayName}
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />
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

        <Button
          className="w-full h-12 bg-rose-500 hover:bg-rose-600 text-white font-semibold rounded-xl"
          onClick={() => {
            const subject = encodeURIComponent(`I have the ${listing.name} you're looking for!`);
            const body = encodeURIComponent(
              `Hi ${listing.ownerDisplayName ?? "there"},\n\nI saw your "Looking For" post on DexPoky for ${listing.name}${listing.setName ? ` (${listing.setName})` : ""}. I might have one available!\n\nLet me know if you're still interested.`
            );
            window.open(`mailto:?subject=${subject}&body=${body}`);
          }}
        >
          <Mail className="h-4 w-4 mr-2" />
          I have this card — contact
        </Button>
      </div>
    </Layout>
  );
}

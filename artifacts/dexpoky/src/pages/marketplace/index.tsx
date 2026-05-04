import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useListListings, ListListingsStatus,
  useListWantedListings,
  useDeleteWantedListing,
} from "@workspace/api-client-react";
import type { WantedListing } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Store, ArrowRight, Gavel, Heart, X, Mail } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Show, useUser } from "@clerk/react";
import { formatCurrency, formatLabel, RARITY_COLORS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { isPast } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type AuctionListing = {
  listingType?: string;
  currentBid?: number | null;
  auctionEndTime?: string | null;
};

function WantedCard({ item, currentUserId }: { item: WantedListing; currentUserId?: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const deleteWanted = useDeleteWantedListing({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/wanted"] });
        toast.success("Removed from Looking For");
      },
      onError: () => toast.error("Failed to remove"),
    },
  });

  const isOwner = currentUserId === item.ownerClerkId;

  return (
    <>
      <div
        className="bg-card border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col h-full group relative"
        onClick={() => setOpen(true)}
      >
        {isOwner && (
          <button
            type="button"
            className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              deleteWanted.mutate({ id: item.id });
            }}
            title="Remove"
          >
            <X className="h-3.5 w-3.5 text-white" />
          </button>
        )}

        <div className="aspect-[3/4] bg-rose-50 border-b relative overflow-hidden">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Heart className="h-10 w-10 text-rose-300" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-rose-900/30 to-transparent" />
          <div className="absolute bottom-2 left-2">
            <Badge className="text-[10px] uppercase font-bold tracking-wider border-0 bg-rose-500 text-white">
              <Heart className="h-2.5 w-2.5 mr-0.5 fill-white/60" />
              Wanted
            </Badge>
          </div>
        </div>

        <div className="p-3 flex flex-col flex-1">
          <h3 className="font-bold text-foreground line-clamp-1 text-sm">{item.name}</h3>
          <p className="text-xs text-muted-foreground mb-2">{item.pokemonName}</p>

          {item.ownerDisplayName && (
            <div className="flex items-center gap-1.5 mt-auto">
              {item.ownerImageUrl ? (
                <img src={item.ownerImageUrl} alt={item.ownerDisplayName} className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-rose-200 flex items-center justify-center text-rose-700 text-[9px] font-bold">
                  {item.ownerDisplayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs text-muted-foreground truncate">{item.ownerDisplayName}</span>
            </div>
          )}

          {item.maxPrice != null && (
            <div className="mt-2">
              <div className="text-base font-black text-rose-600">Up to ${Number(item.maxPrice).toFixed(2)}</div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-rose-500 fill-rose-200" />
              Looking For
            </DialogTitle>
            <DialogDescription>
              Someone is searching for this card
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-4 py-2">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.name} className="w-16 h-20 object-contain rounded shrink-0" />
            ) : (
              <div className="w-16 h-20 rounded bg-muted shrink-0 flex items-center justify-center">
                <Heart className="h-6 w-6 text-rose-300" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold">{item.name}</p>
              <p className="text-sm text-muted-foreground">{item.pokemonName}</p>
              {item.setName && <p className="text-xs text-muted-foreground">{item.setName}</p>}
              {item.rarity && (
                <Badge className={`mt-1 text-[10px] border-0 ${RARITY_COLORS[item.rarity] || ""}`}>
                  {formatLabel(item.rarity)}
                </Badge>
              )}
            </div>
          </div>

          {item.maxPrice != null && (
            <div className="flex items-center justify-between bg-rose-50 rounded-xl px-4 py-2.5 border border-rose-100">
              <span className="text-sm font-medium text-rose-700">Budget</span>
              <span className="text-lg font-black text-rose-600">Up to ${Number(item.maxPrice).toFixed(2)}</span>
            </div>
          )}

          {item.notes && (
            <div className="bg-muted/40 rounded-xl px-4 py-3 border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Note from buyer</p>
              <p className="text-sm">{item.notes}</p>
            </div>
          )}

          {item.ownerDisplayName && (
            <div className="flex items-center gap-2.5 pt-1">
              {item.ownerImageUrl ? (
                <img src={item.ownerImageUrl} alt={item.ownerDisplayName} className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-rose-200 flex items-center justify-center text-rose-700 text-sm font-bold">
                  {item.ownerDisplayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold">{item.ownerDisplayName}</p>
                <p className="text-xs text-muted-foreground">is looking for this card</p>
              </div>
            </div>
          )}

          {!isOwner && (
            <Button
              className="w-full bg-rose-500 hover:bg-rose-600 text-white"
              onClick={() => {
                const subject = encodeURIComponent(`I have the ${item.name} you're looking for!`);
                const body = encodeURIComponent(
                  `Hi ${item.ownerDisplayName ?? "there"},\n\nI saw your "Looking For" post on DexPoky for ${item.name}${item.setName ? ` (${item.setName})` : ""}. I might have one available!\n\nLet me know if you're still interested.`
                );
                window.open(`mailto:?subject=${subject}&body=${body}`);
              }}
            >
              <Mail className="h-4 w-4 mr-2" />
              Contact via Email
            </Button>
          )}

          {isOwner && (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                deleteWanted.mutate({ id: item.id });
                setOpen(false);
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Remove My Request
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Marketplace() {
  const [search, setSearch] = useState("");
  const { user } = useUser();

  const { data: listings, isLoading } = useListListings({
    status: ListListingsStatus.active,
    search: search || undefined,
  });

  const { data: wantedListings, isLoading: wantedLoading } = useListWantedListings({
    search: search || undefined,
  });

  return (
    <Layout>
      <Show when="signed-out">
        <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-background border-b">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
            <img
              src="/logo.png"
              alt="DexPoky"
              className="h-32 w-32 sm:h-40 sm:w-40 object-contain mx-auto mb-6 drop-shadow-xl"
            />
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
              Welcome to <span className="text-primary">DexPoky</span>!
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
              Scan, manage, track and sell your cards anywhere!
            </p>
            <Link href="/sign-up">
              <Button size="lg" className="h-12 px-8 text-base font-semibold shadow-md">
                Join Free <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </Show>

      <Show when="signed-in">
        <div className="bg-primary/5 border-b">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="flex items-center gap-4 text-primary mb-4">
              <Store className="h-8 w-8" />
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Global Marketplace</h1>
            </div>
            <p className="text-lg text-muted-foreground max-w-2xl mb-8">
              Buy, sell, and discover rare cards from collectors around the world.
            </p>
            <div className="relative max-w-xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search for specific cards, sets, or pokemon..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-12 py-6 text-lg bg-background border-border shadow-sm rounded-xl"
              />
            </div>
          </div>
        </div>
      </Show>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">

        {/* ── Active Listings ── */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold tracking-tight">Active Listings</h2>
            <div className="text-sm text-muted-foreground">{listings?.length || 0} items available</div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
              ))}
            </div>
          ) : listings && listings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {listings.map(listing => {
                const ext = listing as typeof listing & AuctionListing;
                const isAuction = ext.listingType === "auction";
                const auctionEnded = isAuction && ext.auctionEndTime && isPast(new Date(ext.auctionEndTime));
                const displayPrice = isAuction ? (ext.currentBid ?? listing.price) : listing.price;
                return (
                  <Link key={listing.id} href={`/marketplace/${listing.id}`}>
                    <div className="bg-card border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col h-full group">
                      <div className="aspect-[3/4] bg-muted/50 border-b relative overflow-hidden">
                        {listing.card.imageUrl ? (
                          <img src={listing.card.imageUrl} alt={listing.card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground">No Image</div>
                        )}
                        <div className="absolute bottom-2 left-2 flex gap-1 flex-wrap">
                          <Badge className={`text-[10px] uppercase font-bold tracking-wider border-0 ${RARITY_COLORS[listing.card.rarity] || ""}`}>
                            {formatLabel(listing.card.rarity)}
                          </Badge>
                          {isAuction && (
                            <Badge className="text-[10px] uppercase font-bold tracking-wider border-0 bg-amber-500 text-white">
                              <Gavel className="h-2.5 w-2.5 mr-0.5" />
                              {auctionEnded ? "Ended" : "Live"}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="p-4 flex flex-col flex-1">
                        <h3 className="font-bold text-foreground line-clamp-1">{listing.card.name}</h3>
                        <p className="text-sm text-muted-foreground mb-3">{listing.card.pokemonName}</p>
                        <div className="mt-auto flex items-end justify-between">
                          <div>
                            {isAuction && (
                              <p className="text-[10px] text-muted-foreground uppercase font-medium">
                                {ext.currentBid ? "Current bid" : "Starting"}
                              </p>
                            )}
                            <div className="text-xl font-black text-primary">{formatCurrency(displayPrice)}</div>
                          </div>
                          <Button size="sm" variant="secondary" className="rounded-full shrink-0">
                            {isAuction ? <Gavel className="mr-1 w-3 h-3" /> : null}
                            {isAuction ? "Bid" : "View"} <ArrowRight className="ml-1 w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20 px-4 border-2 border-dashed rounded-xl bg-muted/5">
              <Store className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-4" />
              <h3 className="text-xl font-bold mb-2">No listings found</h3>
              <p className="text-muted-foreground mb-6">
                {search ? "No cards match your search criteria." : "There are currently no cards for sale in the marketplace."}
              </p>
              <Link href="/sell">
                <Button>List a Card for Sale</Button>
              </Link>
            </div>
          )}
        </div>

        {/* ── Looking For ── */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Heart className="h-6 w-6 text-rose-500 fill-rose-100" />
              <h2 className="text-2xl font-bold tracking-tight">Looking For</h2>
              <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-xs">
                {wantedListings?.length || 0}
              </Badge>
            </div>
            <Show when="signed-in">
              <Link href="/share">
                <Button variant="outline" size="sm" className="border-rose-200 text-rose-600 hover:bg-rose-50">
                  <Heart className="h-3.5 w-3.5 mr-1.5" />
                  Post a Request
                </Button>
              </Link>
            </Show>
          </div>

          <p className="text-sm text-muted-foreground mb-6">
            Collectors broadcasting cards they want to buy — have one? Reach out!
          </p>

          {wantedLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
              ))}
            </div>
          ) : wantedListings && wantedListings.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {wantedListings.map(item => (
                <WantedCard key={item.id} item={item} currentUserId={user?.id} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 px-4 border-2 border-dashed border-rose-100 rounded-xl bg-rose-50/30">
              <Heart className="h-10 w-10 mx-auto text-rose-300 mb-3" />
              <h3 className="text-lg font-bold mb-1 text-rose-700">No requests yet</h3>
              <p className="text-sm text-rose-500 mb-4">
                {search ? "No wanted cards match your search." : "Be the first to post a card you're looking for!"}
              </p>
              <Show when="signed-in">
                <Link href="/share">
                  <Button className="bg-rose-500 hover:bg-rose-600 text-white">
                    <Heart className="h-4 w-4 mr-2" />
                    Post a Request
                  </Button>
                </Link>
              </Show>
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}

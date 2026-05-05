import { useState } from "react";
import { useCardSize } from "@/hooks/useCardSize";
import { CardSizeSlider } from "@/components/card-size-slider";
import { Layout } from "@/components/layout";
import {
  useListListings, ListListingsStatus,
  useListWantedListings,
  useDeleteWantedListing,
  useUpdateWantedListing,
  useListCategories,
} from "@workspace/api-client-react";
import type { WantedListing, Category } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Store, ArrowRight, Gavel, Heart, X, MessageSquare, CheckCircle, FolderOpen, ChevronLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
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
import { ContactSellerDialog } from "@/components/contact-seller-dialog";
import { WelcomeModal } from "@/components/welcome-modal";

type AuctionListing = {
  listingType?: string;
  currentBid?: number | null;
  auctionEndTime?: string | null;
};

function WantedCard({ item, currentUserId }: { item: WantedListing; currentUserId?: string }) {
  const [open, setOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [found, setFound] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [confirmCategoryId, setConfirmCategoryId] = useState<number | null>(null);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: categories = [] } = useListCategories();

  const deleteWanted = useDeleteWantedListing({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/wanted"] });
        toast.success("Removed from Looking For");
      },
      onError: () => toast.error("Failed to remove"),
    },
  });
  const markFound = useUpdateWantedListing({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/wanted"] });
        setFound(true);
        setTimeout(() => {
          setOpen(false);
          setFound(false);
          setConfirmStep(false);
        }, 1600);
      },
      onError: () => toast.error("Failed to update"),
    },
  });

  const doMarkFound = (andNavigate: boolean) => {
    markFound.mutate({ id: item.id, data: { status: "closed" } });
    if (andNavigate) {
      const params = new URLSearchParams({
        name: item.name,
        pokemonName: item.pokemonName,
        catalogCardId: item.catalogCardId,
      });
      if (item.setName) params.set("setName", item.setName);
      if (item.cardNumber) params.set("cardNumber", item.cardNumber);
      if (item.imageUrl) params.set("imageUrl", item.imageUrl);
      if (confirmCategoryId) params.set("categoryId", String(confirmCategoryId));
      navigate(`/collection/new?${params.toString()}`);
    }
  };

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
          <p className="text-xs text-muted-foreground">{item.pokemonName}</p>
          {item.setName && (
            <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">{item.setName}</p>
          )}
          {item.notes && (
            <p className="text-[10px] text-muted-foreground italic line-clamp-2 mt-1 leading-snug">{item.notes}</p>
          )}

          {item.ownerDisplayName && (
            <div className="flex items-center gap-1.5 mt-auto pt-2">
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
            <div className="mt-1.5">
              <div className="text-base font-black text-rose-600">Up to ${Number(item.maxPrice).toFixed(2)}</div>
            </div>
          )}
        </div>
      </div>

      {currentUserId && (
        <ContactSellerDialog
          open={contactOpen}
          onOpenChange={setContactOpen}
          item={item}
        />
      )}

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

          {!isOwner && currentUserId && (
            <Button
              className="w-full bg-rose-500 hover:bg-rose-600 text-white"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                setContactOpen(true);
              }}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Message Buyer
            </Button>
          )}

          {!isOwner && !currentUserId && (
            <Link href="/sign-in">
              <Button className="w-full bg-rose-500 hover:bg-rose-600 text-white" onClick={() => setOpen(false)}>
                <MessageSquare className="h-4 w-4 mr-2" />
                Sign in to Message Buyer
              </Button>
            </Link>
          )}

          {isOwner && !found && !confirmStep && (
            <div className="flex flex-col gap-2">
              <Button
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={() => { setConfirmStep(true); setConfirmCategoryId(null); }}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                I Got This!
              </Button>
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
            </div>
          )}

          {isOwner && !found && confirmStep && (
            <div className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-emerald-800">You actually got this card? 🎉</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  This will close your request. Want to add it to your collection too?
                </p>
              </div>

              {categories.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5" /> Add to category
                    <span className="normal-case font-normal">(optional)</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmCategoryId(null)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        confirmCategoryId === null
                          ? "bg-primary text-white border-primary"
                          : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted/60"
                      }`}
                    >
                      None
                    </button>
                    {categories.map((cat: Category) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setConfirmCategoryId(cat.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                          confirmCategoryId === cat.id
                            ? "bg-primary text-white border-primary"
                            : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted/60"
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Button
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={() => doMarkFound(true)}
                disabled={markFound.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {markFound.isPending ? "Saving…" : "Yes! Add to my collection"}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => doMarkFound(false)}
                disabled={markFound.isPending}
              >
                Just mark as found
              </Button>
              <button
                type="button"
                onClick={() => setConfirmStep(false)}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 flex items-center justify-center gap-1"
              >
                <ChevronLeft className="h-3 w-3" /> Back
              </button>
            </div>
          )}

          {isOwner && found && (
            <div className="flex flex-col items-center gap-1 py-2">
              <CheckCircle className="h-8 w-8 text-emerald-500" />
              <p className="font-semibold text-emerald-700">Marked as found!</p>
              <p className="text-sm text-muted-foreground">Your request has been closed.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Marketplace() {
  const [search, setSearch] = useState("");
  const [cardSize, setCardSize, gridClass] = useCardSize();
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
        <WelcomeModal />
      </Show>

      <Show when="signed-in">
        <div className="bg-primary/5 border-b">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="flex items-center gap-3 mb-4">
              <Store className="h-7 w-7 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Global Marketplace</h1>
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
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Listings</h2>
            <div className="flex items-center gap-4">
              <CardSizeSlider value={cardSize} onChange={setCardSize} />
              <div className="text-sm text-muted-foreground">{listings?.length || 0} items available</div>
            </div>
          </div>

          {isLoading ? (
            <div className={`grid ${gridClass} gap-4`}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
              ))}
            </div>
          ) : listings && listings.length > 0 ? (
            <div className={`grid ${gridClass} gap-4`}>
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
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Looking For</h2>
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
            <div className={`grid ${gridClass} gap-4`}>
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
              ))}
            </div>
          ) : wantedListings && wantedListings.length > 0 ? (
            <div className={`grid ${gridClass} gap-4`}>
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

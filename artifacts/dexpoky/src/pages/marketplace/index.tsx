import { useState } from "react";
import { Layout } from "@/components/layout";
import { useListListings, ListListingsStatus } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Store, ArrowRight, Gavel, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Show } from "@clerk/react";
import { formatCurrency, formatLabel, RARITY_COLORS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { isPast } from "date-fns";

type AuctionListing = {
  listingType?: string;
  currentBid?: number | null;
  auctionEndTime?: string | null;
};

export default function Marketplace() {
  const [search, setSearch] = useState("");

  const { data: listings, isLoading } = useListListings({
    status: ListListingsStatus.active,
    search: search || undefined,
  });

  return (
    <Layout>
      <Show when="signed-out">
        <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-background border-b">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary text-primary-foreground shadow-lg mb-6">
              <Sparkles className="h-7 w-7" />
            </div>
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

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
    </Layout>
  );
}

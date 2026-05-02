import { Layout } from "@/components/layout";
import { useGetListing, useUpdateListing, UpdateListingBodyStatus } from "@workspace/api-client-react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatLabel, CONDITION_COLORS, RARITY_COLORS } from "@/lib/constants";
import { ArrowLeft, ShoppingCart, Info, Eye, Clock } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function ListingDetail() {
  const [, params] = useRoute("/marketplace/:id");
  const id = params?.id ? parseInt(params.id) : 0;
  const [, setLocation] = useLocation();

  const { data: listing, isLoading } = useGetListing(id, {
    query: { enabled: !!id, queryKey: ['/api/listings', id] }
  });

  const updateListing = useUpdateListing();

  const handleBuy = () => {
    if (!listing) return;
    
    updateListing.mutate({
      id,
      data: {
        status: UpdateListingBodyStatus.sold
      }
    }, {
      onSuccess: () => {
        toast.success(`You purchased ${listing.card.name}!`);
        setLocation("/marketplace");
      },
      onError: () => toast.error("Failed to complete purchase")
    });
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

  return (
    <Layout>
      <div className="bg-background min-h-screen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20">
          <Button variant="ghost" onClick={() => setLocation("/marketplace")} className="mb-6 -ml-4 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Marketplace
          </Button>

          <div className="flex flex-col lg:flex-row gap-12">
            {/* Card Image Area */}
            <div className="w-full lg:w-1/2 lg:max-w-md mx-auto">
              <div className="relative aspect-[3/4] bg-muted/30 border rounded-2xl overflow-hidden shadow-2xl">
                {card.imageUrl ? (
                  <img 
                    src={card.imageUrl} 
                    alt={card.name} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">No Image Available</div>
                )}
                <div className="absolute top-4 right-4 flex gap-2">
                  {listing.status === "sold" && (
                    <Badge className="bg-destructive text-white font-bold shadow-lg text-sm px-3 py-1">
                      SOLD
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Details Area */}
            <div className="w-full lg:w-1/2 flex flex-col">
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <Badge variant="outline" className="text-xs text-muted-foreground bg-background">
                    <Clock className="w-3 h-3 mr-1" />
                    Listed {formatDistanceToNow(new Date(listing.createdAt))} ago
                  </Badge>
                  <Badge variant="outline" className="text-xs text-muted-foreground bg-background">
                    <Eye className="w-3 h-3 mr-1" />
                    {listing.viewCount} views
                  </Badge>
                </div>
                <h1 className="text-4xl font-black tracking-tight text-foreground mb-2">{card.name}</h1>
                <p className="text-xl text-muted-foreground font-medium">
                  {card.pokemonName} {card.setName ? `• ${card.setName}` : ""}
                  {card.cardNumber && <span className="ml-2 text-sm bg-secondary px-2 py-1 rounded text-foreground">{card.cardNumber}</span>}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 mb-8">
                <Badge className={`text-sm px-3 py-1 border-0 shadow-sm ${RARITY_COLORS[card.rarity] || ""}`}>
                  {formatLabel(card.rarity)}
                </Badge>
                <Badge variant="outline" className={`text-sm px-3 py-1 ${CONDITION_COLORS[card.condition] || ""}`}>
                  {formatLabel(card.condition)} Condition
                </Badge>
              </div>

              <div className="bg-card border shadow-md rounded-2xl p-8 mb-8 border-primary/20">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-primary uppercase tracking-wider mb-1">Buy it now</p>
                    <h2 className="text-5xl font-black tracking-tighter text-foreground">
                      {formatCurrency(listing.price)}
                    </h2>
                  </div>
                  <Button 
                    size="lg" 
                    className="h-14 px-8 text-lg font-bold shadow-lg"
                    disabled={listing.status !== "active" || updateListing.isPending}
                    onClick={handleBuy}
                  >
                    <ShoppingCart className="w-5 h-5 mr-2" />
                    {listing.status === "active" ? "Purchase Card" : "Unavailable"}
                  </Button>
                </div>
              </div>

              <div className="space-y-6 flex-1">
                {listing.description && (
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
                      <Info className="w-4 h-4 text-primary" /> Seller's Description
                    </h3>
                    <div className="bg-muted/30 p-5 rounded-xl border text-sm leading-relaxed">
                      {listing.description}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-bold mb-3 border-b pb-2">Card Information</h3>
                  <div className="grid grid-cols-2 gap-y-4 text-sm bg-muted/10 p-5 rounded-xl border">
                    <div className="text-muted-foreground font-medium">Estimated Value</div>
                    <div className="font-bold text-right">{formatCurrency(card.estimatedValue)}</div>
                    
                    <div className="text-muted-foreground font-medium">Rarity</div>
                    <div className="font-medium text-right capitalize">{formatLabel(card.rarity)}</div>
                    
                    <div className="text-muted-foreground font-medium">Condition</div>
                    <div className="font-medium text-right capitalize">{formatLabel(card.condition)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
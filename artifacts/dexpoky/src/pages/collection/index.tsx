import { useState } from "react";
import { useListCards, useListCategories, CardRarity, CardCondition } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { CardItem } from "@/components/ui/card-item";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, SlidersHorizontal, X, Share2 } from "lucide-react";
import { ShareModal } from "@/components/share-modal";
import { Link } from "wouter";
import { formatLabel } from "@/lib/constants";

export default function Collection() {
  const [search, setSearch] = useState("");
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string>("all");
  const [rarity, setRarity] = useState<string>("all");
  const [condition, setCondition] = useState<string>("all");
  const [forSale, setForSale] = useState<string>("all");

  const { data: categories } = useListCategories();

  const { data: cards, isLoading } = useListCards({
    search: search || undefined,
    categoryId: categoryId !== "all" ? parseInt(categoryId) : undefined,
    rarity: rarity !== "all" ? rarity : undefined,
    forSale: forSale === "all" ? undefined : forSale === "yes",
  });

  const filteredCards = cards?.filter(card => {
    if (condition !== "all" && card.condition !== condition) return false;
    return true;
  });

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">My Collection</h1>
            <p className="text-muted-foreground">Manage and track all your Pokémon cards</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" className="gap-2" onClick={() => setIsShareOpen(true)}>
              <Share2 className="h-4 w-4" /> Share
            </Button>
            <Link href="/collection/new">
              <Button className="gap-2 shadow-md hover:shadow-lg transition-all">
                <Plus className="h-4 w-4" /> Add Card
              </Button>
            </Link>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-4 shadow-sm mb-8">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by Pokémon or set name..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/50 border-border/50"
              />
            </div>
            <div className="flex flex-wrap gap-2 lg:flex-nowrap">
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-[140px] bg-background/50 border-border/50">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map(c => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={rarity} onValueChange={setRarity}>
                <SelectTrigger className="w-[140px] bg-background/50 border-border/50">
                  <SelectValue placeholder="Rarity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Rarities</SelectItem>
                  {Object.values(CardRarity).map(r => (
                    <SelectItem key={r} value={r}>{formatLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger className="w-[140px] bg-background/50 border-border/50">
                  <SelectValue placeholder="Condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Conditions</SelectItem>
                  {Object.values(CardCondition).map(c => (
                    <SelectItem key={c} value={c}>{formatLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={forSale} onValueChange={setForSale}>
                <SelectTrigger className="w-[150px] bg-background/50 border-border/50">
                  <SelectValue placeholder="For Sale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cards</SelectItem>
                  <SelectItem value="yes">For Sale</SelectItem>
                  <SelectItem value="no">Not For Sale</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(search || categoryId !== "all" || rarity !== "all" || condition !== "all" || forSale !== "all") && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setCategoryId("all");
                  setRarity("all");
                  setCondition("all");
                  setForSale("all");
                }}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <X className="h-4 w-4 mr-2" /> Clear
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
              <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
            ))}
          </div>
        ) : filteredCards && filteredCards.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {filteredCards.map(card => (
              <CardItem key={card.id} card={card} href={`/collection/${card.id}`} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 px-4 border-2 border-dashed rounded-xl bg-muted/5">
            <SlidersHorizontal className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-4" />
            <h3 className="text-xl font-bold mb-2">No cards found</h3>
            <p className="text-muted-foreground mb-6">
              {search || categoryId !== "all" || rarity !== "all" ? 
                "Try adjusting your filters to find what you're looking for." : 
                "Your collection is empty. Start adding some cards!"}
            </p>
            {!(search || categoryId !== "all" || rarity !== "all") && (
              <Link href="/collection/new">
                <Button size="lg" className="shadow-md">Add Your First Card</Button>
              </Link>
            )}
          </div>
        )}
      </div>
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        target={{ type: "collection", cardCount: filteredCards?.length }}
      />
    </Layout>
  );
}
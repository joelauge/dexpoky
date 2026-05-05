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
import { Search, Plus, SlidersHorizontal, X, Share2, ArrowUpDown, Library } from "lucide-react";
import { ShareModal } from "@/components/share-modal";
import { Link } from "wouter";
import { formatLabel } from "@/lib/constants";

type SortKey =
  | "date_new"
  | "date_old"
  | "value_high"
  | "value_low"
  | "name_az"
  | "pokemon_az"
  | "rarity_high"
  | "condition_best";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "date_new", label: "Date added (newest)" },
  { value: "date_old", label: "Date added (oldest)" },
  { value: "value_high", label: "Value (high to low)" },
  { value: "value_low", label: "Value (low to high)" },
  { value: "name_az", label: "Name (A–Z)" },
  { value: "pokemon_az", label: "Pokémon (A–Z)" },
  { value: "rarity_high", label: "Rarity (rarest first)" },
  { value: "condition_best", label: "Condition (best first)" },
];

// Higher index = rarer / better
const RARITY_ORDER: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  holo_rare: 3,
  ultra_rare: 4,
  secret_rare: 5,
  promo: 6,
};
const CONDITION_ORDER: Record<string, number> = {
  mint: 6,
  near_mint: 5,
  excellent: 4,
  good: 3,
  light_played: 2,
  played: 1,
  poor: 0,
};

export default function Collection() {
  const [search, setSearch] = useState("");
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string>("all");
  const [rarity, setRarity] = useState<string>("all");
  const [condition, setCondition] = useState<string>("all");
  const [forSale, setForSale] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("date_new");

  const { data: categories } = useListCategories();

  const { data: cards, isLoading } = useListCards({
    search: search || undefined,
    categoryId: categoryId !== "all" ? parseInt(categoryId) : undefined,
    rarity: rarity !== "all" ? rarity : undefined,
    forSale: forSale === "all" ? undefined : forSale === "yes",
  });

  const filteredCards = cards
    ?.filter((card) => {
      if (condition !== "all" && card.condition !== condition) return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      const av = a.estimatedValue == null ? null : Number(a.estimatedValue);
      const bv = b.estimatedValue == null ? null : Number(b.estimatedValue);
      switch (sort) {
        case "date_new":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "date_old":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "value_high":
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return bv - av;
        case "value_low":
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return av - bv;
        case "name_az":
          return a.name.localeCompare(b.name);
        case "pokemon_az":
          return a.pokemonName.localeCompare(b.pokemonName);
        case "rarity_high":
          return (RARITY_ORDER[b.rarity] ?? -1) - (RARITY_ORDER[a.rarity] ?? -1);
        case "condition_best":
          return (CONDITION_ORDER[b.condition] ?? -1) - (CONDITION_ORDER[a.condition] ?? -1);
        default:
          return 0;
      }
    });

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Library className="h-7 w-7 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">My Collection</h1>
            </div>
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

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-4 border-t border-border/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowUpDown className="h-4 w-4" />
              <span>Sort by</span>
            </div>
            <div className="flex items-center gap-3">
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="w-full sm:w-[220px] bg-background/50 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filteredCards && (
                <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline">
                  {filteredCards.length} card{filteredCards.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
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
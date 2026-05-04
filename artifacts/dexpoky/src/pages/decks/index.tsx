import { Layout } from "@/components/layout";
import { useListDecks, useDeleteDeck } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Sparkles, Layers, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { RulesSheet } from "@/components/rules-sheet";

const STYLE_LABELS: Record<string, string> = {
  aggro: "Aggro",
  control: "Control",
  midrange: "Midrange",
  combo: "Combo",
  mill: "Mill",
  tank: "Tank",
};

const STYLE_COLORS: Record<string, string> = {
  aggro: "bg-red-100 text-red-700 border-red-200",
  control: "bg-blue-100 text-blue-700 border-blue-200",
  midrange: "bg-purple-100 text-purple-700 border-purple-200",
  combo: "bg-amber-100 text-amber-700 border-amber-200",
  mill: "bg-emerald-100 text-emerald-700 border-emerald-200",
  tank: "bg-slate-200 text-slate-700 border-slate-300",
};

export default function Decks() {
  const { data: decks, isLoading } = useListDecks();
  const deleteDeck = useDeleteDeck();
  const queryClient = useQueryClient();

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Delete deck "${name}"? This cannot be undone.`)) return;
    deleteDeck.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success("Deck deleted");
          queryClient.invalidateQueries({ queryKey: ["/api/decks"] });
        },
        onError: () => toast.error("Failed to delete deck"),
      },
    );
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
              <Layers className="h-8 w-8 text-primary" />
              Decks
            </h1>
            <p className="text-muted-foreground">
              Build decks from your collection — get AI-powered suggestions tuned to your favorite play style.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <RulesSheet
              defaultSectionId="deck-building"
              quickLinks={[
                { sectionId: "deck-building", label: "Deck Building" },
                { sectionId: "card-types", label: "Card Types" },
                { sectionId: "setup", label: "Game Setup" },
              ]}
            />
            <Link href="/decks/new">
              <Button className="shadow-md gap-2">
                <Sparkles className="h-4 w-4" />
                New AI Deck
              </Button>
            </Link>
            <Link href="/decks/new?manual=1">
              <Button variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Manual
              </Button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : !decks || decks.length === 0 ? (
          <div className="border-2 border-dashed rounded-2xl p-10 text-center bg-muted/20">
            <Layers className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No decks yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Create your first deck. We'll use your scanned collection and AI to suggest a competitive list for the play style of your choice.
            </p>
            <Link href="/decks/new">
              <Button className="gap-2">
                <Sparkles className="h-4 w-4" /> Build my first deck
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {decks.map((deck) => (
              <Card key={deck.id} className="group overflow-hidden hover:shadow-md transition-shadow">
                <Link href={`/decks/${deck.id}`}>
                  <div className="aspect-[16/9] relative bg-gradient-to-br from-muted/40 to-muted/10 border-b cursor-pointer">
                    {deck.coverImageUrl ? (
                      <img
                        src={deck.coverImageUrl}
                        alt={deck.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <img src="/logo.png" alt="" aria-hidden className="w-3/5 max-w-[120px] opacity-[0.12] grayscale select-none pointer-events-none" />
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      <Badge className={`border ${STYLE_COLORS[deck.gameStyle] ?? ""}`}>
                        {STYLE_LABELS[deck.gameStyle] ?? deck.gameStyle}
                      </Badge>
                    </div>
                  </div>
                </Link>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/decks/${deck.id}`} className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate cursor-pointer hover:text-primary transition-colors">
                        {deck.name}
                      </CardTitle>
                    </Link>
                    <button
                      onClick={() => handleDelete(deck.id, deck.name)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1 -m-1"
                      aria-label="Delete deck"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <CardDescription className="line-clamp-2 text-xs">
                    {deck.description ?? deck.strategy ?? "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-xs text-muted-foreground">
                    {deck.totalCount} card{deck.totalCount === 1 ? "" : "s"} ({deck.cardCount} unique)
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

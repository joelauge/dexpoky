import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useListCards,
  useListWishlist,
  useSuggestDeck,
  useCreateDeck,
  CreateDeckBodyGameStyle,
  type SuggestedDeckCard,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  ArrowLeft,
  Wand2,
  Check,
  ImageIcon,
  Zap,
  ShieldHalf,
  Scale,
  Target,
  Layers,
  HeartPulse,
  Heart,
  type LucideIcon,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { RulesSheet } from "@/components/rules-sheet";

const STYLES: Array<{
  value: keyof typeof CreateDeckBodyGameStyle;
  label: string;
  desc: string;
  Icon: LucideIcon;
  iconClass: string;
}> = [
  { value: "aggro",    label: "Aggro",    desc: "Fast attackers, win quickly", Icon: Zap,        iconClass: "text-amber-500" },
  { value: "control",  label: "Control",  desc: "Disruption + outlast",        Icon: ShieldHalf, iconClass: "text-sky-600" },
  { value: "midrange", label: "Midrange", desc: "Balanced & flexible",         Icon: Scale,      iconClass: "text-indigo-600" },
  { value: "combo",    label: "Combo",    desc: "Multi-card synergies",        Icon: Target,     iconClass: "text-rose-500" },
  { value: "mill",     label: "Mill",     desc: "Deck out the opponent",       Icon: Layers,     iconClass: "text-slate-500" },
  { value: "tank",     label: "Tank",     desc: "High HP + healing",           Icon: HeartPulse, iconClass: "text-emerald-600" },
];

/**
 * Each suggested card is keyed by source + id (cardId for owned, wishlistItemId
 * for wishlist) since cardId can be null for wishlist suggestions.
 */
function suggestionKey(s: SuggestedDeckCard): string {
  if (s.source === "owned") return `owned:${s.cardId}`;
  return `wishlist:${s.wishlistItemId}`;
}

export default function NewDeck() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const isManual = params.get("manual") === "1";

  const queryClient = useQueryClient();
  const { data: cards, isLoading: cardsLoading } = useListCards();
  const { data: wishlist } = useListWishlist();
  const suggestDeck = useSuggestDeck();
  const createDeck = useCreateDeck();

  const [gameStyle, setGameStyle] =
    useState<keyof typeof CreateDeckBodyGameStyle>("midrange");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [strategy, setStrategy] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<SuggestedDeckCard[] | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [hasSuggested, setHasSuggested] = useState(false);

  const hasAnyPool =
    (cards && cards.length > 0) || (wishlist && wishlist.length > 0);

  const handleSuggest = () => {
    if (!hasAnyPool) {
      toast.error("Add some cards to your collection or wishlist first");
      return;
    }
    suggestDeck.mutate(
      { data: { gameStyle, notes: notes.trim() || null } },
      {
        onSuccess: (data) => {
          setHasSuggested(true);
          setName(data.name);
          setStrategy(data.strategy);
          setSuggested(data.cards);
          setSelectedKeys(new Set(data.cards.map(suggestionKey)));
          toast.success(`AI built a ${STYLES.find((s) => s.value === gameStyle)?.label} deck`);
        },
        onError: (err) => {
          const msg =
            err instanceof Error ? err.message : "Could not generate suggestion";
          toast.error(msg);
        },
      },
    );
  };

  const toggleCard = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Deck name is required");
      return;
    }
    // Build source-aware card entries the new /api/decks endpoint understands.
    const cardsPayload = (suggested ?? [])
      .filter((s) => selectedKeys.has(suggestionKey(s)))
      .map((s) => {
        const base = {
          source: s.source,
          count: s.count,
          role: s.role ?? null,
          notes: s.reason ?? null,
        };
        if (s.source === "wishlist") {
          return { ...base, wishlistItemId: s.wishlistItemId };
        }
        return { ...base, cardId: s.cardId };
      });

    createDeck.mutate(
      {
        data: {
          name: name.trim(),
          gameStyle,
          strategy: strategy ?? null,
          description: notes.trim() || null,
          cards: cardsPayload,
        } as never,
      },
      {
        onSuccess: (deck) => {
          queryClient.invalidateQueries({ queryKey: ["/api/decks"] });
          toast.success("Deck saved");
          setLocation(`/decks/${deck.id}`);
        },
        onError: () => toast.error("Could not save deck"),
      },
    );
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-4 gap-2">
          <Link href="/decks">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Back to decks
            </Button>
          </Link>
          <RulesSheet
            defaultSectionId="deck-building"
            quickLinks={[
              { sectionId: "deck-building", label: "Deck Building" },
              { sectionId: "card-types", label: "Card Types" },
              { sectionId: "setup", label: "Game Setup" },
            ]}
          />
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-primary" />
          {isManual ? "New deck" : "AI Deck Builder"}
        </h1>
        <p className="text-muted-foreground mb-8">
          {isManual
            ? "Pick a play style and name your deck. You can add cards on the deck page."
            : "Choose a play style and we'll suggest the best deck composition from your collection."}
        </p>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. Play style</CardTitle>
              <CardDescription>
                What's the win condition? This shapes the AI's recommendations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {STYLES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setGameStyle(s.value)}
                    className={`text-left p-3 rounded-xl border-2 transition-all ${
                      gameStyle === s.value
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <s.Icon className={`h-5 w-5 ${s.iconClass}`} aria-hidden="true" />
                      <span className="font-semibold">{s.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {!isManual && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">2. Notes (optional)</CardTitle>
                <CardDescription>
                  Any constraints? Favorite Pokémon to include? Matchup you're targeting?
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Build around my Charizard, prefer fire-type attackers..."
                  rows={3}
                />
                <Button
                  onClick={handleSuggest}
                  disabled={suggestDeck.isPending || cardsLoading || !hasAnyPool}
                  className="mt-4 gap-2"
                  size="lg"
                >
                  <Wand2 className="h-4 w-4" />
                  {suggestDeck.isPending
                    ? "Building deck..."
                    : hasSuggested
                      ? "Regenerate suggestion"
                      : "Suggest a deck"}
                </Button>
                {!cardsLoading && !hasAnyPool && (
                  <p className="text-xs text-destructive mt-2">
                    Your collection and wishlist are both empty — add or scan some cards first.
                  </p>
                )}
                {!cardsLoading && wishlist && wishlist.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    The AI can pull from your {wishlist.length} wishlist card
                    {wishlist.length === 1 ? "" : "s"} to fill gaps.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {(isManual || hasSuggested) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {isManual ? "2. Name your deck" : "3. Review & save"}
                </CardTitle>
                {strategy && !isManual && (
                  <CardDescription className="text-sm leading-relaxed pt-2 text-foreground">
                    <strong className="text-primary">Strategy:</strong> {strategy}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="deck-name">Deck name</Label>
                  <Input
                    id="deck-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Charizard Aggro"
                    className="mt-1"
                  />
                </div>

                {!isManual && suggested && suggested.length > 0 && (
                  <div>
                    <Label>Suggested cards ({selectedKeys.size} selected)</Label>
                    <p className="text-xs text-muted-foreground mb-3">
                      Tap cards to include or exclude them. Pink badges are wishlist picks the AI added.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {suggested.map((s) => {
                        const key = suggestionKey(s);
                        const isSelected = selectedKeys.has(key);
                        const isWishlist = s.source === "wishlist";
                        return (
                          <button
                            key={key}
                            onClick={() => toggleCard(key)}
                            className={`text-left rounded-xl border-2 transition-all overflow-hidden ${
                              isSelected
                                ? "border-primary ring-2 ring-primary/20"
                                : "border-border opacity-60 hover:opacity-100"
                            }`}
                          >
                            <div className="aspect-[3/4] relative bg-muted/30">
                              {s.imageUrl ? (
                                <img
                                  src={s.imageUrl}
                                  alt={s.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                                  <ImageIcon className="h-8 w-8" />
                                </div>
                              )}
                              {isSelected && (
                                <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1 shadow-md">
                                  <Check className="h-3 w-3" />
                                </div>
                              )}
                              {s.role && (
                                <Badge
                                  variant="secondary"
                                  className="absolute bottom-2 left-2 text-[10px] capitalize"
                                >
                                  {s.role}
                                </Badge>
                              )}
                              {isWishlist && (
                                <span className="absolute bottom-2 right-2 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                                  <Heart className="h-2.5 w-2.5 fill-rose-500" /> Wishlist
                                </span>
                              )}
                            </div>
                            <div className="p-2">
                              <p className="text-xs font-semibold truncate">{s.name}</p>
                              {(s.setName || s.cardNumber) && (
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {s.setName ?? ""}
                                  {s.cardNumber ? ` · #${s.cardNumber}` : ""}
                                </p>
                              )}
                              <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">
                                {s.reason}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleCreate}
                  disabled={createDeck.isPending || !name.trim()}
                  size="lg"
                  className="w-full sm:w-auto gap-2"
                >
                  {createDeck.isPending ? "Saving..." : "Save deck"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}

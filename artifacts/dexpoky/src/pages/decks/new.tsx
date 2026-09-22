import { useState, useEffect } from "react";
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
  Zap,
  ShieldHalf,
  Scale,
  Target,
  Layers,
  HeartPulse,
  Heart,
  ShoppingBag,
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
 * Each suggested card is keyed by source + id. Owned/wishlist use the backing
 * record id. Catalog entries use their catalogCardId (or name fallback). For
 * shopping recommendations there is no id at all, so we fall back to the
 * position-stable index + name string. Shopping cards are never saved into the
 * deck (no IDs to link to), so their key is only used for React list keys.
 */
function AnimatedDots() {
  const [dots, setDots] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setDots(d => (d % 3) + 1), 500);
    return () => clearInterval(id);
  }, []);
  return <span className="inline-block w-5 text-left">{"•".repeat(dots)}</span>;
}

function suggestionKey(s: SuggestedDeckCard, index: number): string {
  if (s.source === "owned") return `owned:${s.cardId}`;
  if (s.source === "wishlist") return `wishlist:${s.wishlistItemId}`;
  if (s.source === "catalog") return `catalog:${s.catalogCardId ?? s.name}`;
  return `shopping:${index}:${s.name}`;
}

function SuggestionTile({
  suggestion: s,
  itemKey,
  selected,
  onToggle,
}: {
  suggestion: SuggestedDeckCard;
  itemKey: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const optional = s.source === "shopping" || s.source === "catalog" || s.source === "wishlist";
  const savable = s.source === "owned" || s.source === "wishlist";
  return (
    <button
      key={itemKey}
      onClick={() => savable && onToggle()}
      disabled={!savable}
      className={`text-left rounded-xl border-2 transition-all overflow-hidden ${
        !savable ? "border-amber-300 bg-amber-50/40 cursor-default" :
        selected ? "border-primary ring-2 ring-primary/20" : "border-border opacity-60 hover:opacity-100"
      }`}
    >
      <div className="aspect-[3/4] relative bg-muted/30">
        {s.imageUrl ? (
          <img src={s.imageUrl} alt={s.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {optional ? <ShoppingBag className="h-8 w-8 text-muted-foreground/40" /> :
              <img src="/logo.png" alt="" aria-hidden className="w-4/5 max-w-[96px] opacity-[0.12] grayscale select-none pointer-events-none" />}
          </div>
        )}
        {selected && (
          <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5 shadow-md">
            <Check className="h-2.5 w-2.5" />
          </div>
        )}
        {s.role && <Badge variant="secondary" className="absolute bottom-1.5 left-1.5 text-[9px] capitalize py-0 px-1">{s.role}</Badge>}
        {optional && (
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
            {s.source === "wishlist" ? <Heart className="h-2 w-2 fill-rose-500" /> : <ShoppingBag className="h-2 w-2" />}
            {s.source === "wishlist" ? "Wishlist" : "Optional"}
          </span>
        )}
        {s.count > 1 && <span className="absolute bottom-1.5 right-1.5 text-[9px] font-bold bg-primary/90 text-primary-foreground px-1 py-0.5 rounded-full">×{s.count}</span>}
      </div>
      <div className="p-1.5 space-y-1">
        <p className="text-[10px] font-semibold truncate leading-tight">{s.name}</p>
        <p className="text-[9px] text-muted-foreground line-clamp-2 leading-tight">{s.reason}</p>
        <p className={`text-[9px] font-medium ${s.uncertain ? "text-amber-700" : "text-emerald-700"}`}>
          {s.uncertain ? "Low confidence" : `${Math.round(s.recommendationConfidence * 100)}% confidence`}
        </p>
      </div>
    </button>
  );
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
  const [jevUnavailable, setJevUnavailable] = useState(false);

  const hasAnyPool =
    (cards && cards.length > 0) || (wishlist && wishlist.length > 0);
  // When the user has nothing yet we still let them generate a suggestion —
  // the API switches into "shopping list" mode and returns starter-deck
  // recommendations from the wider Pokémon TCG catalog.
  const isStarterMode = !cardsLoading && !hasAnyPool;

  const handleSuggest = () => {
    suggestDeck.mutate(
      { data: { gameStyle, notes: notes.trim() || null } },
      {
        onSuccess: (data) => {
          setHasSuggested(true);
          setName(data.name);
          setStrategy(data.strategy);
          setSuggested(data.cards);
          setJevUnavailable(data.jevUnavailable);
          // Shopping suggestions have no backing card or wishlist id, so they
          // can't be persisted into the deck — pre-select only the actionable
          // owned/wishlist picks.
          setSelectedKeys(
            new Set(
              data.cards
                .map((c, i) => ({ c, key: suggestionKey(c, i) }))
                .filter(({ c }) => c.source === "owned" || c.source === "wishlist")
                .map(({ key }) => key),
            ),
          );
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
    // Shopping recommendations are filtered out because they have no owned or
    // wishlist id to attach the deck entry to — they're informational.
    const cardsPayload = (suggested ?? [])
      .map((s, i) => ({ s, key: suggestionKey(s, i) }))
      .filter(({ s, key }) => (s.source === "owned" || s.source === "wishlist") && selectedKeys.has(key))
      .map(({ s }) => {
        const base = {
          source: s.source,
          count: s.count,
          role: s.role ?? null,
          notes: s.reason ?? null,
          recommendationConfidence: s.recommendationConfidence,
          strategicScores: s.strategicScores,
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
            : isStarterMode
              ? "Brand new? Pick a play style and we'll recommend a beginner-friendly shopping list to start your collection."
              : "Choose a play style and we'll suggest the best deck composition from your collection."}
        </p>

        {!isManual && isStarterMode && !hasSuggested && (
          <Card className="mb-6 border-dashed bg-muted/30">
            <CardContent className="py-5 flex items-start gap-3">
              <ShoppingBag className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">Your collection and wishlist are empty.</p>
                <p className="text-muted-foreground mt-1">
                  No problem — pick a play style below and we'll generate a starter shopping list of cards to acquire.
                  You can also{" "}
                  <Link href="/collection" className="underline underline-offset-2">
                    add cards to your collection
                  </Link>{" "}
                  or{" "}
                  <Link href="/scan" className="underline underline-offset-2">
                    scan cards
                  </Link>{" "}
                  first for more personalized suggestions.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

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
                  disabled={suggestDeck.isPending || cardsLoading}
                  className={`mt-4 gap-2 relative transition-all${suggestDeck.isPending ? " animate-pulse ring-2 ring-primary/40 ring-offset-2" : ""}`}
                  size="lg"
                >
                  <Wand2 className={`h-4 w-4 transition-transform${suggestDeck.isPending ? " animate-spin" : ""}`} />
                  {suggestDeck.isPending
                    ? <span className="flex items-center gap-0.5">
                        {isStarterMode ? "Building shopping list" : "Building deck"}
                        <AnimatedDots />
                      </span>
                    : hasSuggested
                      ? "Regenerate suggestion"
                      : isStarterMode
                        ? "Suggest a starter shopping list"
                        : "Suggest a deck"}
                </Button>
                {isStarterMode && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Tip: since you have no cards yet, the AI will return a beginner shopping list rather than a savable deck.
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

                {!isManual && suggested && suggested.length > 0 && (() => {
                  const ownedSuggestions = suggested.map((s, i) => ({ s, i })).filter(({ s }) => s.source === "owned");
                  const optionalSuggestions = suggested.map((s, i) => ({ s, i })).filter(({ s }) => s.source !== "owned");
                  return (
                    <div className="space-y-5">
                      {jevUnavailable && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
                          Strategic scoring is temporarily unavailable. The legal, source-checked suggestions are still shown with low confidence.
                        </div>
                      )}
                      <div>
                        <Label>Owned cards ({selectedKeys.size} selected)</Label>
                        <p className="text-xs text-muted-foreground mb-3">Prioritized from your collection. Tap to include or exclude.</p>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                          {ownedSuggestions.map(({ s, i }) => {
                            const key = suggestionKey(s, i);
                            return <SuggestionTile key={key} suggestion={s} itemKey={key} selected={selectedKeys.has(key)} onToggle={() => toggleCard(key)} />;
                          })}
                        </div>
                      </div>
                      {optionalSuggestions.length > 0 && (
                        <div className="border-t pt-4">
                          <Label>Optional shopping improvements</Label>
                      <p className="text-xs text-muted-foreground mb-3">
                            These are not required for the legal candidate list. Wishlist cards can be saved; catalog and starter suggestions are informational only.
                      </p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                            {optionalSuggestions.map(({ s, i }) => {
                          const key = suggestionKey(s, i);
                              return <SuggestionTile key={key} suggestion={s} itemKey={key} selected={selectedKeys.has(key)} onToggle={() => toggleCard(key)} />;
                        })}
                      </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {(() => {
                  const hasSavable =
                    isManual ||
                    (suggested?.some((s) => s.source !== "shopping") ?? false);
                  if (!hasSavable) {
                    // Pure starter/shopping result — nothing to persist into a deck.
                    return (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
                        This is a shopping list, not a deck. Acquire some of the cards above (or
                        save them to your wishlist) and re-run the AI suggester to build a savable
                        deck.
                      </div>
                    );
                  }
                  return (
                    <Button
                      onClick={handleCreate}
                      disabled={createDeck.isPending || !name.trim()}
                      size="lg"
                      className="w-full sm:w-auto gap-2"
                    >
                      {createDeck.isPending ? "Saving..." : "Save deck"}
                    </Button>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}

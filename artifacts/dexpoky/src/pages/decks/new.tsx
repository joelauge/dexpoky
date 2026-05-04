import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useListCards,
  useSuggestDeck,
  useCreateDeck,
  CreateDeckBodyGameStyle,
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

type SuggestedCard = {
  cardId: number;
  count: number;
  role?: string | null;
  reason: string;
};

export default function NewDeck() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const isManual = params.get("manual") === "1";

  const queryClient = useQueryClient();
  const { data: cards, isLoading: cardsLoading } = useListCards();
  const suggestDeck = useSuggestDeck();
  const createDeck = useCreateDeck();

  const [gameStyle, setGameStyle] =
    useState<keyof typeof CreateDeckBodyGameStyle>("midrange");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [strategy, setStrategy] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<SuggestedCard[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [hasSuggested, setHasSuggested] = useState(false);

  const cardById = useMemo(() => {
    const m = new Map<number, NonNullable<typeof cards>[number]>();
    (cards ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [cards]);

  const handleSuggest = () => {
    if (!cards || cards.length === 0) {
      toast.error("Add some cards to your collection first");
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
          setSelectedIds(new Set(data.cards.map((c) => c.cardId)));
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

  const toggleCard = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Deck name is required");
      return;
    }
    // Build rich card entries so AI-suggested counts/roles are persisted.
    const suggestedById = new Map<number, SuggestedCard>();
    (suggested ?? []).forEach((s) => suggestedById.set(s.cardId, s));
    const cards = Array.from(selectedIds).map((cardId) => {
      const s = suggestedById.get(cardId);
      return {
        cardId,
        count: s?.count ?? 1,
        role: s?.role ?? null,
        notes: s?.reason ?? null,
      };
    });

    createDeck.mutate(
      {
        data: {
          name: name.trim(),
          gameStyle,
          strategy: strategy ?? null,
          description: notes.trim() || null,
          cards,
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
          <RulesSheet />
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
                  disabled={suggestDeck.isPending || cardsLoading || !cards || cards.length === 0}
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
                {!cardsLoading && cards && cards.length === 0 && (
                  <p className="text-xs text-destructive mt-2">
                    Your collection is empty. Add or scan cards first.
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
                    <Label>Suggested cards ({selectedIds.size} selected)</Label>
                    <p className="text-xs text-muted-foreground mb-3">
                      Tap cards to include or exclude them from your deck.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {suggested.map((s) => {
                        const card = cardById.get(s.cardId);
                        if (!card) return null;
                        const isSelected = selectedIds.has(s.cardId);
                        return (
                          <button
                            key={s.cardId}
                            onClick={() => toggleCard(s.cardId)}
                            className={`text-left rounded-xl border-2 transition-all overflow-hidden ${
                              isSelected
                                ? "border-primary ring-2 ring-primary/20"
                                : "border-border opacity-60 hover:opacity-100"
                            }`}
                          >
                            <div className="aspect-[3/4] relative bg-muted/30">
                              {card.imageUrl ? (
                                <img
                                  src={card.imageUrl}
                                  alt={card.name}
                                  className="w-full h-full object-cover"
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
                            </div>
                            <div className="p-2">
                              <p className="text-xs font-semibold truncate">{card.name}</p>
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

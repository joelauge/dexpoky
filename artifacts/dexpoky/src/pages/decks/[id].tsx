import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetDeck,
  useUpdateDeck,
  useAddDeckCard,
  useRemoveDeckCard,
  useDeleteDeck,
  useListCards,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ImageIcon, Plus, Trash2, X, Save, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

export default function DeckDetail() {
  const [, params] = useRoute("/decks/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  const queryClient = useQueryClient();

  const deckQueryKey = [`/api/decks/${id}`] as const;
  const { data: deck, isLoading, isError } = useGetDeck(id, {
    query: { enabled: Number.isInteger(id), queryKey: [...deckQueryKey] },
  });
  const { data: collection } = useListCards();
  const updateDeck = useUpdateDeck();
  const addCard = useAddDeckCard();
  const removeCard = useRemoveDeckCard();
  const deleteDeck = useDeleteDeck();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const startEdit = () => {
    if (!deck) return;
    setName(deck.name);
    setStrategy(deck.strategy ?? "");
    setEditing(true);
  };

  const saveEdit = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    updateDeck.mutate(
      { id, data: { name: name.trim(), strategy: strategy.trim() || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: deckQueryKey });
          queryClient.invalidateQueries({ queryKey: ["/api/decks"] });
          toast.success("Deck updated");
          setEditing(false);
        },
        onError: () => toast.error("Failed to update"),
      },
    );
  };

  const handleAdd = (cardId: number) => {
    addCard.mutate(
      { id, data: { cardId, count: 1 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: deckQueryKey });
          queryClient.invalidateQueries({ queryKey: ["/api/decks"] });
        },
        onError: () => toast.error("Failed to add card"),
      },
    );
  };

  const handleRemove = (cardId: number) => {
    removeCard.mutate(
      { id, cardId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: deckQueryKey });
          queryClient.invalidateQueries({ queryKey: ["/api/decks"] });
        },
        onError: () => toast.error("Failed to remove card"),
      },
    );
  };

  const handleDeleteDeck = () => {
    if (!deck) return;
    if (!confirm(`Delete deck "${deck.name}"?`)) return;
    deleteDeck.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/decks"] });
          toast.success("Deck deleted");
          setLocation("/decks");
        },
        onError: () => toast.error("Failed to delete"),
      },
    );
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-8 w-32 mb-4" />
          <Skeleton className="h-12 w-64 mb-6" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4]" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (isError || !deck) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/decks">
            <Button variant="ghost" size="sm" className="mb-4 gap-1">
              <ArrowLeft className="h-4 w-4" /> All decks
            </Button>
          </Link>
          <div className="border-2 border-dashed rounded-2xl p-10 text-center bg-muted/20">
            <h2 className="text-xl font-semibold mb-2">Deck not found</h2>
            <p className="text-muted-foreground mb-4">
              This deck doesn't exist or you don't have access to it.
            </p>
            <Link href="/decks">
              <Button>Back to all decks</Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const inDeckIds = new Set(deck.cards.map((c) => c.cardId));
  const availableCards = (collection ?? []).filter(
    (c) =>
      !inDeckIds.has(c.id) &&
      (pickerSearch.trim() === "" ||
        c.name.toLowerCase().includes(pickerSearch.toLowerCase())),
  );
  const totalCount = deck.cards.reduce((sum, c) => sum + c.count, 0);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/decks">
          <Button variant="ghost" size="sm" className="mb-4 gap-1">
            <ArrowLeft className="h-4 w-4" /> All decks
          </Button>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <Badge className={`border mb-2 ${STYLE_COLORS[deck.gameStyle] ?? ""}`}>
              {STYLE_LABELS[deck.gameStyle] ?? deck.gameStyle}
            </Badge>
            {editing ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-2xl font-bold h-auto py-1"
              />
            ) : (
              <h1 className="text-3xl font-bold tracking-tight break-words">{deck.name}</h1>
            )}
            <p className="text-muted-foreground text-sm mt-1">
              {totalCount} card{totalCount === 1 ? "" : "s"} ({deck.cards.length} unique)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <RulesSheet />
            {editing ? (
              <>
                <Button onClick={saveEdit} disabled={updateDeck.isPending} className="gap-1">
                  <Save className="h-4 w-4" /> Save
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={startEdit}>Edit</Button>
                <Button variant="outline" onClick={handleDeleteDeck} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {(deck.strategy || editing) && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                Strategy
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Textarea
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  rows={4}
                  placeholder="Describe the win condition and key plays..."
                />
              ) : (
                <p className="text-sm leading-relaxed">{deck.strategy}</p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Cards</h2>
          <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> Add card
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>Add card from your collection</DialogTitle>
              </DialogHeader>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search your collection..."
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="overflow-y-auto flex-1">
                {availableCards.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No more cards in your collection to add.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {availableCards.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          handleAdd(c.id);
                          setPickerOpen(false);
                          setPickerSearch("");
                        }}
                        className="text-left rounded-lg border hover:border-primary transition-colors overflow-hidden"
                      >
                        <div className="aspect-[3/4] bg-muted/30">
                          {c.imageUrl ? (
                            <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                              <ImageIcon className="h-6 w-6" />
                            </div>
                          )}
                        </div>
                        <p className="text-xs font-semibold p-2 truncate">{c.name}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {deck.cards.length === 0 ? (
          <div className="border-2 border-dashed rounded-2xl p-10 text-center bg-muted/20">
            <p className="text-muted-foreground">No cards in this deck yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {deck.cards.map((entry) => (
              <div key={entry.cardId} className="group relative rounded-xl border overflow-hidden bg-card hover:shadow-md transition-shadow">
                <div className="aspect-[3/4] bg-muted/30 relative">
                  {entry.card.imageUrl ? (
                    <img src={entry.card.imageUrl} alt={entry.card.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                      <ImageIcon className="h-8 w-8" />
                    </div>
                  )}
                  {entry.count > 1 && (
                    <Badge className="absolute top-2 left-2 bg-primary/90 text-primary-foreground">
                      ×{entry.count}
                    </Badge>
                  )}
                  {entry.role && (
                    <Badge variant="secondary" className="absolute bottom-2 left-2 text-[10px] capitalize">
                      {entry.role}
                    </Badge>
                  )}
                  <button
                    onClick={() => handleRemove(entry.cardId)}
                    className="absolute top-1.5 right-1.5 bg-background/90 hover:bg-destructive hover:text-destructive-foreground rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    aria-label="Remove from deck"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="p-2">
                  <p className="text-xs font-semibold truncate">{entry.card.name}</p>
                  {entry.notes && (
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{entry.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListCardsQueryKey, getListThreadsQueryKey, useContactBinderWishlist, useListCards,
  type BinderContactInput, type BinderDisplayCard,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { explainContactError, matchesWishlistTarget } from "@/lib/binders/match";

type Common = {
  token: string; pageId: string; slot: number; card: BinderDisplayCard; ownerName: string;
  signedIn: boolean; isOwner: boolean; onSignIn: () => void; onSignUp: () => void;
};

function SignedOutNotice({ text, onSignIn, onSignUp }: { text: string; onSignIn: () => void; onSignUp: () => void }) {
  return (
    <div className="space-y-3" data-testid="notice-signed-out">
      <p className="text-sm">{text}</p>
      <div className="flex gap-2">
        <Button onClick={onSignUp} className="flex-1" data-testid="button-inspector-signup">Create account</Button>
        <Button onClick={onSignIn} variant="outline" className="flex-1" data-testid="button-inspector-signin">Sign in</Button>
      </div>
      <p className="text-xs text-muted-foreground">You will return to this binder afterwards.</p>
    </div>
  );
}

function OwnerNotice() {
  return <p className="rounded-lg bg-muted p-3 text-sm" data-testid="text-own-binder">This is your own binder. You can inspect cards here, but you cannot make offers to yourself.</p>;
}

const money = (v: string) => { const n = Number(v); return v.trim() !== "" && Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };

export function OwnedOfferPanel(p: Common) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"buy" | "trade">("buy");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const enabled = p.signedIn && !p.isOwner;
  const cardsQ = useListCards(undefined, { query: { queryKey: getListCardsQueryKey(), enabled } });
  const contact = useContactBinderWishlist();

  const mine = useMemo(() => (cardsQ.data ?? []).filter((c) => !c.forSale), [cardsQ.data]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? mine.filter((c) => c.name.toLowerCase().includes(q)) : mine;
  }, [mine, filter]);

  if (p.isOwner) return <OwnerNotice />;
  if (!p.signedIn) return <SignedOutNotice text="You need a DexPoky account to make an offer on this card." onSignIn={p.onSignIn} onSignUp={p.onSignUp} />;

  const toggle = (id: number) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 10 ? s : [...s, id]));

  const send = () => {
    if (contact.isPending) return;
    const text = message.trim();
    const amt = money(amount);
    let data: BinderContactInput;
    if (mode === "buy") {
      if (!(amt > 0)) { setError("Enter the amount you will pay, greater than zero."); return; }
      data = { intent: "buy", targetCardId: p.card.id, message: text || `I would like to buy ${p.card.name}.`, amount: amt };
    } else {
      if (picked.length < 1) { setError("Choose at least one of your cards to offer."); return; }
      if (amount.trim() !== "" && !(amt >= 0)) { setError("Cash must be zero or more."); return; }
      data = { intent: "trade", targetCardId: p.card.id, message: text || `I would like to trade for ${p.card.name}.`, offeredCardIds: picked, ...(amt > 0 ? { amount: amt } : {}) };
    }
    setError(null);
    contact.mutate({ token: p.token, pageId: p.pageId, slot: p.slot, data }, {
      onSuccess: (r) => {
        qc.invalidateQueries({ queryKey: getListThreadsQueryKey() });
        qc.invalidateQueries({ queryKey: ["/api/threads"] });
        setLocation(`/inbox?thread=${r.threadId}`);
      },
      onError: (e) => setError(explainContactError(e)),
    });
  };

  return (
    <div className="space-y-3" data-testid="panel-owned-offer">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Offer type">
        {(["buy", "trade"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); }} data-testid={`tab-offer-${m}`}
            className={cn("rounded-md py-1.5 text-sm font-semibold", mode === m ? "bg-background shadow" : "text-muted-foreground")}>{m === "buy" ? "Buy" : "Trade"}</button>
        ))}
      </div>
      {mode === "trade" && (
        <div className="space-y-2">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search your cards" aria-label="Search your cards" data-testid="input-offer-filter" />
          {cardsQ.isLoading && <Skeleton className="h-28 w-full" />}
          {cardsQ.isError && <p className="text-sm text-destructive">Could not load your cards. <button type="button" className="underline" onClick={() => cardsQ.refetch()}>Retry</button></p>}
          {cardsQ.data && mine.length === 0 && <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">You have no cards available to offer. Add cards to your collection first.</p>}
          <div className="grid max-h-44 grid-cols-4 gap-2 overflow-y-auto" data-testid="offer-card-picker">
            {shown.map((c) => (
              <button key={c.id} type="button" onClick={() => toggle(c.id)} aria-pressed={picked.includes(c.id)} data-testid={`offer-card-${c.id}`}
                className={cn("rounded-md border-2 p-0.5 text-left", picked.includes(c.id) ? "border-primary bg-primary/10" : "border-transparent bg-muted")}>
                {c.imageUrl ? <img src={c.imageUrl} alt={c.name} className="aspect-[5/7] w-full rounded object-contain" /> : <span className="flex aspect-[5/7] items-center justify-center p-1 text-center text-[10px]">{c.name}</span>}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{picked.length} of 10 cards selected</p>
        </div>
      )}
      <label className="block text-sm font-medium">
        {mode === "buy" ? "Your offer (USD)" : "Add cash (optional, USD)"}
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="mt-1" data-testid="input-offer-amount" />
      </label>
      <label className="block text-sm font-medium">
        Message
        <Textarea value={message} maxLength={2000} rows={3} onChange={(e) => setMessage(e.target.value)} placeholder="Say hello, ask about the card" className="mt-1" data-testid="input-offer-message" />
      </label>
      {error && <p role="alert" className="text-sm text-destructive" data-testid="text-offer-error">{error}</p>}
      <Button onClick={send} disabled={contact.isPending} className="w-full" data-testid="button-offer-send">{contact.isPending ? "Sending" : mode === "buy" ? "Send buy offer" : "Send trade offer"}</Button>
      <p className="text-xs text-muted-foreground">{p.ownerName} can accept or counter in your inbox.</p>
    </div>
  );
}

export function WishlistSellPanel(p: Common) {
  const [, setLocation] = useLocation();
  const enabled = p.signedIn && !p.isOwner;
  const cardsQ = useListCards(undefined, { query: { queryKey: getListCardsQueryKey(), enabled } });
  const matches = useMemo(() => (cardsQ.data ?? []).filter((c) => !c.forSale && matchesWishlistTarget(c, p.card)), [cardsQ.data, p.card]);
  const [choice, setChoice] = useState<number | null>(null);
  const chosen = choice !== null && matches.some((c) => c.id === choice) ? choice : matches[0]?.id ?? null;

  if (p.isOwner) return <OwnerNotice />;
  if (!p.signedIn) return <SignedOutNotice text="You need a DexPoky account to offer cards for sale to other users." onSignIn={p.onSignIn} onSignUp={p.onSignUp} />;
  if (cardsQ.isLoading) return <Skeleton className="h-24 w-full" />;
  if (cardsQ.isError) return <p className="text-sm text-destructive">Could not load your cards. <button type="button" className="underline" onClick={() => cardsQ.refetch()}>Retry</button></p>;

  if (matches.length === 0) {
    return (
      <div className="space-y-3" data-testid="notice-no-match">
        <p className="text-sm">You do not own a copy of this exact printing that is free to sell. Add the matching card to your collection first, then come back.</p>
        <Button variant="outline" className="w-full" onClick={() => setLocation("/collection/new")} data-testid="button-add-matching">Add a card to my collection</Button>
      </div>
    );
  }
  const go = () => {
    if (chosen === null) return;
    const q = new URLSearchParams({ mode: "sell", card: String(chosen), binder: p.token, binderPage: p.pageId, binderSlot: String(p.slot) });
    setLocation(`/share?${q.toString()}`);
  };
  return (
    <div className="space-y-3" data-testid="panel-wishlist-sell">
      <p className="text-sm">{p.ownerName} wants this card. Offer them one of your matching copies at your price.</p>
      <div className="space-y-1.5">
        {matches.map((c) => (
          <button key={c.id} type="button" onClick={() => setChoice(c.id)} aria-pressed={chosen === c.id} data-testid={`sell-copy-${c.id}`}
            className={cn("flex w-full items-center gap-3 rounded-lg border-2 p-2 text-left", chosen === c.id ? "border-primary bg-primary/5" : "border-transparent bg-muted")}>
            {c.imageUrl ? <img src={c.imageUrl} alt="" className="h-12 w-9 rounded object-contain" /> : <span className="h-12 w-9 rounded bg-background" />}
            <span className="min-w-0 text-sm"><span className="block truncate font-medium">{c.name}</span><span className="text-xs text-muted-foreground">{c.condition}</span></span>
          </button>
        ))}
      </div>
      <Button onClick={go} className="w-full" data-testid="button-sell-copy">Sell my copy</Button>
    </div>
  );
}

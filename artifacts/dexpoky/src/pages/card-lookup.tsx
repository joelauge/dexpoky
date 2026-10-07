import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowLeft, RefreshCw, Sparkles, Search, X } from "lucide-react";
import {
  useGetPricingLookup, getGetPricingLookupQueryKey, useListCards, getListCardsQueryKey,
  type CatalogCard, type PriceLookupFinish, type ComparableSaleCondition, type EnsureSetCatalogCardResult, type CardEdition,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { CatalogSearch } from "@/components/catalog-search";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QuoteTable } from "@/components/card-lookup/quote-table";
import { SavePanel } from "@/components/card-lookup/save-panel";
import { SetMembershipNotice } from "@/components/card-lookup/set-membership-notice";
import { type Method, EDITIONS, findTargets, when, errMessage, methodLabel } from "@/lib/card-lookup-utils";
import { useCardLookupHistory } from "@/hooks/use-card-lookup-history";
import { LookupHistory } from "@/components/card-lookup/lookup-history";
import type { LookupHistoryEntry } from "@/lib/card-lookup-history";
import { AddLookupCard } from "@/components/card-lookup/add-lookup-card";

const FINISHES: { v: PriceLookupFinish; l: string }[] = [
  { v: "normal", l: "Normal" }, { v: "holofoil", l: "Holofoil" }, { v: "reverse_holofoil", l: "Reverse holo" },
];

function isRealCardImage(url: string | null | undefined): url is string {
  if (!url?.trim()) return false;
  const normalized = url.toLowerCase();
  return !["logo", "dexpoky", "pwa", "placeholder"].some((marker) => normalized.includes(marker));
}

function SelectedCardArtwork({ cardId, name, urls, onImage }: { cardId: string; name: string; urls: (string | null | undefined)[]; onImage: (cardId: string, url: string | null) => void }) {
  const candidates = [...new Set(urls.filter(isRealCardImage))];
  const [candidateIndex, setCandidateIndex] = useState(0);
  useEffect(() => setCandidateIndex(0), [cardId, candidates.join("|")]);
  const imageUrl = candidates[candidateIndex];
  useEffect(() => onImage(cardId, imageUrl ?? null), [cardId, imageUrl, onImage]);

  return (
    <div className={`${imageUrl ? "h-48 sm:h-auto sm:aspect-[3/4]" : "h-24 sm:h-36"} rounded-xl bg-muted/30 overflow-hidden flex items-center justify-center mb-3`}>
      {imageUrl ? (
        <img
          key={`${cardId}:${imageUrl}`}
          src={imageUrl}
          alt={`${name} card artwork`}
          className="w-full h-full object-contain"
          onError={() => setCandidateIndex((index) => index + 1)}
        />
      ) : (
        <p className="text-xs text-muted-foreground">Card artwork unavailable</p>
      )}
    </div>
  );
}

export default function CardLookup() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const sp = new URLSearchParams(search);
  const qCatalog = sp.get("catalogCardId");
  const qCard = sp.get("cardId");
  const explicitEdition = EDITIONS.find(item => item.value === sp.get("edition"))?.value;

  const { data: owned } = useListCards(undefined, { query: { queryKey: getListCardsQueryKey() } });
  const [finish, setFinish] = useState<PriceLookupFinish>("normal");
  const [condition, setCondition] = useState<ComparableSaleCondition>("near_mint");
  const [method, setMethod] = useState<Method | null>(null);
  const [targetId, setTargetId] = useState<number | null>(qCard ? Number(qCard) : null);
  const [now, setNow] = useState(Date.now());
  const [selectedCards, setSelectedCards] = useState<Record<string, CatalogCard>>({});
  const history = useCardLookupHistory();
  const recordedLookup = useRef<string | null>(null);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [verifiedSet, setVerifiedSet] = useState<{ catalogId: string; result: EnsureSetCatalogCardResult | null } | null>(null);
  const [artwork, setArtwork] = useState<{ cardId: string; url: string | null } | null>(null);
  const onImage = useCallback((cardId: string, url: string | null) => setArtwork({ cardId, url }), []);

  const ownedFromLink = qCard && owned ? owned.find((c) => c.id === Number(qCard)) : undefined;
  const edition: CardEdition = explicitEdition ?? ownedFromLink?.edition ?? "unknown";
  const setEdition = (value: CardEdition) => {
    const next = new URLSearchParams(search);
    next.set("edition", value);
    setLocation(`/card-lookup?${next.toString()}`);
  };
  const linkNeedsSearch = !!qCard && !!owned && !qCatalog && (!ownedFromLink || !ownedFromLink.catalogCardId);
  const catalogId = qCatalog ?? (linkNeedsSearch ? null : ownedFromLink?.catalogCardId ?? null);
  const selectedCard = catalogId ? selectedCards[catalogId] : undefined;
  const onVerified = useCallback((result: EnsureSetCatalogCardResult | null) => {
    if (catalogId) setVerifiedSet({ catalogId, result });
  }, [catalogId]);
  const matchingSet = verifiedSet?.catalogId === catalogId && verifiedSet.result?.status !== "unmatched" && verifiedSet.result?.setId
    ? { id: verifiedSet.result.setId, name: verifiedSet.result.setName ?? "Detected set" } : undefined;
  const searchScroll = useRef(0);
  const previousCatalogId = useRef(catalogId);

  useEffect(() => {
    const previous = previousCatalogId.current;
    previousCatalogId.current = catalogId;
    if (previous === catalogId) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: catalogId ? 0 : searchScroll.current, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [catalogId]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { document.title = "Card Lookup | DexPoky"; }, []);

  const params = { catalogCardId: catalogId ?? "", finish, condition, edition };
  const q = useGetPricingLookup(params, {
    query: { enabled: !!catalogId, queryKey: getGetPricingLookupQueryKey(params), staleTime: Infinity, gcTime: 0 },
  });
  // A query observer may briefly expose cached data from a prior route. Never
  // render its price or art unless its server identity exactly matches selection.
  const lookup = q.data?.card.id === catalogId && q.data.card.edition === edition &&
    q.data.finish === finish && q.data.condition === condition ? q.data : undefined;
  const expired = !!lookup && new Date(lookup.expiresAt).getTime() <= now;

  useEffect(() => {
    if (!lookup || !history.userId) return;
    const key = `${history.userId}:${lookup.lookupId}`;
    if (recordedLookup.current === key) return;
    recordedLookup.current = key;
    history.record({
      card: { ...lookup.card, imageUrl: lookup.card.imageUrl ?? (isRealCardImage(selectedCard?.imageUrl) ? selectedCard.imageUrl : null) },
      finish, condition, visitedAt: Date.now(),
    });
  }, [lookup, selectedCard, history.userId, history.record, finish, condition]);

  useEffect(() => { setMethod(null); }, [catalogId, finish, condition, edition, lookup?.lookupId]);

  const matches = useMemo(
    () => (lookup ? findTargets(owned, lookup.card, edition) : { targets: [], identityCandidates: [] }),
    [owned, lookup, edition],
  );
  const { targets, identityCandidates } = matches;
  useEffect(() => {
    if (targets.length && !targets.some((t) => t.card.id === targetId)) {
      setTargetId(targets.length === 1 ? targets[0].card.id : null);
    }
  }, [targets, targetId]);

  const pick = (c: CatalogCard) => {
    searchScroll.current = window.scrollY;
    setSelectedCards((cards) => ({ ...cards, [c.id]: c }));
    setFinish("normal");
    setLocation(`/card-lookup?catalogCardId=${encodeURIComponent(c.id)}`);
  };
  const clear = () => setLocation("/card-lookup");
  const openHistory = (entry: LookupHistoryEntry) => {
    searchScroll.current = window.scrollY;
    if (lookup?.card.id === entry.card.id && edition === entry.card.edition &&
      finish === entry.finish && condition === entry.condition) {
      history.record({ card: lookup.card, finish, condition, visitedAt: Date.now() });
    }
    setFinish(entry.finish);
    setCondition(entry.condition);
    setMethod(null);
    setTargetId(null);
    setLocation(`/card-lookup?catalogCardId=${encodeURIComponent(entry.card.id)}&edition=${encodeURIComponent(entry.card.edition)}`);
  };
  const shownCard = catalogId
    ? selectedCard ?? (lookup?.card.id === catalogId ? lookup.card : undefined) ?? history.entries.find((entry) => entry.card.id === catalogId)?.card
    : undefined;
  const advice = lookup?.advice;

  return (
    <Layout hideMobileScanButton>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-1">Card Lookup</h1>
        <p className="text-muted-foreground mb-6 max-w-xl text-sm">Find the exact printing, compare platform prices side by side, then choose what to save to one card you own.</p>

        {linkNeedsSearch && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm p-3" data-testid="notice-needs-search">
            This owned card has no catalog printing attached, so we will not guess. Search the catalog and pick the exact printing.
          </div>
        )}

        {catalogId && (
          <Button variant="outline" size="sm" className="mb-4" onClick={clear} data-testid="button-back-to-results">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />Back to results
          </Button>
        )}

        <div className="grid lg:grid-cols-[320px_1fr] gap-8 items-start">
          <section className="min-w-0">
            {catalogId && (shownCard ? (
              <div className="rounded-2xl border bg-card p-4" data-testid="panel-selected-card">
                <SelectedCardArtwork
                  cardId={catalogId}
                  name={shownCard.name}
                  urls={[selectedCard?.imageUrl, lookup?.card.id === catalogId ? lookup.card.imageUrl : undefined]}
                  onImage={onImage}
                />
                <p className="font-black text-lg leading-tight">{shownCard.name}</p>
                <p className="text-xs text-muted-foreground">{shownCard.setName ?? "Unknown set"}{shownCard.cardNumber ? ` · #${shownCard.cardNumber}` : ""}</p>
                <p className="text-xs text-muted-foreground">Edition: {EDITIONS.find((item) => item.value === (lookup?.card.edition ?? edition))?.label ?? "Unknown / not recorded"}</p>
                <details className="mt-1 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Catalog identifier</summary>
                  <p className="font-mono break-all mt-1">{shownCard.id}</p>
                </details>
                <SetMembershipNotice key={catalogId} catalogCardId={catalogId} onVerified={onVerified} />
                {lookup && <AddLookupCard key={`add-${catalogId}`} lookup={lookup} catalog={selectedCard} set={matchingSet}
                  setPending={verifiedSet?.catalogId !== catalogId}
                  imageUrl={artwork?.cardId === catalogId ? artwork.url : lookup.card.imageUrl}
                  open={addCardOpen} onOpenChange={setAddCardOpen} onCreated={(card) => setTargetId(card.id)} />}
                <Button variant="outline" size="sm" className="mt-3 w-full" onClick={clear} data-testid="button-change-card"><X className="h-3.5 w-3.5 mr-1" />Choose a different card</Button>
              </div>
            ) : (
              <Skeleton className="aspect-[3/4] rounded-2xl" />
            ))}
            <div className={catalogId ? "hidden" : "rounded-2xl border bg-card p-4"} aria-hidden={!!catalogId}>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><Search className="h-3.5 w-3.5" />Find the printing</p>
              <CatalogSearch onSelect={pick} autoFocus={!catalogId} emptyHint="Search a name, set, or number, then pick the exact printing." pausePolling={!!catalogId} preserveResults resultColumns={2} />
            </div>
          </section>

          <section className="min-w-0 space-y-5">
            {!catalogId && (
              <div className="rounded-2xl border border-dashed p-10 text-center">
                <img src="/logo.png" alt="" className="w-16 mx-auto opacity-20 grayscale mb-3" />
                <p className="font-bold">No card selected</p>
                <p className="text-sm text-muted-foreground">Pick a printing to see TCGplayer, Cardmarket and eBay side by side.</p>
              </div>
            )}

            {catalogId && (
              <div className="text-xs space-y-1">
                <label className="font-semibold" htmlFor="lookup-edition">Edition</label>
                <select id="lookup-edition" data-testid="select-lookup-edition" className="block rounded-lg border bg-card p-2" value={edition}
                  onChange={(e) => setEdition(e.target.value as CardEdition)}>
                  {EDITIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <p className="text-muted-foreground">Edition is a comparison choice, not inferred from catalog ID, name, search, or artwork. Recording it on a copy is your assertion, not authentication.</p>
              </div>
            )}

            {catalogId && (
              <div className="text-xs space-y-1">
                <label className="font-semibold" htmlFor="lookup-condition">eBay comparable condition</label>
                <select id="lookup-condition" data-testid="select-lookup-condition" className="block rounded-lg border bg-card p-2" value={condition}
                  onChange={e => setCondition(e.target.value as ComparableSaleCondition)}>
                  <option value="mint">Mint</option>
                  <option value="near_mint">Near mint</option>
                  <option value="light_played">Light played</option>
                </select>
                <p className="text-muted-foreground">Only explicitly documented raw English sales qualify. Saving eBay values requires this condition on your owned copy. Other conditions remain available through platform quotes.</p>
              </div>
            )}

            {catalogId && (
              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Finish">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1">Finish</span>
                {FINISHES.map((f) => (
                  <button key={f.v} type="button" role="radio" aria-checked={finish === f.v} onClick={() => setFinish(f.v)} data-testid={`button-finish-${f.v}`}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${finish === f.v ? "bg-primary text-primary-foreground border-primary" : "hover:bg-secondary"}`}>{f.l}</button>
                ))}
              </div>
            )}

            {catalogId && q.isLoading && <div className="space-y-3"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>}

            {catalogId && q.isError && (
              <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-4 text-sm" data-testid="text-lookup-error">
                <p className="mb-2">Price lookup failed: {errMessage(q.error)}</p>
                <Button size="sm" variant="outline" onClick={() => q.refetch()} data-testid="button-retry-lookup">Try again</Button>
              </div>
            )}

            {lookup && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span data-testid="text-checked-at">Checked by DexPoky {when(lookup.observedAt)} · quote {expired ? "expired" : `valid until ${when(lookup.expiresAt)}`}</span>
                  <Button size="sm" variant={expired ? "default" : "outline"} onClick={() => q.refetch()} disabled={q.isFetching} data-testid="button-refresh">
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${q.isFetching ? "animate-spin" : ""}`} />Refresh
                  </Button>
                </div>

                {advice && advice.status === "ready" && advice.recommendedOption !== "none" && (
                  <div className="rounded-xl border bg-secondary/40 p-3 text-xs flex gap-2" data-testid="panel-advice">
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    <p><strong>Optional suggestion: {methodLabel(advice.recommendedOption as Method)}.</strong> {advice.message} It is only a suggestion. Your selection below decides what is saved.</p>
                  </div>
                )}
                {advice?.status === "unavailable" && (
                  <p className="text-xs text-muted-foreground">Pricing guidance is temporarily unavailable. You can still compare sources and choose a value yourself.</p>
                )}

                <QuoteTable lookup={lookup} selected={method} onSelect={setMethod} />
                <SavePanel
                  key={lookup.lookupId}
                  lookup={lookup} expired={expired} method={method} targets={targets} identityCandidates={identityCandidates}
                  edition={edition} targetId={targetId}
                  onTarget={setTargetId} onRefresh={() => q.refetch()} refreshing={q.isFetching}
                  onAddCard={() => setAddCardOpen(true)}
                />
                <Link href="/collection" className="text-xs text-muted-foreground hover:text-foreground underline">Back to collection</Link>
              </>
            )}
          </section>
        </div>
        <LookupHistory entries={history.entries} storageAvailable={history.storageAvailable} userId={history.userId} onOpen={openHistory} />
      </div>
    </Layout>
  );
}

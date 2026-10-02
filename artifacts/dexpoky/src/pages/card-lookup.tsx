import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowLeft, RefreshCw, Sparkles, Search, X } from "lucide-react";
import {
  useGetPricingLookup, getGetPricingLookupQueryKey, useListCards, getListCardsQueryKey,
  type CatalogCard, type PriceLookupFinish,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { CatalogSearch } from "@/components/catalog-search";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QuoteTable } from "@/components/card-lookup/quote-table";
import { SavePanel } from "@/components/card-lookup/save-panel";
import { SetMembershipNotice } from "@/components/card-lookup/set-membership-notice";
import { type Method, findTargets, when, errMessage, methodLabel } from "@/lib/card-lookup-utils";

const FINISHES: { v: PriceLookupFinish; l: string }[] = [
  { v: "normal", l: "Normal" }, { v: "holofoil", l: "Holofoil" }, { v: "reverse_holofoil", l: "Reverse holo" },
];

function isRealCardImage(url: string | null | undefined): url is string {
  if (!url?.trim()) return false;
  const normalized = url.toLowerCase();
  return !["logo", "dexpoky", "pwa", "placeholder"].some((marker) => normalized.includes(marker));
}

function SelectedCardArtwork({ cardId, name, urls }: { cardId: string; name: string; urls: (string | null | undefined)[] }) {
  const candidates = [...new Set(urls.filter(isRealCardImage))];
  const [candidateIndex, setCandidateIndex] = useState(0);
  useEffect(() => setCandidateIndex(0), [cardId, candidates.join("|")]);
  const imageUrl = candidates[candidateIndex];

  return (
    <div className="aspect-[3/4] rounded-xl bg-muted/30 overflow-hidden flex items-center justify-center mb-3">
      {imageUrl ? (
        <img
          key={`${cardId}:${imageUrl}`}
          src={imageUrl}
          alt={`${name} card artwork`}
          className="w-full h-full object-contain"
          onError={() => setCandidateIndex((index) => index + 1)}
        />
      ) : (
        <img src="/logo.png" alt="" aria-hidden="true" className="w-24 opacity-20 grayscale" />
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

  const { data: owned } = useListCards(undefined, { query: { queryKey: getListCardsQueryKey() } });
  const [finish, setFinish] = useState<PriceLookupFinish>("normal");
  const [method, setMethod] = useState<Method | null>(null);
  const [targetId, setTargetId] = useState<number | null>(qCard ? Number(qCard) : null);
  const [now, setNow] = useState(Date.now());
  const [selectedCards, setSelectedCards] = useState<Record<string, CatalogCard>>({});

  const ownedFromLink = qCard && owned ? owned.find((c) => c.id === Number(qCard)) : undefined;
  const linkNeedsSearch = !!qCard && !!owned && !qCatalog && (!ownedFromLink || !ownedFromLink.catalogCardId);
  const catalogId = qCatalog ?? (linkNeedsSearch ? null : ownedFromLink?.catalogCardId ?? null);
  const selectedCard = catalogId ? selectedCards[catalogId] : undefined;
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

  const params = { catalogCardId: catalogId ?? "", ...(finish ? { finish } : {}) };
  const q = useGetPricingLookup(params, {
    query: { enabled: !!catalogId, queryKey: getGetPricingLookupQueryKey(params), staleTime: Infinity, gcTime: 0 },
  });
  // A query observer may briefly expose cached data from a prior route. Never
  // render its price or art unless its server identity exactly matches selection.
  const lookup = q.data?.card.id === catalogId ? q.data : undefined;
  const expired = !!lookup && new Date(lookup.expiresAt).getTime() <= now;

  useEffect(() => { setMethod(null); }, [lookup?.lookupId]);

  const targets = useMemo(() => (lookup ? findTargets(owned, lookup.card) : []), [owned, lookup]);
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
  const shownCard = catalogId
    ? selectedCard ?? (lookup?.card.id === catalogId ? lookup.card : undefined)
    : undefined;
  const advice = lookup?.advice;

  return (
    <Layout>
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
                />
                <p className="font-black text-lg leading-tight">{shownCard.name}</p>
                <p className="text-xs text-muted-foreground">{shownCard.setName ?? "Unknown set"}{shownCard.cardNumber ? ` · #${shownCard.cardNumber}` : ""}</p>
                <p className="text-[10px] font-mono text-muted-foreground mt-1 break-all">{shownCard.id}</p>
                <SetMembershipNotice key={catalogId} catalogCardId={catalogId} />
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
                  lookup={lookup} expired={expired} method={method} targets={targets} targetId={targetId}
                  onTarget={setTargetId} onRefresh={() => q.refetch()} refreshing={q.isFetching}
                />
                <Link href="/collection" className="text-xs text-muted-foreground hover:text-foreground underline">Back to collection</Link>
              </>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}

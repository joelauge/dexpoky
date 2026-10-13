import { useEffect } from "react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import { useQueries } from "@tanstack/react-query";
import { getGetCatalogCardQueryKey, getGetCatalogCardQueryOptions } from "@workspace/api-client-react";
import { ArrowRight, Bot, Camera, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/constants";
import {
  GODPACK_CARDS,
  GODPACK_REVEAL_SECONDS,
  GODPACK_SNAPSHOT_DATE,
  GODPACK_VIDEO_ID,
  godPackImageUrl,
  godPackRawValue,
  godPackTotals,
  godPackWatchUrl,
} from "@/lib/godpack";

const TITLE = "We pulled a God Pack from an Ascended Heroes ETB | DexPoky";
const DESCRIPTION =
  "Ten hits in one pack, including Mega Dragonite ex and the Pikachu ex Special Illustration Rare. See every card and what it's worth today, then check your own pulls free on DexPoky.";

function usePageMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    let meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute("content") ?? null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    document.title = TITLE;
    meta.setAttribute("content", DESCRIPTION);
    return () => {
      document.title = prevTitle;
      if (prevDesc !== null) meta?.setAttribute("content", prevDesc);
      else meta?.remove();
    };
  }, []);
}

export default function GodPackPage() {
  usePageMeta();
  const { isSignedIn } = useUser();
  const scanHref = isSignedIn ? "/scan" : "/sign-up?redirect_url=%2Fscan";
  const agentsHref = isSignedIn ? "/agents" : "/sign-up?redirect_url=%2Fagents";

  const prices = useQueries({
    queries: GODPACK_CARDS.map((card) =>
      getGetCatalogCardQueryOptions(card.catalogId, {
        query: { queryKey: getGetCatalogCardQueryKey(card.catalogId), staleTime: 10 * 60 * 1000, retry: 1 },
      }),
    ),
  });
  const livePrices = prices.map((q) => q.data?.card?.marketPrice ?? null);
  const loading = prices.some((q) => q.isLoading);
  const totals = godPackTotals(livePrices);

  return (
    <div className="min-h-[100dvh] bg-[#0c1838] text-white font-sans overflow-x-hidden flex flex-col selection:bg-[#fbd34d] selection:text-[#0c1838]">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 md:px-8 bg-[#0c1838] border-b border-white/5">
        <Link href="/" data-testid="link-godpack-home">
          <img src="/dexpoky-logo.png" alt="DexPoky" className="h-9 md:h-10 w-auto object-contain cursor-pointer" />
        </Link>
        <Link href={scanHref} data-testid="link-godpack-nav-cta">
          <Button className="bg-[#e13838] hover:bg-[#c93232] text-white font-bold rounded-md h-9 md:h-10 px-4 md:px-5">
            Scan your cards
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </Link>
      </nav>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-5 pt-10 pb-8 md:pt-16 max-w-5xl mx-auto w-full">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#fbd34d]/30 bg-[#fbd34d]/10 px-3 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-[#fbd34d]" />
            <span className="text-xs md:text-sm font-medium tracking-wide text-[#fbd34d]">Ascended Heroes · Elite Trainer Box · Pack #2</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05] mb-5">
            We pulled a <span className="text-[#fbd34d]">God Pack</span>.
          </h1>
          <p className="text-lg md:text-xl text-white/80 max-w-2xl leading-relaxed mb-8">
            Ten hits in one pack, headlined by Mega Dragonite ex and the Pikachu ex Special Illustration Rare.
            Here's every card and what it's worth today.
          </p>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1">Worth today, ungraded</div>
              <div className="text-4xl md:text-5xl font-extrabold text-[#fbd34d]" data-testid="text-godpack-total">
                {loading ? "…" : formatCurrency(totals.raw)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1">If every card graded PSA 10</div>
              <div className="text-2xl md:text-3xl font-bold">{formatCurrency(totals.psa10)}</div>
            </div>
          </div>
        </section>

        {/* Video */}
        <section className="px-5 pb-12 max-w-5xl mx-auto w-full">
          <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black" style={{ aspectRatio: "16 / 9" }}>
            <iframe
              className="absolute inset-0 h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${GODPACK_VIDEO_ID}?start=${GODPACK_REVEAL_SECONDS}&rel=0`}
              title="God Pack opening from an Ascended Heroes Elite Trainer Box"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
            />
          </div>
        </section>

        {/* Cards */}
        <section className="w-full bg-[#0a1229] border-y border-white/5 py-14 px-5 md:px-8">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-extrabold mb-2">Every card in the pack</h2>
            <p className="text-white/60 text-sm mb-8">In the order they came out. Tap a card to watch it get pulled.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {GODPACK_CARDS.map((card, i) => {
                const { value, live } = godPackRawValue(card, livePrices[i]);
                return (
                  <a
                    key={card.catalogId}
                    href={godPackWatchUrl(card.watchAtSeconds)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
                    data-testid={`card-godpack-${i}`}
                  >
                    <div className="relative rounded-t-xl overflow-hidden" style={{ aspectRatio: "3 / 4" }}>
                      <img src={godPackImageUrl(card)} alt={`${card.name} ${card.number}`} loading="lazy" className="h-full w-full object-contain p-2" />
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/60 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="h-3.5 w-3.5 text-white" />
                      </span>
                    </div>
                    <div className="p-3 flex flex-col gap-1">
                      <div className="text-sm font-semibold leading-tight">{card.name}</div>
                      <div className="text-xs font-mono text-white/50">{card.number}</div>
                      <div className="text-[10px] uppercase tracking-wider font-bold text-[#fbd34d]/80">{card.rarity}</div>
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <span className="text-base font-bold">{formatCurrency(value)}</span>
                        <span className="text-[10px] text-white/40">{live ? "today" : GODPACK_SNAPSHOT_DATE}</span>
                      </div>
                      <div className="text-xs text-white/50">PSA 10: {formatCurrency(card.snapshotPsa10)}</div>
                    </div>
                  </a>
                );
              })}
            </div>
            <p className="mt-6 text-xs text-white/40 max-w-3xl">
              Ungraded values are TCGplayer market prices, updated live where available. PSA 10 values are
              PriceCharting market values as of {GODPACK_SNAPSHOT_DATE}. Prices move; these are estimates, not offers.
            </p>
          </div>
        </section>

        {/* CTAs */}
        <section className="px-5 py-16 max-w-5xl mx-auto w-full grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 flex flex-col">
            <Camera className="h-7 w-7 text-[#fbd34d] mb-4" />
            <h3 className="text-2xl font-extrabold mb-2">What's your pull worth?</h3>
            <p className="text-white/70 mb-6 flex-1">
              Scan your cards with your phone and see what they're worth right now. Track your whole collection's value as it grows.
            </p>
            <Link href={scanHref} data-testid="link-godpack-scan">
              <Button className="w-full bg-[#e13838] hover:bg-[#c93232] text-white text-base font-bold rounded-md h-12">
                Scan your cards free
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
          <div className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-7 flex flex-col">
            <Bot className="h-7 w-7 text-violet-300 mb-4" />
            <h3 className="text-2xl font-extrabold mb-2">Chasing one of these?</h3>
            <p className="text-white/70 mb-6 flex-1">
              Tell a DexAgent the card, your budget and the condition you want. It hunts around the clock and tells you when it finds a deal.
            </p>
            <Link href={agentsHref} data-testid="link-godpack-agents">
              <Button variant="outline" className="w-full border-violet-300/40 bg-transparent hover:bg-violet-400/10 text-white text-base font-bold rounded-md h-12">
                Start a DexAgent
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="w-full border-t border-white/5 bg-[#081024] py-10 px-5 md:px-8 text-white/50 text-sm">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <span className="opacity-70">© {new Date().getFullYear()} DexPoky</span>
          <div className="flex items-center gap-6 opacity-80">
            <a href={`https://www.youtube.com/watch?v=${GODPACK_VIDEO_ID}`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Full video</a>
            <Link href="/marketplace" className="hover:text-white transition-colors">Marketplace</Link>
            <Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

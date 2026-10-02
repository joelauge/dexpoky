import { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetPortfolioBreakdowns,
  getGetPortfolioBreakdownsQueryKey,
  type GetPortfolioBreakdownsParams,
  type PortfolioDimensionKey,
  type PortfolioValueGroup,
} from "@workspace/api-client-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { AlertTriangle, ChevronDown, Layers, RefreshCw, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/constants";

interface DimensionMeta {
  key: PortfolioDimensionKey;
  option: string;
  title: string;
  description: string;
}

const DIMENSIONS: DimensionMeta[] = [
  { key: "category", option: "Category", title: "Portfolio Value by Category", description: "Saved estimated value of your owned cards across your collection categories." },
  { key: "set", option: "Set", title: "Portfolio Value by Set", description: "Saved estimated value of your owned cards, grouped by card set." },
  { key: "year", option: "Release year", title: "Portfolio Value by Release Year", description: "Owned value grouped by the year each card's set was released, not when you acquired it." },
  { key: "card_type", option: "Card type", title: "Portfolio Value by Card Type", description: "Owned value grouped by Pokemon, Trainer or Energy card type." },
  { key: "binder", option: "Binder", title: "Portfolio Value by Binder", description: "Owned value of the cards placed in each of your binders." },
  { key: "sale_status", option: "For sale status", title: "Portfolio Value by Sale Status", description: "Owned value split by the For sale flag saved on each card." },
  { key: "rarity", option: "Rarity", title: "Portfolio Value by Rarity", description: "Saved estimated value of your owned cards, grouped by rarity." },
  { key: "condition", option: "Condition", title: "Portfolio Value by Condition", description: "Saved estimated value of your owned cards, grouped by condition." },
  { key: "pokemon", option: "Pokemon", title: "Portfolio Value by Pokemon", description: "Saved estimated value of your owned cards, grouped by Pokemon." },
  { key: "wishlist", option: "Wishlist (not owned)", title: "Wishlist Value Snapshot", description: "Separate from your owned portfolio: saved value snapshots of cards you want. Not a budget or a current market quote." },
];

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const POLL_MS = 8000;
const MAX_POLLS = 10;
const PENDING_KEYS: PortfolioDimensionKey[] = ["year", "card_type"];

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function PortfolioTooltip({ active, payload, unit }: { active?: boolean; payload?: Array<{ payload: PortfolioValueGroup }>; unit: string }) {
  if (!active || !payload?.length) return null;
  const g = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover text-popover-foreground px-3 py-2 shadow-md text-sm max-w-[260px]">
      <p className="font-semibold break-words">{g.label}</p>
      <p className="tabular-nums">Value: {g.unvaluedCount === g.cardCount ? "Unpriced" : formatCurrency(g.totalValue)}</p>
      <p className="text-xs text-muted-foreground">{plural(g.cardCount, unit, `${unit}s`)}</p>
      {g.unvaluedCount > 0 && (
        <p className="text-xs text-amber-600">{g.unvaluedCount.toLocaleString()} unpriced</p>
      )}
    </div>
  );
}

export function PortfolioValueChart() {
  const [dimKey, setDimKey] = useState<PortfolioDimensionKey>("category");
  const [narrowScreen, setNarrowScreen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setNarrowScreen(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const meta = DIMENSIONS.find((d) => d.key === dimKey) ?? DIMENSIONS[0];
  const params: GetPortfolioBreakdownsParams = { dimension: dimKey };

  const polls = useRef({ key: dimKey, n: 0 });
  const [pollState, setPollState] = useState({ key: dimKey, n: 0 });
  if (polls.current.key !== dimKey) polls.current = { key: dimKey, n: 0 };
  const watchPending = PENDING_KEYS.includes(dimKey);

  const query = useGetPortfolioBreakdowns(params, {
    query: {
      queryKey: getGetPortfolioBreakdownsQueryKey(params),
      staleTime: 30_000,
      refetchOnMount: "always",
      refetchInterval: (q) =>
        watchPending && q.state.data?.metadataPending && polls.current.n < MAX_POLLS ? POLL_MS : false,
    },
  });
  const { data, isLoading, isError, isFetching, refetch, dataUpdatedAt } = query;

  useEffect(() => {
    if (watchPending && data?.metadataPending && dataUpdatedAt) {
      polls.current.n += 1;
      setPollState({ key: dimKey, n: polls.current.n });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt]);

  const pending = watchPending && !!data?.metadataPending;
  const pollsExhausted = pending && pollState.key === dimKey && pollState.n >= MAX_POLLS;

  const dim = data?.dimensions.find((d) => d.key === dimKey);
  const isWishlist = dimKey === "wishlist";
  const unit = isWishlist ? "wishlist card" : "card";

  const groups = useMemo(() => {
    const list = (dim?.groups ?? []).map((g) =>
      dimKey === "year" && /unknown|unavailable/i.test(`${g.key} ${g.label}`) ? { ...g, label: "Unavailable" } : g,
    );
    return list.sort((a, b) => b.totalValue - a.totalValue);
  }, [dim, dimKey]);

  const horizontal = narrowScreen || groups.length > 3 || groups.some((g) => g.label.length > 14);
  const unpricedGroups = groups.filter((group) => group.cardCount > 0 && group.unvaluedCount === group.cardCount);
  const allUnpriced = groups.length > 0 && unpricedGroups.length === groups.length;
  const rowH = 34;
  const chartHeight = horizontal ? Math.max(260, groups.length * rowH + 20) : 260;
  const labelWidth = Math.min(180, Math.max(90, ...groups.map((g) => Math.min(g.label.length, 24) * 6.5)));

  const coverage =
    dim && dim.cardCount > 0 ? ((dim.cardCount - dim.unvaluedCount) / dim.cardCount) * 100 : null;

  const truncate = (s: string) => (s.length > 24 ? `${s.slice(0, 23)}…` : s);
  const axisCurrency = (value: number) => Math.abs(value) >= 1000
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value)
    : formatCurrency(value);

  return (
    <Card className="shadow-sm" data-testid="portfolio-value-chart">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <CardTitle data-testid="text-portfolio-title">{meta.title}</CardTitle>
            <CardDescription className="mt-1.5">{meta.description}</CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative flex-1 sm:flex-none">
              <label htmlFor="portfolio-dimension" className="sr-only">Group portfolio value by</label>
              <select
                id="portfolio-dimension"
                data-testid="select-portfolio-dimension"
                aria-label="Group portfolio value by"
                value={dimKey}
                onChange={(e) => setDimKey(e.target.value as PortfolioDimensionKey)}
                className="h-9 w-full sm:w-[190px] appearance-none rounded-lg border bg-background pl-3 pr-8 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              >
                {DIMENSIONS.map((d) => (
                  <option key={d.key} value={d.key}>{d.option}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => { polls.current.n = 0; setPollState({ key: dimKey, n: 0 }); void refetch(); }}
              disabled={isFetching}
              aria-label="Refresh portfolio breakdown"
              data-testid="button-portfolio-refresh"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3 mt-3" aria-busy="true" aria-label="Loading portfolio breakdown">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-[260px] w-full rounded-lg" />
          </div>
        ) : isError ? (
          <div role="alert" className="h-[260px] mt-3 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed rounded-lg border-destructive/30 bg-destructive/5" data-testid="state-portfolio-error">
            <AlertTriangle className="h-8 w-8 text-destructive mb-3" />
            <h4 className="font-semibold mb-1">Could not load portfolio value</h4>
            <p className="text-sm text-muted-foreground mb-4">Nothing is shown rather than a wrong total. Please try again.</p>
            <Button variant="outline" onClick={() => refetch()} data-testid="button-portfolio-retry">
              <RefreshCw className="h-4 w-4 mr-2" /> Retry
            </Button>
          </div>
        ) : !dim ? (
          <div role="alert" className="h-[200px] mt-3 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed rounded-lg">
            <p className="text-sm text-muted-foreground mb-3">This breakdown was not returned.</p>
            <Button variant="outline" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl bg-primary/5 border border-primary/10 p-3" data-testid="portfolio-summary">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {isWishlist ? "Wishlist snapshot (not owned)" : "Owned total"}
                </p>
                <p className="text-xl font-black tracking-tight text-primary tabular-nums truncate" data-testid="text-portfolio-total">
                  {formatCurrency(dim.totalValue)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cards</p>
                <p className="text-xl font-black tracking-tight tabular-nums">{dim.cardCount.toLocaleString()}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Valuation coverage</p>
                <p className="text-sm font-semibold tabular-nums" data-testid="text-portfolio-coverage">
                  {coverage === null ? "No cards" : `${coverage.toFixed(1)}% priced`}
                  {dim.unvaluedCount > 0 && (
                    <span className="text-muted-foreground font-normal"> · {dim.unvaluedCount.toLocaleString()} unpriced</span>
                  )}
                </p>
                {coverage !== null && (
                  <div className="h-1.5 mt-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                    <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${coverage}%` }} />
                  </div>
                )}
              </div>
            </div>

            {pending && (
              <div role="status" className="flex items-center gap-2 text-xs rounded-lg bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2" data-testid="status-portfolio-metadata">
                {!pollsExhausted && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
                <span>
                  {pollsExhausted
                    ? "Some catalog details remain unresolved. Refresh loads another batch."
                    : "Fetching authoritative card metadata. This view updates automatically."}
                </span>
              </div>
            )}

            {/* Chart */}
            {groups.length === 0 ? (
              <div className="h-[220px] flex flex-col items-center justify-center text-center p-6 border-2 border-dashed rounded-lg bg-muted/10" data-testid="state-portfolio-empty">
                <Layers className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
                <h4 className="text-lg font-medium mb-1">{isWishlist ? "Nothing on your wishlist" : "No value to show yet"}</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  {isWishlist ? "Wishlist cards with saved values appear here." : "Add cards to see your portfolio distribution."}
                </p>
                <Link href={isWishlist ? "/wishlist" : "/collection/new"}>
                  <Button variant="outline">{isWishlist ? "Open Wishlist" : "Add Your First Card"}</Button>
                </Link>
              </div>
            ) : allUnpriced ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900" role="status">
                <p className="font-semibold">No saved prices yet</p>
                <p className="mt-1">These {dim.cardCount.toLocaleString()} cards are included in your counts, but their value is unknown. No zero-value bars are shown.</p>
              </div>
            ) : (
              <div
                className={horizontal ? "max-h-[360px] overflow-y-auto overscroll-contain pr-1" : ""}
                tabIndex={horizontal ? 0 : undefined}
                role="img"
                aria-label={`${meta.title}: ${groups.length} groups, total ${formatCurrency(dim.totalValue)}. Full values are in the details table below.`}
              >
                <div style={{ height: chartHeight }} className="w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    {horizontal ? (
                      <BarChart data={groups} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap={6}>
                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={axisCurrency} />
                        <YAxis type="category" dataKey="label" width={labelWidth} interval={0} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={truncate} />
                        <Tooltip cursor={{ fill: "hsl(var(--muted)/0.5)" }} content={<PortfolioTooltip unit={unit} />} />
                        <Bar dataKey="totalValue" radius={[0, 4, 4, 0]} animationDuration={500}>
                          {groups.map((g, i) => <Cell key={g.key} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    ) : (
                      <BarChart data={groups} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <XAxis type="category" dataKey="label" interval={0} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis type="number" axisLine={false} tickLine={false} width={64} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={axisCurrency} />
                        <Tooltip cursor={{ fill: "hsl(var(--muted)/0.5)" }} content={<PortfolioTooltip unit={unit} />} />
                        <Bar dataKey="totalValue" radius={[4, 4, 0, 0]} animationDuration={500}>
                          {groups.map((g, i) => <Cell key={g.key} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {!allUnpriced && unpricedGroups.length > 0 && (
              <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
                {unpricedGroups.length} {unpricedGroups.length === 1 ? "group has" : "groups have"} no saved prices. They are marked Unpriced in the expanded table below, not valued at zero.
              </p>
            )}
            {dim.note && (
              <p className="text-xs text-muted-foreground" data-testid="text-portfolio-note">{dim.note}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {isWishlist
                ? "Values are the sum of last-seen wishlist prices, separate from owned collection value."
                : "Values are the sum of saved estimated values."} Unpriced cards are excluded from value totals, not valued at zero.
              {dimKey === "sale_status" && " Sale state is the For sale flag on each card, not a sum of asking prices."}
              {dimKey === "binder" && " A card in more than one binder appears in each, so binder totals can overlap."}
              {dimKey === "year" && " Cards without release metadata show as Unavailable."}
            </p>

            {groups.length > 0 && (
              <details key={dimKey} open={unpricedGroups.length > 0} className="group rounded-lg border" data-testid="details-portfolio-table">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
                  View all {groups.length} groups as a table
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="max-h-[320px] overflow-auto border-t">
                  <table className="w-full text-sm">
                    <caption className="sr-only">{meta.title}</caption>
                    <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="text-left font-medium px-3 py-2">Group</th>
                        <th scope="col" className="text-right font-medium px-3 py-2">Value</th>
                        <th scope="col" className="text-right font-medium px-3 py-2">Cards</th>
                        <th scope="col" className="text-right font-medium px-3 py-2">Unpriced</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {groups.map((g, i) => (
                        <tr key={g.key} data-testid={`row-portfolio-${g.key}`}>
                          <th scope="row" className="text-left font-medium px-3 py-2 break-words">
                            <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ background: COLORS[i % COLORS.length] }} aria-hidden="true" />
                            {g.label}
                            {g.unvaluedCount === g.cardCount && <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">Unpriced</span>}
                          </th>
                          <td className="text-right px-3 py-2 tabular-nums">{g.unvaluedCount === g.cardCount ? "Unpriced" : formatCurrency(g.totalValue)}</td>
                          <td className="text-right px-3 py-2 tabular-nums">{g.cardCount.toLocaleString()}</td>
                          <td className="text-right px-3 py-2 tabular-nums">{g.unvaluedCount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PortfolioValueChart;

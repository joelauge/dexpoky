import { useGetInventoryStats, useGetValueByCategory, useGetRecentActivity, useListCards } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/constants";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import {
  Activity, CreditCard, DollarSign, TrendingUp, Layers, ArrowRight,
  PackagePlus, Edit3, ScanLine, Tag, ShoppingCart, XCircle, Gavel, Bell,
  Link2, Eye, MessageCircle, BadgeCheck, Store,
} from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card-item";
import { formatDistanceToNow } from "date-fns";
import { WelcomeBackModal } from "@/components/welcome-back-modal";

type ActivityEventType =
  | "card_added"
  | "card_updated"
  | "card_scanned"
  | "listing_created"
  | "listing_sold"
  | "listing_cancelled"
  | "bid_placed"
  | "wanted_listing_match";

interface ActivityEvent {
  id: number;
  type: ActivityEventType;
  clerkId: string | null;
  cardId: number | null;
  listingId: number | null;
  metadata: {
    name?: string | null;
    imageUrl?: string | null;
    price?: number | null;
    amount?: number | null;
    listingType?: string | null;
    listingUrl?: string | null;
  } | null;
  createdAt: string;
}

interface TradingStats {
  activeListings: number;
  soldListings: number;
  totalRevenue: number;
  totalViews: number;
  linksShared: number;
  offersIn: number;
}

const EVENT_CONFIG: Record<ActivityEventType, {
  icon: React.ElementType;
  color: string;
  bg: string;
  label: (meta: ActivityEvent["metadata"]) => string;
  href: (event: ActivityEvent) => string | null;
}> = {
  card_added: {
    icon: PackagePlus,
    color: "text-green-600",
    bg: "bg-green-50",
    label: (m) => `Added "${m?.name ?? "card"}" to collection`,
    href: (e) => e.cardId ? `/collection/${e.cardId}` : null,
  },
  card_scanned: {
    icon: ScanLine,
    color: "text-blue-600",
    bg: "bg-blue-50",
    label: (m) => `Scanned "${m?.name ?? "card"}"`,
    href: (e) => e.cardId ? `/collection/${e.cardId}` : null,
  },
  card_updated: {
    icon: Edit3,
    color: "text-amber-600",
    bg: "bg-amber-50",
    label: (m) => `Updated "${m?.name ?? "card"}"`,
    href: (e) => e.cardId ? `/collection/${e.cardId}` : null,
  },
  listing_created: {
    icon: Tag,
    color: "text-purple-600",
    bg: "bg-purple-50",
    label: (m) => `Listed "${m?.name ?? "card"}" for ${m?.price != null ? formatCurrency(m.price) : "?"}`,
    href: (e) => e.listingId ? `/marketplace/${e.listingId}` : null,
  },
  listing_sold: {
    icon: ShoppingCart,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    label: (m) => `"${m?.name ?? "card"}" sold for ${m?.price != null ? formatCurrency(m.price) : "?"}`,
    href: (e) => e.listingId ? `/marketplace/${e.listingId}` : null,
  },
  listing_cancelled: {
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-50",
    label: (m) => `Listing cancelled for "${m?.name ?? "card"}"`,
    href: (e) => e.cardId ? `/collection/${e.cardId}` : null,
  },
  bid_placed: {
    icon: Gavel,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    label: (m) => `Bid ${m?.amount != null ? formatCurrency(m.amount) : "?"} on "${m?.name ?? "card"}"`,
    href: (e) => e.listingId ? `/marketplace/${e.listingId}` : null,
  },
  wanted_listing_match: {
    icon: Bell,
    color: "text-yellow-600",
    bg: "bg-yellow-50",
    label: (m) => `"${m?.name ?? "A card"}" you're looking for is now listed${m?.price != null ? ` for ${formatCurrency(m.price)}` : ""}`,
    href: (e) => e.listingId ? `/marketplace/${e.listingId}` : null,
  },
};

function ActivityEventRow({ event }: { event: ActivityEvent }) {
  const config = EVENT_CONFIG[event.type] ?? EVENT_CONFIG.card_added;
  const Icon = config.icon;
  const href = config.href(event);
  const label = config.label(event.metadata);
  const imageUrl = event.metadata?.imageUrl;

  const inner = (
    <div className="p-4 hover:bg-muted/40 transition-colors cursor-pointer flex items-start gap-3">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-10 w-10 object-contain flex-shrink-0 rounded" />
      ) : (
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${config.bg}`}>
          <Icon className={`h-5 w-5 ${config.color}`} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug truncate">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
        </p>
      </div>
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

interface TradeStatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
  iconBg: string;
  loading?: boolean;
  href?: string;
}

function TradeStatCard({ icon: Icon, label, value, sub, accent, iconBg, loading, href }: TradeStatCardProps) {
  const inner = (
    <CardContent className="p-4 group">
      <div className={`inline-flex items-center justify-center p-1.5 rounded-lg ${iconBg} mb-2.5`}>
        <Icon className={`h-3.5 w-3.5 ${accent}`} />
      </div>
      {loading
        ? <Skeleton className="h-6 w-16 mb-1" />
        : <p className={`text-xl font-black tracking-tight leading-none ${accent}`}>{value}</p>}
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-none mt-1.5 truncate">{label}</p>
      {href && (
        <ArrowRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors mt-1.5" />
      )}
    </CardContent>
  );

  return (
    <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow overflow-hidden">
      {href ? <Link href={href}>{inner}</Link> : inner}
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useUser();
  const { data: stats, isLoading: statsLoading } = useGetInventoryStats();
  const { data: categoryData, isLoading: categoryLoading } = useGetValueByCategory();
  const { data: recentActivityRaw, isLoading: activityLoading } = useGetRecentActivity({ limit: 10 });
  const { data: recentCards, isLoading: cardsLoading } = useListCards({ categoryId: undefined });
  const { data: tradingStats, isLoading: tradingLoading } = useQuery<TradingStats>({
    queryKey: ["trading-stats"],
    queryFn: () => fetch("/api/inventory/trading-stats").then(r => r.json()),
  });

  const recentActivity = (recentActivityRaw ?? []) as unknown as ActivityEvent[];

  const recentCardsSlice = (recentCards ?? [])
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4);

  const CHART_COLORS = [
    "hsl(var(--primary))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
  ];

  const username = user?.firstName || user?.username || null;

  return (
    <Layout>
      <WelcomeBackModal username={username} />

      <div className="pb-10">
        {/* Compact page header */}
        <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold tracking-tight">Trading Dashboard</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Your live marketplace & collection stats</p>
            </div>
            <Link href="/share">
              <Button size="sm" className="shrink-0 font-semibold rounded-xl">
                <Tag className="h-3.5 w-3.5 mr-1.5" /> Create listing
              </Button>
            </Link>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">

          {/* ── Trading Stats Grid ── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Trading Activity</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <TradeStatCard
                icon={Store}
                label="Listed"
                value={tradingStats?.activeListings ?? 0}
                sub="active on market"
                accent="text-purple-600"
                iconBg="bg-purple-50"
                loading={tradingLoading}
                href="/marketplace"
              />
              <TradeStatCard
                icon={Eye}
                label="Listing Views"
                value={(tradingStats?.totalViews ?? 0).toLocaleString()}
                sub="total clicks"
                accent="text-sky-600"
                iconBg="bg-sky-50"
                loading={tradingLoading}
              />
              <TradeStatCard
                icon={MessageCircle}
                label="Offers In"
                value={tradingStats?.offersIn ?? 0}
                sub="trade threads"
                accent="text-orange-600"
                iconBg="bg-orange-50"
                loading={tradingLoading}
                href="/inbox"
              />
              <TradeStatCard
                icon={Link2}
                label="Links Shared"
                value={tradingStats?.linksShared ?? 0}
                sub="share links created"
                accent="text-indigo-600"
                iconBg="bg-indigo-50"
                loading={tradingLoading}
                href="/share"
              />
              <TradeStatCard
                icon={BadgeCheck}
                label="Cards Sold"
                value={tradingStats?.soldListings ?? 0}
                sub="completed sales"
                accent="text-emerald-600"
                iconBg="bg-emerald-50"
                loading={tradingLoading}
              />
              <TradeStatCard
                icon={DollarSign}
                label="Revenue"
                value={formatCurrency(tradingStats?.totalRevenue ?? 0)}
                sub="from sales"
                accent="text-primary"
                iconBg="bg-primary/10"
                loading={tradingLoading}
              />
            </div>
          </div>

          {/* ── Collection Stats Row ── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Collection</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <TradeStatCard
                icon={DollarSign}
                label="Total Value"
                value={formatCurrency(stats?.totalValue)}
                accent="text-primary"
                iconBg="bg-primary/10"
                loading={statsLoading}
              />
              <TradeStatCard
                icon={CreditCard}
                label="Total Cards"
                value={(stats?.totalCards ?? 0).toLocaleString()}
                accent="text-blue-600"
                iconBg="bg-blue-50"
                loading={statsLoading}
                href="/collection"
              />
              <TradeStatCard
                icon={TrendingUp}
                label="For Sale Value"
                value={formatCurrency(stats?.forSaleValue)}
                accent="text-emerald-600"
                iconBg="bg-emerald-50"
                loading={statsLoading}
              />
              <TradeStatCard
                icon={Layers}
                label="Categories"
                value={stats?.categoryCount ?? 0}
                accent="text-violet-600"
                iconBg="bg-violet-50"
                loading={statsLoading}
                href="/categories"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Charts + Recent */}
            <div className="lg:col-span-2 space-y-8">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle>Portfolio Value by Category</CardTitle>
                  <CardDescription>Value distribution across your collection categories</CardDescription>
                </CardHeader>
                <CardContent>
                  {categoryLoading ? (
                    <div className="h-[260px] flex items-center justify-center">
                      <Skeleton className="h-full w-full rounded-lg" />
                    </div>
                  ) : categoryData && categoryData.length > 0 ? (
                    <div className="h-[260px] w-full mt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <XAxis dataKey="categoryName" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${v}`} />
                          <Tooltip
                            cursor={{ fill: "hsl(var(--muted)/0.5)" }}
                            contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                            formatter={(value: number) => [formatCurrency(value), "Value"]}
                          />
                          <Bar dataKey="totalValue" radius={[4, 4, 0, 0]}>
                            {categoryData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[260px] flex flex-col items-center justify-center text-center p-6 border-2 border-dashed rounded-lg bg-muted/10">
                      <Layers className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
                      <h4 className="text-lg font-medium mb-1">No Category Data</h4>
                      <p className="text-sm text-muted-foreground mb-4">Add cards to categories to see your portfolio distribution.</p>
                      <Link href="/collection/new">
                        <Button variant="outline">Add Your First Card</Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Additions</p>
                  <Link href="/collection">
                    <Button variant="ghost" size="sm" className="gap-1">
                      View All <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>

                {cardsLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl" />)}
                  </div>
                ) : recentCardsSlice.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {recentCardsSlice.map(card => (
                      <CardItem key={card.id} card={card} href={`/collection/${card.id}`} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-8 border-2 border-dashed rounded-lg bg-muted/10">
                    <p className="text-muted-foreground mb-4">Your collection is empty.</p>
                    <Link href="/collection/new"><Button>Add Card</Button></Link>
                  </div>
                )}
              </div>
            </div>

            {/* Activity Feed */}
            <div>
              <Card className="shadow-sm max-h-[680px] flex flex-col">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-auto flex-1">
                  {activityLoading ? (
                    <div className="p-6 space-y-4">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="flex gap-3">
                          <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
                          <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-3 w-1/2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : recentActivity.length > 0 ? (
                    <div className="divide-y">
                      {recentActivity.map(event => (
                        <ActivityEventRow key={event.id} event={event} />
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
                      <Activity className="h-8 w-8 mb-2 opacity-20" />
                      <p className="text-sm font-medium">No activity yet</p>
                      <p className="text-xs mt-1">Events appear as you add cards, list items, and place bids.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

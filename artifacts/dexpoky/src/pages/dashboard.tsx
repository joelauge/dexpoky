import { useGetInventoryStats, useGetValueByCategory, useGetRecentActivity, useListCards } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/constants";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, AreaChart, Area } from "recharts";
import { Activity, CreditCard, DollarSign, TrendingUp, Layers, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card-item";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetInventoryStats();
  const { data: categoryData, isLoading: categoryLoading } = useGetValueByCategory();
  const { data: recentActivity, isLoading: activityLoading } = useGetRecentActivity({ limit: 5 });
  const { data: recentCards, isLoading: cardsLoading } = useListCards({ categoryId: undefined });

  // Sort recent cards by estimated value descending, then take top 4
  const recentCardsSlice = (recentCards ?? [])
    .slice()
    .sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0))
    .slice(0, 4);

  const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  return (
    <Layout>
      <div className="pb-10">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-background border-b relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4wNSkiLz48L3N2Zz4=')] opacity-50" />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-2">
              Welcome back to DexPoky
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Your collection command center. Track values, manage inventory, and trade with other collectors.
            </p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="shadow-sm border-border/50">
              <CardContent className="p-5 flex items-center gap-3">
                <div className="bg-primary/10 p-3 rounded-xl shrink-0">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Value</p>
                  {statsLoading ? <Skeleton className="h-7 w-24 mt-1" /> : (
                    <h3 className="text-xl font-bold tracking-tight truncate">{formatCurrency(stats?.totalValue)}</h3>
                  )}
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-sm border-border/50">
              <CardContent className="p-5 flex items-center gap-3">
                <div className="bg-blue-500/10 p-3 rounded-xl shrink-0">
                  <CreditCard className="h-5 w-5 text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Cards</p>
                  {statsLoading ? <Skeleton className="h-7 w-16 mt-1" /> : (
                    <h3 className="text-xl font-bold tracking-tight">{stats?.totalCards || 0}</h3>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/50">
              <CardContent className="p-5 flex items-center gap-3">
                <div className="bg-emerald-500/10 p-3 rounded-xl shrink-0">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">For Sale Value</p>
                  {statsLoading ? <Skeleton className="h-7 w-24 mt-1" /> : (
                    <h3 className="text-xl font-bold tracking-tight truncate">{formatCurrency(stats?.forSaleValue)}</h3>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/50">
              <CardContent className="p-5 flex items-center gap-3">
                <div className="bg-purple-500/10 p-3 rounded-xl shrink-0">
                  <Layers className="h-5 w-5 text-purple-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Listings</p>
                  {statsLoading ? <Skeleton className="h-7 w-16 mt-1" /> : (
                    <h3 className="text-xl font-bold tracking-tight">{stats?.totalListings || 0}</h3>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Charts Area */}
            <div className="lg:col-span-2 space-y-8">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle>Portfolio Value by Category</CardTitle>
                  <CardDescription>Value distribution across your collection categories</CardDescription>
                </CardHeader>
                <CardContent>
                  {categoryLoading ? (
                    <div className="h-[300px] flex items-center justify-center">
                      <Skeleton className="h-full w-full rounded-lg" />
                    </div>
                  ) : categoryData && categoryData.length > 0 ? (
                    <div className="h-[300px] w-full mt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <XAxis dataKey="categoryName" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                            tickFormatter={(value) => `$${value}`}
                          />
                          <Tooltip 
                            cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                            contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            formatter={(value: number) => [formatCurrency(value), 'Value']}
                          />
                          <Bar dataKey="totalValue" radius={[4, 4, 0, 0]}>
                            {categoryData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[300px] flex flex-col items-center justify-center text-center p-6 border-2 border-dashed rounded-lg bg-muted/10">
                      <Layers className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
                      <h4 className="text-lg font-medium text-foreground mb-1">No Category Data</h4>
                      <p className="text-sm text-muted-foreground mb-4">Add cards to categories to see your portfolio distribution.</p>
                      <Link href="/collection/new">
                        <Button variant="outline">Add Your First Card</Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Cards Preview */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold tracking-tight">Recent Additions</h2>
                  <Link href="/collection">
                    <Button variant="ghost" size="sm" className="gap-1">
                      View All <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
                
                {cardsLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                      <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl" />
                    ))}
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
                    <Link href="/collection/new">
                      <Button>Add Card</Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar / Activity Feed */}
            <div className="space-y-6">
              <Card className="shadow-sm h-full max-h-[600px] flex flex-col">
                <CardHeader className="pb-4 border-b">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-auto flex-1">
                  {activityLoading ? (
                    <div className="p-6 space-y-4">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="flex gap-3">
                          <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                          <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-3 w-2/3" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : recentActivity && recentActivity.length > 0 ? (
                    <div className="divide-y">
                      {recentActivity.map((card) => (
                        <Link key={card.id} href={`/collection/${card.id}`}>
                          <div className="p-4 hover:bg-muted/50 transition-colors cursor-pointer flex items-center gap-3">
                            {card.imageUrl && <img src={card.imageUrl} alt={card.name} className="h-10 w-10 object-contain flex-shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{card.name}</p>
                              <div className="flex justify-between items-center mt-0.5">
                                <p className="text-xs text-muted-foreground truncate">{card.setName ?? card.pokemonName}</p>
                                <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{card.createdAt ? new Date(card.createdAt).toLocaleDateString() : ""}</span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
                      <Activity className="h-8 w-8 mb-2 opacity-20" />
                      <p className="text-sm">No recent activity</p>
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
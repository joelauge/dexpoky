import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useListPokemonSets, useListCards } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, Library, CheckCircle2, AlertCircle } from "lucide-react";
import type { PokemonSetSummary, Card as OwnedCard } from "@workspace/api-client-react";
import { getSetCompletion } from "@/lib/set-completion";

export default function SetsIndex() {
  useEffect(() => {
    document.title = "Sets | DexPoky";
  }, []);

  const [search, setSearch] = useState("");
  
  const { data: sets, isLoading: setsLoading, error: setsError } = useListPokemonSets();
  const { data: ownedCards, isLoading: cardsLoading, error: cardsError } = useListCards();

  const isLoading = setsLoading || cardsLoading;

  const { groupedSets, seriesList } = useMemo(() => {
    if (!sets) return { groupedSets: new Map<string, PokemonSetSummary[]>(), seriesList: [] };

    // Apply search filter
    const lowerSearch = search.toLowerCase();
    const filteredSets = sets.filter(s => 
      s.name.toLowerCase().includes(lowerSearch) || 
      (s.seriesName && s.seriesName.toLowerCase().includes(lowerSearch))
    );

    // Group by series
    const groups = new Map<string, PokemonSetSummary[]>();
    for (const set of filteredSets) {
      const series = set.seriesName || "Other";
      if (!groups.has(series)) groups.set(series, []);
      groups.get(series)!.push(set);
    }

    // Sort sets within series by release date descending
    for (const seriesSets of groups.values()) {
      seriesSets.sort((a, b) => {
        const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
        const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
        return dateB - dateA; // Newest first
      });
    }

    // Sort series by newest set release date descending
    const sortedSeries = Array.from(groups.keys()).sort((a, b) => {
      const maxDateA = Math.max(...groups.get(a)!.map(s => s.releaseDate ? new Date(s.releaseDate).getTime() : 0));
      const maxDateB = Math.max(...groups.get(b)!.map(s => s.releaseDate ? new Date(s.releaseDate).getTime() : 0));
      return maxDateB - maxDateA;
    });

    return { groupedSets: groups, seriesList: sortedSeries };
  }, [sets, search]);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                <Library className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Expansions</h1>
            </div>
            <p className="text-muted-foreground max-w-xl">
              Track your collection progress across every Pokémon TCG set ever released.
            </p>
          </div>

          <div className="relative w-full md:w-80 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sets or series..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-muted/60 focus-visible:ring-primary/50 rounded-xl shadow-sm h-11"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-12">
            {[1, 2].map((i) => (
              <div key={i}>
                <Skeleton className="h-8 w-48 mb-6" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((j) => (
                    <Skeleton key={j} className="h-[140px] rounded-2xl" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : setsError || cardsError ? (
          <div className="text-center py-24 border-2 border-dashed border-destructive/20 rounded-3xl bg-destructive/5">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Sets couldn&apos;t be loaded</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Check your connection and try refreshing this page.
            </p>
          </div>
        ) : seriesList.length === 0 ? (
          <div className="text-center py-24 border-2 border-dashed border-muted/50 rounded-3xl bg-muted/10">
            <Library className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No sets found</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              We couldn't find any sets matching "{search}". Try a different search term.
            </p>
          </div>
        ) : (
          <div className="space-y-16">
            {seriesList.map((series) => {
              const seriesSets = groupedSets.get(series)!;
              
              return (
                <div key={series} className="space-y-6">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground/90">{series}</h2>
                    <Badge variant="secondary" className="bg-secondary/50 text-secondary-foreground text-xs font-semibold px-2.5 py-0.5 rounded-full">
                      {seriesSets.length} Set{seriesSets.length !== 1 && 's'}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {seriesSets.map((set) => {
                      const ownedCount = ownedCards ? getSetCompletion(set, ownedCards).ownedCount : 0;
                      const progress = set.totalCards > 0 ? Math.min(100, Math.round((ownedCount / set.totalCards) * 100)) : 0;
                      const isComplete = progress === 100 && set.totalCards > 0;
                      const hasStarted = ownedCount > 0;

                      return (
                        <Link key={set.id} href={`/sets/${set.id}`}>
                          <Card className={`group relative overflow-hidden h-full rounded-2xl cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border ${
                            isComplete 
                              ? "border-amber-200 bg-gradient-to-b from-amber-50/50 to-white dark:from-amber-950/20 dark:to-card dark:border-amber-900/50" 
                              : hasStarted
                              ? "border-primary/20 bg-gradient-to-b from-primary/5 to-card hover:border-primary/40"
                              : "border-border/50 bg-card/50 hover:bg-card hover:border-border"
                          }`}>
                            
                            {/* Decorative background blur for logo */}
                            {set.logoUrl && (
                              <div className="absolute right-0 top-0 w-32 h-32 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-500 pointer-events-none translate-x-4 -translate-y-4">
                                <img src={set.logoUrl} alt="" className="w-full h-full object-contain" />
                              </div>
                            )}

                            <CardContent className="p-5 flex flex-col h-full">
                              <div className="flex justify-between items-start gap-3 mb-4">
                                <div className="h-12 w-24 shrink-0 flex items-center justify-start">
                                  {set.logoUrl ? (
                                    <img 
                                      src={set.logoUrl} 
                                      alt={`${set.name} logo`} 
                                      className="max-h-full max-w-full object-contain filter drop-shadow-sm group-hover:scale-105 transition-transform duration-300"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="text-sm font-semibold text-muted-foreground line-clamp-2">{set.name}</div>
                                  )}
                                </div>
                                {set.symbolUrl && (
                                  <div className="h-6 w-6 shrink-0 rounded-full bg-background/50 p-1 flex items-center justify-center shadow-sm">
                                    <img src={set.symbolUrl} alt="" className="max-h-full max-w-full object-contain" />
                                  </div>
                                )}
                              </div>

                              <div className="mt-auto space-y-3">
                                <div>
                                  <h3 className="font-semibold text-base line-clamp-1 group-hover:text-primary transition-colors">
                                    {set.name}
                                  </h3>
                                  <div className="flex items-center text-xs text-muted-foreground mt-1">
                                    <span>{set.releaseDate ? new Date(set.releaseDate).getFullYear() : "Unknown"}</span>
                                    <span className="mx-1.5">•</span>
                                    <span>{set.totalCards} cards</span>
                                  </div>
                                </div>

                                <div className="space-y-1.5 pt-2">
                                  <div className="flex items-center justify-between text-xs font-medium">
                                    <span className={isComplete ? "text-amber-600 dark:text-amber-500 flex items-center gap-1" : hasStarted ? "text-primary" : "text-muted-foreground"}>
                                      {isComplete && <CheckCircle2 className="h-3.5 w-3.5" />}
                                      {ownedCount} / {set.totalCards}
                                    </span>
                                    <span className={isComplete ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}>
                                      {progress}%
                                    </span>
                                  </div>
                                  <div className="h-2 w-full bg-secondary overflow-hidden rounded-full">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-1000 ease-out ${
                                        isComplete ? "bg-amber-400 dark:bg-amber-500" : hasStarted ? "bg-primary" : "bg-transparent"
                                      }`}
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

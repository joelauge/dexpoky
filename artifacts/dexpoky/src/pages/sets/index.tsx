import { useState, useMemo, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useListPokemonSets, useListCards } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Library, Clock3, AlertCircle, ArrowUpDown } from "lucide-react";
import type { PokemonSetSummary } from "@workspace/api-client-react";
import { getSetCompletion } from "@/lib/set-completion";
import { ExpansionCard } from "@/components/sets/expansion-card";
import { getRecentSetActivity } from "@/lib/recent-set-activity";
import { useRecentSetVisits } from "@/hooks/use-recent-set-visits";

type SetSortOrder =
  | "release-desc"
  | "release-asc"
  | "name-asc"
  | "name-desc"
  | "completion-desc"
  | "completion-asc";

const SET_SORT_STORAGE_KEY = "dexpoky:sets:sort-order";
const DEFAULT_SET_SORT: SetSortOrder = "release-desc";
const VALID_SET_SORTS = new Set<SetSortOrder>([
  "release-desc",
  "release-asc",
  "name-asc",
  "name-desc",
  "completion-desc",
  "completion-asc",
]);

export default function SetsIndex() {
  useEffect(() => {
    document.title = "Sets | DexPoky";
  }, []);

  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<SetSortOrder>(() => {
    if (typeof window === "undefined") return DEFAULT_SET_SORT;
    const savedSort = window.localStorage.getItem(SET_SORT_STORAGE_KEY) as SetSortOrder | null;
    return savedSort && VALID_SET_SORTS.has(savedSort) ? savedSort : DEFAULT_SET_SORT;
  });

  useEffect(() => {
    window.localStorage.setItem(SET_SORT_STORAGE_KEY, sortOrder);
  }, [sortOrder]);
  
  const { data: sets, isLoading: setsLoading, error: setsError } = useListPokemonSets();
  const { data: ownedCards, isLoading: cardsLoading, error: cardsError } = useListCards();
  const { visits, storageAvailable } = useRecentSetVisits();

  const isLoading = setsLoading || cardsLoading;
  const recentSets = useMemo(
    () => getRecentSetActivity(sets ?? [], ownedCards ?? [], visits),
    [sets, ownedCards, visits],
  );

  const sortedSets = useMemo(() => {
    if (!sets) return [];

    // Apply search filter
    const lowerSearch = search.toLowerCase();
    const filteredSets = sets.filter(s => 
      s.name.toLowerCase().includes(lowerSearch) || 
      (s.seriesName && s.seriesName.toLowerCase().includes(lowerSearch))
    );

    const getReleaseTime = (set: PokemonSetSummary) =>
      set.releaseDate ? new Date(set.releaseDate).getTime() : 0;
    const getCompletion = (set: PokemonSetSummary) => {
      if (!ownedCards || set.totalCards <= 0) return 0;
      return getSetCompletion(set, ownedCards).ownedCount / set.totalCards;
    };
    const compareSets = (a: PokemonSetSummary, b: PokemonSetSummary) => {
      switch (sortOrder) {
        case "release-asc":
          return getReleaseTime(a) - getReleaseTime(b);
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "completion-desc":
          return getCompletion(b) - getCompletion(a) || a.name.localeCompare(b.name);
        case "completion-asc":
          return getCompletion(a) - getCompletion(b) || a.name.localeCompare(b.name);
        case "release-desc":
        default:
          return getReleaseTime(b) - getReleaseTime(a);
      }
    };

    return [...filteredSets].sort(compareSets);
  }, [sets, ownedCards, search, sortOrder]);

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

          <div className="flex w-full md:w-auto flex-col sm:flex-row gap-3 shrink-0">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sets or series..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-card border-muted/60 focus-visible:ring-primary/50 rounded-xl shadow-sm h-11"
              />
            </div>
            <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as SetSortOrder)}>
              <SelectTrigger className="w-full sm:w-52 h-11 rounded-xl bg-card border-muted/60 shadow-sm">
                <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue aria-label="Sort sets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="release-desc">Newest first</SelectItem>
                <SelectItem value="release-asc">Oldest first</SelectItem>
                <SelectItem value="name-asc">Name: A–Z</SelectItem>
                <SelectItem value="name-desc">Name: Z–A</SelectItem>
                <SelectItem value="completion-desc">Most complete</SelectItem>
                <SelectItem value="completion-asc">Least complete</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {!isLoading && !setsError && !cardsError && !search.trim() && (
          <section aria-labelledby="recent-sets-heading" className="mb-8 min-w-0" data-testid="recent-sets-section">
            <div className="mb-4">
              <h2 id="recent-sets-heading" className="flex items-center gap-2 text-lg font-semibold">
                <Clock3 className="h-5 w-5 text-primary" aria-hidden /> Recently active
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Sets you’ve opened or changed cards in, latest first.</p>
              {!storageAvailable && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Visit history is unavailable in this browser. Card activity is still shown.</p>}
            </div>
            {recentSets.length ? (
              <ul className="flex gap-4 overflow-x-auto overscroll-x-contain snap-x snap-proximity pb-3 pt-1"
                aria-label="Recently active expansions" tabIndex={0} data-testid="recent-sets-row">
                {recentSets.map((activity) => (
                  <li key={activity.set.id} className="w-60 max-w-[80vw] shrink-0 snap-start">
                    <ExpansionCard set={activity.set} ownedCount={ownedCards ? getSetCompletion(activity.set, ownedCards).ownedCount : 0} activity={activity} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed bg-muted/10 p-5 text-sm text-muted-foreground" data-testid="recent-sets-empty">
                Open an expansion or add cards to a set to find it here next time.
              </p>
            )}
          </section>
        )}

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
        ) : sortedSets.length === 0 ? (
          <div className="text-center py-24 border-2 border-dashed border-muted/50 rounded-3xl bg-muted/10">
            <Library className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No sets found</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              We couldn't find any sets matching "{search}". Try a different search term.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {sortedSets.map((set) => (
              <ExpansionCard key={set.id} set={set} ownedCount={ownedCards ? getSetCompletion(set, ownedCards).ownedCount : 0} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

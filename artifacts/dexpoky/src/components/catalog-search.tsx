import { useState, useEffect, useMemo } from "react";
import { useSearchCatalog, type CatalogCard } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Search, Loader2, AlertTriangle } from "lucide-react";

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

interface CatalogSearchProps {
  placeholder?: string;
  onSelect: (card: CatalogCard) => void;
  /** Hide cards whose ids are in this set (already in the deck/wishlist). */
  excludeIds?: Set<string>;
  /** Render the result tile differently when this card is already chosen. */
  selectedIds?: Set<string>;
  autoFocus?: boolean;
  emptyHint?: string;
  limit?: number;
}

export function CatalogSearch({
  placeholder = "Search by Pokémon, set, or number…",
  onSelect,
  excludeIds,
  selectedIds,
  autoFocus,
  emptyHint = "Type a Pokémon, set name, or card number to begin.",
  limit = 24,
}: CatalogSearchProps) {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 350);
  const enabled = debounced.length >= 2;

  const { data, isFetching, isError } = useSearchCatalog(
    { q: debounced || "x", limit },
    {
      query: {
        enabled,
        staleTime: 60_000,
        queryKey: ["/api/catalog/search", debounced, limit] as const,
        refetchInterval: (query) => query.state.data?.enrichmentPending ? 750 : false,
      },
    },
  );

  const visible = useMemo(() => {
    const all = data?.results ?? [];
    if (!excludeIds) return all;
    return all.filter((c) => !excludeIds.has(c.id));
  }, [data, excludeIds]);

  const showEmpty = enabled && !isFetching && visible.length === 0 && !isError;
  const source = String(data?.source ?? "");

  return (
    <div className="flex flex-col min-h-0">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
          autoFocus={autoFocus}
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {data?.rateLimited && (
        <div className="flex items-center gap-2 mb-3 text-xs px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Catalog limit reached — showing fallback results
          {source === "mixed" ? " from TCGdex and TCGCSV." : source === "tcgcsv" ? " from TCGCSV." : " from TCGdex."}
        </div>
      )}
      {source === "tcgdex" && !data?.rateLimited && (
        <div className="text-[10px] text-muted-foreground mb-2">
          Results from TCGdex
        </div>
      )}
      {source === "tcgcsv" && (
        <div className="text-[10px] text-muted-foreground mb-2">
          Results from TCGCSV
        </div>
      )}
      {source === "mixed" && (
        <div className="text-[10px] text-muted-foreground mb-2">
          Results from multiple catalogs, including TCGCSV
        </div>
      )}

      <div className="overflow-y-auto flex-1 -mx-1 px-1">
        {!enabled && emptyHint && (
          <p className="text-sm text-muted-foreground text-center py-8 px-4">
            {emptyHint}
          </p>
        )}
        {isError && enabled && (
          <p className="text-sm text-destructive text-center py-8">
            Search failed. Please try again.
          </p>
        )}
        {showEmpty && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No matches for "{debounced}".
          </p>
        )}
        {visible.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {visible.map((c) => {
              const selected = selectedIds?.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c)}
                  className={`text-left rounded-lg border-2 transition-all overflow-hidden ${
                    selected
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-primary/60"
                  }`}
                >
                  <div className="aspect-[3/4] bg-muted/30 relative flex items-center justify-center">
                    {c.imageUrl ? (
                      <img
                        src={c.imageUrl}
                        alt={c.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <img src="/logo.png" alt="" aria-hidden className="w-4/5 max-w-[96px] opacity-[0.12] grayscale select-none pointer-events-none" />
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-semibold truncate">{c.name}</p>
                      {c.marketPrice != null && (
                        <span className="text-[10px] font-bold text-foreground shrink-0">Market value <span className="text-emerald-600">${c.marketPrice.toFixed(2)}</span></span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {c.setName || "—"}
                      {c.cardNumber ? ` · #${c.cardNumber}` : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

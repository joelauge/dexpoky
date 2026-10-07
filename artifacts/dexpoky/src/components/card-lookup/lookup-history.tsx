import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, History, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lookupHistoryPage, type LookupHistoryEntry } from "@/lib/card-lookup-history";

function HistoryArtwork({ card }: { card: LookupHistoryEntry["card"] }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/50">
      {card.imageUrl && !failed
        ? <img src={card.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" onError={() => setFailed(true)} />
        : <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
    </span>
  );
}

export function LookupHistory({ entries, storageAvailable, userId, onOpen }: {
  entries: LookupHistoryEntry[];
  storageAvailable: boolean;
  userId?: string;
  onOpen: (entry: LookupHistoryEntry) => void;
}) {
  const [requestedPage, setRequestedPage] = useState(1);
  useEffect(() => setRequestedPage(1), [userId, entries[0]?.card.id, entries[0]?.visitedAt]);
  const { page, pageCount, entries: visible } = lookupHistoryPage(entries, requestedPage);
  return (
    <section className="mt-8 rounded-2xl border bg-card p-4 sm:p-5" aria-labelledby="lookup-history-heading" data-testid="lookup-history">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="lookup-history-heading" className="flex items-center gap-2 text-lg font-bold"><History className="h-4 w-4 text-primary" />Recent lookups</h2>
          <p className="mt-1 text-xs text-muted-foreground">Reopen a card to check its prices. History is saved in this browser for your account.</p>
        </div>
        <span className="text-xs text-muted-foreground">{entries.length} {entries.length === 1 ? "card" : "cards"}</span>
      </div>
      {!storageAvailable && <p role="status" className="mt-3 text-xs text-amber-700 dark:text-amber-300">Browser storage is unavailable. New history may be lost when you leave or reload.</p>}
      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Cards appear here after a successful lookup.</p>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2" data-testid="lookup-history-items">
          {visible.map((entry) => (
            <li key={entry.card.id} className="min-w-0">
              <button type="button" onClick={() => { setRequestedPage(1); onOpen(entry); }}
                className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`lookup-history-card-${entry.card.id}`} aria-label={`Look up ${entry.card.name}, ${entry.card.setName ?? "unknown set"}, number ${entry.card.cardNumber ?? "unknown"}`}>
                <HistoryArtwork key={`${entry.card.id}:${entry.card.imageUrl}`} card={entry.card} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{entry.card.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{entry.card.setName ?? "Unknown set"}{entry.card.cardNumber ? ` · #${entry.card.cardNumber}` : ""}</span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">{entry.finish.replace(/_/g, " ")} · {entry.condition.replace(/_/g, " ")}</span>
                  <time className="block text-[10px] text-muted-foreground" dateTime={new Date(entry.visitedAt).toISOString()}>{new Date(entry.visitedAt).toLocaleString()}</time>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {entries.length > 0 && (
        <nav aria-label="Lookup history pages" className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setRequestedPage(page - 1)} data-testid="lookup-history-previous"><ChevronLeft className="mr-1 h-3.5 w-3.5" />Previous</Button>
          <span className="text-xs text-muted-foreground" aria-live="polite" data-testid="lookup-history-page">Page {page} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => setRequestedPage(page + 1)} data-testid="lookup-history-next">Next<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button>
        </nav>
      )}
    </section>
  );
}

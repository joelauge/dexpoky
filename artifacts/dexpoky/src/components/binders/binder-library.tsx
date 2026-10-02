import { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Card } from "@workspace/api-client-react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { qtyOf } from "@/lib/binders/model";

const PAGE = 48;

function Tile({ card, free, selected, onSelect }: { card: Card; free: number; selected: boolean; onSelect: () => void }) {
  const disabled = free <= 0;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library-card-${card.id}`,
    data: { type: "library", cardId: card.id },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      aria-pressed={selected}
      aria-disabled={disabled}
      data-testid={`library-card-${card.id}`}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(e) => {
        if ((e.key === "Enter") && !disabled) onSelect();
        else listeners?.onKeyDown?.(e as never);
      }}
      className={cn(
        "relative touch-none select-none rounded-lg border bg-card p-1.5 transition-all",
        disabled ? "opacity-45 cursor-not-allowed" : "cursor-grab hover:border-primary/60",
        selected && "ring-2 ring-primary border-primary",
        isDragging && "opacity-30",
      )}
    >
      <div className="aspect-[5/7] overflow-hidden rounded-md bg-muted">
        {card.imageUrl ? (
          <img src={card.imageUrl} alt={card.name} loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-[10px] text-muted-foreground">{card.name}</div>
        )}
      </div>
      <p className="mt-1 truncate text-[11px] font-semibold leading-tight">{card.name}</p>
      <p className="truncate text-[10px] text-muted-foreground">
        {[card.setName, card.cardNumber].filter(Boolean).join(" · ") || card.pokemonName}
      </p>
      <span
        className={cn(
          "absolute right-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
          disabled ? "bg-muted-foreground/80 text-background" : "bg-primary text-primary-foreground",
        )}
      >
        {disabled ? "placed" : "free"}
      </span>
    </div>
  );
}

export function BinderLibrary({
  cards, loading, usage, selectedId, onSelect, onRetry, error,
}: {
  cards: Card[] | undefined;
  loading: boolean;
  error?: boolean;
  usage: Map<number, number>;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onRetry: () => void;
}) {
  const [q, setQ] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (cards ?? []).filter((c) => {
      if (onlyFree && (usage.get(c.id) ?? 0) >= qtyOf(c)) return false;
      if (!t) return true;
      return [c.name, c.pokemonName, c.setName, c.cardNumber].some((v) => v?.toLowerCase().includes(t));
    });
  }, [cards, q, onlyFree, usage]);
  const visible = filtered.slice(0, limit);

  return (
    <div className="flex min-h-0 flex-col gap-3" data-testid="binder-library">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Card tray</h3>
        <span className="text-xs text-muted-foreground">{filtered.length} of {cards?.length ?? 0}</span>
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-testid="input-library-search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }}
          placeholder="Search name, set, number"
          className="pl-8"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" data-testid="checkbox-library-free" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />
        Only cards not yet placed in this binder
      </label>
      {loading ? (
        <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-[5/8] rounded-lg" />)}</div>
      ) : error ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm">
          Could not load your collection.
          <Button size="sm" variant="outline" className="mt-2 w-full" onClick={onRetry} data-testid="button-library-retry">Retry</Button>
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground" data-testid="text-library-empty">
          {cards?.length ? "No cards match this filter." : "Your collection is empty. Add cards to start arranging."}
        </p>
      ) : (
        <div className="grid max-h-[560px] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 lg:grid-cols-3">
          {visible.map((c) => (
            <Tile key={c.id} card={c} free={qtyOf(c) - (usage.get(c.id) ?? 0)} selected={selectedId === c.id} onSelect={() => onSelect(c.id)} />
          ))}
        </div>
      )}
      {filtered.length > visible.length && (
        <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)} data-testid="button-library-more">
          Show more ({filtered.length - visible.length} left)
        </Button>
      )}
    </div>
  );
}

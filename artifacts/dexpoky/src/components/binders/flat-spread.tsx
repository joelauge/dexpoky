import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { Binder, BinderPage, Card } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { stablePageCompositionKey } from "./binder-page-window";
import { useBinderPageComposition } from "./use-binder-page-composition";

function PocketSurface({ card, selected }: { card?: Card; selected: boolean }) {
  return (
    <div className={cn("relative h-full w-full overflow-hidden rounded-md border-2 border-dashed border-white/30 bg-black/10 transition", selected && "ring-2 ring-primary", card && "border-solid border-white/10")}>
      {card && (card.imageUrl
        ? <img src={card.imageUrl} alt={card.name} loading="eager" decoding="async" draggable={false} className="h-full w-full object-cover" />
        : <span className="flex h-full items-center justify-center p-1 text-center text-[10px] text-white">{card.name}</span>)}
    </div>
  );
}

function PocketInteraction({ page, slot, card, selected, onClick }: { page: BinderPage; slot: number; card?: Card; selected: boolean; onClick: () => void }) {
  const drop = useDroppable({ id: `pocket-${page.id}-${slot}`, data: { type: "slot", pageId: page.id, slot } });
  const drag = useDraggable({
    id: `slot-card-${page.id}-${slot}`,
    data: { type: "slot", pageId: page.id, slot, cardId: card?.id },
    disabled: !card,
  });
  return (
    <div
      ref={(n) => { drop.setNodeRef(n); drag.setNodeRef(n); }}
      {...drag.attributes}
      {...drag.listeners}
      role="button"
      tabIndex={0}
      aria-disabled={false}
      aria-label={`${card?.name ?? "Empty pocket"}, pocket ${slot + 1}`}
      data-testid={`slot-${page.id}-${slot}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || (!card && event.key === " ")) {
          event.preventDefault();
          onClick();
        } else {
          drag.listeners?.onKeyDown?.(event);
        }
      }}
      className={cn(
        "absolute inset-0 z-10 touch-none rounded-md bg-transparent",
        drop.isOver && "border border-primary bg-primary/20",
        selected && "ring-2 ring-primary",
        drag.isDragging && "opacity-30",
      )}
    />
  );
}

function Pocket({ page, slot, card, selected, onClick, active }: { page: BinderPage; slot: number; card?: Card; selected: boolean; onClick: () => void; active: boolean }) {
  return (
    <div className="relative aspect-[5/7] h-full w-full min-h-0 touch-none">
      <PocketSurface card={card} selected={active && selected} />
      {active && <PocketInteraction page={page} slot={slot} card={card} selected={selected} onClick={onClick} />}
    </div>
  );
}

export function FlatSpread({
  binder, cards, spreadIndex, selectedCardId, selectedSlot, onSlotClick,
}: {
  binder: Binder; cards: Card[]; spreadIndex: number; selectedCardId: number | null;
  selectedSlot?: { pageId: string; slot: number } | null;
  onSlotClick: (pageId: string, slot: number) => void;
}) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const { windowPages, activePageKeys, composedPageKeys } = useBinderPageComposition(binder.pages, spreadIndex, binder.id);
  const activeKeys = new Set(activePageKeys);
  void selectedCardId;
  return (
    <div className="grid h-full w-full grid-cols-1 gap-3 rounded-xl p-3 sm:grid-cols-2" style={{ background: binder.coverColor }} data-testid="flat-spread">
      {windowPages.filter((page) => composedPageKeys.has(stablePageCompositionKey(page, binder.id))).map((p) => {
        const active = activeKeys.has(stablePageCompositionKey(p, binder.id));
        const pageNumber = binder.pages.indexOf(p) + 1;
        return (
        <div key={stablePageCompositionKey(p, binder.id)} hidden={!active} aria-hidden={!active} className="rounded-lg bg-black/25 p-2">
          <p className="mb-1 text-center text-[11px] font-semibold uppercase tracking-widest text-white/80">Page {pageNumber}</p>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${p.columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: p.rows * p.columns }).map((_, slot) => {
              const cid = p.slots.find((s) => s.slot === slot)?.cardId;
              return (
                <Pocket key={`${p.id}-${slot}`} page={p} slot={slot} card={cid !== undefined ? byId.get(cid) : undefined}
                  selected={active && selectedSlot?.pageId === p.id && selectedSlot.slot === slot}
                  active={active} onClick={() => onSlotClick(p.id, slot)} />
              );
            })}
          </div>
        </div>
      );})}
    </div>
  );
}

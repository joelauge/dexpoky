import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Play, X } from "lucide-react";
import type { BinderDisplayCard } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

/** Interaction layer for a pocket, rendered by either the 3D or flat viewer. */
export function locatePocket(pageId: string, slot: number): HTMLElement | null {
  const sel = `[data-testid="binder-slot-${pageId}-${slot}"],[data-testid="slot-${pageId}-${slot}"]`;
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(sel));
  return nodes.find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) ?? null;
}

/** Hide (not unmount) the retained artwork nodes of a pocket. */
function setArtHidden(el: HTMLElement | null, hidden: boolean) {
  el?.parentElement?.querySelectorAll("img").forEach((img) => {
    if (hidden) img.style.visibility = "hidden"; else img.style.removeProperty("visibility");
  });
}

type Box = { left: number; top: number; width: number; height: number };
const fit = (r: DOMRect): Box => {
  const height = Math.max(40, Math.min(r.height, (r.width * 7) / 5));
  const width = (height * 5) / 7;
  return { left: r.left + (r.width - width) / 2, top: r.top + (r.height - height) / 2, width, height };
};
const pocketTransform = (pr: DOMRect | null, t: Box) => {
  if (!pr) return "translate(0px,0px) scale(0.92) rotate(0deg)";
  const s = Math.max(0.05, Math.min(pr.width / t.width, pr.height / t.height));
  const dx = pr.left + pr.width / 2 - (t.left + t.width / 2);
  const dy = pr.top + pr.height / 2 - (t.top + t.height / 2);
  return `translate(${dx}px,${dy}px) scale(${s}) rotate(0deg)`;
};
const liftFrame = (pr: DOMRect | null, t: Box) => {
  if (!pr) return "translate(0px,-24px) scale(0.97) rotate(-3deg)";
  const s = Math.max(0.05, Math.min(pr.width / t.width, pr.height / t.height));
  const dx = pr.left + pr.width / 2 - (t.left + t.width / 2);
  const dy = pr.top + pr.height / 2 - (t.top + t.height / 2);
  return `translate(${dx * 0.55}px,${dy * 0.55 - 30}px) scale(${s + (1 - s) * 0.4}) rotate(-5deg)`;
};

type Phase = "opening" | "open" | "closing";
type Item = { key: string; kind: "image" | "video"; url: string };

export function CardInspector({ card, pageId, slot, originRect, wishlist, ownerName, onClosed, children }: {
  card: BinderDisplayCard; pageId: string; slot: number; originRect: DOMRect;
  wishlist: boolean; ownerName: string; onClosed: () => void; children: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>("opening");
  const [target, setTarget] = useState<Box | null>(null);
  const [entered, setEntered] = useState(false);
  const [selected, setSelected] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const stageRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const phaseRef = useRef<Phase>("opening");
  const animRef = useRef<Animation | null>(null);
  const targetRef = useRef<Box | null>(null);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const reduced = useRef(typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const setPh = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    if (card.imageUrl) list.push({ key: "primary", kind: "image", url: card.imageUrl });
    for (const m of card.media ?? []) if (m.url !== card.imageUrl) list.push({ key: m.id, kind: m.kind, url: m.url });
    return list;
  }, [card]);
  const current = items[Math.min(selected, items.length - 1)];

  // Hide the pocket artwork before first paint so the lifted card is not doubled.
  useLayoutEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    const dlg = dialogRef.current;
    const prior: Array<[HTMLElement, boolean]> = [];
    if (dlg?.parentElement) {
      for (const sib of Array.from(dlg.parentElement.children) as HTMLElement[]) {
        if (sib === dlg) continue;
        prior.push([sib, sib.inert]);
        sib.inert = true;
      }
    }
    dlg?.focus({ preventScroll: true });
    const el = locatePocket(pageId, slot);
    setArtHidden(el, true);
    const measure = () => {
      const r = stageRef.current?.getBoundingClientRect();
      if (!r) return;
      const b = fit(r);
      targetRef.current = b;
      setTarget(b);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      animRef.current?.cancel();
      setArtHidden(locatePocket(pageId, slot) ?? el, false);
      for (const [sib, was] of prior) sib.inert = was;
    };
  }, [pageId, slot]);

  const started = useRef(false);
  useEffect(() => {
    if (!target || started.current) return;
    started.current = true;
    const node = flyRef.current;
    setEntered(true);
    const done = () => { setPh("open"); closeRef.current?.focus(); };
    if (!node) { done(); return; }
    if (reduced.current) {
      const a = node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
      animRef.current = a; a.onfinish = done; a.oncancel = () => undefined;
      return;
    }
    const from = pocketTransform(originRect, target);
    const a = node.animate(
      [{ transform: from, offset: 0 }, { transform: liftFrame(originRect, target), offset: 0.38 }, { transform: "translate(0px,0px) scale(1) rotate(0deg)", offset: 1 }],
      { duration: 560, easing: "cubic-bezier(.22,.8,.24,1)" },
    );
    animRef.current = a;
    a.onfinish = done;
  }, [target, originRect]);

  const requestClose = useCallback(() => {
    if (phaseRef.current === "closing") return;
    const node = flyRef.current;
    const t = targetRef.current;
    const live = node ? getComputedStyle(node).transform : "none";
    const startTransform = live && live !== "none" ? live : "translate(0px,0px) scale(1) rotate(0deg)";
    animRef.current?.cancel();
    setPh("closing");
    setSelected(0);
    const finish = () => {
      const el = locatePocket(pageId, slot);
      setArtHidden(el, false);
      const back = returnFocus.current && document.contains(returnFocus.current) ? returnFocus.current : el;
      onClosedRef.current();
      requestAnimationFrame(() => back?.focus?.({ preventScroll: true }));
    };
    if (!node || !t) { finish(); return; }
    const pr = locatePocket(pageId, slot)?.getBoundingClientRect() ?? null;
    if (reduced.current || !pr) {
      const a = node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" });
      a.onfinish = finish;
      animRef.current = a;
      return;
    }
    const a = node.animate(
      [{ transform: startTransform, offset: 0 }, { transform: liftFrame(pr, t), offset: 0.55 }, { transform: pocketTransform(pr, t), offset: 1 }],
      { duration: 460, easing: "cubic-bezier(.4,.1,.3,1)", fill: "forwards" },
    );
    a.onfinish = finish;
    animRef.current = a;
  }, [pageId, slot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); requestClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [requestClose]);

  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button,[href],input,textarea,select,video[controls],[tabindex]:not([tabindex="-1"])') ?? [])
      .filter((n) => !(n as HTMLButtonElement).disabled && n.getClientRects().length > 0);
    if (!nodes.length) { e.preventDefault(); dialogRef.current?.focus(); return; }
    const first = nodes[0], last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (!active || active === dialogRef.current || !dialogRef.current?.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };

  const meta = [card.setName, card.cardNumber ? `No. ${card.cardNumber}` : null].filter(Boolean).join(" · ");
  const showBroken = !current || broken.has(current.key);

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1} aria-label={`${card.name}, inspect card`} onKeyDown={trap} data-testid="card-inspector" className="fixed inset-0 z-50 outline-none">
      <div onClick={requestClose} aria-hidden className={cn("absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity", entered && phase !== "closing" ? "opacity-100" : "opacity-0", reduced.current ? "duration-150" : "duration-300")} />
      <div className="pointer-events-none relative mx-auto flex h-full w-full max-w-6xl flex-col gap-3 p-3 sm:p-6 lg:flex-row lg:items-stretch lg:gap-8">
        <div className="flex min-h-0 flex-col gap-2 lg:flex-1">
          <div ref={stageRef} className="min-h-0 flex-1 basis-[42dvh] lg:basis-auto" aria-hidden />
          {items.length > 1 && (
            <div className={cn("pointer-events-auto flex shrink-0 justify-center gap-2 overflow-x-auto pb-1 transition-opacity", phase === "open" ? "opacity-100" : "opacity-0")} role="group" aria-label="Card photos" data-testid="inspector-gallery">
              {items.map((it, i) => (
                <button key={it.key} type="button" onClick={() => setSelected(i)} aria-label={`${it.kind === "video" ? "Video" : "Photo"} ${i + 1} of ${items.length}`} aria-pressed={i === selected}
                  data-testid={`inspector-thumb-${i}`}
                  className={cn("relative h-14 w-10 shrink-0 overflow-hidden rounded border-2 bg-slate-900", i === selected ? "border-amber-300" : "border-white/20")}>
                  {it.kind === "image" ? <img src={it.url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-white"><Play className="h-4 w-4" /></span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <aside className={cn("pointer-events-auto max-h-[46dvh] w-full shrink-0 overflow-y-auto rounded-2xl border border-white/10 bg-card text-card-foreground p-4 shadow-2xl transition-all lg:max-h-full lg:w-[380px] lg:self-center", phase === "open" ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {wishlist && <span data-testid="badge-inspector-wishlist" className="mb-1 inline-block rounded-sm bg-amber-300 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">Wishlist</span>}
              <h2 className="text-lg font-bold leading-tight" data-testid="text-inspector-name">{card.name}</h2>
              {meta && <p className="text-sm text-muted-foreground" data-testid="text-inspector-meta">{meta}</p>}
              {!wishlist && card.condition && <p className="mt-0.5 text-sm" data-testid="text-inspector-condition">Condition: {card.condition}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{wishlist ? `${ownerName} is looking for this card.` : `From ${ownerName}'s binder.`}</p>
            </div>
            <button ref={closeRef} type="button" onClick={requestClose} data-testid="button-inspector-close" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <X className="h-4 w-4" /> Put back
            </button>
          </div>
          <div className="mt-4 border-t pt-4">{children}</div>
        </aside>
      </div>
      {target && (
        <div ref={flyRef} data-testid="inspector-card" className="pointer-events-none fixed z-[51] overflow-hidden rounded-xl bg-slate-900 shadow-[0_24px_60px_rgba(0,0,0,.55)]"
          style={{ left: target.left, top: target.top, width: target.width, height: target.height, willChange: "transform" }}>
          {showBroken ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-4 text-center text-white">
              <span className="text-base font-semibold leading-tight">{card.name}</span>
              <span className="text-xs text-white/60">Artwork unavailable</span>
            </div>
          ) : current.kind === "video" ? (
            <video key={current.key} src={current.url} controls playsInline className="pointer-events-auto h-full w-full bg-black object-contain" onError={() => setBroken((s) => new Set(s).add(current.key))} />
          ) : (
            <img key={current.key} src={current.url} alt={card.name} draggable={false} className="h-full w-full object-contain" onError={() => setBroken((s) => new Set(s).add(current.key))} />
          )}
        </div>
      )}
    </div>
  );
}

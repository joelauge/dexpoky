import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DndContext } from "@dnd-kit/core";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { useUser } from "@clerk/react";
import { getGetPublicBinderQueryKey, useGetPublicBinder } from "@workspace/api-client-react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FlatSpread } from "@/components/binders/flat-spread";
import { CardInspector, locatePocket } from "@/components/binders/card-inspector";
import { OwnedOfferPanel, WishlistSellPanel } from "@/components/binders/binder-offer-panels";
import { cardAt, maxSpread } from "@/lib/binders/model";
import { publicBinderPath } from "@/lib/binders/share";

const ThreeViewer = lazy(() => import("@/components/binders/three-binder-viewer").then((m) => ({ default: m.ThreeBinderViewer })));

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}
const NO_SENSORS: never[] = [];

type Inspect = { id: number; pageId: string; slot: number; rect: DOMRect };

export default function PublicBinderView() {
  const { token = "" } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const search = useSearch();
  const q = useGetPublicBinder(token, { query: { queryKey: getGetPublicBinderQueryKey(token), retry: false, refetchOnMount: "always" } });
  const rootRef = useRef<HTMLDivElement>(null);
  const [spread, setSpread] = useState(0);
  const [webgl] = useState(() => hasWebGL());
  const [flat, setFlat] = useState(() => !webgl);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [isFull, setIsFull] = useState(false);
  const [turning, setTurning] = useState(false);
  const turningRef = useRef(false);
  const onTurningChange = useCallback((value: boolean) => {
    turningRef.current = value;
    setTurning(value);
  }, []);
  const inspectRef = useRef<Inspect | null>(null);
  inspectRef.current = inspect;
  const data = q.data;
  const binder = data?.binder;
  const cards = useMemo(() => data?.cards ?? [], [data?.cards]);
  const pageCount = binder?.pages.length ?? 0;
  const turn = useCallback((d: 1 | -1) => {
    if (inspectRef.current || turningRef.current) return;
    setSpread((s) => Math.min(maxSpread(pageCount), Math.max(0, s + d * 2)));
  }, [pageCount]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (inspectRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
      if (e.key === "ArrowRight") turn(1);
      else if (e.key === "ArrowLeft") turn(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turn]);

  useEffect(() => {
    const onFs = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  // Refresh isOwner when the signed-in state settles or changes.
  const prevAuth = useRef<boolean | null>(null);
  const refetchRef = useRef(q.refetch);
  refetchRef.current = q.refetch;
  useEffect(() => {
    if (!isLoaded) return;
    if (prevAuth.current !== null && prevAuth.current !== !!isSignedIn) void refetchRef.current();
    prevAuth.current = !!isSignedIn;
  }, [isLoaded, isSignedIn]);

  // One-shot restore of spread and inspected pocket after an auth round trip.
  const restoreRef = useRef<{ spread: number; page: string | null; slot: number | null } | null | undefined>(undefined);
  if (restoreRef.current === undefined) {
    const sp = new URLSearchParams(search);
    const sr = sp.get("spread"), sl = sp.get("slot");
    restoreRef.current = sr !== null || sl !== null || sp.get("page")
      ? { spread: sr && /^\d+$/.test(sr) ? parseInt(sr) : 0, page: sp.get("page"), slot: sl && /^\d+$/.test(sl) ? parseInt(sl) : null }
      : null;
  }
  const canFull = typeof document !== "undefined" && !!document.fullscreenEnabled;
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void rootRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  const onSlot = (pageId: string, slot: number) => {
    if (!binder || inspectRef.current) return;
    const id = cardAt(binder.pages, { pageId, slot });
    if (id === undefined || !cards.some((c) => c.id === id)) return;
    const el = locatePocket(pageId, slot);
    const rect = el?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 2 - 40, window.innerHeight / 2 - 56, 80, 112);
    setInspect({ id, pageId, slot, rect });
  };
  const onSlotRef = useRef(onSlot);
  onSlotRef.current = onSlot;
  const restoredDone = useRef(false);
  useEffect(() => {
    const ctx = restoreRef.current;
    if (!ctx || restoredDone.current || !binder) return;
    restoredDone.current = true;
    restoreRef.current = null;
    setLocation(publicBinderPath(token).slice(import.meta.env.BASE_URL.replace(/\/$/, "").length), { replace: true });
    const target = Math.min(maxSpread(binder.pages.length), Math.floor(ctx.spread / 2) * 2);
    setSpread(target);
    const pageIdx = binder.pages.findIndex((pg) => pg.id === ctx.page);
    if (pageIdx < 0 || ctx.slot === null || cardAt(binder.pages, { pageId: ctx.page!, slot: ctx.slot }) === undefined) return;
    const pageId = ctx.page!, slot = ctx.slot;
    if (Math.floor(pageIdx / 2) * 2 !== target) setSpread(Math.floor(pageIdx / 2) * 2);
    let tries = 0;
    const attempt = () => {
      if (unmounted.current) return;
      if (locatePocket(pageId, slot)) { onSlotRef.current(pageId, slot); return; }
      if (++tries < 240) requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  }, [binder, token, setLocation]);
  const unmounted = useRef(false);
  useEffect(() => { unmounted.current = false; return () => { unmounted.current = true; }; }, []);

  const spreadRef = useRef(0);
  spreadRef.current = spread;
  const returnPath = () => {
    const qs = new URLSearchParams();
    if (spreadRef.current > 0) qs.set("spread", String(spreadRef.current));
    const i = inspectRef.current;
    if (i) { qs.set("page", i.pageId); qs.set("slot", String(i.slot)); }
    const tail = qs.toString();
    return publicBinderPath(token) + (tail ? `?${tail}` : "");
  };
  const signIn = () => setLocation(`/sign-in?redirect_url=${encodeURIComponent(returnPath())}`);
  const signUp = () => setLocation(`/sign-up?redirect_url=${encodeURIComponent(returnPath())}`);

  const status = (q.error as { status?: number } | null)?.status;
  const inspected = inspect ? cards.find((c) => c.id === inspect.id) : undefined;
  const locked = !!inspect || turning;

  return (
    <div ref={rootRef} className="fixed inset-0 flex flex-col text-white" style={{ background: `radial-gradient(ellipse at 50% 35%, ${binder?.coverColor ?? "#2a2f3a"}55, #0f1117 80%)` }} data-testid="public-binder-root">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-black/30 px-3 py-2 backdrop-blur sm:px-5">
        <Link href="/" aria-label="DexPoky home" className="shrink-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          <img src={`${import.meta.env.BASE_URL}dexpoky-logo.png`} alt="DexPoky" className="h-7 w-auto max-w-28 object-contain sm:h-8 sm:max-w-36" data-testid="image-public-binder-logo" />
        </Link>
        <div className="min-w-0 flex-1">
          {binder ? (
            <>
              <h1 className="truncate text-sm font-bold leading-tight sm:text-base" data-testid="text-public-binder-name">{binder.name}</h1>
              <p className="truncate text-xs text-white/60" data-testid="text-public-owner">By {data.ownerName}. Select any card to inspect it.</p>
            </>
          ) : <span className="text-sm text-white/60">Shared binder</span>}
        </div>
        {binder && (
          <Button variant="ghost" size="sm" disabled={locked || !webgl} onClick={() => setFlat((f) => !f)} className="text-white hover:bg-white/10 hover:text-white" data-testid="button-public-toggle-view">
            {flat ? "3D view" : "Flat view"}
          </Button>
        )}
        {binder && canFull && (
          <Button variant="ghost" size="icon" onClick={toggleFull} aria-label={isFull ? "Exit full screen" : "Full screen"} className="text-white hover:bg-white/10 hover:text-white" data-testid="button-public-fullscreen">
            {isFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        )}
        {!isSignedIn && binder && <Button size="sm" onClick={signIn} data-testid="button-public-signin">Sign in</Button>}
      </header>

      <main className="relative min-h-0 flex-1">
        {q.isLoading && <div className="h-full p-4"><Skeleton className="h-full w-full rounded-xl bg-white/10" /></div>}
        {q.isError && (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-md rounded-xl border border-white/15 bg-black/40 p-8 text-center" data-testid="state-binder-unavailable">
              <p className="text-lg font-bold">{status === 404 ? "This binder is private or does not exist" : "This binder could not be loaded"}</p>
              <p className="mt-1 text-sm text-white/65">{status === 404 ? "The owner may have stopped sharing it." : "Check your connection and try again."}</p>
              {status !== 404 && <Button className="mt-4" variant="secondary" onClick={() => q.refetch()} data-testid="button-public-retry">Retry</Button>}
            </div>
          </div>
        )}
        {data && binder && (
          <DndContext sensors={NO_SENSORS}>
            <div className="h-full w-full" data-testid="binder-stage">
              <Boundary key={String(flat)} fallback={<div className="h-full overflow-y-auto"><FlatSpread binder={binder} cards={cards} spreadIndex={spread} selectedCardId={null} onSlotClick={onSlot} /></div>}>
                {flat ? (
                  <div className="h-full overflow-y-auto"><FlatSpread binder={binder} cards={cards} spreadIndex={spread} selectedCardId={null} onSlotClick={onSlot} /></div>
                ) : (
                  <Suspense fallback={<Skeleton className="h-full w-full bg-white/10" />}>
                    <ThreeViewer binder={binder} cards={cards} spreadIndex={spread} selectedCardId={null} onSlotClick={onSlot} onTurn={turn} onTurningChange={onTurningChange} />
                  </Suspense>
                )}
              </Boundary>
            </div>
          </DndContext>
        )}
      </main>

      {binder && (
        <footer className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-white/10 bg-black/30 px-3 py-2 backdrop-blur">
          <Button variant="outline" size="icon" disabled={locked || spread <= 0} onClick={() => turn(-1)} aria-label="Previous pages" className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white" data-testid="button-public-prev"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-32 text-center text-sm font-medium" data-testid="text-public-spread" aria-live="polite">
            Pages {spread + 1}{binder.pages[spread + 1] ? `-${spread + 2}` : ""} of {pageCount}
          </span>
          <Button variant="outline" size="icon" disabled={locked || spread >= maxSpread(pageCount)} onClick={() => turn(1)} aria-label="Next pages" className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white" data-testid="button-public-next"><ChevronRight className="h-4 w-4" /></Button>
          {!webgl && <span className="w-full text-center text-xs text-white/55" data-testid="text-flat-fallback">3D is not available on this device, so the pages are shown flat.</span>}
        </footer>
      )}

      {inspect && inspected && data && (
        <CardInspector key={`${inspect.pageId}-${inspect.slot}`} card={inspected} pageId={inspect.pageId} slot={inspect.slot} originRect={inspect.rect}
          wishlist={inspected.id < 0} ownerName={data.ownerName} onClosed={() => setInspect(null)}>
          {inspected.id < 0
            ? <WishlistSellPanel token={token} pageId={inspect.pageId} slot={inspect.slot} card={inspected} ownerName={data.ownerName} signedIn={!!isSignedIn} isOwner={data.isOwner} onSignIn={signIn} onSignUp={signUp} />
            : <OwnedOfferPanel token={token} pageId={inspect.pageId} slot={inspect.slot} card={inspected} ownerName={data.ownerName} signedIn={!!isSignedIn} isOwner={data.isOwner} onSignIn={signIn} onSignUp={signUp} />}
        </CardInspector>
      )}
    </div>
  );
}

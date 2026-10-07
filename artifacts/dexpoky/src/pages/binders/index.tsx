import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, PointerSensor, TouchSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getGetBinderQueryKey, getListBindersQueryKey, getListCardsQueryKey, getListWishlistQueryKey, useListWishlist, useCreateBinder, useDeleteBinder, useGetBinder,
  useListBinders, useListCards, useUpdateBinder, type Binder,
} from "@workspace/api-client-react";
import { Copy, ExternalLink, Share2, ChevronLeft, ChevronRight, FilePlus2, Plus, RotateCcw, Save, Settings2, Trash2, X } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { WishlistSlotDialog } from "@/components/binders/wishlist-slot-dialog";
import { ShareBinderDialog } from "@/components/binders/share-binder-dialog";
import { binderShareUrl } from "@/lib/binders/share";
import { BinderLibrary } from "@/components/binders/binder-library";
import { FlatSpread } from "@/components/binders/flat-spread";
import { ConfirmDialog, CreateBinderDialog, PageSettingsDialog, type CreateValues } from "@/components/binders/binder-dialogs";
import {
  MAX_PAGES, cardAt, clearSlot, isConflict, maxSpread, moveSlot, newPage, placeFromLibrary, placeWishlist, wishlistDisplay, resizePage, serialize,
  usageOf, type OpResult, type Selection, type SlotRef,
} from "@/lib/binders/model";

const ThreeViewer = lazy(() =>
  import("@/components/binders/three-binder-viewer").then((m) => ({ default: m.ThreeBinderViewer })),
);

class ViewerBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

function TurnZone({ dir, onTurn }: { dir: 1 | -1; onTurn: (d: 1 | -1) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: dir === 1 ? "turn-next" : "turn-prev" });
  return (
    <button ref={setNodeRef} type="button" onClick={() => onTurn(dir)} tabIndex={-1} aria-hidden
      className={cn("absolute top-0 z-10 hidden h-full w-14 items-center justify-center text-xs font-bold uppercase tracking-widest text-primary-foreground transition-opacity group-data-[drag=true]:flex",
        dir === 1 ? "right-0" : "left-0", isOver ? "bg-primary/70" : "bg-primary/35")}>
      {dir === 1 ? "Next" : "Prev"}
    </button>
  );
}

export default function BindersPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Binder | null>(null);
  const [baseJson, setBaseJson] = useState("");
  const [spread, setSpread] = useState(0);
  const [turning, setTurning] = useState(false);
  const turningRef = useRef(false);
  const onTurningChange = useCallback((value: boolean) => {
    turningRef.current = value;
    setTurning(value);
  }, []);
  const [sel, setSel] = useState<Selection>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ cardId?: number } | null>(null);
  const [conflict, setConflict] = useState<null | { kind: "revision" | "invalid"; message: string }>(null);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<number | null | "none">("none");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removePageOpen, setRemovePageOpen] = useState(false);
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
  const [wishTarget, setWishTarget] = useState<SlotRef | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [flat, setFlat] = useState(() => !hasWebGL());

  const list = useListBinders({ query: { queryKey: getListBindersQueryKey(), staleTime: 15000, refetchOnMount: "always" } });
  const cardsQ = useListCards();
  const cards = cardsQ.data;
  const cardMap = useMemo(() => new Map((cards ?? []).map((c) => [c.id, c])), [cards]);
  const wishQ = useListWishlist();
  const wishlist = useMemo(() => wishQ.data ?? [], [wishQ.data]);
  const displayCards = useMemo(() => [
    ...(cards ?? []).map((c) => ({ id: c.id, name: c.name, imageUrl: c.imageUrl ?? null })),
    ...wishlist.map(wishlistDisplay),
  ], [cards, wishlist]);
  const displayMap = useMemo(() => new Map(displayCards.map((c) => [c.id, c])), [displayCards]);
  const binderQ = useGetBinder(selectedId ?? 0, { query: { enabled: !!selectedId, queryKey: getGetBinderQueryKey(selectedId ?? 0), staleTime: 15000, refetchOnMount: "always" } });
  const create = useCreateBinder();
  const update = useUpdateBinder();
  const del = useDeleteBinder();

  const dirty = !!draft && serialize(draft) !== baseJson;
  const draftRef = useRef<Binder | null>(null);
  draftRef.current = draft;
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const loadDraft = useCallback((b: Binder) => {
    setDraft(b); setBaseJson(serialize(b)); setConflict(null); setSel(null);
    setActivePageId((p) => (p && b.pages.some((x) => x.id === p) ? p : b.pages[0]?.id ?? null));
    setSpread((s) => Math.min(s, maxSpread(b.pages.length)));
  }, []);

  useEffect(() => {
    if (binderQ.data && !binderQ.isFetching && binderQ.data.id === selectedId && draft?.id !== binderQ.data.id) loadDraft(binderQ.data);
  }, [binderQ.data, binderQ.isFetching, selectedId, draft?.id, loadDraft]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      let u: URL;
      try { u = new URL(a.href, window.location.href); } catch { return; }
      if (u.origin !== window.location.origin || u.pathname === window.location.pathname) return;
      if (!window.confirm("You have unsaved binder changes. Leave this page and discard them?")) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    document.addEventListener("click", h, true);
    return () => document.removeEventListener("click", h, true);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const doSwitch = (id: number | null) => {
    setDraft(null); setBaseJson(""); setSpread(0); setSel(null); setConflict(null); setSelectedId(id);
  };
  const requestSwitch = (id: number) => {
    if (id === selectedId || update.isPending) return;
    if (dirty) setPendingSwitch(id); else doSwitch(id);
  };

  const usage = useMemo(() => usageOf(draft?.pages ?? []), [draft?.pages]);
  const pageCount = draft?.pages.length ?? 0;
  const turn = useCallback((d: 1 | -1) => {
    if (turningRef.current) return;
    setSpread((s) => Math.min(maxSpread(pageCount), Math.max(0, s + d * 2)));
  }, [pageCount]);

  const edit = (fn: (d: Binder) => Binder) => setDraft((d) => (d ? fn(d) : d));
  const apply = (r: OpResult, msg?: string) => {
    if ("error" in r) { toast.error(r.error); return false; }
    edit((d) => ({ ...d, pages: r.pages }));
    if (r.replacedCardId !== undefined) {
      toast.info(r.replacedCardId < 0 ? "Wishlist placeholder removed." : `${cardMap.get(r.replacedCardId)?.name ?? "Previous card"} returned to the tray.`);
    } else if (msg) toast.success(msg);
    return true;
  };

  const handleSlot = (pageId: string, slot: number) => {
    if (!draft) return;
    const ref: SlotRef = { pageId, slot };
    setActivePageId(pageId);
    if (sel?.type === "library") {
      if (apply(placeFromLibrary(draft.pages, cardMap, ref, sel.cardId))) setSel(null);
    } else if (sel?.type === "slot") {
      if (sel.pageId === pageId && sel.slot === slot) { setSel(null); return; }
      if (apply(moveSlot(draft.pages, sel, ref))) setSel(null);
    } else if (cardAt(draft.pages, ref) !== undefined) {
      setSel({ type: "slot", ...ref });
    } else {
      setWishTarget(ref);
    }
  };

  const selectedCardId = sel?.type === "library" ? sel.cardId : sel?.type === "slot" && draft ? cardAt(draft.pages, sel) ?? null : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const turnTimer = useRef<number | null>(null);
  const dragSourceRef = useRef<{ type: string; cardId?: number; pageId?: string; slot?: number } | null>(null);
  const stopTurn = () => { if (turnTimer.current) { window.clearInterval(turnTimer.current); turnTimer.current = null; } };
  useEffect(() => stopTurn, []);

  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as { type: string; cardId?: number; pageId?: string; slot?: number } | undefined;
    // Turning a page unmounts its pockets; retain the source before dnd-kit unregisters it.
    dragSourceRef.current = d ? { ...d } : null;
    setDragging({ cardId: d?.cardId });
  };
  const onDragOver = (e: DragOverEvent) => {
    stopTurn();
    const id = e.over?.id;
    if (id === "turn-next" || id === "turn-prev") {
      const dir = id === "turn-next" ? 1 : -1;
      turnTimer.current = window.setInterval(() => turn(dir), 850);
    }
  };
  const onDragEnd = (e: DragEndEvent) => {
    stopTurn(); setDragging(null);
    const a = dragSourceRef.current;
    dragSourceRef.current = null;
    if (!draft || !e.over) return;
    const o = e.over.data.current as { type?: string; pageId?: string; slot?: number } | undefined;
    if (!a || o?.type !== "slot" || o.pageId === undefined || o.slot === undefined) return;
    const to = { pageId: o.pageId, slot: o.slot };
    if (a.type === "library" && a.cardId !== undefined) apply(placeFromLibrary(draft.pages, cardMap, to, a.cardId));
    else if (a.type === "slot" && a.pageId !== undefined && a.slot !== undefined) apply(moveSlot(draft.pages, { pageId: a.pageId, slot: a.slot }, to));
    setSel(null);
  };

  const save = (opts?: { publish?: boolean; onDone?: (ok: boolean, message?: string) => void }) => {
    const publish = !!opts?.publish;
    if (!draft || update.isPending || (!dirty && !publish)) return;
    const startPublic = !!draft.isPublic;
    // A publish request forces isPublic only while the user has not toggled it since.
    const norm = (c: Binder): Binder => (publish && !!c.isPublic === startPublic ? { ...c, isPublic: true } : c);
    const snap = serialize(norm(draft));
    const savedId = draft.id;
    update.mutate(
      { id: savedId, data: { isPublic: publish ? true : !!draft.isPublic, name: draft.name.trim() || "Untitled binder", style: draft.style, coverColor: draft.coverColor, revision: draft.revision, pages: draft.pages } },
      {
        onSuccess: (b) => {
          qc.setQueryData(getGetBinderQueryKey(b.id), b);
          qc.invalidateQueries({ queryKey: getListBindersQueryKey() });
          qc.invalidateQueries({ queryKey: getListWishlistQueryKey() });
          qc.invalidateQueries({ queryKey: getListCardsQueryKey() });
          const cur = draftRef.current;
          opts?.onDone?.(true);
          if (!cur || cur.id !== savedId || selectedIdRef.current !== savedId) return;
          if (serialize(norm(cur)) === snap) {
            loadDraft(b);
            toast.success("Layout saved.");
          } else {
            setDraft({ ...norm(cur), revision: b.revision, updatedAt: b.updatedAt, shareToken: b.shareToken });
            setBaseJson(serialize(b));
            setConflict(null);
            toast.info("Saved. Newer changes you made while saving are still unsaved.");
          }
        },
        onError: (err) => {
          const status = (err as { status?: number })?.status;
          opts?.onDone?.(false, status === 409 ? "This binder was changed elsewhere. Use the banner on the page to reload it, then try again." : status === 400 ? "The server rejected this layout. Fix it and try again." : "Could not save. Your draft is kept, try again.");
          if (draftRef.current?.id !== savedId) return;
          const msg = (err as { data?: { error?: string } })?.data?.error;
          if (isConflict(err)) setConflict({ kind: "revision", message: "This binder was changed elsewhere since you opened it. Your draft is kept untouched." });
          else if ((err as { status?: number })?.status === 400) setConflict({ kind: "invalid", message: msg ?? "The server rejected this layout (a card may no longer be available). Your draft is kept untouched." });
          else toast.error("Could not save. Your draft is still here, try again.");
        },
      },
    );
  };

  const reloadServer = async () => {
    const r = await binderQ.refetch();
    if (r.data) { qc.setQueryData(getGetBinderQueryKey(r.data.id), r.data); loadDraft(r.data); toast.success("Loaded the latest saved version."); }
    else toast.error("Could not reload the saved version.");
  };

  const onCreate = (v: CreateValues) => {
    create.mutate({ data: v }, {
      onSuccess: (b) => {
        qc.setQueryData(getGetBinderQueryKey(b.id), b);
        qc.invalidateQueries({ queryKey: getListBindersQueryKey() });
        setCreateOpen(false);
        setDraft(null); setSel(null); setSpread(0); setSelectedId(b.id);
        toast.success(`${b.name} created.`);
      },
      onError: () => toast.error("Could not create the binder."),
    });
  };

  const onDelete = () => {
    if (!draft) return;
    const id = draft.id;
    del.mutate({ id }, {
      onSuccess: () => {
        qc.removeQueries({ queryKey: getGetBinderQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListBindersQueryKey() });
        qc.invalidateQueries({ queryKey: getListCardsQueryKey() });
        setDeleteOpen(false); doSwitch(null);
        toast.success("Binder deleted. Every card is still in your collection.");
      },
      onError: () => toast.error("Could not delete the binder."),
    });
  };

  const activeIndex = draft ? Math.max(0, draft.pages.findIndex((p) => p.id === activePageId)) : 0;
  const activePage = draft?.pages[activeIndex];
  const placedCount = draft?.pages.reduce((n, p) => n + p.slots.length, 0) ?? 0;

  const addPage = () => {
    if (!draft || draft.pages.length >= MAX_PAGES) return;
    const p = newPage(draft.pages[draft.pages.length - 1]);
    edit((d) => ({ ...d, pages: [...d.pages, p] }));
    setActivePageId(p.id);
    setSpread(maxSpread(draft.pages.length + 1));
  };
  const removePage = () => {
    if (!draft || !activePage || draft.pages.length <= 1) return;
    const pages = draft.pages.filter((p) => p.id !== activePage.id);
    edit((d) => ({ ...d, pages }));
    setActivePageId(pages[Math.min(activeIndex, pages.length - 1)].id);
    setSpread((s) => Math.min(s, maxSpread(pages.length)));
    setSel(null); setRemovePageOpen(false);
  };
  const goPage = (id: string, i: number) => { setActivePageId(id); setSpread(Math.floor(i / 2) * 2); };

  const summaries = list.data;

  return (
    <Layout>
      <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Binders</h1>
            <p className="text-sm text-muted-foreground">Arrange the cards you own. Binders are virtual, so your collection never changes.</p>
          </div>
          <Button disabled={update.isPending} onClick={() => (dirty ? setPendingCreate(true) : setCreateOpen(true))} className="gap-2" data-testid="button-new-binder"><Plus className="h-4 w-4" /> New binder</Button>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1" data-testid="binder-list">
          {list.isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-52 shrink-0 rounded-xl" />)}
          {list.isError && (
            <div className="flex items-center gap-3 rounded-xl border border-destructive/40 p-3 text-sm">
              Could not load binders. <Button size="sm" variant="outline" onClick={() => list.refetch()} data-testid="button-binders-retry">Retry</Button>
            </div>
          )}
          {summaries?.map((b) => (
            <button key={b.id} type="button" disabled={update.isPending} onClick={() => requestSwitch(b.id)} data-testid={`binder-item-${b.id}`}
              className={cn("flex w-56 shrink-0 items-center gap-3 rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5",
                selectedId === b.id ? "border-primary ring-2 ring-primary/40 bg-primary/5" : "bg-card")}>
              <span className="h-10 w-7 shrink-0 rounded-sm border-l-4 border-black/30 shadow" style={{ background: b.coverColor }} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{b.name}</span>
                <span className="block text-xs text-muted-foreground">{b.pageCount} pages · {b.cardCount} cards</span>
              </span>
            </button>
          ))}
          {summaries && summaries.length === 0 && (
            <div className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center" data-testid="empty-binders">
              <FilePlus2 className="h-8 w-8 text-muted-foreground" />
              <p className="font-semibold">No binders yet</p>
              <p className="text-sm text-muted-foreground">Create one to start placing owned cards into pockets.</p>
              <Button onClick={() => setCreateOpen(true)} data-testid="button-empty-create">Create your first binder</Button>
            </div>
          )}
        </div>

        {!selectedId && summaries && summaries.length > 0 && (
          <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground" data-testid="text-choose-binder">Choose a binder above to open it.</p>
        )}

        {selectedId && binderQ.isError && (
          <div className="rounded-xl border border-destructive/40 p-6 text-center">
            <p className="mb-2 font-semibold">This binder could not be loaded.</p>
            <Button variant="outline" onClick={() => binderQ.refetch()} data-testid="button-binder-retry">Retry</Button>
          </div>
        )}
        {selectedId && !draft && !binderQ.isError && <Skeleton className="h-[480px] rounded-xl" />}

        {draft && (
          <DndContext sensors={sensors} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { stopTurn(); dragSourceRef.current = null; setDragging(null); }}>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
                <Input data-testid="input-binder-name" value={draft.name} maxLength={80} onChange={(e) => edit((d) => ({ ...d, name: e.target.value }))} className="h-9 w-56 font-semibold" aria-label="Binder name" />
                <input data-testid="input-binder-color" aria-label="Cover color" type="color" value={draft.coverColor} onChange={(e) => edit((d) => ({ ...d, coverColor: e.target.value }))} className="h-9 w-12 cursor-pointer rounded border bg-transparent" />
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Switch checked={!!draft.isPublic} onCheckedChange={(v) => edit((d) => ({ ...d, isPublic: v }))} aria-label="Share publicly" data-testid="switch-binder-public" />
                  {draft.isPublic ? "Public" : "Private"}
                </label>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <span data-testid="status-unsaved" className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", dirty ? "bg-amber-500/15 text-amber-700" : "bg-emerald-500/15 text-emerald-700")}>
                    {dirty ? "Unsaved changes" : "All changes saved"}
                  </span>
                  <Button variant="outline" size="sm" disabled={!dirty || update.isPending} className="gap-1.5" onClick={() => loadDraft(binderQ.data ?? draft)} data-testid="button-discard-changes"><RotateCcw className="h-4 w-4" /> Discard</Button>
                  <Button size="sm" disabled={!dirty || update.isPending} onClick={() => save()} className="gap-1.5" data-testid="button-save-layout"><Save className="h-4 w-4" /> {update.isPending ? "Saving" : "Save layout"}</Button>
                  <Button size="sm" variant="secondary" disabled={update.isPending} onClick={() => { setShareError(null); setShareOpen(true); }} className="gap-1.5 border border-primary/40 font-semibold" data-testid="button-share-binder"><Share2 className="h-4 w-4" /> Share</Button>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" disabled={update.isPending} onClick={() => setDeleteOpen(true)} data-testid="button-delete-binder"><Trash2 className="h-4 w-4" /> Delete</Button>
                </div>
              </div>

              {(draft.isPublic || binderQ.data?.isPublic) && (() => {
                const live = !!binderQ.data?.isPublic && !!binderQ.data.shareToken;
                const url = live ? binderShareUrl(binderQ.data!.shareToken!) : null;
                const pendingChange = !!draft.isPublic !== !!binderQ.data?.isPublic;
                return (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm" data-testid="share-panel">
                    <span className="min-w-48 flex-1" data-testid="text-share-state">
                      {pendingChange
                        ? (draft.isPublic ? "Not shared yet. Save the layout to publish this binder." : "Still public until you save. Save the layout to make it private.")
                        : "Anyone with the link can view this binder, pockets only. Collection details and values stay private."}
                    </span>
                    {url && (
                      <>
                        <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-copy-share"
                          onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Link copied."), () => toast.error("Could not copy the link."))}><Copy className="h-4 w-4" /> Copy link</Button>
                        <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-open-share" onClick={() => window.open(url, "_blank", "noopener")}><ExternalLink className="h-4 w-4" /> Open</Button>
                      </>
                    )}
                  </div>
                );
              })()}

              {conflict && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm" data-testid="banner-conflict" role="alert">
                  <span className="flex-1 min-w-48" data-testid={`text-conflict-${conflict.kind}`}>{conflict.message}</span>
                  <Button size="sm" variant="outline" onClick={reloadServer} data-testid="button-conflict-reload">Reload and discard draft</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConflict(null)} data-testid="button-conflict-keep">Keep editing draft</Button>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-3">
                  <div className="group relative min-h-[360px] overflow-hidden rounded-xl border " data-drag={!!dragging} style={{ height: "min(62dvh, 620px)", background: `radial-gradient(ellipse at 50% 40%, ${draft.coverColor}33, #14161c 85%)` }} data-testid="binder-stage">
                    {draft.pages.length > 0 && (
                      <ViewerBoundary key={String(flat)} fallback={
                        <FlatSpread binder={draft} cards={displayCards} spreadIndex={spread} selectedCardId={selectedCardId} selectedSlot={sel?.type === "slot" ? sel : null} onSlotClick={handleSlot} />
                      }>
                        {flat ? (
                          <div className="h-full overflow-y-auto"><FlatSpread binder={draft} cards={displayCards} spreadIndex={spread} selectedCardId={selectedCardId} selectedSlot={sel?.type === "slot" ? sel : null} onSlotClick={handleSlot} /></div>
                        ) : (
                          <Suspense fallback={<Skeleton className="h-full w-full" />}>
                            <ThreeViewer binder={draft} cards={displayCards} spreadIndex={spread} selectedCardId={selectedCardId} onSlotClick={handleSlot} onTurn={turn} onTurningChange={onTurningChange} />
                          </Suspense>
                        )}
                      </ViewerBoundary>
                    )}
                    {spread > 0 && <TurnZone dir={-1} onTurn={turn} />}
                    {spread < maxSpread(pageCount) && <TurnZone dir={1} onTurn={turn} />}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" disabled={turning || spread <= 0} onClick={() => turn(-1)} aria-label="Previous spread" data-testid="button-binder-prev"><ChevronLeft className="h-4 w-4" /></Button>
                      <span className="min-w-28 text-center text-sm font-medium" data-testid="text-spread">
                        Pages {spread + 1}{draft.pages[spread + 1] ? `-${spread + 2}` : ""} of {pageCount}
                      </span>
                      <Button variant="outline" size="icon" disabled={turning || spread >= maxSpread(pageCount)} onClick={() => turn(1)} aria-label="Next spread" data-testid="button-binder-next"><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                    <Button variant="ghost" size="sm" disabled={turning} onClick={() => setFlat((f) => !f)} data-testid="button-toggle-view">{flat ? "Use 3D view" : "Use flat view"}</Button>
                  </div>

                  <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm" data-testid="selection-bar">
                    {sel ? (
                      <>
                        <span className="flex-1">
                          {sel.type === "library" ? `Placing ${cardMap.get(sel.cardId)?.name ?? "card"}: click a pocket (turn pages first if needed).` : `Moving ${(selectedCardId !== null && selectedCardId < 0 ? "wishlist " : "") + (displayMap.get(selectedCardId ?? 0)?.name ?? "card")}: click a destination pocket to move or swap.`}
                        </span>
                        {sel.type === "slot" && (
                          <Button size="sm" variant="outline" onClick={() => { edit((d) => ({ ...d, pages: clearSlot(d.pages, sel) })); setSel(null); toast.info(selectedCardId !== null && selectedCardId < 0 ? "Wishlist placeholder removed." : "Card returned to the tray."); }} data-testid="button-clear-placement">{selectedCardId !== null && selectedCardId < 0 ? "Remove wishlist placeholder" : "Clear placement"}</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setSel(null)} data-testid="button-clear-selection"><X className="h-4 w-4" /></Button>
                      </>
                    ) : <span className="text-muted-foreground">Drag a card into a pocket, or click a card then a pocket. Click an empty pocket to reserve it for a wishlist card. {placedCount} placed.</span>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2" data-testid="page-strip">
                    {draft.pages.map((p, i) => (
                      <button key={p.id} type="button" onClick={() => goPage(p.id, i)} data-testid={`button-page-${i + 1}`}
                        className={cn("rounded-md border px-2.5 py-1 text-xs font-semibold", p.id === activePage?.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
                        {i + 1}<span className="ml-1 font-normal opacity-70">{p.slots.length}/{p.rows * p.columns}</span>
                      </button>
                    ))}
                    <Button size="sm" variant="outline" disabled={pageCount >= MAX_PAGES} onClick={addPage} className="gap-1" data-testid="button-add-page"><Plus className="h-3.5 w-3.5" /> Add page</Button>
                    <Button size="sm" variant="outline" onClick={() => setPageSettingsOpen(true)} className="gap-1" data-testid="button-page-settings"><Settings2 className="h-3.5 w-3.5" /> Page {activeIndex + 1} holder</Button>
                    <Button size="sm" variant="ghost" disabled={pageCount <= 1} onClick={() => (activePage?.slots.length ? setRemovePageOpen(true) : removePage())} className="gap-1 text-destructive" data-testid="button-remove-page"><Trash2 className="h-3.5 w-3.5" /> Remove page</Button>
                  </div>
                </div>

                <BinderLibrary cards={cards} loading={cardsQ.isLoading} error={cardsQ.isError} onRetry={() => cardsQ.refetch()} usage={usage}
                  selectedId={sel?.type === "library" ? sel.cardId : null}
                  onSelect={(id) => setSel((s) => (s?.type === "library" && s.cardId === id ? null : { type: "library", cardId: id }))} />
              </div>
            </div>

            <DragOverlay dropAnimation={null}>
              {dragging?.cardId !== undefined && displayMap.get(dragging.cardId)?.imageUrl ? (
                <img src={displayMap.get(dragging.cardId)!.imageUrl!} alt="" className="h-36 w-auto rounded-md shadow-2xl" />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {draft && (
        <ShareBinderDialog open={shareOpen} onOpenChange={setShareOpen} binderName={draft.name}
          liveUrl={binderQ.data?.isPublic && binderQ.data.shareToken && binderQ.data.id === draft.id ? binderShareUrl(binderQ.data.shareToken) : null}
          needsSave={dirty || !draft.isPublic || !binderQ.data?.isPublic} dirty={dirty} saving={update.isPending} error={shareError}
          onPublish={() => { setShareError(null); save({ publish: true, onDone: (ok, m) => { if (!ok) setShareError(m ?? "Could not save."); } }); }} />
      )}

      <CreateBinderDialog open={createOpen} onOpenChange={setCreateOpen} pending={create.isPending} onCreate={onCreate} />

      {draft && activePage && pageSettingsOpen && (
        <PageSettingsDialog key={activePage.id} open onOpenChange={setPageSettingsOpen} page={activePage} index={activeIndex}
          onApply={(dims) => { edit((d) => ({ ...d, pages: resizePage(d.pages, activePage.id, dims) })); setSel(null); setPageSettingsOpen(false); }} />
      )}

      {draft && (
        <WishlistSlotDialog open={!!wishTarget} onOpenChange={(o) => !o && setWishTarget(null)} wishlist={wishlist}
          usedIds={new Set([...usage.keys()].filter((k) => k < 0).map((k) => -k))}
          onPick={(item) => {
            const t = wishTarget;
            const cur = draftRef.current;
            if (!t || !cur) return;
            apply(placeWishlist(cur.pages, t, item.id), `${item.name} reserved as a wishlist card. Save to keep it.`);
          }} />
      )}

      <ConfirmDialog testId="create-discard" open={pendingCreate} onOpenChange={setPendingCreate}
        title="Discard unsaved layout?" confirmLabel="Discard and continue" destructive
        onConfirm={() => { setPendingCreate(false); setCreateOpen(true); }}>
        <p>Creating a new binder opens it and drops your unsaved changes to this one. Cancel to keep editing.</p>
      </ConfirmDialog>

      <ConfirmDialog testId="switch-binder" open={pendingSwitch !== "none"} onOpenChange={(o) => !o && setPendingSwitch("none")}
        title="Discard unsaved layout?" confirmLabel="Discard and switch" destructive
        onConfirm={() => { const id = pendingSwitch; setPendingSwitch("none"); if (typeof id === "number") doSwitch(id); }}>
        <p>Your arrangement has changes that were not saved. Switching binders will drop them. Cards in your collection are unaffected.</p>
      </ConfirmDialog>

      <ConfirmDialog testId="remove-page" open={removePageOpen} onOpenChange={setRemovePageOpen} title="Remove this page?" confirmLabel="Remove page" destructive onConfirm={removePage}>
        <p>The {activePage?.slots.length ?? 0} card{activePage?.slots.length === 1 ? "" : "s"} on this page come out of their pockets and return to the tray. They stay in your collection.</p>
        <p>Takes effect when you save the layout.</p>
      </ConfirmDialog>

      <ConfirmDialog testId="delete-binder" open={deleteOpen} onOpenChange={setDeleteOpen} title={`Delete "${draft?.name ?? "binder"}"?`} confirmLabel={del.isPending ? "Deleting" : "Delete binder"} destructive onConfirm={onDelete}>
        <p className="font-semibold text-foreground">All {placedCount} placed card{placedCount === 1 ? "" : "s"} stay safely in your collection.</p>
        <p>Only this virtual arrangement is removed. This cannot be undone.</p>
      </ConfirmDialog>
    </Layout>
  );
}

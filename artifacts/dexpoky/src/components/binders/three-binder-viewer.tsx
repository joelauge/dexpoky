import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import type { Binder, BinderPage, Card } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { addContactShadow, addPage, addSceneHardware, makeBox, makeRetainedPageTurn, type PortalPage } from "./binder-scene-geometry";
import { updateBinderCssFacing } from "./binder-scene-facing";
import { clampViewAngle } from "./binder-scene-motion";
import { pageGeometrySignature, stablePageCompositionKey, pageTurnPlan } from "./binder-page-window";
import { useBinderPageComposition } from "./use-binder-page-composition";

type ViewAction = "left" | "right" | "up" | "down" | "reset";
type ViewMotion = { targetYaw: number; targetPitch: number; currentYaw: number; currentPitch: number };
type PageSceneNode = ReturnType<typeof addPage>;
type PageCacheEntry = { signature: string; node: PageSceneNode };
type ViewerRuntime = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  pageNodes: Map<string, PageCacheEntry>;
  updateShell: (binder: Binder, coverColor: string) => void;
  invalidate: () => void;
  startFlip: (plan: NonNullable<ReturnType<typeof pageTurnPlan>>, pages: BinderPage[]) => boolean;
  cancelFlip: () => void;
  getTurnVisibleKeys: () => Set<string> | null;
};
type ThreeBinderViewerProps = {
  binder: Binder;
  cards: Card[];
  spreadIndex: number;
  selectedCardId: number | null;
  onSlotClick: (pageId: string, slot: number) => void;
  onTurn: (direction: 1 | -1) => void;
};

function PocketArtwork({ card, slot, lightSurface }: { card?: Card; slot: number; lightSurface: boolean }) {
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = imageRef.current;
    if (!image || !image.decode) return;
    // Decode this existing element even while its cached page is hidden.
    // No replacement Image or alternate artwork request is needed.
    const decode = () => { void image.decode().catch(() => undefined); };
    if (image.complete) decode();
    else image.addEventListener("load", decode, { once: true });
    return () => image.removeEventListener("load", decode);
  }, [card?.imageUrl]);
  return (
    <>
      {card?.imageUrl ? (
        <img
          ref={imageRef}
          src={card.imageUrl}
          alt={card.name}
          loading="eager"
          decoding="async"
          draggable={false}
          className="h-full w-full object-contain"
        />
      ) : card ? (
        <span className={cn("p-2 leading-tight", lightSurface ? "text-slate-800" : "text-white")}>
          {card.name}
          <small className={cn("mt-1 block text-[0.75em]", lightSurface ? "text-slate-600" : "text-white/60")}>Artwork unavailable</small>
        </span>
      ) : (
        <span className={cn(
          "pointer-events-none flex flex-col items-center gap-1 font-medium tracking-[.12em]",
          lightSurface ? "text-[#514a40]/75" : "text-white/45",
        )}>
          <span className={cn("font-mono text-[.8em]", lightSurface ? "text-[#62594c]/80" : "text-white/35")}>{String(slot + 1).padStart(2, "0")}</span>
          <small className="uppercase">Empty slot</small>
        </span>
      )}
      {card && <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 via-black/50 to-transparent px-1 pb-0.5 pt-3 text-[10px] text-white/95">{card.name}</span>}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-[3%] top-[2%] z-10 h-[2%] rounded-t-[2px] shadow-[0_1px_2px_#0002]",
          lightSurface ? "border-t border-[#61584a]/60 bg-gradient-to-b from-[#716858]/10 to-transparent" : "border-t border-white/55 bg-gradient-to-b from-white/25 to-white/5",
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-[1px] z-10 rounded-[inherit]",
          lightSurface ? "border border-[#716858]/45" : "border border-white/15",
        )}
      />
    </>
  );
}

function pocketSlots(page: BinderPage) {
  return Array.from({ length: page.rows * page.columns }, (_, slot) => slot);
}

function PocketSurface({ slot, card, selected, lightSurface }: {
  slot: number;
  card?: Card;
  selected: boolean;
  lightSurface: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full w-full min-h-0 select-none items-center justify-center overflow-hidden rounded-[1.4%] border bg-gradient-to-br from-white/15 via-slate-100/5 to-slate-950/15 text-center text-[clamp(9px,1.2vw,15px)]",
        lightSurface ? "shadow-[inset_0_1px_5px_#0002,inset_0_0_0_1px_#71685830]" : "shadow-[inset_0_1px_5px_#0002,inset_0_0_0_1px_#ffffff24]",
        lightSurface ? "border-[#716858]/50 text-[#3f3a33]/80" : "border-white/40 text-white/65",
        selected && "z-10 outline outline-[3px] outline-offset-[-3px] outline-amber-200",
        card && (lightSurface ? "border-[#716858]/45 bg-white/10" : "border-white/55 bg-white/10"),
      )}
    >
      <PocketArtwork card={card} slot={slot} lightSurface={lightSurface} />
    </div>
  );
}

function PocketInteraction({
  page,
  pageNumber,
  slot,
  card,
  selected,
  onSlotClick,
}: {
  page: BinderPage;
  pageNumber: number;
  slot: number;
  card?: Card;
  selected: boolean;
  onSlotClick: (pageId: string, slot: number) => void;
}) {
  const drop = useDroppable({ id: `pocket-${page.id}-${slot}`, data: { type: "slot", pageId: page.id, slot } });
  const drag = useDraggable({
    id: `slot-card-${page.id}-${slot}`,
    data: { type: "slot", pageId: page.id, slot, cardId: card?.id },
    disabled: !card,
  });
  const dragKeyDown = drag.listeners?.onKeyDown;
  return (
    <div
      ref={(node) => { drop.setNodeRef(node); drag.setNodeRef(node); }}
      {...drag.attributes}
      {...drag.listeners}
      role="button"
      tabIndex={0}
      aria-disabled={false}
      aria-label={`${card ? `${card.name}, ` : ""}page ${pageNumber}, pocket ${slot + 1}`}
      data-testid={`binder-slot-${page.id}-${slot}`}
      onClick={() => onSlotClick(page.id, slot)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || (event.key === " " && !card)) {
          event.preventDefault();
          onSlotClick(page.id, slot);
          return;
        }
        dragKeyDown?.(event);
      }}
      className={cn(
        "absolute inset-0 z-20 touch-none select-none rounded-[1.4%] bg-transparent",
        drop.isOver && "border border-cyan-100/80 bg-cyan-100/15",
        selected && "outline outline-[3px] outline-offset-[-3px] outline-amber-200",
        drag.isDragging && "opacity-30",
      )}
      style={{ touchAction: "none" }}
    />
  );
}

function PortfolioPocket({
  page,
  pageNumber,
  slot,
  card,
  selected,
  onSlotClick,
  lightSurface = false,
  active = true,
}: {
  page: BinderPage;
  pageNumber: number;
  slot: number;
  card?: Card;
  selected: boolean;
  onSlotClick: (pageId: string, slot: number) => void;
  lightSurface?: boolean;
  active?: boolean;
}) {
  return (
    <>
      <PocketSurface slot={slot} card={card} selected={active && selected} lightSurface={lightSurface} />
      {active && (
        <PocketInteraction
          page={page}
          pageNumber={pageNumber}
          slot={slot}
          card={card}
          selected={selected}
          onSlotClick={onSlotClick}
        />
      )}
    </>
  );
}

function LeafPocketArt({ card, slot }: { card?: Card; slot: number }) {
  return (
    <div aria-hidden="true" className="h-full w-full">
      <PocketSurface slot={slot} card={card} selected={false} lightSurface />
    </div>
  );
}

function PagePortal({
  target,
  binder,
  cardsById,
  selectedCardId,
  onSlotClick,
  inactive = false,
  active = true,
}: {
  target: PortalPage;
  binder: Binder;
  cardsById: Map<number, Card>;
  selectedCardId: number | null;
  onSlotClick: (pageId: string, slot: number) => void;
  inactive?: boolean;
  active?: boolean;
}) {
  const page = binder.pages.find(({ id }) => id === target.page.id) ?? target.page;
  const assigned = new Map(page.slots.map(({ slot, cardId }) => [slot, cardsById.get(cardId)]));
  return (
    <>
      {createPortal(
        <div className="pointer-events-none box-border h-full w-full p-[3.4%]" aria-hidden={!active || inactive} aria-label={`Binder page ${target.pageNumber}`}>
          {/* A full-page CSS border/shadow would remain a rigid rectangle above
              the curved sheet. Keep this portal transparent and text-only. */}
          <div className="relative h-full w-full">
            <div className="absolute inset-x-[1.2%] top-[1.2%] flex h-[6.2%] items-center justify-between px-[2%] text-[14px] font-semibold uppercase tracking-[.16em] text-slate-700/75">
              <span>{target.leaf ? "Turning page" : `Page ${target.pageNumber}`}</span>
              <span className="text-slate-600/55">{page.rows} × {page.columns}</span>
            </div>
          </div>
        </div>,
        target.host,
        `${target.key}-heading`,
      )}
      {target.pockets.map(({ slot, host }) => {
        const card = assigned.get(slot);
        return createPortal(
          inactive ? (
            <LeafPocketArt card={card} slot={slot} />
          ) : (
            <PortfolioPocket
              page={page}
              pageNumber={target.pageNumber}
              slot={slot}
              card={card}
              selected={card?.id === selectedCardId}
              onSlotClick={onSlotClick}
              lightSurface
              active={active}
            />
          ),
          host,
          `${target.key}-${slot}`,
        );
      })}
    </>
  );
}

function FallbackSpread({ binder, cards, spreadIndex, selectedCardId, onSlotClick }: ThreeBinderViewerProps) {
  const byId = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const { windowPages, activePageKeys, composedPageKeys } = useBinderPageComposition(binder.pages, spreadIndex, binder.id);
  const activeKeys = new Set(activePageKeys);
  return (
    <div className="grid h-full w-full grid-cols-1 gap-3 overflow-auto rounded-xl p-3 sm:grid-cols-2" style={{ backgroundColor: binder.coverColor }}>
      <p className="col-span-full rounded-md bg-black/50 px-3 py-2 text-sm text-white" role="status">3D view unavailable — tilt and orbit need 3D; showing the accessible binder page view instead.</p>
      {windowPages.filter((page) => composedPageKeys.has(stablePageCompositionKey(page, binder.id))).map((page) => {
        const active = activeKeys.has(stablePageCompositionKey(page, binder.id));
        const pageNumber = binder.pages.indexOf(page) + 1;
        return (
        <section key={stablePageCompositionKey(page, binder.id)} hidden={!active} aria-hidden={!active} className="rounded-lg bg-black/25 p-2">
          <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-widest text-white/85">Page {pageNumber}</h2>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${page.columns}, minmax(0, 1fr))` }}>
            {pocketSlots(page).map((slot) => {
              const cardId = page.slots.find((entry) => entry.slot === slot)?.cardId;
              return (
                <div key={`${page.id}-${slot}`} className="relative aspect-[5/7]">
                <PortfolioPocket
                  page={page}
                  pageNumber={pageNumber}
                  slot={slot}
                  card={cardId === undefined ? undefined : byId.get(cardId)}
                  selected={active && cardId === selectedCardId}
                  onSlotClick={onSlotClick}
                  active={active}
                />
                </div>
              );
            })}
          </div>
        </section>
      );})}
    </div>
  );
}

export function ThreeBinderViewer(props: ThreeBinderViewerProps) {
  const { binder, cards, spreadIndex, selectedCardId, onSlotClick } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<ViewMotion>({ targetYaw: 0, targetPitch: 0, currentYaw: 0, currentPitch: 0 });
  const viewActionRef = useRef<(action: ViewAction) => void>(() => {});
  const runtimeRef = useRef<ViewerRuntime | null>(null);
  const activePortalsRef = useRef<PortalPage[]>([]);
  const priorSpread = useRef<number | null>(null);
  const priorWindowSignature = useRef("");
  const lastShellSignature = useRef("");
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const [portalPages, setPortalPages] = useState<PortalPage[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const { windowPages, activePageKeys, composedPageKeys } = useBinderPageComposition(binder.pages, spreadIndex, binder.id);
  const activeKeys = new Set(activePageKeys);
  const windowSignature = JSON.stringify(windowPages.map(pageGeometrySignature));
  const shellSignature = JSON.stringify([
    binder.id,
    binder.coverColor,
    binder.pages.map(({ id, widthMm, heightMm }) => [id, widthMm, heightMm]),
  ]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || unavailable) return;
    let webgl: THREE.WebGLRenderer | null = null;
    let css: CSS3DRenderer | null = null;
    try {
      webgl = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      css = new CSS3DRenderer();
    } catch {
      webgl?.dispose();
      webgl?.forceContextLoss();
      webgl?.domElement.remove();
      css?.domElement.remove();
      setUnavailable(true);
      return;
    }
    if (!webgl || !css) {
      webgl?.dispose();
      webgl?.forceContextLoss();
      webgl?.domElement.remove();
      css?.domElement.remove();
      setUnavailable(true);
      return;
    }
    webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    webgl.setClearColor(0x000000, 0);
    webgl.outputColorSpace = THREE.SRGBColorSpace;
    webgl.domElement.className = "absolute inset-0 h-full w-full";
    webgl.domElement.style.pointerEvents = "none";
    const cssElement = css.domElement;
    cssElement.className = "absolute inset-0 h-full w-full";
    cssElement.style.pointerEvents = "none";
    host.append(webgl.domElement, cssElement);

    const scene = new THREE.Scene();
    scene.background = null;
    const ambient = new THREE.HemisphereLight(0xfff4e0, new THREE.Color(binder.coverColor).multiplyScalar(0.5), 1.5);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.4);
    keyLight.position.set(-3, 5, 8);
    scene.add(keyLight);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 1.05, 10.2);
    camera.lookAt(0, 0, 0);
    const motion = motionRef.current;
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let reduceMotion = motionQuery?.matches ?? false;
    let cameraDistance = camera.position.z;
    let cameraBaseY = camera.position.y;
    let maxWidth = 2.5;
    let pageHeight = 3.2;
    const gap = 0.12;
    let frame = 0;
    let dirty = true;
    let animating = false;
    let disposed = false;
    let flip: ReturnType<typeof makeRetainedPageTurn> | null = null;
    let turnVisibleKeys: Set<string> | null = null;
    let flipStart = 0;
    let flipFrom = 0;
    let flipTo = -Math.PI;
    const pageNodes = new Map<string, PageCacheEntry>();
    const shell = new THREE.Group();
    scene.add(shell);
    const updateCameraForMotion = () => {
      camera.position.set(
        Math.sin(motion.currentYaw) * cameraDistance,
        cameraBaseY + Math.sin(motion.currentPitch) * cameraDistance,
        Math.cos(motion.currentYaw) * cameraDistance,
      );
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
    };
    const render = (time: number) => {
      if (disposed) return;
      if (animating && flip) {
        const progress = Math.min(1, (time - flipStart) / 760);
        const eased = progress * progress * (3 - 2 * progress);
        flip.pivot.rotation.y = flipFrom + (flipTo - flipFrom) * eased;
        flip.updateCurl(eased);
        dirty = true;
        if (progress >= 1) {
          animating = false;
          flip.dispose();
          flip = null;
          turnVisibleKeys = null;
          for (const target of activePortalsRef.current) {
            pageNodes.get(stablePageCompositionKey(target.page))?.node.setVisible(!!target.active);
          }
          setPortalPages(activePortalsRef.current);
        }
      }
      const yawDelta = motion.targetYaw - motion.currentYaw;
      const pitchDelta = motion.targetPitch - motion.currentPitch;
      const motionNeedsFrame = Math.abs(yawDelta) > 0.0005 || Math.abs(pitchDelta) > 0.0005;
      if (motionNeedsFrame) {
        motion.currentYaw += yawDelta * 0.18;
        motion.currentPitch += pitchDelta * 0.18;
        if (Math.abs(motion.targetYaw - motion.currentYaw) < 0.0005) motion.currentYaw = motion.targetYaw;
        if (Math.abs(motion.targetPitch - motion.currentPitch) < 0.0005) motion.currentPitch = motion.targetPitch;
        updateCameraForMotion();
        dirty = true;
      }
      if (dirty) {
        webgl.render(scene, camera);
        updateBinderCssFacing(scene, camera);
        css.render(scene, camera);
        dirty = false;
      }
      if (animating || motionNeedsFrame || dirty) frame = requestAnimationFrame(render);
      else frame = 0;
    };
    const invalidate = () => {
      dirty = true;
      if (!frame) frame = requestAnimationFrame(render);
    };
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      webgl.setSize(width, height, false);
      css.setSize(width, height);
      camera.aspect = width / height;
      const spreadWidth = maxWidth * 2 + gap + 0.4;
      const visibleWidthScale = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * 2;
      const visibleHeightScale = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2;
      cameraDistance = Math.max(spreadWidth / visibleWidthScale, pageHeight / visibleHeightScale) * 1.18;
      cameraBaseY = pageHeight * 0.24;
      updateCameraForMotion();
      camera.updateProjectionMatrix();
      invalidate();
    };
    const updateShell = (nextBinder: Binder, coverColor: string) => {
      for (const child of [...shell.children]) {
        shell.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => material.dispose());
        }
      }
      maxWidth = Math.max(...nextBinder.pages.map((page) => page.widthMm / 100), 2.5);
      pageHeight = Math.max(...nextBinder.pages.map((page) => page.heightMm / 100), 3.2);
      const safeCover = /^#[0-9a-f]{6}$/i.test(coverColor) ? coverColor : "#374151";
      addContactShadow(shell, maxWidth + 0.32, pageHeight);
      for (const side of [-1, 1]) {
        const cover = makeBox(maxWidth + 0.28, pageHeight + 0.28, 0.11, safeCover, 0.48);
        cover.position.set(side * (maxWidth / 2 + 0.08), 0, -0.13);
        shell.add(cover);
        const liner = makeBox(maxWidth + 0.08, pageHeight + 0.08, 0.018, new THREE.Color(safeCover).multiplyScalar(1.18), 0.68);
        liner.position.set(side * (maxWidth / 2 + 0.08), 0, -0.065);
        shell.add(liner);
      }
      const spine = makeBox(0.28, pageHeight + 0.28, 0.19, safeCover, 0.5);
      spine.position.set(0, 0, -0.12);
      shell.add(spine);
      addSceneHardware(shell, nextBinder, maxWidth / 2, pageHeight);
      ambient.groundColor.set(safeCover).multiplyScalar(0.5);
      for (const page of pageNodes.values()) {
        const index = nextBinder.pages.findIndex(({ id }) => id === page.node.portal.page.id);
        if (index >= 0) page.node.setPosition((index % 2 === 0 ? -1 : 1) * (maxWidth / 2 + gap / 2));
      }
      resize();
    };
    const cancelFlip = () => {
      if (!flip) return;
      animating = false;
      flip.dispose();
      flip = null;
      turnVisibleKeys = null;
      for (const target of activePortalsRef.current) {
        pageNodes.get(stablePageCompositionKey(target.page))?.node.setVisible(!!target.active);
      }
      setPortalPages(activePortalsRef.current);
      invalidate();
    };
    const startFlip: ViewerRuntime["startFlip"] = (plan, pages) => {
      cancelFlip();
      if (reduceMotion) return false;
      const front = pageNodes.get(stablePageCompositionKey(pages[plan.front]))?.node;
      const back = pageNodes.get(stablePageCompositionKey(pages[plan.back]))?.node;
      if (!front || !back) return false;
      turnVisibleKeys = new Set(
        [plan.front, plan.back, plan.stationary, plan.revealed]
          .filter((index) => !!pages[index])
          .map((index) => stablePageCompositionKey(pages[index])),
      );
      for (const [key, entry] of pageNodes) entry.node.setVisible(turnVisibleKeys.has(key));
      const backwards = plan.backwards;
      flip = makeRetainedPageTurn(scene, front, back, backwards);
      flipFrom = backwards ? -Math.PI : 0;
      flipTo = backwards ? 0 : -Math.PI;
      flip.pivot.rotation.y = flipFrom;
      flipStart = performance.now();
      animating = true;
      invalidate();
      return true;
    };
    updateShell(binder, binder.coverColor);

    const viewRoot = viewerRef.current;
    let dragPointer: number | null = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartYaw = 0;
    let dragStartPitch = 0;
    const clamp = clampViewAngle;
    const isSlotTarget = (target: EventTarget | null) => target instanceof Element && !!target.closest('[data-testid^="binder-slot-"]');
    const isButtonTarget = (target: EventTarget | null) => target instanceof Element && !!target.closest("button");
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isSlotTarget(event.target) || isButtonTarget(event.target)) return;
      dragPointer = event.pointerId;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      dragStartYaw = motion.targetYaw;
      dragStartPitch = motion.targetPitch;
      viewRoot?.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (isSlotTarget(event.target) || isButtonTarget(event.target)) return;
      if (dragPointer === event.pointerId) {
        motion.targetYaw = clamp(dragStartYaw + (event.clientX - dragStartX) * 0.0028, 0.16);
        motion.targetPitch = clamp(dragStartPitch + (event.clientY - dragStartY) * 0.0024, 0.12);
        invalidate();
      } else if (event.pointerType === "mouse" && event.buttons === 0 && !reduceMotion && viewRoot) {
        const bounds = viewRoot.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * 2 - 1;
        const y = ((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * 2 - 1;
        motion.targetYaw = clamp(x * 0.055, 0.055);
        motion.targetPitch = clamp(-y * 0.035, 0.035);
        invalidate();
      }
    };
    const resetParallax = () => {
      if (dragPointer !== null) return;
      motion.targetYaw = 0;
      motion.targetPitch = 0;
      invalidate();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (dragPointer !== event.pointerId) return;
      dragPointer = null;
      if (viewRoot?.hasPointerCapture(event.pointerId)) viewRoot.releasePointerCapture(event.pointerId);
    };
    const onPreferenceChange = (event: MediaQueryListEvent) => {
      reduceMotion = event.matches;
      if (reduceMotion) {
        motion.targetYaw = 0;
        motion.targetPitch = 0;
        cancelFlip();
      }
      invalidate();
    };
    const applyViewAction = (action: ViewAction) => {
      if (action === "reset") {
        motion.targetYaw = 0;
        motion.targetPitch = 0;
      } else if (action === "left") motion.targetYaw = clamp(motion.targetYaw - 0.035, 0.16);
      else if (action === "right") motion.targetYaw = clamp(motion.targetYaw + 0.035, 0.16);
      else if (action === "up") motion.targetPitch = clamp(motion.targetPitch - 0.025, 0.12);
      else motion.targetPitch = clamp(motion.targetPitch + 0.025, 0.12);
      invalidate();
    };
    viewActionRef.current = applyViewAction;
    viewRoot?.addEventListener("pointerdown", onPointerDown);
    viewRoot?.addEventListener("pointermove", onPointerMove);
    viewRoot?.addEventListener("pointerup", onPointerUp);
    viewRoot?.addEventListener("pointercancel", onPointerUp);
    viewRoot?.addEventListener("pointerleave", resetParallax);
    motionQuery?.addEventListener("change", onPreferenceChange);
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setUnavailable(true);
    };
    webgl.domElement.addEventListener("webglcontextlost", onContextLost);

    const runtime: ViewerRuntime = {
      scene,
      camera,
      pageNodes,
      updateShell,
      invalidate,
      startFlip,
      cancelFlip,
      getTurnVisibleKeys: () => turnVisibleKeys,
    };
    runtimeRef.current = runtime;
    activePortalsRef.current = [];
    priorSpread.current = null;
    lastShellSignature.current = JSON.stringify([
      binder.id,
      binder.coverColor,
      binder.pages.map(({ id, widthMm, heightMm }) => [id, widthMm, heightMm]),
    ]);
    setPortalPages([]);
    setRuntimeVersion((version) => version + 1);

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      if (dragPointer !== null && viewRoot?.hasPointerCapture(dragPointer)) viewRoot.releasePointerCapture(dragPointer);
      viewRoot?.removeEventListener("pointerdown", onPointerDown);
      viewRoot?.removeEventListener("pointermove", onPointerMove);
      viewRoot?.removeEventListener("pointerup", onPointerUp);
      viewRoot?.removeEventListener("pointercancel", onPointerUp);
      viewRoot?.removeEventListener("pointerleave", resetParallax);
      motionQuery?.removeEventListener("change", onPreferenceChange);
      viewActionRef.current = () => {};
      webgl.domElement.removeEventListener("webglcontextlost", onContextLost);
      setPortalPages([]);
      flip?.dispose();
      pageNodes.forEach(({ node }) => node.dispose());
      for (const child of [...shell.children]) {
        shell.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => material.dispose());
        }
      }
      runtimeRef.current = null;
      activePortalsRef.current = [];
      webgl.dispose();
      webgl.forceContextLoss();
      cssElement.remove();
      webgl.domElement.remove();
    };
  }, [binder.id, unavailable]);

  useLayoutEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (lastShellSignature.current !== shellSignature) {
      runtime.updateShell(binder, binder.coverColor);
      lastShellSignature.current = shellSignature;
    }
  }, [binder, shellSignature, runtimeVersion]);

  useLayoutEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const oldSpread = priorSpread.current;
    if ((oldSpread !== null && oldSpread !== spreadIndex) ||
        (runtime.getTurnVisibleKeys() && priorWindowSignature.current !== windowSignature)) {
      runtime.cancelFlip();
    }
    const windowIds = new Set(windowPages.map((page) => stablePageCompositionKey(page)));
    for (const [key, entry] of runtime.pageNodes) {
      if (windowIds.has(key)) continue;
      entry.node.dispose();
      runtime.pageNodes.delete(key);
    }
    const nextPortals: PortalPage[] = [];
    for (const page of windowPages) {
      const key = stablePageCompositionKey(page);
      const signature = pageGeometrySignature(page);
      let entry = runtime.pageNodes.get(key);
      if (entry && entry.signature !== signature) {
        entry.node.dispose();
        runtime.pageNodes.delete(key);
        entry = undefined;
      }
      if (!entry) {
        const pageIndex = binder.pages.findIndex(({ id }) => id === page.id);
        const x = (pageIndex % 2 === 0 ? -1 : 1) * (Math.max(...binder.pages.map((item) => item.widthMm / 100), 2.5) / 2 + 0.12 / 2);
        const node = addPage(runtime.scene, page, pageIndex + 1, x);
        entry = { signature, node };
        runtime.pageNodes.set(key, entry);
      }
      const pageIndex = binder.pages.findIndex(({ id }) => id === page.id);
      const active = activeKeys.has(stablePageCompositionKey(page, binder.id));
      const turnKeys = runtime.getTurnVisibleKeys();
      entry.node.setVisible(turnKeys ? turnKeys.has(key) : active);
      nextPortals.push({ ...entry.node.portal, page, pageNumber: pageIndex + 1, active });
    }
    activePortalsRef.current = nextPortals;
    let turning = !!runtime.getTurnVisibleKeys();
    if (oldSpread !== null && oldSpread !== spreadIndex) {
      const plan = pageTurnPlan(binder.pages.length, oldSpread, spreadIndex);
      if (plan) turning = runtime.startFlip(plan, binder.pages);
    }
    setPortalPages(turning ? nextPortals.map((target) => ({ ...target, active: false })) : nextPortals);
    priorSpread.current = spreadIndex;
    priorWindowSignature.current = windowSignature;
    runtime.invalidate();
  }, [runtimeVersion, spreadIndex, windowSignature, binder.pages]);

  if (unavailable) return <div data-testid="binder-3d-viewer" className="h-full min-h-0 w-full"><FallbackSpread {...props} /></div>;

  return (
    <div
      ref={viewerRef}
      data-testid="binder-3d-viewer"
      className="relative h-full min-h-[280px] w-full touch-none overflow-hidden rounded-xl"
      style={{ background: `radial-gradient(ellipse at center, ${binder.coverColor}cc 0%, #11131a 82%)` }}
    >
      <div ref={hostRef} className="absolute inset-x-0 bottom-0 top-12" aria-label={`${binder.name}, open binder`} />
      <div className="absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-center gap-1.5" role="group" aria-label="3D view controls">
        <button type="button" onClick={() => viewActionRef.current("left")} aria-label="Turn view left" title="Turn left" className="h-8 w-8 rounded-md border border-white/15 bg-slate-950/55 text-base text-white/90 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">←</button>
        <button type="button" onClick={() => viewActionRef.current("up")} aria-label="Tilt view up" title="Tilt up" className="h-8 w-8 rounded-md border border-white/15 bg-slate-950/55 text-base text-white/90 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">↑</button>
        <button type="button" onClick={() => viewActionRef.current("down")} aria-label="Tilt view down" title="Tilt down" className="h-8 w-8 rounded-md border border-white/15 bg-slate-950/55 text-base text-white/90 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">↓</button>
        <button type="button" onClick={() => viewActionRef.current("right")} aria-label="Turn view right" title="Turn right" className="h-8 w-8 rounded-md border border-white/15 bg-slate-950/55 text-base text-white/90 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">→</button>
        <button type="button" onClick={() => viewActionRef.current("reset")} aria-label="Reset 3D view" title="Reset view" className="ml-1 h-8 rounded-md border border-white/15 bg-slate-950/55 px-2 text-[10px] font-semibold text-white/90 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">Reset</button>
      </div>
      {portalPages
        .filter((target) => target.leaf || composedPageKeys.has(stablePageCompositionKey(target.page, binder.id)))
        .map((target) => (
          <PagePortal
            key={target.key}
            target={target}
            binder={binder}
            cardsById={cardsById}
            selectedCardId={selectedCardId}
            onSlotClick={onSlotClick}
            inactive={!!target.leaf}
            active={!!target.active}
          />
        ))}
    </div>
  );
}
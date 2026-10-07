import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ScanLine, Layers, BookOpen, Share2, Store, Square, Play } from "lucide-react";

export type FeatureId = "scan" | "collection" | "binders" | "share" | "market";

export const FEATURES: { id: FeatureId; label: string; title: string; copy: string; href: string; cta: string; icon: typeof ScanLine }[] = [
  { id: "scan", label: "Scan", title: "Point, scan, done", copy: "Find your card, confirm the catalog match, then add it to your collection.", href: "/scan", cta: "Scan a card", icon: ScanLine },
  { id: "collection", label: "Collection", title: "Watch your value move", copy: "Every card you add feeds a running picture of what your collection is worth.", href: "/collection", cta: "Open collection", icon: Layers },
  { id: "binders", label: "Binders", title: "Arrange it your way", copy: "Drag cards into pages and flip through a binder that feels like the real thing.", href: "/binders", cta: "Open binders", icon: BookOpen },
  { id: "share", label: "Share", title: "One link, your cards", copy: "Pick what to show and send a shareable link to friends or buyers.", href: "/share", cta: "Create a share link", icon: Share2 },
  { id: "market", label: "Trade", title: "Buy, sell, trade", copy: "Discover listings, contact collectors, and find the cards you are hunting.", href: "/marketplace", cta: "Browse marketplace", icon: Store },
];

const DURATION = 6000;
const HUES = [212, 12, 150, 42, 280, 190];

function Card({ hue = 212, className = "", children }: { hue?: number; className?: string; children?: ReactNode }) {
  return (
    <div
      className={`relative aspect-[5/7] rounded-lg border border-white/25 overflow-hidden shadow-lg ${className}`}
      style={{ background: `linear-gradient(155deg, hsl(${hue} 70% 62%), hsl(${hue + 30} 65% 34%))` }}
    >
      <div className="absolute inset-[7%] rounded-sm bg-white/15" style={{ height: "52%" }} />
      <div className="absolute left-[9%] right-[30%] bottom-[22%] h-[5%] rounded bg-white/70" />
      <div className="absolute left-[9%] right-[48%] bottom-[12%] h-[4%] rounded bg-white/40" />
      {children}
    </div>
  );
}

const ease = [0.22, 1, 0.36, 1] as const;

function ScanScene({ still }: { still: boolean }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div className="relative w-[34%] max-w-[130px]">
        <motion.div initial={still ? false : { rotate: -8, y: 10 }} animate={{ rotate: 0, y: 0 }} transition={{ duration: 0.8, ease }}>
          <Card hue={12} />
        </motion.div>
        {["-top-2 -left-2 border-t-2 border-l-2", "-top-2 -right-2 border-t-2 border-r-2", "-bottom-2 -left-2 border-b-2 border-l-2", "-bottom-2 -right-2 border-b-2 border-r-2"].map((c) => (
          <span key={c} className={`absolute h-4 w-4 border-amber-300 ${c}`} />
        ))}
        {!still && (
          <motion.div className="absolute left-[-8%] right-[-8%] h-0.5 bg-amber-300 shadow-[0_0_12px_2px_rgba(252,211,77,.7)]" initial={{ top: "0%" }} animate={{ top: ["0%", "100%", "0%"] }} transition={{ duration: 2.2, repeat: 2, ease: "easeInOut" }} />
        )}
      </div>
      <motion.div initial={still ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: still ? 0 : 1.6, duration: 0.6, ease }} className="ml-5 w-[34%] space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-emerald-300 font-semibold">Matched</div>
        <div className="h-2.5 w-full rounded bg-white/80" />
        <div className="h-2 w-3/5 rounded bg-white/40" />
        <div className="h-2 w-4/5 rounded bg-white/40" />
        <div className="inline-block rounded-full bg-emerald-400/90 text-slate-900 text-[10px] font-bold px-2.5 py-1">Review &amp; add</div>
      </motion.div>
    </div>
  );
}

function CollectionScene({ still }: { still: boolean }) {
  const bars = [30, 38, 36, 52, 58, 74, 88];
  const pts = bars.map((b, i) => `${i * 16.6},${100 - b}`).join(" ");
  return (
    <div className="w-full h-full flex items-center justify-center gap-5 px-6">
      <div className="grid grid-cols-3 gap-2 w-[42%] max-w-[190px]">
        {HUES.map((h, i) => (
          <motion.div key={h} initial={still ? false : { opacity: 0, y: 24, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: still ? 0 : i * 0.18, duration: 0.5, ease }}>
            <Card hue={h} />
          </motion.div>
        ))}
      </div>
      <div className="w-[42%] max-w-[200px]">
        <div className="text-[10px] uppercase tracking-widest text-white/60 mb-2">Collection value</div>
        <svg viewBox="0 0 100 100" className="w-full h-24 overflow-visible" aria-hidden>
          <motion.polyline points={pts} fill="none" stroke="#fcd34d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: still ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2, delay: still ? 0 : 0.6, ease: "easeOut" }} />
          {bars.map((b, i) => (
            <motion.circle key={i} cx={i * 16.6} cy={100 - b} r="2.5" fill="#fff" initial={{ opacity: still ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ delay: still ? 0 : 0.6 + i * 0.28 }} />
          ))}
        </svg>
      </div>
    </div>
  );
}

function BindersScene({ still }: { still: boolean }) {
  const page = (offset: number) => (
    <div className="grid grid-cols-3 gap-1.5 p-2 w-full">
      {HUES.concat(HUES[0], HUES[2], HUES[4]).slice(0, 9).map((h, i) => (
        <Card key={i} hue={h + offset} className="!rounded-[4px]" />
      ))}
    </div>
  );
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ perspective: 900 }}>
      <div className="flex w-[78%] max-w-[360px] rounded-xl bg-slate-800 border border-white/20 shadow-xl relative">
        <div className="w-1/2 border-r border-white/15">{page(0)}</div>
        <div className="w-1/2">{page(40)}</div>
        <motion.div
          className="absolute right-0 top-0 bottom-0 w-1/2 bg-slate-700 border-l border-white/10 rounded-r-xl origin-left"
          style={{ backfaceVisibility: "hidden" }}
          initial={{ rotateY: still ? -180 : 0 }}
          animate={{ rotateY: -180 }}
          transition={{ delay: still ? 0 : 1.4, duration: 1.2, ease: "easeInOut" }}
        >
          {page(90)}
        </motion.div>
        <motion.div className="absolute w-[11%] z-10" initial={still ? false : { left: "78%", top: "-30%", rotate: 12, opacity: 0 }} animate={{ left: "58%", top: "30%", rotate: 0, opacity: 1 }} transition={{ delay: still ? 0 : 0.2, duration: 0.9, ease }}>
          <Card hue={42} className="ring-2 ring-amber-300" />
        </motion.div>
      </div>
    </div>
  );
}

function ShareScene({ still }: { still: boolean }) {
  return (
    <div className="w-full h-full flex items-center justify-center gap-4 px-4">
      <div className="flex gap-1.5 w-[34%] max-w-[150px]">
        {[190, 280, 150].map((h, i) => (
          <motion.div key={h} className="flex-1" initial={still ? false : { y: 0 }} animate={{ y: still ? 0 : [0, -8, 0] }} transition={{ delay: i * 0.3, duration: 1.2, repeat: still ? 0 : 2 }}>
            <Card hue={h} className={i === 1 ? "ring-2 ring-amber-300" : "opacity-60"} />
          </motion.div>
        ))}
      </div>
      <motion.div className="h-0.5 w-8 bg-amber-300 origin-left" initial={{ scaleX: still ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ delay: still ? 0 : 1, duration: 0.5 }} />
      <motion.div initial={still ? false : { opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: still ? 0 : 1.4, duration: 0.5, ease }} className="w-[36%] max-w-[170px] rounded-xl bg-white/10 border border-white/25 p-3 space-y-2">
        <div className="flex items-center gap-1.5 rounded-md bg-slate-900/70 px-2 py-1.5">
          <Share2 className="h-3 w-3 text-amber-300 shrink-0" />
          <div className="h-1.5 flex-1 rounded bg-white/50" />
        </div>
        <div className="rounded-md bg-amber-300 text-slate-900 text-[11px] font-bold text-center py-1.5">Link ready</div>
      </motion.div>
    </div>
  );
}

function MarketScene({ still }: { still: boolean }) {
  return (
    <div className="w-full h-full flex items-center justify-center gap-3 px-4">
      <motion.div className="w-[22%] max-w-[90px]" initial={still ? false : { x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.6, ease }}>
        <Card hue={280} />
        <div className="mt-1.5 text-center text-[10px] font-semibold text-white/70">Your listing</div>
      </motion.div>
      <div className="flex flex-col gap-2 w-[38%] max-w-[160px]">
        {["Offer", "Trade proposal"].map((t, i) => (
          <motion.div key={t} initial={still ? false : { x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: still ? 0 : 0.8 + i * 0.8, duration: 0.5, ease }} className="rounded-lg bg-white/10 border border-white/25 p-2 flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-amber-300/90 shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="text-[10px] font-semibold text-white">{t}</div>
              <div className="h-1.5 w-3/4 rounded bg-white/35" />
            </div>
          </motion.div>
        ))}
      </div>
      <motion.div className="w-[20%] max-w-[80px]" initial={still ? false : { opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: still ? 0 : 2.2, duration: 0.5, ease }}>
        <Card hue={150} />
        <div className="mt-1.5 text-center text-[10px] font-semibold text-emerald-300">On your wishlist</div>
      </motion.div>
    </div>
  );
}

const SCENES: Record<FeatureId, (p: { still: boolean }) => ReactNode> = {
  scan: (p) => <ScanScene {...p} />,
  collection: (p) => <CollectionScene {...p} />,
  binders: (p) => <BindersScene {...p} />,
  share: (p) => <ShareScene {...p} />,
  market: (p) => <MarketScene {...p} />,
};

interface Props { active: FeatureId; onChange: (id: FeatureId) => void; onNavigate: (href: string) => void }

export function WelcomeFeatureShowcase({ active, onChange, onNavigate }: Props) {
  const reduce = !!useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);
  const idx = FEATURES.findIndex((f) => f.id === active);
  const feature = FEATURES[idx];
  const running = !paused && !reduce;

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => onChange(FEATURES[(idx + 1) % FEATURES.length].id), DURATION);
    return () => clearTimeout(t);
  }, [running, idx, tick, onChange]);

  function select(id: FeatureId) {
    onChange(id);
    setTick((n) => n + 1);
  }

  return (
    <div className="min-h-0 overflow-y-auto">
      <div className="relative h-52 sm:h-60 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-white" role="img" aria-label={`${feature.label} animation: ${feature.copy}`}>
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "18px 18px" }} />
        <AnimatePresence mode="wait">
          <motion.div key={`${active}-${tick}-${running}`} className="absolute inset-0" initial={reduce || paused ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce || paused ? 0 : 0.25 }}>
            {SCENES[active]({ still: !running })}
          </motion.div>
        </AnimatePresence>
        <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-slate-950/50 px-2 py-1 text-[9px] font-medium uppercase tracking-widest text-white/60">Feature preview</span>
        {running && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
            <motion.div key={active + tick} className="h-full bg-amber-300 origin-left" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: DURATION / 1000, ease: "linear" }} />
          </div>
        )}
      </div>

      <div className="px-5 pt-4" aria-live={running ? "off" : "polite"}>
        <h3 className="text-lg font-bold tracking-tight" data-testid="text-feature-title">{feature.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mt-1 min-h-[2.75rem]">{feature.copy}</p>
      </div>

      <div className="px-5 pt-3 flex items-center gap-2">
        <div role="group" aria-label="Choose a feature" className="flex-1 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            const on = f.id === active;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                aria-label={f.label}
                data-testid={`button-feature-${f.id}`}
                onClick={() => select(f.id)}
                className={`min-h-11 rounded-lg border text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="text-[10px] sm:text-xs leading-none">{f.label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          disabled={reduce}
          aria-label={reduce ? "Animations disabled: reduced motion" : paused ? "Replay animations" : "Stop animations"}
          title={reduce ? "Your reduced-motion preference is enabled" : paused ? "Replay animations from the beginning" : "Stop animations and show static previews"}
          data-testid="button-feature-pause"
          className="h-11 w-11 shrink-0 rounded-lg border bg-secondary text-secondary-foreground hover:bg-accent disabled:opacity-40 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {paused || reduce ? <Play className="h-4 w-4" /> : <Square className="h-4 w-4" />}
        </button>
      </div>

      <button type="button" onClick={() => onNavigate(feature.href)} data-testid="button-feature-explore" className="mx-5 mt-3 text-sm font-semibold text-primary hover:underline underline-offset-4 min-h-9">
        {feature.cta} &rarr;
      </button>
    </div>
  );
}

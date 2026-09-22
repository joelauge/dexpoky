import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import { toast } from "sonner";

interface PricePoint {
  id: number;
  price: number;
  source: string | null;
  recordedAt: string;
}

interface Props {
  cardId: number;
}

type Window = "7D" | "30D" | "1Y";

const WINDOWS: { label: Window; days: number }[] = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "1Y", days: 365 },
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateFull(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: PricePoint }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  return (
    <div className="bg-popover border border-border rounded-xl shadow-xl px-3 py-2.5 text-sm">
      <p className="font-bold text-foreground text-base">{formatCurrency(point.value)}</p>
      <p className="text-muted-foreground text-xs mt-0.5">{formatDateFull(point.payload.recordedAt)}</p>
      {point.payload.source && point.payload.source !== "initial" && (
        <p className="text-[10px] text-muted-foreground/60 mt-0.5 capitalize">{point.payload.source}</p>
      )}
    </div>
  );
}

function filterByWindow(history: PricePoint[], days: number): PricePoint[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const inWindow = history.filter(h => new Date(h.recordedAt) >= cutoff);
  if (inWindow.length > 0) return inWindow;
  // If nothing falls in the window, return just the most recent point
  return history.slice(-1);
}

export function PriceHistoryChart({ cardId }: Props) {
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [justRefreshedId, setJustRefreshedId] = useState<number | null>(null);
  const [activeWindow, setActiveWindow] = useState<Window>("1Y");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/price-history`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json() as { history: PricePoint[] };
        setHistory(data.history ?? []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [cardId]);

  const refreshPrice = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setJustRefreshedId(null);
    try {
      const res = await fetch(`/api/cards/${cardId}/price-history/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await res.json() as { point?: PricePoint; error?: string };
      if (!res.ok || !payload.point) throw new Error(payload.error ?? "Could not retrieve the latest price.");
      setHistory(current => {
        const withoutDuplicate = current.filter(point => point.id !== payload.point!.id);
        return [...withoutDuplicate, payload.point!].sort(
          (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
        );
      });
      setJustRefreshedId(payload.point.id);
      window.setTimeout(() => setJustRefreshedId(null), 1400);
      toast.success(`Latest price retrieved: ${formatCurrency(payload.point.price)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not retrieve the latest price.");
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-card border shadow-sm rounded-xl p-5 mb-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-32 mb-4" />
        <div className="h-[120px] bg-muted/50 rounded-lg" />
      </div>
    );
  }

  if (history.length === 0) return null;

  const windowDays = WINDOWS.find(w => w.label === activeWindow)!.days;
  const visible = filterByWindow(history, windowDays);

  const prices = visible.map(h => h.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const latestPrice = prices[prices.length - 1];
  const firstPrice = prices[0];
  const change = latestPrice - firstPrice;
  const changePct = firstPrice > 0 ? (change / firstPrice) * 100 : 0;
  const isUp = change > 0.001;
  const isDown = change < -0.001;

  const trendColor = isUp ? "#22c55e" : isDown ? "#ef4444" : "#3b82f6";
  const gradientId = `priceGrad-${cardId}`;

  const yPad = Math.max((maxPrice - minPrice) * 0.15, maxPrice * 0.05, 0.02);
  const yMin = Math.max(0, minPrice - yPad);
  const yMax = maxPrice + yPad;

  const chartData = visible.map(h => ({
    ...h,
    date: formatDate(h.recordedAt),
  }));

  // Determine if the card has fewer days of data than the selected window
  const oldestPoint = new Date(history[0].recordedAt);
  const cardAgeDays = Math.round((Date.now() - oldestPoint.getTime()) / 86_400_000);
  const windowCoversMore = windowDays > cardAgeDays;

  return (
    <div className="bg-card border shadow-sm rounded-xl p-5 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Value History</p>
            <div className="flex items-center gap-2">
              {visible.length > 1 && (
                <div className={`flex items-center gap-1 text-sm font-semibold ${isUp ? "text-emerald-600" : isDown ? "text-red-500" : "text-blue-500"}`}>
                  {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : isDown ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                  {isUp ? "+" : ""}{formatCurrency(change)}
                  <span className="text-xs font-medium opacity-80">
                    ({isUp ? "+" : ""}{changePct.toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Window toggles */}
          <div className="flex items-center bg-muted/50 rounded-lg p-0.5 gap-0.5">
            {WINDOWS.map(w => (
              <button
                key={w.label}
                onClick={() => setActiveWindow(w.label)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-all ${
                  activeWindow === w.label
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <button
            onClick={refreshPrice}
            disabled={refreshing}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-40"
            title={refreshing ? "Retrieving latest price" : "Retrieve latest price"}
            aria-label={refreshing ? "Retrieving latest price" : "Retrieve latest price"}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {refreshing && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
          Retrieving the latest exact-printing price…
        </div>
      )}

      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={trendColor} stopOpacity={0.18} />
              <stop offset="95%" stopColor={trendColor} stopOpacity={0.01} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            strokeOpacity={0.5}
            vertical={false}
          />

          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            padding={{ left: 8, right: 8 }}
          />

          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) =>
              v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(2)}`
            }
          />

          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: trendColor, strokeWidth: 1, strokeDasharray: "4 2", strokeOpacity: 0.6 }}
          />

          {visible.length === 1 && (
            <ReferenceLine y={latestPrice} stroke={trendColor} strokeDasharray="4 3" strokeOpacity={0.4} />
          )}

          <Area
            type="monotone"
            dataKey="price"
            stroke={trendColor}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={(props: Record<string, unknown>) => {
              const { cx, cy, index } = props as { cx?: number; cy?: number; index?: number };
              const isLast = index === chartData.length - 1;
              if (!isLast || cx == null || cy == null) return <g key={String(props.key ?? index)} />;
               const isNew = chartData[index ?? -1]?.id === justRefreshedId;
               return (
                 <g key={String(props.key ?? index)}>
                   {isNew && <circle cx={cx} cy={cy} r={10} fill={trendColor} opacity={0.2} className="animate-ping" />}
                   <circle cx={cx} cy={cy} r={isNew ? 6 : 5} fill={trendColor} stroke="white" strokeWidth={2} />
                 </g>
               );
            }}
            activeDot={{ r: 5, fill: trendColor, stroke: "white", strokeWidth: 2 }}
            animationDuration={400}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Footnote */}
      {windowCoversMore && (
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          Showing all available data — tracked since {formatDate(history[0].recordedAt)}
        </p>
      )}
    </div>
  );
}

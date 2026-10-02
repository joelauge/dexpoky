import type { PriceLookup, PlatformPriceQuote } from "@workspace/api-client-react";
import { ExternalLink, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Method, native, usd, when, methodValue } from "@/lib/card-lookup-utils";

interface Props {
  lookup: PriceLookup;
  selected: Method | null;
  onSelect: (m: Method) => void;
}

function Row({ q, selected, onSelect }: { q: PlatformPriceQuote; selected: boolean; onSelect?: () => void }) {
  const selectable = !!onSelect && q.status === "available" && q.eligible && q.valueUsd != null;
   const unavailable = q.status === "unavailable" || q.amount == null;
  return (
    <div
      className={cn("rounded-xl border p-4 transition-colors", selected ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "bg-card", q.status === "reference_only" && "bg-muted/30 border-dashed")}
      data-testid={`row-quote-${q.source}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-sm">{q.label}</p>
          <p className="text-[11px] text-muted-foreground">{q.basis}{q.finish ? ` · ${q.finish.replace(/_/g, " ")}` : ""}</p>
        </div>
        <div className="text-right shrink-0">
          {unavailable ? (
            <p className="text-sm font-semibold text-muted-foreground">Unavailable</p>
          ) : (
            <>
               <p className="text-xl font-black tabular-nums">{q.valueUsd == null ? native(q) : usd(q.valueUsd)}</p>
               {q.currency !== "USD" && <p className="text-[11px] text-muted-foreground tabular-nums">{q.valueUsd == null ? "USD conversion unavailable" : `${native(q)} native`}</p>}
            </>
          )}
        </div>
      </div>
      {q.reason && <p className="text-xs text-muted-foreground mt-2">{q.reason}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {q.status === "reference_only" && <span className="px-2 py-0.5 rounded-full bg-secondary font-semibold">Reference only, not saved or averaged</span>}
          {q.status === "available" && !q.eligible && <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-semibold">Not eligible</span>}
          <span>Source updated {when(q.updatedAt)}</span>
          {q.url && (
            <a href={q.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline" data-testid={`link-quote-${q.source}`}>
              View <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {onSelect && (
          <button
            type="button"
            disabled={!selectable}
            onClick={onSelect}
            aria-pressed={selected}
            data-testid={`button-select-${q.source}`}
            className={cn("text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors", selected ? "bg-primary text-primary-foreground border-primary" : "hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed")}
          >
            {selected ? "Selected" : "Use this value"}
          </button>
        )}
      </div>
    </div>
  );
}

export function QuoteTable({ lookup, selected, onSelect }: Props) {
  const platforms = lookup.quotes.filter((q) => q.source !== "ebay");
  const ebay = lookup.quotes.filter((q) => q.source === "ebay");
  const canAvg = methodValue(lookup, "average") != null;
  return (
    <div className="space-y-3">
      {platforms.map((q) => (
        <Row key={q.source} q={q} selected={selected === q.source} onSelect={q.source === "ebay" ? undefined : () => onSelect(q.source as Method)} />
      ))}
      <div className={cn("rounded-xl border p-4", selected === "average" ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "bg-card")} data-testid="row-quote-average">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-sm">Compatible average</p>
            <p className="text-[11px] text-muted-foreground">Same finish, independent platforms only. Sources counted: {lookup.averageSourceCount}</p>
          </div>
          <p className={cn("tabular-nums", canAvg ? "text-xl font-black" : "text-sm font-semibold text-muted-foreground")}>{canAvg ? usd(lookup.averageUsd) : "Unavailable"}</p>
        </div>
        {!canAvg && <p className="text-xs text-muted-foreground mt-2">An average needs at least two eligible platforms on the same finish.</p>}
        <div className="flex justify-end mt-3">
          <button
            type="button"
            disabled={!canAvg}
            onClick={() => onSelect("average")}
            aria-pressed={selected === "average"}
            data-testid="button-select-average"
            className={cn("text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors", selected === "average" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed")}
          >
            {selected === "average" ? "Selected" : "Use this value"}
          </button>
        </div>
      </div>
      {ebay.map((q) => <Row key={q.source} q={q} selected={false} />)}
      <div className="flex gap-2 text-[11px] text-muted-foreground leading-relaxed">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <p>
          Market and trend figures are platform-level prices. They are not condition-specific and are not a guaranteed sale price.
          {lookup.fx ? ` EUR converted at ${lookup.fx.eurToUsd} USD per EUR, rate dated ${lookup.fx.date} (${lookup.fx.source}).` : ""}
        </p>
      </div>
    </div>
  );
}

import { Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ScanPrintingSelection } from "@/lib/scan-printing-selection";

export function ScanPrintingAssessment({
  selection,
  selectedId,
  setCode,
  cardNumber,
}: {
  selection?: ScanPrintingSelection | null;
  selectedId?: string | null;
  setCode?: string | null;
  cardNumber?: string | null;
}) {
  if (!selection) return null;
  const needsReview = selection.status === "review" || selection.status === "unavailable";
  const manuallyChanged = !!selection.recommendedId && !!selectedId && selectedId !== selection.recommendedId;
  const Icon = needsReview ? AlertTriangle : selection.status === "exact" ? CheckCircle2 : Sparkles;
  const title = selection.status === "exact"
    ? "OCR/catalog match"
    : selection.status === "likely"
      ? "Most likely printing"
      : selection.status === "unavailable"
        ? "Match analysis unavailable"
        : "Confirm this printing";

  return (
    <div
      role="status"
      data-testid="scan-printing-assessment"
      className={`rounded-lg border p-3 space-y-1 ${needsReview ? "border-amber-500/30 bg-amber-500/5" : "border-primary/20 bg-primary/5"}`}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        {title}
      </p>
      <p className="text-xs text-muted-foreground">{selection.message}</p>
      {(setCode || cardNumber) && (
        <p className="text-[11px] text-muted-foreground">
          Read from your scan: {[setCode, cardNumber ? `#${cardNumber}` : null].filter(Boolean).join(" · ")}
        </p>
      )}
      {manuallyChanged && (
        <p className="text-[11px] font-medium">You chose a different printing. Your choice is kept.</p>
      )}
    </div>
  );
}
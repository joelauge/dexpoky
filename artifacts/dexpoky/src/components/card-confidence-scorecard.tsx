import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface CardConfidenceResult {
  dimensions: Record<string, {
    score: number | null;
    probabilities: Record<string, number>;
    confidence: number | null;
    status: "safe" | "needs_review" | "blocked" | "unknown" | "unavailable";
    action: string;
    message: string;
  }>;
  modelVersion: string;
  evaluatedAt: string;
  evidenceFresh: boolean;
  unavailable: boolean;
  authenticityDisclaimer: string;
}

const labels: Record<string, string> = {
  printingIdentity: "Printing identity",
  priceEvidence: "Price evidence",
  conditionCertainty: "Condition certainty",
  listingReadiness: "Listing readiness",
};

export function CardConfidenceScorecard({ endpoint, evidence, onResult }: {
  endpoint: string;
  evidence: unknown;
  onResult?: (result: CardConfidenceResult) => void;
}) {
  const [result, setResult] = useState<CardConfidenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const evidenceBody = useMemo(() => JSON.stringify(evidence), [evidence]);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: evidenceBody, signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<CardConfidenceResult> : Promise.reject(new Error("score unavailable")))
      .then((next) => { setResult(next); onResultRef.current?.(next); })
      .catch(() => { if (!controller.signal.aborted) setResult(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, evidenceBody]);

  return (
    <section className="rounded-2xl border bg-card p-4 space-y-3" aria-label="Card evidence confidence">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm">Evidence confidence</h3>
          <p className="text-[11px] text-muted-foreground">This is evidence confidence, not authenticity proof.</p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        {result && (
          <Badge variant="outline" className="text-[10px]">
            {result.unavailable ? "Deterministic only" : result.evidenceFresh ? "Fresh" : "Stale"} · {result.modelVersion}
          </Badge>
        )}
      </div>
      {result ? Object.entries(labels).map(([key, label]) => {
        const dimension = result.dimensions[key];
        if (!dimension) return null;
        const Icon = dimension.status === "safe" ? CheckCircle2 : dimension.status === "unknown" ? HelpCircle : AlertTriangle;
        return <div key={key} className="flex items-start gap-2 border-t pt-2">
          <Icon className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-2 text-xs font-medium">
              <span>{label}</span>
              <span className="text-right">
                {dimension.score != null && `${Math.round(dimension.score * 100)}% · `}
                <span className="capitalize">{dimension.status.replace("_", " ")}</span>
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">{dimension.message}</p>
            {dimension.confidence != null && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Model confidence {Math.round(dimension.confidence * 100)}%
              </p>
            )}
            {dimension.action !== "none" && <p className="text-[11px] font-medium text-primary mt-0.5">Action: {dimension.action.replaceAll("_", " ")}</p>}
          </div>
        </div>;
      }) : !loading && <p className="text-xs text-muted-foreground">Confidence is currently unknown. Review the evidence manually.</p>}
      {result && <p className="text-[10px] text-muted-foreground">Evaluated {new Date(result.evaluatedAt).toLocaleString()}</p>}
    </section>
  );
}
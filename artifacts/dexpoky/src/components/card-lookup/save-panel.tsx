import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { useSaveCardValueSnapshot, type Card, type PriceLookup, type CardValueSnapshot } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type Method, type TargetMatch, methodLabel, methodValue, usd, errMessage, isExpiredErr, when } from "@/lib/card-lookup-utils";

const PREFIXES = ["/api/cards", "/api/inventory", "/api/collections", "/api/categories", "/api/stats"];

interface Props {
  lookup: PriceLookup;
  expired: boolean;
  method: Method | null;
  targets: TargetMatch[];
  targetId: number | null;
  onTarget: (id: number) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export function SavePanel({ lookup, expired, method, targets, targetId, onTarget, onRefresh, refreshing }: Props) {
  const qc = useQueryClient();
  const save = useSaveCardValueSnapshot();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<{ snap: CardValueSnapshot; copy: Card } | null>(null);

  const target = targets.find((t) => t.card.id === targetId)?.card ?? null;
  const value = method ? methodValue(lookup, method) : null;
  const usesEbay = method === "ebay" || (method === "average" && lookup.quotes.some(q => q.source === "ebay" && q.eligible));
  const conditionMismatch = usesEbay && !!target && target.condition !== lookup.condition;
  const dup = targets.length > 1;
  const copyLabel = (c: Card, i: number) => `${dup ? `Copy ${i + 1} of ${targets.length} · ` : ""}ID ${c.id} · ${c.condition.replace(/_/g, " ")}`;

  const confirm = () => {
    if (!target || !method || value == null || conditionMismatch || refreshing || save.isPending || Date.parse(lookup.expiresAt) <= Date.now()) return;
    setError(null);
    save.mutate(
      { cardId: target.id, data: { lookupId: lookup.lookupId, method } },
      {
        onSuccess: (snap) => {
          setSaved({ snap, copy: target });
          setOpen(false);
          qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && PREFIXES.some((p) => (q.queryKey[0] as string).startsWith(p)) });
          toast.success("Today's value saved to this copy");
        },
        onError: (e) => setError(e),
      },
    );
  };

  if (targets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-sm" data-testid="panel-no-target">
        <p className="font-bold mb-1">No owned copy of this exact printing</p>
        <p className="text-muted-foreground text-xs mb-3">You can compare prices here, but there is nothing to save to. Add this printing to your collection first.</p>
         <Link href="/collection/new" className="text-primary text-xs font-semibold hover:underline" data-testid="link-collection">Add a card to your collection</Link>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="panel-save">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Save to one owned copy</p>
      <div className="space-y-2">
        {targets.map((t, i) => (
          <label key={t.card.id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer text-sm ${targetId === t.card.id ? "border-primary bg-primary/5" : ""}`}>
            <input type="radio" name="target" checked={targetId === t.card.id} onChange={() => onTarget(t.card.id)} data-testid={`radio-target-${t.card.id}`} />
            <span className="flex-1 min-w-0">
              <span className="font-semibold block truncate">{copyLabel(t.card, i)}</span>
              <span className="text-xs text-muted-foreground">Current value {usd(t.card.estimatedValue)} · matched by {t.via === "id" ? "catalog ID" : "name, set and number"}</span>
            </span>
            <Link href={`/collection/${t.card.id}`} className="text-xs text-primary hover:underline" data-testid={`link-copy-${t.card.id}`}>Open</Link>
          </label>
        ))}
      </div>

      {expired && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 p-3 text-xs">
          <span>This quote has expired. Refresh before saving.</span>
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing} data-testid="button-refresh-expired">
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      )}

      {conditionMismatch && <p className="text-xs text-destructive">This copy is {target?.condition.replace(/_/g, " ")}; eBay sales are {lookup.condition?.replace(/_/g, " ")}. Change the lookup condition or choose another source.</p>}
      <Button className="w-full" disabled={!target || !method || value == null || conditionMismatch || expired || refreshing || save.isPending} onClick={() => { setError(null); setOpen(true); }} data-testid="button-review-save">
        Review and save today's value
      </Button>
      {!method && <p className="text-xs text-muted-foreground">Choose a source or the compatible average above. Nothing is chosen for you.</p>}

      {saved && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 p-3 text-sm flex gap-2" data-testid="status-saved">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">Saved {usd(saved.snap.value)} to copy ID {saved.copy.id}</p>
            <p className="text-xs">{methodLabel(saved.snap.method)} · recorded {when(saved.snap.recordedAt)}</p>
            <Link href={`/collection/${saved.copy.id}`} className="text-xs font-semibold underline">View card</Link>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!save.isPending) setOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save today's value?</DialogTitle>
            <DialogDescription>This updates one copy only.</DialogDescription>
          </DialogHeader>
          {target && (
            <div className="text-sm space-y-2">
              <p><span className="text-muted-foreground">Copy:</span> <strong>{lookup.card.name}</strong>, ID {target.id}{dup ? ` (copy ${targets.findIndex((t) => t.card.id === target.id) + 1} of ${targets.length})` : ""}</p>
              <p className="tabular-nums"><span className="text-muted-foreground">Value:</span> {usd(target.estimatedValue)} <span className="mx-1">to</span> <strong>{usd(value)}</strong></p>
              <p><span className="text-muted-foreground">Method:</span> {method ? methodLabel(method) : ""}</p>
               <p><span className="text-muted-foreground">Finish:</span> {lookup.finish.replace(/_/g, " ")}</p>
               {method === "average" && <p><span className="text-muted-foreground">Sources:</span> {lookup.quotes.filter(q => q.eligible).map(q => q.label).join(", ")}</p>}
              <p className="text-xs rounded-lg bg-muted/50 p-3">This is a one-time snapshot of today's value. It does not create a rule, and future price refreshes may replace it.</p>
            </div>
          )}
          {error != null && (
            <div className="flex gap-2 text-xs rounded-lg bg-red-50 border border-red-200 text-red-800 p-3" data-testid="text-save-error">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p>{isExpiredErr(error) ? "This quote expired before it could be saved." : errMessage(error)}</p>
                {isExpiredErr(error) && (
                  <button className="font-bold underline mt-1" onClick={() => { setOpen(false); onRefresh(); }} data-testid="button-refresh-error">Refresh prices</button>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={save.isPending}>Cancel</Button>
            {conditionMismatch && <p className="text-xs text-destructive">Your copy's condition must match {lookup.condition?.replace(/_/g, " ")} to save eBay sales. Change the lookup condition or choose another source.</p>}
            <Button onClick={confirm} disabled={save.isPending || refreshing || expired || value == null || conditionMismatch} data-testid="button-confirm-save">
              {save.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving</> : "Save value"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPokemonSetQueryKey,
  getListPokemonSetsQueryKey,
  useEnsureSetCatalogCard,
  type EnsureSetCatalogCardResult,
} from "@workspace/api-client-react";
import { ArrowUpRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Verification adds catalog metadata only; it never creates an owned copy. */
export function SetMembershipNotice({ catalogCardId, onVerified }: { catalogCardId: string; onVerified?: (result: EnsureSetCatalogCardResult | null) => void }) {
  const queryClient = useQueryClient();
  const started = useRef(false);
  const { mutate, data, isPending, isError } = useEnsureSetCatalogCard({
    mutation: {
      onError: () => onVerified?.(null),
      onSuccess: (result) => {
        onVerified?.(result);
        if (result.status === "unmatched" || !result.setId) return;
        void queryClient.invalidateQueries({ queryKey: getGetPokemonSetQueryKey(result.setId) });
        void queryClient.invalidateQueries({ queryKey: getListPokemonSetsQueryKey() });
      },
    },
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate({ data: { catalogCardId } });
  }, [catalogCardId, mutate]);

  const verified = data?.status !== "unmatched" && !!data?.setId;
  return (
    <div className="mt-3 rounded-lg bg-secondary/40 p-3 text-xs" data-testid="notice-set-membership" aria-live="polite">
      {isPending ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          Checking the expansion checklist…
        </p>
      ) : isError ? (
        <>
          <p className="text-muted-foreground">Couldn’t verify this card’s expansion checklist. Pricing is checked separately.</p>
          <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-xs" onClick={() => mutate({ data: { catalogCardId } })}>
            Retry checklist verification
          </Button>
        </>
      ) : verified ? (
        <>
          <p className="flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <span>{data!.status === "added" ? "Added to" : "Verified in"} the {data!.setName ?? "expansion"} checklist.</span>
          </p>
          <Link href={`/sets/${encodeURIComponent(data!.setId!)}`} className="mt-2 inline-flex items-center gap-1 font-semibold text-primary hover:underline" data-testid="link-card-checklist">
            View checklist <ArrowUpRight className="h-3 w-3" />
          </Link>
          <p className="mt-1.5 text-muted-foreground">Checklist verification alone does not add an owned copy.</p>
        </>
      ) : data ? (
        <p className="text-muted-foreground">{data.message}</p>
      ) : null}
    </div>
  );
}
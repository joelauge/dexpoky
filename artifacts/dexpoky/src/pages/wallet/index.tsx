import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { useAuthFetch } from "@/lib/use-auth-fetch";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, ArrowLeft, Plus, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { WALLET_BALANCE_QUERY_KEY } from "@/hooks/use-payment-sse";

interface WalletData {
  balanceCents: number;
  topupAmounts: number[];
  recentPayments: {
    id: number;
    amountCents: number;
    feeCents: number;
    status: string;
    paymentMethod: string;
    createdAt: string;
  }[];
  recentCredits: {
    id: number;
    amountCents: number;
    kind: string;
    status: string;
    createdAt: string;
    note?: string;
  }[];
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function WalletPage() {
  const authFetch = useAuthFetch();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const topupResult = params.get("topup");
  const topupAmount = params.get("amount");

  const [toppingUp, setToppingUp] = useState<number | null>(null);

  useEffect(() => {
    if (topupResult === "ok" && topupAmount) {
      toast.success(`Wallet topped up by ${formatCents(parseInt(topupAmount, 10))}!`);
      window.dispatchEvent(new Event("wallet:refresh"));
    } else if (topupResult === "failed") {
      toast.error("Top-up was cancelled or failed.");
    }
  }, [topupResult, topupAmount]);

  const { data, isLoading: loading, refetch } = useQuery<WalletData | null>({
    queryKey: WALLET_BALANCE_QUERY_KEY,
    queryFn: () =>
      authFetch("/api/wallet/balance")
        .then(r => r.ok ? r.json() as Promise<WalletData> : null)
        .catch(() => null),
  });

  useEffect(() => {
    const handleRefresh = () => { void refetch(); };
    window.addEventListener("wallet:refresh", handleRefresh);
    return () => window.removeEventListener("wallet:refresh", handleRefresh);
  }, [refetch]);

  const handleTopup = async (amountCents: number) => {
    setToppingUp(amountCents);
    try {
      const res = await authFetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        toast.error("Could not initiate top-up");
        setToppingUp(null);
      }
    } catch {
      toast.error("Something went wrong");
      setToppingUp(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/inbox">
            <button type="button" className="p-2 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <h1 className="text-xl font-bold tracking-tight">DexPoky Wallet</h1>
        </div>

        {/* Balance card */}
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-1 opacity-80">
            <Wallet className="h-4 w-4" />
            <p className="text-sm font-medium">Available balance</p>
          </div>
          {loading ? (
            <Skeleton className="h-10 w-36 bg-white/20" />
          ) : (
            <p className="text-4xl font-bold tracking-tight">{formatCents(data?.balanceCents ?? 0)}</p>
          )}
          <p className="text-xs opacity-70 mt-2">Used to pay for P2P trades on DexPoky</p>
        </div>

        {/* Top-up */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Add funds</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(data?.topupAmounts ?? [1000, 2500, 5000, 10000]).map(cents => (
              <Button
                key={cents}
                variant="outline"
                className="h-14 flex-col gap-0.5 text-base font-bold"
                disabled={toppingUp !== null}
                onClick={() => handleTopup(cents)}
              >
                {toppingUp === cents ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <span>{formatCents(cents)}</span>
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  </>
                )}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Funds are added instantly after payment. Powered by Stripe — your card is never stored on DexPoky.
          </p>
        </div>

        {/* Recent payments made */}
        {data && data.recentPayments.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Payments made</h2>
            <div className="space-y-2">
              {data.recentPayments.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-xl border bg-card px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {p.status === "completed"
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      : <Clock className="h-4 w-4 text-muted-foreground" />}
                    <div>
                      <p className="text-sm font-medium capitalize">{p.paymentMethod === "wallet" ? "From wallet" : "By card"}</p>
                      <p className="text-[11px] text-muted-foreground">{format(new Date(p.createdAt), "MMM d, yyyy")}</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-destructive">−{formatCents(p.amountCents)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Credits received */}
        {data && data.recentCredits.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Credits received</h2>
            <div className="space-y-2">
              {data.recentCredits.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border bg-card px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <div>
                      <p className="text-sm font-medium">{c.kind === "sale_credit" ? "Sale credit" : "Payout"}</p>
                      <p className="text-[11px] text-muted-foreground">{format(new Date(c.createdAt), "MMM d, yyyy")}</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-emerald-600">+{formatCents(c.amountCents)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {data && data.recentPayments.length === 0 && data.recentCredits.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No transactions yet. Top up your wallet to start trading!
          </div>
        )}
      </div>
    </Layout>
  );
}

function Loader2Icon({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

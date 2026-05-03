import { useState } from "react";
import { useUser, Show } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, ShieldAlert, Banknote } from "lucide-react";

interface PayoutRow {
  id: number;
  sellerClerkId: string;
  amountCents: number;
  status: string;
  payoutMethod: string | null;
  payoutDestination: string | null;
  note: string | null;
  createdAt: string;
  seller: { clerkId: string; username: string | null };
}

function fmtUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminPayouts() {
  const { user, isLoaded } = useUser();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"pending" | "completed" | "cancelled">("pending");

  const { data: adminCheck, isLoading: checkingAdmin } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/me"],
    queryFn: () => fetch("/api/admin/me").then(r => r.json()),
    enabled: !!user,
  });

  const { data: payouts, isLoading } = useQuery<PayoutRow[]>({
    queryKey: ["/api/admin/payouts", status],
    queryFn: () => fetch(`/api/admin/payouts?status=${status}`).then(r => r.json()),
    enabled: !!adminCheck?.isAdmin,
  });

  const markPaid = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/payouts/${id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then(async r => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/payouts"] });
      toast.success("Payout marked paid.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/payouts/${id}/cancel`, { method: "POST" }).then(async r => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/payouts"] });
      toast.success("Payout cancelled, funds returned to seller.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isLoaded || checkingAdmin) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Show
      when="signed-in"
      fallback={
        <Layout>
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <ShieldAlert className="h-12 w-12 text-muted-foreground/50" />
            <h2 className="text-xl font-bold">Sign in required</h2>
            <Button onClick={() => setLocation("/sign-in")}>Sign In</Button>
          </div>
        </Layout>
      }
    >
      <Layout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-20">
          {!adminCheck?.isAdmin ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-center">
              <ShieldAlert className="h-12 w-12 text-amber-500" />
              <h2 className="text-xl font-bold">Admin access required</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Your account is not in the admin list. Add your Clerk user ID to the{" "}
                <code className="bg-muted px-1 rounded">ADMIN_CLERK_IDS</code> env var to access this page.
              </p>
              <p className="text-xs text-muted-foreground font-mono mt-2">Your Clerk ID: {user?.id}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-6">
                <Banknote className="h-6 w-6 text-primary" />
                <h1 className="text-3xl font-bold tracking-tight">Payout Requests</h1>
              </div>

              <Tabs value={status} onValueChange={(v) => setStatus(v as "pending" | "completed" | "cancelled")} className="mb-6">
                <TabsList>
                  <TabsTrigger value="pending">Pending</TabsTrigger>
                  <TabsTrigger value="completed">Completed</TabsTrigger>
                  <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
                </TabsList>
              </Tabs>

              {isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !payouts || payouts.length === 0 ? (
                <div className="bg-card border rounded-2xl p-10 text-center text-muted-foreground">
                  No {status} payouts.
                </div>
              ) : (
                <div className="space-y-3">
                  {payouts.map(p => (
                    <div key={p.id} className="bg-card border rounded-2xl p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-2xl font-bold text-primary">{fmtUsd(p.amountCents)}</span>
                            <Badge variant="outline" className="capitalize">{p.payoutMethod ?? "—"}</Badge>
                            <Badge variant={p.status === "pending" ? "default" : p.status === "completed" ? "outline" : "secondary"} className="capitalize">{p.status}</Badge>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">Seller: </span>
                            <span className="font-medium">{p.seller.username ?? "(no name)"}</span>{" "}
                            <span className="text-xs text-muted-foreground font-mono">{p.seller.clerkId}</span>
                          </div>
                          <div className="text-sm mt-1">
                            <span className="text-muted-foreground">Send to: </span>
                            <span className="font-mono">{p.payoutDestination ?? "—"}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Requested {new Date(p.createdAt).toLocaleString()}
                          </div>
                          {p.note && <div className="text-xs text-muted-foreground mt-1 italic">{p.note}</div>}
                        </div>
                        {status === "pending" && (
                          <div className="flex gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => cancel.mutate(p.id)}
                              disabled={cancel.isPending || markPaid.isPending}
                            >
                              <XCircle className="h-4 w-4 mr-1" /> Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => markPaid.mutate(p.id)}
                              disabled={markPaid.isPending || cancel.isPending}
                            >
                              {markPaid.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                              Mark paid
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </Layout>
    </Show>
  );
}

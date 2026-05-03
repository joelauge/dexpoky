import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface BillingStatus {
  planTier: "free" | "collector" | "pro";
  subscriptionStatus: string | null;
  monthlyScansUsed: number;
  monthlyScansLimit: number | null;
  freeTrialActivated: boolean;
  freeTrialScansUsed: number;
  freeTrialScansLimit: number;
  canScan: boolean;
  canCreateUnlimitedListings: boolean;
  canUseSellSheets: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  metadata: Record<string, string>;
  prices: { id: string; unit_amount: number; currency: string; recurring: { interval: string } }[];
}

export function useBillingStatus() {
  const { isSignedIn } = useUser();
  return useQuery<BillingStatus>({
    queryKey: ["billing", "status"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/billing/status`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch billing status");
      return res.json();
    },
    enabled: !!isSignedIn,
    staleTime: 30_000,
  });
}

export function usePlans() {
  return useQuery<{ plans: Plan[] }>({
    queryKey: ["billing", "plans"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/billing/plans`);
      if (!res.ok) throw new Error("Failed to fetch plans");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
}

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ priceId, email }: { priceId: string; email?: string }) => {
      const res = await fetch(`${BASE}/api/billing/checkout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, email }),
      });
      if (!res.ok) throw new Error("Failed to create checkout");
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing"] }),
  });
}

export function useBillingPortal() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/billing/portal`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to open billing portal");
      return res.json() as Promise<{ url: string }>;
    },
  });
}

export function useRecordScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ allowed: boolean; reason?: string }> => {
      const res = await fetch(`${BASE}/api/billing/scan/record`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to record scan");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing", "status"] }),
  });
}

export function useActivateTrial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/billing/trial/activate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to activate trial");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing", "status"] }),
  });
}

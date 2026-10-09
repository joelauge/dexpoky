import { useEffect } from "react";
import { useUser } from "@clerk/react";
import { useAuthFetch } from "@/lib/use-auth-fetch";
import { trackPurchase } from "@/lib/purchase-analytics";

/** Buyer-side recovery also covers background agent purchases and redirects. */
export function PurchaseAnalytics() {
  const { isSignedIn, user } = useUser();
  const authFetch = useAuthFetch();
  useEffect(() => {
    if (!isSignedIn || typeof window.gtag !== "function" ||
        !["dexpoky.com", "www.dexpoky.com"].includes(window.location.hostname)) return;
    let active = true;
    let loading = false;
    const refresh = async () => {
      if (loading || !active || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const res = await authFetch("/api/analytics/purchases");
        if (!res.ok || !active) return;
        const receipts: unknown = await res.json();
        if (active && Array.isArray(receipts)) receipts.forEach(trackPurchase);
      } catch { /* Best effort; next refresh retries, without interrupting UI. */ }
      finally { loading = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("purchases:refresh", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("purchases:refresh", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [isSignedIn, user?.id, authFetch]);
  return null;
}

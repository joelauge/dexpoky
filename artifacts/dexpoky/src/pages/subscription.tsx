import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Crown,
  Zap,
  Check,
  Loader2,
  ExternalLink,
  ScanLine,
  Store,
  FileText,
  Gift,
} from "lucide-react";
import { useBillingStatus, usePlans, useCheckout, useBillingPortal } from "@/hooks/useBilling";
import { useUser } from "@clerk/react";
import { toast } from "sonner";
import { useState } from "react";

const TIER_LABEL: Record<string, string> = {
  free: "Free",
  collector: "Collector",
  pro: "Pro",
};

export default function SubscriptionPage() {
  const { user } = useUser();
  const { data: billing, isLoading: billingLoading } = useBillingStatus();
  const { data: plansData, isLoading: plansLoading } = usePlans();
  const checkout = useCheckout();
  const portal = useBillingPortal();
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  const plans = (plansData?.plans ?? []).sort(
    (a, b) => (a.prices[0]?.unit_amount ?? 0) - (b.prices[0]?.unit_amount ?? 0),
  );

  const handleCheckout = async (priceId: string) => {
    setCheckingOut(priceId);
    try {
      const { url } = await checkout.mutateAsync({
        priceId,
        email: user?.primaryEmailAddress?.emailAddress,
      });
      window.location.href = url;
    } catch {
      toast.error("Couldn't start checkout — please try again.");
      setCheckingOut(null);
    }
  };

  const handlePortal = async () => {
    try {
      const { url } = await portal.mutateAsync();
      window.location.href = url;
    } catch {
      toast.error("Couldn't open billing portal.");
    }
  };

  const isActive = billing?.subscriptionStatus === "active" || billing?.subscriptionStatus === "trialing";

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8 pb-20">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-primary mb-1">
            <Crown className="h-6 w-6" />
            <h1 className="text-2xl font-extrabold tracking-tight">Subscription</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage your DexPoky plan and scan allowance.
          </p>
        </div>

        {/* Current status */}
        {billingLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : billing ? (
          <div className="space-y-6">
            {/* Status card */}
            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Current Plan</p>
                  <div className="flex items-center gap-2">
                    {billing.planTier === "pro" ? (
                      <Crown className="h-5 w-5 text-amber-500" />
                    ) : billing.planTier === "collector" ? (
                      <Zap className="h-5 w-5 text-primary" />
                    ) : (
                      <Gift className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="text-xl font-extrabold">{TIER_LABEL[billing.planTier]}</span>
                    {isActive && (
                      <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Active</Badge>
                    )}
                  </div>
                </div>
                {isActive && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={handlePortal}
                    disabled={portal.isPending}
                  >
                    {portal.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Manage
                      </>
                    )}
                  </Button>
                )}
              </div>

              {/* Scan usage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <ScanLine className="h-3.5 w-3.5" />
                    {billing.planTier === "free" ? "Free trial scans" : "Scans this month"}
                  </span>
                  <span className="font-semibold">
                    {billing.planTier === "pro"
                      ? "Unlimited"
                      : billing.planTier === "collector"
                        ? `${billing.monthlyScansUsed} / ${billing.monthlyScansLimit}`
                        : `${billing.freeTrialScansUsed} / ${billing.freeTrialScansLimit}`}
                  </span>
                </div>
                {billing.planTier !== "pro" && (
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{
                        width: billing.planTier === "collector"
                          ? `${Math.min(100, (billing.monthlyScansUsed / (billing.monthlyScansLimit ?? 1)) * 100)}%`
                          : `${Math.min(100, (billing.freeTrialScansUsed / billing.freeTrialScansLimit) * 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-2 pt-1">
                {billing.canUseSellSheets && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                    <FileText className="h-3 w-3" />Sell Sheets
                  </div>
                )}
                {billing.canCreateUnlimitedListings && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                    <Store className="h-3 w-3" />Unlimited Listings
                  </div>
                )}
              </div>
            </div>

            {/* Plans */}
            {!isActive && (
              <>
                <h2 className="font-bold text-base">Choose a plan</h2>
                {plansLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {plans.map((plan, i) => {
                      const price = plan.prices[0];
                      if (!price) return null;
                      const dollars = (price.unit_amount / 100).toFixed(0);
                      const tier = plan.metadata?.plan_tier;
                      const scanLimit = plan.metadata?.scan_limit;
                      const hasSellSheets = plan.metadata?.sell_sheets === "true";
                      const isRecommended = i === 0;

                      const features = [
                        scanLimit === "unlimited"
                          ? "Unlimited card scans"
                          : `${scanLimit} card scans per month`,
                        "Unlimited marketplace listings",
                        ...(hasSellSheets ? ["Shareable sell sheets for cards & collections"] : []),
                      ];

                      return (
                        <div
                          key={plan.id}
                          className={`rounded-2xl border-2 p-5 relative ${isRecommended ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                        >
                          {isRecommended && (
                            <Badge className="absolute -top-3 left-5 bg-primary text-primary-foreground text-[11px] px-3">
                              Most Popular
                            </Badge>
                          )}
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                {tier === "pro" ? (
                                  <Crown className="h-5 w-5 text-amber-500" />
                                ) : (
                                  <Zap className="h-5 w-5 text-primary" />
                                )}
                                <h3 className="font-bold">{plan.name.replace("DexPoky ", "")}</h3>
                              </div>
                              <p className="text-xs text-muted-foreground">{plan.description}</p>
                            </div>
                            <div className="text-right ml-4 shrink-0">
                              <span className="text-3xl font-extrabold">${dollars}</span>
                              <span className="text-xs text-muted-foreground">/mo</span>
                            </div>
                          </div>
                          <ul className="space-y-2 mb-5">
                            {features.map((f) => (
                              <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                                {f}
                              </li>
                            ))}
                          </ul>
                          <Button
                            className="w-full rounded-xl"
                            variant={isRecommended ? "default" : "outline"}
                            disabled={!!checkingOut}
                            onClick={() => handleCheckout(price.id)}
                          >
                            {checkingOut === price.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              `Subscribe — $${dollars}/mo`
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Upgrade from collector to pro */}
            {billing.planTier === "collector" && isActive && (
              <>
                <h2 className="font-bold text-base">Upgrade to Pro</h2>
                {plans
                  .filter((p) => p.metadata?.plan_tier === "pro")
                  .map((plan) => {
                    const price = plan.prices[0];
                    if (!price) return null;
                    const dollars = (price.unit_amount / 100).toFixed(0);
                    return (
                      <div key={plan.id} className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
                        <div className="flex items-center gap-2 mb-2">
                          <Crown className="h-5 w-5 text-amber-500" />
                          <span className="font-bold">Pro — ${dollars}/mo</span>
                        </div>
                        <ul className="space-y-1.5 mb-4">
                          {["Unlimited scans", "Unlimited listings", "Sell sheets"].map((f) => (
                            <li key={f} className="flex items-center gap-2 text-sm text-amber-800">
                              <Check className="h-4 w-4 text-amber-600 shrink-0" /> {f}
                            </li>
                          ))}
                        </ul>
                        <Button
                          className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
                          disabled={!!checkingOut}
                          onClick={() => handleCheckout(price.id)}
                        >
                          {checkingOut === price.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upgrade to Pro"}
                        </Button>
                      </div>
                    );
                  })}
              </>
            )}
          </div>
        ) : null}
      </div>
    </Layout>
  );
}

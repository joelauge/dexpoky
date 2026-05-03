import { useState } from "react";
import { useUser } from "@clerk/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ScanLine,
  Sparkles,
  Zap,
  Check,
  Loader2,
  ExternalLink,
  Crown,
  Gift,
} from "lucide-react";
import { usePlans, useCheckout, useBillingStatus, useBillingPortal } from "@/hooks/useBilling";
import { toast } from "sonner";

interface ScanPaywallProps {
  open: boolean;
  onClose: () => void;
  reason: "trial_not_activated" | "trial_exhausted" | "monthly_limit_reached" | null;
}

function PlanCard({
  plan,
  recommended,
  onSelect,
  loading,
}: {
  plan: { id: string; name: string; description: string; metadata: Record<string, string>; prices: { id: string; unit_amount: number; currency: string }[] };
  recommended?: boolean;
  onSelect: (priceId: string) => void;
  loading: boolean;
}) {
  const price = plan.prices[0];
  if (!price) return null;
  const dollars = (price.unit_amount / 100).toFixed(0);
  const tier = plan.metadata?.plan_tier;
  const scanLimit = plan.metadata?.scan_limit;
  const hasSellSheets = plan.metadata?.sell_sheets === "true";

  const features = [
    scanLimit === "unlimited"
      ? "Unlimited card scans"
      : `${scanLimit} card scans / month`,
    "Unlimited marketplace listings",
    ...(hasSellSheets ? ["Shareable sell sheets"] : []),
  ];

  return (
    <div className={`relative rounded-2xl border-2 p-4 transition-all ${recommended ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
      {recommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground px-3 py-0.5 text-[11px] font-bold shadow-sm">
            Most Popular
          </Badge>
        </div>
      )}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            {tier === "pro" ? (
              <Crown className="h-4 w-4 text-amber-500" />
            ) : (
              <Zap className="h-4 w-4 text-primary" />
            )}
            <h3 className="font-bold text-sm">{plan.name.replace("DexPoky ", "")}</h3>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight">{plan.description}</p>
        </div>
        <div className="text-right shrink-0 ml-3">
          <span className="text-2xl font-extrabold">${dollars}</span>
          <span className="text-xs text-muted-foreground">/mo</span>
        </div>
      </div>
      <ul className="space-y-1.5 mb-4">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <Button
        className="w-full rounded-xl"
        variant={recommended ? "default" : "outline"}
        size="sm"
        disabled={loading}
        onClick={() => onSelect(price.id)}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Start ${plan.name.replace("DexPoky ", "")} — $${dollars}/mo`}
      </Button>
    </div>
  );
}

export function ScanPaywall({ open, onClose, reason }: ScanPaywallProps) {
  const { user } = useUser();
  const { data: plansData, isLoading: plansLoading } = usePlans();
  const { data: billing } = useBillingStatus();
  const checkout = useCheckout();
  const portal = useBillingPortal();
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  const plans = plansData?.plans ?? [];

  const handleSelect = async (priceId: string) => {
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

  const isTrialNotActivated = reason === "trial_not_activated";
  const isTrialExhausted = reason === "trial_exhausted";
  const isMonthlyLimit = reason === "monthly_limit_reached";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm mx-auto rounded-2xl">
        <DialogHeader className="text-center pb-2">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            {isTrialNotActivated ? (
              <Gift className="h-7 w-7 text-primary" />
            ) : (
              <ScanLine className="h-7 w-7 text-primary" />
            )}
          </div>
          <DialogTitle className="text-xl font-extrabold">
            {isTrialNotActivated && "Claim your 10 free scans"}
            {isTrialExhausted && "Free scans used up"}
            {isMonthlyLimit && "Monthly scan limit reached"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {isTrialNotActivated &&
              "You have 10 free scans to get started — no payment method required."}
            {isTrialExhausted &&
              "You've used all 10 free scans. Upgrade for more."}
            {isMonthlyLimit &&
              `You've used all ${billing?.monthlyScansLimit} scans this month. Upgrade to Pro for unlimited scans, or manage your plan.`}
          </DialogDescription>
        </DialogHeader>

        {/* Free trial badge */}
        {isTrialNotActivated && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-sm text-emerald-800 font-medium">
            <Sparkles className="h-4 w-4 text-emerald-500 shrink-0" />
            10 scans free — no charge until you choose a plan
          </div>
        )}

        {/* Plan cards */}
        {plansLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3 mt-1">
            {plans
              .sort((a, b) => (a.prices[0]?.unit_amount ?? 0) - (b.prices[0]?.unit_amount ?? 0))
              .map((plan, i) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  recommended={i === 0}
                  onSelect={handleSelect}
                  loading={checkingOut === plan.prices[0]?.id}
                />
              ))}
          </div>
        )}

        {/* Manage plan link for monthly limit */}
        {isMonthlyLimit && billing?.subscriptionStatus && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={handlePortal}
            disabled={portal.isPending}
          >
            {portal.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            Manage billing
          </Button>
        )}

        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={onClose}>
          Maybe later
        </Button>
      </DialogContent>
    </Dialog>
  );
}

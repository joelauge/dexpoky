import { stripeStorage } from "./stripeStorage.js";
import { getUncachableStripeClient } from "./stripeClient.js";
import { logger } from "./lib/logger.js";

export const FREE_TRIAL_SCAN_LIMIT = 10;
export const COLLECTOR_SCAN_LIMIT = 250;

export type PlanTier = "free" | "collector" | "pro";

export interface BillingStatus {
  planTier: PlanTier;
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

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export class StripeService {
  async getOrCreateCustomer(clerkId: string, email: string): Promise<string> {
    const user = await stripeStorage.getUserByClerkId(clerkId);
    if (user?.stripeCustomerId) return user.stripeCustomerId;

    const stripe = await getUncachableStripeClient();
    const customer = await stripe.customers.create({
      email,
      metadata: { clerkId },
    });

    await stripeStorage.updateUserStripeInfo(clerkId, {
      stripeCustomerId: customer.id,
    });

    return customer.id;
  }

  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
  ) {
    const stripe = await getUncachableStripeClient();
    return stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  async createPortalSession(customerId: string, returnUrl: string) {
    const stripe = await getUncachableStripeClient();
    return stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  async getBillingStatus(clerkId: string): Promise<BillingStatus> {
    const user = await stripeStorage.getUserByClerkId(clerkId);
    if (!user) {
      return {
        planTier: "free",
        subscriptionStatus: null,
        monthlyScansUsed: 0,
        monthlyScansLimit: null,
        freeTrialActivated: false,
        freeTrialScansUsed: 0,
        freeTrialScansLimit: FREE_TRIAL_SCAN_LIMIT,
        canScan: false,
        canCreateUnlimitedListings: false,
        canUseSellSheets: false,
      };
    }

    let planTier: PlanTier = "free";
    let subscriptionStatus: string | null = null;

    if (user.stripeSubscriptionId) {
      try {
        const sub = await stripeStorage.getSubscription(
          user.stripeSubscriptionId,
        );
        if (sub) {
          subscriptionStatus = sub.status as string;
          if (sub.status === "active" || sub.status === "trialing") {
            const subAny = sub as any;
            let tier: string | undefined;
            try {
              const items =
                typeof subAny.items === "string"
                  ? JSON.parse(subAny.items)
                  : subAny.items;
              const priceId = items?.data?.[0]?.price?.id;
              if (priceId) {
                const result = await (
                  await getUncachableStripeClient()
                ).prices.retrieve(priceId, { expand: ["product"] });
                const product = result.product as any;
                tier = product?.metadata?.plan_tier;
              }
            } catch (e) {
              logger.warn({ err: e }, "Failed to resolve plan tier from subscription");
            }
            if (tier === "pro") planTier = "pro";
            else planTier = "collector";
          }
        }
      } catch (e) {
        logger.warn({ err: e }, "Failed to fetch subscription");
      }
    }

    const period = currentPeriod();
    const monthlyScansUsed =
      planTier !== "free"
        ? await stripeStorage.getMonthlyScans(clerkId, period)
        : 0;

    const monthlyScansLimit =
      planTier === "pro"
        ? null
        : planTier === "collector"
          ? COLLECTOR_SCAN_LIMIT
          : null;

    let canScan = false;
    let freeTrialActivated = user.freeTrialActivated;
    if (planTier === "pro") {
      canScan = true;
    } else if (planTier === "collector") {
      canScan = monthlyScansUsed < COLLECTOR_SCAN_LIMIT;
    } else {
      // Free trial is auto-activated for all free users — no payment method required.
      if (!freeTrialActivated) {
        await stripeStorage.activateFreeTrial(clerkId);
        freeTrialActivated = true;
      }
      canScan = user.freeTrialScansUsed < FREE_TRIAL_SCAN_LIMIT;
    }

    return {
      planTier,
      subscriptionStatus,
      monthlyScansUsed,
      monthlyScansLimit,
      freeTrialActivated,
      freeTrialScansUsed: user.freeTrialScansUsed,
      freeTrialScansLimit: FREE_TRIAL_SCAN_LIMIT,
      canScan,
      canCreateUnlimitedListings: planTier !== "free",
      canUseSellSheets: planTier === "pro",
    };
  }

  async recordScan(clerkId: string): Promise<{ allowed: boolean; reason?: string }> {
    const status = await this.getBillingStatus(clerkId);

    if (status.planTier === "pro") {
      await stripeStorage.incrementMonthlyScans(clerkId, currentPeriod());
      return { allowed: true };
    }

    if (status.planTier === "collector") {
      if (status.monthlyScansUsed >= COLLECTOR_SCAN_LIMIT) {
        return { allowed: false, reason: "monthly_limit_reached" };
      }
      await stripeStorage.incrementMonthlyScans(clerkId, currentPeriod());
      return { allowed: true };
    }

    // Auto-activate the free trial on first scan attempt — no payment method required.
    if (!status.freeTrialActivated) {
      await stripeStorage.activateFreeTrial(clerkId);
    }

    if (status.freeTrialScansUsed >= FREE_TRIAL_SCAN_LIMIT) {
      return { allowed: false, reason: "trial_exhausted" };
    }

    await stripeStorage.incrementFreeTrialScans(clerkId);
    return { allowed: true };
  }

  async activateTrial(clerkId: string) {
    return stripeStorage.activateFreeTrial(clerkId);
  }
}

export const stripeService = new StripeService();

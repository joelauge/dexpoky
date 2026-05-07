import { get, post } from "../fetch";

export interface BillingStatus {
  isActive: boolean;
  plan: string | null;
  trialActive: boolean;
  trialEndsAt: string | null;
  scansUsed: number;
  scanLimit: number;
}

export interface BillingPlan {
  id: string;
  name: string;
  priceMonthly: number;
  scanLimit: number;
  features: string[];
}

export interface CheckoutBody {
  planId: string;
  successUrl?: string;
  cancelUrl?: string;
}

export const billing = {
  getStatus: (): Promise<BillingStatus> =>
    get("/api/billing/status"),

  getPlans: (): Promise<BillingPlan[]> =>
    get("/api/billing/plans"),

  createCheckout: (body: CheckoutBody): Promise<{ url: string }> =>
    post("/api/billing/checkout", body),

  createPortal: (): Promise<{ url: string }> =>
    post("/api/billing/portal"),

  recordScan: (): Promise<void> =>
    post("/api/billing/scan/record"),

  activateTrial: (): Promise<void> =>
    post("/api/billing/trial/activate"),
};

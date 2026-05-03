import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { stripeService } from "../stripeService.js";
import { stripeStorage } from "../stripeStorage.js";
import type { Request, Response } from "express";

const router = Router();

// GET /api/billing/status — current user's plan tier + scan counts
router.get("/billing/status", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const status = await stripeService.getBillingStatus(clerkId);
  res.json(status);
});

// GET /api/billing/plans — list available plans with prices
router.get("/billing/plans", async (_req, res: Response) => {
  const plans = await stripeStorage.getProductsWithPrices();
  res.json({ plans });
});

// POST /api/billing/checkout — create Stripe checkout session
router.post("/billing/checkout", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const { priceId, email } = req.body as { priceId: string; email?: string };

  if (!priceId) {
    res.status(400).json({ error: "priceId is required" });
    return;
  }

  const customerId = await stripeService.getOrCreateCustomer(
    clerkId,
    email ?? `${clerkId}@dexpoky.user`,
  );

  const origin = `${req.protocol}://${req.get("host")}`;
  const session = await stripeService.createCheckoutSession(
    customerId,
    priceId,
    `${origin}/marketplace?subscribed=1`,
    `${origin}/marketplace`,
  );

  res.json({ url: session.url });
});

// POST /api/billing/portal — customer billing portal
router.post("/billing/portal", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const user = await stripeStorage.getUserByClerkId(clerkId);

  if (!user?.stripeCustomerId) {
    res.status(400).json({ error: "No billing account found" });
    return;
  }

  const origin = `${req.protocol}://${req.get("host")}`;
  const portalSession = await stripeService.createPortalSession(
    user.stripeCustomerId,
    `${origin}/marketplace`,
  );

  res.json({ url: portalSession.url });
});

// POST /api/billing/scan/record — record a scan attempt, returns whether allowed
router.post("/billing/scan/record", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const result = await stripeService.recordScan(clerkId);
  res.json(result);
});

// POST /api/billing/trial/activate — mark trial as activated (after card collection)
router.post("/billing/trial/activate", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  await stripeService.activateTrial(clerkId);
  res.json({ success: true });
});

export default router;

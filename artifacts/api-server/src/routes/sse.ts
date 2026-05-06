import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { registerSseClient } from "../lib/paymentEvents.js";
import type { Request, Response } from "express";

const router = Router();

router.get("/sse/payments", requireAuth, (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(": connected\n\n");

  const unregister = registerSseClient(clerkId, res);

  const keepAlive = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(keepAlive);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unregister();
  });
});

export default router;

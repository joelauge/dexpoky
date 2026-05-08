import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sendSupportEmail } from "../lib/outreach-email.js";

const router = Router();

const supportSchema = z.object({
  fromName: z.string().min(1).max(120),
  fromEmail: z.string().email(),
  category: z.string().min(1).max(80),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
});

router.post("/support/contact", async (req: Request, res: Response) => {
  const parsed = supportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  try {
    await sendSupportEmail(parsed.data);
    res.json({ ok: true });
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to send support email");
    const msg = err instanceof Error ? err.message : "Failed to send message";
    res.status(500).json({ error: msg });
  }
});

export default router;

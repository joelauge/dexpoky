import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { ensureUserSynced } from "../lib/userSync.js";

export interface AuthRequest extends Request {
  userId: string;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req as never);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as AuthRequest).userId = userId;
  await ensureUserSynced(userId);
  next();
}

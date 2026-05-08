import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, cardsTable, cardGradingCertsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { z } from "zod";
import type { Request, Response } from "express";

const router = Router();

// ── PSA public cert lookup ────────────────────────────────────────────────────

interface PSACertData {
  CertNumber: string;
  Year: string;
  Brand: string;
  Series: string;
  CardNumber: string;
  Subject: string;
  Variety: string;
  Grade: string;
  GradeDescription: string;
  PopHigher?: number;
  PopSame?: number;
}

async function lookupPSACert(certNumber: string): Promise<{ ok: true; data: PSACertData } | { ok: false; error: string }> {
  try {
    const url = `https://api.psacard.com/publicapi/cert/GetByCertNumber/${encodeURIComponent(certNumber)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, error: `PSA returned HTTP ${res.status}` };
    const json = await res.json() as { PSACert?: PSACertData };
    if (!json?.PSACert) return { ok: false, error: "Cert not found in PSA registry" };
    return { ok: true, data: json.PSACert };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `PSA lookup failed: ${msg.slice(0, 120)}` };
  }
}

// BGS and CGC do not have clean public APIs — submit as pending for manual review
// An admin can approve via PATCH /api/grading/:id/review

// ── Submit cert ───────────────────────────────────────────────────────────────

const submitSchema = z.object({
  cardId: z.coerce.number().int().positive(),
  gradingCompany: z.enum(["psa", "bgs", "cgc"]),
  certNumber: z.string().min(1).max(50).trim(),
});

router.post("/grading/submit", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }
  const { cardId, gradingCompany, certNumber } = parsed.data;

  // verify card ownership
  const [card] = await db
    .select()
    .from(cardsTable)
    .where(and(eq(cardsTable.id, cardId), eq(cardsTable.ownerClerkId, clerkId)));
  if (!card) {
    res.status(404).json({ error: "Card not found in your inventory" });
    return;
  }

  // check for existing cert on this card
  const [existing] = await db
    .select()
    .from(cardGradingCertsTable)
    .where(eq(cardGradingCertsTable.cardId, cardId));
  if (existing) {
    res.status(409).json({ error: "This card already has a grading cert submitted", cert: existing });
    return;
  }

  // check the cert number isn't already registered to another card
  const [dupCert] = await db
    .select()
    .from(cardGradingCertsTable)
    .where(and(
      eq(cardGradingCertsTable.gradingCompany, gradingCompany),
      eq(cardGradingCertsTable.certNumber, certNumber),
    ));
  if (dupCert) {
    res.status(409).json({ error: "This cert number is already registered to another card" });
    return;
  }

  if (gradingCompany === "psa") {
    // auto-verify via PSA public API
    const result = await lookupPSACert(certNumber);

    if (!result.ok) {
      // store as rejected so user knows the cert is invalid
      const [cert] = await db
        .insert(cardGradingCertsTable)
        .values({
          cardId,
          ownerClerkId: clerkId,
          gradingCompany,
          certNumber,
          status: "rejected",
          rejectionReason: result.error,
        })
        .returning();
      res.status(422).json({ error: result.error, cert });
      return;
    }

    const d = result.data;
    const [cert] = await db
      .insert(cardGradingCertsTable)
      .values({
        cardId,
        ownerClerkId: clerkId,
        gradingCompany,
        certNumber,
        grade: d.Grade,
        gradeDescription: d.GradeDescription,
        gradedSubject: d.Subject,
        gradedYear: d.Year,
        gradedSet: d.Series,
        gradedCardNumber: d.CardNumber,
        populationSame: d.PopSame ?? null,
        populationHigher: d.PopHigher ?? null,
        certData: d as unknown as Record<string, unknown>,
        status: "verified",
        verifiedAt: new Date(),
      })
      .returning();

    res.status(201).json({ cert, verified: true });
    return;
  }

  // BGS / CGC — store as pending for admin review
  const [cert] = await db
    .insert(cardGradingCertsTable)
    .values({
      cardId,
      ownerClerkId: clerkId,
      gradingCompany,
      certNumber,
      status: "pending",
    })
    .returning();

  res.status(201).json({
    cert,
    verified: false,
    message: `${gradingCompany.toUpperCase()} certs are reviewed manually. You'll be notified once approved (typically within 24 hours).`,
  });
});

// ── Get cert for a card ───────────────────────────────────────────────────────

router.get("/grading/card/:cardId", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const cardId = Number(req.params.cardId);
  if (!cardId) { res.status(400).json({ error: "Invalid card id" }); return; }

  const [cert] = await db
    .select()
    .from(cardGradingCertsTable)
    .where(and(
      eq(cardGradingCertsTable.cardId, cardId),
      eq(cardGradingCertsTable.ownerClerkId, clerkId),
    ));

  if (!cert) { res.status(404).json({ error: "No grading cert for this card" }); return; }
  res.json(cert);
});

// ── List all verified certs for the current user ──────────────────────────────

router.get("/grading/verified", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const certs = await db
    .select({
      cert: cardGradingCertsTable,
      card: {
        id: cardsTable.id,
        name: cardsTable.name,
        imageUrl: cardsTable.imageUrl,
        setName: cardsTable.setName,
        estimatedValue: cardsTable.estimatedValue,
      },
    })
    .from(cardGradingCertsTable)
    .innerJoin(cardsTable, eq(cardGradingCertsTable.cardId, cardsTable.id))
    .where(and(
      eq(cardGradingCertsTable.ownerClerkId, clerkId),
      eq(cardGradingCertsTable.status, "verified"),
    ))
    .orderBy(desc(cardGradingCertsTable.verifiedAt));
  res.json(certs);
});

// ── Delete / retract a cert submission ───────────────────────────────────────

router.delete("/grading/:id", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid cert id" }); return; }

  const [cert] = await db
    .select()
    .from(cardGradingCertsTable)
    .where(and(eq(cardGradingCertsTable.id, id), eq(cardGradingCertsTable.ownerClerkId, clerkId)));

  if (!cert) { res.status(404).json({ error: "Cert not found" }); return; }
  if (cert.status === "verified") {
    res.status(403).json({ error: "Cannot retract a verified cert — contact support" });
    return;
  }

  await db.delete(cardGradingCertsTable).where(eq(cardGradingCertsTable.id, id));
  res.status(204).end();
});

// ── Admin: approve / reject pending BGS/CGC certs ────────────────────────────

router.patch("/grading/:id/review", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;

  // simple admin guard — check if user is in the admin list
  const [user] = await db
    .select({ role: cardsTable.ownerClerkId })
    .from(cardsTable)
    .limit(0); // just a dummy way to get the db connection; real admin check below

  // Check if user has admin role via users table
  const { usersTable } = await import("@workspace/db");
  const [adminUser] = await db
    .select({ isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId));

  if (!adminUser?.isAdmin) {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const id = Number(req.params.id);
  const reviewSchema = z.object({
    action: z.enum(["approve", "reject"]),
    grade: z.string().optional(),
    gradeDescription: z.string().optional(),
    gradedSubject: z.string().optional(),
    rejectionReason: z.string().optional(),
  });
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const updates: Record<string, unknown> = {};
  if (parsed.data.action === "approve") {
    updates.status = "verified";
    updates.verifiedAt = new Date();
    if (parsed.data.grade) updates.grade = parsed.data.grade;
    if (parsed.data.gradeDescription) updates.gradeDescription = parsed.data.gradeDescription;
    if (parsed.data.gradedSubject) updates.gradedSubject = parsed.data.gradedSubject;
  } else {
    updates.status = "rejected";
    updates.rejectionReason = parsed.data.rejectionReason ?? "Did not pass review";
  }

  const [updated] = await db
    .update(cardGradingCertsTable)
    .set(updates)
    .where(eq(cardGradingCertsTable.id, id))
    .returning();

  res.json(updated);
});

export default router;

import { z } from "zod";

export const gradingCompanyValues = ["psa", "bgs", "cgc", "tag"] as const;

export function isGradedSlabListingTitle(title: string): boolean {
  return /\b(psa|bgs|cgc|tag|sgc|ace)\s*\d/i.test(title);
}

export const submitGradingCertSchema = z.object({
  cardId: z.coerce.number().int().positive(),
  gradingCompany: z.enum(gradingCompanyValues),
  certNumber: z.string().min(1).max(50).trim(),
}).superRefine((cert, context) => {
  if (cert.gradingCompany === "tag" && !/^\d{8}$/.test(cert.certNumber)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["certNumber"],
      message: "TAG cert numbers must be exactly 8 digits",
    });
  }
});
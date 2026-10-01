import { describe, expect, it } from "vitest";
import { gradingCompanyValues, submitGradingCertSchema } from "./grading.js";

describe("grading certificate input", () => {
  it("keeps all existing grading companies and adds TAG", () => {
    expect(gradingCompanyValues).toEqual(["psa", "bgs", "cgc", "tag"]);
  });

  it("accepts valid TAG certificates after trimming surrounding whitespace", () => {
    expect(submitGradingCertSchema.safeParse({
      cardId: "12",
      gradingCompany: "tag",
      certNumber: " 12345678 ",
    }).success).toBe(true);
  });

  it.each(["1234567", "123456789", "1234abcd", ""])(
    "rejects invalid TAG cert number %j",
    (certNumber) => {
      expect(submitGradingCertSchema.safeParse({
        cardId: 12,
        gradingCompany: "tag",
        certNumber,
      }).success).toBe(false);
    },
  );

  it("preserves existing non-TAG certificate number validation", () => {
    for (const gradingCompany of ["psa", "bgs", "cgc"]) {
      expect(submitGradingCertSchema.safeParse({
        cardId: 12,
        gradingCompany,
        certNumber: "any-existing-cert-format",
      }).success).toBe(true);
    }
  });

  it("rejects unknown grading companies", () => {
    expect(submitGradingCertSchema.safeParse({
      cardId: 12,
      gradingCompany: "unknown",
      certNumber: "12345678",
    }).success).toBe(false);
  });
});
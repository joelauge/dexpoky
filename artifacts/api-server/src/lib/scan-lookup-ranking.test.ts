import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PricingData } from "../routes/detect-helpers.js";
import {
  evaluateSelection,
  type ScanPrintingCandidate,
  type ScanPrintingEvaluation,
} from "./scan-printing-selection.js";
import { resolveRankedScan } from "./scan-lookup-ranking.js";

const card = (id: string, overrides: Partial<ScanPrintingCandidate> = {}): ScanPrintingCandidate => ({
  id,
  name: "Pikachu",
  setId: `set-${id}`,
  cardNumber: "1",
  ...overrides,
});

const pricing = (
  marketPrice: number | null,
  source: PricingData["source"] = "tcgplayer",
): PricingData => ({
  marketPrice,
  lowPrice: marketPrice === null ? null : marketPrice - 1,
  trendPrice: marketPrice === null ? null : marketPrice + 1,
  source: marketPrice === null ? null : source,
  psaEstimates: marketPrice === null ? null : { 10: marketPrice * 5 },
});

function choiceResponse(
  choice: string,
  confidence: number,
  probabilities: Record<string, number>,
): Response {
  return new Response(JSON.stringify({
    answers: { printing: { type: "choice", choice, confidence, probabilities } },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function fetcherFor(response: Response): typeof fetch {
  return vi.fn(async () => response) as unknown as typeof fetch;
}

async function evaluate(
  candidates: ScanPrintingCandidate[],
  choice: string,
  confidence: number,
  probabilities: Record<string, number>,
) {
  return evaluateSelection(
    candidates,
    { name: "Pikachu" },
    fetcherFor(choiceResponse(choice, confidence, probabilities)),
  );
}

const emptyPricing = {
  marketPrice: null,
  lowPrice: null,
  trendPrice: null,
  source: null,
  psaEstimates: null,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
});

describe("ranked scan lookup previews", () => {
  it("uses a likely ranking for the preview, loads that identity's price, and hides internal ranked IDs", async () => {
    const variants = [card("likely-alternative"), card("likely-preview")];
    const base = {
      card: card("cached-card"),
      variants,
      pricing: pricing(99),
    };
    const baseSnapshot = structuredClone(base);
    const evaluation = await evaluate(variants, "printing_1", 0.93, {
      printing_0: 0.20,
      printing_1: 0.75,
      no_match: 0.05,
    });
    const previewPricing = pricing(12);
    const loadPricing = vi.fn(async (_selected: ScanPrintingCandidate) => previewPricing);

    const result = await resolveRankedScan(base, evaluation, loadPricing);

    expect(result.card?.id).toBe("likely-preview");
    expect(result.variants.map(({ id }) => id)).toEqual(["likely-preview", "likely-alternative"]);
    expect(loadPricing).toHaveBeenCalledExactlyOnceWith(variants[1]);
    expect(result.pricing).toBe(previewPricing);
    expect(result.selection).toMatchObject({
      status: "likely",
      recommendedId: "likely-preview",
      confidence: 0.93,
    });
    expect("rankedIds" in result.selection).toBe(false);
    expect(JSON.stringify(result)).not.toContain("rankedIds");
    expect(base).toEqual(baseSnapshot);
    expect(result.variants).not.toBe(base.variants);
  });

  it("previews and prices a weak review alternative without claiming a recommendation", async () => {
    const variants = [card("weak-preview"), card("weak-second"), card("weak-third")];
    const base = { card: card("cached-weak"), variants, pricing: pricing(80) };
    const evaluation = await evaluate(variants, "printing_0", 0.69, {
      printing_0: 0.45,
      printing_1: 0.35,
      printing_2: 0.15,
      no_match: 0.05,
    });
    const ownPricing = pricing(21);
    const loadPricing = vi.fn(async () => ownPricing);

    const result = await resolveRankedScan(base, evaluation, loadPricing);

    expect(result.selection).toMatchObject({ status: "review", recommendedId: null, confidence: 0.69 });
    expect(result.card?.id).toBe("weak-preview");
    expect(loadPricing).toHaveBeenCalledExactlyOnceWith(variants[0]);
    expect(result.pricing).toBe(ownPricing);
  });

  it("uses the best-ranked alternative and its own price for a no_match review", async () => {
    const variants = [card("no-match-preview"), card("no-match-second")];
    const base = { card: card("cached-no-match"), variants, pricing: pricing(70) };
    const evaluation = await evaluate(variants, "no_match", 0.9, {
      printing_0: 0.35,
      printing_1: 0.30,
      no_match: 0.35,
    });
    const ownPricing = pricing(18);
    const loadPricing = vi.fn(async () => ownPricing);

    const result = await resolveRankedScan(base, evaluation, loadPricing);

    expect(result.selection).toMatchObject({ status: "review", recommendedId: null, confidence: 0.9 });
    expect(result.card?.id).toBe("no-match-preview");
    expect(loadPricing).toHaveBeenCalledExactlyOnceWith(variants[0]);
    expect(result.pricing).toBe(ownPricing);
  });

  it("does not reload pricing when an unavailable evaluation keeps the existing preview identity", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const variants = [card("existing-preview"), card("fallback-second")];
    const existingCard = variants[0]!;
    const basePricing = pricing(44);
    const evaluation = await evaluateSelection(variants, { name: "Pikachu" }, vi.fn() as typeof fetch);
    const loadPricing = vi.fn(async () => pricing(1));

    const result = await resolveRankedScan(
      { card: existingCard, variants, pricing: basePricing },
      evaluation,
      loadPricing,
    );

    expect(result.selection.status).toBe("unavailable");
    expect(result.card).toBe(existingCard);
    expect(result.pricing).toBe(basePricing);
    expect(loadPricing).not.toHaveBeenCalled();
  });

  it("returns empty pricing instead of the cached card price when preview pricing fails", async () => {
    const variants = [card("failed-price-preview"), card("failed-price-second")];
    const base = { card: card("cached-failed-price"), variants, pricing: pricing(99) };
    const evaluation = await evaluate(variants, "printing_0", 0.92, {
      printing_0: 0.85,
      printing_1: 0.10,
      no_match: 0.05,
    });
    const loadPricing = vi.fn(async () => {
      throw new Error("pricing service unavailable");
    });

    const result = await resolveRankedScan(base, evaluation, loadPricing);

    expect(result.card?.id).toBe("failed-price-preview");
    expect(loadPricing).toHaveBeenCalledExactlyOnceWith(variants[0]);
    expect(result.pricing).toEqual(emptyPricing);
  });

  it("returns a null card and empty pricing when there are no variants", async () => {
    const base = { card: card("stale-card"), variants: [] as ScanPrintingCandidate[], pricing: pricing(33) };
    const evaluation: ScanPrintingEvaluation = {
      status: "unavailable",
      recommendedId: null,
      confidence: null,
      message: "Unavailable.",
    };
    const loadPricing = vi.fn(async () => pricing(1));

    const result = await resolveRankedScan(base, evaluation, loadPricing);

    expect(result.card).toBeNull();
    expect(result.variants).toEqual([]);
    expect(result.pricing).toEqual(emptyPricing);
    expect(loadPricing).not.toHaveBeenCalled();
  });
});
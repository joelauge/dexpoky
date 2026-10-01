import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateSelection,
  orderScanPrintings,
  selectScanPrinting,
  type ScanPrintingCandidate,
  type ScanPrintingEvaluation,
  type ScanPrintingEvidence,
} from "./scan-printing-selection.js";

const candidate = (id: string, overrides: Partial<ScanPrintingCandidate> = {}): ScanPrintingCandidate => ({
  id,
  name: "Pikachu",
  setId: "base1",
  cardNumber: "58",
  ...overrides,
});

const evidence = (overrides: Partial<ScanPrintingEvidence> = {}): ScanPrintingEvidence => ({
  name: "Pikachu",
  ...overrides,
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

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
});

describe("scan printing candidate ranking", () => {
  it("ranks the complete Choice distribution and keeps every alternative after a strong selection", async () => {
    const candidates = [candidate("first"), candidate("chosen"), candidate("third"), candidate("fourth")];
    const result = await evaluateSelection(
      candidates,
      evidence(),
      fetcherFor(choiceResponse("printing_1", 0.92, {
        printing_0: 0.15,
        printing_1: 0.70,
        printing_2: 0.10,
        printing_3: 0.02,
        no_match: 0.03,
      })),
    );

    expect(result).toMatchObject({ status: "likely", recommendedId: "chosen", confidence: 0.92 });
    expect(result.rankedIds).toEqual(["chosen", "first", "third", "fourth"]);
    expect(orderScanPrintings(candidates, result).map(({ id }) => id))
      .toEqual(["chosen", "first", "third", "fourth"]);
  });

  it("retains a low-confidence review while ranking its alternatives by probability", async () => {
    const candidates = [candidate("weak-first"), candidate("weak-second"), candidate("weak-third")];
    const result = await evaluateSelection(
      candidates,
      evidence(),
      fetcherFor(choiceResponse("printing_0", 0.69, {
        printing_0: 0.45,
        printing_1: 0.35,
        printing_2: 0.15,
        no_match: 0.05,
      })),
    );

    expect(result).toMatchObject({ status: "review", recommendedId: null, confidence: 0.69 });
    expect(result.rankedIds).toEqual(["weak-first", "weak-second", "weak-third"]);
  });

  it("ranks candidate alternatives even when Jev chooses no_match", async () => {
    const candidates = [candidate("no-match-first"), candidate("no-match-second")];
    const result = await evaluateSelection(
      candidates,
      evidence(),
      fetcherFor(choiceResponse("no_match", 0.91, {
        printing_0: 0.35,
        printing_1: 0.30,
        no_match: 0.35,
      })),
    );

    expect(result).toMatchObject({ status: "review", recommendedId: null, confidence: 0.91 });
    expect(result.rankedIds).toEqual(["no-match-first", "no-match-second"]);
  });

  it.each(["set", "number", "name"] as const)(
    "keeps a high-probability wrong %s choice below compatible candidates",
    async (mismatch) => {
      const observed = mismatch === "set"
        ? evidence({ setCode: "base1" })
        : mismatch === "number"
          ? evidence({ cardNumber: "58" })
          : evidence();
      const conflicting = mismatch === "set"
        ? candidate("conflicting", { setId: "jungle", cardNumber: null })
        : mismatch === "number"
          ? candidate("conflicting", { setId: null, cardNumber: "99" })
          : candidate("conflicting", { name: "Charizard" });
      const compatible = mismatch === "set"
        ? candidate("compatible", { setId: "base1", cardNumber: null })
        : mismatch === "number"
          ? candidate("compatible", { setId: null, cardNumber: "58" })
          : candidate("compatible");
      const wrongName = mismatch === "set"
        ? candidate("wrong-name", { name: "Charizard", setId: "base1", cardNumber: null })
        : mismatch === "number"
          ? candidate("wrong-name", { name: "Charizard", setId: null, cardNumber: "58" })
          : candidate("wrong-name", { name: "Eevee" });
      const noIdentifiers = candidate("no-identifiers", { setId: null, cardNumber: null });
      const candidates = [conflicting, noIdentifiers, compatible, wrongName];
      const choiceIndex = mismatch === "name" ? 3 : 0;
      const probabilities = mismatch === "name"
        ? { printing_0: 0.02, printing_1: 0.03, printing_2: 0.04, printing_3: 0.90, no_match: 0.01 }
        : { printing_0: 0.90, printing_1: 0.03, printing_2: 0.04, printing_3: 0.02, no_match: 0.01 };
      const result = await evaluateSelection(
        candidates,
        observed,
        fetcherFor(choiceResponse(`printing_${choiceIndex}`, 0.99, probabilities)),
      );

      expect(result).toMatchObject({ status: "review", recommendedId: null, confidence: 0.99 });
      expect(result.rankedIds).toEqual(mismatch === "name"
        ? ["compatible", "no-identifiers", "wrong-name", "conflicting"]
        : ["compatible", "no-identifiers", "conflicting", "wrong-name"]);
    },
  );

  it("uses original candidate order to break probability ties", async () => {
    const candidates = [candidate("tie-c"), candidate("tie-a"), candidate("tie-b")];
    const result = await evaluateSelection(
      candidates,
      evidence(),
      fetcherFor(choiceResponse("printing_1", 0.9, {
        printing_0: 0.30,
        printing_1: 0.40,
        printing_2: 0.30,
        no_match: 0,
      })),
    );

    expect(result.status).toBe("review");
    expect(result.rankedIds).toEqual(["tie-a", "tie-c", "tie-b"]);
  });

  it("preserves every ID, stable unknown ordering, and only promotes exact or likely recommendations without mutation", () => {
    const candidates = [
      candidate("pin"),
      candidate("unknown-first"),
      candidate("ranked-second"),
      candidate("ranked-first"),
      candidate("unknown-second"),
    ];
    const original = [...candidates];
    const review: ScanPrintingEvaluation = {
      status: "review",
      recommendedId: "pin",
      confidence: 0.5,
      message: "Review alternatives.",
      rankedIds: ["ranked-first", "ranked-second"],
    };

    expect(orderScanPrintings(candidates, review).map(({ id }) => id))
      .toEqual(["ranked-first", "ranked-second", "pin", "unknown-first", "unknown-second"]);
    expect(orderScanPrintings(candidates, { ...review, status: "likely" }).map(({ id }) => id))
      .toEqual(["pin", "ranked-first", "ranked-second", "unknown-first", "unknown-second"]);
    expect(candidates).toEqual(original);
  });

  it("keeps unavailable and malformed evaluations on original fallback order", async () => {
    const candidates = [candidate("fallback-first"), candidate("fallback-second")];
    const malformedFetcher = fetcherFor(new Response(JSON.stringify({
      answers: {
        printing: {
          type: "choice",
          choice: "printing_0",
          confidence: 0.9,
          probabilities: { printing_0: 0.8, printing_1: 0.1, no_match: 0.05 },
        },
      },
    }), { status: 200 }));
    const malformed = await evaluateSelection(candidates, evidence(), malformedFetcher);
    expect(malformed.status).toBe("unavailable");
    expect(malformed.rankedIds).toBeUndefined();
    expect(orderScanPrintings(candidates, malformed).map(({ id }) => id))
      .toEqual(["fallback-first", "fallback-second"]);

    vi.stubEnv("TYPESAFE_API_KEY", "");
    const fetcher = vi.fn();
    const noKey = await evaluateSelection(candidates, evidence({ visualSummary: "no-key fallback" }), fetcher as typeof fetch);
    expect(noKey.status).toBe("unavailable");
    expect(noKey.rankedIds).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
    expect(orderScanPrintings(candidates, noKey).map(({ id }) => id))
      .toEqual(["fallback-first", "fallback-second"]);
  });

  it("ranks every alternative when the candidate list exceeds twenty", async () => {
    const candidates = Array.from({ length: 27 }, (_, index) => candidate(`large-${index}`));
    const probabilities = Object.fromEntries([
      ...candidates.map((_, index) => [`printing_${index}`, index === 26 ? 0.8 : 0.2 / 26]),
      ["no_match", 0],
    ]);
    const result = await evaluateSelection(
      candidates,
      evidence(),
      fetcherFor(choiceResponse("printing_26", 0.95, probabilities)),
    );

    expect(result.status).toBe("likely");
    expect(result.rankedIds).toHaveLength(27);
    expect(result.rankedIds?.[0]).toBe("large-26");
    expect(new Set(result.rankedIds).size).toBe(27);
    expect(result.rankedIds).toContain("large-25");
  });

  it("bypasses Jev for an exact observed printing and still promotes the exact ID", async () => {
    const exact = candidate("exact", { setId: "sv01", cardNumber: "004/198" });
    const candidates = [candidate("other", { setId: "sv02", cardNumber: "4" }), exact];
    const fetcher = vi.fn();
    const result = await evaluateSelection(
      candidates,
      evidence({ setCode: "SV1 EN", cardNumber: "4" }),
      fetcher as typeof fetch,
    );

    expect(result).toMatchObject({ status: "exact", recommendedId: "exact" });
    expect(result.rankedIds).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
    expect(orderScanPrintings(candidates, result).map(({ id }) => id)).toEqual(["exact", "other"]);
  });

  it("returns the same internal ranking through the cached selection entry point", async () => {
    const candidates = [candidate("select-first"), candidate("select-second")];
    const result = await selectScanPrinting(
      candidates,
      evidence({ visualSummary: "select entry point" }),
      fetcherFor(choiceResponse("printing_1", 0.9, {
        printing_0: 0.1,
        printing_1: 0.85,
        no_match: 0.05,
      })),
    );

    expect(result).toMatchObject({ status: "likely", recommendedId: "select-second" });
    expect(result.rankedIds).toEqual(["select-second", "select-first"]);
  });
});
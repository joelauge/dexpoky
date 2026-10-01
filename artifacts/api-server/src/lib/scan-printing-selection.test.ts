import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluateSelection,
  scanPrintingSelectionLimits,
  selectScanPrinting,
  type ScanPrintingCandidate,
  type ScanPrintingEvidence,
} from "./scan-printing-selection.js";

const candidate = (id: string, overrides: Partial<ScanPrintingCandidate> = {}): ScanPrintingCandidate => ({
  id,
  name: "Pikachu",
  setName: "Base Set",
  setId: "base1",
  cardNumber: "58",
  rarity: "Common",
  ...overrides,
});

const evidence = (overrides: Partial<ScanPrintingEvidence> = {}): ScanPrintingEvidence => ({
  name: "Pikachu",
  visionConfidence: "medium",
  visualSummary: "Yellow border with a red cheek visible",
  ...overrides,
});

function choiceResponse(
  choice: string,
  confidence: number,
  probabilities: Record<string, number>,
): Response {
  return new Response(JSON.stringify({
    model: "jev-1.13.0",
    answers: { printing: { type: "choice", choice, confidence, probabilities } },
    usage: { input_tokens: 1, output_tokens: 1 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function rawResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

function strongChoice(index: number, candidateCount: number, confidence = 0.9): Response {
  const probabilities: Record<string, number> = {};
  for (let option = 0; option < candidateCount; option++) {
    probabilities[`printing_${option}`] = option === index ? 0.85 : 0.15 / Math.max(1, candidateCount - 1);
  }
  probabilities.no_match = 0;
  return choiceResponse(`printing_${index}`, confidence, probabilities);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("server-side scan printing selection", () => {
  it("sends a text-only Jev Choice request with complete candidate options", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const cards = [
      candidate("pk-pika-a", { imageUrl: "https://private.example/artwork.png" } as Partial<ScanPrintingCandidate>),
      candidate("pk-pika-b", { setId: "jungle", setName: "Jungle", cardNumber: "60" }),
    ];
    const fetcher = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(strongChoice(1, cards.length)));

    const result = await selectScanPrinting(cards, evidence({ hp: 120 }), fetcher as typeof fetch);

    expect(result).toMatchObject({ status: "likely", recommendedId: "pk-pika-b", confidence: 0.9 });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ Authorization: "Bearer test-key", "Content-Type": "application/json" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: "jev-latest",
      state: {
        evidence: {
          name: "Pikachu",
          setCode: null,
          cardNumber: null,
          visionConfidence: "medium",
          visualSummary: "Yellow border with a red cheek visible",
          hp: 120,
        },
        candidates: {
          printing_0: { id: "pk-pika-a", name: "Pikachu", setId: "base1", cardNumber: "58" },
          printing_1: { id: "pk-pika-b", setId: "jungle", cardNumber: "60" },
        },
      },
      questions: {
        printing: {
          type: "choice",
          criteria: {
            printing_0: expect.any(String),
            printing_1: expect.any(String),
            no_match: expect.any(String),
          },
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain("imageUrl");
    expect(JSON.stringify(body)).not.toContain("artwork.png");
    expect(Object.keys(body.questions.printing.criteria)).toHaveLength(3);
  });

  it("keeps the deterministic exact set-and-number printing irrespective of Jev", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const exact = candidate("exact", { setId: "sv01", cardNumber: "004/198" });
    const fetcher = vi.fn();
    const result = await selectScanPrinting(
      [candidate("other", { setId: "sv02", cardNumber: "4" }), exact],
      evidence({ setCode: "SV1 EN", cardNumber: "4" }),
      fetcher as typeof fetch,
    );
    expect(result).toMatchObject({ status: "exact", recommendedId: "exact", confidence: null });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires compatible OCR name evidence for exact identifier matches in both selection paths", async () => {
    const cards = [
      candidate("basic-psychic", {
        name: "Basic Psychic Energy",
        setId: "mee",
        cardNumber: "005",
      }),
      candidate("basic-fire", {
        name: "Basic Fire Energy",
        setId: "mee",
        cardNumber: null,
      }),
    ];
    const observed = evidence({
      name: "Basic Fire Energy",
      setCode: "mee",
      cardNumber: "5",
    });
    const publicFetcher = vi.fn(async () => strongChoice(1, cards.length));
    const publicResult = await selectScanPrinting(cards, observed, publicFetcher as typeof fetch);
    expect(publicResult).toMatchObject({ status: "review", recommendedId: null });
    expect(publicResult.message).toContain("name does not match");
    expect(publicFetcher).not.toHaveBeenCalled();

    const evaluationFetcher = vi.fn(async () => strongChoice(1, cards.length));
    const evaluatedResult = await evaluateSelection(cards, observed, evaluationFetcher as typeof fetch);
    expect(evaluatedResult).toMatchObject({ status: "review", recommendedId: null });
    expect(evaluatedResult.message).toContain("name does not match");
    expect(evaluationFetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["same energy label", "FIR", "FIR", "exact"],
    ["same tagged number", "TG01", "TG01", "exact"],
    ["tagged slash denominator", "TG01/100", "TG01", "exact"],
    ["different tagged numbers", "TG01", "GG01", "review"],
    ["XY number is not a bare number", "XY5", "5", "review"],
    ["padded slash number", "005/202", "5", "exact"],
  ])("normalizes printing numbers conservatively: %s", async (_label, candidateNumber, observedNumber, expectedStatus) => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const cards = [
      candidate(`number-${candidateNumber}`, { cardNumber: candidateNumber }),
      candidate("number-alternative", { cardNumber: "60" }),
    ];
    const fetcher = vi.fn(async () => strongChoice(0, cards.length));
    const result = await selectScanPrinting(
      cards,
      evidence({ name: `Pikachu number ${observedNumber}`, setCode: "base1", cardNumber: observedNumber }),
      fetcher as typeof fetch,
    );
    expect(result.status).toBe(expectedStatus);
    if (expectedStatus === "exact") {
      expect(result.recommendedId).toBe(`number-${candidateNumber}`);
      expect(fetcher).not.toHaveBeenCalled();
    } else {
      expect(result.recommendedId).toBeNull();
    }
  });

  it("refuses a model choice that conflicts with an observed identifier", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const cards = [candidate("wrong", { setId: "jungle" }), candidate("unlabeled", { setId: null })];
    const fetcher = vi.fn(async () => strongChoice(0, cards.length));
    const result = await selectScanPrinting(cards, evidence({ setCode: "base1" }), fetcher as typeof fetch);
    expect(result).toMatchObject({ status: "review", recommendedId: null });
    expect(result.message).toContain("conflicts");

    const numberCards = [candidate("wrong-number", { cardNumber: "60" }), candidate("right-number", { cardNumber: "58" })];
    const numberFetcher = vi.fn(async () => strongChoice(0, numberCards.length));
    await expect(selectScanPrinting(numberCards, evidence({ name: "Pikachu number conflict", cardNumber: "58" }), numberFetcher as typeof fetch))
      .resolves.toMatchObject({ status: "review", recommendedId: null });
  });

  it("will not confidently promote a catalog row missing both identifiers or name evidence", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const incompleteCards = [
      candidate("incomplete", { setId: null, cardNumber: null }),
      candidate("complete-alternative", { setId: "jungle", cardNumber: "60" }),
    ];
    const incompleteFetcher = vi.fn(async () => strongChoice(0, incompleteCards.length));
    await expect(selectScanPrinting(
      incompleteCards,
      evidence({ name: "Pikachu incomplete entry" }),
      incompleteFetcher as typeof fetch,
    )).resolves.toMatchObject({ status: "review", recommendedId: null });

    const mismatchedNameCards = [
      candidate("wrong-name", { name: "Charizard" }),
      candidate("other-name", { name: "Eevee", setId: "jungle" }),
    ];
    const nameFetcher = vi.fn(async () => strongChoice(0, mismatchedNameCards.length));
    await expect(selectScanPrinting(
      mismatchedNameCards,
      evidence({ name: "Pikachu unrelated name" }),
      nameFetcher as typeof fetch,
    )).resolves.toMatchObject({ status: "review", recommendedId: null });
  });

  it("leaves deterministic order without a confident recommendation for no_match or weak judgments", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const noMatchCards = [candidate("none-a"), candidate("none-b", { setId: "jungle" })];
    const noMatchFetcher = vi.fn(async () => choiceResponse("no_match", 0.9, {
      printing_0: 0.04, printing_1: 0.04, no_match: 0.92,
    }));
    await expect(selectScanPrinting(noMatchCards, evidence({ name: "Pikachu no match" }), noMatchFetcher as typeof fetch))
      .resolves.toMatchObject({ status: "review", recommendedId: null });

    const weakCards = [candidate("weak-a"), candidate("weak-b", { setId: "jungle" })];
    const weakFetcher = vi.fn(async () => choiceResponse("printing_0", 0.69, {
      printing_0: 0.6, printing_1: 0.25, no_match: 0.15,
    }));
    await expect(selectScanPrinting(weakCards, evidence({ name: "Pikachu weak" }), weakFetcher as typeof fetch))
      .resolves.toMatchObject({ status: "review", recommendedId: null, confidence: 0.69 });
  });

  it("evaluates every candidate beyond twenty and never sends artwork", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const cards = Array.from({ length: 25 }, (_, index) => candidate(`large-${index}`, {
      name: `Pikachu ${index}`,
      setId: `set${index}`,
      cardNumber: String(index + 1),
    }));
    const fetcher = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(strongChoice(24, cards.length)));
    const result = await selectScanPrinting(cards, evidence({ name: "Pikachu" }), fetcher as typeof fetch);
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(result).toMatchObject({ status: "likely", recommendedId: "large-24" });
    expect(Object.keys(body.questions.printing.criteria)).toHaveLength(26);
    expect(Object.keys(body.state.candidates)).toHaveLength(25);
    expect(body.state.candidates.printing_24.id).toBe("large-24");
    expect(JSON.stringify(body.state)).not.toMatch(/imageUrl|artwork|https?:\/\//i);
    expect(JSON.stringify(body.questions.printing.criteria)).not.toMatch(/https?:\/\//i);
  });

  it.each([
    ["unknown choice", (count: number) => choiceResponse("not-an-option", 0.9, {
      printing_0: 0.9, printing_1: 0.05, no_match: 0.05,
    })],
    ["non-finite confidence", (_count: number) => rawResponse({
      answers: { printing: { type: "choice", choice: "printing_0", confidence: Number.NaN, probabilities: { printing_0: 0.9, printing_1: 0.05, no_match: 0.05 } } },
    })],
    ["partial probabilities", (_count: number) => choiceResponse("printing_0", 0.9, { printing_0: 0.9 })],
    ["probabilities do not sum to one", (_count: number) => choiceResponse("printing_0", 0.9, {
      printing_0: 0.8, printing_1: 0.1, no_match: 0.05,
    })],
    ["non-finite probability", (_count: number) => rawResponse({
      answers: { printing: { type: "choice", choice: "printing_0", confidence: 0.9, probabilities: { printing_0: Number.NaN, printing_1: 0.05, no_match: 0.05 } } },
    })],
    ["wrong answer type", (_count: number) => new Response(JSON.stringify({
      answers: { printing: { type: "noul", choice: "printing_0", confidence: 0.9, probabilities: { printing_0: 0.9, printing_1: 0.05, no_match: 0.05 } } },
    }), { status: 200 })],
    ["extra answer key", (_count: number) => new Response(JSON.stringify({
      answers: {
        printing: { type: "choice", choice: "printing_0", confidence: 0.9, probabilities: { printing_0: 0.9, printing_1: 0.05, no_match: 0.05 } },
        unexpected: { type: "choice" },
      },
    }), { status: 200 })],
  ])("falls back on invalid Jev response: %s", async (label, responseFor) => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const cards = [candidate(`${label}-a`), candidate(`${label}-b`, { setId: "jungle" })];
    const fetcher = vi.fn(async () => responseFor(cards.length + 1));
    await expect(selectScanPrinting(cards, evidence({ name: `Pikachu ${label}` }), fetcher as typeof fetch))
      .resolves.toMatchObject({ status: "unavailable", recommendedId: null, confidence: null });
  });

  it("uses deterministic/manual fallback when full Choice coverage would exceed 255 options", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const cards = Array.from({ length: scanPrintingSelectionLimits.maxCandidates + 1 }, (_, index) =>
      candidate(`oversize-${index}`));
    const fetcher = vi.fn();
    const result = await selectScanPrinting(cards, evidence({ name: "Pikachu oversize" }), fetcher as typeof fetch);
    expect(result.status).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
    expect(cards).toHaveLength(255);
  });

  it("uses the full 255-option Choice limit when exactly 254 candidates are available", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const cards = Array.from({ length: scanPrintingSelectionLimits.maxCandidates }, (_, index) =>
      candidate(`boundary-${index}`));
    const fetcher = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(strongChoice(253, cards.length)));
    const result = await selectScanPrinting(cards, evidence({ name: "Pikachu choice limit" }), fetcher as typeof fetch);
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(result).toMatchObject({ status: "likely", recommendedId: "boundary-253" });
    expect(Object.keys(body.questions.printing.criteria)).toHaveLength(255);
    expect(body.questions.printing.criteria.no_match).toBeTruthy();
  });

  it("returns unavailable on timeout or missing key, and retries unavailable results", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "timeout-key");
    vi.useFakeTimers();
    const cards = [candidate("timeout-a"), candidate("timeout-b", { setId: "jungle" })];
    const timeoutFetcher = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const pending = selectScanPrinting(cards, evidence({ name: "Pikachu timeout" }), timeoutFetcher as typeof fetch);
    await vi.advanceTimersByTimeAsync(scanPrintingSelectionLimits.timeoutMs);
    await expect(pending).resolves.toMatchObject({ status: "unavailable", recommendedId: null });

    vi.useRealTimers();
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const retryCards = [candidate("retry-a"), candidate("retry-b", { setId: "jungle" })];
    const retryEvidence = evidence({ name: "Pikachu unavailable then retry" });
    const missingKeyFetcher = vi.fn();
    await expect(selectScanPrinting(retryCards, retryEvidence, missingKeyFetcher as typeof fetch))
      .resolves.toMatchObject({ status: "unavailable" });
    expect(missingKeyFetcher).not.toHaveBeenCalled();

    vi.stubEnv("TYPESAFE_API_KEY", "retry-key");
    const workingFetcher = vi.fn(async () => strongChoice(0, retryCards.length));
    await expect(selectScanPrinting(retryCards, retryEvidence, workingFetcher as typeof fetch))
      .resolves.toMatchObject({ status: "likely", recommendedId: "retry-a" });
    expect(workingFetcher).toHaveBeenCalledTimes(1);
  });

  it("caches only equivalent evidence and complete candidate metadata", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const cards = [candidate("cache-a"), candidate("cache-b", { setId: "jungle" })];
    const fetcher = vi.fn(async () => strongChoice(0, cards.length));
    const firstEvidence = evidence({ name: "Pikachu cache" });
    await selectScanPrinting(cards, firstEvidence, fetcher as typeof fetch);
    await selectScanPrinting(cards, firstEvidence, fetcher as typeof fetch);
    await selectScanPrinting(cards, { ...firstEvidence, visualSummary: "Blue border" }, fetcher as typeof fetch);
    await selectScanPrinting([cards[0]!, { ...cards[1]!, rarity: "Rare" }], firstEvidence, fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not return provider payloads or raw errors in the public selection", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const cards = [candidate("safe-a"), candidate("safe-b", { setId: "jungle" })];
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      answers: { printing: { type: "choice", choice: "printing_0", confidence: 0.9, probabilities: { printing_0: 0.85, printing_1: 0.1, no_match: 0.05 } } },
      privateProviderText: "must not escape",
    }), { status: 200 }));
    const result = await selectScanPrinting(cards, evidence({ name: "Pikachu response privacy" }), fetcher as typeof fetch);
    expect(JSON.stringify(result)).not.toContain("privateProviderText");
    expect(JSON.stringify(result)).not.toContain("test-key");
  });
});
import { describe, expect, it } from "vitest";
import { GODPACK_CARDS, godPackImageUrl, godPackRawValue, godPackTotals, godPackWatchUrl } from "./godpack";

describe("god pack showcase", () => {
  it("lists the ten cards from the pack with unique catalog ids", () => {
    expect(GODPACK_CARDS).toHaveLength(10);
    expect(new Set(GODPACK_CARDS.map((c) => c.catalogId)).size).toBe(10);
  });

  it("uses a live price only when it is a positive number", () => {
    const card = GODPACK_CARDS[0];
    expect(godPackRawValue(card, 3.3)).toEqual({ value: 3.3, live: true });
    expect(godPackRawValue(card, null)).toEqual({ value: card.snapshotRaw, live: false });
    expect(godPackRawValue(card, 0)).toEqual({ value: card.snapshotRaw, live: false });
    expect(godPackRawValue(card, Number.NaN)).toEqual({ value: card.snapshotRaw, live: false });
  });

  it("totals live prices and falls back to snapshots per card", () => {
    const snapshotTotal = GODPACK_CARDS.reduce((s, c) => s + c.snapshotRaw, 0);
    expect(godPackTotals([]).raw).toBeCloseTo(snapshotTotal);
    expect(godPackTotals([]).allLive).toBe(false);

    const live = GODPACK_CARDS.map(() => 1);
    expect(godPackTotals(live)).toMatchObject({ raw: 10, allLive: true });
    expect(godPackTotals(live).psa10).toBeCloseTo(2547.96);
  });

  it("builds image and timestamped video links", () => {
    expect(godPackImageUrl(GODPACK_CARDS[9])).toBe("https://tcgplayer-cdn.tcgplayer.com/product/676102_400w.jpg");
    expect(godPackWatchUrl(1812)).toBe("https://www.youtube.com/watch?v=Ur2OtmOknv4&t=1812s");
  });
});

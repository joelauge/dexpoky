import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchesWishlistTarget } from "./match";

describe("wishlist sale printing identity", () => {
  const target = { catalogCardId: "printing-A", setId: "base1", cardNumber: "58" };
  it("requires identical recorded catalog IDs, never same-name or conflicting-ID fallback", () => {
    assert.equal(matchesWishlistTarget({ ...target }, target), true);
    assert.equal(matchesWishlistTarget({ ...target, catalogCardId: "printing-B" }, target), false);
  });
  it("allows a legacy owned copy only with an exact nonempty set and card number", () => {
    assert.equal(matchesWishlistTarget({ ...target, catalogCardId: null }, target), true);
    assert.equal(matchesWishlistTarget({ catalogCardId: null, setId: "base2", cardNumber: "58" }, target), false);
    assert.equal(matchesWishlistTarget({ catalogCardId: null, setId: "base1", cardNumber: "59" }, target), false);
    assert.equal(matchesWishlistTarget({ catalogCardId: null, setId: null, cardNumber: null }, target), false);
  });
});

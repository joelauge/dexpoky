import type { BinderDisplayCard, Card } from "@workspace/api-client-react";

/** Both recorded catalog IDs must agree; legacy copies need an exact set/number match. */
export function matchesWishlistTarget(
  owned: Pick<Card, "catalogCardId" | "setId" | "cardNumber">,
  target: Pick<BinderDisplayCard, "catalogCardId" | "setId" | "cardNumber">,
): boolean {
  if (owned.catalogCardId && target.catalogCardId) return owned.catalogCardId === target.catalogCardId;
  return !!target.setId && !!target.cardNumber && owned.setId === target.setId && owned.cardNumber === target.cardNumber;
}

export function explainContactError(e: unknown): string {
  const err = e as { status?: number; data?: { error?: string } } | null;
  if (err?.data?.error && typeof err.data.error === "string") return err.data.error;
  switch (err?.status) {
    case 400: return "The server rejected this offer. Check the amount and the cards you chose.";
    case 401: return "Your session expired. Sign in again to send this offer.";
    case 403: return "You cannot make an offer on this binder.";
    case 404: return "This binder is private or no longer shared.";
    case 409: return "This pocket changed or the card is no longer available. Reload the binder and try again.";
    default: return "Could not send your offer. Check your connection and try again.";
  }
}

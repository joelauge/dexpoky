import { post, get } from "../fetch";

export interface InviteRecipient {
  email?: string;
  phone?: string;
  name?: string;
}

export interface SendInviteBody {
  to: InviteRecipient;
  message: string;
  subject?: string;
  featuredListingId?: number;
  /**
   * Optional destination URL for the invite CTA button.
   * If omitted, the platform generates a tracking URL of the form
   * `https://<your-domain>?ref=dpx_<inviteId>` so sign-ups can be
   * automatically attributed back to this invite.
   */
  ctaUrl?: string;
}

export interface InviteResult {
  id: number;
  sentAt: string;
  channels: string[];
  /**
   * The CTA URL that was embedded in the invite.
   * When no `ctaUrl` was supplied in the request this will be the
   * auto-generated tracking URL (`?ref=dpx_<id>`).
   */
  ctaUrl: string | null;
  warnings?: string[];
}

export interface InviteHistoryEntry {
  id: number;
  to: { email: string | null; phone: string | null; name: string };
  subject: string;
  channel: string;
  status: string;
  sentAt: string;
  /**
   * The CTA URL embedded in this invite.
   * Auto-generated tracking URLs have the form `?ref=dpx_<id>` so you
   * can tell which invites used conversion tracking.
   */
  ctaUrl: string | null;
  /**
   * ISO timestamp of when the recipient signed up via the tracked link.
   * `null` if the invite has not yet converted.
   * Use this field to compute a conversion rate over a set of invites:
   *
   * ```ts
   * const history = await client.outreach.listInvites();
   * const rate = history.filter(i => i.convertedAt).length / history.length;
   * console.log(`Conversion rate: ${(rate * 100).toFixed(1)}%`);
   * ```
   */
  convertedAt: string | null;
}

export const outreach = {
  /**
   * Send a Pokémon-card-styled invite email and/or SMS to someone who isn't
   * yet on DexPoky. Requires `to.email`, `to.phone`, or both.
   * Rate limited to 30 invites per 24 hours per API key.
   *
   * When `ctaUrl` is omitted the platform automatically appends a
   * `?ref=dpx_<inviteId>` tracking parameter to the default landing URL.
   * If the recipient clicks that link and creates an account, the invite's
   * `convertedAt` field is populated — visible via `listInvites()`.
   */
  invite: (body: SendInviteBody): Promise<InviteResult> =>
    post("/api/outreach/invite", body),

  /**
   * List the last 100 invites sent by the current API key, newest first.
   * Each entry includes `convertedAt` (non-null when the recipient signed up
   * via the tracked link) so you can measure your outreach conversion rate.
   */
  listInvites: (): Promise<InviteHistoryEntry[]> =>
    get("/api/outreach/invites"),
};

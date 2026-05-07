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
  ctaUrl?: string;
}

export interface InviteResult {
  id: number;
  sentAt: string;
  channels: string[];
  warnings?: string[];
}

export interface InviteHistoryEntry {
  id: number;
  to: { email: string | null; phone: string | null; name: string };
  subject: string;
  channel: string;
  status: string;
  sentAt: string;
}

export const outreach = {
  /**
   * Send a Pokémon-card-styled invite email and/or SMS to someone who isn't
   * yet on DexPoky. Requires `to.email`, `to.phone`, or both.
   * Rate limited to 30 invites per 24 hours per API key.
   */
  invite: (body: SendInviteBody): Promise<InviteResult> =>
    post("/api/outreach/invite", body),

  /**
   * List the last 100 invites sent by the current API key, newest first.
   */
  listInvites: (): Promise<InviteHistoryEntry[]> =>
    get("/api/outreach/invites"),
};

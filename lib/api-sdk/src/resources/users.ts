import { get, put, post } from "../fetch";

export interface UserProfile {
  clerkId: string;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  sellerDetails: string | null;
  ratingCount: number;
  ratingAverage: number | null;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  positivePercent: number | null;
  sellerLevel: string;
  recentRatingCount: number;
}

export interface UpdateProfileBody {
  username?: string;
  bio?: string | null;
  sellerDetails?: string | null;
  avatarUrl?: string | null;
}

export interface EarningsResponse {
  availableBalanceCents: number;
  totalEarnedCents: number;
  pendingPayoutCents: number;
  walletBalanceCents: number;
  recentCredits: Array<{
    amountCents: number;
    description: string;
    createdAt: string;
  }>;
  payoutHistory: Array<{
    id: number;
    amountCents: number;
    status: string;
    requestedAt: string;
  }>;
}

export interface PayoutMethodBody {
  stripeAccountId: string;
}

export interface PayoutRequestBody {
  amountCents: number;
}

export const users = {
  me: (): Promise<UserProfile> =>
    get("/api/users/me"),

  updateMe: (body: UpdateProfileBody): Promise<UserProfile> =>
    put("/api/users/me", body),

  getEarnings: (): Promise<EarningsResponse> =>
    get("/api/users/me/earnings"),

  updatePayoutMethod: (body: PayoutMethodBody): Promise<unknown> =>
    put("/api/users/me/payout-method", body),

  requestPayout: (body: PayoutRequestBody): Promise<unknown> =>
    post("/api/users/me/payouts/request", body),

  getPublicProfile: (clerkId: string): Promise<UserProfile> =>
    get(`/api/users/${clerkId}`),
};

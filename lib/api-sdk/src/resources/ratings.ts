import { get, post } from "../fetch";

export interface RatingEntry {
  id: number;
  raterClerkId: string;
  ratedClerkId: string;
  listingId: number | null;
  tradeOfferId: number | null;
  score: number;
  comment: string | null;
  type: string;
  subCondition: number | null;
  subCommunication: number | null;
  subShipping: number | null;
  subValue: number | null;
  replyText: string | null;
  repliedAt: string | null;
  createdAt: string;
  raterUsername?: string | null;
  raterAvatarUrl?: string | null;
}

export interface RatingSummary {
  ratingCount: number;
  ratingAverage: number | null;
  subConditionAvg: number | null;
  subCommunicationAvg: number | null;
  subShippingAvg: number | null;
  subValueAvg: number | null;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  positivePercent: number | null;
  sellerLevel: string;
}

export interface UserRatingsResponse extends RatingSummary {
  ratings: RatingEntry[];
  total?: number;
  page?: number;
  pageSize?: number;
}

export interface ListUserRatingsParams {
  role?: "seller" | "buyer";
  period?: "1m" | "6m" | "12m" | "all";
  page?: number;
}

export interface CreateListingRatingBody {
  listingId: number;
  score: number;
  comment?: string;
  subCondition?: number;
  subCommunication?: number;
  subShipping?: number;
  subValue?: number;
}

export interface CreateTradeRatingBody {
  tradeOfferId: number;
  score: number;
  comment?: string;
  subCondition?: number;
  subCommunication?: number;
  subShipping?: number;
  subValue?: number;
}

export const ratings = {
  listForUser: (clerkId: string, params?: ListUserRatingsParams): Promise<UserRatingsResponse> =>
    get(`/api/ratings/user/${clerkId}`, params as Record<string, string | number | boolean | undefined | null>),

  getForOffer: (offerId: number): Promise<RatingEntry | null> =>
    get(`/api/ratings/offer/${offerId}`),

  createListingRating: (body: CreateListingRatingBody): Promise<RatingEntry> =>
    post("/api/ratings", body),

  createTradeRating: (body: CreateTradeRatingBody): Promise<RatingEntry> =>
    post("/api/ratings", body),

  reply: (ratingId: number, replyText: string): Promise<RatingEntry> =>
    post(`/api/ratings/${ratingId}/reply`, { replyText }),
};

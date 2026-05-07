import { get, post, patch } from "../fetch";

export type OfferStatus = "pending" | "countered" | "accepted" | "declined" | "cancelled" | "paid";
export type ExchangeMethod =
  | "store"
  | "psa_vault"
  | "courtyard_nft"
  | "paypal_gs"
  | "escrow_com"
  | "cash_in_person"
  | "dexpoky_pay";

export interface TradeOffer {
  id: number;
  threadId: number;
  sellerClerkId: string;
  sellerImages: string[] | null;
  sellerVideo: string | null;
  askingPrice: number | null;
  offerAmount: number | null;
  offerHistory: Array<{
    amount: number;
    from: "buyer" | "seller";
    sentAt: string;
    note?: string;
  }>;
  status: OfferStatus;
  exchangeMethod: ExchangeMethod | null;
  exchangeMethodProposedBy: string | null;
  exchangeMethodConfirmedBySeller: boolean;
  videoCallScheduledAt: string | null;
  videoCallNotes: string | null;
  videoCallConfirmedByBuyer: boolean;
  videoCallConfirmedBySeller: boolean;
  meetupLocation: string | null;
  meetupProposedAt: string | null;
  meetupNotes: string | null;
  storeMeetupPinActive: boolean;
  storeMeetupPinExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: "buyer" | "seller";
}

export interface UpdateOfferBody {
  action: string;
  amount?: number;
  note?: string;
  exchangeMethod?: ExchangeMethod;
  videoCallScheduledAt?: string;
  videoCallNotes?: string;
  meetupLocation?: string;
  meetupNotes?: string;
  pin?: string;
}

export interface TradePaymentResult {
  success?: boolean;
  url?: string;
  checkoutUrl?: string;
  error?: string;
}

export interface StorePin {
  pin: string;
  expiresAt: string;
}

export const trades = {
  getOffer: (threadId: number): Promise<TradeOffer> =>
    get(`/api/threads/${threadId}/offer`),

  updateOffer: (threadId: number, body: UpdateOfferBody): Promise<TradeOffer> =>
    patch(`/api/threads/${threadId}/offer`, body),

  generateStorePin: (threadId: number): Promise<StorePin> =>
    post(`/api/threads/${threadId}/offer/store-pin`),

  initiateCardPayment: (threadId: number): Promise<{ url: string }> =>
    post(`/api/threads/${threadId}/payment/checkout`),

  initiateWalletPayment: (threadId: number): Promise<TradePaymentResult> =>
    post(`/api/threads/${threadId}/payment/wallet`),

  getPaymentStatus: (threadId: number): Promise<{ status: string }> =>
    get(`/api/threads/${threadId}/payment/status`),
};

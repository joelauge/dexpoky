import { get, post } from "../fetch";

export interface WalletBalance {
  balanceCents: number;
}

export interface TopUpBody {
  amountCents: number;
  successUrl?: string;
  cancelUrl?: string;
}

export interface TopUpResponse {
  url: string;
}

export const wallet = {
  getBalance: (): Promise<WalletBalance> =>
    get("/api/wallet/balance"),

  topUp: (body: TopUpBody): Promise<TopUpResponse> =>
    post("/api/wallet/topup", body),
};

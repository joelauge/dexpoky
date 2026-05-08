import { get, post, patch, del } from "../fetch";

export interface TempoWalletInfo {
  address: string;
  network: string;
  token: string;
  balance: string;
  faucetUrl: string;
  explorerUrl: string;
  createdAt: string;
}

export interface DexAgent {
  id: number;
  clerkId: string;
  name: string;
  pokemonName: string;
  triggerType: "buy_now" | "bid";
  maxPricePathUsd: string;
  budgetPathUsd: string;
  spentPathUsd: string;
  requireHoloOnly: boolean;
  requireCondition: string | null;
  status: "active" | "paused" | "budget_exhausted";
  runsCount: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentBody {
  name: string;
  pokemonName: string;
  triggerType?: "buy_now" | "bid";
  maxPricePathUsd: number;
  budgetPathUsd: number;
  requireHoloOnly?: boolean;
  requireCondition?: string;
}

export interface PatchAgentBody {
  name?: string;
  status?: "active" | "paused";
  maxPricePathUsd?: number;
  budgetPathUsd?: number;
}

export interface AgentRun {
  id: number;
  agentId: number;
  clerkId: string;
  listingId: number | null;
  cardName: string | null;
  amountPathUsd: string | null;
  tempoTxHash: string | null;
  status: string;
  note: string | null;
  createdAt: string;
}

export interface AgentTriggerResult {
  matched: boolean;
  listingId?: number;
  cardName?: string;
  pricePathUsd?: string;
  txHash?: string;
  note: string;
}

export const agents = {
  getWallet: (): Promise<TempoWalletInfo> =>
    get("/api/agents/wallet"),

  list: (): Promise<DexAgent[]> =>
    get("/api/agents"),

  create: (body: CreateAgentBody): Promise<DexAgent> =>
    post("/api/agents", body),

  update: (id: number, body: PatchAgentBody): Promise<DexAgent> =>
    patch(`/api/agents/${id}`, body),

  delete: (id: number): Promise<void> =>
    del(`/api/agents/${id}`),

  getRuns: (agentId?: number): Promise<AgentRun[]> =>
    get(agentId ? `/api/agents/runs?agentId=${agentId}` : "/api/agents/runs"),

  trigger: (id: number): Promise<AgentTriggerResult> =>
    post(`/api/agents/${id}/trigger`, {}),
};

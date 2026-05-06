import type { Response } from "express";

interface SseClient {
  clerkId: string;
  res: Response;
}

const clients = new Set<SseClient>();

export function registerSseClient(clerkId: string, res: Response): () => void {
  const client: SseClient = { clerkId, res };
  clients.add(client);
  return () => {
    clients.delete(client);
  };
}

export interface PaymentReceivedPayload {
  threadId: number;
  amountCents: number;
  netCents: number;
}

export function pushPaymentReceived(sellerClerkId: string, payload: PaymentReceivedPayload): void {
  const data = JSON.stringify({ type: "payment_received", ...payload });
  for (const client of clients) {
    if (client.clerkId === sellerClerkId) {
      try {
        client.res.write(`data: ${data}\n\n`);
      } catch {
      }
    }
  }
}

import type {
  DmThreadSummary,
  DmMessage,
  SendMessageBody,
} from "@workspace/api-client-react";
import { get, post } from "../fetch";

export const messages = {
  listThreads: (): Promise<DmThreadSummary[]> =>
    get("/api/threads"),

  listMessages: (threadId: number): Promise<DmMessage[]> =>
    get(`/api/threads/${threadId}/messages`),

  send: (threadId: number, body: SendMessageBody): Promise<DmMessage> =>
    post(`/api/threads/${threadId}/messages`, body),

  markRead: (threadId: number): Promise<void> =>
    post(`/api/threads/${threadId}/read`),
};

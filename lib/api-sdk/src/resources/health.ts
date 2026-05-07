import type { HealthStatus } from "@workspace/api-client-react";
import { get } from "../fetch";

export const health = {
  check: (): Promise<HealthStatus> => get("/api/healthz"),
};

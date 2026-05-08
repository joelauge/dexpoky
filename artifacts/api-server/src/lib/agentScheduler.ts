import { eq, and } from "drizzle-orm";
import { db, dexAgentsTable } from "@workspace/db";
import { runAgentOnce } from "../routes/agents.js";
import { logger } from "./logger.js";

const INTERVAL_MS = 60_000;

async function tick() {
  try {
    const agents = await db
      .select()
      .from(dexAgentsTable)
      .where(eq(dexAgentsTable.status, "active"));

    for (const agent of agents) {
      try {
        const result = await runAgentOnce(agent, agent.clerkId);
        if (result.matched) {
          logger.info({ agentId: agent.id, cardName: result.cardName, txHash: result.txHash }, "DexAgent executed");
        }
      } catch (err) {
        logger.error({ err, agentId: agent.id }, "DexAgent run error");
      }
    }
  } catch (err) {
    logger.error({ err }, "Agent scheduler tick error");
  }
}

export function startAgentScheduler() {
  logger.info("DexAgent scheduler started");
  setInterval(() => { tick().catch(() => {}); }, INTERVAL_MS);
}

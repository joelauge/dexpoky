import { sql, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, scanUsageTable } from "@workspace/db";

export class StripeStorage {
  async getUserByClerkId(clerkId: string) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, clerkId));
    return user ?? null;
  }

  async updateUserStripeInfo(
    clerkId: string,
    info: {
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
    },
  ) {
    const [user] = await db
      .update(usersTable)
      .set(info)
      .where(eq(usersTable.clerkId, clerkId))
      .returning();
    return user;
  }

  async incrementFreeTrialScans(clerkId: string) {
    const [user] = await db
      .update(usersTable)
      .set({
        freeTrialActivated: true,
        freeTrialScansUsed: sql`${usersTable.freeTrialScansUsed} + 1`,
      })
      .where(eq(usersTable.clerkId, clerkId))
      .returning();
    return user;
  }

  async activateFreeTrial(clerkId: string) {
    const [user] = await db
      .update(usersTable)
      .set({ freeTrialActivated: true })
      .where(eq(usersTable.clerkId, clerkId))
      .returning();
    return user;
  }

  async getMonthlyScans(clerkId: string, period: string): Promise<number> {
    const [row] = await db
      .select()
      .from(scanUsageTable)
      .where(
        sql`${scanUsageTable.clerkId} = ${clerkId} AND ${scanUsageTable.period} = ${period}`,
      );
    return row?.count ?? 0;
  }

  async incrementMonthlyScans(clerkId: string, period: string): Promise<number> {
    const result = await db.execute(sql`
      INSERT INTO scan_usage (clerk_id, period, count)
      VALUES (${clerkId}, ${period}, 1)
      ON CONFLICT ON CONSTRAINT scan_usage_clerk_period
      DO UPDATE SET count = scan_usage.count + 1
      RETURNING count
    `);
    return (result.rows[0] as { count: number }).count;
  }

  async getSubscription(subscriptionId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`,
    );
    return result.rows[0] ?? null;
  }

  async getProductsWithPrices() {
    const result = await db.execute(sql`
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.metadata AS product_metadata,
        pr.id AS price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring,
        pr.active AS price_active,
        pr.metadata AS price_metadata
      FROM stripe.products p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
      ORDER BY pr.unit_amount ASC NULLS LAST
    `);

    const map = new Map<string, any>();
    for (const row of result.rows as any[]) {
      if (!map.has(row.product_id)) {
        let meta: Record<string, string> = {};
        try {
          meta =
            typeof row.product_metadata === "string"
              ? JSON.parse(row.product_metadata)
              : row.product_metadata ?? {};
        } catch {}
        map.set(row.product_id, {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          metadata: meta,
          prices: [],
        });
      }
      if (row.price_id) {
        let recurring: Record<string, unknown> = {};
        try {
          recurring =
            typeof row.recurring === "string"
              ? JSON.parse(row.recurring)
              : row.recurring ?? {};
        } catch {}
        map.get(row.product_id).prices.push({
          id: row.price_id,
          unit_amount: row.unit_amount,
          currency: row.currency,
          recurring,
        });
      }
    }
    return Array.from(map.values());
  }
}

export const stripeStorage = new StripeStorage();

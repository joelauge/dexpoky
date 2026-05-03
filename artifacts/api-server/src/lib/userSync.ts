import { clerkClient } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

const synced = new Set<string>();

export async function ensureUserSynced(clerkId: string): Promise<void> {
  if (synced.has(clerkId)) return;

  try {
    const [existing] = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.clerkId, clerkId));

    if (existing && existing.email) {
      synced.add(clerkId);
      return;
    }

    const clerkUser = await clerkClient.users.getUser(clerkId);
    const email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses?.[0]?.emailAddress ??
      null;

    if (existing) {
      await db
        .update(usersTable)
        .set({ email, updatedAt: new Date() })
        .where(eq(usersTable.clerkId, clerkId));
    } else {
      await db.insert(usersTable).values({ clerkId, email });
    }
    synced.add(clerkId);
  } catch (err) {
    logger.warn({ err, clerkId }, "ensureUserSynced failed");
  }
}

export async function syncAllUsersFromClerk(): Promise<{
  scanned: number;
  upserted: number;
}> {
  let scanned = 0;
  let upserted = 0;
  let offset = 0;
  const limit = 100;
  while (true) {
    const page = await clerkClient.users.getUserList({ limit, offset });
    const users = page.data ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      scanned++;
      const email =
        u.primaryEmailAddress?.emailAddress ??
        u.emailAddresses?.[0]?.emailAddress ??
        null;
      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.clerkId, u.id));
      if (existing) {
        await db
          .update(usersTable)
          .set({ email, updatedAt: new Date() })
          .where(eq(usersTable.clerkId, u.id));
      } else {
        await db.insert(usersTable).values({ clerkId: u.id, email });
      }
      synced.add(u.id);
      upserted++;
    }
    if (users.length < limit) break;
    offset += limit;
  }
  return { scanned, upserted };
}

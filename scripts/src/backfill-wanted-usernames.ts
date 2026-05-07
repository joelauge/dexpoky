/**
 * Back-fill usernames for existing wanted_listings rows whose ownerDisplayName
 * contains a space (old firstName+lastName format stored before the serialisation
 * fix).  For each affected row this script:
 *
 *  1. Looks up the owner's Clerk user record
 *  2. Writes their username if they have one, otherwise writes null
 *
 * Rows whose owners have no username are correctly left as null (anonymous).
 *
 * Note on invite_sends: the task description mentions invite_sends alongside
 * wanted_listings, but invite_sends has no ownerDisplayName column — only a
 * toName field for the external recipient name, which is not a Clerk username
 * and therefore does not need back-filling.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run backfill-wanted-usernames
 *
 * Required env vars:
 *   DATABASE_URL    — PostgreSQL connection string
 *   CLERK_SECRET_KEY — Clerk secret key (sk_live_… or sk_test_…)
 */

import { db, wantedListingsTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
if (!CLERK_SECRET_KEY) {
  throw new Error("CLERK_SECRET_KEY environment variable is required");
}

interface ClerkUser {
  id: string;
  username: string | null;
}

async function getClerkUser(clerkId: string): Promise<ClerkUser | null> {
  const res = await fetch(`https://api.clerk.com/v1/users/${clerkId}`, {
    headers: {
      Authorization: `Bearer ${CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(
      `Clerk API error for user ${clerkId}: ${res.status} ${res.statusText}`,
    );
  }

  const data = (await res.json()) as ClerkUser;
  return data;
}

async function main() {
  console.log("Fetching wanted_listings rows with spaced ownerDisplayName…");

  const rows = await db
    .select({
      id: wantedListingsTable.id,
      ownerClerkId: wantedListingsTable.ownerClerkId,
      ownerDisplayName: wantedListingsTable.ownerDisplayName,
    })
    .from(wantedListingsTable)
    .where(like(wantedListingsTable.ownerDisplayName, "% %"));

  if (rows.length === 0) {
    console.log("No rows to update — nothing to do.");
    return;
  }

  console.log(`Found ${rows.length} row(s) to process.`);

  const clerkCache = new Map<string, string | null>();

  let updated = 0;
  let nulled = 0;
  let errors = 0;

  for (const row of rows) {
    const clerkId = row.ownerClerkId;

    if (!clerkCache.has(clerkId)) {
      try {
        const clerkUser = await getClerkUser(clerkId);
        clerkCache.set(clerkId, clerkUser?.username ?? null);
      } catch (err) {
        console.error(
          `  Error fetching Clerk user ${clerkId} for row ${row.id}:`,
          err,
        );
        errors++;
        continue;
      }
    }

    const username = clerkCache.get(clerkId) ?? null;

    await db
      .update(wantedListingsTable)
      .set({ ownerDisplayName: username })
      .where(eq(wantedListingsTable.id, row.id));

    if (username) {
      console.log(
        `  Row ${row.id}: "${row.ownerDisplayName}" → "${username}" (clerk: ${clerkId})`,
      );
      updated++;
    } else {
      console.log(
        `  Row ${row.id}: "${row.ownerDisplayName}" → null (no username, clerk: ${clerkId})`,
      );
      nulled++;
    }
  }

  console.log(
    `\nDone. updated=${updated} nulled=${nulled} errors=${errors} (total=${rows.length})`,
  );

  await db.$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

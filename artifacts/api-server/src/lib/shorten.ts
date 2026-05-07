import { db, shortLinksTable } from "@workspace/db";

function generateCode(length = 7): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export async function createShortLink(targetUrl: string, clerkId: string | null): Promise<string> {
  let code = generateCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.insert(shortLinksTable).values({ code, targetUrl, clerkId });
      return code;
    } catch {
      code = generateCode();
    }
  }
  throw new Error("Could not generate a unique short code after 5 attempts");
}

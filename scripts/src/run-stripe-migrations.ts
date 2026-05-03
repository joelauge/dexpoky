import { runMigrations } from "stripe-replit-sync";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

console.log("Running Stripe schema migrations...");

await runMigrations({ databaseUrl });

console.log("Stripe schema migrations complete.");

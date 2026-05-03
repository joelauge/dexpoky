import { getUncachableStripeClient } from "./stripeClient.js";

async function seedDexPokyPlans() {
  const stripe = await getUncachableStripeClient();
  console.log("Seeding DexPoky subscription plans...\n");

  // --- Collector Plan ($4/mo) ---
  const existingCollector = await stripe.products.search({
    query: "name:'DexPoky Collector' AND active:'true'",
  });

  if (existingCollector.data.length > 0) {
    console.log("✓ Collector plan already exists:", existingCollector.data[0].id);
  } else {
    const collectorProduct = await stripe.products.create({
      name: "DexPoky Collector",
      description: "250 card scans per month + unlimited marketplace listings",
      metadata: {
        plan_tier: "collector",
        scan_limit: "250",
        sell_sheets: "false",
      },
    });

    const collectorPrice = await stripe.prices.create({
      product: collectorProduct.id,
      unit_amount: 400,
      currency: "usd",
      recurring: { interval: "month" },
    });

    console.log(
      `✓ Created Collector plan: ${collectorProduct.id} / price: ${collectorPrice.id}`,
    );
  }

  // --- Pro Plan ($9/mo) ---
  const existingPro = await stripe.products.search({
    query: "name:'DexPoky Pro' AND active:'true'",
  });

  if (existingPro.data.length > 0) {
    console.log("✓ Pro plan already exists:", existingPro.data[0].id);
  } else {
    const proProduct = await stripe.products.create({
      name: "DexPoky Pro",
      description:
        "Unlimited card scans + unlimited listings + shareable sell sheets",
      metadata: {
        plan_tier: "pro",
        scan_limit: "unlimited",
        sell_sheets: "true",
      },
    });

    const proPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 900,
      currency: "usd",
      recurring: { interval: "month" },
    });

    console.log(
      `✓ Created Pro plan: ${proProduct.id} / price: ${proPrice.id}`,
    );
  }

  console.log("\n✅ DexPoky plans ready!");
  console.log(
    "Stripe webhooks will sync these to your database automatically.",
  );
}

seedDexPokyPlans().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});

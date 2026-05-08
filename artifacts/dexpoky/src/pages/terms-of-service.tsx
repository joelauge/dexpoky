import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Scale } from "lucide-react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default function TermsOfServicePage() {
  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <Scale className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
            <p className="text-sm text-muted-foreground">Last updated: May 2025</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

          {/* Main content */}
          <div className="lg:col-span-3 bg-card border rounded-2xl p-8 space-y-8">

            <Section title="1. Acceptance of Terms">
              <p>
                By accessing or using DexPoky ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
              </p>
              <p>
                DexPoky is a platform for Pokémon TCG collectors to manage their collections, list cards for sale, and trade with other users. We reserve the right to update these terms at any time. Continued use of the Service after changes constitutes acceptance.
              </p>
            </Section>

            <Section title="2. Eligibility">
              <p>
                You must be at least 13 years old to use DexPoky. By creating an account, you represent that you meet this requirement. Users under 18 should have parental consent.
              </p>
            </Section>

            <Section title="3. User Accounts">
              <p>
                You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. You must provide accurate information during registration and keep it up to date.
              </p>
              <p>
                We reserve the right to suspend or terminate accounts that violate these Terms, engage in fraudulent activity, or pose a risk to other users.
              </p>
            </Section>

            <Section title="4. Card Listings and Trading">
              <p>
                When listing a card for sale or trade, you represent that: (a) you own the card and have the right to sell/trade it; (b) the listing accurately describes the card's condition, edition, and any relevant details; (c) the card is authentic and not counterfeit.
              </p>
              <p>
                DexPoky is a peer-to-peer marketplace. We do not buy or sell cards ourselves and are not a party to any transaction between users. All sales and trades are between the buyer and seller directly.
              </p>
              <p>
                Listing counterfeit, stolen, or misrepresented cards is strictly prohibited and may result in account termination and reporting to relevant authorities.
              </p>
            </Section>

            <Section title="5. Payments and Wallet">
              <p>
                DexPoky uses Stripe to process payments. By making a payment, you agree to Stripe's Terms of Service. DexPoky charges a platform fee on transactions as disclosed at the time of purchase.
              </p>
              <p>
                Your DexPoky wallet balance represents funds held on your behalf. Payout requests are processed within 3 business days. We reserve the right to hold funds pending dispute resolution.
              </p>
              <p>
                All sales are final unless the item received materially differs from the listing description, in which case you may open a dispute within 72 hours of delivery.
              </p>
            </Section>

            <Section title="6. Auctions">
              <p>
                Auction bids are binding commitments. If you win an auction, you are obligated to complete the purchase. Sellers may set reserve prices and buy-it-now options. Auction sniping protections (auto-extensions) apply in the final minutes.
              </p>
            </Section>

            <Section title="7. Prohibited Conduct">
              <p>You agree not to:</p>
              <ul className="list-disc list-inside space-y-1 pl-2">
                <li>List counterfeit, stolen, or fraudulently obtained cards</li>
                <li>Manipulate prices, ratings, or auction outcomes</li>
                <li>Harass, threaten, or deceive other users</li>
                <li>Use automated tools to scrape or spam the platform</li>
                <li>Create multiple accounts to circumvent bans or limits</li>
                <li>Conduct transactions off-platform to evade fees after using DexPoky to find a buyer</li>
              </ul>
            </Section>

            <Section title="8. Intellectual Property">
              <p>
                Pokémon and all related names, images, and indicia are trademarks of Nintendo, Game Freak, and Creatures Inc. DexPoky is an independent platform and is not affiliated with or endorsed by these companies.
              </p>
              <p>
                User-submitted content (photos, descriptions) remains your property. By submitting content, you grant DexPoky a non-exclusive, royalty-free licence to display it on the platform.
              </p>
            </Section>

            <Section title="9. Disclaimers and Limitation of Liability">
              <p>
                DexPoky is provided "as is" without warranties of any kind. We do not guarantee the accuracy of card valuations, the authenticity of listed cards, or the reliability of other users.
              </p>
              <p>
                To the maximum extent permitted by law, DexPoky's liability for any claim arising from use of the Service is limited to the amount you paid in platform fees in the preceding 3 months.
              </p>
            </Section>

            <Section title="10. Governing Law">
              <p>
                These Terms are governed by the laws of the jurisdiction in which DexPoky operates, without regard to conflict of law provisions.
              </p>
            </Section>

            <Section title="11. Contact">
              <p>
                Questions about these Terms? Email us at{" "}
                <a href="mailto:support@dexpoky.com" className="text-violet-600 hover:underline">
                  support@dexpoky.com
                </a>{" "}
                or visit our{" "}
                <Link href="/support" className="text-violet-600 hover:underline">
                  Support page
                </Link>.
              </p>
            </Section>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-muted/40 border rounded-2xl p-5 space-y-3 sticky top-6">
              <p className="font-semibold text-sm">Also read</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/privacy-policy" className="text-violet-600 hover:underline">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/support" className="text-violet-600 hover:underline">
                    Support
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { ShieldCheck } from "lucide-react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">Last updated: May 2025</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

          {/* Main content */}
          <div className="lg:col-span-3 bg-card border rounded-2xl p-8 space-y-8">

            <Section title="1. Introduction">
              <p>
                DexPoky ("we", "us", or "our") is committed to protecting your privacy. This policy explains what information we collect, how we use it, and the choices you have.
              </p>
              <p>
                By using DexPoky, you agree to the collection and use of information in accordance with this policy.
              </p>
            </Section>

            <Section title="2. Information We Collect">
              <p><strong>Account information</strong> — When you sign up via Clerk (Google OAuth or email/password), we receive your name, email address, and a unique user ID. We store your username, bio, and avatar URL.</p>
              <p><strong>Card and collection data</strong> — Photos you upload of your cards, card details, estimated values, and deck configurations.</p>
              <p><strong>Transaction data</strong> — Listings you create, bids you place, trades you initiate or accept, and payment records processed through Stripe.</p>
              <p><strong>Communication data</strong> — Messages sent between users within DexPoky's trading inbox.</p>
              <p><strong>Phone number</strong> — If you opt in to SMS notifications for DexAgent alerts, we store your phone number (processed via Twilio).</p>
              <p><strong>Usage data</strong> — Server logs including IP addresses, request timestamps, and response times, retained for security and debugging purposes.</p>
            </Section>

            <Section title="3. How We Use Your Information">
              <ul className="list-disc list-inside space-y-1 pl-2">
                <li>To provide, operate, and improve the Service</li>
                <li>To facilitate card sales, trades, and auction settlements between users</li>
                <li>To process payments via Stripe and manage your wallet balance</li>
                <li>To send SMS alerts via Twilio when your DexAgent finds a match (opt-in only)</li>
                <li>To send transactional emails (trade updates, payment confirmations)</li>
                <li>To detect fraud and enforce our Terms of Service</li>
                <li>To respond to support requests</li>
              </ul>
            </Section>

            <Section title="4. Third-Party Services">
              <p>We use the following third-party services, each with their own privacy policies:</p>
              <ul className="list-disc list-inside space-y-1 pl-2">
                <li><strong>Clerk</strong> — Authentication and user management</li>
                <li><strong>Stripe</strong> — Payment processing and crypto onramp</li>
                <li><strong>Twilio</strong> — SMS delivery for DexAgent alerts</li>
                <li><strong>Resend</strong> — Transactional and outreach email delivery</li>
                <li><strong>Replit</strong> — Hosting infrastructure and object storage</li>
                <li><strong>OpenAI</strong> — AI-powered deck building suggestions (card data only, no personal data sent)</li>
              </ul>
              <p>We do not sell your personal information to any third party.</p>
            </Section>

            <Section title="5. Data Storage and Security">
              <p>
                Your data is stored in a PostgreSQL database hosted on Replit's infrastructure. Card images and scan files are stored in Replit Object Storage. We use HTTPS for all data in transit.
              </p>
              <p>
                We retain account data for as long as your account is active. You may request deletion of your account and associated data by contacting us at{" "}
                <a href="mailto:support@dexpoky.com" className="text-violet-600 hover:underline">
                  support@dexpoky.com
                </a>.
              </p>
            </Section>

            <Section title="6. Cookies and Local Storage">
              <p>
                DexPoky uses browser session storage to briefly hold referral codes for attribution. Clerk may set authentication cookies necessary for keeping you signed in. We do not use advertising or analytics cookies.
              </p>
            </Section>

            <Section title="7. Your Rights">
              <p>You have the right to:</p>
              <ul className="list-disc list-inside space-y-1 pl-2">
                <li>Access the personal data we hold about you</li>
                <li>Correct inaccurate data via your Profile settings</li>
                <li>Request deletion of your account and personal data</li>
                <li>Opt out of SMS notifications by removing your phone number from Profile settings</li>
                <li>Export your collection data (contact us to request a data export)</li>
              </ul>
              <p>
                To exercise any of these rights, contact us at{" "}
                <a href="mailto:support@dexpoky.com" className="text-violet-600 hover:underline">
                  support@dexpoky.com
                </a>.
              </p>
            </Section>

            <Section title="8. Children's Privacy">
              <p>
                DexPoky is not directed at children under 13. We do not knowingly collect personal information from children under 13. If we become aware that a child under 13 has provided personal information, we will delete it promptly.
              </p>
            </Section>

            <Section title="9. Changes to This Policy">
              <p>
                We may update this Privacy Policy from time to time. We will notify users of significant changes by posting the new policy on this page with an updated date. Continued use of the Service constitutes acceptance of any changes.
              </p>
            </Section>

            <Section title="10. Contact">
              <p>
                Privacy questions or requests? Email us at{" "}
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
                  <Link href="/terms-of-service" className="text-violet-600 hover:underline">
                    Terms of Service
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

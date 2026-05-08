import { useState } from "react";
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { LifeBuoy, CheckCircle2, ArrowLeft, Mail, MessageSquare } from "lucide-react";
import { useAuthFetch } from "@/lib/use-auth-fetch";

const CATEGORIES = [
  "General Question",
  "Bug Report",
  "Account Issue",
  "Payment / Wallet",
  "Trading Dispute",
  "Card Listing",
  "DexAgent",
  "Other",
];

export default function SupportPage() {
  const { user } = useUser();
  const authFetch = useAuthFetch();

  const [form, setForm] = useState({
    fromName: user?.fullName ?? user?.username ?? "",
    fromEmail: user?.primaryEmailAddress?.emailAddress ?? "",
    category: "",
    subject: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.category) { toast.error("Please select a category"); return; }
    if (form.message.length < 10) { toast.error("Message is too short"); return; }

    setLoading(true);
    try {
      const resp = await authFetch("/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to send");
      }
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
            <LifeBuoy className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Support</h1>
            <p className="text-sm text-muted-foreground">We typically respond within one business day</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left: contact form */}
          <div className="lg:col-span-2">
            {sent ? (
              <div className="bg-card border rounded-2xl p-10 flex flex-col items-center text-center gap-4">
                <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold">Message sent!</h2>
                <p className="text-muted-foreground max-w-sm">
                  We've received your request and will reply to <strong>{form.fromEmail}</strong> shortly.
                </p>
                <Button variant="outline" onClick={() => setSent(false)} className="mt-2">
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-card border rounded-2xl p-6 space-y-5">
                <h2 className="font-semibold text-lg">Contact us</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fromName">Your name</Label>
                    <Input
                      id="fromName"
                      placeholder="Ash Ketchum"
                      value={form.fromName}
                      onChange={e => set("fromName", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fromEmail">Email address</Label>
                    <Input
                      id="fromEmail"
                      type="email"
                      placeholder="ash@example.com"
                      value={form.fromEmail}
                      onChange={e => set("fromEmail", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select onValueChange={v => set("category", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category…" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    placeholder="Briefly describe your issue"
                    value={form.subject}
                    onChange={e => set("subject", e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    rows={6}
                    placeholder="Describe your issue in detail. Include any relevant card names, trade IDs, or screenshots if helpful."
                    value={form.message}
                    onChange={e => set("message", e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">{form.message.length} / 5000 characters</p>
                </div>

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Sending…" : "Send message"}
                </Button>
              </form>
            )}
          </div>

          {/* Right: info cards */}
          <div className="space-y-4">
            <div className="bg-card border rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 text-violet-500" />
                <span className="font-semibold text-sm">Email us directly</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Prefer to email? Reach us at{" "}
                <a href="mailto:support@dexpoky.com" className="text-violet-600 hover:underline font-medium">
                  support@dexpoky.com
                </a>
              </p>
            </div>

            <div className="bg-card border rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                <span className="font-semibold text-sm">Response time</span>
              </div>
              <p className="text-sm text-muted-foreground">
                We aim to respond within <strong>1 business day</strong>. For urgent payment issues, include your transaction ID in the message.
              </p>
            </div>

            <div className="bg-muted/40 border rounded-2xl p-5 space-y-3">
              <p className="font-semibold text-sm">Quick links</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/rules" className="text-violet-600 hover:underline">
                    Pokémon TCG Rulebook
                  </Link>
                </li>
                <li>
                  <Link href="/terms-of-service" className="text-violet-600 hover:underline">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/privacy-policy" className="text-violet-600 hover:underline">
                    Privacy Policy
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

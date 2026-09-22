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
import { LifeBuoy, CheckCircle2, Mail, MessageSquare, ShieldCheck, AlertTriangle } from "lucide-react";
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

interface TriageResult {
  reportId: number;
  category: string;
  urgency: "routine" | "priority" | "urgent";
  missingEvidence: string[];
  reviewState: "needs_evidence" | "queued_for_review" | "priority_human_review";
  facts: string[];
}

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
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [tradeOfferId, setTradeOfferId] = useState("");
  const [evidenceProvided, setEvidenceProvided] = useState({
    paymentReceipt: false,
    tracking: false,
    itemPhotos: false,
    messages: false,
  });
  const isTransactionProblem = form.category === "Trading Dispute" || form.category === "Payment / Wallet";

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.category) { toast.error("Please select a category"); return; }
    if (form.message.length < 10) { toast.error("Message is too short"); return; }
    if (isTransactionProblem && (!user || !Number.isInteger(Number(tradeOfferId)) || Number(tradeOfferId) < 1)) {
      toast.error(user ? "Enter a valid trade ID" : "Sign in to report a transaction problem");
      return;
    }

    setLoading(true);
    try {
      const resp = await authFetch(isTransactionProblem ? "/api/reports" : "/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isTransactionProblem ? {
          tradeOfferId: Number(tradeOfferId),
          declaredCategory: form.category,
          description: `${form.subject}\n\n${form.message}`,
          evidenceProvided,
        } : form),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to send");
      }
      if (isTransactionProblem) {
        setTriageResult(await resp.json() as TriageResult);
      } else {
        setSent(true);
      }
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
            {triageResult ? (
              <div className="bg-card border rounded-2xl p-8 space-y-5">
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Report #{triageResult.reportId} is in private review</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {triageResult.reviewState === "priority_human_review"
                        ? "A human reviewer has been prioritized for this report."
                        : triageResult.reviewState === "needs_evidence"
                          ? "A reviewer may need more evidence before evaluating the report."
                          : "The report is queued for human review."}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/30 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Observed transaction facts</p>
                  <ul className="space-y-1">
                    {triageResult.facts.map((fact) => <li key={fact} className="text-sm">{fact}</li>)}
                  </ul>
                </div>
                {triageResult.missingEvidence.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="font-semibold text-sm flex items-center gap-2 text-amber-900">
                      <AlertTriangle className="h-4 w-4" /> Evidence that may help
                    </p>
                    <ul className="mt-2 list-disc pl-5 text-sm text-amber-900 space-y-1">
                      {triageResult.missingEvidence.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Triage does not decide fault, issue refunds, change ratings, suspend accounts, or make financial decisions.
                </p>
                <Button variant="outline" onClick={() => setTriageResult(null)}>Submit another report</Button>
              </div>
            ) : sent ? (
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

                {isTransactionProblem && (
                  <div className="rounded-xl border bg-violet-50/50 p-4 space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="tradeOfferId">Trade ID</Label>
                      <Input
                        id="tradeOfferId"
                        type="number"
                        min={1}
                        inputMode="numeric"
                        placeholder="Example: 142"
                        value={tradeOfferId}
                        onChange={(event) => setTradeOfferId(event.target.value)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Only participants can report a trade. Your description and evidence choices stay private.
                      </p>
                    </div>
                    <fieldset>
                      <legend className="text-sm font-medium mb-2">Evidence you already have</legend>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {([
                          ["paymentReceipt", "Payment receipt"],
                          ["tracking", "Tracking details"],
                          ["itemPhotos", "Item photos"],
                          ["messages", "Relevant messages"],
                        ] as const).map(([key, label]) => (
                          <label key={key} className="flex items-center gap-2 text-sm rounded-lg border bg-background px-3 py-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={evidenceProvided[key]}
                              onChange={(event) => setEvidenceProvided((current) => ({ ...current, [key]: event.target.checked }))}
                              className="h-4 w-4 rounded border-border"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                )}

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
                  {loading ? "Submitting…" : isTransactionProblem ? "Submit private report" : "Send message"}
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

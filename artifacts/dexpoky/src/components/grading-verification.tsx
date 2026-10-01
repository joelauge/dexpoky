import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Clock,
  ExternalLink,
  Award,
  Users,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthFetch } from "@/lib/use-auth-fetch";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GradingCert {
  id: number;
  cardId: number;
  ownerClerkId: string;
  gradingCompany: string;
  certNumber: string;
  grade: string | null;
  gradeDescription: string | null;
  gradedSubject: string | null;
  gradedYear: string | null;
  gradedSet: string | null;
  gradedCardNumber: string | null;
  populationSame: number | null;
  populationHigher: number | null;
  status: "pending" | "verified" | "rejected";
  rejectionReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const COMPANY_LABELS: Record<string, string> = { psa: "PSA", bgs: "BGS", cgc: "CGC", tag: "TAG" };
const COMPANY_COLORS: Record<string, string> = {
  psa: "bg-blue-100 text-blue-800 border-blue-200",
  bgs: "bg-red-100 text-red-800 border-red-200",
  cgc: "bg-purple-100 text-purple-800 border-purple-200",
  tag: "bg-amber-100 text-amber-800 border-amber-200",
};

function gradeColor(grade: string | null): string {
  if (!grade) return "text-slate-500";
  const n = parseFloat(grade);
  if (n >= 10) return "text-yellow-600";
  if (n >= 9) return "text-green-600";
  if (n >= 8) return "text-blue-600";
  if (n >= 7) return "text-slate-600";
  return "text-red-500";
}

function certExplorerUrl(company: string, certNumber: string): string {
  if (company === "psa") return `https://www.psacard.com/cert/${certNumber}`;
  if (company === "bgs") return `https://www.beckett.com/grading/lookup?cert=${certNumber}`;
  if (company === "cgc") return `https://www.cgccards.com/certlookup/${certNumber}/`;
  if (company === "tag") return `https://tagd.co/${encodeURIComponent(certNumber)}`;
  return "#";
}

// ── Main component ────────────────────────────────────────────────────────────

export function GradingVerification({ cardId }: { cardId: number }) {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();

  const { data: cert, isLoading } = useQuery<GradingCert | null>({
    queryKey: ["grading-cert", cardId],
    queryFn: () =>
      authFetch(`/api/grading/card/${cardId}`)
        .then((r) => (r.status === 404 ? null : r.json())),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      authFetch(`/api/grading/${cert?.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Cert submission removed");
      qc.invalidateQueries({ queryKey: ["grading-cert", cardId] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to remove cert"),
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!cert) {
    return <SubmitCertPanel cardId={cardId} onSubmitted={() => qc.invalidateQueries({ queryKey: ["grading-cert", cardId] })} />;
  }

  return <CertDisplay cert={cert} onDelete={() => deleteMutation.mutate()} deleting={deleteMutation.isPending} />;
}

// ── Submit form ───────────────────────────────────────────────────────────────

function SubmitCertPanel({ cardId, onSubmitted }: { cardId: number; onSubmitted: () => void }) {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState<"psa" | "bgs" | "cgc" | "tag">("psa");
  const [certNumber, setCertNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isTagCertNumberValid = /^\d{8}$/.test(certNumber.trim());

  const mutation = useMutation({
    mutationFn: () =>
      authFetch("/api/grading/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, gradingCompany: company, certNumber: certNumber.trim() }),
      }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "Submission failed");
        return json;
      }),
    onSuccess: (data) => {
      if (data.cert?.status === "rejected") {
        setError(data.error ?? "Cert not found or invalid");
        // Still push the rejected cert into the cache so the block updates without a reload
        if (data.cert) qc.setQueryData(["grading-cert", cardId], data.cert);
        return;
      }
      if (data.verified) {
        toast.success(`${COMPANY_LABELS[company]} cert verified — Grade ${data.cert.grade}!`);
      } else {
        toast.info("Cert submitted for manual review");
      }
      setOpen(false);
      setCertNumber("");
      setError(null);
      // Write the cert directly into the cache for instant UI update (no extra refetch needed)
      if (data.cert) qc.setQueryData(["grading-cert", cardId], data.cert);
      else onSubmitted();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-5">
      <div className="flex items-center gap-2 mb-2">
        <ShieldQuestion className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-semibold text-slate-600">Professional Grading</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Submit a PSA, BGS, CGC, or TAG cert number. PSA certs are checked against its public registry; BGS, CGC, and TAG certs require manual review before their grades are verified.
      </p>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); setError(null); }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Award className="h-4 w-4" />
            Submit Cert Number
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              Submit Grading Cert
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Grading Company</Label>
              <Select value={company} onValueChange={(v) => setCompany(v as "psa" | "bgs" | "cgc" | "tag")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="psa">PSA (auto-verified)</SelectItem>
                  <SelectItem value="bgs">BGS / Beckett (manual review)</SelectItem>
                  <SelectItem value="cgc">CGC (manual review)</SelectItem>
                  <SelectItem value="tag">TAG (manual review)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Cert Number</Label>
              <Input
                placeholder={company === "tag" ? "8-digit cert number" : company === "psa" ? "e.g. 12345678" : company === "bgs" ? "e.g. 0012345678" : "e.g. 1234567890"}
                maxLength={company === "tag" ? 8 : 50}
                inputMode={company === "tag" ? "numeric" : undefined}
                value={certNumber}
                onChange={(e) => { setCertNumber(e.target.value); setError(null); }}
              />
              {company === "tag" && certNumber.trim() !== "" && !isTagCertNumberValid && (
                <p className="text-xs text-red-600">TAG cert numbers must be exactly 8 digits.</p>
              )}
            </div>

            {company === "psa" && (
              <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 rounded-xl px-3 py-2.5">
                <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>PSA certs are verified instantly against the PSA public registry. Make sure your cert number is correct.</span>
              </div>
            )}

            {company === "tag" && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">
                <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Enter TAG's 8-digit cert number. TAG's public DIG report is available from the cert link after submission; its grade is not automatically verified here.</span>
              </div>
            )}

            {company !== "psa" && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">
                <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{COMPANY_LABELS[company]} certs are submitted for manual review. Their grades are not verified until approved.</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded-xl px-3 py-2.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!certNumber.trim() || (company === "tag" && !isTagCertNumberValid) || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />{company === "psa" ? "Verifying…" : "Submitting…"}</>
              ) : "Submit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Cert display ──────────────────────────────────────────────────────────────

function CertDisplay({
  cert,
  onDelete,
  deleting,
}: {
  cert: GradingCert;
  onDelete: () => void;
  deleting: boolean;
}) {
  const companyLabel = COMPANY_LABELS[cert.gradingCompany] ?? cert.gradingCompany.toUpperCase();
  const companyColor = COMPANY_COLORS[cert.gradingCompany] ?? "bg-slate-100 text-slate-700";

  return (
    <div className={cn(
      "rounded-2xl border p-5",
      cert.status === "verified"
        ? "border-green-200 bg-green-50/50"
        : cert.status === "pending"
          ? "border-amber-200 bg-amber-50/50"
          : "border-red-200 bg-red-50/50",
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {cert.status === "verified" ? (
            <ShieldCheck className="h-4 w-4 text-green-600" />
          ) : cert.status === "pending" ? (
            <Clock className="h-4 w-4 text-amber-500" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-red-500" />
          )}
          <span className={cn("text-sm font-semibold",
            cert.status === "verified" ? "text-green-700" :
            cert.status === "pending" ? "text-amber-700" : "text-red-700",
          )}>
            {cert.status === "verified" ? "Verified" : cert.status === "pending" ? "Pending Review" : "Not Verified"}
          </span>
          <Badge className={cn("text-xs border", companyColor)}>
            {companyLabel}
          </Badge>
        </div>

        {cert.status !== "verified" && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-slate-400 hover:text-red-500"
            onClick={onDelete}
            disabled={deleting}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Cert number */}
      <div className="flex items-center gap-2 mb-3">
        <code className="text-xs font-mono text-slate-600 bg-white/80 px-2 py-1 rounded-lg">
          #{cert.certNumber}
        </code>
        <a
          href={certExplorerUrl(cert.gradingCompany, cert.certNumber)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <ExternalLink className="h-3 w-3" />
          {cert.gradingCompany === "tag" ? "View TAG DIG report" : `View on ${companyLabel}`}
        </a>
      </div>

      {/* Verified details */}
      {cert.status === "verified" && cert.grade && (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className={cn("text-4xl font-black tabular-nums", gradeColor(cert.grade))}>
              {cert.grade}
            </span>
            {cert.gradeDescription && (
              <span className="text-sm text-slate-500 font-medium">{cert.gradeDescription}</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600">
            {cert.gradedSubject && (
              <div><span className="text-slate-400">Subject</span><br /><span className="font-medium">{cert.gradedSubject}</span></div>
            )}
            {cert.gradedYear && (
              <div><span className="text-slate-400">Year</span><br /><span className="font-medium">{cert.gradedYear}</span></div>
            )}
            {cert.gradedSet && (
              <div><span className="text-slate-400">Set</span><br /><span className="font-medium">{cert.gradedSet}</span></div>
            )}
            {cert.gradedCardNumber && (
              <div><span className="text-slate-400">Card #</span><br /><span className="font-medium">{cert.gradedCardNumber}</span></div>
            )}
          </div>

          {(cert.populationSame != null || cert.populationHigher != null) && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-1">
              <Users className="h-3.5 w-3.5" />
              <span>
                Pop {cert.populationSame ?? "?"} at this grade
                {cert.populationHigher != null && `, ${cert.populationHigher} higher`}
              </span>
            </div>
          )}

          {cert.verifiedAt && (
            <p className="text-[10px] text-slate-400">
              Verified {new Date(cert.verifiedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}
        </div>
      )}

      {/* Pending state */}
      {cert.status === "pending" && (
        <p className="text-xs text-amber-700">
          {cert.gradingCompany === "tag"
            ? "Your TAG cert is pending manual review. Its grade has not been automatically verified."
            : `Your ${companyLabel} cert is being reviewed. Typically approved within 24 hours.`}
        </p>
      )}

      {/* Rejected state */}
      {cert.status === "rejected" && (
        <p className="text-xs text-red-700">
          {cert.rejectionReason ?? "Cert could not be verified. Please check the number and resubmit."}
        </p>
      )}
    </div>
  );
}

// ── Compact badge for use on card lists ───────────────────────────────────────

export function GradingBadge({
  company,
  grade,
  status,
}: {
  company: string;
  grade: string | null;
  status: string;
}) {
  const label = COMPANY_LABELS[company] ?? company.toUpperCase();
  if (status !== "verified") return null;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border",
      COMPANY_COLORS[company] ?? "bg-slate-100 text-slate-700 border-slate-200",
    )}>
      <ShieldCheck className="h-3 w-3" />
      {label} {grade}
    </span>
  );
}

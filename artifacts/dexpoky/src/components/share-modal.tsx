import { useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Share2, Link2, Copy, Check,
  Mail, MessageCircle, Package, FolderOpen, Layers, ArrowLeft,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type ShareTarget =
  | { type: "card"; id: number; name: string; imageUrl?: string | null; setName?: string | null }
  | { type: "collection"; cardCount?: number }
  | { type: "category"; id: number; name: string; cardCount?: number };

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: ShareTarget;
}

function getShareLink(target: ShareTarget, clerkId?: string | null): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://dexpoky.com";
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const owner = clerkId ? `?owner=${clerkId}` : "";
  if (target.type === "card") return `${origin}${base}/view/card/${target.id}${owner}`;
  if (target.type === "category") return `${origin}${base}/view/category/${target.id}${owner}`;
  return `${origin}${base}/view/collection${owner}`;
}

function getSharePath(target: ShareTarget): string {
  if (target.type === "card") return `/share?card=${target.id}`;
  if (target.type === "category") return `/share?categoryId=${target.id}`;
  return "/share";
}

export function ShareModal({ isOpen, onClose, target }: ShareModalProps) {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"pick" | "link">("pick");
  const [copied, setCopied] = useState(false);
  const { user } = useUser();

  const shareLink = getShareLink(target, user?.id);
  const sharePath = getSharePath(target);

  const targetLabel =
    target.type === "card" ? target.name
    : target.type === "category" ? target.name
    : "My Collection";

  const TargetIcon =
    target.type === "card" ? Package
    : target.type === "category" ? FolderOpen
    : Layers;

  const typeDescription =
    target.type === "card" ? "card"
    : target.type === "category" ? "category"
    : "collection";

  const handleCreateShareLink = () => {
    onClose();
    setMode("pick");
    setLocation(sharePath);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) { onClose(); setMode("pick"); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm w-[calc(100vw-2rem)] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Share2 className="h-4 w-4 text-primary" />
            Share
          </DialogTitle>
        </DialogHeader>

        {/* Entity badge */}
        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-muted/40 rounded-xl border text-sm">
          <TargetIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-semibold truncate">{targetLabel}</span>
          {target.type !== "card" && target.cardCount !== undefined && (
            <Badge variant="secondary" className="ml-auto text-xs shrink-0">{target.cardCount} cards</Badge>
          )}
          {target.type === "card" && (target as { setName?: string | null }).setName && (
            <span className="ml-auto text-xs text-muted-foreground truncate shrink-0">
              {(target as { setName?: string | null }).setName}
            </span>
          )}
        </div>

        {/* ── Mode: pick ── */}
        {mode === "pick" && (
          <div className="space-y-2.5 pt-1">
            {/* PRIMARY: Create share link */}
            <button
              onClick={handleCreateShareLink}
              className="w-full text-left p-4 rounded-2xl border-2 border-violet-200 bg-violet-50/60 hover:bg-violet-50 hover:border-violet-300 transition-all relative"
            >
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center border border-violet-200 shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Create share link</p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-violet-500">Recommended</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground pl-12 leading-snug">
                Set a price, pick shipping, and get a checkout link buyers can pay in seconds.
              </p>
            </button>

            {/* SECONDARY: Quick view link */}
            <button
              onClick={() => setMode("link")}
              className="w-full text-left p-4 rounded-2xl border-2 border-transparent hover:border-border bg-muted/20 hover:bg-muted/40 transition-all"
            >
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200 shrink-0">
                  <Link2 className="h-4 w-4" />
                </div>
                <p className="font-semibold text-foreground">Copy view link</p>
              </div>
              <p className="text-xs text-muted-foreground pl-12 leading-snug">
                Share a quick view-only link for this {typeDescription} — no selling or pricing.
              </p>
            </button>
          </div>
        )}

        {/* ── Mode: quick copy link ── */}
        {mode === "link" && (
          <div className="space-y-4 pt-1 w-full min-w-0">
            <button
              onClick={() => setMode("pick")}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">View link</p>
              <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-3 py-2.5 border overflow-hidden">
                <span className="text-xs text-muted-foreground flex-1 truncate font-mono min-w-0">{shareLink}</span>
                <button
                  onClick={handleCopy}
                  className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all ${
                    copied
                      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                      : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
                  }`}
                >
                  {copied ? <><Check className="h-3 w-3" /> Copied!</> : <><Copy className="h-3 w-3" /> Copy</>}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleCopy}
                className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors"
              >
                <Link2 className="h-4 w-4" />
                <span className="text-xs font-medium">Copy link</span>
              </button>
              <a
                href={`mailto:?subject=Check out ${encodeURIComponent(targetLabel)} on DexPoky&body=${encodeURIComponent(shareLink)}`}
                className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors text-center"
              >
                <Mail className="h-4 w-4" />
                <span className="text-xs font-medium">Email</span>
              </a>
              <a
                href={`sms:?body=${encodeURIComponent(targetLabel + ": " + shareLink)}`}
                className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl bg-green-50 hover:bg-green-100 text-green-600 transition-colors text-center"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="text-xs font-medium">iMessage</span>
              </a>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

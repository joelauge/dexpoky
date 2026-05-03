import { useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Share2, Tag, Link2, Copy, Check,
  Mail, MessageCircle, Package, FolderOpen, Layers, ArrowLeft,
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

function getShareLink(target: ShareTarget): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://dexpoky.com";
  if (target.type === "card") return `${origin}/collection/${target.id}`;
  if (target.type === "category") return `${origin}/collection?category=${target.id}`;
  return `${origin}/collection`;
}

function getSellPath(target: ShareTarget): string {
  if (target.type === "card") return `/sell?card=${target.id}`;
  if (target.type === "category") return `/sell?categoryId=${target.id}`;
  return "/sell";
}

export function ShareModal({ isOpen, onClose, target }: ShareModalProps) {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"pick" | "share">("pick");
  const [copied, setCopied] = useState(false);

  const shareLink = getShareLink(target);
  const sellPath = getSellPath(target);

  const targetLabel =
    target.type === "card" ? target.name
    : target.type === "category" ? target.name
    : "My Collection";

  const TargetIcon =
    target.type === "card" ? Package
    : target.type === "category" ? FolderOpen
    : Layers;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleSell = () => {
    onClose();
    setMode("pick");
    setLocation(sellPath);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) { onClose(); setMode("pick"); }
  };

  const typeDescription =
    target.type === "card" ? "card"
    : target.type === "category" ? "category"
    : "collection";

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
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
            <button
              onClick={() => setMode("share")}
              className="w-full text-left p-4 rounded-2xl border-2 border-transparent hover:border-blue-200 bg-muted/20 hover:bg-blue-50/60 transition-all"
            >
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center border border-blue-200 shrink-0">
                  <Link2 className="h-4 w-4" />
                </div>
                <p className="font-semibold text-foreground">Share a link</p>
              </div>
              <p className="text-xs text-muted-foreground pl-12 leading-snug">
                Let anyone browse this {typeDescription} — no strings attached.
              </p>
            </button>

            <button
              onClick={handleSell}
              className="w-full text-left p-4 rounded-2xl border-2 border-transparent hover:border-violet-200 bg-muted/20 hover:bg-violet-50/60 transition-all"
            >
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center border border-violet-200 shrink-0">
                  <Tag className="h-4 w-4" />
                </div>
                <p className="font-semibold text-foreground">Create selling page</p>
              </div>
              <p className="text-xs text-muted-foreground pl-12 leading-snug">
                Set a price and get a checkout link buyers can pay directly on the marketplace.
              </p>
            </button>
          </div>
        )}

        {/* ── Mode: share link ── */}
        {mode === "share" && (
          <div className="space-y-4 pt-1">
            <button
              onClick={() => setMode("pick")}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Your link</p>
              <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-3 py-2.5 border">
                <span className="text-xs text-muted-foreground flex-1 truncate font-mono">{shareLink}</span>
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

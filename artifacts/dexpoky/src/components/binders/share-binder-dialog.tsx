import { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ShareBinderDialog({ open, onOpenChange, binderName, liveUrl, needsSave, dirty, saving, error, onPublish }: {
  open: boolean; onOpenChange: (o: boolean) => void; binderName: string;
  /** Link of the currently saved public binder, or null if not live. */
  liveUrl: string | null; needsSave: boolean; dirty: boolean; saving: boolean; error: string | null;
  onPublish: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const showLink = !!liveUrl && !needsSave;
  const copy = () => liveUrl && navigator.clipboard.writeText(liveUrl).then(() => toast.success("Link copied."), () => toast.error("Could not copy the link."));
  const nativeShare = () => liveUrl && navigator.share({ title: binderName, url: liveUrl }).catch(() => undefined);

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-share-binder">
        <DialogHeader>
          <DialogTitle>{showLink ? "Your binder is live" : "Publish this binder"}</DialogTitle>
          <DialogDescription>
            {showLink ? "Anyone with this link can open the binder. Send it to collectors, or post it anywhere." : "Publishing saves the full current layout and creates a link anyone can open."}
          </DialogDescription>
        </DialogHeader>
        {showLink ? (
          <div className="space-y-3">
            <Input readOnly value={liveUrl!} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" data-testid="input-share-url" />
            <div className="flex flex-wrap gap-2">
              <Button onClick={copy} className="gap-1.5" data-testid="button-share-copy"><Copy className="h-4 w-4" /> Copy link</Button>
              {canNativeShare && <Button variant="outline" onClick={nativeShare} className="gap-1.5" data-testid="button-share-native"><Share2 className="h-4 w-4" /> Share</Button>}
              <Button variant="outline" onClick={() => window.open(liveUrl!, "_blank", "noopener,noreferrer")} className="gap-1.5" data-testid="button-share-open"><ExternalLink className="h-4 w-4" /> Open in new tab</Button>
            </div>
            <p className="text-xs text-muted-foreground">Visitors see the cards in your pockets, including any additional photos you attached to them. Purchase costs and private notes are never shown.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>Visitors can see every card in your pockets and its additional photos and videos.</li>
              <li>Wishlist pockets let visitors offer you a copy. Owned cards can receive buy and trade offers in your inbox.</li>
              <li>Purchase costs and private notes stay private.</li>
              {dirty && <li className="font-medium">Your unsaved layout changes will be saved now, and become visible.</li>}
            </ul>
            <label className="flex items-start gap-2 text-sm font-medium">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" data-testid="checkbox-share-consent" />
              I understand this binder will be public to anyone with the link.
            </label>
            {error && <p role="alert" className="text-sm text-destructive" data-testid="text-share-error">{error}</p>}
            <Button onClick={onPublish} disabled={!consent || saving} className="w-full" data-testid="button-share-publish">
              {saving ? "Saving" : dirty ? "Save layout and publish" : "Publish binder"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";

const STORAGE_KEY = "dexpoky_hide_welcome";

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setOpen(true);
    }
  }, []);

  function handleClose() {
    if (dontShow) {
      localStorage.setItem(STORAGE_KEY, "1");
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        className="max-w-sm w-full rounded-2xl p-0 overflow-hidden gap-0"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <VisuallyHidden>
          <DialogTitle>Welcome to DexPoky</DialogTitle>
          <DialogDescription>Scan, manage, track and sell your cards anywhere!</DialogDescription>
        </VisuallyHidden>
        <div className="bg-gradient-to-br from-primary/20 via-primary/8 to-background px-8 pt-10 pb-8 text-center flex flex-col items-center">
          <img
            src="/logo.png"
            alt="DexPoky"
            className="h-24 w-24 object-contain mb-5 drop-shadow-xl"
          />
          <h2 className="text-3xl font-extrabold tracking-tight mb-2">
            Welcome to <span className="text-primary">DexPoky</span>!
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-7">
            Scan, manage, track and sell your cards anywhere!
          </p>
          <Link href="/sign-up" onClick={handleClose}>
            <Button size="lg" className="h-11 px-8 font-semibold shadow-md w-full">
              Join Free <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <button
            type="button"
            onClick={handleClose}
            className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
          >
            Browse without signing in
          </button>
        </div>

        <div className="px-8 py-4 border-t bg-muted/30 flex items-center gap-2.5">
          <Checkbox
            id="dont-show"
            checked={dontShow}
            onCheckedChange={(v) => setDontShow(!!v)}
          />
          <Label htmlFor="dont-show" className="text-xs text-muted-foreground cursor-pointer select-none">
            Don't show this again
          </Label>
        </div>
      </DialogContent>
    </Dialog>
  );
}

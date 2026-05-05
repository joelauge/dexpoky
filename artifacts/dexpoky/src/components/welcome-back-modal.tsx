import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap } from "lucide-react";
import { Link } from "wouter";

const SESSION_KEY = "dexpoky_welcomed_back";

interface WelcomeBackModalProps {
  username?: string | null;
}

export function WelcomeBackModal({ username }: WelcomeBackModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem(SESSION_KEY)) {
      const t = setTimeout(() => setOpen(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  function handleClose() {
    sessionStorage.setItem(SESSION_KEY, "1");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm w-full rounded-2xl p-0 overflow-hidden gap-0">
        <VisuallyHidden>
          <DialogTitle>Welcome back to DexPoky</DialogTitle>
          <DialogDescription>Your trading dashboard</DialogDescription>
        </VisuallyHidden>

        <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-background px-8 pt-10 pb-8 text-center flex flex-col items-center">
          <img src="/logo.png" alt="DexPoky" className="h-20 w-20 object-contain mb-4 drop-shadow-xl" />
          <h2 className="text-2xl font-extrabold tracking-tight mb-1">
            {username ? `Welcome back, ${username}!` : "Welcome back!"}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-6">
            Your trading hub is ready. Check your listings, offers, and share links below.
          </p>

          <div className="flex flex-col gap-2 w-full">
            <Link href="/share" onClick={handleClose}>
              <Button size="lg" className="h-11 px-6 font-semibold shadow-md w-full">
                <Zap className="h-4 w-4 mr-2" /> Create a share link
              </Button>
            </Link>
            <button
              type="button"
              onClick={handleClose}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Go to dashboard <ArrowRight className="inline h-3 w-3 ml-0.5" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

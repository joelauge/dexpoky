import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap } from "lucide-react";
import { useLocation } from "wouter";
import { WelcomeFeatureShowcase, type FeatureId } from "@/components/welcome-feature-showcase";

const SESSION_KEY = "dexpoky_welcomed_back";

interface WelcomeBackModalProps {
  username?: string | null;
}

export function WelcomeBackModal({ username }: WelcomeBackModalProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<FeatureId>("scan");
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!sessionStorage.getItem(SESSION_KEY)) {
      const t = setTimeout(() => setOpen(true), 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, []);

  function handleClose() {
    sessionStorage.setItem(SESSION_KEY, "1");
    setOpen(false);
  }

  function go(href: string) {
    handleClose();
    navigate(href);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="flex flex-col max-w-lg w-[calc(100%-1rem)] rounded-2xl p-0 overflow-hidden gap-0 max-h-[94dvh] motion-reduce:!animate-none motion-reduce:!duration-0">
        <div className="flex shrink-0 items-center gap-3 px-5 pt-5 pb-3 pr-12">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="DexPoky" className="h-12 w-12 object-contain" />
          <div className="min-w-0">
            <DialogTitle className="text-xl font-extrabold tracking-tight leading-tight">
              {username ? `Welcome back, ${username}!` : "Welcome back!"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Your trading hub, in five moves.
            </DialogDescription>
          </div>
        </div>

        <WelcomeFeatureShowcase active={active} onChange={setActive} onNavigate={go} />

        <div className="flex shrink-0 flex-col gap-2 px-5 pt-4 pb-5">
            <Button size="lg" onClick={() => go("/share")} className="h-11 px-6 font-semibold shadow-md w-full">
              <Zap className="h-4 w-4 mr-2" /> Create a share link
            </Button>
          <button
            type="button"
            onClick={handleClose}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-10"
          >
            Go to dashboard <ArrowRight className="inline h-3 w-3 ml-0.5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

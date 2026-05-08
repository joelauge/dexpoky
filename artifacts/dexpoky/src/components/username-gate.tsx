import { useState, useEffect } from "react";
import { useUser } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { X, AtSign } from "lucide-react";
import { useLocation } from "wouter";
import { useAuthFetch } from "@/lib/use-auth-fetch";

const DISMISSED_KEY = "dexpoky_username_prompt_dismissed_";

interface UserProfile {
  username: string | null;
}

export function UsernameGate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, user } = useUser();
  const authFetch = useAuthFetch();
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(false);

  const storageKey = user?.id ? DISMISSED_KEY + user.id : null;

  useEffect(() => {
    if (!storageKey) return;
    const wasDismissed = localStorage.getItem(storageKey) === "1";
    setDismissed(wasDismissed);
  }, [storageKey]);

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/users/me"],
    queryFn: () =>
      authFetch("/api/users/me").then(async r => {
        if (!r.ok) throw new Error("auth");
        return r.json();
      }),
    enabled: !!isSignedIn,
    retry: false,
  });

  const handleDismiss = () => {
    if (storageKey) {
      localStorage.setItem(storageKey, "1");
    }
    setDismissed(true);
  };

  const showBanner =
    isLoaded &&
    isSignedIn &&
    !isLoading &&
    profile &&
    !profile.username &&
    !dismissed;

  return (
    <>
      {showBanner && (
        <div className="fixed top-0 inset-x-0 z-[200] flex items-center justify-between gap-3 bg-primary px-4 py-2.5 text-primary-foreground shadow-md">
          <div className="flex items-center gap-2 min-w-0">
            <AtSign className="h-4 w-4 shrink-0" />
            <p className="text-sm font-medium truncate">
              Set a username so others can find you in messages.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs font-semibold"
              onClick={() => setLocation("/profile")}
            >
              Set username
            </Button>
            <button
              aria-label="Dismiss"
              onClick={handleDismiss}
              className="p-0.5 rounded hover:bg-white/20 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <div className={showBanner ? "pt-[44px]" : undefined}>
        {children}
      </div>
    </>
  );
}

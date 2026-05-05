import { useState } from "react";
import { useUser } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, AtSign } from "lucide-react";
import { toast } from "sonner";
import { useAuthFetch } from "@/lib/use-auth-fetch";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

interface UserProfile {
  username: string | null;
}

export function UsernameGate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();
  const authFetch = useAuthFetch();
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

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

  const setUsername = useMutation({
    mutationFn: async (username: string) => {
      const r = await authFetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users/me"] });
      toast.success("Username set! Welcome to DexPoky.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const error = touched && value && !USERNAME_RE.test(value)
    ? "3–20 characters: letters, numbers, underscores only."
    : null;

  const needsUsername =
    isLoaded &&
    isSignedIn &&
    !isLoading &&
    profile &&
    !profile.username;

  if (!needsUsername) return <>{children}</>;

  return (
    <>
      {children}
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
        <div className="w-full max-w-sm bg-card border rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-primary/5 border-b px-6 py-5 flex items-center gap-3">
            <img src="/logo.png" alt="DexPoky" className="h-10 w-10 rounded-full object-cover shrink-0" />
            <div>
              <h2 className="font-bold text-lg text-foreground leading-tight">Choose your username</h2>
              <p className="text-xs text-muted-foreground">You can change it once per month.</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              Pick a unique handle — this is how others will see you on DexPoky.
            </p>

            <div className="space-y-1">
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="e.g. pokemaster99"
                  value={value}
                  maxLength={20}
                  onChange={e => { setValue(e.target.value); setTouched(true); }}
                  onKeyDown={e => { if (e.key === "Enter" && !error && value.length >= 3) setUsername.mutate(value); }}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="none"
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <p className="text-xs text-muted-foreground text-right">{value.length}/20</p>
            </div>

            <Button
              className="w-full"
              disabled={!USERNAME_RE.test(value) || setUsername.isPending}
              onClick={() => setUsername.mutate(value)}
            >
              {setUsername.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Continue
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

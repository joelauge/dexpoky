import { useEffect, useRef } from "react";
import { useClerk } from "@clerk/react";
import { trackEvent, type AnalyticsEventParams } from "@/lib/analytics";

function authMethod(strategy: string | null | undefined): AnalyticsEventParams["method"] {
  switch (strategy) {
    case "password": case "email_code": case "email_link": case "passkey":
      return strategy;
    case "oauth_google": case "google_one_tap": return "google";
    case "oauth_github": return "github";
    case "oauth_apple": return "apple";
    case "oauth_twitter": return "twitter";
    case "oauth_x": return "x";
    default: return "other";
  }
}

/** Observe completed auth attempts, not signed-in renders or route changes. */
export function AuthAnalytics() {
  const { addListener } = useClerk();
  const reported = useRef(new Set<string>());

  useEffect(() => addListener(({ client }) => {
    if (!client || typeof window.gtag !== "function") return;
    const signupStrategy = client.signUp.verifications.externalAccount?.strategy
      ?? (client.signUp.hasPassword ? "password" : client.signUp.verifications.emailAddress?.strategy)
      ?? client.lastAuthenticationStrategy;
    const attempts = [
      { name: "sign_up" as const, attempt: client.signUp, strategy: signupStrategy },
      { name: "login" as const, attempt: client.signIn, strategy: client.signIn.firstFactorVerification.strategy ?? client.lastAuthenticationStrategy },
    ];
    for (const { name, attempt, strategy } of attempts) {
      if (attempt.status !== "complete" || !attempt.createdSessionId) continue;
      // The session ID is used only locally for deduplication, never sent to GA4.
      const key = `dexpoky:ga4:auth:${attempt.createdSessionId}`;
      if (reported.current.has(key)) continue;
      try {
        if (sessionStorage.getItem(key)) continue;
        sessionStorage.setItem(key, "1");
      } catch {
        // Still deduplicate in memory when browser storage is unavailable.
      }
      reported.current.add(key);
      trackEvent(name, { method: authMethod(strategy) });
    }
  }), [addListener]);

  return null;
}

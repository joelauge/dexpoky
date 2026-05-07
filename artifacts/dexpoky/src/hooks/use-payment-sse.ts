import { useEffect } from "react";
import { toast } from "sonner";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";

export const WALLET_BALANCE_QUERY_KEY = ["/api/wallet/balance"] as const;

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function usePaymentSSE() {
  const { isSignedIn } = useUser();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isSignedIn) return;

    let es: EventSource | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (closed) return;

      es = new EventSource("/api/sse/payments");

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            type: string;
            threadId: number;
            amountCents: number;
            netCents: number;
          };
          if (data.type === "payment_received") {
            void queryClient.invalidateQueries({ queryKey: WALLET_BALANCE_QUERY_KEY });
            window.dispatchEvent(new Event("wallet:refresh"));
            toast.success(
              `Payment received — ${formatDollars(data.netCents)} added to your wallet`,
              {
                duration: 8000,
                action: {
                  label: "View trade",
                  onClick: () => {
                    window.location.href = `/inbox?thread=${data.threadId}`;
                  },
                },
              },
            );
          }
        } catch {
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          retryTimer = setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [isSignedIn, queryClient]);
}

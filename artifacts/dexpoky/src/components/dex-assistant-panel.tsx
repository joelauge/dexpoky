import { useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AssistantResponse } from "@workspace/api-client-react";
import { Bot, Send, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuthFetch } from "@/lib/use-auth-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const SUGGESTIONS = [
  "Show duplicate cards in my collection",
  "Find Charizard marketplace listings",
  "Show matches for my Pikachu wanted request",
  "Set my Lugia wanted budget to $45",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function displayTitle(item: Record<string, unknown>): string {
  const nestedCard = isRecord(item.card) ? item.card : null;
  return String(
    item.name ??
      item.title ??
      item.cardName ??
      item.wantedName ??
      nestedCard?.name ??
      (item.cardId ? `Card ${item.cardId}` : "Item"),
  );
}

export function DexAssistantPanel() {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  
  const authFetch = useAuthFetch();
  const qc = useQueryClient();

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const continuationToken =
      response?.kind === "clarification" ? response.continuationToken : undefined;
    setIsLoading(true);
    setError(null);
    setResponse(null);
    
    try {
      const res = await authFetch("/api/assistant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input.trim(), continuationToken }),
      });
      
      const json = await res.json().catch(() => ({}));
      
      if (!res.ok && res.status !== 503) {
        throw new Error(json.error || json.message || "Failed to process request");
      }
      
      if (json.kind) {
        setResponse(json);
      } else if (res.status === 503 && json.message) {
        setResponse({ kind: "clarification", message: json.message });
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
      setInput("");
    }
  };

  const handleConfirm = async () => {
    if (!response?.confirmationToken || isConfirming) return;
    
    setIsConfirming(true);
    setError(null);
    
    try {
      const res = await authFetch("/api/assistant/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationToken: response.confirmationToken }),
      });
      
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || json.message || "Failed to confirm action");
      }
      
      const json = await res.json().catch(() => ({}));
      setResponse({ 
        kind: "completed", 
        summary: json.summary || "Action confirmed successfully.",
        data: json.data
      });
      
      // Invalidate relevant queries
      qc.invalidateQueries({ queryKey: ["dex-agents"] });
      qc.invalidateQueries({ queryKey: ["agent-runs"] });
      qc.invalidateQueries({ queryKey: ["wanted-listings"] });
      qc.invalidateQueries({ queryKey: ["decks"] });
      qc.invalidateQueries({ queryKey: ["agent-external-finds"] });
      qc.invalidateQueries({ queryKey: ["wallet-balance"] });
      
    } catch (err: any) {
      setError(err.message || "Failed to confirm action");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancel = () => {
    setResponse(null);
  };
  
  // Render the bounded action payloads without exposing raw JSON.
  const renderData = (data: unknown): ReactNode => {
    if (!data) return null;
    
    if (Array.isArray(data)) {
      if (data.length === 0) return <p className="text-sm text-slate-500 italic mt-2">No items found.</p>;
      
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          {data.slice(0, 4).map((value, i) => {
            const item = isRecord(value) ? value : { name: String(value) };
            return (
            <div key={i} className="flex flex-col gap-1 p-2.5 rounded-lg bg-white border border-slate-100 shadow-sm text-sm">
              <span className="font-medium text-slate-800 line-clamp-1">{displayTitle(item)}</span>
              {(typeof item.price === "number" || typeof item.price === "string") && (
                <span className="text-emerald-600 font-medium">
                  ${Number(item.price).toFixed(2)}
                </span>
              )}
              {(typeof item.maxPrice === "number" || typeof item.maxPrice === "string") && (
                <span className="text-emerald-600 font-medium">
                  Budget: ${Number(item.maxPrice).toFixed(2)}
                </span>
              )}
              {typeof item.status === "string" && <span className="text-xs text-slate-500 capitalize">{item.status}</span>}
              {typeof item.rarity === "string" && <span className="text-xs text-slate-500 capitalize">{item.rarity}</span>}
            </div>
          )})}
          {data.length > 4 && (
            <div className="flex items-center justify-center p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-500">
              +{data.length - 4} more
            </div>
          )}
        </div>
      );
    }
    
    if (isRecord(data)) {
      const nestedCards = Array.isArray(data.cards) ? data.cards : null;
      const primary = isRecord(data.deck) ? data.deck : data;
      return (
        <>
          <div className="mt-3 p-3 rounded-lg bg-white border border-slate-100 shadow-sm text-sm space-y-1">
          {Object.entries(primary).slice(0, 5).map(([key, val]) => {
            if (val === null || val === undefined || typeof val === 'object') return null;
            return (
              <div key={key} className="flex justify-between gap-4">
                <span className="text-slate-500 capitalize text-xs">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                <span className="font-medium text-slate-800 text-right truncate max-w-[200px]">
                  {String(val)}
                </span>
              </div>
            );
          })}
          </div>
          {nestedCards ? renderData(nestedCards) : null}
        </>
      );
    }
    
    return <p className="mt-3 text-sm font-medium text-slate-800 bg-white p-2.5 rounded-lg border border-slate-100">{String(data)}</p>;
  };

  return (
    <div className="rounded-2xl border border-violet-100 bg-violet-50/40 overflow-hidden shadow-sm">
      <div className="p-5 border-b border-violet-100/50 bg-white/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-6 w-6 rounded-md bg-violet-100 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <h2 className="text-sm font-semibold text-slate-900">DexPoky Assistant</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4 pl-8">
          Execute immediately while changes require confirmation.
        </p>
        
        <form onSubmit={handleSubmit} className="relative flex items-center mb-4 pl-8">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your collection, listings, wanted requests, or decks..."
            className="pr-10 h-10 bg-white border-violet-200 focus-visible:ring-violet-500 shadow-sm"
            disabled={isLoading || isConfirming}
            aria-label="Assistant input"
          />
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            className="absolute right-1 h-8 w-8 text-violet-600 hover:text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            disabled={!input.trim() || isLoading || isConfirming}
            aria-label="Send message"
          >
            {isLoading ? (
              <div className="h-4 w-4 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
        
        <div className="flex flex-wrap gap-2 pl-8">
          {SUGGESTIONS.map((suggestion) => (
            <Badge 
              key={suggestion}
              variant="secondary"
              className="bg-white hover:bg-violet-50 text-slate-600 border border-slate-200 cursor-pointer transition-colors text-[11px] font-normal px-2.5 py-0.5"
              onClick={() => setInput(suggestion)}
            >
              {suggestion}
            </Badge>
          ))}
        </div>
      </div>
      
      {(error || response) && (
        <div className="p-5 bg-white pl-13">
          <div className="pl-8">
            {error && (
              <div className="flex items-start gap-3 text-sm text-red-700 bg-red-50 p-3.5 rounded-xl border border-red-100">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-red-800">Error</p>
                  <p className="text-red-600/90 mt-0.5">{error}</p>
                </div>
              </div>
            )}
            
            {response && !error && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                {response.kind === "clarification" && (
                  <div className="flex items-start gap-3 bg-amber-50 text-amber-900 p-4 rounded-xl border border-amber-200 shadow-sm">
                    <Bot className="h-5 w-5 mt-0.5 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-sm font-semibold mb-1">Clarification Needed</p>
                      <p className="text-sm text-amber-800">{response.message}</p>
                    </div>
                  </div>
                )}
                
                {response.kind === "result" && (
                  <div className="flex items-start gap-3 bg-slate-50 text-slate-800 p-4 rounded-xl border border-slate-200 shadow-sm">
                    <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-emerald-600" />
                    <div className="w-full min-w-0">
                      {response.summary && <p className="text-sm font-medium text-slate-900">{response.summary}</p>}
                      {renderData(response.data)}
                    </div>
                  </div>
                )}
                
                {response.kind === "confirmation" && (
                  <div className="flex items-start gap-3 bg-violet-50 text-violet-900 p-4 rounded-xl border border-violet-200 shadow-sm">
                    <Bot className="h-5 w-5 mt-0.5 shrink-0 text-violet-600" />
                    <div className="w-full min-w-0">
                      <p className="text-sm font-semibold mb-1 text-violet-900">Action Required</p>
                      {response.summary && <p className="text-sm text-violet-800 mb-3">{response.summary}</p>}
                      {renderData(response.data)}
                      
                      <div className="flex gap-2 mt-4 pt-3 border-t border-violet-200/50">
                        <Button
                          size="sm"
                          onClick={handleConfirm}
                          disabled={isConfirming}
                          className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm h-8 px-4 text-xs font-medium"
                        >
                          {isConfirming ? "Confirming..." : "Confirm Action"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancel}
                          disabled={isConfirming}
                          className="border-violet-200 text-violet-700 hover:bg-violet-100 bg-white h-8 px-4 text-xs font-medium"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                
                {response.kind === "completed" && (
                  <div className="flex items-start gap-3 bg-emerald-50 text-emerald-900 p-4 rounded-xl border border-emerald-200 shadow-sm">
                    <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-emerald-600" />
                    <div className="w-full min-w-0">
                      <p className="text-sm font-semibold text-emerald-900 mb-1">Success</p>
                      {response.summary && <p className="text-sm text-emerald-800">{response.summary}</p>}
                      {renderData(response.data)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import {
  useListThreads,
  useListThreadMessages,
  useSendMessage,
  useMarkThreadRead,
} from "@workspace/api-client-react";
import type { DmThreadSummary, DmMessage } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare, Send, ArrowLeft, User, Heart,
  Video, DollarSign, CheckCircle2, XCircle, RefreshCw,
  Store, Shield, Gem, Calendar, ChevronDown, ChevronUp, Camera,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Trade offer types ──────────────────────────────────────────────────────

type OfferStatus = "pending" | "countered" | "accepted" | "declined" | "cancelled";
type ExchangeMethod = "store" | "psa_vault" | "courtyard_nft";

interface TradeOffer {
  id: number;
  threadId: number;
  sellerClerkId: string;
  sellerImages: string[] | null;
  askingPrice: number | null;
  offerAmount: number | null;
  status: OfferStatus;
  exchangeMethod: ExchangeMethod | null;
  videoCallScheduledAt: string | null;
  videoCallNotes: string | null;
  role: "buyer" | "seller";
}

// ── DealCard ───────────────────────────────────────────────────────────────

const EXCHANGE_OPTIONS: { id: ExchangeMethod; label: string; desc: string; Icon: React.ElementType; color: string }[] = [
  { id: "store",        label: "Meet at Store",          desc: "Bring your cards to a local card shop",          Icon: Store,  color: "bg-blue-50 border-blue-200 text-blue-700" },
  { id: "psa_vault",    label: "Exchange via PSA Vault",  desc: "Secure transfer through PSA's vault service",    Icon: Shield, color: "bg-purple-50 border-purple-200 text-purple-700" },
  { id: "courtyard_nft",label: "Exchange via Courtyard",  desc: "Authenticated transfer through Courtyard NFT",   Icon: Gem,    color: "bg-rose-50 border-rose-200 text-rose-700" },
];

function DealCard({ thread, currentUserId }: { thread: DmThreadSummary; currentUserId: string }) {
  const [offer, setOffer] = useState<TradeOffer | null | undefined>(undefined);
  const [expanded, setExpanded] = useState(true);
  const [counterInput, setCounterInput] = useState("");
  const [showCounter, setShowCounter] = useState(false);
  const [videoDateInput, setVideoDateInput] = useState("");
  const [showVideoForm, setShowVideoForm] = useState(false);
  const [updating, setUpdating] = useState(false);

  const loadOffer = useCallback(async () => {
    try {
      const res = await fetch(`/api/threads/${thread.id}/offer`);
      if (!res.ok) return;
      const data = await res.json();
      setOffer(data);
    } catch {
      setOffer(null);
    }
  }, [thread.id]);

  useEffect(() => {
    loadOffer();
    const interval = setInterval(loadOffer, 8000);
    return () => clearInterval(interval);
  }, [loadOffer]);

  const doAction = async (body: object) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/threads/${thread.id}/offer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      const updated = await res.json();
      setOffer(updated);
      setShowCounter(false);
      setShowVideoForm(false);
      setCounterInput("");
      setVideoDateInput("");
    } catch {
      toast.error("Action failed — please try again");
    } finally {
      setUpdating(false);
    }
  };

  if (offer === undefined) return null;
  if (offer === null) return null;

  const isBuyer = offer.role === "buyer";
  const displayPrice = offer.offerAmount ?? offer.askingPrice;

  const statusConfig: Record<OfferStatus, { label: string; color: string }> = {
    pending:   { label: "Offer pending",   color: "bg-amber-100 text-amber-700 border-amber-200" },
    countered: { label: "Counter made",    color: "bg-blue-100 text-blue-700 border-blue-200" },
    accepted:  { label: "Deal accepted!",  color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    declined:  { label: "Deal declined",   color: "bg-red-100 text-red-700 border-red-200" },
    cancelled: { label: "Cancelled",       color: "bg-muted text-muted-foreground border-border" },
  };

  const { label: statusLabel, color: statusColor } = statusConfig[offer.status];

  return (
    <div className="border-b bg-gradient-to-b from-card to-card/50">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Deal</span>
          <Badge className={cn("text-[10px] px-2 py-0.5 border", statusColor)}>{statusLabel}</Badge>
          {offer.videoCallScheduledAt && (
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-blue-200 text-blue-600 bg-blue-50">
              <Video className="h-2.5 w-2.5 mr-1" />
              {format(new Date(offer.videoCallScheduledAt), "MMM d, h:mm a")}
            </Badge>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">

          {/* Seller photos */}
          {offer.sellerImages && offer.sellerImages.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {offer.sellerImages.map((path, i) => (
                <img
                  key={i}
                  src={`/api/storage${path}`}
                  alt=""
                  className="w-16 rounded-lg border shrink-0 object-cover"
                  style={{ height: 80 }}
                />
              ))}
            </div>
          )}

          {/* Price summary */}
          <div className="flex items-center gap-3 flex-wrap">
            {offer.askingPrice != null && (
              <div className="flex items-center gap-1 text-sm">
                <span className="text-muted-foreground text-xs">Asking:</span>
                <span className={cn("font-bold", offer.offerAmount != null && "line-through text-muted-foreground text-xs")}>
                  ${offer.askingPrice.toFixed(2)}
                </span>
              </div>
            )}
            {offer.offerAmount != null && (
              <div className="flex items-center gap-1 text-sm">
                <span className="text-muted-foreground text-xs">{isBuyer ? "Your offer:" : "Buyer offer:"}</span>
                <span className="font-bold text-primary">${offer.offerAmount.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Exchange method already chosen */}
          {offer.exchangeMethod && (
            <div className="flex items-center gap-2 text-sm bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="font-medium text-emerald-700">
                {EXCHANGE_OPTIONS.find(o => o.id === offer.exchangeMethod)?.label ?? offer.exchangeMethod}
              </span>
            </div>
          )}

          {/* ── Actions by state ── */}

          {/* Declined / cancelled — no actions */}
          {(offer.status === "declined" || offer.status === "cancelled") && (
            <p className="text-xs text-muted-foreground text-center py-1">
              This deal is no longer active.
            </p>
          )}

          {/* Pending — buyer actions */}
          {offer.status === "pending" && isBuyer && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white" disabled={updating}
                  onClick={() => doAction({ action: "accept" })}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  Accept ${offer.askingPrice?.toFixed(2) ?? "—"}
                </Button>
                <Button size="sm" variant="outline" className="flex-1" disabled={updating}
                  onClick={() => setShowCounter(v => !v)}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Counter
                </Button>
                <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50" disabled={updating}
                  onClick={() => doAction({ action: "decline" })}>
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </div>
              {showCounter && (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input type="number" step="0.01" min="0" value={counterInput}
                      onChange={e => setCounterInput(e.target.value)}
                      className="pl-7 h-9 text-sm" placeholder="Your offer" />
                  </div>
                  <Button size="sm" disabled={!counterInput || updating}
                    onClick={() => doAction({ action: "counter", amount: parseFloat(counterInput) })}>
                    Send counter
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Pending — seller view */}
          {offer.status === "pending" && !isBuyer && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 text-center">
              Waiting for buyer to respond to your ${offer.askingPrice?.toFixed(2) ?? "—"} asking price
            </p>
          )}

          {/* Countered — seller actions */}
          {offer.status === "countered" && !isBuyer && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Buyer countered at <span className="font-bold text-foreground">${offer.offerAmount?.toFixed(2)}</span></p>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white" disabled={updating}
                  onClick={() => doAction({ action: "accept" })}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  Accept ${offer.offerAmount?.toFixed(2)}
                </Button>
                <Button size="sm" variant="outline" className="flex-1" disabled={updating}
                  onClick={() => setShowCounter(v => !v)}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Counter
                </Button>
                <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50" disabled={updating}
                  onClick={() => doAction({ action: "decline" })}>
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </div>
              {showCounter && (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input type="number" step="0.01" min="0" value={counterInput}
                      onChange={e => setCounterInput(e.target.value)}
                      className="pl-7 h-9 text-sm" placeholder="Your counter" />
                  </div>
                  <Button size="sm" disabled={!counterInput || updating}
                    onClick={() => doAction({ action: "counter", amount: parseFloat(counterInput) })}>
                    Send counter
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Countered — buyer waiting */}
          {offer.status === "countered" && isBuyer && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 text-center">
              Counter sent — waiting for seller to respond
            </p>
          )}

          {/* Accepted — choose exchange method */}
          {offer.status === "accepted" && !offer.exchangeMethod && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">How will you exchange?</p>
              {EXCHANGE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={updating}
                  onClick={() => doAction({ action: "set_exchange", method: opt.id })}
                  className={cn(
                    "w-full text-left flex items-start gap-3 p-3 rounded-xl border-2 transition-all",
                    "hover:shadow-sm",
                    opt.color,
                  )}
                >
                  <opt.Icon className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">{opt.label}</p>
                    <p className="text-[11px] opacity-80 mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Schedule video — available for pending/countered */}
          {(offer.status === "pending" || offer.status === "countered") && (
            <div>
              <button
                type="button"
                onClick={() => setShowVideoForm(v => !v)}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Video className="h-3.5 w-3.5" />
                {offer.videoCallScheduledAt ? "Reschedule video call" : "Schedule a video call"}
              </button>
              {showVideoForm && (
                <div className="flex gap-2 mt-2">
                  <Input
                    type="datetime-local"
                    value={videoDateInput}
                    onChange={e => setVideoDateInput(e.target.value)}
                    className="flex-1 h-9 text-sm"
                  />
                  <Button size="sm" disabled={!videoDateInput || updating}
                    onClick={() => doAction({ action: "schedule_video", scheduledAt: new Date(videoDateInput).toISOString() })}>
                    <Calendar className="h-3.5 w-3.5 mr-1" />
                    Set
                  </Button>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ── Thread list item ───────────────────────────────────────────────────────

function ThreadListItem({
  thread,
  isActive,
  onClick,
}: {
  thread: DmThreadSummary;
  isActive: boolean;
  onClick: () => void;
}) {
  const hasUnread = thread.unreadCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/50 flex items-start gap-3",
        isActive && "bg-primary/5 border-l-2 border-l-primary",
      )}
    >
      <div className="shrink-0 mt-0.5">
        {thread.otherUserImageUrl ? (
          <img
            src={thread.otherUserImageUrl}
            alt={thread.otherUserDisplayName ?? ""}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={cn("text-sm truncate", hasUnread ? "font-bold" : "font-medium")}>
            {thread.otherUserDisplayName ?? "Unknown user"}
          </span>
          {thread.lastMessage && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatDistanceToNow(new Date(thread.lastMessage.createdAt), { addSuffix: true })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mb-1">
          <Heart className="h-3 w-3 text-rose-400 fill-rose-200 shrink-0" />
          <span className="text-xs text-muted-foreground truncate">
            {thread.wantedCardName ?? "Wanted card"}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] px-1 py-0 h-4 border-0 ml-auto shrink-0",
              thread.role === "buyer"
                ? "bg-blue-50 text-blue-600"
                : "bg-emerald-50 text-emerald-600",
            )}
          >
            {thread.role === "buyer" ? "Buyer" : "Seller"}
          </Badge>
        </div>
        {thread.lastMessage && (
          <p className={cn("text-xs truncate", hasUnread ? "text-foreground font-medium" : "text-muted-foreground")}>
            {thread.lastMessage.content}
          </p>
        )}
        {!thread.lastMessage && (
          <p className="text-xs text-muted-foreground italic">No messages yet</p>
        )}
      </div>
      {hasUnread && (
        <span className="shrink-0 w-2 h-2 rounded-full bg-primary mt-2" />
      )}
    </button>
  );
}

// ── ChatPane ───────────────────────────────────────────────────────────────

function ChatPane({
  thread,
  currentUserId,
}: {
  thread: DmThreadSummary;
  currentUserId: string;
}) {
  const [text, setText] = useState("");
  const qc = useQueryClient();

  const { data: messages, isLoading } = useListThreadMessages(thread.id, {
    query: {
      queryKey: ["/api/threads", thread.id, "messages"],
      refetchInterval: 5000,
    },
  });

  const markRead = useMarkThreadRead();
  const sendMsg = useSendMessage({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/threads", thread.id, "messages"] });
        qc.invalidateQueries({ queryKey: ["/api/threads"] });
        setText("");
      },
      onError: () => toast.error("Failed to send message"),
    },
  });

  const handleSend = () => {
    const content = text.trim();
    if (!content) return;
    sendMsg.mutate({ threadId: thread.id, data: { content } });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (messages && messages.length > 0 && thread.unreadCount > 0) {
      markRead.mutate({ threadId: thread.id });
    }
  }, [messages, thread.id, thread.unreadCount]);

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="border-b px-4 py-3 flex items-center gap-3 bg-card shrink-0">
        <div>
          {thread.otherUserImageUrl ? (
            <img
              src={thread.otherUserImageUrl}
              alt={thread.otherUserDisplayName ?? ""}
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm">{thread.otherUserDisplayName ?? "Unknown user"}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Heart className="h-3 w-3 text-rose-400 fill-rose-100" />
            {thread.wantedCardName ?? "Wanted card"}
          </p>
        </div>
      </div>

      {/* Trade deal card pinned below header */}
      <DealCard thread={thread} currentUserId={currentUserId} />

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-3/4 rounded-2xl" />
            ))}
          </div>
        ) : messages && messages.length > 0 ? (
          <div className="space-y-3">
            {(messages as DmMessage[]).map((msg) => {
              const isMe = msg.senderClerkId === currentUserId;
              return (
                <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[75%] px-3.5 py-2 rounded-2xl text-sm",
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm",
                    )}
                  >
                    <p>{msg.content}</p>
                    <p
                      className={cn(
                        "text-[10px] mt-0.5",
                        isMe ? "text-primary-foreground/70 text-right" : "text-muted-foreground",
                      )}
                    >
                      {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">No messages yet</p>
          </div>
        )}
      </ScrollArea>

      {/* Message input */}
      <div className="border-t px-4 py-3 flex gap-2 shrink-0 bg-card">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          className="flex-1"
          disabled={sendMsg.isPending}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!text.trim() || sendMsg.isPending}
          className="shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── InboxPage ──────────────────────────────────────────────────────────────

export default function InboxPage() {
  const { user } = useUser();
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [showChat, setShowChat] = useState(false);

  const { data: threads, isLoading } = useListThreads({
    query: {
      queryKey: ["/api/threads"],
      refetchInterval: 15000,
    },
  });

  const activeThread = threads?.find((t) => t.id === activeThreadId) ?? null;

  const handleSelectThread = (threadId: number) => {
    setActiveThreadId(threadId);
    setShowChat(true);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <MessageSquare className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
          {threads && threads.filter((t) => t.unreadCount > 0).length > 0 && (
            <Badge className="bg-primary text-primary-foreground">
              {threads.filter((t) => t.unreadCount > 0).length} unread
            </Badge>
          )}
        </div>

        <div className="border rounded-xl bg-card overflow-hidden" style={{ height: "calc(100vh - 200px)", minHeight: 480 }}>
          <div className="grid h-full" style={{ gridTemplateColumns: showChat && activeThread ? "320px 1fr" : "1fr" }}>
            <div className={cn("border-r flex flex-col", showChat && activeThread ? "hidden sm:flex" : "flex")}>
              <div className="px-4 py-3 border-b bg-muted/30">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Conversations</p>
              </div>
              <ScrollArea className="flex-1">
                {isLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 rounded-xl" />
                    ))}
                  </div>
                ) : threads && threads.length > 0 ? (
                  (threads as DmThreadSummary[]).map((thread) => (
                    <ThreadListItem
                      key={thread.id}
                      thread={thread}
                      isActive={thread.id === activeThreadId}
                      onClick={() => handleSelectThread(thread.id)}
                    />
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                    <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <h3 className="font-semibold mb-1">No conversations yet</h3>
                    <p className="text-sm text-muted-foreground">
                      When a seller contacts you about a wanted card (or you contact a buyer), the conversation appears here.
                    </p>
                  </div>
                )}
              </ScrollArea>
            </div>

            {showChat && activeThread && user ? (
              <div className="flex flex-col h-full min-h-0">
                <div className="sm:hidden border-b px-3 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowChat(false)}
                    className="flex items-center gap-1.5"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                </div>
                <div className="flex-1 min-h-0">
                  <ChatPane thread={activeThread} currentUserId={user.id} />
                </div>
              </div>
            ) : !showChat || !activeThread ? (
              <div className="hidden sm:flex flex-col items-center justify-center text-center px-8">
                <MessageSquare className="h-14 w-14 text-muted-foreground/20 mb-4" />
                <h3 className="font-semibold mb-2">Select a conversation</h3>
                <p className="text-sm text-muted-foreground">
                  Choose a thread from the left to start chatting
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Layout>
  );
}

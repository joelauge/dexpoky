import { useState, useEffect } from "react";
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
import { MessageSquare, Send, ArrowLeft, User, Heart } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

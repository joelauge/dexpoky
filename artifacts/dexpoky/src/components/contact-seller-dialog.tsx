import { useState } from "react";
import { useStartThread } from "@workspace/api-client-react";
import type { WantedListing } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send, Heart } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

interface ContactSellerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: WantedListing;
}

export function ContactSellerDialog({ open, onOpenChange, item }: ContactSellerDialogProps) {
  const [message, setMessage] = useState(
    `Hi ${item.ownerDisplayName ?? "there"},\n\nI saw your "Looking For" post for ${item.name}${item.setName ? ` (${item.setName})` : ""} and I might have one available!\n\nLet me know if you're still interested.`
  );
  const [threadId, setThreadId] = useState<number | null>(null);
  const qc = useQueryClient();

  const startThread = useStartThread({
    mutation: {
      onSuccess: (data) => {
        setThreadId(data.id);
        qc.invalidateQueries({ queryKey: ["/api/threads"] });
        toast.success("Message sent!");
      },
      onError: () => toast.error("Failed to send message"),
    },
  });

  const handleSend = () => {
    const content = message.trim();
    if (!content) return;
    startThread.mutate({
      id: item.id,
      data: { initialMessage: content },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setThreadId(null);
    setMessage(
      `Hi ${item.ownerDisplayName ?? "there"},\n\nI saw your "Looking For" post for ${item.name}${item.setName ? ` (${item.setName})` : ""} and I might have one available!\n\nLet me know if you're still interested.`
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Contact Buyer
          </DialogTitle>
          <DialogDescription>
            Send a message to {item.ownerDisplayName ?? "the buyer"} about{" "}
            <span className="font-medium">{item.name}</span>
          </DialogDescription>
        </DialogHeader>

        {threadId ? (
          <div className="text-center py-4 space-y-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <MessageSquare className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-green-700">Message sent!</p>
              <p className="text-sm text-muted-foreground mt-1">
                {item.ownerDisplayName ?? "The buyer"} will be able to reply in the Inbox.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Close
              </Button>
              <Link href="/inbox" onClick={handleClose}>
                <Button className="flex-1">
                  Go to Inbox
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-rose-50 rounded-xl px-3 py-2.5 border border-rose-100">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="w-10 h-12 object-contain rounded shrink-0" />
              ) : (
                <div className="w-10 h-12 rounded bg-rose-100 shrink-0 flex items-center justify-center">
                  <Heart className="h-4 w-4 text-rose-300" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{item.name}</p>
                {item.setName && <p className="text-xs text-muted-foreground truncate">{item.setName}</p>}
                {item.maxPrice != null && (
                  <p className="text-xs font-bold text-rose-600">Up to ${Number(item.maxPrice).toFixed(2)}</p>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Your message</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="resize-none"
                placeholder="Write your message…"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={!message.trim() || startThread.isPending}
                className="flex-1"
              >
                <Send className="h-4 w-4 mr-2" />
                {startThread.isPending ? "Sending…" : "Send Message"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

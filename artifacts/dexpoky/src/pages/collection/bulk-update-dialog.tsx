import { useState } from "react";
import { 
  useBulkUpdateCards, 
  useListCollections,
  getListCollectionsQueryKey,
  CardCondition
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatLabel } from "@/lib/constants";

interface BulkUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: number[];
  onSuccess: () => void;
}

export function BulkUpdateDialog({ open, onOpenChange, selectedIds, onSuccess }: BulkUpdateDialogProps) {
  const [collectionId, setCollectionId] = useState<string>("no-change");
  const [condition, setCondition] = useState<string>("no-change");
  const [estimatedValue, setEstimatedValue] = useState<string>("");

  const queryClient = useQueryClient();
  const { data: collections } = useListCollections({
    query: { enabled: open, queryKey: getListCollectionsQueryKey() }
  });

  const bulkUpdate = useBulkUpdateCards();

  const handleSave = () => {
    const data: any = { cardIds: selectedIds };
    
    if (collectionId !== "no-change") {
      data.collectionId = collectionId === "none" ? null : Number(collectionId);
    }
    
    if (condition !== "no-change") {
      data.condition = condition;
    }
    
    if (estimatedValue.trim() !== "") {
      const val = parseFloat(estimatedValue);
      if (!isNaN(val)) {
        data.estimatedValue = val;
      }
    }

    if (Object.keys(data).length <= 1) {
      toast.error("No changes specified");
      return;
    }

    bulkUpdate.mutate({ data }, {
      onSuccess: () => {
        toast.success(`Updated ${selectedIds.length} cards`);
        queryClient.invalidateQueries({ queryKey: ['/api/cards'] });
        queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey() });
        onSuccess();
        onOpenChange(false);
      },
      onError: () => toast.error("Failed to update cards")
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update {selectedIds.length} Cards</DialogTitle>
          <DialogDescription>
            Apply changes to all selected cards at once. Leave fields blank to keep current values.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Move to Collection</label>
            <Select value={collectionId} onValueChange={setCollectionId}>
              <SelectTrigger>
                <SelectValue placeholder="No change" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no-change">No change</SelectItem>
                <SelectItem value="none">None (Remove from collection)</SelectItem>
                {collections?.map(c => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Change Condition</label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger>
                <SelectValue placeholder="No change" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no-change">No change</SelectItem>
                {Object.values(CardCondition).map(c => (
                  <SelectItem key={c} value={c}>{formatLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Set Estimated Value ($)</label>
            <Input 
              type="number" 
              step="0.01"
              min="0"
              placeholder="Leave empty for no change" 
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bulkUpdate.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={bulkUpdate.isPending}>
            {bulkUpdate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
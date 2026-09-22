import { useState } from "react";
import { 
  useListCollections, 
  useCreateCollection, 
  useUpdateCollection, 
  useDeleteCollection,
  getListCollectionsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderPlus, Pencil, Trash2, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";

export function ManageCollectionsDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [newName, setNewName] = useState("");
  const [editName, setEditName] = useState("");

  const queryClient = useQueryClient();
  const { data: collections, isLoading } = useListCollections({
    query: { enabled: open, queryKey: getListCollectionsQueryKey() }
  });

  const createCollection = useCreateCollection();
  const updateCollection = useUpdateCollection();
  const deleteCollection = useDeleteCollection();

  const handleCreate = () => {
    if (!newName.trim()) return;
    createCollection.mutate({ data: { name: newName.trim() } }, {
      onSuccess: () => {
        toast.success("Collection created");
        setNewName("");
        setCreating(false);
        queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey() });
      },
      onError: () => {
        toast.error("Failed to create collection");
      }
    });
  };

  const handleUpdate = (id: number) => {
    if (!editName.trim()) return;
    updateCollection.mutate({ id, data: { name: editName.trim() } }, {
      onSuccess: () => {
        toast.success("Collection updated");
        setEditingId(null);
        setEditName("");
        queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey() });
      },
      onError: () => toast.error("Failed to update collection")
    });
  };

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Are you sure you want to delete collection "${name}"? Cards will not be deleted.`)) {
      deleteCollection.mutate({ id }, {
        onSuccess: () => {
          toast.success("Collection deleted");
          queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ['/api/cards'] });
        },
        onError: () => toast.error("Failed to delete collection")
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Collections</DialogTitle>
          <DialogDescription>
            Organize your cards into custom binders and sets.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
          {creating ? (
            <div className="flex items-center gap-2 bg-muted/50 p-3 rounded-lg border">
              <Input
                autoFocus
                placeholder="Collection name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                disabled={createCollection.isPending}
              />
              <Button size="icon" variant="ghost" onClick={() => setCreating(false)} disabled={createCollection.isPending}>
                <X className="h-4 w-4" />
              </Button>
              <Button size="icon" onClick={handleCreate} disabled={!newName.trim() || createCollection.isPending}>
                {createCollection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full border-dashed" onClick={() => setCreating(true)}>
              <FolderPlus className="h-4 w-4 mr-2" /> New Collection
            </Button>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : collections?.length === 0 && !creating ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              No collections yet.
            </div>
          ) : (
            <div className="space-y-2 mt-4">
              {collections?.map(collection => (
                <div key={collection.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:border-primary/30 transition-colors">
                  {editingId === collection.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdate(collection.id)}
                        disabled={updateCollection.isPending}
                        className="h-8"
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)} disabled={updateCollection.isPending}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="icon" className="h-8 w-8" onClick={() => handleUpdate(collection.id)} disabled={!editName.trim() || updateCollection.isPending}>
                        {updateCollection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="font-medium text-sm">{collection.name}</div>
                        <div className="text-xs text-muted-foreground">{collection.cardCount} cards</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingId(collection.id);
                            setEditName(collection.name);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(collection.id, collection.name)}
                          disabled={deleteCollection.isPending}
                        >
                          {deleteCollection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
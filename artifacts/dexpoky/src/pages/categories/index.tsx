import { Layout } from "@/components/layout";
import { useListCategories, useCreateCategory, useDeleteCategory } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FolderTree, Trash2, Share2 } from "lucide-react";
import { ShareModal, ShareTarget } from "@/components/share-modal";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function Categories() {
  const { data: categories, isLoading } = useListCategories();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();
  const queryClient = useQueryClient();
  
  const [isOpen, setIsOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);

  const handleCreate = () => {
    if (!newCatName.trim()) {
      toast.error("Category name is required");
      return;
    }

    createCategory.mutate({
      data: {
        name: newCatName,
        description: newCatDesc,
      }
    }, {
      onSuccess: () => {
        toast.success("Category created");
        setIsOpen(false);
        setNewCatName("");
        setNewCatDesc("");
        queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      },
      onError: () => toast.error("Failed to create category")
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure? Cards in this category will become uncategorized.")) {
      deleteCategory.mutate({ id }, {
        onSuccess: () => {
          toast.success("Category deleted");
          queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
        },
        onError: () => toast.error("Failed to delete category")
      });
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Categories</h1>
            <p className="text-muted-foreground">Organize your collection your way</p>
          </div>
          
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-md">
                <Plus className="h-4 w-4 mr-2" /> New Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Category</DialogTitle>
                <DialogDescription>Add a new way to organize your cards.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input placeholder="e.g. Base Set Holos" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Input placeholder="Optional description" value={newCatDesc} onChange={e => setNewCatDesc(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createCategory.isPending}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
          </div>
        ) : categories && categories.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map(category => (
              <Card key={category.id} className="shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-xl mb-1">{category.name}</CardTitle>
                    {category.description && (
                      <CardDescription>{category.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-1 -mt-2">
                    <Button
                      variant="ghost" size="icon"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setShareTarget({ type: "category", id: category.id, name: category.name, cardCount: category.cardCount ?? 0 })}
                      title="Share"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(category.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mt-4 pt-4 border-t flex justify-between items-center text-sm">
                    <div className="text-muted-foreground">
                      <span className="font-bold text-foreground">{category.cardCount}</span> cards
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-foreground">{formatCurrency(category.totalValue)}</div>
                      <div className="text-xs text-muted-foreground">Total Value</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 px-4 border-2 border-dashed rounded-xl bg-muted/5">
            <FolderTree className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-4" />
            <h3 className="text-xl font-bold mb-2">No categories yet</h3>
            <p className="text-muted-foreground mb-6">Create categories to better organize your collection.</p>
            <Button variant="outline" onClick={() => setIsOpen(true)}>Create Your First Category</Button>
          </div>
        )}
      </div>
      {shareTarget && (
        <ShareModal
          isOpen={true}
          onClose={() => setShareTarget(null)}
          target={shareTarget}
        />
      )}
    </Layout>
  );
}
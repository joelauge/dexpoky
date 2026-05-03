import { useState } from "react";
import { Layout } from "@/components/layout";
import { useListCards, useCreateListing } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CardItem } from "@/components/ui/card-item";
import { Tag, ArrowRight, CheckCircle2 } from "lucide-react";

export default function Sell() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");

  const { data: allCards, isLoading } = useListCards({});
  // Exclude cards already listed for sale
  const cards = allCards?.filter(c => !c.forSale);
  const createListing = useCreateListing();

  const selectedCard = cards?.find(c => c.id === selectedCardId);

  const handlePublish = () => {
    if (!selectedCardId || !price || parseFloat(price) <= 0) {
      toast.error("Please provide a valid price");
      return;
    }

    createListing.mutate({
      data: {
        cardId: selectedCardId,
        price: parseFloat(price),
        description: description || undefined
      }
    }, {
      onSuccess: (newListing) => {
        toast.success("Card listed successfully!");
        setLocation(`/marketplace/${newListing.id}`);
      },
      onError: () => toast.error("Failed to list card")
    });
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Sell a Card</h1>
          <p className="text-muted-foreground">List a card from your collection on the global marketplace.</p>
        </div>

        <div className="flex items-center gap-4 mb-8">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold ${step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>1</div>
          <div className={`h-1 flex-1 rounded-full ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
          <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold ${step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2</div>
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Select a card from your collection</h2>
            {isLoading ? (
              <div className="text-center p-10">Loading your collection...</div>
            ) : cards && cards.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {cards.map(card => (
                  <div 
                    key={card.id} 
                    className={`relative cursor-pointer transition-all rounded-xl border-2 ${selectedCardId === card.id ? 'border-primary shadow-md scale-[1.02]' : 'border-transparent hover:border-border'}`}
                    onClick={() => setSelectedCardId(card.id)}
                  >
                    {selectedCardId === card.id && (
                      <div className="absolute top-2 right-2 z-10 text-primary bg-white rounded-full">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                    )}
                    <CardItem card={card} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-12 border rounded-xl bg-muted/10">
                <p className="mb-4 text-muted-foreground">You don't have any available cards to sell.</p>
                <Button onClick={() => setLocation("/collection/new")}>Add Cards to Collection</Button>
              </div>
            )}
            
            <div className="flex justify-end pt-6">
              <Button 
                size="lg" 
                disabled={!selectedCardId} 
                onClick={() => setStep(2)}
              >
                Next Step <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && selectedCard && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-xl font-bold mb-6">Listing Details</h2>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Selling Price ($)</label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    placeholder={selectedCard.estimatedValue?.toString() || "0.00"}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="text-2xl py-6 font-bold"
                  />
                  {selectedCard.estimatedValue && (
                    <p className="text-xs text-muted-foreground">Estimated value: ${selectedCard.estimatedValue.toFixed(2)}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description (Optional)</label>
                  <Textarea 
                    placeholder="Describe the card's exact condition, any flaws, or why you're selling it..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[120px]"
                  />
                </div>
              </div>
              
              <div className="flex gap-4 mt-8">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button 
                  className="flex-1 shadow-md bg-primary hover:bg-primary/90" 
                  onClick={handlePublish}
                  disabled={createListing.isPending}
                >
                  <Tag className="mr-2 w-4 h-4" /> Publish Listing
                </Button>
              </div>
            </div>
            
            <div className="order-first md:order-last">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Preview</h3>
              <div className="pointer-events-none opacity-90 max-w-[300px]">
                <CardItem card={selectedCard} />
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
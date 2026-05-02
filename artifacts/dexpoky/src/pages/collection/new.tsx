import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useCreateCard, 
  useListCategories, 
  useSearchPokemon,
  CardRarity, 
  CardCondition,
  CreateCardBodyRarity,
  CreateCardBodyCondition
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { 
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Camera, Image as ImageIcon, Search, ArrowLeft, Loader2, RefreshCcw, Check } from "lucide-react";
import { toast } from "sonner";
import { formatLabel } from "@/lib/constants";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebounce } from "@/lib/utils";

const cardSchema = z.object({
  name: z.string().min(1, "Name is required"),
  pokemonName: z.string().min(1, "Pokémon name is required"),
  setName: z.string().optional(),
  cardNumber: z.string().optional(),
  rarity: z.nativeEnum(CreateCardBodyRarity),
  condition: z.nativeEnum(CreateCardBodyCondition),
  estimatedValue: z.coerce.number().min(0).optional(),
  categoryId: z.coerce.number().optional(),
  forSale: z.boolean().default(false),
  listingPrice: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
  imageUrl: z.string().optional().nullable()
}).refine(data => {
  if (data.forSale && !data.listingPrice) return false;
  return true;
}, {
  message: "Listing price is required when selling",
  path: ["listingPrice"]
});

type CardFormValues = z.infer<typeof cardSchema>;

export default function NewCard() {
  const [, setLocation] = useLocation();
  const createCard = useCreateCard();
  const { data: categories } = useListCategories();
  
  // Camera state
  const [isScanning, setIsScanning] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pokemon Search
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const { data: searchResults, isLoading: isSearching } = useSearchPokemon(
    { query: debouncedSearch },
    { query: { enabled: debouncedSearch.length > 2 } }
  );

  const form = useForm<CardFormValues>({
    resolver: zodResolver(cardSchema),
    defaultValues: {
      name: "",
      pokemonName: "",
      setName: "",
      cardNumber: "",
      rarity: CreateCardBodyRarity.common,
      condition: CreateCardBodyCondition.near_mint,
      forSale: false,
      notes: ""
    }
  });

  const watchForSale = form.watch("forSale");

  useEffect(() => {
    return () => {
      // Cleanup camera stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setStream(mediaStream);
      setIsScanning(true);
      setCapturedImage(null);
      
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch (err) {
      toast.error("Could not access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsScanning(false);
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(dataUrl);
        form.setValue("imageUrl", dataUrl);
        stopCamera();
      }
    }
  };

  const onSubmit = (data: CardFormValues) => {
    createCard.mutate({ data }, {
      onSuccess: (newCard) => {
        toast.success("Card added successfully!");
        setLocation(`/collection/${newCard.id}`);
      },
      onError: () => {
        toast.error("Failed to add card. Please try again.");
      }
    });
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20">
        <Button variant="ghost" onClick={() => setLocation("/collection")} className="mb-6 -ml-4 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Collection
        </Button>
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Add New Card</h1>
          <p className="text-muted-foreground">Log a new card into your collection</p>
        </div>

        <div className="bg-card border shadow-sm rounded-xl overflow-hidden">
          <div className="p-6 md:p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                
                {/* Image Section */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Card Image</h3>
                    {capturedImage && (
                      <Button type="button" variant="outline" size="sm" onClick={startCamera}>
                        <RefreshCcw className="h-4 w-4 mr-2" /> Retake
                      </Button>
                    )}
                  </div>
                  
                  <div className="bg-muted/30 border-2 border-dashed rounded-xl overflow-hidden relative min-h-[300px] flex items-center justify-center">
                    {isScanning ? (
                      <div className="w-full h-full absolute inset-0 flex flex-col bg-black">
                        <video 
                          ref={videoRef} 
                          autoPlay 
                          playsInline 
                          className="w-full h-full object-cover opacity-80"
                        />
                        <div className="absolute inset-0 border-[4px] border-primary/50 m-8 rounded-xl pointer-events-none" />
                        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-4 z-10">
                          <Button type="button" size="lg" variant="secondary" onClick={stopCamera}>
                            Cancel
                          </Button>
                          <Button type="button" size="lg" className="px-8 rounded-full h-14 bg-white text-black hover:bg-gray-200" onClick={captureImage}>
                            <Camera className="h-6 w-6 mr-2" /> Capture
                          </Button>
                        </div>
                      </div>
                    ) : capturedImage ? (
                      <div className="w-full h-full absolute inset-0">
                        <img src={capturedImage} alt="Captured card" className="w-full h-full object-contain" />
                        <div className="absolute top-4 right-4">
                          <div className="bg-green-500 text-white p-2 rounded-full shadow-lg">
                            <Check className="h-5 w-5" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-8">
                        <div className="mx-auto w-16 h-16 bg-background border rounded-full flex items-center justify-center mb-4">
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground mb-4">Scan your card to quickly add an image</p>
                        <Button type="button" onClick={startCamera}>
                          <Camera className="h-4 w-4 mr-2" /> Scan Card
                        </Button>
                      </div>
                    )}
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Info */}
                  <div className="space-y-6 md:col-span-2">
                    <h3 className="text-lg font-semibold border-b pb-2">Basic Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="pokemonName"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Pokémon</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Search Pokémon..." className="pl-9" {...field} onChange={e => {
                                      field.onChange(e);
                                      setSearchQuery(e.target.value);
                                    }} />
                                    {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                                  </div>
                                </FormControl>
                              </PopoverTrigger>
                              {searchResults && searchResults.length > 0 && searchQuery.length > 2 && (
                                <PopoverContent className="p-0 w-80" align="start">
                                  <div className="max-h-72 overflow-y-auto divide-y divide-border">
                                    {searchResults.map(card => (
                                      <div 
                                        key={card.id} 
                                        className="flex items-center gap-3 p-3 hover:bg-muted cursor-pointer transition-colors"
                                        onClick={() => {
                                          form.setValue("pokemonName", card.name.toLowerCase());
                                          if (!form.getValues("name")) {
                                            form.setValue("name", card.name);
                                          }
                                          if (card.setName) form.setValue("setName", card.setName);
                                          if (card.cardNumber) form.setValue("cardNumber", card.cardNumber);
                                          if (card.imageUrl && !capturedImage) form.setValue("imageUrl", card.imageUrl);
                                          setSearchQuery("");
                                        }}
                                      >
                                        <div className="w-12 h-16 shrink-0 rounded overflow-hidden bg-muted border">
                                          {card.imageUrl ? (
                                            <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" />
                                          ) : (
                                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                              <ImageIcon className="h-4 w-4" />
                                            </div>
                                          )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="font-semibold text-sm leading-tight truncate">{card.name}</p>
                                          <p className="text-xs text-muted-foreground truncate">{card.setName}</p>
                                          <p className="text-xs text-muted-foreground font-mono">#{card.cardNumber}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </PopoverContent>
                              )}
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Card Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Charizard VMAX" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Metadata */}
                  <FormField
                    control={form.control}
                    name="setName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Set Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Base Set, Evolving Skies" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="cardNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Card Number</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 4/102" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="rarity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rarity</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select rarity" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.values(CreateCardBodyRarity).map(r => (
                              <SelectItem key={r} value={r}>{formatLabel(r)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value?.toString() || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories?.map(c => (
                              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Condition & Value */}
                  <div className="space-y-6 md:col-span-2 mt-4">
                    <h3 className="text-lg font-semibold border-b pb-2">Condition & Value</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="condition"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Condition</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select condition" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {Object.values(CreateCardBodyCondition).map(c => (
                                  <SelectItem key={c} value={c}>{formatLabel(c)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="estimatedValue"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Estimated Value ($)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Sell Section */}
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 md:col-span-2 space-y-4">
                    <FormField
                      control={form.control}
                      name="forSale"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base font-bold">List on Marketplace</FormLabel>
                            <p className="text-sm text-muted-foreground">Make this card available for others to buy.</p>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    
                    {watchForSale && (
                      <FormField
                        control={form.control}
                        name="listingPrice"
                        render={({ field }) => (
                          <FormItem className="mt-4 animate-in fade-in slide-in-from-top-2">
                            <FormLabel>Listing Price ($)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" min="0" placeholder="Set your selling price" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Private Notes</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Where did you get it? Special grading notes?" className="resize-none" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                </div>

                <div className="pt-6 border-t flex justify-end gap-4">
                  <Button type="button" variant="outline" onClick={() => setLocation("/collection")}>Cancel</Button>
                  <Button type="submit" disabled={createCard.isPending} className="px-8 shadow-md">
                    {createCard.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Card
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useCreateCard,
  useListCategories,
  CreateCardBodyRarity,
  CreateCardBodyCondition,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Loader2, Check, ScanLine, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { formatLabel } from "@/lib/constants";

const LAST_CAT_KEY = "dexpoky:lastCategoryId";

function readLastCategoryId(): number | undefined {
  try {
    const v = localStorage.getItem(LAST_CAT_KEY);
    const n = v ? parseInt(v, 10) : NaN;
    return isNaN(n) ? undefined : n;
  } catch {
    return undefined;
  }
}

function saveLastCategoryId(id: number | undefined) {
  try {
    if (id != null) localStorage.setItem(LAST_CAT_KEY, String(id));
  } catch { /* ignore */ }
}

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
  imageUrl: z.string().optional().nullable(),
}).refine(data => {
  if (data.forSale && !data.listingPrice) return false;
  return true;
}, { message: "Listing price is required when selling", path: ["listingPrice"] });

type CardFormValues = z.infer<typeof cardSchema>;

const CONDITIONS: { value: CreateCardBodyCondition; label: string; desc: string }[] = [
  { value: CreateCardBodyCondition.mint,       label: "Mint",        desc: "Perfect, pack-fresh condition" },
  { value: CreateCardBodyCondition.near_mint,  label: "Near Mint",   desc: "Slight handling, no visible wear" },
  { value: CreateCardBodyCondition.lightly_played, label: "Lightly Played", desc: "Minor scratches or edge wear" },
  { value: CreateCardBodyCondition.moderately_played, label: "Moderately Played", desc: "Visible wear on surface or edges" },
  { value: CreateCardBodyCondition.heavily_played, label: "Heavily Played", desc: "Significant wear or creases" },
  { value: CreateCardBodyCondition.damaged,    label: "Damaged",     desc: "Tears, heavy creases, or bends" },
];

function getParam(search: string, key: string): string {
  return new URLSearchParams(search).get(key) ?? "";
}

export default function NewCard() {
  const [, setLocation] = useLocation();
  const createCard = useCreateCard();
  const { data: categories } = useListCategories();

  // Detect scan mode from URL params
  const search = typeof window !== "undefined" ? window.location.search : "";
  const scanName       = getParam(search, "name");
  const scanPokemon    = getParam(search, "pokemonName");
  const scanSet        = getParam(search, "setName");
  const scanNumber     = getParam(search, "cardNumber");
  const scanImage      = getParam(search, "imageUrl");
  const scanValue      = getParam(search, "estimatedValue");
  const fromScan       = !!(scanName && scanImage);

  const form = useForm<CardFormValues>({
    resolver: zodResolver(cardSchema),
    defaultValues: {
      name:           scanName      || "",
      pokemonName:    scanPokemon   || scanName || "",
      setName:        scanSet       || "",
      cardNumber:     scanNumber    || "",
      rarity:         CreateCardBodyRarity.common,
      condition:      CreateCardBodyCondition.near_mint,
      estimatedValue: scanValue ? Number(scanValue) : undefined,
      categoryId:     readLastCategoryId(),
      forSale:        false,
      notes:          "",
      imageUrl:       scanImage     || null,
    },
  });

  const watchForSale  = form.watch("forSale");
  const watchCondition = form.watch("condition");

  const onSubmit = (data: CardFormValues) => {
    createCard.mutate({ data }, {
      onSuccess: (newCard) => {
        saveLastCategoryId(data.categoryId);
        toast.success("Card added to your collection!");
        setLocation(`/collection/${newCard.id}`);
      },
      onError: () => {
        toast.error("Failed to add card. Please try again.");
      },
    });
  };

  /* ── Quick-add UI (from scan) ── */
  if (fromScan) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-8 pb-20">
          <Button
            variant="ghost"
            onClick={() => history.back()}
            className="mb-6 -ml-4 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>

          {/* Header */}
          <div className="flex items-center gap-2 text-primary mb-1">
            <ScanLine className="h-5 w-5" />
            <h1 className="text-2xl font-extrabold tracking-tight">Add Scanned Card</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Card details filled in automatically. Just confirm the condition.
          </p>

          {/* Card preview */}
          <div className="flex gap-4 bg-card border rounded-2xl overflow-hidden shadow-sm mb-8">
            <div className="w-28 shrink-0 bg-muted">
              <img
                src={scanImage}
                alt={scanName}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="py-4 pr-4 flex flex-col justify-center min-w-0 gap-1">
              <h2 className="font-bold text-base leading-tight">{scanName}</h2>
              {scanSet && <p className="text-sm text-muted-foreground truncate">{scanSet}</p>}
              {scanNumber && <p className="text-xs font-mono text-muted-foreground">#{scanNumber}</p>}
              {scanValue && (
                <p className="text-sm font-semibold text-emerald-600 mt-1">
                  ${Number(scanValue).toFixed(2)} <span className="text-[10px] font-normal text-muted-foreground">market value</span>
                </p>
              )}
            </div>
          </div>

          {/* Condition + Category */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <p className="text-sm font-semibold mb-3">What condition is your card in?</p>
                <div className="space-y-2">
                  {CONDITIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => form.setValue("condition", c.value)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                        watchCondition === c.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-border/80 hover:bg-muted/30"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        watchCondition === c.value ? "border-primary bg-primary" : "border-muted-foreground/40"
                      }`}>
                        {watchCondition === c.value && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{c.label}</p>
                        <p className="text-xs text-muted-foreground">{c.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category picker */}
              {categories && categories.length > 0 && (
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2 mb-2">
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        <FormLabel className="text-sm font-semibold !mb-0">File in category</FormLabel>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {categories.map((cat) => {
                          const active = field.value === cat.id;
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => field.onChange(active ? undefined : cat.id)}
                              className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
                                active
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background hover:border-primary/50 hover:bg-muted/30"
                              }`}
                            >
                              {active && <Check className="inline h-3 w-3 mr-1 -mt-0.5" />}
                              {cat.name}
                            </button>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <Button
                type="submit"
                disabled={createCard.isPending}
                className="w-full rounded-xl h-12 text-base font-semibold shadow-md"
              >
                {createCard.isPending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                  : <><Check className="mr-2 h-4 w-4" /> Add to Collection</>
                }
              </Button>
            </form>
          </Form>
        </div>
      </Layout>
    );
  }

  /* ── Full manual add form ── */
  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20">
        <Button
          variant="ghost"
          onClick={() => setLocation("/collection")}
          className="mb-6 -ml-4 text-muted-foreground hover:text-foreground"
        >
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-6 md:col-span-2">
                    <h3 className="text-lg font-semibold border-b pb-2">Basic Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="pokemonName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pokémon Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Pikachu" {...field} />
                            </FormControl>
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

                  <FormField
                    control={form.control}
                    name="setName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Set Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Base Set" {...field} value={field.value || ""} />
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
                            <Textarea
                              placeholder="Where did you get it? Special grading notes?"
                              className="resize-none"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="pt-6 border-t flex justify-end gap-4">
                  <Button type="button" variant="outline" onClick={() => setLocation("/collection")}>
                    Cancel
                  </Button>
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

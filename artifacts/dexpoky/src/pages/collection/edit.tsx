import { useEffect } from "react";
import { Layout } from "@/components/layout";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetCard,
  useUpdateCard,
  useListCategories,
  UpdateCardBodyRarity,
  UpdateCardBodyCondition,
} from "@workspace/api-client-react";
import { useRoute, useLocation } from "wouter";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { formatLabel } from "@/lib/constants";
import { CardImageUpload } from "@/components/card-image-upload";

const LAST_CAT_KEY = "dexpoky:lastCategoryId";

function saveLastCategoryId(id: number | undefined | null) {
  try {
    if (id != null) localStorage.setItem(LAST_CAT_KEY, String(id));
  } catch { /* ignore */ }
}

// Map any legacy condition strings (stored before enum was finalised) to current values
const LEGACY_CONDITION: Record<string, UpdateCardBodyCondition> = {
  lightly_played:    UpdateCardBodyCondition.light_played,
  moderately_played: UpdateCardBodyCondition.played,
  heavily_played:    UpdateCardBodyCondition.poor,
  damaged:           UpdateCardBodyCondition.poor,
};

function normalizeCondition(raw: string | null | undefined): UpdateCardBodyCondition {
  if (!raw) return UpdateCardBodyCondition.near_mint;
  if (raw in UpdateCardBodyCondition) return raw as UpdateCardBodyCondition;
  return LEGACY_CONDITION[raw] ?? UpdateCardBodyCondition.near_mint;
}

const editSchema = z.object({
  name: z.string().min(1, "Name is required"),
  pokemonName: z.string().min(1, "Pokémon name is required"),
  setName: z.string().optional(),
  cardNumber: z.string().optional(),
  rarity: z.nativeEnum(UpdateCardBodyRarity),
  condition: z.nativeEnum(UpdateCardBodyCondition),
  estimatedValue: z.coerce.number().min(0).optional().nullable(),
  categoryId: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  cardStory: z.string().max(2000, "Story is too long").optional().nullable(),
  imageUrl: z.string().optional().nullable(),
});

type EditFormValues = z.infer<typeof editSchema>;

export default function EditCard() {
  const [, params] = useRoute("/collection/:id/edit");
  const id = params?.id ? parseInt(params.id) : 0;
  const [, setLocation] = useLocation();

  const { data: card, isLoading } = useGetCard(id, {
    query: { enabled: !!id, queryKey: ["/api/cards", id] },
  });
  const { data: categories } = useListCategories();
  const updateCard = useUpdateCard();

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: "",
      pokemonName: "",
      setName: "",
      cardNumber: "",
      rarity: UpdateCardBodyRarity.common,
      condition: UpdateCardBodyCondition.near_mint,
      estimatedValue: undefined,
      categoryId: undefined,
      notes: "",
      cardStory: "",
      imageUrl: null,
    },
  });

  useEffect(() => {
    if (!card) return;
    form.reset({
      name: card.name ?? "",
      pokemonName: card.pokemonName ?? "",
      setName: card.setName ?? "",
      cardNumber: card.cardNumber ?? "",
      rarity: (card.rarity as UpdateCardBodyRarity) ?? UpdateCardBodyRarity.common,
      condition: normalizeCondition(card.condition),
      estimatedValue: card.estimatedValue != null ? Number(card.estimatedValue) : undefined,
      categoryId: card.categoryId ?? undefined,
      notes: card.notes ?? "",
      cardStory: card.cardStory ?? "",
      imageUrl: card.imageUrl ?? null,
    });
  }, [card?.id]);

  const onSubmit = (data: EditFormValues) => {
    updateCard.mutate(
      {
        id,
        data: {
          ...data,
          estimatedValue: data.estimatedValue ?? null,
          categoryId: data.categoryId ?? null,
          notes: data.notes ?? null,
          cardStory: data.cardStory && data.cardStory.trim().length > 0 ? data.cardStory.trim() : null,
          imageUrl: data.imageUrl ?? null,
          setName: data.setName || undefined,
          cardNumber: data.cardNumber || undefined,
        },
      },
      {
        onSuccess: () => {
          saveLastCategoryId(data.categoryId);
          toast.success("Card updated successfully!");
          setLocation(`/collection/${id}`);
        },
        onError: () => toast.error("Failed to update card. Please try again."),
      }
    );
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Skeleton className="h-8 w-40 mb-8" />
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (!card) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold">Card not found</h2>
          <Button className="mt-4" onClick={() => setLocation("/collection")}>
            Back to Collection
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20">
        <Button
          variant="ghost"
          onClick={() => setLocation(`/collection/${id}`)}
          className="mb-6 -ml-4 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Card
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-1">Edit Card</h1>
          <p className="text-muted-foreground">{card.name}</p>
        </div>

        <div className="bg-card border shadow-sm rounded-xl overflow-hidden">
          <div className="p-6 md:p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

                {/* Basic Details */}
                <div className="space-y-6">
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
                      name="imageUrl"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Card Image</FormLabel>
                          <FormControl>
                            <CardImageUpload
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Condition, Rarity & Value */}
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold border-b pb-2">Condition & Value</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="condition"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Condition</FormLabel>
                          <Select
                            key={field.value}
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select condition" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.values(UpdateCardBodyCondition).map((c) => (
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
                      name="rarity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rarity</FormLabel>
                          <Select
                            key={field.value}
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select rarity" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.values(UpdateCardBodyRarity).map((r) => (
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
                      name="estimatedValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estimated Value ($)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                            />
                          </FormControl>
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
                          <Select
                            key={field.value ?? "none"}
                            onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))}
                            defaultValue={field.value != null ? field.value.toString() : "none"}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">No category</SelectItem>
                              {categories?.map((c) => (
                                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">Notes</h3>
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

                  <FormField
                    control={form.control}
                    name="cardStory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Card Story</FormLabel>
                        <p className="text-xs text-muted-foreground -mt-1">
                          How did you get this card? Pack pull, trade, gift from grandma — capture the memory.
                        </p>
                        <FormControl>
                          <Textarea
                            placeholder="e.g. Pulled from a Hidden Fates booster on my 12th birthday — first holo I ever owned."
                            rows={5}
                            className="resize-y"
                            maxLength={2000}
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <div className="flex justify-end">
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {(field.value ?? "").length}/2000
                          </span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="pt-6 border-t flex justify-end gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation(`/collection/${id}`)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateCard.isPending} className="px-8 shadow-md">
                    {updateCard.isPending
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                      : <><Save className="mr-2 h-4 w-4" /> Save Changes</>
                    }
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

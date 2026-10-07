import {
  CreateBinderBody,
  UpdateBinderBody,
} from "@workspace/api-zod";

export type BinderPageInput = {
  id: string;
  rows: number;
  columns: number;
  widthMm: number;
  heightMm: number;
  slots: Array<{ slot: number; cardId: number }>;
};

export type CreateBinderInput = {
  name: string;
  style: "ring" | "zip" | "folio";
  coverColor: string;
  rows: number;
  columns: number;
  widthMm: number;
  heightMm: number;
  pageCount: number;
};

export type UpdateBinderInput = {
  isPublic?: boolean;
  name: string;
  style: "ring" | "zip" | "folio";
  coverColor: string;
  revision: number;
  pages: BinderPageInput[];
};

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

function validateDimensions(rows: number, columns: number, widthMm: number, heightMm: number): string | null {
  if (![rows, columns, widthMm, heightMm].every(isInteger)) {
    return "Rows, columns, and page dimensions must be integers";
  }
  return null;
}

export function validateCreateBinder(input: unknown): ValidationResult<CreateBinderInput> {
  const parsed = CreateBinderBody.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid binder details" };
  const value = parsed.data;
  const dimensionError = validateDimensions(value.rows, value.columns, value.widthMm, value.heightMm);
  if (dimensionError) return { success: false, error: dimensionError };
  if (!isInteger(value.pageCount)) return { success: false, error: "Page count must be an integer" };
  if (!value.name.trim()) return { success: false, error: "Binder name cannot be empty" };
  return {
    success: true,
    data: { ...value, name: value.name.trim() },
  };
}

export function validateUpdateBinder(input: unknown): ValidationResult<UpdateBinderInput> {
  const parsed = UpdateBinderBody.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid binder layout" };
  const value = parsed.data;
  if (!Number.isInteger(value.revision) || value.revision < 1) {
    return { success: false, error: "Revision must be a positive integer" };
  }
  if (!value.name.trim()) return { success: false, error: "Binder name cannot be empty" };
  const pageIds = new Set<string>();
  const placedCardIds = new Set<number>();
  for (const page of value.pages) {
    if (pageIds.has(page.id)) return { success: false, error: "Page IDs must be unique" };
    pageIds.add(page.id);
    const dimensionError = validateDimensions(page.rows, page.columns, page.widthMm, page.heightMm);
    if (dimensionError) return { success: false, error: dimensionError };
    const slotIndices = new Set<number>();
    for (const { slot, cardId } of page.slots) {
      if (!Number.isInteger(slot) || !Number.isInteger(cardId) || cardId === 0 || slot < 0) {
        return { success: false, error: "Pocket indices and card IDs must be integers" };
      }
      if (slot >= page.rows * page.columns) {
        return { success: false, error: "Pocket index is outside the page layout" };
      }
      if (slotIndices.has(slot)) return { success: false, error: "Pocket indices must be unique per page" };
      if (placedCardIds.has(cardId)) {
        return { success: false, error: cardId > 0 ? "Each owned card can only be placed once in a binder" : "Each wishlist card can only be placed once in a binder" };
      }
      placedCardIds.add(cardId);
      slotIndices.add(slot);
    }
  }
  return {
    success: true,
    data: { ...value, name: value.name.trim() } as UpdateBinderInput,
  };
}

export function validateOwnedCardIds(cardIds: number[], ownedIds: number[]): string | null {
  const owned = new Set(ownedIds);
  return cardIds.every((cardId) => owned.has(cardId))
    ? null
    : "One or more cards are not in your collection";
}
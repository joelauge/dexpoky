/** Blank and fractional quantities must not silently become one copy. */
export function parseBulkCardQuantity(value: string | undefined): number | null {
  if (value === undefined) return 1;
  if (!/^\d+$/.test(value)) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 999 ? quantity : null;
}

export function expandBulkCardCopies<T>(items: T[], quantities: Array<string | undefined>): T[] {
  return items.flatMap((item, index) => {
    const quantity = parseBulkCardQuantity(quantities[index]);
    if (quantity === null) throw new Error("Copies to add must be a whole number from 1 to 999.");
    return Array.from({ length: quantity }, () => ({ ...item }));
  });
}
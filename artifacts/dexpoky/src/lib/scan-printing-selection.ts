/** Optional analysis returned by the scanner's manual lookup contract. */
export interface ScanPrintingSelection {
  status: "exact" | "likely" | "review" | "unavailable";
  recommendedId: string | null;
  confidence: number | null;
  message: string;
}
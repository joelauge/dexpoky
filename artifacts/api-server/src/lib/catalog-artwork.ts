import { logger } from "./logger.js";
import { normalizeSetCode } from "../routes/detect-helpers.js";

const BASE = "https://api.tcgdex.net/v2/en";
const TTL = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;

interface SetIdentity { id: string; name: string }
interface ArtworkIdentity {
  name: string;
  setName: string;
  setCode: string;
  cardNumber: string;
}

let setsCache: { expires: number; data: SetIdentity[] } | undefined;
let setsInflight: Promise<SetIdentity[] | null> | undefined;
const images = new Map<string, { expires: number; data: string | null }>();
const inflight = new Map<string, Promise<string | null>>();

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Keep promo/energy labels intact; only strip padding from entirely numeric IDs. */
function collectorId(value: string): string {
  const local = value.split("/")[0]?.trim().toUpperCase() ?? "";
  return /^\d+$/.test(local) ? local.replace(/^0+(?=\d)/, "") : local;
}

async function getJson(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json", "User-Agent": "DexPoky/1.0" },
      signal: controller.signal,
    });
    return response.ok ? await response.json() : null;
  } finally {
    clearTimeout(timer);
  }
}

async function getSets(): Promise<SetIdentity[] | null> {
  if (setsCache && setsCache.expires > Date.now()) return setsCache.data;
  if (setsInflight) return setsInflight;
  setsInflight = (async () => {
    const data = await getJson("/sets");
    if (!Array.isArray(data)) return null;
    const sets = data.filter((set): set is SetIdentity =>
      set && typeof set.id === "string" && typeof set.name === "string");
    setsCache = { expires: Date.now() + TTL, data: sets };
    return sets;
  })();
  try {
    return await setsInflight;
  } finally {
    setsInflight = undefined;
  }
}

function resolveSet(sets: SetIdentity[], card: ArtworkIdentity): SetIdentity | null {
  const name = normalizedName(card.setName);
  const code = normalizeSetCode(card.setCode);
  const byCode = code ? sets.filter((set) => normalizeSetCode(set.id) === code) : [];
  // Official printed codes and TCGdex IDs often differ. An exact set name can
  // bridge them, but never override a code that identifies a conflicting set.
  const matches = name
    ? sets.filter((set) => normalizedName(set.name) === name)
    : byCode;
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  if (byCode.some((set) => set.id !== match.id)) return null;
  return match;
}

function verifiedImageBase(image: unknown, setId: string, localId: string): string | null {
  if (typeof image !== "string" || !image) return null;
  try {
    const url = new URL(image);
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    // An explicit image base must itself identify the verified printing.
    if (url.protocol !== "https:" || url.hostname !== "assets.tcgdex.net" ||
        url.username || url.password || url.search || url.hash ||
        parts.length !== 4 || parts[0] !== "en" ||
        normalizeSetCode(parts[2]) !== normalizeSetCode(setId) ||
        collectorId(parts[3]!) !== collectorId(localId)) return null;
    return `${image.replace(/\/$/, "")}/high.webp`;
  } catch {
    return null;
  }
}

/**
 * Artwork is optional. Never use a same-name printing or manufacture an asset
 * path when the catalog has no image for the exact set and collector identity.
 */
export async function lookupVerifiedCatalogImage(card: ArtworkIdentity): Promise<string | null> {
  const local = card.cardNumber.split("/")[0]?.trim() ?? "";
  const number = collectorId(local);
  if (!normalizedName(card.name) || !number || !/^[a-z0-9]+$/i.test(local) ||
      (!card.setName.trim() && !card.setCode.trim())) return null;
  const key = JSON.stringify([
    normalizedName(card.name), normalizedName(card.setName),
    normalizeSetCode(card.setCode), number,
  ]);
  const cached = images.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  const pending = inflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const sets = await getSets();
      if (!sets) return null;
      const set = resolveSet(sets, card);
      let image: string | null = null;
      if (set) {
        const numbers = [...new Set([local, /^\d+$/.test(local) ? number : local])];
        for (const candidateNumber of numbers) {
          const detail = await getJson(`/cards/${encodeURIComponent(`${set.id}-${candidateNumber}`)}`);
          if (!detail || typeof detail !== "object") continue;
          const data = detail as Record<string, unknown>;
          const detailSet = data.set as SetIdentity | undefined;
          const id = typeof data.id === "string" ? data.id : "";
          const dash = id.lastIndexOf("-");
          if (dash < 1 || normalizeSetCode(id.slice(0, dash)) !== normalizeSetCode(set.id) ||
              collectorId(id.slice(dash + 1)) !== number ||
              typeof data.localId !== "string" || collectorId(data.localId) !== number ||
              !detailSet || normalizeSetCode(detailSet.id) !== normalizeSetCode(set.id) ||
              typeof data.name !== "string" || normalizedName(data.name) !== normalizedName(card.name)) continue;
          image = verifiedImageBase(data.image, set.id, data.localId);
          if (image) break;
        }
      }
      images.set(key, { expires: Date.now() + TTL, data: image });
      while (images.size > MAX_ENTRIES) images.delete(images.keys().next().value!);
      return image;
    } catch (err) {
      logger.debug({ err }, "Exact-printing catalog artwork lookup failed");
      return null;
    }
  })();
  inflight.set(key, request);
  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}
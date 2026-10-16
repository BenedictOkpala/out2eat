import { z } from "zod";
import { createQlooClient, QlooHttpError, rateInfo, type RetryBudget } from "./qloo-client.ts";
import { DINING_TAGS } from "./dining-tags.ts";
import { DINING_UNAVAILABLE } from "./dining-config.server.ts";
import { cacheRead, cacheWrite, digest, reserveProvider, recordQlooCooldown, resetUsageState, UsageError, withSearchLease } from "./usage.server.ts";
import {
  budgetById,
  locationSearchLabel,
  LOCATIONS,
  isSubstantivePreference,
  joinList,
  lineFor,
  priceLabel,
  sharedLine,
  type DinnerRequest,
  type DinnerResponse,
  type VenueCard,
  type VenueTag,
  type PreferenceEvidence,
} from "./dining.ts";

const dinerSchema = z.object({
  name: z.string().trim().min(1).max(40),
  likes: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
  avoids: z.array(z.string().trim().min(1).max(40)).max(8),
});

export const requestSchema = z.object({
  message: z.string().trim().min(1).max(400),
  location: z.object({
    id: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(80),
    locality: z.string().trim().min(1).max(80),
    latitude: z.number().gte(-90).lte(90).nullable(),
    longitude: z.number().gte(-180).lte(180).nullable(),
    radiusMeters: z.number().int().gte(500).lte(20000),
  }),
  budget: z.enum(["low", "mid", "high", "any"]),
  a: dinerSchema,
  b: dinerSchema,
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(500),
      }),
    )
    .max(6),
  excludeIds: z.array(z.string().trim().min(1).max(80)).max(12),
  requiredFood: z.array(z.string().trim().min(1).max(40)).max(3).default([]),
  messageAvoids: z.array(z.string().trim().min(1).max(40)).max(4).default([]),
});

export function canonicalLocation(input: DinnerRequest): DinnerRequest {
  const preset = LOCATIONS.find(location => location.id === input.location.id) ??
    (input.location.id === "custom" ? LOCATIONS.find(location => [location.label, location.locality].some(label => label.toLowerCase() === input.location.locality.toLowerCase())) : undefined);
  if (!preset) throw new UsageError("Custom geographic boundaries cannot be verified. Choose one of the listed presets; its stated search radius is enforced without widening.");
  return { ...input, location: { ...preset } };
}

export function effectiveSearchKey(input: DinnerRequest): string {
  const normal = (terms: string[]) => [...new Set(terms.map(term => term.trim().toLowerCase()))].sort();
  return digest({version:2,location:input.location,budget:input.budget,a:{likes:normal(input.a.likes),avoids:normal(input.a.avoids)},b:{likes:normal(input.b.likes),avoids:normal(input.b.avoids)},requiredFood:normal(input.requiredFood ?? []),messageAvoids:normal(input.messageAvoids ?? []),excludeIds:[...input.excludeIds].sort()});
}

type TagHit = { id: string; name: string; type: string };
type RawPlace = {
  id: string;
  name: string;
  tags: { id: string; name: string }[];
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  priceLevel: number | null;
  rating: number | null;
  imageUrl: string | null;
  affinity: number | null;
  primaryGenre: string | null;
  latitude: number | null;
  longitude: number | null;
};

type RankedPlace = RawPlace & {
  hitsA: string[];
  hitsB: string[];
  avoidA: string[];
  avoidB: string[];
  score: number;
  foodA: string[];
  foodB: string[];
  evidenceA: PreferenceEvidence[];
  evidenceB: PreferenceEvidence[];
};

function qlooKey(): string | undefined {
  for (const name of ["QLOO_API_KEY", "QLOO_HACKATHON_API_KEY", "HACKATHON_QLOO_API_KEY"]) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

let clientSpacing = 2000;
function newClient() {
  return createQlooClient({ spacingMs: clientSpacing, fetch: async (...args) => {
    const reservation = await reserveProvider("qloo");
    reservation.commit();
    const response = await fetch(...args);
    const rate = rateInfo(response.headers);
    if (response.status === 429 || ["x-ratelimit-remaining", "ratelimit-remaining", "x-second-ratelimit-remaining", "x-month-ratelimit-remaining"].some(name => rate.headers[name] === "0")) {
      await recordQlooCooldown(Date.now() + (rate.retryAfterMs ?? 60000));
    }
    return response;
  }, onResponse: event => {
    if (event.status === 429 || process.env.QLOO_DIAGNOSTICS === "true") console.info("Qloo response", JSON.stringify(event));
  } });
}
let client = newClient();
let activeKey = "";
const tagCache = new Map<string, { value: TagHit | null; until: number }>();
const tagRequests = new Map<string, Promise<TagHit | null>>();
const searches = new Map<string, Promise<RankedPlace[]>>();
/** Clear process-local caches after a credential change, or between isolated tests. */
export function resetDiningState(spacingMs = 2000) { clientSpacing = spacingMs; client = newClient(); activeKey = ""; tagCache.clear(); tagRequests.clear(); searches.clear(); resetUsageState(); }
async function qlooGet(path: string, params: Record<string, string | number | undefined>, budget: RetryBudget): Promise<unknown> {
  const key = qlooKey();
  if (!key) throw new QlooHttpError(401);
  return client.get(path, params, key, budget);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function normaliseTag(raw: unknown): TagHit | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = clean(row.id, 180) || clean(row.tag_id, 180);
  const name = clean(row.name, 80);
  if (!id || !name || id.includes(",")) return null;
  return { id, name, type: clean(row.type, 120) };
}

function extractTags(payload: unknown): TagHit[] {
  const root = asRecord(payload);
  const results = root?.results;
  const list = Array.isArray(results)
    ? results
    : Array.isArray(asRecord(results)?.tags)
      ? (asRecord(results)?.tags as unknown[])
      : null;
  if (!list) throw new Error("Unexpected Qloo tags response");
  return list.map(normaliseTag).filter((tag): tag is TagHit => tag != null);
}

function pickTag(term: string, tags: TagHit[]): TagHit | null {
  const needle = term.toLowerCase();
  const placeish = tags.filter((tag) =>
    /place|cuisine|food|dining|restaurant|amenity/i.test(`${tag.id} ${tag.type}`),
  );
  if (!placeish.length) return null;
  return (
    placeish.find((tag) => tag.name.toLowerCase() === needle) ??
    null
  );
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function imageFrom(properties: Record<string, unknown> | null): string | null {
  if (!properties) return null;
  const images = properties.images;
  if (Array.isArray(images)) {
    for (const image of images) {
      const url = typeof image === "string" ? httpsUrl(image) : httpsUrl(asRecord(image)?.url);
      if (url) return url;
    }
  }
  const image = properties.image;
  return typeof image === "string" ? httpsUrl(image) : httpsUrl(asRecord(image)?.url);
}

function normalisePlace(raw: unknown): RawPlace | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = clean(row.entity_id, 80);
  const name = clean(row.name, 140);
  if (!id || !name) return null;
  const properties = asRecord(row.properties);
  const tags: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  const pushTag = (tagId: string, tagName: string) => {
    const key = tagId;
    if (!tagName || key === name.toLowerCase() || seen.has(key)) return;
    seen.add(key);
    tags.push({ id: tagId, name: tagName });
  };
  if (Array.isArray(row.tags)) {
    for (const tag of row.tags) {
      const parsed = normaliseTag(tag);
      if (parsed) pushTag(parsed.id, parsed.name);
    }
  }
  const genre = asRecord(properties?.primary_genre);
  if (genre) pushTag(clean(genre.id, 180), clean(genre.name, 80));

  const geocode = asRecord(properties?.geocode);
  const price = num(properties?.price_level);
  const rating = num(properties?.business_rating);
  const query = asRecord(row.query);
  const coordinates = asRecord(row.location);
  const latitude = num(coordinates?.lat), longitude = num(coordinates?.lon);
  const validCoordinates = latitude != null && longitude != null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  return {
    id,
    name,
    tags,
    address: clean(properties?.address, 160) || null,
    neighborhood: clean(properties?.neighborhood, 80) || null,
    city: clean(geocode?.city, 80) || clean(geocode?.name, 80) || null,
    priceLevel: price != null && Number.isInteger(price) && price >= 1 && price <= 4 ? price : null,
    rating: rating != null && rating >= 0 && rating <= 5 ? Math.round(rating * 10) / 10 : null,
    imageUrl: imageFrom(properties),
    affinity: num(query?.affinity) ?? num(row.affinity),
    primaryGenre: clean(genre?.id, 180) || null,
    latitude: validCoordinates ? latitude : null,
    longitude: validCoordinates ? longitude : null,
  };
}

export function extractPlaces(payload: unknown): RawPlace[] {
  const root = asRecord(payload);
  const results = root?.results;
  const list = Array.isArray(results)
    ? results
    : Array.isArray(asRecord(results)?.entities)
      ? (asRecord(results)?.entities as unknown[])
      : null;
  if (!list) throw new Error("Unexpected Qloo insights response");
  const places: RawPlace[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const place = normalisePlace(item);
    if (!place || seen.has(place.id)) continue;
    seen.add(place.id);
    places.push(place);
  }
  return places;
}

export async function searchTags(term: string, budget: RetryBudget = { remaining: 1 }): Promise<TagHit | null> {
  const key = term.toLowerCase();
  if (DINING_TAGS[key]) return DINING_TAGS[key];
  const cached = tagCache.get(key);
  if (cached && cached.until > Date.now()) return cached.value;
  const existing = tagRequests.get(key);
  if (existing) return existing;
  const request = (async () => {
    const shared = await cacheRead<{ value: TagHit | null }>(`tag:${digest(key)}`);
    if (shared) return shared.value;
    const payload = await qlooGet("/v2/tags", { "filter.query": term, take: 50 }, budget);
    const value = pickTag(term, extractTags(payload));
    if (tagCache.size >= 256) tagCache.delete(tagCache.keys().next().value!);
    tagCache.set(key, { value, until: Date.now() + (value ? 24 * 60 * 60_000 : 30 * 60_000) });
    await cacheWrite(`tag:${digest(key)}`, {value}, value ? 86400 : 1800);
    return value;
  })();
  tagRequests.set(key, request);
  try { return await request; } finally { tagRequests.delete(key); }
}

function normaliseWords(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function tagMatches(tag: { name: string }, term: string): boolean {
  const name = normaliseWords(tag.name), needle = normaliseWords(term);
  return !!needle && (` ${name} `).includes(` ${needle} `);
}

function matchTerms(place: RawPlace, terms: string[]): string[] {
  return terms.filter(term => place.tags.some(tag => tagMatches(tag, term)));
}

const dessertCategories = new Set(["ice_cream_shop", "dessert_shop", "cake_shop", "cupcake_shop", "donut_shop", "confectionery"]);
function dessertCategory(id: string): boolean {
  return id.startsWith("urn:tag:genre:place:restaurant:") && dessertCategories.has(id.split(":").at(-1)!);
}

export function isDessertFocused(place: RawPlace): boolean {
  const dessert = place.primaryGenre ? dessertCategory(place.primaryGenre) : place.tags.some(tag => dessertCategory(tag.id));
  const dinner = place.tags.some(tag => tag.id === "urn:tag:dining_options:place:dinner");
  const mealCategory = place.tags.some(tag => tag.id.startsWith("urn:tag:genre:place:restaurant:") &&
    !dessertCategory(tag.id) && !/:(breakfast|cafe|coffee_shop|bakery)$/.test(tag.id));
  return dessert && !dinner && !mealCategory;
}

export function preferenceEvidence(place: RawPlace, terms: string[]): PreferenceEvidence[] {
  return terms.flatMap(preference => {
    const kind = isSubstantivePreference(preference) ? "food" : "supporting";
    const tags = place.tags.filter(tag => tagMatches(tag, preference) && (kind === "food"
      ? /urn:tag:(cuisine|specialty_dish|menu_highlight):|urn:tag:genre:place:restaurant:/.test(tag.id)
      : /urn:tag:(ambience|good_for|offerings|beverage_offering):/.test(tag.id)));
    const tag = tags.find(tag => normaliseWords(tag.name) === normaliseWords(preference)) ?? tags[0];
    return tag ? [{ preference, tagId: tag.id, tagName: tag.name, kind }] : [];
  });
}

function whereLine(place: RawPlace): string | null {
  const parts = [place.neighborhood, place.city].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return place.address;
}

function displayTags(place: RankedPlace): VenueTag[] {
  const matched = new Set([...place.evidenceA, ...place.evidenceB].map(match => match.tagId));
  const ranked = [...place.tags].sort((a, b) => {
    const aHit = matched.has(a.id), bHit = matched.has(b.id);
    return Number(bHit) - Number(aHit);
  });
  return ranked.slice(0, 4).map((tag) => ({
    name: tag.name,
    matched: matched.has(tag.id),
  }));
}

export function distanceFromCentre(place: { latitude: number | null; longitude: number | null }, centre: { latitude: number | null; longitude: number | null }): number | null {
  if (place.latitude == null || place.longitude == null || centre.latitude == null || centre.longitude == null) return null;
  const rad = (value: number) => value * Math.PI / 180;
  const a = Math.sin(rad(place.latitude - centre.latitude) / 2) ** 2 + Math.cos(rad(centre.latitude)) * Math.cos(rad(place.latitude)) * Math.sin(rad(place.longitude - centre.longitude) / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function toCard(place: RankedPlace, names: { a: string; b: string }, location: DinnerRequest["location"]): VenueCard {
  const foodTags = new Set([...place.evidenceA, ...place.evidenceB].filter(match => match.kind === "food").map(match => match.tagId));
  const cuisines = place.tags.filter(tag => tag.id.startsWith("urn:tag:cuisine:"))
    .sort((a, b) => Number(foodTags.has(b.id)) - Number(foodTags.has(a.id)));
  return {
    id: place.id, name: place.name, where: whereLine(place),
    priceLabel: priceLabel(place.priceLevel),
    ratingLabel: place.rating != null ? `Rating ${place.rating.toFixed(1)}` : null,
    imageUrl: place.imageUrl, tags: displayTags(place),
    forA: lineFor(names.a, place.hitsA, place.avoidA, place.foodA),
    forB: lineFor(names.b, place.hitsB, place.avoidB, place.foodB),
    shared: sharedLine(names.a, names.b, place.hitsA, place.hitsB, place.foodA, place.foodB),
    dinnerEvidence: place.foodA.length && place.foodB.length ? "both" : place.foodA.length || place.foodB.length ? "partial" : "weak",
    cuisines: [...new Set(cuisines.map(tag => tag.name))],
    address: place.address,
    distanceMeters: distanceFromCentre(place, location),
    evidenceA: place.evidenceA,
    evidenceB: place.evidenceB,
  };
}

function rankFactors(place: RankedPlace): number[] {
  return [Math.min(place.foodA.length, place.foodB.length), place.foodA.length + place.foodB.length, place.score, place.affinity ?? 0];
}

function compareRank(a: RankedPlace, b: RankedPlace): number {
  const left = rankFactors(a), right = rankFactors(b);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return right[i]! - left[i]!;
  return 0;
}

export function explainPrimaryRank(best: RankedPlace, alternatives: RankedPlace[]): string {
  if (!alternatives.length) return "The only returned restaurant with a supported food match for both friends within the location and budget constraints. No comparison advantage is claimed.";
  const reasons = alternatives.map(alternative => {
    const a = rankFactors(best), b = rankFactors(alternative);
    const factor = a.findIndex((value, i) => value !== b[i]);
    return { name: alternative.name, factor };
  });
  const copy = (factor: number) => factor === 0 ? "More balanced food matches for both friends."
    : factor === 1 ? "Same food balance; more food matches overall."
    : factor === 2 ? "Food coverage ties; higher taste-coverage/Qloo-affinity score."
    : factor === 3 ? "Food and combined scores tie; higher Qloo affinity puts this choice first."
    : "All ranking factors tie; Qloo's returned order is retained, with no quality advantage claimed.";
  if (reasons.every(reason => reason.factor === reasons[0]?.factor)) return `Compared with the alternatives: ${copy(reasons[0]?.factor ?? -1)}`;
  return reasons.map(reason => `Above ${reason.name}: ${copy(reason.factor)}`).join(" ");
}

export function rankPlaces(places: RawPlace[], input: DinnerRequest): RankedPlace[] {
  return places
    .filter(place => !isDessertFocused(place))
    .map((place) => {
      const evidenceA = preferenceEvidence(place, input.a.likes), evidenceB = preferenceEvidence(place, input.b.likes);
      const hitsA = evidenceA.map(match => match.preference), hitsB = evidenceB.map(match => match.preference);
      const avoidA = matchTerms(place, input.a.avoids);
      const avoidB = matchTerms(place, input.b.avoids);
      const foodA = evidenceA.filter(match => match.kind === "food").map(match => match.preference);
      const foodB = evidenceB.filter(match => match.kind === "food").map(match => match.preference);
      const both = Math.min(hitsA.length, hitsB.length);
      const affinity = place.affinity != null && place.affinity > 0 && place.affinity <= 1 ? place.affinity : 0;
      const score = both * 5 + hitsA.length / input.a.likes.length + hitsB.length / input.b.likes.length + affinity * 2 - (avoidA.length + avoidB.length) * 4;
      return { ...place, hitsA, hitsB, avoidA, avoidB, foodA, foodB, evidenceA, evidenceB, score };
    })
    .sort(compareRank);
}

export async function findDinner(input: DinnerRequest): Promise<RankedPlace[]> {
  const likeTerms = [...new Set([...input.a.likes, ...input.b.likes, ...(input.requiredFood ?? [])])];
  const avoidTerms = [...new Set([...input.a.avoids, ...input.b.avoids, ...(input.messageAvoids ?? [])])];
  const retryBudget = { remaining: 1 };
  // Sequential lookups stop immediately on failure instead of leaving a fan-out running.
  const resolved = new Map<string, TagHit | null>();
  for (const term of [...new Set(["restaurant", ...likeTerms, ...avoidTerms])]) resolved.set(term, await searchTags(term, retryBudget));
  const restaurant = resolved.get("restaurant");
  const likeTags = likeTerms.map(term => resolved.get(term) ?? null);
  const avoidTags = avoidTerms.map(term => resolved.get(term) ?? null);
  if (!restaurant || !/urn:tag:genre:place:restaurant$/.test(restaurant.id)) {
    throw new Error("Restaurant category could not be resolved");
  }
  const tagsFor = (terms: string[]) => terms.map(term => likeTags[likeTerms.indexOf(term)]).filter(Boolean);
  if (!tagsFor(input.a.likes).length || !tagsFor(input.b.likes).length) {
    throw new Error("Qloo could not resolve dining preferences for both friends");
  }
  const signals = [...new Set(likeTags.filter((tag): tag is TagHit => tag != null).map(tag => tag.id))];
  const excludes = [...new Set(avoidTags.filter((tag): tag is TagHit => tag != null).map(tag => tag.id))];
  const budget = budgetById(input.budget);
  const params: Record<string, string | number | undefined> = {
    "filter.type": "urn:entity:place", take: 30,
    "filter.tags": restaurant.id,
    "signal.interests.tags": signals.join(","),
    "filter.exclude.tags": excludes.join(","),
    "operator.exclude.tags": "union",
    "filter.exclude.entities": input.excludeIds.join(","),
    "filter.price_level.max": budget.max ?? undefined,
  };
  if (input.location.latitude != null && input.location.longitude != null) {
    params["filter.location"] = `POINT(${input.location.longitude} ${input.location.latitude})`;
    params["filter.location.radius"] = input.location.radiusMeters;
  } else {
    params["filter.location.query"] = input.location.locality;
    params["filter.location.radius"] = 0;
  }
  if (process.env.DINING_DIAGNOSTICS === "true") console.info("Dining Qloo search", JSON.stringify({priceMax:budget.max,locationId:input.location.id,radiusMeters:input.location.radiusMeters,excludedCount:input.excludeIds.length}));
  const places = extractPlaces(await qlooGet("/v2/insights", params, retryBudget));
  const eligible = places.filter(place =>
    !input.excludeIds.includes(place.id) &&
    distanceFromCentre(place, input.location) != null && distanceFromCentre(place, input.location)! <= input.location.radiusMeters &&
    (input.requiredFood ?? []).every(term => preferenceEvidence(place, [term]).some(e => e.kind === "food")) &&
    !matchTerms(place, input.messageAvoids ?? []).length &&
    (budget.max == null || (place.priceLevel != null && place.priceLevel <= budget.max))
  );
  return rankPlaces(eligible, input)
    .filter(place => !place.avoidA.length && !place.avoidB.length)
    .slice(0, 3);
}

function failureMessage(error: unknown): string {
  if (error instanceof UsageError && !error.limiter && /configuration|shared usage/i.test(error.message)) {
    console.warn("Dining protection unavailable", error.message);
    return DINING_UNAVAILABLE;
  }
  if (error instanceof UsageError) return error.message;
  if (error instanceof QlooHttpError) {
    if (error.status === 401) {
      console.warn("Dining configuration unavailable: verify QLOO_API_KEY and entitlement for https://hackathon.api.qloo.com (HTTP 401). See README Setup.");
      return DINING_UNAVAILABLE;
    }
    if (error.status === 429) return error.retryAt
      ? `Qloo is rate limited. Retry after ${new Date(error.retryAt).toISOString()}. Your profiles are still here.`
      : "The dining service is busy. Retry later; your profiles are still here.";
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "The search took too long. Retry when you're ready.";
  }
  return "We couldn't finish the search. Retry without losing your profiles.";
}

async function runDinner(data: unknown): Promise<DinnerResponse> {
  const input = requestSchema.parse(data);
  if (!qlooKey()) {
    console.warn("Dining configuration unavailable: configure QLOO_API_KEY on the server. See README Setup.");
    return {ok:false,code:"unconfigured",message:DINING_UNAVAILABLE};
  }
  if (![input.a, input.b].every(diner => diner.likes.some(isSubstantivePreference))) return {
    ok: false, code: "empty",
    message: "Add a food or cuisine preference for each friend. Drinks and atmosphere alone do not qualify.",
  };
  try {
    const signature = effectiveSearchKey(input);
    const cached = await cacheRead<RankedPlace[]>(`search:${signature}`);
    let ranked: RankedPlace[];
    if (cached) ranked = cached;
    else {
      let pending = searches.get(signature);
      if (!pending) {
        pending = withSearchLease(signature, async () => {
          const result = await findDinner(input);
          await cacheWrite(`search:${signature}`, result, 300);
          return result;
        });
        searches.set(signature, pending);
      }
      try { ranked = await pending; } finally { if (searches.get(signature) === pending) searches.delete(signature); }
    }
    if (!ranked[0]?.foodA.length || !ranked[0]?.foodB.length) return {
      ok: false, code: "empty",
      message: `No dinner match with supported food preferences for both ${input.a.name} and ${input.b.name} was found ${locationSearchLabel(input.location)} at this budget. Drinks and atmosphere alone do not qualify.`,
    };
    const names = { a: input.a.name, b: input.b.name };
    const budget = budgetById(input.budget);
    return {
      ok: true, summary: `A short list for ${names.a} and ${names.b} ${locationSearchLabel(input.location)}.`,
      locationLabel: locationSearchLabel(input.location), budgetLabel: `${budget.label} ${budget.hint}`, names,
      best: toCard(ranked[0]!, names, input.location), alternatives: ranked.slice(1).map(place => toCard(place, names, input.location)),
      rankingReason: explainPrimaryRank(ranked[0]!, ranked.slice(1)),
    };
  } catch (error) {
    console.error("recommendDinner failed", error instanceof QlooHttpError ? error.status : error instanceof Error ? error.name : "unknown");
    return { ok: false, code: "error", message: failureMessage(error) };
  }
}

export async function recommendDinnerService(data: unknown): Promise<DinnerResponse> {
  const parsed = requestSchema.parse(data);
  let input: DinnerRequest;
  try { input = canonicalLocation(parsed); }
  catch (error) { return {ok:false,code:"empty",message:failureMessage(error)}; }
  const key = qlooKey() ?? "";
  if (key !== activeKey) { client = newClient(); activeKey = key; tagCache.clear(); tagRequests.clear(); searches.clear(); }
  return runDinner(input);
}

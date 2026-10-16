export type BudgetId = "low" | "mid" | "high" | "any";

export type Diner = {
  name: string;
  likes: string[];
  avoids: string[];
};

export type LocationChoice = {
  id: string;
  label: string;
  locality: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
};

export type DinnerRequest = {
  message: string;
  location: LocationChoice;
  budget: BudgetId;
  a: Diner;
  b: Diner;
  history: { role: "user" | "assistant"; text: string }[];
  excludeIds: string[];
  requiredFood?: string[];
  messageAvoids?: string[];
};

export type VenueTag = { name: string; matched: boolean };
export type PreferenceEvidence = { preference: string; tagId: string; tagName: string; kind: "food" | "supporting" };

export type VenueCard = {
  id: string;
  name: string;
  where: string | null;
  priceLabel: string | null;
  ratingLabel: string | null;
  imageUrl: string | null;
  tags: VenueTag[];
  forA: string;
  forB: string;
  shared: string;
  dinnerEvidence: "both" | "partial" | "weak";
  cuisines: string[];
  address: string | null;
  distanceMeters: number | null;
  evidenceA: PreferenceEvidence[];
  evidenceB: PreferenceEvidence[];
};

export type DinnerSuccess = {
  ok: true;
  summary: string;
  locationLabel: string;
  budgetLabel: string;
  names: { a: string; b: string };
  best: VenueCard;
  alternatives: VenueCard[];
  rankingReason: string;
  searchMode?: "ai" | "profile";
  instructionNotice?: string;
};

export type DinnerFailure = {
  ok: false;
  code: "empty" | "error" | "unconfigured";
  message: string;
  searchMode?: "ai" | "profile";
};

export type DinnerResponse = DinnerSuccess | DinnerFailure;

export const LIKE_OPTIONS = [
  "Japanese",
  "Italian",
  "Seafood",
  "Pasta",
  "Wine",
  "Quiet",
  "Lively",
  "Shared plates",
  "Vegetables",
  "Ramen",
  "Pizza",
  "Thai",
  "Mexican",
  "Indian",
  "Korean",
  "Vegetarian",
  "Sushi",
  "Grill",
] as const;

export const AVOID_OPTIONS = [
  "Fast food",
  "Very spicy",
  "Seafood",
  "Raw fish",
  "Red meat",
  "Loud rooms",
  "Sushi",
] as const;

export const LOCATIONS: LocationChoice[] = [
  {
    id: "west-village",
    label: "West Village",
    locality: "New York",
    latitude: 40.7358,
    longitude: -74.0036,
    radiusMeters: 2500,
  },
  {
    id: "shoreditch",
    label: "Shoreditch",
    locality: "London",
    latitude: 51.5265,
    longitude: -0.0795,
    radiusMeters: 2500,
  },
  {
    id: "le-marais",
    label: "Le Marais",
    locality: "Paris",
    latitude: 48.857,
    longitude: 2.359,
    radiusMeters: 2000,
  },
  {
    id: "north-beach",
    label: "North Beach",
    locality: "San Francisco",
    latitude: 37.806,
    longitude: -122.41,
    radiusMeters: 2200,
  },
  {
    id: "wuse-ii",
    label: "Wuse II, Abuja",
    locality: "Abuja, Nigeria",
    // OpenStreetMap Wuse II District node 31384766, verified 2026-10-15.
    latitude: 9.0761981,
    longitude: 7.4759718,
    radiusMeters: 2500,
  },
  {
    id: "maitama", label: "Maitama, Abuja", locality: "Abuja, Nigeria",
    // OpenStreetMap Maitama District node 8329790549, verified 2026-10-16.
    latitude: 9.0900989, longitude: 7.4908053, radiusMeters: 2500,
  },
];

export const DEFAULT_LOCATION_ID = "wuse-ii";
export const FEATURED_LOCATION_IDS: readonly string[] = ["wuse-ii", "maitama"];
export function locationSearchLabel(location: LocationChoice): string {
  return location.latitude === null || location.longitude === null ? location.label : `within ${location.radiusMeters / 1000} km of ${location.label}`;
}

export const BUDGETS: { id: BudgetId; label: string; hint: string; max: number | null }[] = [
  { id: "low", label: "$", hint: "Low", max: 1 },
  { id: "mid", label: "$$", hint: "Mid", max: 2 },
  { id: "high", label: "$$$", hint: "High", max: 3 },
  { id: "any", label: "Any", hint: "Open", max: null },
];

export const DEFAULT_A: Diner = {
  name: "Maya",
  likes: ["Japanese", "Seafood", "Wine", "Quiet"],
  avoids: ["Very spicy", "Fast food"],
};

export const DEFAULT_B: Diner = {
  name: "Leo",
  likes: ["Italian", "Pasta", "Wine", "Shared plates"],
  avoids: ["Fast food"],
};

export const SUGGESTED_PROMPT = "Food tonight?";

export function budgetById(id: BudgetId) {
  return BUDGETS.find((item) => item.id === id) ?? BUDGETS[1]!;
}

export function priceLabel(level: number | null): string | null {
  if (level == null || !Number.isInteger(level) || level < 1 || level > 4) return null;
  return `Price level ${"$".repeat(level)}`;
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function isSubstantivePreference(term: string): boolean {
  return !/\b(wine|beer|cocktails?|spirits?|drinks?|coffee|tea|quiet|lively|loud|romantic|cozy|cosy|ambien[ct]|atmosphere)\b/i.test(term);
}

export function lineFor(name: string, hits: string[], avoids: string[], foodHits = hits.filter(isSubstantivePreference)): string {
  if (hits.length && avoids.length) {
    return `Matches ${joinList(hits)} for ${name}, but also ${joinList(avoids)}, which ${name} would rather skip.`;
  }
  if (hits.length) {
    if (!foodHits.length) return `Matches ${joinList(hits)} for ${name}, but no food preference is directly supported. Dinner fit is uncertain.`;
    const supporting = hits.filter(hit => !foodHits.includes(hit));
    return `Food: ${joinList(foodHits)}.${supporting.length ? ` Also: ${joinList(supporting)}.` : ""}`;
  }
  if (avoids.length) {
    return `No direct taste match, and it is tagged ${joinList(avoids)}, which ${name} avoids.`;
  }
  return `No direct taste evidence for ${name}; dinner fit is uncertain.`;
}

export function sharedLine(nameA: string, nameB: string, hitsA: string[], hitsB: string[], foodA = hitsA.filter(isSubstantivePreference), foodB = hitsB.filter(isSubstantivePreference)): string {
  if (!foodA.length && !foodB.length) return "No direct food match for either friend. Drinks or atmosphere overlap is weak evidence for dinner.";
  if (!foodA.length || !foodB.length) return `Food evidence is stronger for ${foodA.length ? nameA : nameB}. No direct food match for ${foodA.length ? nameB : nameA}; dinner compatibility is limited.`;
  if (hitsA.length && hitsB.length) {
    return `Covers ${joinList(hitsA)} for ${nameA} and ${joinList(hitsB)} for ${nameB}.`;
  }
  if (hitsA.length) {
    return `Clearer evidence for ${nameA} (${joinList(hitsA)}) than for ${nameB}.`;
  }
  if (hitsB.length) {
    return `Clearer evidence for ${nameB} (${joinList(hitsB)}) than for ${nameA}.`;
  }
  return `Ranked from the combined signals, without a direct tag for either person.`;
}

export function shareText(result: DinnerSuccess): string {
  const lines = [
    `Out2Eat · ${result.locationLabel}`,
    result.searchMode === "profile" ? "Profile-based search" : result.searchMode === "ai" ? "AI-guided search" : null,
    result.instructionNotice,
    result.summary,
    "",
    `${result.best.dinnerEvidence === "both" ? "Best fit for both" : "Dinner option to consider"}: ${result.best.name}`,
    result.best.where,
    result.best.priceLabel,
    result.best.address,
    result.rankingReason,
    `${result.names.a}: ${result.best.forA}`,
    `${result.names.b}: ${result.best.forB}`,
  ];
  for (const alt of result.alternatives) {
    lines.push("", `Also considered: ${alt.name}`, alt.where, alt.priceLabel);
  }
  lines.push("", "From Qloo taste data. Hours and tables are not checked. Avoids are preference exclusions, not allergy guarantees.");
  return lines.filter((line) => line != null).join("\n");
}

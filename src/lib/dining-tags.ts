// Stable taxonomy IDs verified in Qloo's recorded Wuse response (2026-10-15).
// This is a tag catalogue, never a restaurant-result fallback. Every search
// uses Qloo Insights with location, price and both profiles on a cache miss.
export const DINING_TAGS: Record<string, { id: string; name: string; type: string }> = {
  restaurant: { id: "urn:tag:genre:place:restaurant", name: "Restaurant", type: "urn:tag:genre:place" },
  seafood: { id: "urn:tag:cuisine:qloo:seafood", name: "Seafood", type: "urn:tag:cuisine:qloo" },
  italian: { id: "urn:tag:cuisine:qloo:italian", name: "Italian", type: "urn:tag:cuisine:qloo" },
  wine: { id: "urn:tag:offerings:place:wine", name: "Wine", type: "urn:tag:offerings:place" },
  quiet: { id: "urn:tag:ambience:qloo:quiet", name: "Quiet", type: "urn:tag:ambience:qloo" },
  "fast food": { id: "urn:tag:genre:place:restaurant:fast_food", name: "Fast food", type: "urn:tag:genre:place" },
};

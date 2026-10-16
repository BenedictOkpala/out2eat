# Maitama and Jabi dining coverage

Verified 16 October 2026. Maitama is now a verified example alongside Wuse II.
Wuse II is the default for new sessions; saved choices are preserved.
Jabi returned venues but no mutual food match for the tested profiles,
Mid budget and radius. The finding is specific to those tested constraints.

Searches are **within 2.5 km of each area's centre point**. Circles can cross
district boundaries. This coverage audit is not an AI-language test.

## Fixed comparison

- Maya: Japanese, Seafood, Wine, Quiet; avoids Very spicy and Fast food.
- Leo: Italian, Pasta, Wine, Shared plates; avoids Fast food.
- Mid budget: returned Qloo price level must be known and no greater than 2.
- Strict 2,500 m straight-line radius, calculated using haversine distances.
- No previously shown exclusions, extra message preferences, area widening
  or fallback to another geographic location.

## Centre points

Read directly from the OpenStreetMap node API, including the `name` and
`place=suburb` tags, and cross-checked against the corresponding Mapcarta pages.
These are representative named district points, not surveyed polygon centroids.
The circles can cross administrative district boundaries; eligibility uses
coordinates and distance rather than a venue's marketing name or address label.

| Area | Latitude | Longitude | Primary source |
| --- | --- | --- | --- |
| Maitama District | 9.0900989 | 7.4908053 | [OSM node 8329790549](https://www.openstreetmap.org/node/8329790549) |
| Jabi District | 9.0646229 | 7.4210076 | [OSM node 8337332089](https://www.openstreetmap.org/node/8337332089) |

Cross-checks: [Maitama](https://mapcarta.com/N8329790549),
[Jabi](https://mapcarta.com/N8337332089). OpenStreetMap data is attributed to
OpenStreetMap contributors and is subject to its ODbL terms, not the code MIT grant.

## Coverage summary

At Mid budget with Maya and Leo, the controlled Maitama search returned venues
and qualifying mutual food matches. The Jabi search returned venues but no
mutual food match for those constraints. Maitama is a verified example; Jabi's
finding does not establish a general absence of dining coverage.

Raw responses and restaurant-by-restaurant coordinates, prices and evidence
remain private. No additional live calls were made for release cleanup.

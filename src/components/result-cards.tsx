import { useState } from "react";
import type { DinnerSuccess, VenueCard } from "@/lib/dining";

function Photo({ src, small = false }: { src: string; small?: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (hidden) return null;
  return <img src={src} alt="" className={loaded ? `venue-photo shrink-0 rounded-xl object-cover ${small ? "size-14" : "size-20"}` : "hidden"} onLoad={() => setLoaded(true)} onError={() => setHidden(true)} />;
}

function Facts({ venue }: { venue: VenueCard }) {
  const distance = venue.distanceMeters != null ? `${(venue.distanceMeters / 1000).toFixed(2)} km from search centre` : null;
  const bits = [venue.priceLabel, venue.ratingLabel].filter(Boolean);
  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-sm">
      {!!venue.cuisines?.length && <p className="font-medium text-accent-fg"><span className="text-muted">Returned cuisines: </span>{venue.cuisines.slice(0, 3).join(" · ")}</p>}
      {bits.length > 0 && <p className="text-muted">{bits.join(" · ")}</p>}
      {(venue.address || distance || venue.where) && <details className="text-muted">
        <summary className="min-h-11 cursor-pointer content-center">Location details</summary>
        {venue.address ? <p className="break-words">{venue.address}</p> : venue.where ? <p>{venue.where}</p> : null}
        {distance && <p>{distance} (straight-line)</p>}
      </details>}
    </div>
  );
}

function Fit({ label, name, text }: { label: string; name: string; text: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface p-3">
      <p className="text-sm font-semibold">{label}</p>
      <p className="mb-1 break-words text-xs text-muted">{name}</p>
      <p className="break-words text-sm leading-5">{text}</p>
    </div>
  );
}

export function ResultCards({ result }: { result: DinnerSuccess }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-base leading-6">{result.summary}</p>
      {result.instructionNotice && <p className="text-sm leading-5 text-muted">{result.instructionNotice}</p>}
      <article aria-label="Primary dinner recommendation" className="card-best rise overflow-hidden p-4">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted">Out2Eat · {result.locationLabel}</p>
          {result.searchMode && <p className="text-xs font-medium text-muted">{result.searchMode === "profile" ? "Profile-based search" : "AI-guided search"}</p>}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="mb-1 text-sm font-semibold text-primary">{result.best.dinnerEvidence === "both" ? "Best fit for both" : "Dinner option to consider"}</p>
              <h3 className="font-display text-2xl leading-tight break-words">{result.best.name}</h3>
            </div>
            {result.best.imageUrl && <Photo key={result.best.imageUrl} src={result.best.imageUrl} />}
          </div>
          <Facts venue={result.best} />
          <div className="grid grid-cols-2 gap-2" aria-label="Taste evidence for both friends">
            <Fit label="For you" name={result.names.a} text={result.best.forA} />
            <Fit label="For your friend" name={result.names.b} text={result.best.forB} />
          </div>
          {result.best.dinnerEvidence !== "both" && <p className="text-sm text-muted">{result.best.shared}</p>}
          {result.rankingReason && <div className="border-t border-line pt-3">
            <p className="mb-1 text-sm font-semibold">Why this comes first</p>
            <p className="text-sm leading-5">{result.rankingReason}</p>
          </div>}
          <p className="text-xs leading-4 text-muted">Qloo taste evidence. Avoids are preferences, not allergy guarantees.</p>
        </div>
      </article>
      {result.alternatives.length > 0 && <p className="text-sm font-medium text-muted">Alternatives</p>}
      {result.alternatives.map((venue, index) => (
        <article key={venue.id} aria-label={`Alternative ${index + 1}`} className="card rise p-4" style={{ animationDelay: `${120 * (index + 1)}ms` }}>
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="min-w-0 text-lg leading-snug font-semibold break-words">{venue.name}</h3>
              {venue.imageUrl && <Photo key={venue.imageUrl} src={venue.imageUrl} small />}
            </div>
            <Facts venue={venue} />
            <div className="grid grid-cols-2 gap-2">
              <Fit label="For you" name={result.names.a} text={venue.forA} />
              <Fit label="For your friend" name={result.names.b} text={venue.forB} />
            </div>
            {venue.dinnerEvidence !== "both" && <p className="text-sm leading-5 text-muted">{venue.shared}</p>}
          </div>
        </article>
      ))}
      <p className="text-sm text-muted">Hours and tables are not checked. Avoids are preference exclusions, not allergy guarantees. Confirm dietary needs with the restaurant.</p>
    </div>
  );
}

export function ResultSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="bg-surface-2 h-5 w-4/5 animate-pulse rounded-full motion-reduce:animate-none" />
      <div className="card-best h-72 animate-pulse motion-reduce:animate-none" />
      <div className="card h-36 animate-pulse motion-reduce:animate-none" />
    </div>
  );
}

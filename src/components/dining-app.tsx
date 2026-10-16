import { useEffect, useId, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Send, Share2, Utensils } from "lucide-react";
import { recommendDinner } from "@/lib/dinner.functions";
import { createUiId } from "@/lib/ui-id";
import {
  BUDGETS,
  DEFAULT_A,
  DEFAULT_B,
  LOCATIONS,
  DEFAULT_LOCATION_ID,
  FEATURED_LOCATION_IDS,
  locationSearchLabel,
  SUGGESTED_PROMPT,
  budgetById,
  shareText,
  type BudgetId,
  type DinnerRequest,
  type DinnerSuccess,
  type Diner,
  type LocationChoice,
} from "@/lib/dining";
import { Button } from "@/components/ui/button";
import { ProfileSheet } from "@/components/profile-sheet";
import { ResultCards, ResultSkeleton } from "@/components/result-cards";

type ThreadItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "loading" }
  | { id: string; kind: "empty" | "error"; message: string }
  | { id: string; kind: "result"; result: DinnerSuccess };

const STORAGE_KEY = "out2eat.v1";

type Stored = {
  a: Diner;
  b: Diner;
  locationId: string;
  custom: string;
  budget: BudgetId;
};

function loadStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    const validDiner = (diner: Diner) => diner && typeof diner.name === "string" && diner.name.trim().length > 0 && diner.name.length <= 40 &&
      Array.isArray(diner.likes) && diner.likes.length <= 8 && Array.isArray(diner.avoids) && diner.avoids.length <= 8 &&
      [...diner.likes, ...diner.avoids].every(item => typeof item === "string" && item.trim().length > 0 && item.length <= 40);
    if (!validDiner(parsed?.a) || !validDiner(parsed?.b) || !BUDGETS.some(item => item.id === parsed.budget) ||
      typeof parsed.custom !== "string" || parsed.custom.length > 80 || typeof parsed.locationId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function ProfileCard({ diner, label, onEdit }: { diner: Diner; label: string; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const initial = diner.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <article className="card flex min-w-0 flex-col gap-3 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-fg">
          {initial}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{diner.name}</h2>
      </div>
      <ul id={detailsId} className="flex flex-wrap gap-1.5">
        {(expanded ? diner.likes : diner.likes.slice(0, 3)).map((like) => (
          <li key={like} className="min-w-0 max-w-full break-words rounded-full bg-accent px-2 py-1 text-sm text-accent-fg">
            {like}
          </li>
        ))}
        {(diner.likes.length > 3 || diner.avoids.length > 2) && (
          <li>
            <button type="button" aria-expanded={expanded} aria-controls={detailsId}
              aria-label={`${expanded ? "Show fewer" : "Show all"} tastes for ${diner.name}`}
              className="tap min-h-11 rounded-full bg-surface-2 px-2 py-1 text-sm text-muted"
              onClick={() => setExpanded(value => !value)}>
              {expanded ? "Show less" : diner.likes.length > 3 ? `+${diner.likes.length - 3} more` : "Show more"}
            </button>
          </li>
        )}
      </ul>
      {diner.avoids.length > 0 && (
        <p className="text-sm text-muted">Dislikes {(expanded ? diner.avoids : diner.avoids.slice(0, 2)).join(", ")}{!expanded && diner.avoids.length > 2 ? "..." : ""}</p>
      )}
      <Button variant="quiet" className="mt-auto w-full" onClick={onEdit}>
        {label}
      </Button>
    </article>
  );
}

export function DiningApp() {
  const ask = useServerFn(recommendDinner);
  const [a, setA] = useState<Diner>({ name: "You", likes: [], avoids: [] });
  const [b, setB] = useState<Diner>({ name: "Friend", likes: [], avoids: [] });
  const [locationId, setLocationId] = useState(DEFAULT_LOCATION_ID);
  const [custom, setCustom] = useState("");
  const [budget, setBudget] = useState<BudgetId>("mid");
  const [editing, setEditing] = useState<"a" | "b" | null>(null);
  const [draft, setDraft] = useState(SUGGESTED_PROMPT);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [setupOpen, setSetupOpen] = useState(true);
  const [shareNote, setShareNote] = useState("");
  const [manualShare, setManualShare] = useState("");
  const lock = useRef(false);
  const lastRequest = useRef<DinnerRequest | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = loadStored();
    if (stored) {
      setA(stored.a);
      setB(stored.b);
      setLocationId(LOCATIONS.some(item => item.id === stored.locationId) ? stored.locationId : DEFAULT_LOCATION_ID);
      setCustom(stored.custom || "");
      setBudget(stored.budget || "mid");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const payload: Stored = { a, b, locationId, custom, budget };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch { /* Storage can be unavailable. */ }
  }, [ready, a, b, locationId, custom, budget]);

  useEffect(() => {
    if (thread.length === 0) return;
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [thread, pending, setupOpen]);

  const preset = LOCATIONS.find((item) => item.id === locationId) ?? LOCATIONS.find(item => item.id === DEFAULT_LOCATION_ID)!;
  const customLabel = custom.trim();
  const location: LocationChoice = customLabel
    ? {
        id: "custom",
        label: customLabel,
        locality: customLabel,
        latitude: null,
        longitude: null,
        radiusMeters: 12000,
      }
    : preset;

  const buildRequest = (message: string): DinnerRequest => {
    const history: { role: "user" | "assistant"; text: string }[] = [];
    const excludeIds: string[] = [];
    for (const item of thread) {
      if (item.kind === "user") history.push({ role: "user", text: item.text });
      if (item.kind === "result") {
        history.push({ role: "assistant", text: item.result.summary });
        excludeIds.push(item.result.best.id, ...item.result.alternatives.map((venue) => venue.id));
      }
    }
    return {
      message,
      location,
      budget,
      a,
      b,
      history: history.slice(-6),
      excludeIds: [...new Set(excludeIds)].slice(-12),
    };
  };

  const send = async (message: string, echo = true) => {
    const text = message.trim();
    if (!text || lock.current || !a.likes.length || !b.likes.length) return;
    lock.current = true;
    const request = buildRequest(text);
    lastRequest.current = request;
    setPending(true);
    setShareNote("");
    setManualShare("");
    setDraft("");
    setSetupOpen(false);
    setThread((current) => [
      ...(echo ? [...current, { id: createUiId(), kind: "user" as const, text }] : current),
      { id: createUiId(), kind: "loading" },
    ]);
    try {
      const response = await ask({ data: request });
      setThread((current) => {
        const next = current.filter((item) => item.kind !== "loading");
        if (response.ok) {
          next.push({ id: createUiId(), kind: "result", result: response });
        } else if (response.code === "empty") {
          next.push({ id: createUiId(), kind: "empty", message: response.message });
        } else {
          next.push({ id: createUiId(), kind: "error", message: response.message });
        }
        return next;
      });
    } catch {
      setThread((current) => {
        const next = current.filter((item) => item.kind !== "loading");
        next.push({
          id: createUiId(),
          kind: "error",
          message: "We couldn't finish the search. Retry without losing your profiles.",
        });
        return next;
      });
    } finally {
      lock.current = false;
      setPending(false);
    }
  };

  const retry = () => {
    const request = lastRequest.current;
    if (!request || pending) return;
    setThread((current) => current.filter((item) => item.kind !== "error" && item.kind !== "empty"));
    void send(request.message, false);
  };

  const lastItem = thread.at(-1);
  const latestResult = lastItem?.kind === "result" ? lastItem : undefined;

  const onShare = async () => {
    if (!latestResult || latestResult.kind !== "result") return;
    const text = shareText(latestResult.result);
    setManualShare("");
    try {
      if (navigator.share) {
        await navigator.share({ title: "Out2Eat", text });
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setShareNote("Copied");
    } catch {
      const field = document.createElement("textarea");
      field.value = text;
      field.readOnly = true;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      let copied = false;
      try { field.focus(); field.select(); field.setSelectionRange(0, text.length); copied = document.execCommand("copy"); }
      catch { /* A manual selection is still available below. */ }
      finally { field.remove(); }
      setShareNote(copied ? "Copied — paste into your messaging app." : "Select and copy the text below.");
      if (!copied) setManualShare(text);
    }
  };

  return (
    <div className="app-shell" data-ready={ready}>
      <header className="flex shrink-0 items-center gap-3 px-4 py-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-primary">
          <Utensils className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-none">Out2Eat</h1>
          <p className="mt-1 text-sm text-muted">Dinner for two</p>
        </div>
      </header>

      <div ref={contentRef} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pt-2 pb-6">
        {!setupOpen && <section className="card flex items-center justify-between gap-2 p-3" aria-label="Dinner context">
          <p className="min-w-0 break-words text-sm"><span className="block font-semibold">{lastRequest.current?.a.name ?? a.name} &amp; {lastRequest.current?.b.name ?? b.name}</span>{locationSearchLabel(lastRequest.current?.location ?? location)} · {budgetById(lastRequest.current?.budget ?? budget).label} {budgetById(lastRequest.current?.budget ?? budget).hint}</p>
          <Button variant="quiet" disabled={pending} onClick={() => setSetupOpen(true)}>Edit setup</Button>
        </section>}
        <div hidden={!setupOpen} className={setupOpen ? "flex flex-col gap-6" : "hidden"}>
        {thread.length > 0 && <Button variant="quiet" onClick={() => setSetupOpen(false)}>Back to dinner</Button>}
        <section className="flex flex-col gap-3" aria-label="Dining profiles">
          <h2 className="text-sm font-medium text-muted">Who's eating</h2>
          <div className="grid grid-cols-2 gap-2">
            <ProfileCard diner={a} label="Your tastes" onEdit={() => setEditing("a")} />
            <ProfileCard diner={b} label={"Friend\u2019s tastes"} onEdit={() => setEditing("b")} />
          </div>
          <Button variant="quiet" disabled={pending} onClick={() => {
            setA(structuredClone(DEFAULT_A)); setB(structuredClone(DEFAULT_B));
            setThread([]); lastRequest.current = null;
          }}>Try example profiles</Button>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted">
            <MapPin className="size-4" aria-hidden="true" />
            Where
          </h2>
          {[true, false].map(featured => (
          <div key={String(featured)}>
            <p className="mb-2 text-xs text-muted">{featured ? "Verified examples" : "Other locations"}</p>
          <div className="grid grid-cols-2 gap-2">
            {LOCATIONS.filter(item => FEATURED_LOCATION_IDS.includes(item.id) === featured).map((item) => {
              const selected = !customLabel && item.id === preset.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setCustom("");
                    setLocationId(item.id);
                  }}
                  className={
                    selected
                      ? "tap min-h-12 rounded-2xl bg-primary px-3 text-sm font-semibold text-primary-fg"
                      : "tap card min-h-12 rounded-2xl px-3 text-sm font-semibold"
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          </div>
          ))}
          <label className="sr-only" htmlFor="custom-place">
            Another city or neighborhood
          </label>
          <input
            id="custom-place"
            value={custom}
            maxLength={80}
            placeholder="Or another city"
            onChange={(event) => setCustom(event.target.value)}
            className="card min-h-12 w-full px-4 text-base outline-none focus-visible:outline-2 focus-visible:outline-primary"
          />
          <p className="text-xs text-muted">{locationSearchLabel(preset)}. Search circles can cross district boundaries. Custom text must name a listed preset; other geographic boundaries cannot yet be verified.</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted">Budget · {budgetById(budget).hint}</h2>
          <div className="grid grid-cols-4 gap-2">
            {BUDGETS.map((item) => {
              const selected = item.id === budget;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setBudget(item.id)}
                  className={
                    selected
                      ? "tap flex min-h-12 flex-col items-center justify-center rounded-2xl bg-primary text-primary-fg"
                      : "tap card flex min-h-12 flex-col items-center justify-center rounded-2xl"
                  }
                >
                  <span className="text-sm font-semibold tabular-nums">{item.label}</span>
                  <span className={selected ? "text-sm text-primary-fg/80" : "text-sm text-muted"}>{item.hint}</span>
                </button>
              );
            })}
          </div>
        </section>

        </div>
        <section className="flex flex-col gap-4" aria-live="polite">
          {thread.length === 0 && (
            <div className="card flex flex-col gap-2 p-4">
              <h2 className="text-lg font-semibold">Food tonight?</h2>
              <p className="text-sm leading-6 text-muted">
                {a.likes.length && b.likes.length
                  ? `Ask and we'll look for a place that suits both ${a.name} and ${b.name} ${locationSearchLabel(location)}.`
                  : "Add tastes for both of you, or try Maya and Leo's example profiles. Then ask for dinner."}
              </p>
            </div>
          )}
          {(setupOpen ? thread : thread.slice(-1)).map((item) => {
            if (item.kind === "user") {
              return (
                <p
                  key={item.id}
                  className="ml-auto max-w-[85%] rounded-2xl bg-primary px-4 py-3 text-sm leading-6 text-primary-fg"
                >
                  {item.text}
                </p>
              );
            }
            if (item.kind === "loading") {
              return (
                <div key={item.id} className="flex flex-col gap-3">
                  <p className="text-sm text-muted">Looking for a place that suits both of you.</p>
                  <ResultSkeleton />
                </div>
              );
            }
            if (item.kind === "result") {
              return <div key={item.id} ref={resultRef}><ResultCards result={item.result} /></div>;
            }
            return (
              <div
                key={item.id}
                className={
                  item.kind === "error"
                    ? "flex flex-col gap-3 rounded-2xl bg-danger-bg p-4 text-danger"
                    : "card flex flex-col gap-3 p-4"
                }
              >
                <p className="text-sm leading-6">{item.message}</p>
                <Button variant={item.kind === "error" ? "primary" : "accent"} onClick={retry} disabled={pending}>
                  {item.kind === "error" ? "Retry" : "Ask again"}
                </Button>
              </div>
            );
          })}
          <div ref={endRef} />
        </section>
      </div>

      <form
        className="composer shrink-0 border-t border-line bg-bg px-4 pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim() || SUGGESTED_PROMPT;
          void send(text);
        }}
      >
        {latestResult?.kind === "result" && (
          <div className="mb-2 flex items-center gap-2">
            <Button variant="quiet" className="min-w-12" onClick={() => void onShare()} disabled={pending}>
              <Share2 className="size-4" aria-hidden="true" />
              Share
            </Button>
            <p className="text-sm text-muted" aria-live="polite">
              {shareNote}
            </p>
          </div>
        )}
        {manualShare && latestResult && <textarea aria-label="Recommendation to copy" readOnly value={manualShare} rows={3}
          onFocus={event => event.currentTarget.select()} className="mb-2 w-full rounded-xl bg-surface p-2 text-sm" />}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="ask">
            Ask for dinner
          </label>
          <input
            id="ask"
            value={draft}
            maxLength={400}
            enterKeyHint="send"
            placeholder={SUGGESTED_PROMPT}
            onChange={(event) => setDraft(event.target.value)}
            className="card min-h-12 min-w-0 flex-1 px-4 text-base outline-none focus-visible:outline-2 focus-visible:outline-primary"
          />
          <button
            type="submit"
            disabled={!ready || pending || !a.likes.length || !b.likes.length}
            aria-label="Send"
            className="tap grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-fg disabled:opacity-50"
          >
            <Send className="size-5" aria-hidden="true" />
          </button>
        </div>
      </form>

      <ProfileSheet
        title={editing === "b" ? "Friend\u2019s tastes" : "Your tastes"}
        diner={editing === "b" ? b : a}
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSave={(next) => {
          if (editing === "b") setB(next);
          else setA(next);
        }}
      />
    </div>
  );
}

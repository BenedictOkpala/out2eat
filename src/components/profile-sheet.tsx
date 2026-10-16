import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import { AVOID_OPTIONS, LIKE_OPTIONS, type Diner } from "@/lib/dining";
import { Button } from "@/components/ui/button";

type ProfileSheetProps = {
  title: string;
  diner: Diner;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (diner: Diner) => void;
};

function Chip({
  label,
  pressed,
  onToggle,
}: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={
        pressed
          ? "tap min-h-12 rounded-full bg-primary px-4 text-sm font-medium text-primary-fg"
          : "tap min-h-12 rounded-full bg-surface-2 px-4 text-sm font-medium text-fg"
      }
    >
      {label}
    </button>
  );
}

export function ProfileSheet({ title, diner, open, onOpenChange, onSave }: ProfileSheetProps) {
  const [draft, setDraft] = useState(diner);
  const [extra, setExtra] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(diner);
      setExtra("");
    }
  }, [open, diner]);

  const toggle = (key: "likes" | "avoids", label: string) => {
    setDraft((current) => {
      const has = current[key].some((item) => item.toLowerCase() === label.toLowerCase());
      if (has) {
        if (key === "likes" && current.likes.length === 1) return current;
        return { ...current, [key]: current[key].filter((item) => item.toLowerCase() !== label.toLowerCase()) };
      }
      return { ...current, [key]: [...current[key], label].slice(0, 8) };
    });
  };

  const addExtra = () => {
    const next = extra.trim().slice(0, 40);
    if (!next) return;
    toggle("likes", next);
    setExtra("");
  };

  const likeLabels = [...new Set([...LIKE_OPTIONS, ...draft.likes])];
  const avoidLabels = [...new Set([...AVOID_OPTIONS, ...draft.avoids])];

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-fg/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] max-w-md flex-col rounded-t-3xl bg-surface outline-none">
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-line" />
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div>
              <Drawer.Title className="font-display text-2xl">{title}</Drawer.Title>
              <Drawer.Description className="mt-1 text-sm text-muted">
                Keep at least one thing they like. Dislikes are preference exclusions, not allergy guarantees.
              </Drawer.Description>
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Name</span>
              <input
                value={draft.name}
                maxLength={40}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                className="min-h-12 rounded-2xl bg-surface-2 px-4 text-base outline-none focus-visible:outline-2 focus-visible:outline-primary"
              />
            </label>
            <fieldset className="min-w-0">
              <legend className="mb-2 text-sm font-medium">Likes</legend>
              <div className="flex flex-wrap gap-2">
                {likeLabels.map((label) => (
                  <Chip
                    key={label}
                    label={label}
                    pressed={draft.likes.some((item) => item.toLowerCase() === label.toLowerCase())}
                    onToggle={() => toggle("likes", label)}
                  />
                ))}
              </div>
            </fieldset>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                addExtra();
              }}
            >
              <label className="sr-only" htmlFor="extra-taste">
                Add a taste
              </label>
              <input
                id="extra-taste"
                value={extra}
                maxLength={40}
                placeholder="Add a taste"
                onChange={(event) => setExtra(event.target.value)}
                className="min-h-12 min-w-0 flex-1 rounded-2xl bg-surface-2 px-4 text-base outline-none focus-visible:outline-2 focus-visible:outline-primary"
              />
              <Button type="submit" variant="accent" className="shrink-0">
                Add
              </Button>
            </form>
            <fieldset className="min-w-0">
              <legend className="mb-2 text-sm font-medium">Dislikes</legend>
              <div className="flex flex-wrap gap-2">
                {avoidLabels.map((label) => (
                  <Chip
                    key={label}
                    label={label}
                    pressed={draft.avoids.some((item) => item.toLowerCase() === label.toLowerCase())}
                    onToggle={() => toggle("avoids", label)}
                  />
                ))}
              </div>
            </fieldset>
            <Button
              className="w-full"
              disabled={!draft.name.trim() || draft.likes.length === 0}
              onClick={() => {
                const name = draft.name.trim().slice(0, 40);
                if (!name || draft.likes.length === 0) return;
                onSave({ ...draft, name });
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

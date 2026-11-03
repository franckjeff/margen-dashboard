import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSignedIn } from "../../auth/AuthProvider";
import { loadingState } from "../../components/ui";
import { keys, useScrapbook, type Scrapbook as SavedScrapbook } from "../../data/queries";
import { formatDateTime } from "../../lib/format";
import { DbError, messageOf, supabase } from "../../lib/supabase";

// How long after the last keystroke the scrapbook saves itself.
const SAVE_DELAY_MS = 1000;

// Each user's own page of ideas on their Dashboard. Nobody else can read it, admins included.
export function Scrapbook() {
  const scrapbook = useScrapbook();
  return (
    <section className="card section scrapbook">
      <h2>Scrapbook</h2>
      {loadingState([scrapbook]) ?? <ScrapbookEditor saved={scrapbook.data ?? null} />}
    </section>
  );
}

function ScrapbookEditor({ saved }: { saved: SavedScrapbook | null }) {
  const { userId } = useSignedIn();
  const queryClient = useQueryClient();
  const [text, setText] = useState(saved?.body ?? "");
  const [savedText, setSavedText] = useState(saved?.body ?? "");
  const { mutate, isPending, isError, error, variables } = useMutation({
    mutationFn: async (body: string) => {
      const { data, error } = await supabase
        .from("scrapbooks")
        .upsert({ user_id: userId, body, updated_at: new Date().toISOString() })
        .select("body, updated_at")
        .single();
      if (error) throw new DbError(error);
      return data;
    },
    onSuccess: (row) => {
      setSavedText(row.body);
      queryClient.setQueryData(keys.scrapbook, row);
    },
  });
  const dirty = text !== savedText;
  // A failed save isn't retried until the text changes again (or the box loses focus).
  const failedNow = isError && variables === text;

  // Saves a moment after typing stops.
  useEffect(() => {
    if (!dirty || isPending || failedNow) return;
    const timer = setTimeout(() => mutate(text), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, dirty, isPending, failedNow, mutate]);

  // Warns before closing the tab with words not saved yet.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const status = failedNow
    ? `Couldn't save: ${messageOf(error)}`
    : dirty || isPending
      ? "Saving…"
      : saved
        ? `Saved ${formatDateTime(saved.updated_at)}`
        : "Only you can see your scrapbook.";

  return (
    <>
      <textarea
        className="scrapbook-text"
        aria-label="Scrapbook"
        aria-describedby="scrapbook-status"
        placeholder="Drop ideas here: anything that comes to mind. Only you can see this."
        value={text}
        maxLength={100000}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (dirty && !isPending) mutate(text);
        }}
      />
      <p id="scrapbook-status" className={`small ${failedNow ? "error-text" : "muted"}`} aria-live="polite">
        {status}
      </p>
    </>
  );
}

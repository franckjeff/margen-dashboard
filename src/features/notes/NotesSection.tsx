import { useRef, type ReactNode } from "react";
import { Count, DateTime } from "../../components/ui";
import { expectRows, useDbAction } from "../../data/mutations";
import { useNotes, type Note } from "../../data/queries";
import { supabase, unwrap } from "../../lib/supabase";

type SubjectColumn = "contact_id" | "athlete_id" | "factory_id" | "organization_id";
type Subject = { contact_id: string } | { athlete_id: string } | { factory_id: string } | { organization_id: string };

export function useDeleteNote() {
  return useDbAction({
    tables: ["notes"],
    run: async (id: string) =>
      expectRows(unwrap(await supabase.from("notes").delete().eq("id", id).select("id")), "The note wasn't deleted. You may not have permission."),
    success: () => null,
    failure: () => "Couldn't delete the note",
  });
}

// A note's heading line: what it's about (before), when and who, then its button (after).
export function NoteMeta({ note, before, after }: { note: Note; before?: ReactNode; after: ReactNode }) {
  return (
    <div className="note-meta">
      {before}
      <DateTime value={note.created_at} />
      {note.author && <span className="note-author">{note.author.email}</span>}
      {after}
    </div>
  );
}

// Notes timeline for a contact, organization, athlete or factory, newest first, with a box to add one.
export function NotesSection({ subject }: { subject: Subject }) {
  const notes = useNotes();
  const input = useRef<HTMLTextAreaElement>(null);
  const [column, subjectId] = Object.entries(subject)[0] as [SubjectColumn, string];
  const own = (notes.data ?? []).filter((n) => n[column] === subjectId);

  // The database stamps the time and author.
  const add = useDbAction({
    tables: ["notes"],
    run: async (body: string) => unwrap(await supabase.from("notes").insert({ ...subject, body })),
    success: () => {
      if (input.current) input.current.value = "";
      return null;
    },
    // What was typed stays in the box, so nothing is lost.
    failure: () => "Couldn't save the note",
  });
  const remove = useDeleteNote();

  // Ready for the next note once the box is enabled again.
  const refocus = () => setTimeout(() => input.current?.focus());

  return (
    <>
      <h2>
        Notes <Count n={own.length} />
      </h2>
      <form
        className="note-form"
        onSubmit={(event) => {
          event.preventDefault();
          const body = input.current?.value.trim();
          if (body) add.mutate(body, { onSettled: refocus });
        }}
      >
        <textarea
          ref={input}
          name="body"
          rows={2}
          aria-label="New note"
          disabled={add.isPending}
          placeholder="Add a note: a call, a conversation, something to remember…"
          // Enter saves the note; Shift+Enter adds a line break.
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
        />
        <p className="muted small">Press Enter to save. Shift+Enter starts a new line.</p>
      </form>
      {own.length ? (
        <ol className="notes-list">
          {own.map((n) => (
            <li key={n.id} className="note">
              <NoteMeta
                note={n}
                after={
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Delete note"
                    title="Delete note"
                    onClick={() => confirm("Delete this note? This can't be undone.") && remove.mutate(n.id)}
                  >
                    ×
                  </button>
                }
              />
              <p className="note-body">{n.body}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty">{notes.isPending ? "Loading…" : "No notes yet."}</p>
      )}
    </>
  );
}

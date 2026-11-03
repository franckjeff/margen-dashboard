import { Link } from "react-router";
import { ListPage } from "../../components/ListPage";
import { useNotice } from "../../components/Notice";
import { BackLink, FormButtons, Missing, OrDash, Optional, PanelHead, QueryGate, loadingState } from "../../components/ui";
import { useDeleteRecord, useSaveRecord } from "../../data/mutations";
import { useAthletes, useNotes, type Athlete } from "../../data/queries";
import { formatDate, fullName, place, plural } from "../../lib/format";
import { deleteMessage, formValues, orNull } from "../../lib/forms";
import { NotesSection } from "../notes/NotesSection";

function AthleteForm({ athlete }: { athlete?: Athlete }) {
  const save = useSaveRecord("athletes");
  const { notify } = useNotice();
  const back = athlete ? `/athletes/${athlete.id}` : "/athletes";
  return (
    <>
      <PanelHead title={athlete ? "Edit athlete" : "New athlete"} close={back} />
      <form
        className="stack"
        onSubmit={(event) => {
          const v = formValues(event);
          const row = { first_name: v.first_name, last_name: v.last_name, state: orNull(v.state), country: orNull(v.country) };
          if (!row.first_name || !row.last_name) return notify("error", "The athlete needs a first and last name.");
          save.mutate({ row, id: athlete?.id, label: fullName(row) });
        }}
      >
        <label>
          First name
          <input name="first_name" required autoFocus autoComplete="off" defaultValue={athlete?.first_name} />
        </label>
        <label>
          Last name
          <input name="last_name" required autoComplete="off" defaultValue={athlete?.last_name} />
        </label>
        <label>
          <Optional>State</Optional>
          <input name="state" autoComplete="off" defaultValue={athlete?.state ?? ""} placeholder="e.g. Hawaii" />
        </label>
        <label>
          <Optional>Country</Optional>
          <input name="country" autoComplete="off" defaultValue={athlete?.country ?? ""} placeholder="e.g. United States" />
        </label>
        <FormButtons label={athlete ? "Save changes" : "Create athlete"} cancel={back} busy={save.isPending} />
      </form>
    </>
  );
}

export function AthletesPage({ id, editing = false }: { id?: string; editing?: boolean }) {
  const athletes = useAthletes();

  // A selected athlete gets its own page; only the "new" form stays in the list's side panel.
  if (id && id !== "new") {
    return (
      <QueryGate queries={[athletes]}>
        {() => {
          const athlete = athletes.data!.find((a) => a.id === id);
          return athlete ? <AthletePage athlete={athlete} editing={editing} /> : <Missing back="/athletes" backLabel="Athletes" what="athlete" />;
        }}
      </QueryGate>
    );
  }

  const all = athletes.data ?? [];
  return (
    <ListPage
      title="Athletes"
      count={all.length}
      newTo="/athletes/new"
      newLabel="New athlete"
      placeholder="Search athletes"
      loading={loadingState([athletes])}
      head={
        <>
          <th>First name</th>
          <th>Last name</th>
          <th>State</th>
          <th>Country</th>
        </>
      }
      rows={all.map((a) => ({
        key: a.id,
        to: `/athletes/${a.id}`,
        search: `${fullName(a)} ${place(a)}`.toLowerCase(),
        cells: (
          <>
            <td>
              <Link to={`/athletes/${a.id}`} className="strong">
                {a.first_name}
              </Link>
            </td>
            <td>{a.last_name}</td>
            <td>
              <OrDash>{a.state}</OrDash>
            </td>
            <td>
              <OrDash>{a.country}</OrDash>
            </td>
          </>
        ),
      }))}
      panel={id === "new" ? <AthleteForm /> : undefined}
    />
  );
}

// Full page for one athlete, laid out like the organization and contact pages.
function AthletePage({ athlete, editing }: { athlete: Athlete; editing: boolean }) {
  const remove = useDeleteRecord("athletes");
  const notes = useNotes();
  const label = fullName(athlete);

  const confirmDelete = () => {
    const noteCount = (notes.data ?? []).filter((n) => n.athlete_id === athlete.id).length;
    const message = deleteMessage(label, [noteCount > 0 && `Its ${plural(noteCount, "note")} will be deleted too.`]);
    if (confirm(message)) remove.mutate({ id: athlete.id, label });
  };

  return (
    <>
      <BackLink to="/athletes">Athletes</BackLink>
      <div className="page-head">
        <div className="title-block">
          <h1>{label}</h1>
          <p className="muted">{place(athlete) || "No location yet"}</p>
        </div>
        {!editing && (
          <>
            <Link to={`/athletes/${athlete.id}/edit`} className="button">
              Edit
            </Link>
            <button type="button" className="danger" onClick={confirmDelete} disabled={remove.isPending}>
              Delete
            </button>
          </>
        )}
      </div>
      <div className="detail-grid">
        <section className="card section">
          {editing ? (
            <AthleteForm athlete={athlete} />
          ) : (
            <>
              <h2>Details</h2>
              <dl className="details">
                <div>
                  <dt>State</dt>
                  <dd>
                    <OrDash>{athlete.state}</OrDash>
                  </dd>
                </div>
                <div>
                  <dt>Country</dt>
                  <dd>
                    <OrDash>{athlete.country}</OrDash>
                  </dd>
                </div>
                <div>
                  <dt>Added</dt>
                  <dd>{formatDate(athlete.created_at)}</dd>
                </div>
              </dl>
            </>
          )}
        </section>
        <section className="card section">
          <NotesSection subject={{ athlete_id: athlete.id }} />
        </section>
      </div>
    </>
  );
}

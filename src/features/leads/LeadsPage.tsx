import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Dialog } from "../../components/Dialog";
import { ListPage, SortHeader } from "../../components/ListPage";
import { useNotice } from "../../components/Notice";
import { BackLink, EmailInput, FormButtons, LeadBadge, Missing, OrDash, Options, PanelHead, QueryGate, loadingState } from "../../components/ui";
import { expectRows, useDbAction, useDeleteRecord, useDeleteRecords, useSaveRecord } from "../../data/mutations";
import { useLeads, useNotes, type Lead } from "../../data/queries";
import { LEAD_STATUSES, LEAD_TEXT_FIELDS } from "../../lib/constants";
import { formatDate, fullName, place, plural } from "../../lib/format";
import { deleteManyMessage, deleteMessage, formValues, orNull } from "../../lib/forms";
import { supabase, unwrap } from "../../lib/supabase";
import { NotesSection } from "../notes/NotesSection";
import { useConfirm } from "../../components/Confirm";

function LeadForm({ lead }: { lead?: Lead }) {
  const save = useSaveRecord("leads");
  const { notify } = useNotice();
  const back = lead ? `/leads/${lead.id}` : "/leads";
  const field = (name: (typeof LEAD_TEXT_FIELDS)[number], label: string, attrs: { type?: string; placeholder?: string } = {}) => (
    <label>
      <span>
        {label} <span className="muted">(optional)</span>
      </span>
      {name === "email" ? (
        <EmailInput name={name} autoComplete="off" defaultValue={lead?.[name] ?? ""} {...attrs} />
      ) : (
        <input name={name} autoComplete="off" defaultValue={lead?.[name] ?? ""} {...attrs} />
      )}
    </label>
  );
  return (
    <>
      {lead && <PanelHead title="Edit lead" close={back} />}
      <form
        className="stack"
        onSubmit={(event) => {
          const v = formValues(event);
          const row = {
            first_name: v.first_name,
            last_name: v.last_name,
            status: v.status,
            ...Object.fromEntries(LEAD_TEXT_FIELDS.map((f) => [f, orNull(v[f])])),
          };
          if (!row.first_name || !row.last_name) return notify("error", "The lead needs a first and last name.");
          save.mutate({ row, id: lead?.id, label: fullName(row) });
        }}
      >
        <div className="field-row">
          <label>
            First name
            <input name="first_name" required autoFocus autoComplete="off" defaultValue={lead?.first_name} />
          </label>
          <label>
            Last name
            <input name="last_name" required autoComplete="off" defaultValue={lead?.last_name} />
          </label>
        </div>
        {field("organization_name", "Organization", { placeholder: "Club, team or event" })}
        {field("email", "Email")}
        {field("phone", "Phone", { type: "tel" })}
        <div className="field-row">
          {field("state", "State")}
          {field("country", "Country")}
        </div>
        {field("source", "Source", { placeholder: "e.g. Referral, website, event" })}
        <label>
          Status
          <select name="status" defaultValue={lead?.status ?? "new"}>
            <Options labels={LEAD_STATUSES} />
          </select>
        </label>
        <FormButtons label={lead ? "Save changes" : "Add lead"} cancel={back} busy={save.isPending} />
      </form>
    </>
  );
}

// Adding a lead happens in a window over the list (#/leads/new); it opens the new one's page.
function AddLead() {
  const navigate = useNavigate();
  return (
    <Dialog title="Add lead" onClose={() => navigate("/leads")}>
      <LeadForm />
    </Dialog>
  );
}

export function LeadsPage({ id, editing = false }: { id?: string; editing?: boolean }) {
  const ask = useConfirm();
  const leads = useLeads();
  const notes = useNotes();
  const removeMany = useDeleteRecords("leads", "leads");

  // A selected lead gets its own page; adding one (#/leads/new) opens a window over the list.
  if (id && id !== "new") {
    return (
      <QueryGate queries={[leads]}>
        {() => {
          const lead = leads.data!.find((l) => l.id === id);
          return lead ? <LeadPage lead={lead} editing={editing} /> : <Missing back="/leads" backLabel="Leads" what="lead" />;
        }}
      </QueryGate>
    );
  }

  const all = leads.data ?? [];
  return (
    <>
      {id === "new" && <AddLead />}
      <ListPage
        title="Leads"
        count={all.length}
        newTo="/leads/new"
        newLabel="Add"
        placeholder="Search leads"
        loading={loadingState([leads])}
        deletion={{
          nouns: "leads",
          busy: removeMany.isPending,
          onDelete: async (ids, done) => {
            const picked = all.filter((l) => ids.includes(l.id));
            const noteCount = (notes.data ?? []).filter((n) => n.lead_id && ids.includes(n.lead_id)).length;
            const message = deleteManyMessage(picked.map(fullName), "leads", [noteCount > 0 && `${plural(noteCount, "note")} will be deleted too.`]);
            if (await ask(message))
              removeMany.mutate(picked.map((l) => ({ id: l.id, label: fullName(l) })), { onSettled: done });
          },
        }}
        head={
          <>
            <SortHeader column="name">Name</SortHeader>
            <SortHeader column="organization">Organization</SortHeader>
            <SortHeader column="status">Status</SortHeader>
            <SortHeader column="added" className="hide-sm" firstDescending>
              Added
            </SortHeader>
          </>
        }
        rows={all.map((l) => ({
          key: l.id,
          to: `/leads/${l.id}`,
          label: fullName(l),
          // Statuses sort in their own order (New, Contacted, …), not A to Z.
          sort: { name: fullName(l), organization: l.organization_name, status: Object.keys(LEAD_STATUSES).indexOf(l.status), added: l.created_at },
          search: `${fullName(l)} ${l.organization_name ?? ""} ${l.email ?? ""} ${place(l)} ${l.source ?? ""} ${LEAD_STATUSES[l.status]}`.toLowerCase(),
          cells: (
            <>
              <td>
                <Link to={`/leads/${l.id}`} className="strong">
                  {fullName(l)}
                </Link>
              </td>
              <td>
                <OrDash>{l.organization_name}</OrDash>
              </td>
              <td>
                <LeadBadge status={l.status} />
              </td>
              <td className="muted hide-sm">{formatDate(l.created_at)}</td>
            </>
          ),
        }))}
      />
    </>
  );
}

// Full page for one lead. The status can be changed right from the header.
function LeadPage({ lead, editing }: { lead: Lead; editing: boolean }) {
  const ask = useConfirm();
  const remove = useDeleteRecord("leads");
  const notes = useNotes();
  const noteCount = (notes.data ?? []).filter((n) => n.lead_id === lead.id).length;
  const label = fullName(lead);
  const setStatus = useDbAction({
    tables: ["leads"],
    run: async (status: string) =>
      expectRows(
        unwrap(await supabase.from("leads").update({ status }).eq("id", lead.id).select("id")),
        `${label} wasn't changed. You may not have permission.`,
      ),
    success: (status) => `${label} is now ${LEAD_STATUSES[status]}.`,
    failure: () => `Couldn't change ${label}`,
  });

  const detail = (term: string, value: ReactNode, wide = false) => (
    <div className={wide ? "wide" : undefined}>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </div>
  );

  return (
    <>
      <BackLink to="/leads">Leads</BackLink>
      <div className="page-head">
        <div className="title-block">
          <h1>
            {label} <LeadBadge status={lead.status} />
          </h1>
          <p className="muted">{[lead.organization_name, place(lead)].filter(Boolean).join(" · ") || "No organization yet"}</p>
        </div>
        {!editing && (
          <>
            <label className="inline-select">
              Status
              <select
                aria-label="Lead status"
                value={lead.status}
                disabled={setStatus.isPending}
                onChange={(e) => setStatus.mutate(e.target.value)}
              >
                <Options labels={LEAD_STATUSES} />
              </select>
            </label>
            <Link to={`/leads/${lead.id}/edit`} className="button">
              Edit
            </Link>
            <button
              type="button"
              className="danger"
              disabled={remove.isPending}
              onClick={async () =>
                (await ask(deleteMessage(label, [noteCount > 0 && `Its ${plural(noteCount, "note")} will be deleted too.`]))) &&
                remove.mutate({ id: lead.id, label })
              }
            >
              Delete
            </button>
          </>
        )}
      </div>
      {/* Full-width blocks, one under the other, like every record page. */}
      <div className="detail-grid stacked">
        <section className="card section">
          {editing ? (
            <LeadForm lead={lead} />
          ) : (
            <>
              <h2>Details</h2>
              <dl className="details across">
                {detail("Organization", <OrDash>{lead.organization_name}</OrDash>)}
                {detail("Email", lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : <OrDash />)}
                {detail("Phone", lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : <OrDash />)}
                {detail("State", <OrDash>{lead.state}</OrDash>)}
                {detail("Country", <OrDash>{lead.country}</OrDash>)}
                {detail("Source", <OrDash>{lead.source}</OrDash>)}
                {detail("Added", formatDate(lead.created_at))}
                {/* What they wrote when they sent a quote request from the home page. */}
                {lead.notes && detail("Message", <p className="notes">{lead.notes}</p>, true)}
              </dl>
            </>
          )}
        </section>
        <section className="card section">
          <NotesSection subject={{ lead_id: lead.id }} />
        </section>
      </div>
    </>
  );
}

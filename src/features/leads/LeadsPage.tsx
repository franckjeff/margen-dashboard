import type { ReactNode } from "react";
import { Link } from "react-router";
import { ListPage } from "../../components/ListPage";
import { useNotice } from "../../components/Notice";
import { BackLink, FormButtons, LeadBadge, Missing, OrDash, Options, PanelHead, QueryGate, loadingState } from "../../components/ui";
import { expectRows, useDbAction, useDeleteRecord, useSaveRecord } from "../../data/mutations";
import { useLeads, type Lead } from "../../data/queries";
import { LEAD_STATUSES, LEAD_TEXT_FIELDS } from "../../lib/constants";
import { formatDate, fullName, place } from "../../lib/format";
import { deleteMessage, formValues, orNull } from "../../lib/forms";
import { supabase, unwrap } from "../../lib/supabase";

function LeadForm({ lead }: { lead?: Lead }) {
  const save = useSaveRecord("leads");
  const { notify } = useNotice();
  const back = lead ? `/leads/${lead.id}` : "/leads";
  const field = (name: (typeof LEAD_TEXT_FIELDS)[number], label: string, attrs: { type?: string; placeholder?: string } = {}) => (
    <label>
      <span>
        {label} <span className="muted">(optional)</span>
      </span>
      <input name={name} autoComplete="off" defaultValue={lead?.[name] ?? ""} {...attrs} />
    </label>
  );
  return (
    <>
      <PanelHead title={lead ? "Edit lead" : "New lead"} close={back} />
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
        {field("email", "Email", { type: "email" })}
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
        <label>
          <span>
            Notes <span className="muted">(optional)</span>
          </span>
          <textarea name="notes" rows={4} defaultValue={lead?.notes ?? ""} />
        </label>
        <FormButtons label={lead ? "Save changes" : "Create lead"} cancel={back} busy={save.isPending} />
      </form>
    </>
  );
}

export function LeadsPage({ id, editing = false }: { id?: string; editing?: boolean }) {
  const leads = useLeads();

  // A selected lead gets its own page; only the "new" form stays in the list's side panel.
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
    <ListPage
      title="Leads"
      count={all.length}
      newTo="/leads/new"
      newLabel="New lead"
      placeholder="Search leads"
      loading={loadingState([leads])}
      head={
        <>
          <th>Name</th>
          <th>Organization</th>
          <th>Status</th>
          <th className="hide-sm">Added</th>
        </>
      }
      rows={all.map((l) => ({
        key: l.id,
        to: `/leads/${l.id}`,
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
      panel={id === "new" ? <LeadForm /> : undefined}
    />
  );
}

// Full page for one lead. The status can be changed right from the header.
function LeadPage({ lead, editing }: { lead: Lead; editing: boolean }) {
  const remove = useDeleteRecord("leads");
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

  const detail = (term: string, value: ReactNode) => (
    <div>
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
              onClick={() => confirm(deleteMessage(label)) && remove.mutate({ id: lead.id, label })}
            >
              Delete
            </button>
          </>
        )}
      </div>
      <div className="detail-grid">
        <section className="card section">
          {editing ? (
            <LeadForm lead={lead} />
          ) : (
            <>
              <h2>Details</h2>
              <dl className="details">
                {detail("Organization", <OrDash>{lead.organization_name}</OrDash>)}
                {detail("Email", lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : <OrDash />)}
                {detail("Phone", lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : <OrDash />)}
                {detail("State", <OrDash>{lead.state}</OrDash>)}
                {detail("Country", <OrDash>{lead.country}</OrDash>)}
                {detail("Source", <OrDash>{lead.source}</OrDash>)}
                {detail("Added", formatDate(lead.created_at))}
              </dl>
            </>
          )}
        </section>
        <section className="card section">
          <h2>Notes</h2>
          {lead.notes ? <p className="notes">{lead.notes}</p> : <p className="empty">No notes yet.</p>}
        </section>
      </div>
    </>
  );
}

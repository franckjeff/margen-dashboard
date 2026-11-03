import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { useSignedIn } from "../../auth/AuthProvider";
import { useNotice } from "../../components/Notice";
import { Count, loadingState } from "../../components/ui";
import {
  keys,
  useAthletes,
  useContacts,
  useDismissals,
  useFactories,
  useLeads,
  useNotes,
  useOrders,
  useOrganizations,
} from "../../data/queries";
import { OPEN_LEAD_STATUSES, OPEN_ORDER_STATUSES, ROLE_LABELS } from "../../lib/constants";
import { fullName } from "../../lib/format";
import { DbError, messageOf, supabase } from "../../lib/supabase";
import { NoteMeta } from "../notes/NotesSection";
import { Scrapbook } from "./Scrapbook";
import { dailyLine, greeting, quoteOfTheDay } from "./welcome";

function Welcome() {
  const { role, firstName } = useSignedIn();
  const [quote, author] = quoteOfTheDay();
  return (
    <div className="welcome-grid">
      <section className="card welcome">
        <p className="eyebrow">Welcome back</p>
        <h1>{greeting(firstName)}</h1>
        <p className="welcome-line">{dailyLine()}</p>
        {!firstName && role === "admin" && (
          <p className="muted small">
            Add your first name on the <Link to="/users">Users</Link> page and we'll greet you by name.
          </p>
        )}
      </section>
      <figure className="card quote">
        <p className="eyebrow">Quote of the day</p>
        <blockquote>“{quote}”</blockquote>
        <figcaption>{author}</figcaption>
      </figure>
    </div>
  );
}

export function DashboardPage() {
  const { role } = useSignedIn();
  if (role === "factory") {
    return (
      <>
        <Welcome />
        <FactoryStats />
        <Scrapbook />
      </>
    );
  }
  if (role !== "admin") {
    return (
      <>
        <Welcome />
        <p className="muted">You're signed in with a {ROLE_LABELS[role]} account. More will appear here soon.</p>
        <Scrapbook />
      </>
    );
  }
  return (
    <>
      <Welcome />
      <AdminStats />
      <Scrapbook />
      <DashboardNotes />
    </>
  );
}

// A factory user's own factory and its orders; the database returns nothing else to them.
function FactoryStats() {
  const factories = useFactories();
  const orders = useOrders();
  const waiting = loadingState([factories, orders]);
  if (waiting) return waiting;
  const factory = factories.data![0];
  if (!factory) {
    return <p className="muted">Your account isn't linked to a factory yet. Ask a MARGEN admin to link it on the Users page.</p>;
  }
  const all = orders.data!;
  const open = all.filter((o) => OPEN_ORDER_STATUSES.includes(o.order_status));
  return (
    <>
      <p className="muted">Orders assigned to {factory.name}.</p>
      <div className="stats">
        <Link to="/customs" className="card stat">
          <span className="stat-label">Open orders</span>
          <span className="stat-value">{open.length}</span>
        </Link>
        <Link to="/customs" className="card stat">
          <span className="stat-label">In production</span>
          <span className="stat-value">{open.filter((o) => o.production_status).length}</span>
        </Link>
        <Link to="/customs" className="card stat">
          <span className="stat-label">All orders</span>
          <span className="stat-value">{all.length}</span>
        </Link>
      </div>
    </>
  );
}

function AdminStats() {
  const orders = useOrders();
  const leads = useLeads();
  const athletes = useAthletes();
  const organizations = useOrganizations();
  const contacts = useContacts();
  const stat = (label: string, value: number | undefined, to: string) => (
    <Link to={to} className="card stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value ?? "…"}</span>
    </Link>
  );
  return (
    <div className="stats">
      {stat("Orders", orders.data?.length, "/customs")}
      {stat("Open leads", leads.data?.filter((l) => OPEN_LEAD_STATUSES.includes(l.status)).length, "/leads")}
      {stat("Athletes", athletes.data?.length, "/athletes")}
      {stat("Organizations", organizations.data?.length, "/organizations")}
      {stat("Contacts", contacts.data?.length, "/contacts")}
      {stat("Links", organizations.data?.reduce((sum, o) => sum + o.contacts.length, 0), "/organizations")}
      {stat("Contacts without an organization", contacts.data?.filter((c) => !c.organizations.length).length, "/contacts")}
    </div>
  );
}

// Notes this user hasn't hidden yet, newest first, each with the contact, organization, athlete or factory it's about.
function DashboardNotes() {
  const notes = useNotes();
  const dismissals = useDismissals();
  const contacts = useContacts();
  const athletes = useAthletes();
  const factories = useFactories();
  const organizations = useOrganizations();
  const queryClient = useQueryClient();
  const { notify } = useNotice();

  // Hides a note from this user's Dashboard at once; the note stays on the page it was added to.
  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("note_dismissals").insert({ note_id: id });
      // Already hidden (e.g. from another tab) is fine.
      if (error && error.code !== "23505") throw new DbError(error);
    },
    onMutate: (id) => queryClient.setQueryData<Set<string>>(keys.dismissals, (ids) => new Set(ids).add(id)),
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey: keys.dismissals });
      notify("error", `Couldn't hide the note: ${messageOf(error)}`);
    },
  });

  const waiting = loadingState([notes, dismissals, contacts, athletes, factories, organizations]);
  if (waiting) return <section className="card section dashboard-notes">{waiting}</section>;

  const visible = notes.data!.filter((n) => !dismissals.data!.has(n.id));
  const subjectOf = (n: (typeof visible)[number]) => {
    if (n.contact_id) {
      const contact = contacts.data!.find((c) => c.id === n.contact_id);
      return { kind: "Contact", to: `/contacts/${n.contact_id}`, name: contact && fullName(contact) };
    }
    if (n.organization_id) {
      const organization = organizations.data!.find((o) => o.id === n.organization_id);
      return { kind: "Organization", to: `/organizations/${n.organization_id}`, name: organization?.name };
    }
    if (n.factory_id) {
      return { kind: "Factory", to: `/factories/${n.factory_id}`, name: factories.data!.find((f) => f.id === n.factory_id)?.name };
    }
    const athlete = athletes.data!.find((a) => a.id === n.athlete_id);
    return { kind: "Athlete", to: `/athletes/${n.athlete_id}`, name: athlete && fullName(athlete) };
  };

  return (
    <section className="card section dashboard-notes">
      <h2>
        Notes <Count n={visible.length} />
      </h2>
      {visible.length ? (
        <ol className="notes-list">
          {visible.map((n) => {
            const { kind, to, name } = subjectOf(n);
            return (
              <li key={n.id} className="note">
                <NoteMeta
                  note={n}
                  before={
                    <>
                      <span className="status tone-accent">{kind}</span>
                      <Link to={to} className="strong">
                        {name ?? "Unknown"}
                      </Link>
                    </>
                  }
                  after={
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Hide this note from the Dashboard"
                      title="Hide from the Dashboard"
                      onClick={() => dismiss.mutate(n.id)}
                    >
                      ×
                    </button>
                  }
                />
                <p className="note-body">{n.body}</p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="empty">No new notes. Notes added to contacts, organizations, athletes and factories appear here until you hide them.</p>
      )}
    </section>
  );
}

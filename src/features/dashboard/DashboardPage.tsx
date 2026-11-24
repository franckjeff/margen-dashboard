import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { useSignedIn } from "../../auth/AuthProvider";
import { useNotice } from "../../components/Notice";
import { Count, loadingState } from "../../components/ui";
import { keys, useDashboardCounts, useDismissals, useFactories, useNotes, useOrders, useOrganizations } from "../../data/queries";
import { ROLE_LABELS, isOpenOrder, orderListOf } from "../../lib/constants";
import { fullName } from "../../lib/format";
import { DbError, messageOf, supabase } from "../../lib/supabase";
import { NoteMeta } from "../notes/NotesSection";
import { AppErrors } from "./AppErrors";
import { OrderFlow } from "./OrderFlow";
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
  if (role === "client") {
    return (
      <>
        <Welcome />
        <ClientStats />
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
      <OrderFlow />
      <AdminStats />
      <Scrapbook />
      <DashboardNotes />
      <AppErrors />
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
  const open = all.filter(isOpenOrder);
  return (
    <>
      <p className="muted">Orders assigned to {factory.name}.</p>
      <div className="stats">
        <Link to="/customs" className="card stat">
          <span className="stat-label">Open orders</span>
          <span className="stat-value">{open.length}</span>
        </Link>
        <Link to="/production-orders" className="card stat">
          <span className="stat-label">In production</span>
          <span className="stat-value">{all.filter((o) => orderListOf(o) === "production-orders").length}</span>
        </Link>
        <Link to="/customs" className="card stat">
          <span className="stat-label">All orders</span>
          <span className="stat-value">{all.length}</span>
        </Link>
      </div>
    </>
  );
}

// A client user's own organization and its orders; the database returns nothing else to them.
function ClientStats() {
  const organizations = useOrganizations();
  const orders = useOrders();
  const waiting = loadingState([organizations, orders]);
  if (waiting) return waiting;
  const organization = organizations.data![0];
  if (!organization) {
    return <p className="muted">Your account isn't linked to an organization yet. Ask a MARGEN admin to link it on the Users page.</p>;
  }
  const all = orders.data!;
  const open = all.filter(isOpenOrder);
  return (
    <>
      <p className="muted">Orders for {organization.name}.</p>
      <div className="stats">
        <Link to="/customs" className="card stat">
          <span className="stat-label">Open orders</span>
          <span className="stat-value">{open.length}</span>
        </Link>
        <Link to="/production-orders" className="card stat">
          <span className="stat-label">In production</span>
          <span className="stat-value">{all.filter((o) => orderListOf(o) === "production-orders").length}</span>
        </Link>
        <Link to="/customs" className="card stat">
          <span className="stat-label">All orders</span>
          <span className="stat-value">{all.length}</span>
        </Link>
      </div>
    </>
  );
}

// Counted by the database in one request, rather than loading each table to count it.
function AdminStats() {
  const counts = useDashboardCounts().data;
  const stat = (label: string, value: number | undefined, to: string) => (
    <Link to={to} className="card stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value ?? "…"}</span>
    </Link>
  );
  return (
    <div className="stats">
      {stat("Orders", counts?.orders, "/customs")}
      {stat("New order requests", counts?.new_order_requests, "/order-requests")}
      {stat("Open leads", counts?.open_leads, "/leads")}
      {stat("Athletes", counts?.athletes, "/athletes")}
      {stat("Organizations", counts?.organizations, "/organizations")}
      {stat("Contacts", counts?.contacts, "/contacts")}
      {stat("Links", counts?.links, "/organizations")}
      {stat("Contacts without an organization", counts?.contacts_without_organization, "/contacts")}
    </div>
  );
}

// Notes this user hasn't hidden yet, newest first, each with the contact, organization, athlete, factory or order it's about.
function DashboardNotes() {
  const notes = useNotes();
  const dismissals = useDismissals();
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

  const waiting = loadingState([notes, dismissals]);
  if (waiting) return <section className="card section dashboard-notes">{waiting}</section>;

  const visible = notes.data!.filter((n) => !dismissals.data!.has(n.id));
  // Each note comes with the name of what it's about (see useNotes).
  const subjectOf = (n: (typeof visible)[number]) => {
    if (n.contact_id) return { kind: "Contact", to: `/contacts/${n.contact_id}`, name: n.contact && fullName(n.contact) };
    if (n.organization_id) return { kind: "Organization", to: `/organizations/${n.organization_id}`, name: n.organization?.name };
    if (n.factory_id) return { kind: "Factory", to: `/factories/${n.factory_id}`, name: n.factory?.name };
    if (n.order_id) return { kind: "Order", to: `/customs/${n.order_id}`, name: n.order?.margen_order_id };
    return { kind: "Athlete", to: `/athletes/${n.athlete_id}`, name: n.athlete && fullName(n.athlete) };
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

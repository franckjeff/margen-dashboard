import { lazy, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes, useParams } from "react-router";
import { SignedInProvider, useSession, useSignedIn } from "./auth/AuthProvider";
import { LoginPage, NoAccess } from "./auth/LoginPage";
import { Layout } from "./components/Layout";
import { useProfile } from "./data/queries";
import { visiblePages, type PageName } from "./lib/constants";

// Each page's code is downloaded the first time it's opened, so the app starts fast however many pages it has.
const AthletesPage = lazy(() => import("./features/athletes/AthletesPage").then((m) => ({ default: m.AthletesPage })));
const ContactsPage = lazy(() => import("./features/contacts/ContactsPage").then((m) => ({ default: m.ContactsPage })));
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const FactoriesPage = lazy(() => import("./features/factories/FactoriesPage").then((m) => ({ default: m.FactoriesPage })));
const ItemsPage = lazy(() => import("./features/items/ItemsPage").then((m) => ({ default: m.ItemsPage })));
const LeadsPage = lazy(() => import("./features/leads/LeadsPage").then((m) => ({ default: m.LeadsPage })));
const OrdersPage = lazy(() => import("./features/orders/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const OrganizationsPage = lazy(() =>
  import("./features/organizations/OrganizationsPage").then((m) => ({ default: m.OrganizationsPage })),
);
const ReportsPage = lazy(() => import("./features/reports/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => import("./features/users/UsersPage").then((m) => ({ default: m.UsersPage })));
import { messageOf } from "./lib/supabase";

const Loading = () => <p className="loading">Loading…</p>;

// :id is a record's id, or "new" (the list with its new-record panel), or "import" on Customs.
function RecordRoute({ render, editing = false }: { render: (id?: string, editing?: boolean) => ReactNode; editing?: boolean }) {
  const { id } = useParams();
  return <>{render(id, editing)}</>;
}

export function App() {
  const session = useSession();
  if (session === undefined) return <Loading />;
  if (!session) return <LoginPage />;
  return <SignedIn key={session.user.id} session={session} />;
}

function SignedIn({ session }: { session: NonNullable<ReturnType<typeof useSession>> }) {
  const profile = useProfile(session.user.id);
  const email = session.user.email ?? "";
  if (profile.isPending) return <Loading />;
  if (profile.isError) return <NoAccess email={email} error={messageOf(profile.error)} />;
  const { role, firstName } = profile.data;
  if (!role) return <NoAccess email={email} />;
  return (
    <SignedInProvider value={{ session, userId: session.user.id, email, role, firstName }}>
      <AppRoutes />
    </SignedInProvider>
  );
}

// Hash URLs (#/customs/<id>) work on any static host with no server set-up, and keep every
// link from the previous version of the app working.
function AppRoutes() {
  const { role } = useSignedIn();
  const home = `/${visiblePages(role)[0].name}`;
  // Hiding a page is only cosmetic: the database's access rules are what protect the data.
  const page = (name: PageName, element: ReactNode) =>
    visiblePages(role).some((p) => p.name === name) ? element : <Navigate to={home} replace />;
  // A list, its "new" panel, a record's page and its edit mode.
  const records = (name: PageName, render: (id?: string, editing?: boolean) => ReactNode) => (
    <Route path={name}>
      <Route index element={page(name, render())} />
      <Route path=":id" element={page(name, <RecordRoute render={render} />)} />
      <Route path=":id/edit" element={page(name, <RecordRoute render={render} editing />)} />
    </Route>
  );

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to={home} replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          {records("customs", (id, editing) => <OrdersPage id={id} editing={editing} />)}
          <Route path="shopify" element={page("shopify", <Placeholder title="Shopify" />)} />
          {records("items", (id, editing) => <ItemsPage id={id} editing={editing} />)}
          {records("factories", (id, editing) => <FactoriesPage id={id} editing={editing} />)}
          {records("athletes", (id, editing) => <AthletesPage id={id} editing={editing} />)}
          {records("leads", (id, editing) => <LeadsPage id={id} editing={editing} />)}
          {records("organizations", (id, editing) => <OrganizationsPage id={id} editing={editing} />)}
          {records("contacts", (id, editing) => <ContactsPage id={id} editing={editing} />)}
          <Route path="reports" element={page("reports", <ReportsPage />)} />
          <Route path="users" element={page("users", <UsersPage />)} />
          <Route path="*" element={<Navigate to={home} replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <>
      <div className="page-head">
        <h1>{title}</h1>
      </div>
      <section className="card">
        <p className="empty">This section isn't set up yet.</p>
      </section>
    </>
  );
}

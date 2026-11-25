import { lazy, Suspense, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes, useParams } from "react-router";
import { SignedInProvider, useRecovery, useSession, useSignedIn } from "./auth/AuthProvider";
import { ChooseOwnPasswordPage, LoginPage, NoAccess, SetPasswordPage } from "./auth/LoginPage";
import { Layout } from "./components/Layout";
import { useProfile } from "./data/queries";
import { visiblePages, type PageName } from "./lib/constants";

// Each page's code is downloaded the first time it's opened, so the app starts fast however many pages it has.
const AccountPage = lazy(() => import("./features/account/AccountPage").then((m) => ({ default: m.AccountPage })));
const AthletesPage = lazy(() => import("./features/athletes/AthletesPage").then((m) => ({ default: m.AthletesPage })));
const ContactsPage = lazy(() => import("./features/contacts/ContactsPage").then((m) => ({ default: m.ContactsPage })));
const EmailSettingsPage = lazy(() => import("./features/emails/EmailSettingsPage").then((m) => ({ default: m.EmailSettingsPage })));
const EmailsPage = lazy(() => import("./features/emails/EmailsPage").then((m) => ({ default: m.EmailsPage })));
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const MyContactsPage = lazy(() => import("./features/contacts/MyContactsPage").then((m) => ({ default: m.MyContactsPage })));
const FactoriesPage = lazy(() => import("./features/factories/FactoriesPage").then((m) => ({ default: m.FactoriesPage })));
// DEMO kit designer: remove this line, the "design" route below and the src/features/designer folder to take it out.
const DesignerPage = lazy(() => import("./features/designer/DesignerPage").then((m) => ({ default: m.DesignerPage })));
const QuotePage = lazy(() => import("./features/quote/QuotePage").then((m) => ({ default: m.QuotePage })));
const OrderEntryPage = lazy(() => import("./features/orderEntry/OrderEntryPage").then((m) => ({ default: m.OrderEntryPage })));
const OrderRequestsPage = lazy(() =>
  import("./features/orderRequests/OrderRequestsPage").then((m) => ({ default: m.OrderRequestsPage })),
);
const GuidePage = lazy(() => import("./features/guide/GuidePage").then((m) => ({ default: m.GuidePage })));
const ItemsPage = lazy(() => import("./features/items/ItemsPage").then((m) => ({ default: m.ItemsPage })));
const LeadsPage = lazy(() => import("./features/leads/LeadsPage").then((m) => ({ default: m.LeadsPage })));
const OrdersPage = lazy(() => import("./features/orders/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const OrganizationsPage = lazy(() =>
  import("./features/organizations/OrganizationsPage").then((m) => ({ default: m.OrganizationsPage })),
);
const ReportsPage = lazy(() => import("./features/reports/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const StatusColorsPage = lazy(() =>
  import("./features/statusColors/StatusColorsPage").then((m) => ({ default: m.StatusColorsPage })),
);
const UsersPage = lazy(() => import("./features/users/UsersPage").then((m) => ({ default: m.UsersPage })));
import { messageOf } from "./lib/supabase";

const Loading = () => <p className="loading">Loading…</p>;

// :id is a record's id, or "new" (the list with its new-record panel), or "import" on Orders.
function RecordRoute({ render, editing = false }: { render: (id?: string, editing?: boolean) => ReactNode; editing?: boolean }) {
  const { id } = useParams();
  return <>{render(id, editing)}</>;
}

// Hash URLs (#/customs/<id>) work on any static host with no server set-up, and keep every
// link from the previous version of the app working.
export function App() {
  return (
    <HashRouter>
      <Routes>
        {/* The public Request a quote page: no sign-in needed. It becomes a lead. */}
        <Route
          path="quote"
          element={
            <Suspense fallback={<Loading />}>
              <QuotePage />
            </Suspense>
          }
        />
        {/* DEMO kit designer, public. */}
        <Route
          path="design"
          element={
            <Suspense fallback={<Loading />}>
              <DesignerPage />
            </Suspense>
          }
        />
        <Route path="*" element={<SignInGate />} />
      </Routes>
    </HashRouter>
  );
}

function SignInGate() {
  const session = useSession();
  const { recovering } = useRecovery();
  if (session === undefined) return <Loading />;
  if (recovering) return <SetPasswordPage />;
  if (!session) return <LoginPage />;
  return <SignedIn key={session.user.id} session={session} />;
}

function SignedIn({ session }: { session: NonNullable<ReturnType<typeof useSession>> }) {
  const profile = useProfile(session.user.id);
  const email = session.user.email ?? "";
  if (profile.isPending) return <Loading />;
  if (profile.isError) return <NoAccess email={email} error={messageOf(profile.error)} />;
  const { role, firstName, disabled, mustChangePassword } = profile.data;
  if (!role) return <NoAccess email={email} />;
  if (disabled) return <NoAccess email={email} disabled />;
  if (mustChangePassword) return <ChooseOwnPasswordPage email={email} onSaved={() => profile.refetch()} />;
  return (
    <SignedInProvider value={{ session, userId: session.user.id, email, role, firstName }}>
      <AppRoutes />
    </SignedInProvider>
  );
}

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
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={home} replace />} />
        <Route path="dashboard" element={page("dashboard", <DashboardPage />)} />
        <Route path="order" element={page("order", <OrderEntryPage />)} />
        {records("customs", (id, editing) => <OrdersPage id={id} editing={editing} />)}
        {/* Orders on these lists open on their usual page, #/customs/<id>. */}
        <Route path="production-orders" element={page("production-orders", <OrdersPage list="production-orders" />)} />
        <Route path="shipped-orders" element={page("shipped-orders", <OrdersPage list="shipped-orders" />)} />
        <Route path="archived-orders" element={page("archived-orders", <OrdersPage list="archived-orders" />)} />
        {records("items", (id, editing) => <ItemsPage id={id} editing={editing} />)}
        {records("factories", (id, editing) => <FactoriesPage id={id} editing={editing} />)}
        {records("order-requests", (id) => <OrderRequestsPage id={id} />)}
        {records("athletes", (id, editing) => <AthletesPage id={id} editing={editing} />)}
        {records("leads", (id, editing) => <LeadsPage id={id} editing={editing} />)}
        {records("organizations", (id, editing) => <OrganizationsPage id={id} editing={editing} />)}
        {records("contacts", (id, editing) => <ContactsPage id={id} editing={editing} />)}
        <Route path="reports" element={page("reports", <ReportsPage />)} />
        <Route path="users" element={page("users", <UsersPage />)} />
        <Route path="email-settings" element={page("email-settings", <EmailSettingsPage />)} />
        <Route path="emails" element={page("emails", <EmailsPage />)} />
        {records("my-contacts", (id, editing) => <MyContactsPage id={id} editing={editing} />)}
        <Route path="guide" element={page("guide", <GuidePage />)} />
        <Route path="status-colors" element={page("status-colors", <StatusColorsPage />)} />
        {/* Everyone's Change password page; it's not in the menu, but linked beside Sign out. */}
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  );
}

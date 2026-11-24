import type { ReactNode } from "react";
import { Link } from "react-router";
import { useSignedIn } from "../../auth/AuthProvider";
import { OrderBadge, ProductionBadge } from "../../components/ui";
import { ORDER_LISTS, ORDER_STATUSES, PAGES, PRODUCTION_STATUSES, orderListOf, type OrderList } from "../../lib/constants";
import { useUiState } from "../../lib/uiState";
import { ORDER_STATUS_MEANINGS, type Audience } from "./guideText";
import { StatusFlow } from "./StatusFlow";

// The User guide: how the app works for the signed-in account. Factory and client users each see only
// what their own account can do and see; admins choose which of the two guides to read.
const AUDIENCE_LABELS: Record<Audience, string> = { factory: "Factory users", client: "Client users" };

// What each order page holds, in plain words.
const LIST_DESCRIPTIONS: Record<OrderList | "archived-orders", string> = {
  customs: "Orders not assigned to a factory yet.",
  "production-orders": "Orders assigned to a factory and being made.",
  "shipped-orders": "Orders on their way or delivered.",
  "archived-orders": "Orders that won't go ahead, and shipped orders MARGEN has archived.",
};
const pageLabel = (name: string) => PAGES.find((p) => p.name === name)?.label;

// The name of something on screen: a button, link, menu entry or field.
const Ui = ({ children }: { children: ReactNode }) => <b className="ui-name">{children}</b>;

type Section = { id: string; title: string; body: ReactNode };

export function GuidePage() {
  const { role } = useSignedIn();
  const [chosen, setChosen] = useUiState<Audience>("guideAudience", "factory");
  const audience: Audience = role === "admin" ? chosen : role;
  const sections = guideSections(audience);

  const jump = (id: string) => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="guide">
      <div className="page-head">
        <div className="title-block">
          <h1>User guide</h1>
          <p className="muted">
            {audience === "factory"
              ? "How to follow your MARGEN orders and keep their production and shipping up to date."
              : "How to follow your organization's MARGEN orders, from confirmation to delivery."}
          </p>
        </div>
        {role === "admin" && (
          <label className="inline-select">
            Guide for
            <select value={chosen} onChange={(e) => setChosen(e.target.value as Audience)}>
              {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABELS[a]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {role === "admin" && (
        <p className="notice">
          You're reading the guide as {AUDIENCE_LABELS[audience].toLowerCase()} see it. They see only their own guide, with no
          way to switch.
        </p>
      )}

      <nav className="card section guide-toc" aria-label="Contents">
        <h2>Contents</h2>
        <ol>
          {sections.map((s) => (
            <li key={s.id}>
              <button type="button" className="link-button" onClick={() => jump(s.id)}>
                {s.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((s, i) => (
        <section key={s.id} id={`guide-${s.id}`} className="card section guide-section">
          <h2>
            <span className="guide-number">{i + 1}</span>
            {s.title}
          </h2>
          {s.body}
        </section>
      ))}
    </div>
  );
}

function guideSections(audience: Audience): Section[] {
  const factory = audience === "factory";
  const yours = factory ? "your factory" : "your organization";
  const sections: (Section | false)[] = [
    { id: "account", title: factory ? "Your Factory account" : "Your Client account", body: <AccountSection factory={factory} /> },
    { id: "sign-in", title: "Signing in and your password", body: <SignInSection /> },
    { id: "dashboard", title: "The Dashboard", body: <DashboardSection factory={factory} yours={yours} /> },
    { id: "orders", title: "Your orders", body: <OrdersSection factory={factory} /> },
    { id: "order-page", title: "An order's page", body: <OrderPageSection factory={factory} /> },
    { id: "statuses", title: "Statuses explained", body: <StatusesSection audience={audience} /> },
    { id: "contacts", title: "Contacts and emails", body: <ContactsSection factory={factory} yours={yours} /> },
    !factory && { id: "new-order", title: "Placing a new order", body: <NewOrderSection /> },
    factory && { id: "habits", title: "Good habits", body: <HabitsSection /> },
    { id: "questions", title: "Questions and problems", body: <QuestionsSection factory={factory} yours={yours} /> },
  ];
  return sections.filter((s): s is Section => Boolean(s));
}

function AccountSection({ factory }: { factory: boolean }) {
  return (
    <>
      <p>
        {factory
          ? "The MARGEN Dashboard is where MARGEN shares custom orders with its factories. With a Factory account you see the orders assigned to your factory and tell MARGEN, and the client, how each one is progressing."
          : "The MARGEN Dashboard is where you follow your organization's custom orders with MARGEN: their status, how production is going, when they ship and what's in them."}
      </p>
      <div className="guide-columns">
        <div>
          <h3>What you can do</h3>
          <ul>
            <li>See every order {factory ? "assigned to your factory" : "of your organization"}, and its items, sizes and quantities.</li>
            {factory ? (
              <>
                <li>
                  Update each order's <strong>production status</strong>.
                </li>
                <li>
                  Update its <strong>shipping details</strong>: estimated and actual shipping dates, shipping method and tracker.
                </li>
              </>
            ) : (
              <>
                <li>Follow each order's status and production status.</li>
                <li>See when it's expected to ship, when it shipped, how, and its tracking link.</li>
              </>
            )}
            <li>Select orders to add up their pieces.</li>
            <li>
              Manage {factory ? "your factory's" : "your organization's"} <strong>contacts</strong>, and choose who gets MARGEN's emails.
            </li>
            {!factory && <li>Send MARGEN a new order from the Submit an order page.</li>}
            <li>Keep private notes in your Scrapbook.</li>
            <li>Change your own password.</li>
          </ul>
        </div>
        <div>
          <h3>What stays with MARGEN</h3>
          <ul>
            <li>Creating, changing{factory ? ", importing" : ""} and deleting orders, and their items.</li>
            <li>The order status (Received, Accepted, In production…).</li>
            <li>Archiving orders.</li>
            {factory ? (
              <>
                <li>The factory order ID.</li>
                <li>Client names and details, which you don't see.</li>
                <li>Orders of other factories, which you don't see.</li>
              </>
            ) : (
              <>
                <li>The production status and shipping details, which the factory updates.</li>
                <li>Orders of other organizations, which you don't see.</li>
              </>
            )}
          </ul>
        </div>
      </div>
      <p className="guide-tip">
        {factory ? (
          <>
            <strong>Your updates are visible.</strong> MARGEN sees your changes straight away, and so does the client who placed
            the order: clients follow their orders' production status and shipping details in this Dashboard. Keep them accurate
            and current.
          </>
        ) : (
          <>
            <strong>Always up to date.</strong> When MARGEN or the factory updates an order, you see it here straight away, so
            there's no need to ask for a status update.
          </>
        )}
      </p>
      <h3>The menu</h3>
      <p>
        Your menu has <Ui>Dashboard</Ui>, your home page; <Ui>New</Ui>, <Ui>In Production</Ui>, <Ui>Shipped</Ui> and{" "}
        <Ui>Cancelled &amp; Archived</Ui>, under <em>Custom Orders</em>;{" "}
        <Ui>Contacts</Ui>, the people at {factory ? "your factory" : "your organization"}; and this <Ui>User guide</Ui>. Click{" "}
        <em>Custom Orders</em> to open or close its group. At the bottom you'll find your email, your access level (
        <em>{factory ? "Factory" : "Client"}</em>), a button that switches between light and dark mode, and the links{" "}
        <Ui>Change password</Ui> and <Ui>Sign out</Ui>.
      </p>
      <p>
        On a computer, double-click the menu's background to fold it into a thin strip and give the page more room. Click the
        strip to open it again. The Dashboard works in any modern web browser, on a computer, tablet or phone; there's nothing
        to install.
      </p>
    </>
  );
}

function SignInSection() {
  return (
    <>
      <p>A MARGEN admin creates your account. To open the Dashboard, go to the address MARGEN gave you and sign in with your email address and password.</p>
      <h3>The first time: choose your password</h3>
      <p>If MARGEN didn't give you a temporary password, choose your own:</p>
      <ol className="guide-steps">
        <li>
          On the sign-in page, click <Ui>Forgot your password?</Ui>
        </li>
        <li>Enter the email address of your account and send the request.</li>
        <li>
          Open the email you receive and click its link. <strong>Open it in the same browser</strong> you used to make the
          request, otherwise the link won't work.
        </li>
        <li>Choose a password of at least 8 characters. You're then signed in.</li>
      </ol>
      <p>If MARGEN gave you a temporary password, sign in with it, then change it as described below.</p>
      <h3>Changing your password</h3>
      <ol className="guide-steps">
        <li>
          Click <Link to="/account">Change password</Link> at the bottom of the menu.
        </li>
        <li>Enter your current password, then the new one twice.</li>
        <li>
          Click <Ui>Change password</Ui>. You're taken back to the Dashboard with a confirmation message.
        </li>
      </ol>
      <p>
        Forgot your password? Use <Ui>Forgot your password?</Ui> on the sign-in page at any time. On a shared computer, always
        click <Ui>Sign out</Ui> when you're done.
      </p>
    </>
  );
}

function DashboardSection({ factory, yours }: { factory: boolean; yours: string }) {
  return (
    <>
      <p>
        The Dashboard opens when you sign in. It greets you, shows the name of {yours} and gives you three counts. Click any of
        them to open your orders.
      </p>
      <ul>
        <li>
          <strong>Open orders</strong>: orders that are <em>Received</em>, <em>Accepted</em> or <em>In production</em>,
          meaning still being worked on. Archived orders don't count.
        </li>
        <li>
          <strong>In production</strong>: orders whose order status is <em>In production</em>, the ones on <Ui>In Production</Ui>.
        </li>
        <li>
          <strong>All orders</strong>: every order {factory ? "ever assigned to your factory" : "of your organization"}, including
          shipped, cancelled and archived ones.
        </li>
      </ul>
      <p>
        Below them is your <strong>Scrapbook</strong>: a private page for notes and reminders. It saves itself a moment after you
        stop typing. Nobody else can read it, not even MARGEN admins.
      </p>
      <p className="guide-tip warn">
        <strong>“Your account isn't linked to {factory ? "a factory" : "an organization"} yet”.</strong> If you see this instead
        of the counts, ask your MARGEN contact to link your account to {yours}. You'll see your orders after that.
      </p>
    </>
  );
}

function OrdersSection({ factory }: { factory: boolean }) {
  return (
    <>
      <p>
        {factory ? "The orders assigned to your factory" : "Your organization's orders"} are on four pages under <em>Custom Orders</em>,
        newest first, one for each stage of an order, decided by its order status. Click one in the menu, or any count on the
        Dashboard. Each menu entry shows how many orders its page lists.
      </p>
      <div className="table-wrap">
        <table className="static">
          <thead>
            <tr>
              <th>Page</th>
              <th>Order statuses on it</th>
              <th>What it holds</th>
            </tr>
          </thead>
          <tbody>
            {[...(Object.keys(ORDER_LISTS) as OrderList[]), "archived-orders" as const].map((list) => (
              <tr key={list}>
                <td className="strong">{pageLabel(list)}</td>
                <td>
                  <span className="guide-badges">
                    {(list === "archived-orders" ? ["cancelled"] : ORDER_LISTS[list]).map((s) => (
                      <OrderBadge key={s} status={s} />
                    ))}
                    {list === "archived-orders" && <span className="muted small">or archived</span>}
                  </span>
                </td>
                <td>{LIST_DESCRIPTIONS[list]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul>
        <li>
          <strong>Search</strong> by order ID{factory ? ", factory order ID" : ""} or status. The list narrows as you type, and
          its count follows.
        </li>
        <li>
          <strong>Columns</strong>: Margen order ID, {factory ? "factory order ID, " : ""}order status, production status,
          estimated shipping date and pieces. On narrow screens a few less important columns are hidden.
        </li>
        {factory && (
          <>
            <li>
              <strong>Production</strong>: pick the new status from the list in the order's row. It's saved as soon as you pick
              it.
            </li>
            <li>
              <strong>Est. shipping</strong>: type or pick the date you expect to ship. It's saved as soon as the date is
              complete. Clear the box to remove it.
            </li>
            <li>
              A message at the top of the page confirms each change. If something goes wrong, it says so in red and your change
              isn't kept.
            </li>
          </>
        )}
      </ul>

      <h3>Selecting orders and adding up pieces</h3>
      <p>Select orders like rows in a spreadsheet. The selected rows turn green and a bar at the bottom adds up their pieces.</p>
      <div className="table-wrap">
        <table className="static">
          <thead>
            <tr>
              <th>To</th>
              <th>Do this</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="strong">Select one order</td>
              <td>Click its row{factory ? ", anywhere but the Production list or the date" : ""}.</td>
            </tr>
            <tr>
              <td className="strong">Select several in a row</td>
              <td>
                Click the first one and drag down or up, or click the first one, then hold <kbd>Shift</kbd> and click the last.
              </td>
            </tr>
            <tr>
              <td className="strong">Add or remove one</td>
              <td>
                Hold <kbd>Ctrl</kbd> (<kbd>Cmd</kbd> on a Mac) and click it.
              </td>
            </tr>
            <tr>
              <td className="strong">Clear the selection</td>
              <td>
                Click <Ui>Clear</Ui> in the bar, or press <kbd>Esc</kbd>.
              </td>
            </tr>
            <tr>
              <td className="strong">Open an order</td>
              <td>
                Click its <strong>Margen order ID</strong>, or double-click its row.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted small">Only orders you can see count: orders hidden by the search drop out of the total.</p>

      <h3>Archived and cancelled orders</h3>
      <p>
        A cancelled order is listed on <Link to="/archived-orders">Cancelled &amp; Archived</Link>, under <em>Custom Orders</em>.
        Once an order has shipped, MARGEN may also archive it; the order then leaves <Ui>Shipped</Ui> and moves there too. Only
        shipped orders are archived, and an archived order's statuses don't change until MARGEN unarchives it. It keeps its status, items and shipping
        details, and you can still open it, search for it and select it the same way. Archived orders don't count as open on
        your Dashboard. Only MARGEN archives orders and brings them back; ask them if you need one back.
      </p>
    </>
  );
}

function OrderPageSection({ factory }: { factory: boolean }) {
  if (!factory) {
    return (
      <>
        <p>
          Click an order's ID to open its page. Everything on it is read only. The link at the top goes back to the page it's
          listed on, such as <Ui>← New</Ui>. An archived order also shows <em>Archived</em> and the date under its ID.
        </p>
        <ul>
          <li>
            <strong>Details</strong>: the order status, the production status and the shipping details below.
          </li>
          <li>
            <strong>Items</strong>: each item with its size and quantity, and the total number of pieces. If something looks
            wrong, contact MARGEN.
          </li>
        </ul>
        <ShippingFieldsTable factory={false} />
      </>
    );
  }
  return (
    <>
      <p>
        Click an order's ID to open its page. It has everything your factory needs to produce and ship it. The link at{" "}
        the top goes back to the page it's listed on, such as <Ui>← In Production</Ui>. An archived order also shows{" "}
        <em>Archived</em> and the date under its ID.
      </p>
      <ul>
        <li>
          <strong>Production</strong>, at the top right: the same list as on the order pages, saved as soon as you pick a status.
        </li>
        <li>
          <strong>Details</strong>: the IDs, the order status set by MARGEN and the production status.
        </li>
        <li>
          <strong>Shipping</strong>: fill in or correct any of the four fields, then click <Ui>Save shipping</Ui>. They're saved
          together. All four are optional; leave a field empty if you don't know it yet.
        </li>
        <li>
          <strong>Items</strong>: each item with its size and quantity, and the total number of pieces. This list is read only.
          If something looks wrong, contact MARGEN.
        </li>
      </ul>
      <ShippingFieldsTable factory />
    </>
  );
}

function ShippingFieldsTable({ factory }: { factory: boolean }) {
  const rows: [string, string][] = factory
    ? [
        ["Estimated shipping date", "The date you expect the order to leave the factory. Set it as soon as you know it and update it if it moves."],
        ["Actual shipping date", "The date the order actually left the factory."],
        ["Shipping method", "The carrier or way of shipping, for example DHL Express or sea freight."],
        ["Tracker", "The tracking number, or better, the full tracking link (starting with https://). A link becomes clickable for MARGEN and the client."],
      ]
    : [
        ["Estimated shipping date", "When the factory expects the order to leave. It can move while the order is being made."],
        ["Actual shipping date", "The date the order left the factory."],
        ["Shipping method", "The carrier or way of shipping, for example DHL Express or sea freight."],
        ["Tracker", "The tracking number, or a link you can click to follow the delivery on the carrier's site."],
      ];
  return (
    <>
      <h3>The shipping details</h3>
      <div className="table-wrap">
        <table className="static">
          <thead>
            <tr>
              <th>Field</th>
              <th>{factory ? "What to enter" : "What it tells you"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([field, text]) => (
              <tr key={field}>
                <td className="strong guide-nowrap">{field}</td>
                <td>{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!factory && <p className="muted small">A field shows a dash until the factory fills it in.</p>}
    </>
  );
}

function StatusesSection({ audience }: { audience: Audience }) {
  const factory = audience === "factory";
  return (
    <>
      <h3>How an order moves</h3>
      <p>Every order has two statuses. This is how they move, and where one changes the other.</p>
      <StatusFlow audience={audience} />

      <h3>{factory ? "Production status: yours to update" : "Production status: updated by the factory"}</h3>
      <p>
        {factory
          ? "Move each order along as production progresses. You can pick any status at any time, so you can also correct a mistake."
          : "The factory moves each order along these steps as the work progresses."}
      </p>
      <ol className="guide-flow" aria-label="Production steps">
        <li>
          <ProductionBadge status={null} />
        </li>
        {Object.keys(PRODUCTION_STATUSES).map((s) => (
          <li key={s}>
            <ProductionBadge status={s} />
          </li>
        ))}
      </ol>
      <p className="muted small">
        When MARGEN assigns an order to {factory ? "your factory" : "a factory"}, production starts at <em>Not started</em>.{" "}
        {factory
          ? "Set it to Received when you get it, then Accepted once you've checked it and agreed to make it."
          : "The factory sets it to Received when it gets the order, then Accepted once it has agreed to make it."}{" "}
        Production moves one step at a time, in this order: the menu offers only the next step, or the one before to undo a mistake.
      </p>

      <h3>Order status: set by MARGEN</h3>
      <p>
        The order status tells you where the order stands for MARGEN, and decides which page it's listed on. Two changes
        happen on their own: assigning the order to a factory moves it to <em>In production</em>, and setting production to{" "}
        <em>Shipped</em> marks the order <em>Shipped</em> too (taking production back off Shipped puts it back to{" "}
        <em>In production</em>). Statuses follow the flow one step at a time, for everyone: a new order starts as{" "}
        <em>Received</em>, MARGEN accepts it, then assigns a factory. An order can be cancelled until it ships; a shipped or
        cancelled order's status doesn't change any more.
      </p>
      <div className="table-wrap">
        <table className="static">
          <thead>
            <tr>
              <th>Status</th>
              <th>What it means for you</th>
              <th>Listed on</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(ORDER_STATUSES).map((s) => (
              <tr key={s}>
                <td>
                  <OrderBadge status={s} />
                </td>
                <td>{ORDER_STATUS_MEANINGS[audience][s]}</td>
                <td className="guide-nowrap">{pageLabel(orderListOf({ order_status: s, archived_at: null }))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ContactsSection({ factory, yours }: { factory: boolean; yours: string }) {
  return (
    <>
      <p>
        Click <Link to="/my-contacts">Contacts</Link> in the menu to see the people at {yours} that MARGEN keeps in touch with;
        they don't need a Dashboard account. One of them is the <strong>default contact</strong>, who gets an email{" "}
        {factory ? "when an order is assigned to your factory" : "when one of your orders ships"}.
      </p>
      <ul>
        <li>
          <Ui>New contact</Ui>: enter a first name, a last name and, so they can get emails, an email address, then click{" "}
          <Ui>Add contact</Ui>. The first contact becomes the default contact automatically.
        </li>
        <li>
          <Ui>Make default</Ui>: makes someone else the one who gets the emails. There's only one default at a time.
        </li>
        <li>
          <Ui>Edit</Ui> changes a contact's name or email. <Ui>Remove</Ui> takes them off your contacts, after asking you to
          confirm. If you remove the default contact, choose a new one.
        </li>
        <li>A line under the list says who gets {yours}'s emails, or why nobody does.</li>
      </ul>
      <h3>The email</h3>
      {factory ? (
        <p>
          A few minutes after MARGEN assigns an order to your factory, your default contact gets an email titled{" "}
          <em>“New MARGEN order MG-1046 for Pacific Sportswear”</em> (with your order and factory). It shows the order's IDs,
          status, pieces and estimated shipping date, and its <Ui>Open the order</Ui> button takes you to the order's page.
        </p>
      ) : (
        <p>
          A few minutes after the factory marks one of your orders <em>Shipped</em>, your default contact gets an email titled{" "}
          <em>“Your MARGEN order MG-1046 has shipped”</em> (with your order's ID). It shows the pieces, the shipping date, the
          shipping method and the tracker, and its <Ui>See your order</Ui> button takes you to the order's page.
        </p>
      )}
      <p>
        Without a default contact, or if the default contact has no email address, nobody at {yours} gets the email. The button
        opens the Dashboard; sign in first if you're asked to.
      </p>
    </>
  );
}

function NewOrderSection() {
  return (
    <>
      <p>
        To order more, open <Link to="/order">Submit an order</Link> in the menu. Only signed-in clients can send orders, so
        anyone at your organization who orders needs their own client account; ask MARGEN for one.
      </p>
      <ol className="guide-steps">
        <li>Check your organization, name and email, which are filled in for you, and add a phone number if you like.</li>
        <li>
          Add each item with its size and quantity. Ordering a lot? Click <Ui>Download the order template</Ui>, fill it in in
          Excel and upload it instead.
        </li>
        <li>Add anything MARGEN should know: deadlines, colours, names and numbers to print…</li>
        <li>
          Click <Ui>Send order</Ui>.
        </li>
      </ol>
      <p>
        MARGEN confirms the order by email. Once they've turned your request into an order, it appears on <Ui>New</Ui> as{" "}
        <em>Received</em> or <em>Accepted</em>.
      </p>
    </>
  );
}

function HabitsSection() {
  return (
    <ol className="guide-steps">
      <li>
        <strong>When an order arrives</strong>, set production to <em>Received</em>. Check its items and sizes, set production to{" "}
        <em>Accepted</em>, and set an estimated shipping date as soon as you can.
      </li>
      <li>
        <strong>As work moves on</strong>, update the production status at each stage, the same day if possible.
      </li>
      <li>
        <strong>If the date slips</strong>, change the estimated shipping date straight away, so MARGEN and the client aren't
        surprised.
      </li>
      <li>
        <strong>When the order ships</strong>, set production to <em>Shipped</em>; the order moves to
        <Ui>Shipped</Ui> by itself. Then on the order's page enter the actual
        shipping date, the shipping method and the tracking link, and click <Ui>Save shipping</Ui>.
      </li>
      <li>
        <strong>Once a week</strong>, go through <Ui>New</Ui> and <Ui>In Production</Ui> and make sure every open order is
        up to date.
      </li>
      <li>
        <strong>When someone joins or leaves</strong>, update your Contacts, so MARGEN's emails reach the right person.
      </li>
    </ol>
  );
}

function QuestionsSection({ factory, yours }: { factory: boolean; yours: string }) {
  const faq: [string, ReactNode][] = [
    [
      "I can't sign in.",
      <>
        Check the email address, then use <Ui>Forgot your password?</Ui> to set a new password. If you still can't sign in, ask
        your MARGEN contact to check your account.
      </>,
    ],
    [
      "The link in the password email says it isn't valid.",
      "Links only work once, for a limited time, and in the browser where you asked for them. Request a new one from the sign-in page and open it in that same browser.",
    ],
    [
      `I see “Your account isn't linked to ${factory ? "a factory" : "an organization"} yet”, or no orders at all.`,
      factory
        ? "Your account must be linked to your factory, and orders must be assigned to it. Both are done by MARGEN. Contact them if you expect to see orders."
        : "Your account must be linked to your organization by MARGEN. Contact them if you expect to see orders.",
    ],
    [
      `An order disappeared from my list.`,
      <>
        Look in <Ui>Cancelled &amp; Archived</Ui>: MARGEN may have archived or cancelled it. MARGEN may also have changed its order status, which moves it
        to another page. Also check that the search box is empty.{factory ? " Otherwise MARGEN may have assigned it to another factory; contact them if that's unexpected." : ""}
      </>,
    ],
    ["An order moved to another page.", "MARGEN changed its order status, for example from Accepted to In production. Each status is listed on its own page."],
    [
      `Nobody at ${yours} gets MARGEN's emails.`,
      <>
        Open <Ui>Contacts</Ui> and check that one contact is the <em>Default</em> and has an email address. Also check your spam
        folder.
      </>,
    ],
    ...(factory
      ? ([
          [
            "A red message says my change “wasn't changed. You may not have permission.”",
            "The change wasn't saved, usually because the order is no longer assigned to your factory. Reload the page; if it keeps happening, contact MARGEN.",
          ],
        ] as [string, ReactNode][])
      : ([
          ["The shipping date or tracker is missing.", "The factory fills them in as the order progresses. If the order should have shipped, contact MARGEN."],
          ["I want to change an order.", "Contact MARGEN: only they can change an order's items, sizes or quantities."],
        ] as [string, ReactNode][])),
    ...(factory ? ([["An item, size or quantity is wrong.", "Only MARGEN can change the items on an order. Tell them what needs fixing."]] as [string, ReactNode][]) : []),
    [
      "A page shows “Something went wrong on this page”.",
      <>
        Click <Ui>Reload</Ui>, or open another page from the menu. The problem is reported to MARGEN automatically. If it keeps
        happening, let them know what you were doing.
      </>,
    ],
    ["Can I use it on my phone?", "Yes. Open the same address in your phone's browser. On narrow screens a few less important columns are hidden."],
    [
      "The screen is too bright or too dark.",
      `Click the sun or moon button next to ${factory ? "Factory" : "Client"} at the bottom of the menu to switch between light and dark mode.`,
    ],
  ];
  return (
    <>
      <dl className="guide-faq">
        {faq.map(([q, a]) => (
          <div key={q}>
            <dt>{q}</dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>
      <p className="guide-tip">
        <strong>Need help?</strong> Contact your MARGEN account manager for anything about your account, your orders or this
        guide.
      </p>
    </>
  );
}

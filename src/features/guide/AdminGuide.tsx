import { Link } from "react-router";
import { OrderBadge, ProductionBadge } from "../../components/ui";
import { LEAD_STATUSES, ORDER_STATUSES, PRODUCTION_STATUSES } from "../../lib/constants";
import { Ui } from "./GuideUi";
import { ORDER_STATUS_MEANINGS } from "./guideText";
import { StatusFlow } from "./StatusFlow";

// The admin guide's sections: running MARGEN's side of the Dashboard. Factory and client users never see
// them. GuidePage lists them, in this order.

export function AdminAccountSection() {
  return (
    <>
      <p>
        As an admin you run MARGEN's side of the Dashboard: you create and accept orders, assign them to factories, and manage
        the organizations, factories, contacts and users around them. You see everything; factory and client users see only
        their own factory's or organization's orders.
      </p>
      <h3>The menu</h3>
      <ul>
        <li>
          <Ui>Dashboard</Ui>: counts across the app, and the latest notes. Hide a note from your Dashboard with its button; it
          stays on the page it was added to.
        </li>
        <li>
          <em>Custom Orders</em>: the order pages <Ui>New</Ui>, <Ui>In Production</Ui>, <Ui>Shipped</Ui> and{" "}
          <Ui>Cancelled &amp; Archived</Ui>, plus <Ui>Submit an order</Ui>, <Ui>Order requests</Ui> and <Ui>Items</Ui>.
        </li>
        <li>
          <Ui>Leads</Ui>, <Ui>Contacts</Ui>, <Ui>Athletes</Ui> and <Ui>Reporting</Ui>.
        </li>
        <li>
          <em>Admin</em>: <Ui>Factories</Ui>, <Ui>Organizations</Ui>, <Ui>Users</Ui>, <Ui>Email Admin and Logs</Ui> and{" "}
          <Ui>Status colors</Ui>.
        </li>
      </ul>
      <p className="guide-tip">
        <strong>The database has the last word.</strong> Who sees what, and how statuses may change, is enforced by the database
        itself, not just by the screens. If something is refused, the message says why.
      </p>
    </>
  );
}

export function AdminFlowSection() {
  return (
    <>
      <p>
        Every order has an <strong>order status</strong>, set by MARGEN, and a <strong>production status</strong>, set by the
        factory. Both follow this flow one step at a time, for everyone, admins included: nobody can skip a step.
      </p>
      <StatusFlow audience="admin" />
      <div className="table-wrap">
        <table className="static">
          <thead>
            <tr>
              <th>Order status</th>
              <th>What to do</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(ORDER_STATUSES).map((s) => (
              <tr key={s}>
                <td>
                  <OrderBadge status={s} />
                </td>
                <td>{ORDER_STATUS_MEANINGS.admin[s]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>The rules</h3>
      <ul>
        <li>
          A new order always starts <em>Received</em>, with production <em>Not started</em> and no factory.
        </li>
        <li>
          By hand, an order goes from <em>Received</em> to <em>Accepted</em> and back, or to <em>Cancelled</em> until it ships.
          Shipped and cancelled orders don't change status any more.
        </li>
        <li>
          <em>In production</em> and <em>Shipped</em> are never set by hand: assigning a factory to an accepted order moves it
          to In production, and production reaching Shipped marks the order Shipped.
        </li>
        <li>
          A factory can be assigned, changed or taken off only while the order is Accepted or In production. Once production is
          past Accepted, you can move the order to another factory but not take the factory off.
        </li>
        <li>
          Production moves one step either way while the order is In production:{" "}
          <span className="guide-badges">
            <ProductionBadge status={null} />
            {Object.keys(PRODUCTION_STATUSES).map((s) => (
              <ProductionBadge key={s} status={s} />
            ))}
          </span>
          . Stepping production back from Shipped puts the order back to In production.
        </li>
        <li>Only shipped orders can be archived, and an archived order's statuses and factory don't change until it's unarchived.</li>
      </ul>
      <p>The menus on an order only offer the changes these rules allow.</p>
    </>
  );
}

export function AdminNewOrdersSection() {
  return (
    <>
      <p>There are four ways an order gets into the Dashboard. Each one starts as Received.</p>
      <h3>By hand</h3>
      <ol className="guide-steps">
        <li>
          On <Link to="/customs">New</Link>, click <Ui>New order</Ui>.
        </li>
        <li>Enter its Margen order ID, and if you have them, its factory order ID, organization and shipping details.</li>
        <li>
          Click <Ui>Create order</Ui>, then open the order, click <Ui>Edit</Ui> and add its items under <em>Items</em>.
        </li>
      </ol>
      <h3>From an order request</h3>
      <p>
        Clients send orders with items, sizes and quantities from <Ui>Submit an order</Ui>; they arrive on{" "}
        <Link to="/order-requests">Order requests</Link> and every admin who chose to gets an email. Open a request, check it,
        then use <Ui>Turn into an order</Ui>: give it a Margen order ID and the organization (picked for you when the name
        matches). The order is created with the request's items and opens.
      </p>
      <h3>For a client</h3>
      <p>
        You can also fill in <Link to="/order">Submit an order</Link> yourself on a client's behalf, typing the items or
        uploading the order template. It becomes an order request like any other.
      </p>
      <h3>From a spreadsheet</h3>
      <p>
        On <Link to="/customs">New</Link>, <Ui>Import from Excel</Ui> reads an Excel or CSV file with a column per field (download the
        template to see them). Each row adds an order, or updates the one with the same Margen order ID. Before anything is
        saved you see what each row will do; rows with a problem, such as an unknown organization or a status that skips a
        step, are listed with the reason and left out.
      </p>
    </>
  );
}

export function AdminOrderSection() {
  return (
    <>
      <h3>Accepting</h3>
      <p>
        A Received order shows whether it's ready to be accepted: it needs an organization and at least one item, and points
        out what's worth adding, such as an estimated shipping date or a contact email. When it's ready, click{" "}
        <Ui>Accept order</Ui>.
      </p>
      <h3>Assigning a factory</h3>
      <p>
        Once the order is Accepted, pick its factory in the <Ui>Factory</Ui> menu at the top of the order. The order moves to{" "}
        <em>In production</em> with production at <em>Not started</em>, and a few minutes later the factory's default contact
        gets an email about it. From then on the factory sets the production status and shipping details; you can too.
      </p>
      <h3>Items</h3>
      <p>
        Click <Ui>Edit</Ui> on an order to change its details and items. Under <em>Items</em>, choose an item and a size, enter
        the quantity and click <Ui>Add an item</Ui>; adding the same item and size again adds to its quantity. Item changes
        are saved as you make them.
      </p>
      <h3>Shipping, cancelling and archiving</h3>
      <ul>
        <li>
          When production is set to <em>Shipped</em>, the order becomes Shipped and the organization's default contact is told
          it's on its way, with the shipping details.
        </li>
        <li>An order that won't go ahead can be set to Cancelled any time before it ships. This can't be undone.</li>
        <li>
          A shipped order can be archived with <Ui>Archive</Ui>: it moves to <Ui>Cancelled &amp; Archived</Ui> and no longer
          counts as open. <Ui>Unarchive</Ui> brings it back.
        </li>
        <li>
          <Ui>Delete</Ui> removes an order and its items for good. Prefer cancelling or archiving, which keep its history.
        </li>
      </ul>
      <h3>Notes and history</h3>
      <p>
        Each order has notes shared between MARGEN and the order's factory; clients never see them. A note you add emails the
        factory's default contact, and a note from the factory emails the admins. The order's history lists every change, who
        made it and when.
      </p>
    </>
  );
}

export function AdminPeopleSection() {
  return (
    <>
      <ul>
        <li>
          <Link to="/organizations">Organizations</Link> are MARGEN's clients: clubs, crews and teams. Each order belongs to one.
        </li>
        <li>
          <Link to="/factories">Factories</Link> make the orders. A factory's page lists its orders.
        </li>
        <li>
          <Link to="/contacts">Contacts</Link> are people at organizations and factories, with their email, phone (and whether
          it's on WhatsApp), delivery address and billing address. One contact can be linked to several organizations or
          factories.
        </li>
      </ul>
      <p className="guide-tip">
        <strong>The default contact gets the emails.</strong> Each organization and factory has one default contact: the one
        the Dashboard emails about its orders. Without one, or without an email address, the email is skipped and the log says
        why. Factory and client users can manage their own contacts and choose their default too.
      </p>
      <p>
        Organizations, factories, contacts and athletes each have notes. A new note shows on the admins' Dashboards until each
        hides it.
      </p>
    </>
  );
}

export function AdminLeadsSection() {
  return (
    <>
      <p>
        Anyone can ask for a quote on the public home page. Each request becomes a lead on <Link to="/leads">Leads</Link>, and
        the admins who chose to get an email. Move each lead through its statuses as you follow it up:{" "}
        {Object.values(LEAD_STATUSES).join(", ")}.
      </p>
      <p>
        <Link to="/athletes">Athletes</Link> keeps the athletes MARGEN works with. A new note about an athlete emails the other
        admins.
      </p>
    </>
  );
}

export function AdminUsersSection() {
  return (
    <>
      <p>Nobody can sign up on their own: admins create every account.</p>
      <ol className="guide-steps">
        <li>
          On <Link to="/users">Users</Link>, click <Ui>Add a user</Ui>.
        </li>
        <li>Enter their email, first and last name, and access level.</li>
        <li>
          For a Factory account, link it to its factory; for a Client account, to its organization. Without a link they see no
          orders.
        </li>
        <li>
          Give them a temporary password, or let them choose one with <Ui>Forgot your password?</Ui> on the sign-in page.
        </li>
      </ol>
      <div className="table-wrap">
        <table className="static">
          <thead>
            <tr>
              <th>Access level</th>
              <th>Sees and does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="strong">Admin</td>
              <td>Everything.</td>
            </tr>
            <tr>
              <td className="strong">Factory</td>
              <td>
                Its factory's orders, without client details. Updates production and shipping details, adds order notes, manages
                its own contacts.
              </td>
            </tr>
            <tr>
              <td className="strong">Client</td>
              <td>Its organization's orders, read only, without factory details. Sends orders, manages its own contacts.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>You can change a user's access level and link on the Users page at any time.</p>
    </>
  );
}

export function AdminEmailsSection() {
  return (
    <>
      <p>The Dashboard sends these emails on its own:</p>
      <div className="table-wrap">
        <table className="static">
          <thead>
            <tr>
              <th>When</th>
              <th>Who gets it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>An order is assigned to a factory</td>
              <td>The factory's default contact</td>
            </tr>
            <tr>
              <td>An order ships</td>
              <td>The organization's default contact</td>
            </tr>
            <tr>
              <td>An admin adds a note to an order</td>
              <td>The factory's default contact</td>
            </tr>
            <tr>
              <td>The factory adds a note to an order, a client sends an order, someone asks for a quote, an admin adds an athlete note</td>
              <td>The admins who chose to get that kind</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Order emails wait a few minutes before they go, so a mistake can be undone first: moving the order to another factory,
        or stepping production back from Shipped, cancels the email still waiting.
      </p>
      <p>
        On <Link to="/emails">Email Admin and Logs</Link> you can pause all sending, turn each kind of email off, choose which
        admins get which admin emails, set the sender and the wait, preview each email and send yourself a sample. The log
        lists every email with its status, and lets you retry one that failed.
      </p>
    </>
  );
}

export function AdminMoreSection() {
  return (
    <ul>
      <li>
        <Link to="/items">Items</Link> is the catalogue orders are made of. An item's page shows the orders it's on and how many
        of each size.
      </li>
      <li>
        <Link to="/reports">Reporting</Link> builds order reports with filters, such as organization, factory, status and dates,
        and downloads them as Excel files.
      </li>
      <li>
        <Link to="/status-colors">Status colors</Link> sets the colour of each status badge, for everyone.
      </li>
    </ul>
  );
}

export function AdminOtherGuidesSection() {
  return (
    <p>
      Factory and client users each have their own guide and can't switch. To see exactly what they read, choose{" "}
      <Ui>Factory users</Ui> or <Ui>Client users</Ui> in the <Ui>Guide for</Ui> menu at the top of this page. It's a good way to
      answer their questions.
    </p>
  );
}

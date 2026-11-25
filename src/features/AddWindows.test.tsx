import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { NoticeProvider } from "../components/Notice";
import { AthletesPage } from "./athletes/AthletesPage";
import { ContactsPage } from "./contacts/ContactsPage";
import { ItemsPage } from "./items/ItemsPage";
import { LeadsPage } from "./leads/LeadsPage";
import { OrdersPage } from "./orders/OrdersPage";

// Every list adds its records the same way: an Add button opening a window over the list.
const none = vi.hoisted(() => () => ({ data: [], isPending: false, isError: false }));
vi.mock("../data/queries", async (original) => ({
  ...(await original<typeof import("../data/queries")>()),
  useAthletes: none,
  useContacts: none,
  useFactories: none,
  useItems: none,
  useLeads: none,
  useNotes: none,
  useOrderItems: none,
  useOrders: none,
  useOrganizations: none,
  useStatusColors: () => ({ data: {} }),
}));
vi.mock("../auth/AuthProvider", () => ({ useSignedIn: () => ({ userId: "me", role: "admin" }) }));

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const renderAt = (path: string, page: ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NoticeProvider>
        <MemoryRouter initialEntries={[`${path}/new`]}>
          <Where />
          <Routes>
            <Route path={`${path}/new`} element={page} />
            <Route path={path} element={<p>List</p>} />
          </Routes>
        </MemoryRouter>
      </NoticeProvider>
    </QueryClientProvider>,
  );

const pages: [string, string, ReactElement][] = [
  ["contact", "/contacts", <ContactsPage id="new" />],
  ["athlete", "/athletes", <AthletesPage id="new" />],
  ["lead", "/leads", <LeadsPage id="new" />],
  ["item", "/items", <ItemsPage id="new" />],
  ["order", "/customs", <OrdersPage id="new" />],
];

describe.each(pages)("Adding a %s", (noun, path, page) => {
  it(`opens with Add, in an "Add ${noun}" window`, () => {
    renderAt(path, page);
    expect(screen.getByRole("link", { name: "Add" })).toHaveAttribute("href", `${path}/new`);
    const dialog = screen.getByRole("dialog", { name: `Add ${noun}` });
    expect(dialog).toContainElement(screen.getByRole("button", { name: `Add ${noun}` }));
  });

  it("closes with ×, back to the list", async () => {
    const user = userEvent.setup();
    renderAt(path, page);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("where")).toHaveTextContent(new RegExp(`^${path}$`));
  });
});

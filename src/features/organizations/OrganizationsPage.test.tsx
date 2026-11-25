import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { NoticeBar, NoticeProvider } from "../../components/Notice";
import type { Order, Organization, User } from "../../data/queries";
import { resetUiState } from "../../lib/uiState";
import { OrganizationsPage } from "./OrganizationsPage";

const org = (id: string, name: string): Organization => ({ id, name, state: null, country: null, created_at: "2026-11-01", contacts: [] });
const order = (id: string, organization_id: string, extra: Partial<Order> = {}) =>
  ({ id, margen_order_id: id, organization_id, organization: null, organization_name: null, order_status: "received", archived_at: null, ...extra }) as Order;

// "open" has an order still going; "done" only cancelled and archived ones; "users" a client account; "empty" nothing.
const ORGS = [org("done", "Done Club"), org("empty", "Empty Club"), org("open", "Open Club"), org("users", "Users Club")];
const ORDERS = [
  order("o1", "open"),
  order("o2", "done", { order_status: "cancelled" }),
  order("o3", "done", { order_status: "shipped", archived_at: "2026-11-20" }),
];
const USERS = [{ id: "u1", role: "client", organization_id: "users" } as User];

vi.mock("../../auth/AuthProvider", () => ({ useSignedIn: () => ({ userId: "me", role: "admin", email: "me@example.com", firstName: "Me" }) }));
vi.mock("../../data/queries", async (original) => ({
  ...(await original<typeof import("../../data/queries")>()),
  useOrganizations: () => ({ data: ORGS, isPending: false, isError: false }),
  useOrders: () => ({ data: ORDERS, isPending: false, isError: false }),
  useUsers: () => ({ data: USERS, isPending: false, isError: false }),
  useNotes: () => ({ data: [], isPending: false, isError: false }),
}));

// Records which organizations the page asks the database to delete.
const deleted: string[] = [];
vi.mock("../../lib/supabase", async (original) => ({
  ...(await original<typeof import("../../lib/supabase")>()),
  supabase: {
    from: () => ({
      delete: () => ({ eq: (_: string, id: string) => ({ select: async () => (deleted.push(id), { data: [{ id }], error: null }) }) }),
    }),
  },
}));

const renderPage = (path = "/organizations") =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NoticeProvider>
        <MemoryRouter initialEntries={[path]}>
          <NoticeBar />
          <Routes>
            <Route path="/organizations" element={<OrganizationsPage />} />
            <Route path="/organizations/:id" element={<OrganizationsPage id={path.split("/")[2]} />} />
          </Routes>
        </MemoryRouter>
      </NoticeProvider>
    </QueryClientProvider>,
  );

describe("Organizations page", () => {
  beforeEach(() => {
    resetUiState();
    deleted.length = 0;
  });

  it("is added with Add, in a window", () => {
    renderPage("/organizations/new");
    expect(screen.getByRole("link", { name: "Add" })).toHaveAttribute("href", "/organizations/new");
    const dialog = screen.getByRole("dialog", { name: "Add organization" });
    expect(dialog).toContainElement(screen.getByRole("button", { name: "Add organization" }));
  });

  it("won't tick one with orders still going, or with client accounts linked", () => {
    renderPage();
    expect(screen.getByLabelText("Select Open Club")).toBeDisabled();
    expect(screen.getByLabelText("Select Open Club")).toHaveAttribute("title", expect.stringMatching(/1 order that isn't cancelled or archived/));
    expect(screen.getByLabelText("Select Users Club")).toBeDisabled();
    expect(screen.getByLabelText("Select Users Club")).toHaveAttribute("title", expect.stringMatching(/1 client account linked/));
    expect(screen.getByLabelText("Select Done Club")).toBeEnabled();
    expect(screen.getByLabelText("Select Empty Club")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("deletes the ticked ones after confirming, saying the cancelled and archived orders keep the name", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await user.click(screen.getByLabelText("Select all organizations shown that can be deleted"));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm.mock.calls[0][0]).toMatch(/Delete 2 organizations\?/);
    expect(confirm.mock.calls[0][0]).toMatch(/2 cancelled or archived orders are kept, with the organization's name/);
    await waitFor(() => expect(deleted).toEqual(["done", "empty"]));
    expect(await screen.findByText("Deleted 2 organizations.")).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    await user.click(screen.getByLabelText("Select Empty Club"));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleted).toEqual([]);
    confirm.mockRestore();
  });

  it("only counts ticked ones the search still shows", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByLabelText("Select Done Club"));
    await user.click(screen.getByLabelText("Select Empty Club"));
    await user.type(screen.getByRole("searchbox"), "empty");
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("can't be deleted from its own page while it has orders still going", () => {
    renderPage("/organizations/open");
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});

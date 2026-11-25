import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { NoticeBar, NoticeProvider } from "../../components/Notice";
import type { User } from "../../data/queries";
import { resetUiState } from "../../lib/uiState";
import { UsersPage } from "./UsersPage";

const person = (id: string, role: User["role"], extra: Partial<User> = {}): User => ({
  id,
  email: `${id}@example.com`,
  first_name: id,
  last_name: "Test",
  muted_email_kinds: [],
  role,
  factory_id: null,
  organization_id: null,
  created_at: "2026-11-01T09:00:00Z",
  disabled_at: null,
  last_sign_in_at: "2026-11-20T15:42:00Z",
  ...extra,
});

// "me" is the signed-in admin; "boss" another admin; "fab" an active factory user; "club" a disabled client.
const USERS = [
  person("boss", "admin"),
  person("club", "client", { disabled_at: "2026-11-24T10:00:00Z", last_sign_in_at: "2026-11-22T08:00:00Z", created_at: "2026-10-01T09:00:00Z" }),
  person("fab", "factory", { last_sign_in_at: null }),
  person("me", "admin"),
];

vi.mock("../../auth/AuthProvider", () => ({ useSignedIn: () => ({ userId: "me" }) }));
vi.mock("../../data/queries", async (original) => ({
  ...(await original<typeof import("../../data/queries")>()),
  useUsers: () => ({ data: USERS, isPending: false, isError: false }),
  useFactories: () => ({ data: [{ id: "fac1", name: "Ocean Factory" }], isPending: false }),
  useOrganizations: () => ({ data: [{ id: "org1", name: "Rowing Club" }], isPending: false }),
}));

// Records what the page asks the manage-user function to do.
const calls: unknown[] = [];
// What create-user answers: by default the welcome email went.
let created: Record<string, unknown> = { emailed: true };
vi.mock("../../lib/supabase", async (original) => ({
  ...(await original<typeof import("../../lib/supabase")>()),
  supabase: {
    functions: { invoke: async (name: string, { body }: { body: { email?: string } }) => (
      calls.push({ name, body }), { data: name === "create-user" ? { email: body.email, ...created } : null, error: null }
    ),
  },
  },
}));

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NoticeProvider>
        <MemoryRouter>
          <NoticeBar />
          <UsersPage />
        </MemoryRouter>
      </NoticeProvider>
    </QueryClientProvider>,
  );

const order = () => screen.getAllByRole("row").slice(1).map((r) => within(r).getByLabelText(/^Select /).getAttribute("aria-label")!.replace("Select ", "").replace("@example.com", ""));
const row = (email: string) => screen.getByText(email).closest("tr")!;

describe("Users page", () => {
  beforeEach(() => {
    resetUiState();
    calls.length = 0;
    created = { emailed: true };
  });

  it("shows each account's status, and dates without the time", () => {
    renderPage();
    expect(within(row("club@example.com")).getByText("Disabled")).toBeInTheDocument();
    expect(within(row("fab@example.com")).getByText("Active")).toBeInTheDocument();
    expect(within(row("fab@example.com")).getByText("Never")).toBeInTheDocument();
    expect(within(row("boss@example.com")).queryByText(/:42/)).not.toBeInTheDocument();
  });

  it("only lets Factory and Client users be ticked", () => {
    renderPage();
    expect(screen.getByLabelText("Select boss@example.com")).toBeDisabled();
    expect(screen.getByLabelText("Select me@example.com")).toBeDisabled();
    expect(screen.getByLabelText("Select fab@example.com")).toBeEnabled();
    for (const name of ["Disable", "Enable", "Delete"]) expect(screen.getByRole("button", { name })).toBeDisabled();
  });

  it("disables the ticked active users after asking", async () => {
    const user = userEvent.setup();
    const ask = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await user.click(screen.getByLabelText("Select all Factory and Client users shown"));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    // Only the active one can be disabled, only the disabled one enabled.
    await user.click(screen.getByRole("button", { name: "Disable" }));
    expect(ask).toHaveBeenCalledWith(expect.stringContaining("fab@example.com"));
    await waitFor(() => expect(calls).toEqual([{ name: "manage-user", body: { user_id: "fab", action: "disable" } }]));
    expect(await screen.findByText(/fab@example.com disabled/)).toBeInTheDocument();
    ask.mockRestore();
  });

  it("deletes nothing when the admin says no", async () => {
    const user = userEvent.setup();
    const ask = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    await user.click(screen.getByLabelText("Select club@example.com"));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(ask).toHaveBeenCalledWith(expect.stringContaining("can't be undone"));
    expect(calls).toEqual([]);
    ask.mockRestore();
  });

  it("puts your own account first, then sorts by the clicked column", async () => {
    const user = userEvent.setup();
    renderPage();
    const header = (name: string) => screen.getByRole("columnheader", { name: new RegExp(`^${name}`) });
    expect(order()).toEqual(["me", "boss", "club", "fab"]);
    expect(header("Email")).toHaveAttribute("aria-sort", "ascending");

    // A date starts newest first; never signed in comes last.
    await user.click(screen.getByRole("button", { name: /^Last signed in/ }));
    expect(order()).toEqual(["me", "club", "boss", "fab"]);
    expect(header("Last signed in")).toHaveAttribute("aria-sort", "descending");
    expect(header("Email")).toHaveAttribute("aria-sort", "none");

    // Clicking again reverses it, still with never signed in last.
    await user.click(screen.getByRole("button", { name: /^Last signed in/ }));
    expect(order()).toEqual(["me", "boss", "club", "fab"]);

    await user.click(screen.getByRole("button", { name: /^Added/ }));
    expect(order()).toEqual(["me", "boss", "fab", "club"]);

    await user.click(screen.getByRole("button", { name: /^Email/ }));
    expect(order()).toEqual(["me", "boss", "club", "fab"]);
  });

  it("adds a user in a window, which closes once they're added", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Add" }));
    const dialog = screen.getByRole("dialog", { name: "Add a user" });
    await user.type(within(dialog).getByLabelText("Email"), "new@example.com");
    await user.type(within(dialog).getByLabelText("First name"), "New");
    await user.type(within(dialog).getByLabelText("Last name"), "Person");
    await user.selectOptions(within(dialog).getByLabelText("Organization"), "Rowing Club");
    await user.click(within(dialog).getByRole("button", { name: "Add user" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls).toEqual([{ name: "create-user", body: expect.objectContaining({ email: "new@example.com", role: "client", organization_id: "org1" }) }]);
    expect(screen.getByText(/emailed them a welcome with their temporary password/)).toBeInTheDocument();
  });

  it("gives the admin the made-up password when the welcome email couldn't be sent", async () => {
    created = { emailed: false, not_sent: "emails are turned off", password: "Xy7kPq2mNb4r" };
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Add" }));
    const dialog = screen.getByRole("dialog", { name: "Add a user" });
    await user.type(within(dialog).getByLabelText("Email"), "new@example.com");
    await user.type(within(dialog).getByLabelText("First name"), "New");
    await user.type(within(dialog).getByLabelText("Last name"), "Person");
    await user.selectOptions(within(dialog).getByLabelText("Organization"), "Rowing Club");
    await user.click(within(dialog).getByRole("button", { name: "Add user" }));
    expect(await screen.findByText(/welcome email wasn't sent: emails are turned off\. Their temporary password is Xy7kPq2mNb4r/)).toBeInTheDocument();
  });

  it("closes the window with Esc, × or Cancel without adding anyone", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Add" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("won't add a Client or Factory account without its organization or factory", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Add" }));
    const dialog = screen.getByRole("dialog", { name: "Add a user" });
    await user.type(within(dialog).getByLabelText("Email"), "new@example.com");
    await user.type(within(dialog).getByLabelText("First name"), "New");
    await user.type(within(dialog).getByLabelText("Last name"), "Person");
    // There's no "Not linked" choice, and the form won't send until one is chosen.
    expect(within(dialog).queryByRole("option", { name: "Not linked" })).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Organization")).toBeRequired();
    await user.click(within(dialog).getByRole("button", { name: "Add user" }));
    expect(calls).toEqual([]);

    await user.selectOptions(within(dialog).getByLabelText("Access level"), "Factory");
    expect(within(dialog).getByLabelText("Factory")).toBeRequired();
    await user.click(within(dialog).getByRole("button", { name: "Add user" }));
    expect(calls).toEqual([]);

    await user.selectOptions(within(dialog).getByLabelText("Factory"), "Ocean Factory");
    await user.click(within(dialog).getByRole("button", { name: "Add user" }));
    await waitFor(() => expect(calls).toEqual([{ name: "create-user", body: expect.objectContaining({ role: "factory", factory_id: "fac1", organization_id: null }) }]));
  });
});

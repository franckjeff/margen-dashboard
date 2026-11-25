import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChooseOwnPasswordPage } from "./LoginPage";

// Records what the page asks Supabase to do.
const calls: string[] = [];
let updateError: Error | null = null;
vi.mock("../lib/supabase", async (original) => ({
  ...(await original<typeof import("../lib/supabase")>()),
  supabase: {
    auth: {
      updateUser: async ({ password }: { password: string }) => (calls.push(`updateUser ${password}`), { error: updateError }),
      signOut: async () => (calls.push("signOut"), { error: null }),
    },
    rpc: async (name: string) => (calls.push(`rpc ${name}`), { error: null }),
  },
}));

const fill = async (password: string, confirm = password) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("New password"), password);
  await user.type(screen.getByLabelText("Repeat it"), confirm);
  await user.click(screen.getByRole("button", { name: "Save and continue" }));
};

describe("Choosing your own password at first sign-in", () => {
  beforeEach(() => {
    calls.length = 0;
    updateError = null;
  });

  it("saves the new password, clears the temporary-password flag, then opens the app", async () => {
    const saved = vi.fn();
    render(<ChooseOwnPasswordPage email="new@example.com" onSaved={saved} />);
    expect(screen.getByText(/temporary password/)).toBeInTheDocument();
    await fill("my-own-password");
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(calls).toEqual(["updateUser my-own-password", "rpc password_changed"]);
  });

  it("keeps asking when the two passwords differ", async () => {
    const saved = vi.fn();
    render(<ChooseOwnPasswordPage email="new@example.com" onSaved={saved} />);
    await fill("my-own-password", "something-else");
    expect(screen.getByText("The two passwords don't match.")).toBeInTheDocument();
    expect(calls).toEqual([]);
    expect(saved).not.toHaveBeenCalled();
  });

  it("keeps the flag when the new password isn't accepted", async () => {
    updateError = new Error("New password should be different from the old password.");
    const saved = vi.fn();
    render(<ChooseOwnPasswordPage email="new@example.com" onSaved={saved} />);
    await fill("temporary-one");
    expect(await screen.findByText(/should be different/)).toBeInTheDocument();
    expect(calls).toEqual(["updateUser temporary-one"]);
    expect(saved).not.toHaveBeenCalled();
  });
});

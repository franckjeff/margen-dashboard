import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Role } from "../../lib/constants";
import { ORDER_STATUSES } from "../../lib/constants";
import { GuidePage } from "./GuidePage";
import { ORDER_STATUS_MEANINGS } from "./guideText";

let role: Role = "factory";
vi.mock("../../auth/AuthProvider", () => ({ useSignedIn: () => ({ role }) }));
// The badges use the built-in colours here.
vi.mock("../../data/queries", async (original) => ({
  ...(await original<typeof import("../../data/queries")>()),
  useStatusColors: () => ({ data: {} }),
}));

const renderGuide = (as: Role) => {
  role = as;
  render(
    <MemoryRouter>
      <GuidePage />
    </MemoryRouter>,
  );
};
const contents = () => screen.getAllByRole("listitem").filter((li) => li.closest(".guide-toc")).map((li) => li.textContent);

describe("User guide", () => {
  it("explains every order status to every audience", () => {
    for (const meanings of Object.values(ORDER_STATUS_MEANINGS)) {
      expect(Object.keys(meanings).sort()).toEqual(Object.keys(ORDER_STATUSES).sort());
    }
  });

  it("shows factory users only the factory guide", () => {
    renderGuide("factory");
    expect(contents()).toContain("Good habits");
    expect(contents()).not.toContain("Placing a new order");
    expect(screen.getByText("Production status: yours to update")).toBeInTheDocument();
    expect(screen.queryByLabelText("Guide for")).not.toBeInTheDocument();
  });

  it("shows client users only the client guide", () => {
    renderGuide("client");
    expect(contents()).toContain("Placing a new order");
    expect(contents()).not.toContain("Good habits");
    expect(screen.getByText("Production status: updated by the factory")).toBeInTheDocument();
    expect(screen.queryByText(/Save shipping/)).not.toBeInTheDocument();
    expect(screen.queryByText(/factory order ID/i)).not.toBeInTheDocument();
  });

  it("shows admins their own guide first", () => {
    renderGuide("admin");
    expect(contents()).toContain("Users and access");
    expect(contents()).toContain("Emails");
    expect(contents()).not.toContain("Good habits");
    // The admin guide isn't introduced as another audience's view.
    expect(screen.queryByText(/You're reading the guide as/)).not.toBeInTheDocument();
  });

  it("lets admins switch between the three guides", async () => {
    renderGuide("admin");
    await userEvent.selectOptions(screen.getByLabelText("Guide for"), "factory");
    expect(contents()).toContain("Good habits");
    await userEvent.selectOptions(screen.getByLabelText("Guide for"), "client");
    expect(contents()).toContain("Placing a new order");
    expect(contents()).not.toContain("Good habits");
  });
});

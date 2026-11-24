import { render, screen, within } from "@testing-library/react";
import { PRODUCTION_STATUSES } from "../../lib/constants";
import { StatusFlow } from "./StatusFlow";

// The badges use the built-in colours here.
vi.mock("../../data/queries", async (original) => ({
  ...(await original<typeof import("../../data/queries")>()),
  useStatusColors: () => ({ data: {} }),
}));

describe("StatusFlow", () => {
  it("shows every production step, Not started first, and who sets what", () => {
    render(<StatusFlow audience="factory" />);
    const flow = screen.getByRole("figure");
    for (const label of ["Not started", ...Object.values(PRODUCTION_STATUSES)]) {
      expect(within(flow).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(within(flow).getByText("Set by you")).toBeInTheDocument();
    expect(within(flow).getByText("MARGEN assigns your factory")).toBeInTheDocument();
  });

  it("speaks of the factory to client users", () => {
    render(<StatusFlow audience="client" />);
    expect(screen.getByText("Set by the factory")).toBeInTheDocument();
    expect(screen.getByText("MARGEN assigns a factory")).toBeInTheDocument();
  });
});

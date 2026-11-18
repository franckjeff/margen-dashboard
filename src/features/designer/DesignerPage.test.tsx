import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { DesignerPage } from "./DesignerPage";

const zone = (id: string) => document.querySelectorAll(`[data-zone="${id}"]`);

describe("Kit designer (demo)", () => {
  it("colours a zone, and shows the name and number on the back", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DesignerPage />
      </MemoryRouter>,
    );
    // Both sleeves take the colour.
    await user.click(screen.getByRole("button", { name: "Sleeves: #e5484d" }));
    expect([...zone("sleeves")].map((p) => p.getAttribute("fill"))).toEqual(["#e5484d", "#e5484d"]);

    expect(screen.queryByText("MARGEN")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("MARGEN")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});

import { render, screen, within } from "@testing-library/react";
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

describe("Kit designer gradients (demo)", () => {
  it("fills the front panel with a gradient of up to three colours", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DesignerPage />
      </MemoryRouter>,
    );
    const fill = within(screen.getByRole("group", { name: "Front panel fill" }));
    await user.click(fill.getByRole("button", { name: "Gradient" }));
    const panel = zone("front-panel")[0];
    expect(panel.getAttribute("fill")).toMatch(/^url\(#kit[\w-]+-front-panel\)$/);
    const stops = () => [...document.querySelectorAll("linearGradient stop")].map((s) => s.getAttribute("stop-color"));
    expect(stops()).toEqual(["#002138", "#7ef84d"]);

    // A third colour, then no more.
    await user.click(screen.getByRole("button", { name: "Add a third colour" }));
    expect(stops()).toEqual(["#002138", "#7ef84d", "#ffffff"]);
    expect(screen.queryByRole("button", { name: "Add a third colour" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Front panel, colour 2: #e5484d" }));
    expect(stops()).toEqual(["#002138", "#e5484d", "#ffffff"]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Direction" }), "horizontal");
    expect(document.querySelector("linearGradient")).toHaveAttribute("x2", "1");
    expect(document.querySelector("linearGradient")).toHaveAttribute("y2", "0");

    // Back to a solid colour.
    await user.click(fill.getByRole("button", { name: "Solid" }));
    expect(zone("front-panel")[0].getAttribute("fill")).toBe("#002138");
    expect(document.querySelector("linearGradient")).toBeNull();
  });
});

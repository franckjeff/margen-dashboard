import { textOn } from "./colors";

describe("textOn", () => {
  it("puts dark text on light colours and white text on dark ones", () => {
    expect(textOn("#ffe066")).toBe("#000c1c"); // yellow
    expect(textOn("#7ef84d")).toBe("#000c1c"); // MARGEN green
    expect(textOn("#e5484d")).toBe("#ffffff"); // red
    expect(textOn("#000c1c")).toBe("#ffffff"); // navy
  });
});

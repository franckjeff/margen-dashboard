import { orderOrganizationName } from "./format";

describe("an order's organization name", () => {
  it("is the linked organization's, or the name kept when it was deleted", () => {
    expect(orderOrganizationName({ organization: { name: "Rowing Club" }, organization_name: null })).toBe("Rowing Club");
    expect(orderOrganizationName({ organization: null, organization_name: "Old Club" })).toBe("Old Club");
    expect(orderOrganizationName({ organization: null, organization_name: null })).toBeNull();
  });
});

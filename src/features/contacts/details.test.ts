import { contactDetailsRow } from "./details";

const address = { address_line1: "1 Rue Haute", address_line2: "", city: "Lyon", state: "", postal_code: "69001", country: "France" };
const billing = {
  billing_address_line1: "2 Rue Basse",
  billing_address_line2: "",
  billing_city: "Paris",
  billing_state: "",
  billing_postal_code: "75001",
  billing_country: "France",
};

describe("contactDetailsRow", () => {
  it("keeps the phone and WhatsApp, with empty fields as null", () => {
    const row = contactDetailsRow({ phone: "+33 6 12 34 56 78", whatsapp: "on", billing_same_as_delivery: "on", ...address });
    expect(row.phone).toBe("+33 6 12 34 56 78");
    expect(row.whatsapp).toBe(true);
    expect(row.address_line2).toBeNull();
    expect(row.city).toBe("Lyon");
  });

  it("drops a billing address that's the same as the delivery address", () => {
    const row = contactDetailsRow({ phone: "", billing_same_as_delivery: "on", ...address, ...billing });
    expect(row.phone).toBeNull();
    expect(row.whatsapp).toBe(false);
    expect(row.billing_same_as_delivery).toBe(true);
    expect(row.billing_city).toBeNull();
  });

  it("keeps a billing address of its own", () => {
    const row = contactDetailsRow({ phone: "", ...address, ...billing });
    expect(row.billing_same_as_delivery).toBe(false);
    expect(row.billing_address_line1).toBe("2 Rue Basse");
    expect(row.billing_city).toBe("Paris");
    expect(row.billing_state).toBeNull();
  });
});

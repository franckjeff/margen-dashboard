import { EMAIL_PATTERN, isEmail } from "./email";

const GOOD = ["name@example.com", "first.last+club@sub.example.co.nz", " padded@example.com "];
const BAD = ["", "name", "name@", "@example.com", "name@example", "name@exa mple.com", "two@@example.com", "a@b@example.com", `${"x".repeat(310)}@example.com`];

describe("email addresses", () => {
  it("accepts full addresses", () => {
    for (const email of GOOD) expect(isEmail(email), email).toBe(true);
  });

  it("refuses anything else", () => {
    for (const email of BAD) expect(isEmail(email), email).toBe(false);
  });

  it("gives forms the same rule", () => {
    const pattern = new RegExp(`^(?:${EMAIL_PATTERN})$`);
    for (const email of GOOD) expect(pattern.test(email.trim()), email).toBe(true);
    for (const email of BAD.slice(0, -1)) expect(pattern.test(email), email).toBe(false);
  });
});

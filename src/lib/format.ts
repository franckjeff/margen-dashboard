type Person = { first_name: string; last_name: string };
type Located = { state?: string | null; country?: string | null };
type Address = {
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
};

export const fullName = (p: Person) => `${p.first_name} ${p.last_name}`;
export const place = (o: Located) => [o.state, o.country].filter(Boolean).join(", ");
export const contactLocation = (c: { city?: string | null; country?: string | null }) =>
  [c.city, c.country].filter(Boolean).join(", ");
// e.g. ["2909 Kalakaua Ave", "Honolulu, Hawaii 96815", "United States"]
export const addressLines = (c: Address) =>
  [
    c.address_line1,
    c.address_line2,
    [[c.city, c.state].filter(Boolean).join(", "), c.postal_code].filter(Boolean).join(" "),
    c.country,
  ].filter((line): line is string => Boolean(line));

export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
export const byPerson = (a: Person, b: Person) =>
  a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name);

export const formatDate = (date: string) =>
  new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
// A calendar day stored as "YYYY-MM-DD", shown as that same day wherever the user is.
export const formatDay = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
export const formatDateTime = (date: string) =>
  new Date(date).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const dayOfYear = (date = new Date()) =>
  Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);

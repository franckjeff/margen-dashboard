// The kinds of email the app sends, as the Email pages name them.
// Must match the check constraints on email_outbox, and private.email_kinds() in the database.
export const KIND_LABELS: Record<string, string> = {
  order_assigned: "Order assigned (to the factory's default contact)",
  order_shipped: "Order shipped (to the client's default contact)",
  order_request: "New order request (to admins)",
  quote_request: "New quote request (to admins)",
  athlete_note_added: "Athlete note added (to admins)",
  order_note_from_factory: "Order note from the factory (to admins)",
  order_note_from_admin: "Order note from MARGEN (to the factory's default contact)",
};

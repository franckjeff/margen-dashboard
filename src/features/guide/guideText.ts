// The two audiences of the User guide.
export type Audience = "factory" | "client";

// What each order status means for each audience. Every status in ORDER_STATUSES needs both.
export const ORDER_STATUS_MEANINGS: Record<Audience, Record<string, string>> = {
  factory: {
    received: "MARGEN has received the order. Wait for it to be accepted before starting, unless MARGEN tells you otherwise.",
    accepted: "The order is confirmed. Go ahead with production.",
    in_production: "MARGEN has moved the order into production. Keep its production status and shipping details current.",
    done: "The order is complete. Nothing more to do.",
    on_hold: "Pause the work and check with MARGEN before going further.",
    cancelled: "The order won't go ahead. Stop any work on it.",
  },
  client: {
    received: "MARGEN has received your order and is checking it.",
    accepted: "MARGEN has confirmed your order. Production starts soon.",
    in_production: "Your order is being made. Its production status shows how far along it is.",
    done: "Your order is complete.",
    on_hold: "Your order is paused. MARGEN will be in touch; contact them if you have questions.",
    cancelled: "Your order won't go ahead.",
  },
};

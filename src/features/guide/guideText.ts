// The audiences of the User guide. Admins read their own guide, or either of the others.
export type Audience = "admin" | "factory" | "client";

// What each order status means for each audience. Every status in ORDER_STATUSES needs all three.
export const ORDER_STATUS_MEANINGS: Record<Audience, Record<string, string>> = {
  admin: {
    received: "A new order: check it has an organization and items, then accept it.",
    accepted: "Confirmed. Assign a factory to start production.",
    in_production: "Assigned to a factory, which moves the production status along.",
    shipped: "Set on its own when production reaches Shipped. Can be archived from here.",
    cancelled: "Won't go ahead. Final: a cancelled order can't be reopened.",
  },
  factory: {
    received: "MARGEN has received the order. Wait for it to be accepted before starting, unless MARGEN tells you otherwise.",
    accepted: "The order is confirmed. Go ahead with production.",
    in_production: "MARGEN has assigned the order to your factory. Keep its production status and shipping details current.",
    shipped: "The order has shipped. Set automatically when you set production to Shipped.",
    cancelled: "The order won't go ahead. Stop any work on it.",
  },
  client: {
    received: "MARGEN has received your order and is checking it.",
    accepted: "MARGEN has confirmed your order. Production starts soon.",
    in_production: "Your order is being made. Its production status shows how far along it is.",
    shipped: "Your order has shipped.",
    cancelled: "Your order won't go ahead.",
  },
};

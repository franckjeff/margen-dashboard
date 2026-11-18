// Dark text on light colours and white text on dark ones, so a badge stays readable whatever colour
// an admin picks. Uses the perceived brightness of the colour (YIQ).
export function textOn(background: string): string {
  const hex = background.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 >= 150 ? "#000c1c" : "#ffffff";
}

// Where the colour picker starts for a status that still has the app's built-in colour.
// Close to the built-in light-mode colours in styles.css (.tone-* classes).
export const BUILT_IN_COLORS: Record<string, string> = {
  "order:received": "#ffa94d",
  "order:accepted": "#ffe066",
  "order:in_production": "#ffe066",
  "order:done": "#7ef84d",
  "order:on_hold": "#fdf1dc",
  "order:cancelled": "#e5484d",
  "production:shipped": "#7ef84d",
};
export const builtInColor = (key: string) => BUILT_IN_COLORS[key] ?? "#e2eaef";

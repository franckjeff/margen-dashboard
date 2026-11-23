// DEMO kit designer: a placeholder long-sleeve rash guard, drawn here as simple shapes.
// Real garments would come from your own SVG drawings, one shape per colourable zone, named the same way.

export type View = "front" | "back";

// gradient: the zone can also be a gradient of up to three colours. view: the zone shows on that view only.
export type Zone = { id: string; label: string; color: string; gradient?: boolean; view?: View };

// The colourable zones, with their starting colours (MARGEN navy and green).
export const ZONES: Zone[] = [
  { id: "front-panel", label: "Front panel", color: "#002138", gradient: true, view: "front" },
  { id: "back-panel", label: "Back panel", color: "#002138", gradient: true, view: "back" },
  { id: "side-panels", label: "Side panels", color: "#7ef84d" },
  { id: "sleeves", label: "Sleeves", color: "#002138" },
  { id: "cuffs", label: "Cuffs", color: "#7ef84d" },
  { id: "collar", label: "Collar", color: "#7ef84d" },
];

export const SWATCHES = ["#002138", "#000c1c", "#61808f", "#7ef84d", "#ffffff", "#e5484d", "#ffa94d", "#ffe066", "#1e88e5", "#00a8a8"];

type Point = [number, number];
const WIDTH = 400;
const mirror = (points: Point[]): Point[] => points.map(([x, y]) => [WIDTH - x, y]);
const poly = (points: Point[]) => `M${points.map(([x, y]) => `${x},${y}`).join(" L")} Z`;

const leftSleeve: Point[] = [[146, 62], [118, 150], [84, 282], [48, 268]];
const leftCuff: Point[] = [[48, 268], [84, 282], [76, 308], [39, 294]];
const leftSide: Point[] = [[119, 166], [141, 171], [141, 373], [119, 371]];

// A shape of one zone. The neckline dips lower at the front than at the back.
export function shapes(view: View): { zone: string; d: string }[] {
  const neck = view === "front" ? 92 : 66;
  const band = view === "front" ? 80 : 58;
  return [
    { zone: "sleeves", d: poly(leftSleeve) },
    { zone: "sleeves", d: poly(mirror(leftSleeve)) },
    { zone: "cuffs", d: poly(leftCuff) },
    { zone: "cuffs", d: poly(mirror(leftCuff)) },
    { zone: view === "front" ? "front-panel" : "back-panel", d: `M146,62 L172,54 Q200,${neck} 228,54 L254,62 L282,150 L282,372 Q200,386 118,372 L118,150 Z` },
    { zone: "side-panels", d: poly(leftSide) },
    { zone: "side-panels", d: poly(mirror(leftSide)) },
    { zone: "collar", d: `M172,54 Q200,${neck} 228,54 L222,46 Q200,${band} 178,46 Z` },
  ];
}

// A gradient across a zone: two or three colours, evenly spaced, in one direction.
export type Direction = "vertical" | "horizontal" | "diagonal";
export type Gradient = { stops: string[]; direction: Direction };
export const MAX_GRADIENT_COLORS = 3;
export const DIRECTIONS: { id: Direction; label: string; x2: number; y2: number }[] = [
  { id: "vertical", label: "Top to bottom", x2: 0, y2: 1 },
  { id: "horizontal", label: "Left to right", x2: 1, y2: 0 },
  { id: "diagonal", label: "Diagonal", x2: 1, y2: 1 },
];

// Where a logo can go, as a box on one view.
export type Placement = { id: string; label: string; view: View; x: number; y: number; w: number; h: number };

export const PLACEMENTS: Placement[] = [
  { id: "chest-centre", label: "Chest, centre", view: "front", x: 160, y: 118, w: 80, h: 70 },
  { id: "chest-left", label: "Chest, left", view: "front", x: 214, y: 108, w: 46, h: 42 },
  { id: "upper-back", label: "Upper back", view: "back", x: 150, y: 88, w: 100, h: 56 },
];

// Where the name and number are printed on the back.
export const BACK_NAME = { x: 200, y: 186 };
export const BACK_NUMBER = { x: 200, y: 282 };

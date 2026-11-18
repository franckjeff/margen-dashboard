import { useRef, useState } from "react";
import { Link } from "react-router";
import { Logo } from "../../components/Layout";
import { BACK_NAME, BACK_NUMBER, PLACEMENTS, SWATCHES, ZONES, shapes, type View } from "./garment";
import "./designer.css";

// DEMO kit designer (#/design): a public page where a client colours a garment, adds a logo, a name
// and a number, and downloads the result. Nothing is saved. To remove the demo: delete this folder,
// the "design" route in App.tsx and the "Try the kit designer" link in auth/PublicHome.tsx.

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const startColors = () => Object.fromEntries(ZONES.map((z) => [z.id, z.color]));

export function DesignerPage() {
  const [view, setView] = useState<View>("front");
  const [colors, setColors] = useState<Record<string, string>>(startColors);
  const [logo, setLogo] = useState<{ src: string; name: string } | null>(null);
  const [placement, setPlacement] = useState(PLACEMENTS[0].id);
  const [logoScale, setLogoScale] = useState(100);
  const [name, setName] = useState("MARGEN");
  const [number, setNumber] = useState("7");
  const [textColor, setTextColor] = useState("#ffffff");
  const [error, setError] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const spot = PLACEMENTS.find((p) => p.id === placement)!;

  function readLogo(file: File) {
    if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type)) return setError("Upload a PNG, JPG or SVG image.");
    if (file.size > MAX_LOGO_BYTES) return setError("That image is over 5 MB. Try a smaller one.");
    const reader = new FileReader();
    reader.onload = () => {
      setLogo({ src: String(reader.result), name: file.name });
      setError(null);
      // Show the logo where it was placed.
      setView(spot.view);
    };
    reader.readAsDataURL(file);
  }

  function choosePlacement(id: string) {
    setPlacement(id);
    setView(PLACEMENTS.find((p) => p.id === id)!.view);
  }

  function startAgain() {
    setColors(startColors());
    setLogo(null);
    setPlacement(PLACEMENTS[0].id);
    setLogoScale(100);
    setName("MARGEN");
    setNumber("7");
    setTextColor("#ffffff");
    setError(null);
  }

  // The logo fits inside its box, scaled around the box's centre.
  const k = logoScale / 100;
  const logoBox = { w: spot.w * k, h: spot.h * k, x: spot.x + (spot.w * (1 - k)) / 2, y: spot.y + (spot.h * (1 - k)) / 2 };

  return (
    <div className="public-page">
      <header className="public-head">
        <Link to="/" aria-label="MARGEN home">
          <Logo />
        </Link>
        <span className="tagline">Kit designer</span>
        <Link to="/" className="public-back">
          ← Back to MARGEN
        </Link>
      </header>
      <main className="designer">
        <div className="designer-intro">
          <h1>Design your kit</h1>
          <p className="muted">
            Pick your colours, add your logo, name and number, and see it on the garment. <span className="designer-demo">Demo</span>
          </p>
        </div>

        <section className="card designer-preview" aria-label="Preview">
          <div className="designer-views" role="group" aria-label="View">
            {(["front", "back"] as View[]).map((v) => (
              <button key={v} type="button" className={view === v ? "primary small" : "small"} aria-pressed={view === v} onClick={() => setView(v)}>
                {v === "front" ? "Front" : "Back"}
              </button>
            ))}
          </div>
          <svg ref={svg} viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`Rash guard, ${view} view`} className="designer-svg">
            {shapes(view).map((s, i) => (
              <path key={i} d={s.d} fill={colors[s.zone]} data-zone={s.zone} />
            ))}
            {/* Seams and outlines on top, so they show whatever the colours. */}
            <g fill="none" stroke="#000c1c" strokeOpacity="0.55" strokeWidth="1.5" strokeLinejoin="round">
              {shapes(view).map((s, i) => (
                <path key={i} d={s.d} />
              ))}
              <path d="M120,364 Q200,378 280,364" strokeDasharray="4 4" strokeOpacity="0.4" />
            </g>
            {logo && spot.view === view && (
              <image href={logo.src} x={logoBox.x} y={logoBox.y} width={logoBox.w} height={logoBox.h} preserveAspectRatio="xMidYMid meet" />
            )}
            {view === "back" && (
              <g fill={textColor} textAnchor="middle" fontFamily="'Exo 2', sans-serif">
                {name && (
                  <text x={BACK_NAME.x} y={BACK_NAME.y} fontSize={name.length > 10 ? 18 : 24} fontWeight="600" letterSpacing="3">
                    {name.toUpperCase()}
                  </text>
                )}
                {number && (
                  <text x={BACK_NUMBER.x} y={BACK_NUMBER.y} fontSize="92" fontWeight="600">
                    {number}
                  </text>
                )}
              </g>
            )}
          </svg>
        </section>

        <div className="designer-controls">
          <section className="card section">
            <h2>Colours</h2>
            {ZONES.map((z) => (
              <div key={z.id} className="designer-zone">
                <span className="strong">{z.label}</span>
                <div className="designer-swatches">
                  {SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`designer-swatch${colors[z.id] === c ? " chosen" : ""}`}
                      style={{ backgroundColor: c }}
                      aria-label={`${z.label}: ${c}`}
                      aria-pressed={colors[z.id] === c}
                      onClick={() => setColors((all) => ({ ...all, [z.id]: c }))}
                    />
                  ))}
                  <input
                    type="color"
                    className="color-input"
                    value={colors[z.id]}
                    aria-label={`Any colour for ${z.label}`}
                    onChange={(e) => setColors((all) => ({ ...all, [z.id]: e.target.value }))}
                  />
                </div>
              </div>
            ))}
          </section>

          <section className="card section">
            <h2>Logo</h2>
            {error && <p className="notice error">{error}</p>}
            <label>
              {logo ? `Replace ${logo.name}` : "Upload your logo (PNG with a transparent background works best)"}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(e) => e.target.files?.[0] && readLogo(e.target.files[0])} />
            </label>
            <div className="field-row">
              <label>
                Placement
                <select value={placement} onChange={(e) => choosePlacement(e.target.value)}>
                  {PLACEMENTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Size ({logoScale}%)
                <input type="range" min="50" max="150" step="5" value={logoScale} onChange={(e) => setLogoScale(Number(e.target.value))} />
              </label>
            </div>
            {logo && (
              <button type="button" className="ghost small" onClick={() => setLogo(null)}>
                Remove logo
              </button>
            )}
          </section>

          <section className="card section">
            <h2>Name and number</h2>
            <p className="muted small">Printed on the back.</p>
            <div className="field-row">
              <label>
                Name
                <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} onFocus={() => setView("back")} />
              </label>
              <label>
                Number
                <input value={number} maxLength={2} inputMode="numeric" onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))} onFocus={() => setView("back")} />
              </label>
              <label>
                Text colour
                <input type="color" className="color-input" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
              </label>
            </div>
          </section>

          <div className="designer-actions">
            <button type="button" onClick={() => svg.current && downloadPng(svg.current, `margen-kit-${view}.png`).catch(() => setError("Couldn't create the image."))}>
              Download {view} image
            </button>
            <button type="button" className="ghost" onClick={startAgain}>
              Start again
            </button>
            <Link to="/quote" className="button primary">
              Request a quote
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

// Turns the preview into a PNG file, at twice its size so it stays sharp.
async function downloadPng(svgEl: SVGSVGElement, fileName: string) {
  const markup = new XMLSerializer().serializeToString(svgEl);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const link = document.createElement("a");
    link.download = fileName;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

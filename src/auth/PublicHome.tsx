import type { ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "../components/Layout";
import { ABOUT, HERO, QUOTE, WHY } from "./publicText";

// The links move down the page by id: the app's URLs use the "#", so plain #about links can't be used.
const goTo = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

const SECTIONS = [
  { id: "about", label: "About" },
  { id: "why", label: "Why MARGEN" },
  { id: "quote", label: "Request a quote" },
];

// What people see before signing in: about MARGEN Customs, why choose it, a quote request, and the sign-in form.
export function PublicHome({ signIn }: { signIn: ReactNode }) {
  return (
    <div className="home">
      <header className="home-head">
        <Logo />
        <nav className="home-nav" aria-label="Sections">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className="link-button" onClick={goTo(s.id)}>
              {s.label}
            </button>
          ))}
          <button type="button" className="home-signin" onClick={goTo("sign-in")}>
            Sign in
          </button>
        </nav>
      </header>

      <section className="home-hero">
        <div className="home-hero-text">
          <p className="tagline">For the Marine Generation</p>
          <h1>{HERO.title}</h1>
          <p className="home-intro">{HERO.intro}</p>
          <div className="home-actions">
            <Link to="/quote" className="button primary home-cta">
              {QUOTE.button}
            </Link>
            <button type="button" className="home-ghost" onClick={goTo("about")}>
              Learn more
            </button>
          </div>
        </div>
        <div id="sign-in" className="home-signin-card">
          {signIn}
        </div>
      </section>

      <section id="about" className="home-section">
        <h2>{ABOUT.title}</h2>
        {ABOUT.paragraphs.map((p) => (
          <p key={p} className="home-lead">
            {p}
          </p>
        ))}
        <ol className="home-steps">
          {ABOUT.steps.map((s, i) => (
            <li key={s.title} className="card">
              <span className="home-step-n">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="why" className="home-section">
        <h2>{WHY.title}</h2>
        <ul className="home-reasons">
          {WHY.reasons.map((r) => (
            <li key={r.title} className="card">
              <h3>{r.title}</h3>
              <p>{r.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="quote" className="home-section home-quote">
        <div className="card">
          <h2>{QUOTE.title}</h2>
          <p className="home-lead">{QUOTE.text}</p>
          <div className="home-actions">
            <Link to="/quote" className="button primary home-cta">
              {QUOTE.button}
            </Link>
            {/* DEMO kit designer link: remove with the src/features/designer folder. */}
            <Link to="/design" className="button">
              Try the kit designer
            </Link>
          </div>
          <p className="home-orders-note">{QUOTE.ordersNote}</p>
          <button type="button" onClick={goTo("sign-in")}>
            {QUOTE.signInButton}
          </button>
        </div>
      </section>

      <footer className="home-foot">
        <Logo />
        <p className="tagline">For the Marine Generation</p>
      </footer>
    </div>
  );
}

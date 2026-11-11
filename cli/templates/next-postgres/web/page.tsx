import Items from "./items";

export default function Home() {
  return (
    <div className="frame">
      <div className="bar label">
        <span>
          <b>flisk</b> / __APP_NAME__
        </span>
        <span className="live">Postgres</span>
      </div>
      <div className="band" />
      <header className="hero">
        <span className="label">Next.js · Express · Postgres</span>
        <h1>__APP_NAME__</h1>
        <p className="sub">
          A list saved in Postgres. The migrator made the table, the API serves it, this page edits
          it.
        </p>
      </header>
      <Items />
    </div>
  );
}

import "./Footer.css";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <h2 className="site-footer__name">Local Lens</h2>
          <p className="site-footer__tagline">
            A source-aware travel planner for discovering Bangladesh beyond the
            usual lists—organized into a practical route you can actually use.
          </p>
        </div>

        <div className="site-footer__contact">
          <h3 className="site-footer__heading">Built for real planning</h3>
          <ul className="site-footer__points">
            <li>Recommendations checked against local sources</li>
            <li>Routes, weather, budget, and calendar in one place</li>
            <li>Your saved trips stay in this browser</li>
          </ul>
        </div>
      </div>

      <div className="site-footer__bottom">
        <p>&copy; {new Date().getFullYear()} Local Lens</p>
        <p>Travel details can change—confirm opening hours and availability before you go.</p>
      </div>
    </footer>
  );
}

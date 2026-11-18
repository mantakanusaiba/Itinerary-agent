import "./Footer.css";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="site-footer__tagline">
          Local-first travel planning for Bangladesh.
        </p>
        <p className="site-footer__note">
          Saved trips are stored in this browser only.
        </p>
        <p className="site-footer__copy">
          &copy; {new Date().getFullYear()} Itinerary Planner. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

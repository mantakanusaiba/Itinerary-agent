import "./Footer.css";

// Update these with your real accounts.
const CONTACT = {
  instagram: "https://instagram.com/your_handle",
  facebook: "https://facebook.com/your.page",
  whatsapp: "https://wa.me/8801XXXXXXXXX", // country code + number, no "+" or spaces
  email: "hello@example.com",
};

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.4" cy="6.6" r="0.6" fill="currentColor" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-.8.8a3.5 3.5 0 0 1-1.5-1.5l.8-.8-1-2z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <polyline points="2.5,7 12,13.5 21.5,7" />
    </svg>
  );
}

const SOCIALS = [
  { label: "Instagram", href: CONTACT.instagram, Icon: InstagramIcon },
  { label: "Facebook", href: CONTACT.facebook, Icon: FacebookIcon },
  { label: "WhatsApp", href: CONTACT.whatsapp, Icon: WhatsAppIcon },
  { label: "Email", href: `mailto:${CONTACT.email}`, Icon: MailIcon },
];

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <h2 className="site-footer__name">Itinerary Planner</h2>
          <p className="site-footer__tagline">
            Local-first travel planning for Bangladesh. Real recommendations,
            mapped day by day.
          </p>
        </div>

        <div className="site-footer__contact">
          <h3 className="site-footer__heading">Get in touch</h3>
          <ul className="site-footer__socials">
            {SOCIALS.map(({ label, href, Icon }) => (
              <li key={label}>
                <a
                  className="site-footer__social"
                  href={href}
                  target={href.startsWith("mailto:") ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  aria-label={label}
                  title={label}
                >
                  <Icon />
                </a>
              </li>
            ))}
          </ul>
          <a className="site-footer__email" href={`mailto:${CONTACT.email}`}>
            {CONTACT.email}
          </a>
        </div>
      </div>

      <div className="site-footer__bottom">
        <p>&copy; {new Date().getFullYear()} Itinerary Planner. All rights reserved.</p>
        <p>Saved trips are stored in this browser only.</p>
      </div>
    </footer>
  );
}

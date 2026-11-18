import { useEffect, useState, useCallback } from "react";
import "./DestinationShowcase.css";

// Featured destinations in Bangladesh. `image` is a local photo in
// public/destinations; `wiki` lists Wikipedia articles tried only if the local photo is missing;
// `gradient` is the fallback artwork shown if the photo cannot be loaded.
const DESTINATIONS = [
  {
    name: "Cox's Bazar",
    image: "/destinations/cox-bazar.jpg",
    region: "Chattogram Division",
    tagline: "The world's longest natural sea beach",
    wiki: ["Cox's Bazar Sea Beach", "Cox's Bazar"],
    gradient: "linear-gradient(160deg, #0b3b5c 0%, #1b8fa6 45%, #ffb25e 100%)",
  },
  {
    name: "Sylhet",
    image: "/destinations/sylhet.jpg",
    region: "Sylhet Division",
    tagline: "Tea gardens rolling into the hills",
    wiki: ["Ratargul Swamp Forest", "Jaflong", "Sylhet"],
    gradient: "linear-gradient(160deg, #06301f 0%, #1f8a5b 50%, #d8e86b 100%)",
  },
  {
    name: "Sundarbans",
    image: "/destinations/sundarbans.jpg",
    region: "Khulna Division",
    tagline: "Mangrove forest and the Bengal tiger",
    wiki: ["Sundarbans"],
    gradient: "linear-gradient(160deg, #04221c 0%, #0f6b4f 50%, #9bd37a 100%)",
  },
  {
    name: "Bandarban",
    image: "/destinations/bandarban.jpg",
    region: "Chattogram Division",
    tagline: "Hill tracts above the clouds",
    wiki: ["Bandarban", "Bandarban District"],
    gradient: "linear-gradient(160deg, #1a2440 0%, #4a6fa5 50%, #f2c27a 100%)",
  },
  {
    name: "Saint Martin's Island",
    image: "/destinations/saint-martins.jpg",
    region: "Cox's Bazar",
    tagline: "Coral shores and turquoise water",
    wiki: ["Saint Martin's Island"],
    gradient: "linear-gradient(160deg, #053b4a 0%, #19b5c4 50%, #fbe9a8 100%)",
  },
  {
    name: "Old Dhaka",
    image: "/destinations/old-dhaka.jpg",
    region: "Dhaka Division",
    tagline: "River ports, rickshaws and centuries of food",
    wiki: ["Old Dhaka", "Ahsan Manzil", "Dhaka"],
    gradient: "linear-gradient(160deg, #3a0f2e 0%, #b23a5b 50%, #ffc08a 100%)",
  },
];

const AUTO_MS = 5000;
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const photoCache = new Map();

const BAD_IMAGE = /\.svg|flag_of|coat_of_arms|locator|logo|icon/i;

// Strategy 1: Wikipedia lead images for the candidate articles (CORS-enabled, no key).
async function fetchFromWikipedia(titles) {
  try {
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&redirects=1` +
      `&titles=${encodeURIComponent(titles.join("|"))}` +
      `&prop=pageimages&format=json&pithumbsize=800&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = Object.values(data?.query?.pages ?? {});
    // Respect the order of the candidate list
    pages.sort((a, b) => {
      const ia = titles.findIndex((t) => t.toLowerCase() === (a.title || "").toLowerCase());
      const ib = titles.findIndex((t) => t.toLowerCase() === (b.title || "").toLowerCase());
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    for (const page of pages) {
      const src = page?.thumbnail?.source;
      if (src && !BAD_IMAGE.test(src)) return src;
    }
  } catch {
    /* try next strategy */
  }
  return null;
}

// Strategy 2: the app's own backend image search (same source the stop cards use).
async function fetchFromBackend(name, country) {
  try {
    const params = new URLSearchParams({ place: name, city: country });
    const res = await fetch(`${API_BASE}/api/image-search?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.images || []).find(Boolean) || null;
  } catch {
    return null;
  }
}

async function fetchCover(dest) {
  if (photoCache.has(dest.name)) return photoCache.get(dest.name);
  const src =
    (await fetchFromWikipedia(dest.wiki)) ||
    (await fetchFromBackend(dest.name, "Bangladesh"));
  photoCache.set(dest.name, src);
  return src;
}

export default function DestinationShowcase({ onPick }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [photos, setPhotos] = useState({});

  useEffect(() => {
    let cancelled = false;
    DESTINATIONS.forEach(async (d) => {
      if (d.image) {
        setPhotos((p) => ({ ...p, [d.name]: d.image }));
        return;
      }
      const src = await fetchCover(d);
      if (!cancelled && src) setPhotos((p) => ({ ...p, [d.name]: src }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const count = DESTINATIONS.length;
  const next = useCallback(() => setActive((i) => (i + 1) % count), [count]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(next, AUTO_MS);
    return () => clearInterval(id);
  }, [paused, next]);

  // Signed, wrapped distance from the active card: -2..+3 for 6 cards.
  function offsetOf(i) {
    let d = i - active;
    if (d > count / 2) d -= count;
    if (d < -count / 2) d += count;
    return d;
  }

  return (
    <div
      className="showcase"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="showcase__stage">
        {DESTINATIONS.map((d, i) => {
          const off = offsetOf(i);
          const abs = Math.abs(off);
          const isActive = off === 0;
          const hidden = abs > 2;
          const style = {
            "--off": off,
            "--abs": abs,
            "--art": d.gradient,
            zIndex: 10 - abs,
            opacity: hidden ? 0 : isActive ? 1 : abs === 1 ? 0.92 : 0.6,
            pointerEvents: hidden ? "none" : "auto",
          };
          return (
            <article
              key={d.name}
              className={`showcase__card${isActive ? " showcase__card--active" : ""}`}
              style={style}
              onClick={() => setActive(i)}
              aria-hidden={hidden}
            >
              <div className="showcase__art" />
              {photos[d.name] && (
                <img
                  className="showcase__photo"
                  src={photos[d.name]}
                  alt={`${d.name}, Bangladesh`}
                  draggable="false"
                  onError={async () => {
                    // Local photo missing: try an online lookup, else show the gradient
                    const online = photos[d.name] === d.image ? await fetchCover(d) : null;
                    setPhotos((p) => {
                      const { [d.name]: _drop, ...rest } = p;
                      return online ? { ...rest, [d.name]: online } : rest;
                    });
                  }}
                />
              )}
              <div className="showcase__shade" />
              <span className="showcase__country">{d.region}</span>
              <div className="showcase__caption">
                <h3 className="showcase__name">{d.name}</h3>
                <span className="showcase__rule" />
                <p className="showcase__tagline">{d.tagline}</p>
                {isActive && (
                  <button
                    type="button"
                    className="showcase__cta"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPick?.(d.name);
                    }}
                  >
                    Plan this trip
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="showcase__dots" role="tablist" aria-label="Featured destinations">
        {DESTINATIONS.map((d, i) => (
          <button
            key={d.name}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={d.name}
            className={`showcase__dot${i === active ? " showcase__dot--active" : ""}`}
            onClick={() => setActive(i)}
          />
        ))}
      </div>
    </div>
  );
}

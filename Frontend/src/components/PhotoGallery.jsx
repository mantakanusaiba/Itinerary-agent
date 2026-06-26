/**
 * PhotoGallery.jsx
 *
 * Shows a lightbox of up to 4 Wikipedia photos for a stop.
 * Uses the same Wikipedia pageimages + search API as ItineraryView —
 * CORS-enabled, free, no key, works from the browser.
 *
 * Strategy: search Wikipedia for "{stop name} {city}" → pick top 4 article
 * titles → fetch the thumbnail for each → open in a lightbox.
 */

import { useState, useEffect, useCallback } from "react";
import "./PhotoGallery.css";

const MAX_PHOTOS = 4;

async function fetchWikipediaPhotos(stopName, city) {
  const photos = [];

  try {
    // Search for up to MAX_PHOTOS relevant articles
    const searchUrl =
      `https://en.wikipedia.org/w/api.php?action=query` +
      `&list=search&srsearch=${encodeURIComponent(stopName + " " + city)}` +
      `&srlimit=${MAX_PHOTOS}&format=json&origin=*`;
    const sRes = await fetch(searchUrl);
    if (!sRes.ok) return [];
    const sData = await sRes.json();
    const hits = sData?.query?.search ?? [];

    // Also try the stop name alone
    const directHit = { title: stopName };
    const candidates = [directHit, ...hits].slice(0, MAX_PHOTOS + 2);

    for (const hit of candidates) {
      if (photos.length >= MAX_PHOTOS) break;
      try {
        const url =
          `https://en.wikipedia.org/w/api.php?action=query` +
          `&titles=${encodeURIComponent(hit.title)}` +
          `&prop=pageimages&format=json&pithumbsize=800&origin=*`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        const pages = data?.query?.pages ?? {};
        for (const page of Object.values(pages)) {
          if (page.missing !== undefined) continue;
          const thumb = page?.thumbnail?.source;
          if (thumb && !photos.includes(thumb)) {
            photos.push(thumb);
            break;
          }
        }
      } catch { continue; }
    }
  } catch { /* silent */ }

  return photos;
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ photos, initialIndex, stopName, onClose }) {
  const [index, setIndex] = useState(initialIndex);

  const prev = useCallback(() => setIndex((i) => (i - 1 + photos.length) % photos.length), [photos.length]);
  const next = useCallback(() => setIndex((i) => (i + 1) % photos.length), [photos.length]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  if (!photos.length) return null;

  return (
    <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label={`Photos of ${stopName}`}>
      <div className="gallery-lightbox__backdrop" onClick={onClose} />
      <div className="gallery-lightbox__inner">
        <button className="gallery-lightbox__close" onClick={onClose} aria-label="Close gallery">✕</button>

        <div className="gallery-lightbox__img-wrap">
          <img
            key={photos[index]}
            className="gallery-lightbox__img"
            src={photos[index]}
            alt={`${stopName} — photo ${index + 1}`}
          />
        </div>

        {photos.length > 1 && (
          <>
            <button className="gallery-lightbox__nav gallery-lightbox__nav--prev" onClick={prev} aria-label="Previous">‹</button>
            <button className="gallery-lightbox__nav gallery-lightbox__nav--next" onClick={next} aria-label="Next">›</button>
            <div className="gallery-lightbox__dots">
              {photos.map((_, i) => (
                <button
                  key={i}
                  className={`gallery-lightbox__dot${i === index ? " gallery-lightbox__dot--active" : ""}`}
                  onClick={() => setIndex(i)}
                  aria-label={`Photo ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}

        <p className="gallery-lightbox__caption">
          {stopName} — {index + 1} / {photos.length}
        </p>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PhotoGallery({ stopName, city, dayColor }) {
  const [open, setOpen]       = useState(false);
  const [photos, setPhotos]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  // Fetch photos when button is clicked (lazy — not on mount)
  async function handleOpen() {
    setOpen(true);
    if (fetched) return;
    setLoading(true);
    const results = await fetchWikipediaPhotos(stopName, city);
    setPhotos(results);
    setLoading(false);
    setFetched(true);
  }

  return (
    <>
      <button
        className="gallery-toggle"
        style={{ "--gallery-color": dayColor }}
        onClick={handleOpen}
        aria-label={`View photos of ${stopName}`}
      >
        <span className="gallery-toggle__icon">⬡</span>
        <span className="gallery-toggle__label">View photos</span>
      </button>

      {open && (
        loading ? (
          <div className="gallery-lightbox" role="dialog">
            <div className="gallery-lightbox__backdrop" onClick={() => setOpen(false)} />
            <div className="gallery-lightbox__inner" style={{ color: "#fff", fontSize: "1rem" }}>
              <button className="gallery-lightbox__close" onClick={() => setOpen(false)}>✕</button>
              Loading photos…
            </div>
          </div>
        ) : photos.length > 0 ? (
          <Lightbox
            photos={photos}
            initialIndex={0}
            stopName={stopName}
            onClose={() => setOpen(false)}
          />
        ) : (
          <div className="gallery-lightbox" role="dialog">
            <div className="gallery-lightbox__backdrop" onClick={() => setOpen(false)} />
            <div className="gallery-lightbox__inner" style={{ color: "#fff", fontSize: "0.9rem", textAlign: "center" }}>
              <button className="gallery-lightbox__close" onClick={() => setOpen(false)}>✕</button>
              <p style={{ margin: "1rem 0 0" }}>No photos found for <strong>{stopName}</strong>.</p>
            </div>
          </div>
        )
      )}
    </>
  );
}

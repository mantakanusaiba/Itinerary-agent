/**
 * ImageSlideshow.jsx  — v5
 *
 * AUTO-PLAYING image slideshow for each stop card.
 *
 * FETCH STRATEGY (in order, stops at MAX_IMAGES):
 *
 *  1. Backend /api/image-search — uses Tavily to search the real web
 *     (Google-indexed content, restaurant sites, Facebook photos, etc.)
 *     This is the primary source and finds images for virtually any place.
 *
 *  2. Wikipedia direct title lookup — reliable curated lead images
 *     for well-known landmarks.
 *
 *  3. Wikipedia search + short-name variants — for transliterated names.
 *
 *  4. Wikimedia Commons — relaxed filter (any keyword match).
 *
 *  5. City-level Wikipedia fallback — last resort so the card never
 *     shows a bare "?" placeholder.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import "./ImageSlideshow.css";


const imageCache = new Map();

const MAX_IMAGES = 5;
const AUTO_INTERVAL = 4000;
const API_BASE = "http://localhost:8000";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "in", "at", "on", "and", "or", "by", "for", "to",
  "de", "la", "le", "el", "al", "du", "des", "les",
  "street", "road", "avenue", "lane", "square", "park", "garden", "zone", "area",
  "restaurant", "cafe", "hotel", "bar", "shop", "museum", "gallery", "centre", "center",
]);

function keyWordsOf(name) {
  return name
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function titleContainsAnyKey(title, keyWords) {
  if (!keyWords.length) return false;
  const lower = title.toLowerCase();
  return keyWords.some((w) => lower.includes(w));
}

function isBadImage(title, thumbUrl, width, height) {
  const t = (title || "").toLowerCase();
  const u = (thumbUrl || "").toLowerCase();
  if (t.includes(".svg") || u.includes(".svg")) return true;
  if (t.includes("flag") || u.includes("flag")) return true;
  if (t.includes("coat_of_arms")) return true;
  if (t.includes("logo") || u.includes("logo")) return true;
  if (t.includes("locator") || u.includes("locator")) return true;
  if (t.includes("_map_") || t.includes("map_of")) return true;
  if (t.includes("icon") || t.includes("emblem")) return true;
  if (width && height && width / height > 3.5) return true;
  return false;
}

function shortName(name, n = 2) {
  const words = name
    .replace(/[-_]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()));
  return words.slice(0, n).join(" ");
}

// ── Strategy 1: Backend Tavily image search ───────────────────────────────────

async function fetchFromBackend(stopName, city) {
  const params = new URLSearchParams({ place: stopName, city });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/api/image-search?${params}`);

      if (!res.ok) continue;

      const data = await res.json();

      return (data.images || []).filter(Boolean);
    } catch {
      if (attempt === 1) return [];
    }
  }

  return [];
}

// ── Strategy 2–4: Wikipedia / Wikimedia fallbacks ────────────────────────────

async function wikiThumb(title) {
  try {
    const url =
      `https://en.wikipedia.org/w/api.php?action=query` +
      `&titles=${encodeURIComponent(title)}` +
      `&prop=pageimages&format=json&pithumbsize=900&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    for (const page of Object.values(data?.query?.pages ?? {})) {
      if (page.missing !== undefined) continue;
      const src = page?.thumbnail?.source;
      if (src && !isBadImage(title, src, 0, 0)) return src;
    }
  } catch { /* silent */ }
  return null;
}

async function wikiSearchThumbs(query, keyWords, maxResults = 3) {
  const out = [];
  try {
    const searchUrl =
      `https://en.wikipedia.org/w/api.php?action=query` +
      `&list=search&srsearch=${encodeURIComponent(query)}` +
      `&srlimit=${maxResults}&format=json&origin=*`;
    const sRes = await fetch(searchUrl);
    if (!sRes.ok) return out;
    const hits = (await sRes.json())?.query?.search ?? [];
    for (const hit of hits) {
      if (keyWords.length && !titleContainsAnyKey(hit.title, keyWords)) continue;
      const thumb = await wikiThumb(hit.title);
      if (thumb && !out.includes(thumb)) out.push(thumb);
      if (out.length >= maxResults) break;
    }
  } catch { /* silent */ }
  return out;
}

async function commonsThumbs(query, keyWords, limit = 20) {
  const out = [];
  try {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query` +
      `&generator=search&gsrnamespace=6` +
      `&gsrsearch=${encodeURIComponent(query)}` +
      `&gsrlimit=${limit}` +
      `&prop=imageinfo&iiprop=url|size&iiurlwidth=900` +
      `&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return out;
    const pages = (await res.json())?.query?.pages ?? {};
    const sorted = Object.values(pages).sort(
      (a, b) => (a.index ?? 999) - (b.index ?? 999)
    );
    for (const page of sorted) {
      const info = page?.imageinfo?.[0];
      const title = page.title || "";
      if (!info?.thumburl) continue;
      if (keyWords.length && !titleContainsAnyKey(title, keyWords)) continue;
      if (isBadImage(title, info.thumburl, info.width, info.height)) continue;
      if (!out.includes(info.thumburl)) out.push(info.thumburl);
      if (out.length >= 5) break;
    }
  } catch { /* silent */ }
  return out;
}

// ── Main fetch orchestrator ───────────────────────────────────────────────────

async function fetchPlaceImages(stopName, city) {
  const seen = new Set();
  const images = [];
  const add = (url) => { if (url && !seen.has(url)) { seen.add(url); images.push(url); } };

  const keyWords = keyWordsOf(stopName);
  const shortKey = shortName(stopName, 2);
  const shortKey1 = shortName(stopName, 1);

  // ── Strategy 1: Real web search via Tavily (backend) ─────────────────
  const backendImages = await fetchFromBackend(stopName, city);
  backendImages.forEach(add);

  // ── Strategy 2: Wikipedia direct lookup ──────────────────────────────
  if (images.length < MAX_IMAGES) {
    for (const title of [stopName, `${stopName}, ${city}`]) {
      if (images.length >= MAX_IMAGES) break;
      const thumb = await wikiThumb(title);
      if (thumb) add(thumb);
    }
  }

  // ── Strategy 3: Wikipedia search + short-name variants ───────────────
  if (images.length < MAX_IMAGES && keyWords.length) {
    const hits = await wikiSearchThumbs(`${stopName} ${city}`, keyWords, 3);
    hits.forEach(add);
  }

  if (images.length < 2 && shortKey && shortKey !== stopName) {
    const shortKW = keyWordsOf(shortKey);
    const t1 = await wikiThumb(shortKey);
    if (t1) add(t1);
    if (images.length < MAX_IMAGES) {
      const t2 = await wikiThumb(`${shortKey}, ${city}`);
      if (t2) add(t2);
    }
    if (images.length < MAX_IMAGES && shortKW.length) {
      const hits = await wikiSearchThumbs(`${shortKey} ${city}`, shortKW, 2);
      hits.forEach(add);
    }
    if (images.length < 1 && shortKey1 && shortKey1 !== shortKey) {
      const t = await wikiThumb(shortKey1);
      if (t) add(t);
    }
  }

  // ── Strategy 4: Wikimedia Commons ────────────────────────────────────
  if (images.length < MAX_IMAGES && keyWords.length) {
    const hits = await commonsThumbs(`${stopName} ${city}`, keyWords);
    hits.forEach(add);
  }

  // ── Strategy 5: City-level fallback ──────────────────────────────────
  if (images.length === 0 && city) {
    const cityThumb = await wikiThumb(city);
    if (cityThumb) add(cityThumb);
    if (images.length === 0) {
      const cityHits = await wikiSearchThumbs(city, keyWordsOf(city), 1);
      cityHits.forEach(add);
    }
  }

  return images;
}

// ── React component ───────────────────────────────────────────────────────────

export default function ImageSlideshow({ stopName, city, dayColor }) {
  const [images, setImages] = useState([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [showArrows, setShowArrows] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadImages() {
      setCurrent(0);
      setLoading(true);

      const cacheKey = `${stopName}|${city}`;

      if (imageCache.has(cacheKey)) {
        if (!cancelled) {
          setImages(imageCache.get(cacheKey));
          setLoading(false);
        }
        return;
      }

      const imgs = await fetchPlaceImages(stopName, city);

      imageCache.set(cacheKey, imgs);

      if (!cancelled) {
        setImages(imgs);
        setLoading(false);
      }
    }

    loadImages();

    return () => {
      cancelled = true;
    };
  }, [stopName, city]);

  // Remove a broken image from the list, and clamp current index if needed
  const handleImgError = useCallback((failedSrc) => {
    setImages((prev) => {
      const next = prev.filter((src) => src !== failedSrc);
      setCurrent((c) => Math.min(c, Math.max(0, next.length - 1)));
      return next;
    });
  }, []);

  const advance = useCallback(
    () => setCurrent((i) => (i + 1) % (images.length || 1)),
    [images.length]
  );

  useEffect(() => {
    if (images.length < 2 || paused) return;
    timerRef.current = setInterval(advance, AUTO_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [images.length, paused, advance]);

  const prev = () => setCurrent((i) => (i - 1 + images.length) % images.length);
  const next = () => setCurrent((i) => (i + 1) % images.length);

  if (loading) {
    return (
      <div className="img-slideshow img-slideshow--skeleton">
        <div className="img-slideshow__skeleton-bar" />
      </div>
    );
  }

  if (!images.length) {
    return (
      <div className="img-slideshow img-slideshow--placeholder" style={{ "--slide-color": dayColor }}>
        <span className="img-slideshow__placeholder-icon">📍</span>
        <span className="img-slideshow__placeholder-text">{stopName}</span>
      </div>
    );
  }

  return (
    <div
      className="img-slideshow"
      onMouseEnter={() => { setPaused(true); setShowArrows(true); }}
      onMouseLeave={() => { setPaused(false); setShowArrows(false); }}
    >
      {images.map((src, i) => (
        <img
          key={src}
          className={`img-slideshow__img${i === current ? " img-slideshow__img--active" : ""}`}
          src={src}
          alt={`${stopName} — photo ${i + 1}`}
          loading="lazy"
          draggable="false"
          onError={() => handleImgError(src)}
        />
      ))}

      <div className="img-slideshow__overlay">
        <span className="img-slideshow__label" style={{ background: dayColor }}>
          {stopName}
        </span>
      </div>

      {images.length > 1 && showArrows && (
        <>
          <button className="img-slideshow__arrow img-slideshow__arrow--prev" onClick={prev} aria-label="Previous">‹</button>
          <button className="img-slideshow__arrow img-slideshow__arrow--next" onClick={next} aria-label="Next">›</button>
        </>
      )}

      {images.length > 1 && (
        <div className="img-slideshow__dots">
          {images.map((_, i) => (
            <button
              key={i}
              className={`img-slideshow__dot${i === current ? " img-slideshow__dot--active" : ""}`}
              style={{ "--slide-color": dayColor }}
              onClick={() => setCurrent(i)}
              aria-label={`Photo ${i + 1}`}
            />
          ))}
        </div>
      )}

      {images.length > 1 && (
        <span className="img-slideshow__counter">{current + 1}/{images.length}</span>
      )}
    </div>
  );
}

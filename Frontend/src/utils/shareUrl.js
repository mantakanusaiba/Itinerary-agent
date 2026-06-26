/**
 * shareUrl.js
 *
 * Encodes and decodes itinerary result state into a URL hash so users can
 * share a fully-rendered itinerary with no backend needed.
 *
 * Approach:
 *   1. JSON-stringify the result object (itinerary + sources + tripParams)
 *   2. Compress with LZString.compressToEncodedURIComponent — shrinks large
 *      itineraries from ~10–30 KB down to ~2–5 KB, well within URL limits
 *   3. Write to window.location.hash so the path stays clean and the page
 *      doesn't reload
 *
 * On load, App.jsx calls tryLoadFromUrl() which reverses the process.
 *
 * Why hash not query param?
 *   - Hash changes don't trigger page reloads or server requests
 *   - No risk of the server 414-ing on long URLs
 *   - Itinerary data never leaves the browser
 */

import LZString from "lz-string";

const HASH_PREFIX = "itinerary=";

/**
 * Encode result + tripParams into the URL hash.
 * Silently does nothing if LZString compression fails.
 */
export function encodeToUrl(result, tripParams) {
  try {
    const payload = JSON.stringify({ result, tripParams });
    const compressed = LZString.compressToEncodedURIComponent(payload);
    window.location.hash = HASH_PREFIX + compressed;
  } catch (err) {
    console.warn("[shareUrl] Failed to encode to URL:", err);
  }
}

/**
 * Copy the current page URL (with hash) to clipboard.
 * Returns a promise that resolves to true on success, false on failure.
 */
export async function copyShareUrl() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    return true;
  } catch {
    // Fallback for browsers that block clipboard without user gesture
    try {
      const el = document.createElement("textarea");
      el.value = window.location.href;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Try to decode itinerary state from the current URL hash.
 * Returns { result, tripParams } or null if hash is absent / malformed.
 */
export function tryLoadFromUrl() {
  try {
    const hash = window.location.hash.slice(1); // remove leading #
    if (!hash.startsWith(HASH_PREFIX)) return null;

    const compressed = hash.slice(HASH_PREFIX.length);
    if (!compressed) return null;

    const decompressed = LZString.decompressFromEncodedURIComponent(compressed);
    if (!decompressed) return null;

    const parsed = JSON.parse(decompressed);
    if (!parsed?.result?.itinerary || !parsed?.tripParams) return null;

    return parsed;
  } catch (err) {
    console.warn("[shareUrl] Failed to decode from URL:", err);
    return null;
  }
}

/**
 * Clear the itinerary hash from the URL without reloading.
 */
export function clearUrlHash() {
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

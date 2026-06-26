/**
 * savedTrips.js
 *
 * localStorage-backed persistence for generated itineraries.
 *
 * Each saved trip is stored under a key "saved_trip:<id>" where id is a
 * timestamp. The index of all trip keys is stored separately under
 * "saved_trips_index" so we can list them without scanning all localStorage
 * keys (which would pick up unrelated entries from other apps on localhost).
 *
 * Schema of a saved trip entry:
 *   {
 *     id:         string,           // timestamp-based unique ID
 *     savedAt:    ISO string,        // human-readable date
 *     label:      string,            // "City · Vibe · N days"
 *     result:     object,            // full /api/itinerary result
 *     tripParams: object,            // { city, days, vibe }
 *   }
 */

const INDEX_KEY = "saved_trips_index";
const TRIP_PREFIX = "saved_trip:";
const MAX_SAVED = 20; // guard against unbounded localStorage growth

// ── Internal helpers ──────────────────────────────────────────────────────────

function readIndex() {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeIndex(ids) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

function tripKey(id) {
  return `${TRIP_PREFIX}${id}`;
}

function makeLabel({ city, days, vibe }) {
  return `${city} · ${vibe} · ${days} day${days !== 1 ? "s" : ""}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save a trip. Returns the new trip's id, or null on failure.
 */
export function saveTrip(result, tripParams) {
  try {
    const id = String(Date.now());
    const entry = {
      id,
      savedAt: new Date().toISOString(),
      label: makeLabel(tripParams),
      result,
      tripParams,
    };

    localStorage.setItem(tripKey(id), JSON.stringify(entry));

    // Prepend to index, drop oldest if over MAX_SAVED
    const index = readIndex();
    const newIndex = [id, ...index.filter((x) => x !== id)].slice(0, MAX_SAVED);

    // Evict trimmed entries from storage too
    const evicted = index.filter((x) => !newIndex.includes(x));
    evicted.forEach((eid) => localStorage.removeItem(tripKey(eid)));

    writeIndex(newIndex);
    return id;
  } catch (err) {
    console.warn("[savedTrips] save failed:", err);
    return null;
  }
}

/**
 * Load the full list of saved trips, newest first.
 * Entries that can't be parsed are silently skipped.
 */
export function loadSavedTrips() {
  const index = readIndex();
  const trips = [];
  for (const id of index) {
    try {
      const raw = localStorage.getItem(tripKey(id));
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed?.result && parsed?.tripParams) trips.push(parsed);
    } catch {
      // skip corrupt entries
    }
  }
  return trips;
}

/**
 * Delete a saved trip by id.
 */
export function deleteSavedTrip(id) {
  try {
    localStorage.removeItem(tripKey(id));
    writeIndex(readIndex().filter((x) => x !== id));
  } catch (err) {
    console.warn("[savedTrips] delete failed:", err);
  }
}

/**
 * Format a savedAt ISO string to a short human-readable date.
 * e.g. "Jun 25, 2026"
 */
export function formatSavedDate(isoString) {
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}
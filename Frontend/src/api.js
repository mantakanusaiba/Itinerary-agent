/**
 * API client for the Local Guide Agent backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function swapStop({ city, vibe, dayTheme, stopToReplace, otherStops, filteredSources }) {
  const response = await fetch(`${API_BASE}/api/itinerary/swap-stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      city,
      vibe,
      day_theme: dayTheme,
      stop_to_replace: stopToReplace,
      other_stops: otherStops,
      filtered_sources: filteredSources,
    }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || `Swap failed (${response.status})`);
  }

  return response.json();
}

/**
 * Streams the /api/itinerary endpoint.
 *
 * The browser's built-in EventSource only supports GET requests, and our
 * endpoint needs a POST body (city/days/vibe), so we parse the
 * "text/event-stream" response manually via fetch + ReadableStream instead
 * of using EventSource directly. Each parsed event is handed to onEvent.
 *
 * Event shapes (mirrors backend/app/main.py):
 *   {type: "progress", current_step: string}
 *   {type: "result", itinerary, filtered_sources, rejected_sources, ...}
 *   {type: "error", message: string}
 */
export async function streamItinerary({ city, days, vibe }, onEvent) {
  const response = await fetch(`${API_BASE}/api/itinerary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city, days, vibe }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Request failed (${response.status}): ${detail || response.statusText}`);
  }
  if (!response.body) {
    throw new Error("Streaming not supported by this response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line ("\n\n"). Process every
    // complete event currently in the buffer, keep any trailing partial
    // event for the next chunk.
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const dataLine = rawEvent
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (!dataLine) continue;

      try {
        const parsed = JSON.parse(dataLine.slice("data: ".length));
        onEvent(parsed);
      } catch (err) {
        console.error("Failed to parse SSE event:", dataLine, err);
      }
    }
  }
}

/**
 * Fetch 2-3 walkable alternatives to a stop via the backend.
 */
export async function fetchNearbyStops({ city, vibe, stop, allItineraryStops, filteredSources }) {
  const response = await fetch(`${API_BASE}/api/itinerary/nearby-stops`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      city,
      vibe,
      stop,
      all_itinerary_stops: allItineraryStops,
      filtered_sources: filteredSources,
    }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || `Nearby stops failed (${response.status})`);
  }

  const data = await response.json();
  return data.suggestions || [];
}
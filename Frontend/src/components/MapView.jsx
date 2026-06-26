import { useEffect, useRef, useState } from "react";

const DAY_COLORS = ["#c98a2b", "#4f6f52", "#b3492f", "#3a5a78", "#7a5418", "#6b4f8a"];

// ─── Transport modes ──────────────────────────────────────────────────────────
const MODES = [
  { id: "foot", label: "Walk", emoji: "🚶", osrm: "foot", verb: "walk" },
  { id: "bike", label: "Cycle", emoji: "🚲", osrm: "bike", verb: "cycle" },
  { id: "car", label: "Drive", emoji: "🚗", osrm: "car", verb: "drive" },
];

// ─── OSRM route fetch ─────────────────────────────────────────────────────────
async function fetchOSRMRoute(points, osrmProfile) {
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(";");
  const url =
    `https://router.project-osrm.org/route/v1/${osrmProfile}/${coords}` +
    `?overview=full&geometries=geojson&steps=false&annotations=false`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;
    const route = data.routes[0];
    return {
      geometry: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
      legs: route.legs.map((leg) => ({
        distance: leg.distance,
        duration: leg.duration,
      })),
    };
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function fmtDuration(seconds, verb) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min ${verb}`;
  const h = Math.floor(mins / 60), rm = mins % 60;
  return rm ? `${h}h ${rm}min ${verb}` : `${h}h ${verb}`;
}
function googleMapsUrl(stop) {
  return stop.latitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.name)}`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function createNumberedIcon(L, number, color) {
  return L.divIcon({
    className: "",
    html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};color:#fff;
        display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;
        border:2.5px solid rgba(255,255,255,0.9);box-shadow:0 2px 6px rgba(0,0,0,0.35);
        font-family:system-ui,sans-serif;">${number}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
}

function createApproximateIcon(L) {
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:50%;background:#aaa;color:#fff;
        display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;
        border:2px dashed #fff;box-shadow:0 1px 4px rgba(0,0,0,0.18);
        font-family:system-ui,sans-serif;opacity:0.7;">?</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -15],
  });
}

function createBadgeIcon(L, text) {
  return L.divIcon({
    className: "",
    html: `<div style="background:rgba(30,30,30,0.82);color:#fff;padding:3px 7px;
        border-radius:10px;font-size:11px;white-space:nowrap;font-family:system-ui,sans-serif;
        box-shadow:0 1px 4px rgba(0,0,0,0.3);pointer-events:none;">${text}</div>`,
    iconSize: null,
    iconAnchor: [0, 0],
  });
}

// ─── Core map builder ─────────────────────────────────────────────────────────
function buildMap(container, L, itinerary, activeDayIndex, modeId, onRouteStatus, cancelRef) {
  // Collect ALL stops with coords for the active day
  const allPoints = [];
  itinerary.days.forEach((day, dayIndex) => {
    if (activeDayIndex != null && dayIndex !== activeDayIndex) return;
    day.stops.forEach((stop) => {
      if (stop.latitude != null && stop.longitude != null) {
        allPoints.push({ ...stop, dayIndex, dayNumber: day.day_number });
      }
    });
  });

  if (allPoints.length === 0) return null;

  const map = L.map(container, { scrollWheelZoom: false });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  // ── FIT BOUNDS — handle single-point case ────────────────────────────────
  // fitBounds on a single lat/lng produces a zero-area rectangle which Leaflet
  // "fixes" by zooming to maxZoom (street level). Instead use setView with a
  // sane city-level zoom when there's only one distinct location.
  const exactPoints = allPoints.filter((p) => !p.coords_approximate);
  const boundsPoints = exactPoints.length > 0 ? exactPoints : allPoints;

  if (boundsPoints.length === 1) {
    map.setView([boundsPoints[0].latitude, boundsPoints[0].longitude], 15);
  } else {
    // Check if all points are at the same coords (e.g. all approximate → city centre)
    const uniqueLats = new Set(boundsPoints.map((p) => p.latitude.toFixed(4)));
    const uniqueLngs = new Set(boundsPoints.map((p) => p.longitude.toFixed(4)));
    if (uniqueLats.size === 1 && uniqueLngs.size === 1) {
      map.setView([boundsPoints[0].latitude, boundsPoints[0].longitude], 13);
    } else {
      const bounds = L.latLngBounds(boundsPoints.map((p) => [p.latitude, p.longitude]));
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
    }
  }

  // Invalidate size after the browser has painted — fixes the grey-tile bug
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!cancelRef.cancelled) map.invalidateSize();
    });
  });

  // ── Group by day ──────────────────────────────────────────────────────────
  const byDay = {};
  allPoints.forEach((p) => {
    byDay[p.dayIndex] = byDay[p.dayIndex] || [];
    byDay[p.dayIndex].push(p);
  });

  // ── Draw markers for ALL stops (exact + approximate) ─────────────────────
  Object.entries(byDay).forEach(([dayIndex, dayPoints]) => {
    const color = DAY_COLORS[Number(dayIndex) % DAY_COLORS.length];
    // Number markers using only exact stops (approximates get "?")
    let exactStopNum = 0;
    dayPoints.forEach((p) => {
      const isApprox = !!p.coords_approximate;
      if (!isApprox) exactStopNum++;

      const icon = isApprox
        ? createApproximateIcon(L)
        : createNumberedIcon(L, exactStopNum, color);
      const gmUrl = googleMapsUrl(p);
      const popup = `
        <div style="font-family:system-ui,sans-serif;min-width:160px;">
          <strong style="font-size:14px;">${p.name}</strong><br/>
          <span style="color:#666;font-size:12px;">
            Day ${p.dayNumber} · ${p.time}
          </span>${isApprox ? `<br/><span style="color:#e07b00;font-size:11px;">📍 Approximate location</span>` : ""}<br/>
          <a href="${gmUrl}" target="_blank" rel="noreferrer" style="
            display:inline-block;margin-top:8px;padding:5px 10px;
            background:#4285F4;color:#fff;border-radius:5px;
            text-decoration:none;font-size:12px;font-weight:600;">
            📍 Open in Google Maps
          </a>
        </div>`;
      const marker = L.marker([p.latitude, p.longitude], { icon })
        .addTo(map)
        .bindPopup(popup);
      let clicked = false;
      marker.on("mouseover", () => marker.openPopup());
      marker.on("mouseout", () => { if (!clicked) marker.closePopup(); });
      marker.on("click", () => { clicked = true; marker.openPopup(); });
      marker.on("popupclose", () => { clicked = false; });
    });
  });

  // ── Draw routes between exact stops only ─────────────────────────────────
  const mode = MODES.find((m) => m.id === modeId) ?? MODES[0];
  onRouteStatus("loading");

  (async () => {
    let anySucceeded = false;
    for (const [dayIndex, dayPoints] of Object.entries(byDay)) {
      if (cancelRef.cancelled) break;
      const exactPts = dayPoints.filter((p) => !p.coords_approximate);
      if (exactPts.length < 2) continue;
      const color = DAY_COLORS[Number(dayIndex) % DAY_COLORS.length];
      const route = await fetchOSRMRoute(exactPts, mode.osrm);
      if (cancelRef.cancelled) break;
      if (route) {
        anySucceeded = true;
        L.polyline(route.geometry, { color, weight: 4, opacity: 0.75 }).addTo(map);
        route.legs.forEach((leg, i) => {
          const from = exactPts[i], to = exactPts[i + 1];
          const midLat = (from.latitude + to.latitude) / 2;
          const midLng = (from.longitude + to.longitude) / 2;
          const label = `${fmtDuration(leg.duration, mode.verb)} · ${fmtDistance(leg.distance)}`;
          L.marker([midLat, midLng], {
            icon: createBadgeIcon(L, label),
            interactive: false,
          }).addTo(map);
        });
      } else {
        L.polyline(exactPts.map((p) => [p.latitude, p.longitude]), {
          color, weight: 2, opacity: 0.5, dashArray: "5 7",
        }).addTo(map);
      }
    }
    if (!cancelRef.cancelled) onRouteStatus(anySucceeded ? "done" : "fallback");
  })();

  return map;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function MapView({ itinerary, activeDayIndex }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const cancelRef = useRef({ cancelled: false });
  const [routeStatus, setRouteStatus] = useState("idle");
  const [modeId, setModeId] = useState("foot");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let ro;

    function tryInit() {
      if (mapRef.current) {
        cancelRef.current.cancelled = true;
        mapRef.current.remove();
        mapRef.current = null;
        setRouteStatus("idle");
      }
      cancelRef.current = { cancelled: false };
      if (!window.L) return;
      if (container.offsetWidth === 0 || container.offsetHeight === 0) return;

      const map = buildMap(
        container, window.L, itinerary, activeDayIndex,
        modeId, setRouteStatus, cancelRef.current,
      );
      if (map) mapRef.current = map;
    }

    let leafletPoll;
    if (!window.L) {
      leafletPoll = setInterval(() => {
        if (window.L) { clearInterval(leafletPoll); tryInit(); }
      }, 50);
    }

    ro = new ResizeObserver(() => tryInit());
    ro.observe(container);
    tryInit();

    return () => {
      cancelRef.current.cancelled = true;
      clearInterval(leafletPoll);
      if (ro) ro.disconnect();
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [itinerary, activeDayIndex, modeId]);

  const hasAnyCoords = itinerary.days.some((d) =>
    d.stops.some((s) => s.latitude != null && s.longitude != null)
  );
  if (!hasAnyCoords) {
    return (
      <div className="map-view map-view--empty card">
        <p>No stops could be located on a map for this trip.</p>
      </div>
    );
  }

  const visibleDays =
    activeDayIndex != null
      ? [itinerary.days[activeDayIndex]].filter(Boolean)
      : itinerary.days;

  const currentMode = MODES.find((m) => m.id === modeId) ?? MODES[0];

  return (
    <div className="map-view card">
      {/* ── Transport mode toggle ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: "6px",
        padding: "8px 12px", borderBottom: "1px solid #eee", background: "#fafafa",
      }}>
        <span style={{ fontSize: "11px", color: "#888", fontWeight: 600, marginRight: 4 }}>
          Route by
        </span>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setModeId(m.id)}
            title={m.label}
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "4px 12px", borderRadius: "20px",
              border: modeId === m.id ? "1.5px solid #E8624A" : "1.5px solid #ddd",
              background: modeId === m.id ? "rgba(232,98,74,0.08)" : "#fff",
              color: modeId === m.id ? "#c94530" : "#666",
              fontWeight: modeId === m.id ? 700 : 500,
              fontSize: "12px", cursor: "pointer",
              transition: "all 0.15s ease", fontFamily: "system-ui, sans-serif",
            }}
          >
            <span style={{ fontSize: "14px" }}>{m.emoji}</span>
            {m.label}
          </button>
        ))}
        {routeStatus === "loading" && (
          <span style={{
            marginLeft: "auto", fontSize: "11px", color: "#aaa",
            display: "flex", alignItems: "center", gap: "5px",
          }}>
            <span style={{ animation: "spin 0.9s linear infinite", display: "inline-block" }}>↻</span>
            Fetching {currentMode.label.toLowerCase()} route…
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </span>
        )}
      </div>

      {/* ── Map canvas ── */}
      <div ref={containerRef} className="map-view__canvas" />

      {/* ── Legend ── */}
      <ul className="map-view__legend">
        {visibleDays.map((day) => {
          const i = itinerary.days.indexOf(day);
          return (
            <li key={day.day_number} className="map-view__legend-item">
              <span
                className="map-view__legend-swatch"
                style={{ background: DAY_COLORS[i % DAY_COLORS.length] }}
              />
              Day {day.day_number}
            </li>
          );
        })}
        <li style={{ marginLeft: "auto", fontSize: "11px", color: "#888" }}
          className="map-view__legend-item">
          {routeStatus === "done" && `${currentMode.emoji} Real ${currentMode.label.toLowerCase()} routes`}
          {routeStatus === "fallback" && "— Straight-line routes (routing unavailable)"}
        </li>
      </ul>
    </div>
  );
}

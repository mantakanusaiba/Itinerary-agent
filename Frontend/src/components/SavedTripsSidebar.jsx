import { useEffect, useState } from "react";
import { loadSavedTrips, deleteSavedTrip, formatSavedDate } from "../utils/savedTrips.js";
import "./SavedTripsSidebar.css";

/**
 * SavedTripsSidebar
 *
 * A slide-in panel on the left listing every previously generated itinerary
 * (stored in the browser's localStorage, so no backend is involved).
 *
 * Props:
 *   open                      - whether the panel is visible
 *   onClose()                 - close the panel
 *   version                   - bump this number to re-read storage after a save
 *   onLoad(result, params)    - load a saved trip into the page
 *   onNewTrip()               - start a fresh search
 */
export default function SavedTripsSidebar({ open, onClose, version, onLoad, onNewTrip }) {
  const [trips, setTrips] = useState([]);

  // Re-read storage when opened or after a save
  useEffect(() => {
    setTrips(loadSavedTrips());
  }, [open, version]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleDelete(id) {
    deleteSavedTrip(id);
    setTrips((prev) => prev.filter((t) => t.id !== id));
  }

  function handleClearAll() {
    if (!window.confirm("Delete all saved trips?")) return;
    trips.forEach((t) => deleteSavedTrip(t.id));
    setTrips([]);
  }

  return (
    <>
      <div
        className={`sidebar-backdrop${open ? " sidebar-backdrop--open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`sidebar${open ? " sidebar--open" : ""}`}
        aria-label="Saved trips"
      >
        <div className="sidebar__header">
          <div>
            <h2 className="sidebar__title">Saved trips</h2>
            <p className="sidebar__count">
              {trips.length} {trips.length === 1 ? "trip" : "trips"}
            </p>
          </div>
          <button type="button" className="sidebar__close" onClick={onClose}>
            Close
          </button>
        </div>

        <button
          type="button"
          className="btn-primary sidebar__new"
          onClick={() => {
            onNewTrip();
            onClose();
          }}
        >
          Start a new trip
        </button>

        <div className="sidebar__body">
          {trips.length === 0 ? (
            <p className="sidebar__empty">
              No saved trips yet. Every itinerary you generate is saved here
              automatically, so you can come back to it later.
            </p>
          ) : (
            <ul className="sidebar__list">
              {trips.map((trip) => (
                <li key={trip.id} className="sidebar__item">
                  <button
                    type="button"
                    className="sidebar__item-main"
                    onClick={() => {
                      onLoad(trip.result, trip.tripParams);
                      onClose();
                    }}
                  >
                    <span className="sidebar__item-city">{trip.tripParams.city}</span>
                    <span className="sidebar__item-meta">
                      {trip.tripParams.days} {Number(trip.tripParams.days) === 1 ? "day" : "days"}
                      {trip.tripParams.vibe ? `  ·  ${trip.tripParams.vibe}` : ""}
                    </span>
                    <span className="sidebar__item-date">{formatSavedDate(trip.savedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="sidebar__item-delete"
                    onClick={() => handleDelete(trip.id)}
                    aria-label={`Delete ${trip.tripParams.city} trip`}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {trips.length > 0 && (
          <button type="button" className="sidebar__clear" onClick={handleClearAll}>
            Clear all
          </button>
        )}
      </aside>
    </>
  );
}

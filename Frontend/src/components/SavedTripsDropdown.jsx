import { useState, useRef, useEffect } from "react";
import { loadSavedTrips, deleteSavedTrip, formatSavedDate } from "../utils/savedTrips.js";
import "./SavedTripsDropdown.css";

/**
 * SavedTripsDropdown
 *
 * Shows a "Saved trips (N)" button. When clicked, opens a dropdown listing
 * all saved itineraries. Each row has a "Load" and a "Delete" action.
 *
 * Props:
 *   onLoad(result, tripParams) — called when the user loads a saved trip
 */
export default function SavedTripsDropdown({ onLoad }) {
    const [open, setOpen] = useState(false);
    const [trips, setTrips] = useState([]);
    const dropdownRef = useRef(null);

    // Refresh the list every time the dropdown opens
    useEffect(() => {
        if (open) setTrips(loadSavedTrips());
    }, [open]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        function handleClick(e) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    function handleDelete(e, id) {
        e.stopPropagation();
        deleteSavedTrip(id);
        setTrips((prev) => prev.filter((t) => t.id !== id));
    }

    function handleLoad(trip) {
        onLoad(trip.result, trip.tripParams);
        setOpen(false);
    }

    // Re-read count from storage to always show the real number
    const savedCount = loadSavedTrips().length;

    if (savedCount === 0) return null;

    return (
        <div className="saved-trips" ref={dropdownRef}>
            <button
                className="saved-trips__trigger"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="saved-trips__icon">🗂</span>
                Saved trips
                <span className="saved-trips__badge">{savedCount}</span>
                <span className="saved-trips__chevron">{open ? "▲" : "▼"}</span>
            </button>

            {open && (
                <div className="saved-trips__dropdown" role="listbox">
                    {trips.length === 0 ? (
                        <p className="saved-trips__empty">No saved trips yet.</p>
                    ) : (
                        <ul className="saved-trips__list">
                            {trips.map((trip) => (
                                <li key={trip.id} className="saved-trips__item" role="option">
                                    <button
                                        className="saved-trips__load-btn"
                                        onClick={() => handleLoad(trip)}
                                        title={`Load: ${trip.label}`}
                                    >
                                        <span className="saved-trips__label">{trip.label}</span>
                                        <span className="saved-trips__date">
                                            {formatSavedDate(trip.savedAt)}
                                        </span>
                                    </button>
                                    <button
                                        className="saved-trips__delete-btn"
                                        onClick={(e) => handleDelete(e, trip.id)}
                                        title="Delete this saved trip"
                                        aria-label="Delete"
                                    >
                                        ✕
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
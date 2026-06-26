import { useState } from "react";
import { fetchNearbyStops } from "../api.js";
import "./NearbyStops.css";

/**
 * NearbyStops
 *
 * Shows a "What else is nearby?" button on each stop card.
 * When clicked, calls the backend and renders 2-3 walking-distance alternatives.
 *
 * Props:
 *   stop              — the current ItineraryStop object
 *   city              — trip city string
 *   vibe              — trip vibe string
 *   allItineraryStops — flat list of ALL stops in the itinerary (for deduplication)
 *   filteredSources   — original filtered sources from the trip
 *   dayColor          — CSS accent color for theming
 */
export default function NearbyStops({
    stop,
    city,
    vibe,
    allItineraryStops = [],
    filteredSources = [],
    dayColor,
}) {
    const [state, setState] = useState("idle"); // "idle" | "loading" | "done" | "error"
    const [suggestions, setSuggestions] = useState([]);
    const [error, setError] = useState("");
    const [open, setOpen] = useState(false);

    async function handleFetch() {
        if (state === "loading") return;

        // If we already fetched, just toggle visibility
        if (state === "done") {
            setOpen((v) => !v);
            return;
        }

        setState("loading");
        setError("");

        try {
            const results = await fetchNearbyStops({
                city,
                vibe,
                stop,
                allItineraryStops,
                filteredSources,
            });
            setSuggestions(results);
            setState("done");
            setOpen(true);
        } catch (err) {
            setError(err.message || "Couldn't load nearby suggestions.");
            setState("error");
        }
    }

    const isVisible = state === "done" && open;

    return (
        <div className="nearby-stops" style={{ "--nearby-color": dayColor }}>
            <button
                className={`nearby-stops__trigger ${state === "loading" ? "nearby-stops__trigger--loading" : ""}`}
                onClick={handleFetch}
                disabled={state === "loading"}
                title="Find walkable alternatives near this stop"
            >
                {state === "loading" ? (
                    <>
                        <span className="nearby-stops__spin">↻</span>
                        Finding nearby places…
                    </>
                ) : (
                    <>
                        <span className="nearby-stops__icon">📍</span>
                        {state === "done"
                            ? open
                                ? "Hide nearby places"
                                : `Show ${suggestions.length} nearby place${suggestions.length !== 1 ? "s" : ""}`
                            : "What else is nearby?"}
                    </>
                )}
            </button>

            {state === "error" && (
                <p className="nearby-stops__error">{error}</p>
            )}

            {isVisible && suggestions.length > 0 && (
                <ul className="nearby-stops__list">
                    {suggestions.map((s, i) => (
                        <li key={i} className="nearby-stops__item">
                            <div className="nearby-stops__item-header">
                                <span className="nearby-stops__item-name">{s.name}</span>
                                <span className="nearby-stops__item-walk">
                                    🚶 {s.walking_minutes} min
                                </span>
                            </div>
                            <span className="nearby-stops__item-category">{s.category}</span>
                            <p className="nearby-stops__item-why">{s.why_nearby}</p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
import { useEffect, useState } from "react";
import "./LoadingState.css";

const STAGES = [
  { key: "planning_complete", label: "Scouting research angles" },
  { key: "search_complete", label: "Searching the real web" },
  { key: "filtering_complete", label: "Filtering out listicle noise" },
  { key: "itinerary_complete", label: "Building your itinerary" },
  { key: "geocoding_complete", label: "Placing stops on the map" },
];
const NOTES = {
  planning_complete: "Identifying the best research angles for your trip.",
  search_complete: "Exploring trusted local sources and recommendations.",
  filtering_complete: "Removing tourist traps and low-quality suggestions.",
  itinerary_complete: "Crafting your personalized day-by-day itinerary.",
  geocoding_complete: "Adding locations and preparing your travel map.",
};

export default function LoadingState({ currentStep }) {
  const currentIndex = STAGES.findIndex((s) => s.key === currentStep);
  // active index is at least 0 so we always show the first label
  const activeIndex = currentIndex === -1 ? 0 : currentIndex;

  // Animate the progress bar fill via a small local counter
  const [displayPct, setDisplayPct] = useState(0);

  // Target percentage: each stage completion adds one segment
  // We give a little head-start so it never sits at 0%
  const targetPct =
    currentIndex === -1
      ? 4
      : Math.round(((currentIndex + 1) / STAGES.length) * 100);

  useEffect(() => {
    // Ease toward targetPct
    const id = setInterval(() => {
      setDisplayPct((prev) => {
        if (prev >= targetPct) return prev;
        return Math.min(prev + 1, targetPct);
      });
    }, 18);
    return () => clearInterval(id);
  }, [targetPct]);

  const activeLabel = STAGES[activeIndex]?.label ?? "Getting started…";
  const activeNote =
    NOTES[currentStep] ||
    "Our AI is researching and building your personalized itinerary.";

  return (
    <div className="loading-state card">
      <div className="trip-form__eyebrow">Working on it</div>

      <p className="loading-state__current-label">{activeLabel}</p>

      <div className="loading-state__bar-track" role="progressbar"
        aria-valuenow={displayPct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="loading-state__bar-fill"
          style={{ width: `${displayPct}%` }}
        />
      </div>

      <div className="loading-state__step-row">
        {STAGES.map((stage, i) => {
          const status =
            i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          return (
            <div
              key={stage.key}
              className={`loading-state__dot loading-state__dot--${status}`}
              title={stage.label}
            />
          );
        })}
      </div>

      <p className="loading-state__note">
        {activeNote}
      </p>
    </div>
  );
}

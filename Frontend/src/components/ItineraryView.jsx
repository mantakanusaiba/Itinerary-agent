import { useState } from "react";
import "./ItineraryView.css";
import MapView from "./MapView.jsx";
import ExportToolbar from "./ExportToolbar.jsx";
import StopChat from "./StopChat.jsx";
import ImageSlideshow from "./ImageSlideshow.jsx";
import NearbyStops from "./NearbyStops.jsx";

const DAY_COLORS = ["#c98a2b", "#4f6f52", "#b3492f", "#3a5a78", "#7a5418", "#6b4f8a"];

// ── StopCard ──────────────────────────────────────────────────────────────────

function StopCard({
  stop,
  dayIndex,
  stopIndex,
  onSwap,
  isSwapping,
  dayColor,
  city,
  vibe,
  filteredSources,
  allItineraryStops,
}) {
  return (
    <li className="stop-card" style={{ "--day-color": dayColor }}>
      {/* Inline auto-playing image slideshow */}
      <ImageSlideshow
        stopName={stop.name}
        city={city}
        dayColor={dayColor}
      />

      <div className="stop-card__inner">
        <div className="stop-card__top-row">
          <h3 className="stop-card__name">{stop.name}</h3>
          <div className="stop-card__meta">
            <span className="stop-card__time-badge">{stop.time}</span>
            <span className="stop-card__duration">{stop.duration_minutes} min</span>
            <button
              type="button"
              className="stop-card__swap-icon"
              onClick={() => onSwap(dayIndex, stopIndex)}
              disabled={isSwapping}
              title={isSwapping ? "Finding an alternative…" : "Swap this stop"}
              aria-label={isSwapping ? "Finding an alternative…" : "Swap this stop"}
            >
              {isSwapping ? <span className="stop-card__swap-spin">↺</span> : "↺"}
            </button>
          </div>
        </div>

        <p className="stop-card__description">{stop.description}</p>

        <blockquote className="stop-card__why-quote">
          <span className="stop-card__why-label">Why locals love it</span>
          <p>{stop.why_not_touristy}</p>
          {stop.source_reference && (
            <a
              className="stop-card__source"
              href={stop.source_reference}
              target="_blank"
              rel="noreferrer"
            >
              source ↗
            </a>
          )}
        </blockquote>

        {/* ── Bottom actions: Nearby + Chat ── */}
        <div className="stop-card__actions">
          {/* ── What else is nearby? ── */}
          <NearbyStops
            stop={stop}
            city={city}
            vibe={vibe}
            allItineraryStops={allItineraryStops}
            filteredSources={filteredSources}
            dayColor={dayColor}
          />

          {/* ── Ask about this stop ── */}
          <StopChat
            stop={stop}
            city={city}
            vibe={vibe}
            filteredSources={filteredSources}
            dayColor={dayColor}
          />
        </div>
      </div>
    </li>
  );
}

// ── ItineraryView ─────────────────────────────────────────────────────────────

export default function ItineraryView({
  itinerary,
  city,
  vibe,
  filteredSources,
  onSwapStop,
  swappingKey,
  swapError,
  result,
  tripParams,
}) {
  const [activeTab, setActiveTab] = useState(0);

  if (!itinerary?.days?.length) return null;

  const activeDay = itinerary.days[activeTab];
  const activeDayColor = DAY_COLORS[activeTab % DAY_COLORS.length];

  return (
    <div className="itinerary-view">
      <ExportToolbar
        itinerary={itinerary}
        city={city}
        result={result}
        tripParams={tripParams}
      />

      {/* Day tab navigation */}
      <div className="day-tabs" role="tablist" aria-label="Select day">
        {itinerary.days.map((day, i) => (
          <button
            key={day.day_number}
            role="tab"
            aria-selected={i === activeTab}
            className={`day-tabs__tab${i === activeTab ? " day-tabs__tab--active" : ""}`}
            style={{ "--tab-color": DAY_COLORS[i % DAY_COLORS.length] }}
            onClick={() => setActiveTab(i)}
          >
            <span className="day-tabs__label">Day {day.day_number}</span>
            <span className="day-tabs__theme">{day.theme}</span>
          </button>
        ))}
      </div>

      <MapView itinerary={itinerary} activeDayIndex={activeTab} />

      {swapError && <p className="swap-error">{swapError}</p>}

      <section key={activeDay.day_number} className="day-block card">
        <header className="day-block__header" style={{ "--day-color": activeDayColor }}>
          <span className="day-block__number">Day {activeDay.day_number}</span>
          <h2 className="day-block__theme">{activeDay.theme}</h2>
        </header>
        <ol className="day-block__stops">
          {activeDay.stops.map((stop, stopIndex) => (
            <StopCard
              key={`${activeDay.day_number}-${stopIndex}-${stop.name}`}
              stop={stop}
              dayIndex={activeTab}
              stopIndex={stopIndex}
              onSwap={onSwapStop}
              isSwapping={swappingKey === `${activeTab}-${stopIndex}`}
              dayColor={activeDayColor}
              city={city}
              vibe={vibe}
              filteredSources={filteredSources}
              allItineraryStops={activeDay.stops}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}

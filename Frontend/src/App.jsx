import { useState, useEffect } from "react";
import TripForm from "./components/TripForm.jsx";
import LoadingState from "./components/LoadingState.jsx";
import ItineraryView from "./components/ItineraryView.jsx";
import SourcesPanel from "./components/SourcesPanel.jsx";
import WeatherWidget from "./components/WeatherWidget.jsx";
import SavedTripsDropdown from "./components/SavedTripsDropdown.jsx";
import { streamItinerary, swapStop } from "./api.js";
import { tryLoadFromUrl, clearUrlHash, encodeToUrl } from "./utils/shareUrl.js";
import { saveTrip } from "./utils/savedTrips.js";
import "./components/responsive.css";

export default function App() {
  // "idle" | "loading" | "done" | "error"
  const [status, setStatus] = useState("idle");
  const [currentStep, setCurrentStep] = useState("");
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [tripParams, setTripParams] = useState(null);

  const [formCollapsed, setFormCollapsed] = useState(null);
  const [swappingKey, setSwappingKey] = useState(null);
  const [swapError, setSwapError] = useState("");

  // Toast state for "Trip saved!" confirmation
  const [saveToast, setSaveToast] = useState(false);

  // Force SavedTripsDropdown to re-render its badge after a save
  const [savedTripsVersion, setSavedTripsVersion] = useState(0);

  // ── Load shared itinerary from URL hash on first mount ──────────────────────
  useEffect(() => {
    const shared = tryLoadFromUrl();
    if (shared) {
      setResult(shared.result);
      setTripParams(shared.tripParams);
      setStatus("done");
      setFormCollapsed(true);
    }
  }, []);

  // ── Re-encode URL whenever result changes (keeps link fresh after swap) ──────
  useEffect(() => {
    if (result && tripParams) {
      encodeToUrl(result, tripParams);
    }
  }, [result, tripParams]);

  async function handleSubmit(formData) {
    setStatus("loading");
    setCurrentStep("");
    setResult(null);
    setErrorMessage("");
    setSwapError("");
    setTripParams(formData);
    setFormCollapsed(null);
    clearUrlHash();

    try {
      await streamItinerary(formData, (event) => {
        if (event.type === "progress") {
          setCurrentStep(event.current_step);
        } else if (event.type === "result") {
          setResult(event);
          setStatus("done");
          setFormCollapsed(true);
          // Auto-save every newly generated itinerary
          saveTrip(event, formData);
          setSavedTripsVersion((v) => v + 1);
        } else if (event.type === "error") {
          setErrorMessage(event.message);
          setStatus("error");
        }
      });
    } catch (err) {
      setErrorMessage(err.message || "Something went wrong reaching the backend.");
      setStatus("error");
    }
  }

  async function handleSwapStop(dayIndex, stopIndex) {
    if (!result || !tripParams) return;
    const key = `${dayIndex}-${stopIndex}`;
    setSwappingKey(key);
    setSwapError("");

    const day = result.itinerary.days[dayIndex];
    const stopToReplace = day.stops[stopIndex];
    const otherStops = day.stops.filter((_, i) => i !== stopIndex);

    try {
      const newStop = await swapStop({
        city: tripParams.city,
        vibe: tripParams.vibe,
        dayTheme: day.theme,
        stopToReplace,
        otherStops,
        filteredSources: result.filtered_sources,
      });

      setResult((prev) => {
        const newDays = prev.itinerary.days.map((d, di) => {
          if (di !== dayIndex) return d;
          const newStops = d.stops.map((s, si) => (si === stopIndex ? newStop : s));
          return { ...d, stops: newStops };
        });
        return { ...prev, itinerary: { ...prev.itinerary, days: newDays } };
      });
    } catch (err) {
      setSwapError(err.message || "Couldn't find an alternative for that stop.");
    } finally {
      setSwappingKey(null);
    }
  }

  // Load a trip from the saved-trips dropdown
  function handleLoadSavedTrip(savedResult, savedTripParams) {
    setResult(savedResult);
    setTripParams(savedTripParams);
    setStatus("done");
    setFormCollapsed(true);
    setSwapError("");
    setErrorMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Manual "Save trip" button in the results header
  function handleManualSave() {
    if (!result || !tripParams) return;
    saveTrip(result, tripParams);
    setSavedTripsVersion((v) => v + 1);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  }

  function handleReset() {
    setStatus("idle");
    setResult(null);
    setErrorMessage("");
    setSwapError("");
    setFormCollapsed(null);
    setTripParams(null);
    clearUrlHash();
  }

  function handleEditTrip() {
    setFormCollapsed((prev) => !prev);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__top-bar">
            <SavedTripsDropdown
              key={savedTripsVersion}
              onLoad={handleLoadSavedTrip}
            />
          </div>
          <h1 className="app-header__title">Travel like a local</h1>
          <h6 className="app-header__subtitle">
            AI-powered travel planning for authentic local experiences.
          </h6>
        </div>
      </header>

      {status === "done" && result && (
        <div className="sticky-form-wrapper">
          <TripForm
            onSubmit={handleSubmit}
            disabled={status === "loading"}
            collapsed={formCollapsed}
            tripParams={tripParams}
            onEdit={handleEditTrip}
          />
        </div>
      )}

      <main className="app-main">
        {status === "idle" && (
          <TripForm onSubmit={handleSubmit} disabled={false} />
        )}

        {status === "loading" && <LoadingState currentStep={currentStep} />}

        {status === "error" && (
          <div className="card error-card">
            <h2>That run hit an error</h2>
            <p>{errorMessage}</p>
            <button type="button" className="btn-secondary" onClick={handleReset}>
              Try again
            </button>
          </div>
        )}

        {status === "done" && result && (
          <div className="results">
            <div className="results__header">
              <button type="button" className="btn-secondary" onClick={handleReset}>
                ← Plan another trip
              </button>
              <div className="results__header-actions">
                <button
                  type="button"
                  className={`btn-save${saveToast ? " btn-save--saved" : ""}`}
                  onClick={handleManualSave}
                  title="Save this trip to your browser"
                >
                  {saveToast ? "✓ Saved!" : "⊕ Save trip"}
                </button>
              </div>
            </div>
            <WeatherWidget city={tripParams?.city} />
            <ItineraryView
              itinerary={result.itinerary}
              city={tripParams?.city}
              vibe={tripParams?.vibe}
              budgetTier={tripParams?.budgetTier}
              filteredSources={result.filtered_sources}
              onSwapStop={handleSwapStop}
              swappingKey={swappingKey}
              swapError={swapError}
              result={result}
              tripParams={tripParams}
            />
            <SourcesPanel
              researchAngles={result.research_angles}
              filteredSources={result.filtered_sources}
              rejectedSources={result.rejected_sources}
              errors={result.errors}
            />
          </div>
        )}
      </main>
    </div>
  );
}

import { useState, useEffect } from "react";
import "./TripForm.css";

const VIBE_PRESETS = [
  { label: "Foodie" },
  { label: "History" },
  { label: "Nature" },
  { label: "Culture" },
  { label: "Luxury" },
];

const DAY_OPTIONS = [
  { value: 2, label: "1-2 Days" },
  { value: 3, label: "3-4 Days" },
  { value: 5, label: "5-6 Days" },
  { value: 7, label: "7+ Days" },
];
const BUDGET_TIERS = [
  { value: "budget", label: "Budget", sublabel: "Street food & hostels" },
  { value: "mid", label: "Mid-range", sublabel: "Hotels & restaurants" },
  { value: "splurge", label: "Splurge", sublabel: "Luxury & fine dining" },
];

export default function TripForm({ onSubmit, disabled, collapsed, tripParams, onEdit, prefillCity }) {
  const [city, setCity] = useState(tripParams?.city || "");
  const [days, setDays] = useState(tripParams?.days || 4);
  const [vibe, setVibe] = useState(tripParams?.vibe || "");
  const [activeVibes, setActiveVibes] = useState([]);
  const [budgetTier, setBudgetTier] = useState(tripParams?.budgetTier || "mid");

  // When the form switches from collapsed → expanded (edit mode),
  // sync all fields back from the current tripParams so the user
  // sees their existing values rather than a blank form.
  useEffect(() => {
    if (collapsed === false && tripParams) {
      setCity(tripParams.city || "");
      setDays(tripParams.days || 4);
      setVibe(tripParams.vibe || "");
      setBudgetTier(tripParams.budgetTier || "mid");

      // Restore activeVibes from the comma-separated vibe string
      if (tripParams.vibe) {
        const vibeLabels = VIBE_PRESETS.map((v) => v.label);
        const restored = tripParams.vibe
          .split(",")
          .map((s) => s.trim())
          .filter((s) => vibeLabels.includes(s));
        setActiveVibes(restored);
      } else {
        setActiveVibes([]);
      }
    }
  }, [collapsed]);

  // Destination picked from the landing showcase
  useEffect(() => {
    if (prefillCity) setCity(prefillCity);
  }, [prefillCity]);

  function toggleVibe(label) {
    setActiveVibes((prev) => {
      const next = prev.includes(label) ? prev.filter((v) => v !== label) : [...prev, label];
      const combined = next.join(", ");
      setVibe(combined);
      return next;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!city.trim()) return;

    const finalVibe = vibe.trim() || "local experience";
    onSubmit({ city: city.trim(), days, vibe: finalVibe, budgetTier });
  }

  // ── Compact sticky bar ──────────────────────────────────────────────
  if (collapsed && tripParams) {
    const tier = BUDGET_TIERS.find((t) => t.value === tripParams.budgetTier) || BUDGET_TIERS[1];
    return (
      <div className="trip-bar">
        <div className="trip-bar__inner">
          <div className="trip-bar__summary">
            <span className="trip-bar__city">{tripParams.city}</span>
            <span className="trip-bar__dot">·</span>
            <span className="trip-bar__detail">
              {tripParams.days} day{tripParams.days !== 1 ? "s" : ""}
            </span>
            <span className="trip-bar__dot">·</span>
            <span className="trip-bar__detail trip-bar__detail--vibe">{tripParams.vibe}</span>
            <span className="trip-bar__dot">·</span>
            <span className="trip-bar__detail trip-bar__detail--budget">{tier.label}</span>
          </div>
          <button type="button" className="trip-bar__edit" onClick={onEdit}>
            Edit trip
          </button>
        </div>
      </div>
    );
  }

  // ── Full form (idle or edit mode) ───────────────────────────────────
  const isEditing = collapsed === false;

  return (
    <form
      className={`trip-form card${isEditing ? " trip-form--editing" : ""}`}
      onSubmit={handleSubmit}
    >
      <label className="field">
        <span className="field__label">Destination</span>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="e.g. Dhaka, Sylhet, Cox's Bazar"
          disabled={disabled}
          required
        />
      </label>

      <div className="field">
        <span className="field__label">Trip length</span>
        <div className="days-picker">
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`days-btn${days === opt.value ? " days-btn--active" : ""}`}
              onClick={() => setDays(opt.value)}
              disabled={disabled}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Travel style</span>
        <div className="vibe-chips">
          {VIBE_PRESETS.map((v) => (
            <button
              key={v.label}
              type="button"
              className={`vibe-chip${activeVibes.includes(v.label) ? " vibe-chip--active" : ""}`}
              onClick={() => toggleVibe(v.label)}
              disabled={disabled}
            >
              {v.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={vibe}
          onChange={(e) => setVibe(e.target.value)}
          placeholder="Or describe your own style"
          disabled={disabled}
          className="field__extra"
        />
      </div>

      <div className="field">
        <span className="field__label">Budget</span>
        <div className="budget-picker">
          {BUDGET_TIERS.map((tier) => (
            <button
              key={tier.value}
              type="button"
              className={`budget-btn${budgetTier === tier.value ? " budget-btn--active" : ""}`}
              onClick={() => setBudgetTier(tier.value)}
              disabled={disabled}
            >
              <span className="budget-btn__label">{tier.label}</span>
              <span className="budget-btn__sublabel">{tier.sublabel}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="trip-form__actions">
        <button
          type="submit"
          className="btn-primary"
          disabled={disabled || !city.trim()}
        >
          {disabled
            ? "Generating itinerary…"
            : "Generate itinerary"}
        </button>
        {isEditing && (
          <button type="button" className="btn-cancel" onClick={onEdit}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
import { useState, useEffect } from "react";
import "./TripForm.css";

const VIBE_PRESETS = [
  { emoji: "🍜", label: "Foodie" },
  { emoji: "🏛️", label: "History" },
  { emoji: "🌿", label: "Nature" },
  { emoji: "🎨", label: "Culture" },
  { emoji: "✨", label: "Luxury" },
];

const DAY_OPTIONS = [
  { value: 2, label: "1-2 Days" },
  { value: 3, label: "3-4 Days" },
  { value: 5, label: "5-6 Days" },
  { value: 7, label: "7+ Days" },
];
const BUDGET_TIERS = [
  { value: "budget", emoji: "🎒", label: "Budget", sublabel: "Street food & hostels" },
  { value: "mid", emoji: "🏨", label: "Mid-range", sublabel: "Hotels & restaurants" },
  { value: "splurge", emoji: "✨", label: "Splurge", sublabel: "Luxury & fine dining" },
];

export default function TripForm({ onSubmit, disabled, collapsed, tripParams, onEdit }) {
  const [city, setCity] = useState(tripParams?.city || "");
  const [days, setDays] = useState(tripParams?.days || 4);
  const [vibe, setVibe] = useState(tripParams?.vibe || "");
  const [activeVibes, setActiveVibes] = useState([]);
  const [budgetTier, setBudgetTier] = useState(tripParams?.budgetTier || "mid");
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

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

    setIsLoading(true);

    setTimeout(() => {
      const finalVibe = vibe.trim() || "local experience";
      onSubmit({ city: city.trim(), days, vibe: finalVibe, budgetTier });
      setIsLoading(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1500);
  }

  // Add ripple effect to buttons
  useEffect(() => {
    const addRippleEffect = (e) => {
      const button = e.currentTarget;
      const ripple = document.createElement("span");
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.width = ripple.style.height = size + "px";
      ripple.style.left = x + "px";
      ripple.style.top = y + "px";
      ripple.classList.add("ripple");

      button.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    };

    const buttons = document.querySelectorAll(".btn-primary, .days-btn, .vibe-chip");
    buttons.forEach((btn) => btn.addEventListener("click", addRippleEffect));
    return () => buttons.forEach((btn) => btn.removeEventListener("click", addRippleEffect));
  }, [collapsed]); // re-attach when form expands

  // ── Compact sticky bar ──────────────────────────────────────────────
  if (collapsed && tripParams) {
    const tier = BUDGET_TIERS.find((t) => t.value === tripParams.budgetTier) || BUDGET_TIERS[1];
    return (
      <div className="trip-bar">
        <div className="trip-bar__inner">
          <div className="trip-bar__summary">
            <span className="trip-bar__city">📍 {tripParams.city}</span>
            <span className="trip-bar__dot">·</span>
            <span className="trip-bar__detail">
              {tripParams.days} day{tripParams.days !== 1 ? "s" : ""}
            </span>
            <span className="trip-bar__dot">·</span>
            <span className="trip-bar__detail trip-bar__detail--vibe">{tripParams.vibe}</span>
            <span className="trip-bar__dot">·</span>
            <span className="trip-bar__detail trip-bar__detail--budget">{tier.emoji} {tier.label}</span>
          </div>
          <button type="button" className="trip-bar__edit" onClick={onEdit}>
            ✏️ Edit Trip
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
      {/* Loading overlay */}
      <div className={`trip-form__loading ${isLoading ? "active" : ""}`}>
        <div className="loading-spinner"></div>
      </div>

      {/* Success animation */}
      {showSuccess && (
        <div className="success-checkmark show">
          <svg className="checkmark-circle" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="25" fill="none" />
          </svg>
          <svg className="checkmark-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
            <path fill="none" stroke="#2DB9A0" strokeWidth="3" d="M14 27 L22 35 L38 19" />
          </svg>
        </div>
      )}

      <label className="field">
        <span className="field__label">🌍 Destination</span>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="e.g. Dhaka, Sylhet, Cox's Bazar…"
          disabled={disabled}
          required
        />
      </label>

      <div className="field">
        <span className="field__label">📅 Trip Length</span>
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
        <span className="field__label">✨ Your Vibe</span>
        <div className="vibe-chips">
          {VIBE_PRESETS.map((v) => (
            <button
              key={v.label}
              type="button"
              className={`vibe-chip${activeVibes.includes(v.label) ? " vibe-chip--active" : ""}`}
              onClick={() => toggleVibe(v.label)}
              disabled={disabled}
            >
              {v.emoji} {v.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={vibe}
          onChange={(e) => setVibe(e.target.value)}
          placeholder="or describe your vibe…"
          disabled={disabled}
          style={{ marginTop: "0.7rem" }}
        />
      </div>

      <div className="field">
        <span className="field__label">💰 Budget Tier</span>
        <div className="budget-picker">
          {BUDGET_TIERS.map((tier) => (
            <button
              key={tier.value}
              type="button"
              className={`budget-btn${budgetTier === tier.value ? " budget-btn--active" : ""}`}
              onClick={() => setBudgetTier(tier.value)}
              disabled={disabled}
            >
              <span className="budget-btn__emoji">{tier.emoji}</span>
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
          disabled={disabled || !city.trim() || isLoading}
        >
          <span className="btn-icon">🗺️</span>
          {disabled
            ? "Researching like a local…"
            : isLoading
              ? "Planning..."
              : "Plan My Local Itinerary"}
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
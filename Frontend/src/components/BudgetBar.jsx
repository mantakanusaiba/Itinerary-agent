import "./BudgetBar.css";

const TIER_CONFIG = {
    budget: {
        label: "Budget",
        emoji: "🎒",
        color: "#2DB9A0",
        description: "Hostels, street food, public transport",
    },
    mid: {
        label: "Mid-range",
        emoji: "🏨",
        color: "#F5A623",
        description: "3-star hotels, sit-down restaurants",
    },
    splurge: {
        label: "Splurge",
        emoji: "✨",
        color: "#c98a2b",
        description: "Boutique hotels, fine dining, taxis",
    },
};

/**
 * Renders a horizontal running-total bar for estimated daily costs.
 * Costs per stop come from the `estimated_cost` field added by the AI.
 */
export default function BudgetBar({ stops, budgetTier }) {
    if (!budgetTier || !stops?.length) return null;

    const config = TIER_CONFIG[budgetTier];
    if (!config) return null;

    // Sum up estimated costs that are present
    const stopsWithCosts = stops.filter((s) => s.estimated_cost != null);
    if (stopsWithCosts.length === 0) return null;

    const total = stopsWithCosts.reduce((sum, s) => sum + (s.estimated_cost || 0), 0);
    const currency = stopsWithCosts[0]?.cost_currency || "USD";

    return (
        <div className="budget-bar" style={{ "--budget-color": config.color }}>
            <div className="budget-bar__header">
                <span className="budget-bar__tier">
                    {config.emoji} {config.label} tier
                </span>
                <span className="budget-bar__total">
                    Est. day total:{" "}
                    <strong>
                        {currency} {total.toLocaleString()}
                    </strong>
                </span>
            </div>
            <div className="budget-bar__stops">
                {stops.map((stop, i) =>
                    stop.estimated_cost != null ? (
                        <div key={i} className="budget-stop">
                            <span className="budget-stop__name">{stop.name}</span>
                            <span className="budget-stop__cost">
                                {currency} {stop.estimated_cost.toLocaleString()}
                            </span>
                            {stop.cost_note && (
                                <span className="budget-stop__note">{stop.cost_note}</span>
                            )}
                        </div>
                    ) : null
                )}
            </div>
        </div>
    );
}
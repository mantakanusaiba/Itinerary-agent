import { useState } from "react";
import { downloadICS } from "../utils/ics.js";
import "./ExportToolbar.css";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function ExportToolbar({ itinerary, city }) {
  const [startDate, setStartDate] = useState(todayISO());

  return (
    <div className="export-toolbar card">
      <div className="export-toolbar__group">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => window.print()}
        >
          Export PDF
        </button>
      </div>

      <div className="export-toolbar__group">
        <label className="export-toolbar__date-label">
          Trip starts
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => downloadICS(itinerary, city, startDate)}
        >
          Add to calendar
        </button>
      </div>
    </div>
  );
}
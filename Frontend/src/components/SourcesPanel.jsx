import { useState } from "react";
import "./SourcesPanel.css";

function SourceRow({ source, verdict }) {
  const isKeep = verdict === "keep";
  return (
    <li className="source-row">
      <span className={`stamp ${isKeep ? "stamp--keep" : "stamp--reject"}`}>
        {isKeep ? "Kept" : "Rejected"}
      </span>
      <div className="source-row__body">
        <a
          className="source-row__title"
          href={source.url}
          target="_blank"
          rel="noreferrer"
        >
          {source.title || source.url}
        </a>
        <p className="source-row__reason">
          {isKeep ? source.reason_kept : source.reason_rejected}
        </p>
      </div>
    </li>
  );
}

export default function SourcesPanel({ researchAngles, filteredSources, rejectedSources, errors }) {
  const [open, setOpen] = useState(false);
  const total = (filteredSources?.length || 0) + (rejectedSources?.length || 0);
  const rejectRate = total > 0 ? Math.round((rejectedSources.length / total) * 100) : 0;

  return (
    <section className="sources-panel card">
      <button
        type="button"
        className="sources-panel__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>
          Sources &amp; filtering — {filteredSources?.length || 0} kept,{" "}
          {rejectedSources?.length || 0} rejected ({rejectRate}% filtered out)
        </span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="sources-panel__body">
          {errors?.length > 0 && (
            <div className="sources-panel__section">
              <h3 className="sources-panel__heading">Warnings during this run</h3>
              <ul className="warning-list">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="sources-panel__section">
            <h3 className="sources-panel__heading">Evidence log</h3>
            <ul className="source-list">
              {filteredSources?.map((s, i) => (
                <SourceRow source={s} verdict="keep" key={`keep-${i}`} />
              ))}
              {rejectedSources?.map((s, i) => (
                <SourceRow source={s} verdict="reject" key={`reject-${i}`} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

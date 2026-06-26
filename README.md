AI Itinerary Agent

> An agentic travel planner that builds city itineraries the way a knowledgeable local would — by researching the real web and explicitly filtering out generic SEO content before ever writing a single recommendation.


**Stack:** Python · FastAPI · LangGraph · Groq (Llama 3.3 70B) · Tavily · React · Leaflet · Nominatim

---

## The Core Idea

Most "AI trip planner" demos are a thin LLM wrapper that regurgitates the same generic recommendations every travel site already has — "must-visit hidden gems," "top 10 attractions." The interesting engineering problem isn't building a planner; it's asking: **can an agent tell the difference between a genuine first-person recommendation and content written to rank in search?**

That filtering step is the actual point of this project. Everything else — the map, the calendar export, the chat — exists to make it useful. But the critic node is the part worth defending in an interview.

---

## Agent Architecture

A linear [LangGraph] state graph with five nodes. A single `AgentState` object accumulates fields as it flows through the pipeline — each node reads what it needs and writes its output back into state.

```
(city, days, vibe)
       │
       ▼
  ┌──────────┐     ┌──────────┐     ┌────────────────┐     ┌──────────────────┐     ┌──────────┐
  │ PLANNER  │────▶│  SEARCH  │────▶│     CRITIC     │────▶│ ITINERARY BUILDER│────▶│ GEOCODER │──▶ result
  └──────────┘     └──────────┘     └────────────────┘     └──────────────────┘     └──────────┘
  Generate 3–5     Tavily search     Keep / reject each     Day-by-day plan,          Nominatim
  research angles  + full-text       source with a          grounded only in          lat/lng per
  shaped by vibe   extraction        one-line reason        kept sources              stop
```

There are also three **standalone handlers** that live outside the graph — triggered by user actions on an already-built itinerary:

| Handler | Endpoint | What it does |
|---|---|---|
| `stop_swap` | `POST /api/itinerary/swap-stop` | Re-picks one stop from the same filtered sources without re-running the pipeline |
| `stop_chat` | `POST /api/stop-chat` (SSE) | Multi-turn streamed chat about a single stop, grounded in the original sources |
| `nearby_stops` | `POST /api/nearby-stops` | Suggests 2–3 walkable alternatives near a given stop |

---

## Node Design

### Planner
Takes the city, trip length, and vibe — then asks the LLM to generate 3–5 **research angles**, not search terms. A "foodie, mid-budget" vibe produces angles like *street food clusters*, *neighbourhood restaurants locals actually eat at*, *local food markets*. A "backpacker, fast-paced" vibe produces completely different angles. Each angle also includes the specific web search query to run — designed to surface blog posts and forum threads rather than travel-agency listings.

This matters because the specificity of the angles shapes everything downstream. Generic inputs produce generic itineraries.

### Search
Runs one Tavily search per research angle, then calls Tavily's **content extraction endpoint** for the top 2–3 results. This pulls full page text, not just the 2-sentence snippet from a standard search result. The critic needs enough signal to judge voice and specificity — a snippet tells you almost nothing about whether the author actually went to the place.

### Critic — the core differentiator
Given a batch of sources for one research angle, the critic classifies each as a **genuine local recommendation** or **generic SEO/listicle content**, using concrete heuristics:

**Keep signals:**
- First-person voice with specific, checkable detail — exact stall names, cross-streets, prices, timing quirks, what not to order
- Reads like the author wanted to share something, not rank for a keyword
- Forum threads and personal blogs with real specificity, even if short or informally written

**Reject signals:**
- Superlative-stuffed filler with no backing — "hidden gem," "must-visit," "top 10," "bucket list" used as decoration
- Interchangeable list-of-N-places structure with one generic sentence each
- Corporate travel-agency voice — no first-person pronoun, no sensory detail, identical to thousands of other "Best Things To Do In [City]" pages

Every verdict — keep *or* reject — requires a **one-line justification**. This is a deliberate design choice, not just for the UI. If every reason reads identically or generically, the model isn't actually discriminating — it's rubber-stamping. The forced justification makes lazy approval immediately visible during development, and it's what the Sources Panel in the UI shows to make the filtering step transparent rather than a black box.

Sources are **batched per research angle** into a single LLM call rather than one call per source. This gives the model within-batch contrast — judging 4–5 sources side by side makes it much easier to notice "these two are clearly thinner than the others" than judging each source in isolation.

### Itinerary Builder
Builds the structured day-by-day plan using **only the sources that survived the critic**. The LLM is explicitly constrained to ground every recommendation in a kept source — it can't fall back on training data. Output is validated against a Pydantic schema with one automatic retry if the model returns malformed JSON.

### Geocoder
Looks up real coordinates for each stop via Nominatim (OpenStreetMap). This is deliberately a **separate node**, not folded into the itinerary builder prompt. Geocoding is a lookup — not something an LLM should be estimating. A stop that fails to geocode keeps `null` coordinates and the itinerary continues rather than failing.

---

## State Schema Design

Two layers, deliberately separated:

**Pydantic models** validate every structured LLM output at the boundary — `ResearchAngles`, `CriticBatchResult`, `Itinerary`, etc. If the LLM returns malformed JSON, it's caught here before it contaminates state.

**`AgentState` (TypedDict)** is the actual LangGraph state. LangGraph's default update mechanism merges plain dicts returned by each node; TypedDict is the natural fit. So Pydantic models are built and validated, then immediately serialized to dicts (`.model_dump()`) before being written into state.

```python
class AgentState(TypedDict, total=False):
    city: str
    days: int
    vibe: str
    research_angles: list[dict]     # planner output
    raw_search_results: list[dict]  # search output
    filtered_sources: list[dict]    # critic output — kept
    rejected_sources: list[dict]    # critic output — rejected
    itinerary: dict                 # itinerary builder output
    current_step: str               # streamed to frontend for live progress
    errors: list[str]               # non-fatal warnings
```

`current_step` is written by every node and streamed to the frontend over Server-Sent Events — this is how the UI shows live progress rather than a dead 20–40 second wait.

---

## Key Engineering Decisions

**No LangChain wrapper around Groq.** The Groq SDK is called directly. In a portfolio project, fewer abstraction layers means everything is explainable. JSON parsing, schema validation, and retry logic are all visible in `llm_client.py` — there's no "the framework handles it" answer.

**Standalone handlers, not graph nodes, for user-triggered actions.** Swap, chat, and nearby are single targeted LLM calls on an already-built itinerary. Forcing them through the graph would mean re-running the full pipeline — wasteful and wrong for the interaction model. They share the original `filtered_sources` as their grounding context, so recommendations stay consistent with what the agent already researched.

**Geocoding as a lookup, not an LLM task.** The geocoder calls Nominatim rather than asking the LLM to produce coordinates. An LLM confidently hallucinating a plausible-looking lat/lng would silently break the map with no error. A Nominatim failure produces `null`, which the frontend handles explicitly.

**The critic justification is load-bearing.** It's not just a UI nicety. During development, if the critic starts approving everything, you see it immediately in the reasons — they become uniform and empty-sounding. The one-line requirement forces the model to articulate what specific signal it acted on, which makes quality regressions observable.

**PDF export with no library.** Print-specific CSS hides the UI chrome and the browser's "Save as PDF" handles the rest. The `.ics` calendar file is built by hand in `utils/ics.js` — one event per stop, with the "why not touristy" note baked into the description.

---

## Features

- **Transparent source filtering** — the Sources Panel shows every kept and rejected source with its one-line verdict, so the filtering work is visible rather than hidden
- **Live progress streaming** — SSE streams `current_step` from each node as it runs
- **Interactive map** — geocoded stops plotted on Leaflet/OpenStreetMap, colour-coded by day with dashed connector lines
- **Swap this stop** — regenerates one stop without re-running the pipeline
- **Ask about a stop** — per-stop streaming chat grounded in the original filtered sources
- **What else is nearby?** — 2–3 walkable alternatives, grounded in the same sources, excluding existing itinerary stops
- **PDF export** — clean print layout via CSS, no library
- **Calendar export (.ics)** — client-side iCalendar generation, one event per stop
- **Weather widget** — current conditions for the trip city
- **Budget bar** — visual cost estimate per itinerary
- **Saved trips** — localStorage persistence with compressed URL sharing via `lz-string`

---

## Project Structure

```
project/
├── backend/
│   ├── app/
│   │   ├── agent/
│   │   │   ├── graph.py              # LangGraph wiring — 6 nodes
│   │   │   ├── state.py              # Pydantic models + AgentState TypedDict
│   │   │   ├── prompts.py            # All LLM prompts as named constants
│   │   │   ├── llm_client.py         # Groq wrapper: forced JSON, validate, retry-once
│   │   │   ├── search_client.py      # Tavily: search + full-text extract
│   │   │   ├── geocode_client.py     # Nominatim: rate-limited geocoding
│   │   │   ├── stop_swap.py          # Standalone swap handler
│   │   │   ├── nearby_stops.py       # Standalone nearby suggestions handler
│   │   │   └── nodes/
│   │   │       ├── planner.py
│   │   │       ├── search.py
│   │   │       ├── critic.py         # Source quality filter — the core idea
│   │   │       ├── itinerary_builder.py
│   │   │       ├── geocoder.py
│   │   │       └── stop_chat.py      # Standalone per-stop chat handler
│   │   ├── main.py                   # FastAPI app + all endpoints
│   │   └── config.py                 # Env var loading
│   ├── scripts/                      # Per-node test scripts + full graph test
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── api.js                    # SSE-over-POST client + swap/chat/nearby
    │   ├── components/
    │   │   ├── TripForm.jsx
    │   │   ├── LoadingState.jsx       # Live progress from SSE stream
    │   │   ├── ItineraryView.jsx
    │   │   ├── MapView.jsx            # Leaflet map
    │   │   ├── SourcesPanel.jsx       # Kept/rejected sources with verdicts
    │   │   ├── StopChat.jsx           # Streaming per-stop chat
    │   │   ├── ExportToolbar.jsx      # PDF + .ics export
    │   │   ├── SavedTripsDropdown.jsx
    │   │   ├── BudgetBar.jsx
    │   │   ├── WeatherWidget.jsx
    │   └── utils/
    │       ├── ics.js                 # Hand-built iCalendar generation
    │       ├── savedTrips.js          # localStorage + lz-string compression
    │       └── shareUrl.js
    └── package.json
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/itinerary` | Run the full agent pipeline; SSE streams progress then final JSON |
| `POST` | `/api/itinerary/swap-stop` | Swap one stop; returns replacement stop JSON |
| `POST` | `/api/stop-chat` | Stream a chat reply about one stop token-by-token via SSE |
| `POST` | `/api/nearby-stops` | Return 2–3 walkable alternatives near a given stop |

---

## Running Locally

### Backend
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your GROQ_API_KEY and TAVILY_API_KEY
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Test individual nodes
```bash
python scripts/test_critic.py         
python scripts/test_planner.py
python scripts/test_itinerary_builder.py
python scripts/test_full_graph.py       # full end-to-end
```


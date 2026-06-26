import { useState, useRef, useEffect } from "react";
import "./StopChat.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Backend SSE streaming call ───────────────────────────────────────────────
// Calls /api/itinerary/stop-chat and yields token strings as they arrive.
async function* streamStopChat({ stop, city, vibe, filteredSources, history, userMessage }) {
  const response = await fetch(`${API_BASE}/api/itinerary/stop-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stop,
      city,
      vibe,
      filtered_sources: filteredSources,
      history,
      user_message: userMessage,
    }),
  });

  if (!response.ok) throw new Error(`API error ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const dataLine = rawEvent.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;

      try {
        const parsed = JSON.parse(dataLine.slice("data: ".length));
        if (parsed.type === "token") yield parsed.content;
        if (parsed.type === "done")  return;
        if (parsed.type === "error") throw new Error(parsed.message);
      } catch (err) {
        if (err.message !== "Unexpected end of JSON input") throw err;
      }
    }
  }
}

// ─── Suggested questions ──────────────────────────────────────────────────────
const SUGGESTIONS = [
  "Is this good for kids?",
  "Best time to visit?",
  "How to get there?",
  "Any entry fees?",
  "Nearby food options?",
];

// ─── Single message bubble ────────────────────────────────────────────────────
function MessageBubble({ role, content, isStreaming }) {
  return (
    <div className={`stopchat__bubble stopchat__bubble--${role}`}>
      {role === "assistant" && <span className="stopchat__avatar">✦</span>}
      <div className="stopchat__bubble-text">
        {content}
        {isStreaming && <span className="stopchat__cursor" />}
      </div>
    </div>
  );
}

// ─── Main StopChat component ──────────────────────────────────────────────────
// Props:
//   stop            – ItineraryStop object for this card
//   city            – trip city string
//   vibe            – trip vibe string
//   filteredSources – sources array from the original /api/itinerary result
//   dayColor        – CSS color for accent theming
export default function StopChat({ stop, city, vibe, filteredSources = [], dayColor }) {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState([]); // { role, content }[]
  const [input, setInput]       = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError]       = useState("");
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  async function sendMessage(text) {
    if (!text.trim() || streaming) return;

    const userMsg = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setError("");
    setStreaming(true);

    // Add empty assistant bubble to stream into
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      // history is all messages BEFORE this user turn
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      for await (const chunk of streamStopChat({
        stop,
        city,
        vibe,
        filteredSources,
        history,
        userMessage: text.trim(),
      })) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = { ...last, content: last.content + chunk };
          return updated;
        });
      }
    } catch (err) {
      setError("Couldn't reach the server. Check it's running and try again.");
      setMessages((prev) => prev.slice(0, -1)); // drop empty assistant bubble
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="stopchat" style={{ "--chat-color": dayColor }}>
      {/* Toggle button */}
      <button
        className={`stopchat__toggle ${open ? "stopchat__toggle--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Ask about this stop"
      >
        <span className="stopchat__toggle-icon">{open ? "✕" : "✦"}</span>
        <span className="stopchat__toggle-label">
          {open ? "Close" : "Ask about this place"}
        </span>
      </button>

      {/* Chat panel */}
      {open && (
        <div className="stopchat__panel">
          <div className="stopchat__messages">
            {messages.length === 0 ? (
              <div className="stopchat__empty">
                <p className="stopchat__empty-hint">
                  Ask anything about <strong>{stop.name}</strong>
                </p>
                <div className="stopchat__suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      className="stopchat__suggestion"
                      onClick={() => sendMessage(s)}
                      disabled={streaming}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  role={msg.role}
                  content={msg.content}
                  isStreaming={
                    streaming && i === messages.length - 1 && msg.role === "assistant"
                  }
                />
              ))
            )}
            {error && <p className="stopchat__error">{error}</p>}
            <div ref={bottomRef} />
          </div>

          <div className="stopchat__input-row">
            <textarea
              ref={inputRef}
              className="stopchat__input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything…"
              rows={1}
              disabled={streaming}
            />
            <button
              className="stopchat__send"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || streaming}
              aria-label="Send"
            >
              {streaming ? (
                <span className="stopchat__send-spin">↻</span>
              ) : (
                "↑"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

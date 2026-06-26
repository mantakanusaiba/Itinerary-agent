/**
 * Builds a downloadable .ics (iCalendar) file from an itinerary, entirely
 * client-side. No backend involvement and no calendar library — the
 * iCalendar format is plain text with a handful of escaping rules, so
 * hand-building it keeps this dependency-free.
 *
 * Reference: RFC 5545 (https://www.rfc-editor.org/rfc/rfc5545)
 */

/** Parses "7:00 AM" / "12:30 PM" -> {hours: 0-23, minutes: 0-59}. */
function parseTimeString(timeStr) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(timeStr.trim());
  if (!match) return { hours: 9, minutes: 0 }; // sane fallback if the model returns an odd format

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  return { hours, minutes };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Formats a local Date as an ICS local-time DTSTART/DTEND value: YYYYMMDDTHHMMSS */
function formatICSDateTime(date) {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}00`
  );
}

/** Escapes text per RFC 5545 §3.3.11. */
function escapeICSText(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * @param {object} itinerary - {days: [{day_number, theme, stops: [...]}]}
 * @param {string} city
 * @param {string} startDateStr - "YYYY-MM-DD", the date of day_number=1
 * @returns {string} full .ics file content
 */
export function buildICS(itinerary, city, startDateStr) {
  const [startYear, startMonth, startDay] = startDateStr.split("-").map(Number);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Field Notes//Local Guide Agent//EN",
    "CALSCALE:GREGORIAN",
  ];

  itinerary.days.forEach((day) => {
    // day_number 1 -> the trip start date, day_number 2 -> start date + 1, etc.
    const dayDate = new Date(startYear, startMonth - 1, startDay + (day.day_number - 1));

    day.stops.forEach((stop, stopIndex) => {
      const { hours, minutes } = parseTimeString(stop.time);
      const dtStart = new Date(dayDate);
      dtStart.setHours(hours, minutes, 0, 0);
      const dtEnd = new Date(dtStart.getTime() + (stop.duration_minutes || 60) * 60000);

      const description = `${stop.description}\n\nWhy it's worth it: ${stop.why_not_touristy}\n\nSource: ${stop.source_reference}`;

      lines.push(
        "BEGIN:VEVENT",
        `UID:${day.day_number}-${stopIndex}-${Date.now()}@field-notes-local-guide-agent`,
        `DTSTAMP:${formatICSDateTime(new Date())}`,
        `DTSTART:${formatICSDateTime(dtStart)}`,
        `DTEND:${formatICSDateTime(dtEnd)}`,
        `SUMMARY:${escapeICSText(stop.name)}`,
        `DESCRIPTION:${escapeICSText(description)}`,
        `LOCATION:${escapeICSText(`${stop.name}, ${city}`)}`,
        "END:VEVENT"
      );
    });
  });

  lines.push("END:VCALENDAR");

  // ICS technically wants CRLF line endings.
  return lines.join("\r\n");
}

/** Triggers a browser download of the given itinerary as a .ics file. */
export function downloadICS(itinerary, city, startDateStr) {
  const content = buildICS(itinerary, city, startDateStr);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${city.replace(/\s+/g, "-").toLowerCase()}-itinerary.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

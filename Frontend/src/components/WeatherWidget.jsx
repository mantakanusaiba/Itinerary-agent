import { useState, useEffect } from "react";
import "./WeatherWidget.css";

// WMO weather interpretation codes → emoji + label
const WMO_CODES = {
    0: { emoji: "☀️", label: "Clear" },
    1: { emoji: "🌤️", label: "Mainly clear" },
    2: { emoji: "⛅", label: "Partly cloudy" },
    3: { emoji: "☁️", label: "Overcast" },
    45: { emoji: "🌫️", label: "Foggy" },
    48: { emoji: "🌫️", label: "Foggy" },
    51: { emoji: "🌦️", label: "Light drizzle" },
    53: { emoji: "🌦️", label: "Drizzle" },
    55: { emoji: "🌧️", label: "Heavy drizzle" },
    61: { emoji: "🌧️", label: "Light rain" },
    63: { emoji: "🌧️", label: "Rain" },
    65: { emoji: "🌧️", label: "Heavy rain" },
    71: { emoji: "🌨️", label: "Light snow" },
    73: { emoji: "🌨️", label: "Snow" },
    75: { emoji: "❄️", label: "Heavy snow" },
    80: { emoji: "🌦️", label: "Showers" },
    81: { emoji: "🌧️", label: "Showers" },
    82: { emoji: "⛈️", label: "Heavy showers" },
    95: { emoji: "⛈️", label: "Thunderstorm" },
    96: { emoji: "⛈️", label: "Thunderstorm" },
    99: { emoji: "⛈️", label: "Thunderstorm" },
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function geocodeCity(city) {
    const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
    );
    const data = await res.json();
    const result = data.results?.[0];
    if (!result) throw new Error(`City not found: ${city}`);
    return { lat: result.latitude, lon: result.longitude, name: result.name, country: result.country };
}

async function fetchWeather(lat, lon) {
    const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=auto&forecast_days=7`
    );
    return res.json();
}

export default function WeatherWidget({ city }) {
    const [weather, setWeather] = useState(null);
    const [locationName, setLocationName] = useState(city);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        if (!city) return;
        setLoading(true);
        setError(null);
        setWeather(null);

        geocodeCity(city)
            .then(({ lat, lon, name, country }) => {
                setLocationName(`${name}, ${country}`);
                return fetchWeather(lat, lon);
            })
            .then((data) => {
                if (!data.daily) throw new Error("No weather data returned");
                setWeather(data.daily);
                setLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setLoading(false);
            });
    }, [city]);

    if (loading) {
        return (
            <div className="weather-widget weather-widget--loading">
                <div className="weather-widget__header">
                    <span className="weather-widget__title">🌤️ Weather Forecast</span>
                    <span className="weather-widget__spinner" />
                </div>
                <p className="weather-widget__loading-text">Fetching forecast for {city}…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="weather-widget weather-widget--error">
                <span className="weather-widget__title">🌤️ Weather unavailable</span>
                <p className="weather-widget__error-text">Couldn't load forecast for {city}.</p>
            </div>
        );
    }

    if (!weather) return null;

    const days = weather.time.map((dateStr, i) => {
        const date = new Date(dateStr + "T00:00:00");
        const code = weather.weathercode[i];
        const wmo = WMO_CODES[code] || { emoji: "🌡️", label: "Unknown" };
        return {
            dayLabel: DAY_LABELS[date.getDay()],
            date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            emoji: wmo.emoji,
            label: wmo.label,
            high: Math.round(weather.temperature_2m_max[i]),
            low: Math.round(weather.temperature_2m_min[i]),
            rain: weather.precipitation_probability_max[i],
        };
    });

    return (
        <div className={`weather-widget${collapsed ? " weather-widget--collapsed" : ""}`}>
            <button
                className="weather-widget__header"
                onClick={() => setCollapsed((c) => !c)}
                aria-expanded={!collapsed}
            >
                <span className="weather-widget__title">
                    🌤️ 7-Day Forecast — <span className="weather-widget__city">{locationName}</span>
                </span>
                <span className="weather-widget__toggle">{collapsed ? "▸" : "▾"}</span>
            </button>

            {!collapsed && (
                <div className="weather-widget__grid">
                    {days.map((day, i) => (
                        <div key={i} className={`weather-day${i === 0 ? " weather-day--today" : ""}`}>
                            <span className="weather-day__label">{i === 0 ? "Today" : day.dayLabel}</span>
                            <span className="weather-day__date">{day.date}</span>
                            <span className="weather-day__emoji" title={day.label}>{day.emoji}</span>
                            <span className="weather-day__label-text">{day.label}</span>
                            <div className="weather-day__temps">
                                <span className="weather-day__high">{day.high}°</span>
                                <span className="weather-day__sep">/</span>
                                <span className="weather-day__low">{day.low}°</span>
                            </div>
                            {day.rain > 0 && (
                                <span className="weather-day__rain">💧 {day.rain}%</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
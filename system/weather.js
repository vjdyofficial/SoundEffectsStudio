const latInput = document.getElementById("latInput");
const lonInput = document.getElementById("lonInput");

// LocalStorage keys with prefix
const WEATHER_STORAGE_KEY = "andromeda_weather_lastget_data";
const WEATHER_STORAGE_TIME = "andromeda_weather_lastget_time";

// Load settings from localStorage
function loadWeatherSettings() {
    const savedRaw = localStorage.getItem("weatherSettings");
    if (!savedRaw) return;

    try {
        const saved = JSON.parse(savedRaw);
        latInput.value = saved.latitude ?? "";
        lonInput.value = saved.longitude ?? "";
    } catch (err) {
        console.warn("Failed to parse saved weather settings:", err);
    }
}

// Save settings
function saveWeatherSettings() {
    const settings = {
        latitude: parseFloat(latInput.value) || 0,
        longitude: parseFloat(lonInput.value) || 0
    };
    localStorage.setItem("weatherSettings", JSON.stringify(settings));
}

latInput.addEventListener("input", saveWeatherSettings);
lonInput.addEventListener("input", saveWeatherSettings);

// Initialize immediately if script is at end of body
loadWeatherSettings();

let folder = "icons/monosource/weather/";

// ----------------------
// Weather icon / description
// ----------------------
function getWeatherIcon(code) {
    if ([0].includes(code)) return folder + "sunny.svg";
    if ([1, 2, 3].includes(code)) return folder + "partly_cloudy_day.svg";
    if ([45, 48].includes(code)) return folder + "mist.svg";
    if ([51, 53, 55].includes(code)) return folder + "rainy_light.svg";
    if ([61, 63, 65, 80, 81, 82].includes(code)) return folder + "rainy.svg";
    if ([71, 73, 75].includes(code)) return folder + "snowing_heavy.svg";
    if ([85, 86].includes(code)) return folder + "sunny_snowing.svg";
    if ([95, 96, 99].includes(code)) return folder + "thunderstorm.svg";
    return folder + "unknown.svg";
}

function getWeatherDesc(code) {
    const mapping = {
        0:  "Clear sky",
        1:  "Mostly clear skies",
        2:  "Partly cloudy skies",
        3:  "Overcast skies",
        45: "Fog",
        48: "Depositing rime fog",
        51: "Light drizzle",
        53: "Moderate drizzle",
        55: "Dense drizzle",
        56: "Light freezing drizzle",
        57: "Dense freezing drizzle",
        61: "Light rain",
        63: "Moderate rain",
        65: "Heavy rain",
        66: "Light freezing rain",
        67: "Heavy freezing rain",
        71: "Light snowfall",
        73: "Moderate snowfall",
        75: "Heavy snowfall",
        77: "Snow grains",
        80: "Slight rain",
        81: "Moderate rain",
        82: "Violent rain",
        85: "Slight snow",
        86: "Heavy snow",
        95: "Thunderstorm",
        96: "Thunderstorm (SH)",
        99: "Thunderstorm (HH)"
    };
    return mapping[code] ?? "Unknown condition";
}

// ----------------------
// Fetch weather from Open-Meteo + reverse geocode
// ----------------------
async function getWeather(lat, lon) {
    try {
        const weatherRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relativehumidity_2m`
        );
        const weatherData = await weatherRes.json();

        const weather = weatherData.current_weather || {
            temperature: null,
            windspeed: null,
            weathercode: null,
            time: null,
        };

        // Get current hour for humidity lookup
        const currentHour = weather.time ? weather.time.split("T")[1].slice(0, 2) : null;
        let humidity = null;
        if (weatherData.hourly?.time && weatherData.hourly?.relativehumidity_2m && currentHour) {
            const index = weatherData.hourly.time.findIndex(t => t.includes(currentHour));
            humidity = index !== -1 ? weatherData.hourly.relativehumidity_2m[index] : null;
        }

        // Reverse geocoding for city/country
        let city = "Unknown";
        let country = "";
        try {
            const geoRes = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
            );
            const geoData = await geoRes.json();
            city = geoData.address.city || geoData.address.town || geoData.address.village || geoData.address.county || "Unknown";
            country = geoData.address.country || "";
        } catch (err) {
            console.warn("Reverse geocoding failed:", err);
        }

        return {
            ...weather,
            weathercode: weather.weathercode ?? 0,
            humidity,
            city,
            country,
        };
    } catch (err) {
        console.error("Weather fetch error:", err);
        return null;
    }
}

// ----------------------
// Update UI
// ----------------------
function updateWeatherUI(weather) {
    const icon = getWeatherIcon(weather.weathercode);

    document.getElementById("weathercityText").textContent = weather.city ?? "--";
    document.getElementById("weatherdegreeText").textContent =
        weather.temperature != null ? `${weather.temperature}°C` : "N/A";
    document.getElementById("weatherHumidityText").textContent =
        weather.humidity != null ? `${getWeatherDesc(weather.weathercode)}` : "--";
    document.getElementById("weatherIcon").src = icon ?? folder + "unknown.svg";
}

// ----------------------
// Display weather with cache in localStorage
// ----------------------
async function displayWeather(force = false) {
    const now = Date.now();

    if (!force || !navigator.onLine) {
        const cachedRaw = localStorage.getItem(WEATHER_STORAGE_KEY);
        const lastTimeRaw = localStorage.getItem(WEATHER_STORAGE_TIME);
        if (cachedRaw && lastTimeRaw) {
            const lastTime = parseInt(lastTimeRaw, 10);
            if ((now - lastTime) < 30 * 60 * 1000) { // 30 mins
                try {
                    const cachedWeather = JSON.parse(cachedRaw);
                    updateWeatherUI(cachedWeather);
                    return;
                } catch (err) {
                    console.warn("Failed to parse cached weather:", err);
                }
            }
        }
    }

    document.getElementById('refreshWeather').disabled = true;
    document.getElementById('refreshWeatherIcon').style.display = 'inherit';

    try {
        const loc = {
            latitude: parseFloat(latInput.value),
            longitude: parseFloat(lonInput.value)
        };

        const weather = await getWeather(loc.latitude, loc.longitude);

        if (!weather) throw new Error("Weather data not available");

        // Save to localStorage
        localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(weather));
        localStorage.setItem(WEATHER_STORAGE_TIME, now.toString());

        updateWeatherUI(weather);
    } catch (err) {
        console.error("Failed to fetch or display weather:", err);
        document.getElementById("weathercityText").textContent = "Weather";
        document.getElementById("weatherdegreeText").textContent = "N/A";
        document.getElementById("weatherHumidityText").textContent = "Not available";
        document.getElementById("weatherIcon").src = folder + "unknown.svg";
    } finally {
        document.getElementById('refreshWeather').disabled = false;
        document.getElementById('refreshWeatherIcon').style.display = 'none';
    }
}

// ----------------------
// Refresh / clear
// ----------------------
function clearWeatherInfo() {
    document.getElementById("weathercityText").textContent = "--";
    document.getElementById("weatherdegreeText").textContent = "--";
    document.getElementById("weatherHumidityText").textContent = "Getting data...";
    document.getElementById("weatherIcon").src = folder + "unknown.svg";
    displayWeather(true); // force fetch
}

document.getElementById('refreshWeather').onclick = clearWeatherInfo;

// ----------------------
// Initial load + auto update every 30 mins
// ----------------------
displayWeather(false); // force fetch on start
setInterval(() => displayWeather(true), 30 * 60 * 1000); // 30 mins auto-update
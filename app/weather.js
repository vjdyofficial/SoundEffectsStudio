const useCustomCheck = document.getElementById("useCustomCheck");
const latInput = document.getElementById("latInput");
const lonInput = document.getElementById("lonInput");

// Enable/disable inputs
function updateInputsState() {
    const enabled = useCustomCheck.checked;
    latInput.disabled = !enabled;
    lonInput.disabled = !enabled;
}

// Load settings from localStorage
function loadWeatherSettings() {
    const savedRaw = localStorage.getItem("weatherSettings");
    if (!savedRaw) return;

    try {
        const saved = JSON.parse(savedRaw);
        useCustomCheck.checked = saved.useCustomLocation === true;
        latInput.value = saved.latitude ?? "";
        lonInput.value = saved.longitude ?? "";
        updateInputsState();
    } catch (err) {
        console.warn("Failed to parse saved weather settings:", err);
    }
}

// Save settings
function saveWeatherSettings() {
    const settings = {
        useCustomLocation: useCustomCheck.checked,
        latitude: parseFloat(latInput.value) || 0,
        longitude: parseFloat(lonInput.value) || 0
    };
    localStorage.setItem("weatherSettings", JSON.stringify(settings));
}

// Event listener for checkbox
useCustomCheck.addEventListener("change", updateInputsState);
useCustomCheck.addEventListener("change", saveWeatherSettings);
latInput.addEventListener("input", saveWeatherSettings);
lonInput.addEventListener("input", saveWeatherSettings);

// Initialize immediately if script is at end of body
loadWeatherSettings();

// ----------------------
// 1️⃣ Get coordinates from IP (no Google)
// ----------------------
async function getCoordsFromIP() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        return {
            latitude: data.latitude,
            longitude: data.longitude,
            city: data.city || "Unknown"
        };
    } catch (err) {
        console.error("IP geolocation error:", err);
        return { latitude: 0, longitude: 0, city: "Unknown" };
    }
}

let folder = "icons/monosource/weather/";

function getWeatherIcon(code) {
    if ([0].includes(code)) return folder + "sunny.svg";
    if ([1, 2].includes(code)) return folder + "partly_cloudy_day.svg";
    if ([3].includes(code)) return folder + "partly_cloudy_day.svg";
    if ([45, 48].includes(code)) return folder + "mist.svg";
    if ([51, 53, 55].includes(code)) return folder + "rainy_light.svg";
    if ([61, 63, 65, 80, 81, 82].includes(code)) return folder + "rainy.svg";
    if ([71, 73, 75].includes(code)) return folder + "snowing_heavy.svg";
    if ([85, 86].includes(code)) return folder + "sunny_snowing.svg";
    if ([95, 96, 99].includes(code)) return folder + "thunderstorm.svg";
    // fallback
    return folder + "unknown.svg";
}

// Map Open-Meteo weather codes to text
function getWeatherDesc(code) {
    if (code === 0) return "Clear sky";
    if (code === 1) return "Mainly clear";
    if (code === 2) return "Partly cloudy";
    if (code === 3) return "Overcast";
    if (code === 45) return "Fog";
    if (code === 48) return "Depositing rime fog";
    if (code === 51) return "Drizzle: light";
    if (code === 53) return "Drizzle: moderate";
    if (code === 55) return "Drizzle: dense";
    if (code === 56) return "Freezing Drizzle: light";
    if (code === 57) return "Freezing Drizzle: dense";
    if (code === 61) return "Rain: slight";
    if (code === 63) return "Rain: moderate";
    if (code === 65) return "Rain: heavy";
    if (code === 66) return "Freezing Rain: light";
    if (code === 67) return "Freezing Rain: heavy";
    if (code === 71) return "Snow fall: slight";
    if (code === 73) return "Snow fall: moderate";
    if (code === 75) return "Snow fall: heavy";
    if (code === 77) return "Snow grains";
    if (code === 80) return "Rain showers: slight";
    if (code === 81) return "Rain showers: moderate";
    if (code === 82) return "Rain showers: violent";
    if (code === 85) return "Snow showers: slight";
    if (code === 86) return "Snow showers: heavy";
    if (code === 95) return "Thunderstorm: slight or moderate";
    if (code === 96) return "Thunderstorm with slight hail";
    if (code === 99) return "Thunderstorm with heavy hail";
    return "Unknown";
}

// ----------------------
// 4️⃣ Display weather in timebar
// ----------------------
async function getWeather(lat, lon) {
    try {
        // 1️⃣ Fetch weather data
        const weatherRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relativehumidity_2m`
        );
        const weatherData = await weatherRes.json();

        // Fallback if current_weather is missing
        const weather = weatherData.current_weather || {
            temperature: null,
            windspeed: null,
            weathercode: null,
            time: null,
        };

        // 2️⃣ Get current hour for humidity lookup
        const currentHour = weather.time ? weather.time.split("T")[1].slice(0, 2) : null;

        // 3️⃣ Find humidity for current hour
        let humidity = null;
        if (weatherData.hourly?.time && weatherData.hourly?.relativehumidity_2m && currentHour) {
            const index = weatherData.hourly.time.findIndex(t => t.includes(currentHour));
            humidity = index !== -1 ? weatherData.hourly.relativehumidity_2m[index] : null;
        }

        // 4️⃣ Reverse geocoding using Nominatim (OpenStreetMap) to get city
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

        // 5️⃣ Return full weather object
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

async function displayWeather() {
    document.getElementById('refreshWeather').disabled = true;
    document.getElementById('refreshWeatherIcon').style.display = 'inherit';
    try {
        // 1️⃣ Determine coordinates
        let loc;
        if (useCustomCheck.checked) {
            loc = {
                latitude: parseFloat(latInput.value),
                longitude: parseFloat(lonInput.value)
            };
        } else {
            loc = await getCoordsFromIP();
        }
        console.log("Location:", loc);

        // 2️⃣ Fetch weather
        const weather = await getWeather(loc.latitude, loc.longitude);

        if (!weather) throw new Error("Weather data not available");

        // 3️⃣ Update UI
        const icon = getWeatherIcon(weather.weathercode);

        document.getElementById("weathercityText").textContent = weather.city ?? "N/A";
        document.getElementById("weatherdegreeText").textContent =
            weather.temperature != null ? `${weather.temperature}°C` : "--";
        document.getElementById("weatherHumidityText").textContent =
            weather.humidity != null ? `${getWeatherDesc(weather.weathercode)}` : "--";
        document.getElementById("weatherIcon").src = icon ?? folder + "unknown.svg";

        console.log(weather.city, weather.temperature, weather.humidity);
        document.getElementById('refreshWeather').disabled = false;
        document.getElementById('refreshWeatherIcon').style.display = 'none';

    } catch (err) {
        console.error("Failed to fetch or display weather:", err);

        // 4️⃣ Show fallback UI
        document.getElementById("weathercityText").textContent = "N/A";
        document.getElementById("weatherdegreeText").textContent = "--";
        document.getElementById("weatherHumidityText").textContent = "--";
        document.getElementById("weatherIcon").src = folder + "unknown.svg";
        document.getElementById('refreshWeather').disabled = false;
        document.getElementById('refreshWeatherIcon').style.display = 'none';
        // Optionally show alert to user
        // alert("Unable to load weather. Please check your internet connection.");
    }
}

// ----------------------
// 5️⃣ Initial load + auto-update every 30 mins
// ----------------------
displayWeather();

function clearWeatherInfo() {
    document.getElementById("weathercityText").textContent = "N/A";
    document.getElementById("weatherdegreeText").textContent = "--";
    document.getElementById("weatherHumidityText").textContent = "--";
    document.getElementById("weatherIcon").src = folder + "unknown.svg";
    displayWeather();
}

setInterval(displayWeather, 5 * 60 * 1000); // 30 mins

document.getElementById('refreshWeather').onclick = clearWeatherInfo;
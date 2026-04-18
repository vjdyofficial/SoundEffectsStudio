let lat = 0;
let lon = 0;

let folder = "../icons/monosource/weather/";

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
    if (code === 0) return "Clear";
    if (code === 1) return "Mainly clear";
    if (code === 2) return "Partly cloudy";
    if (code === 3) return "Overcast";
    if (code === 45) return "Fog";
    if (code === 48) return "Rime fog";
    if (code === 51) return "Light drizzle";
    if (code === 53) return "Mod drizzle";
    if (code === 55) return "Dense drizzle";
    if (code === 56) return "Light freeze drizzle";
    if (code === 57) return "Dense freeze drizzle";
    if (code === 61) return "Slight rain";
    if (code === 63) return "Mod rain";
    if (code === 65) return "Heavy rain";
    if (code === 66) return "Light freeze rain";
    if (code === 67) return "Heavy freeze rain";
    if (code === 71) return "Slight snow";
    if (code === 73) return "Mod snow";
    if (code === 75) return "Heavy snow";
    if (code === 77) return "Snow grains";
    if (code === 80) return "Slight showers";
    if (code === 81) return "Mod showers";
    if (code === 82) return "Violent showers";
    if (code === 85) return "Slight snow showers";
    if (code === 86) return "Heavy snow showers";
    if (code === 95) return "Thunderstorm";
    if (code === 96) return "Slight TS";
    if (code === 99) return "Heavy TS";
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
    try {
        // 1️⃣ Determine coordinates
        let loc;
        loc = {
            latitude: parseFloat(latInput),
            longitude: parseFloat(lonInput)
        };

        // 2️⃣ Fetch weather
        const weather = await getWeather(loc.latitude, loc.longitude);

        if (!weather) throw new Error("Weather data not available");

        // 3️⃣ Update UI
        const icon = getWeatherIcon(weather.weathercode);

        document.getElementById("weathercityText").textContent = weather.city ?? "--";
        document.getElementById("weatherdegreeText").textContent =
            weather.temperature != null ? `${weather.temperature}°C` : "N/A";
        document.getElementById("weatherHumidityText").textContent =
            weather.humidity != null ? `${getWeatherDesc(weather.weathercode)}` : "--";
        document.getElementById("weatherIcon").src = icon ?? folder + "unknown.svg";
        document.getElementById('refreshWeather').disabled = false;
        document.getElementById('refreshWeatherIcon').style.display = 'none';

    } catch (err) {
        console.error("Failed to fetch or display weather:", err);

        // 4️⃣ Show fallback UI
        document.getElementById("weathercityText").textContent = "Weather";
        document.getElementById("weatherdegreeText").textContent = "N/A";
        document.getElementById("weatherHumidityText").textContent = "Not available";
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
let latInput = 0;
let lonInput = 0;

function clearWeatherInfo() {
    document.getElementById("weathercityText").textContent = "--";
    document.getElementById("weatherdegreeText").textContent = "--";
    document.getElementById("weatherHumidityText").textContent = "Getting data...";
    document.getElementById("weatherIcon").src = folder + "unknown.svg";
    displayWeather();
}

setInterval(displayWeather, 5 * 60 * 1000); // 30 mins
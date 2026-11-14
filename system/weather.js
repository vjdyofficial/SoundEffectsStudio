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
    longitude: parseFloat(lonInput.value) || 0,
  };
  localStorage.setItem("weatherSettings", JSON.stringify(settings));
}

latInput.addEventListener("input", saveWeatherSettings);
lonInput.addEventListener("input", saveWeatherSettings);

// Initialize immediately if script is at end of body
loadWeatherSettings();

let folder = "icons/monosource/weather/";

// ----------------------
// WEATHER CONFIGURATION
// ----------------------

const WEATHER_CACHE_DURATION = 3 * 60 * 60 * 1000; // 3 hours

let weatherRequest = null;
let locationRequest = null;

// ----------------------
// WEATHER SYMBOL DESCRIPTIONS
// ----------------------


function getWeatherDesc(code) {
  if (code == null || code === "") return "Unknown";

  if (typeof code === "string") {
    return code
      .replace(/_/g, " ")
      .replace(/\b\w/g, character => character.toUpperCase());
  }

  // Handle old Open-Meteo numeric weather codes
  const oldCodes = {
    0: "Clear Sky",
    1: "Mainly Clear",
    2: "Partly Cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing Rime Fog",
    51: "Light Drizzle",
    53: "Moderate Drizzle",
    55: "Dense Drizzle",
    61: "Slight Rain",
    63: "Moderate Rain",
    65: "Heavy Rain",
    71: "Slight Snow",
    73: "Moderate Snow",
    75: "Heavy Snow",
    80: "Rain Showers",
    81: "Moderate Rain Showers",
    82: "Violent Rain Showers",
    95: "Thunderstorm",
    96: "Thunderstorm with Hail",
    99: "Severe Thunderstorm with Hail"
  };

  if (typeof code === "number") {
    return oldCodes[code] || "Unknown";
  }
}

// ----------------------
// GET WEATHER FROM MET NORWAY
// ----------------------

async function getWeather(lat, lon) {
  if (weatherRequest) return weatherRequest;

  weatherRequest = (async () => {
    try {
      const weatherData = await ipcRenderer.invoke(
        "WEATHER_GET_METNORWAY",
        lat,
        lon,
      );

      const timeseries = weatherData.properties?.timeseries;

      if (!timeseries || !timeseries.length) {
        throw new Error("No weather forecast available");
      }

      // Find latest available forecast
      const now = Date.now();

      let current = timeseries[0];

      for (const item of timeseries) {
        if (new Date(item.time).getTime() <= now) {
          current = item;
        } else {
          break;
        }
      }

      const details = current.data?.instant?.details || {};

      // Get weather symbol
      const period =
        current.data?.next_1_hours ||
        current.data?.next_6_hours ||
        current.data?.next_12_hours;

      const symbol = period?.summary?.symbol_code || "unknown";

      return {
        temperature: details.air_temperature ?? null,

        windspeed: details.wind_speed ?? null,

        winddirection: details.wind_from_direction ?? null,

        humidity: details.relative_humidity ?? null,

        weathercode: symbol,

        time: current.time,

        city: "Unknown",
        country: "",
      };
    } catch (error) {
      console.error("Weather fetch failed:", error);
      throw error;
    } finally {
      weatherRequest = null;
    }
  })();

  return weatherRequest;
}

// ----------------------
// REVERSE GEOCODING
// ----------------------

async function getWeatherLocation(lat, lon) {
  if (locationRequest) return locationRequest;

  locationRequest = (async () => {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");

      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", lat);
      url.searchParams.set("lon", lon);
      url.searchParams.set("zoom", "10");

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        throw new Error(`Nominatim HTTP ${response.status}`);
      }

      const data = await response.json();
      const address = data.address || {};

      return {
        city:
          address.city ||
          address.town ||
          address.village ||
          address.municipality ||
          address.county ||
          "Unknown",

        country: address.country || "",
      };
    } catch (error) {
      console.warn("Reverse geocoding failed:", error);

      return {
        city: "Unknown",
        country: "",
      };
    } finally {
      locationRequest = null;
    }
  })();

  return locationRequest;
}

// ----------------------
// UPDATE WEATHER UI
// ----------------------

function getWeatherIcon(code) {
  console.log(`[Weather - Icon Get] ${code}`);

  const numericCode = typeof code === "string" && code.trim() !== "" ? Number(code) : code;
  if (Number.isFinite(numericCode)) {
    if (numericCode === 0) return folder + "sunny.svg";
    if ([1, 2, 3].includes(numericCode)) return folder + "partly_cloudy_day.svg";
    if ([45, 48].includes(numericCode)) return folder + "mist.svg";
    if ([51, 53, 55].includes(numericCode)) return folder + "rainy_light.svg";
    if ([61, 63, 65, 80, 81, 82].includes(numericCode)) return folder + "rainy.svg";
    if ([71, 73, 75].includes(numericCode)) return folder + "snowing_heavy.svg";
    if ([85, 86].includes(numericCode)) return folder + "sunny_snowing.svg";
    if ([95, 96, 99].includes(numericCode)) return folder + "thunderstorm.svg";
  }

  // MET Norway uses symbol names such as "lightrainshowers_day" and
  // "heavyrainandthunder" instead of WMO numeric weather codes.
  const symbol = String(code || "").toLowerCase().trim();
  if (symbol.includes("thunder")) return folder + "thunderstorm.svg";
  if (/snow|sleet/.test(symbol)) {
    return /showers|shower/.test(symbol)
      ? folder + "sunny_snowing.svg"
      : folder + "snowing_heavy.svg";
  }
  if (/rain|drizzle/.test(symbol)) {
    return /light|showers|shower/.test(symbol)
      ? folder + "rainy_light.svg"
      : folder + "rainy.svg";
  }
  if (/fog/.test(symbol)) return folder + "mist.svg";
  if (/clearsky/.test(symbol)) return folder + "sunny.svg";
  if (/fair|partlycloudy|cloudy/.test(symbol)) return folder + "partly_cloudy_day.svg";
  return folder + "unknown.svg";
}

function getCompassDirection(degrees) {
  if (!Number.isFinite(Number(degrees))) return "Unknown";

  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const normalizedDegrees = ((Number(degrees) % 360) + 360) % 360;
  return directions[Math.round(normalizedDegrees / 45) % directions.length];
}

function updateWeatherUI(weather) {
  if (!weather) return;
  console.log(`[Weather - Get]`, weather);

  const cityElement = document.getElementById("weathercityText");
  const degreeElement = document.getElementById("weatherdegreeText");
  const humidityElement = document.getElementById("weatherHumidityText");
  const iconElement = document.getElementById("weatherIcon");
  const symbol = weather.weathercode || "unknown";
  const description = getWeatherDesc(symbol);

  cityElement.textContent = String(weather.city || "--") + " - " + String(description);
  cityElement.title = cityElement.textContent;

  degreeElement.textContent =
    weather.temperature != null ? `${weather.temperature}°C` : "N/A";

  humidityElement.textContent =
    String(weather.humidity != null
      ? `${Math.round(weather.humidity)}%`
      : "--") +
    (weather.windspeed != null
      ? ` - Wind: ${weather.windspeed} m/s`
      : "") +
    (weather.winddirection != null
      ? ` ${weather.winddirection}° ${getCompassDirection(weather.winddirection)}`
      : "");

  humidityElement.title = humidityElement.textContent;

  iconElement.src = getWeatherIcon(symbol);

  iconElement.onerror = function () {
    this.onerror = null;
    this.src = folder + "unknown.svg";
  };
}

// ----------------------
// WEATHER ERROR DISPLAY
// ----------------------

function showWeatherError(message) {
  document.getElementById("weathercityText").textContent =
    "Weather Not Available";

  document.getElementById("weathercityText").title = "No data"
  document.getElementById("weatherdegreeText").textContent = "N/A";

  document.getElementById("weatherHumidityText").textContent = message;
  document.getElementById("weatherHumidityText").title = "No data"

  document.getElementById("weatherIcon").src = folder + "unknown.svg";
}

// ----------------------
// DISPLAY WEATHER
// ----------------------

async function displayWeather(force = false) {
  const now = Date.now();

  const refreshButton = document.getElementById("refreshWeather");

  const refreshIcon = document.getElementById("refreshWeatherIcon");

  // ----------------------
  // LOAD CACHE
  // ----------------------

  let cachedWeather = null;
  let lastTime = 0;

  try {
    const cachedRaw = localStorage.getItem(WEATHER_STORAGE_KEY);

    const lastTimeRaw = localStorage.getItem(WEATHER_STORAGE_TIME);

    if (cachedRaw && lastTimeRaw) {
      cachedWeather = JSON.parse(cachedRaw);
      lastTime = parseInt(lastTimeRaw, 10);

      if (
        !Number.isFinite(lastTime) ||
        !cachedWeather ||
        typeof cachedWeather !== "object"
      ) {
        cachedWeather = null;
        lastTime = 0;
      }
    }
  } catch (error) {
    console.warn("Weather cache error:", error);
    cachedWeather = null;
  }

  // ----------------------
  // USE VALID CACHE
  // ----------------------

  if (!force && cachedWeather && now - lastTime < WEATHER_CACHE_DURATION) {
    updateWeatherUI(cachedWeather);
    return;
  }

  // ----------------------
  // OFFLINE FALLBACK
  // ----------------------

  if (!navigator.onLine) {
    if (cachedWeather) {
      updateWeatherUI(cachedWeather);
    } else {
      showWeatherError("You're offline");
    }

    return;
  }

  // ----------------------
  // REFRESH BUTTON
  // ----------------------

  if (refreshButton) {
    refreshButton.disabled = true;
  }

  if (refreshIcon) {
    refreshIcon.style.display = "inherit";
  }

  try {
    const lat = parseFloat(latInput.value);
    const lon = parseFloat(lonInput.value);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error("Invalid latitude or longitude");
    }

    // ----------------------
    // GET WEATHER AND LOCATION
    // ----------------------

    const [weather, location] = await Promise.all([
      getWeather(lat, lon),
      getWeatherLocation(lat, lon),
    ]);

    const finalWeather = {
      ...weather,
      city: location.city,
      country: location.country,
    };

    // ----------------------
    // SAVE CACHE
    // ----------------------

    localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(finalWeather));

    localStorage.setItem(WEATHER_STORAGE_TIME, Date.now().toString());

    // ----------------------
    // UPDATE UI
    // ----------------------

    updateWeatherUI(finalWeather);
  } catch (error) {
    console.error("Weather update failed:", error);

    // Use old weather data if available
    if (cachedWeather) {
      updateWeatherUI(cachedWeather);

      const ageMinutes = Math.floor((now - lastTime) / 60000);

      console.warn(`Using cached weather (${ageMinutes} minutes old)`);
    } else {
      showWeatherError(
        navigator.onLine
          ? "Please check your internet and refresh."
          : "You're offline",
      );
    }
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
    }

    if (refreshIcon) {
      refreshIcon.style.display = "none";
    }
  }
}

const earthquake = new EarthquakeModule();

function updateEarthquakeUI(data) {
  const magnitude = document.getElementById("earthquakeMagnitude");

  const place = document.getElementById("earthquakePlace");

  const time = document.getElementById("earthquakeTime");

  if (!data) {
    magnitude.textContent = ":-)";
    place.textContent = "No recent earthquake";
    time.textContent = "You're all set";
    return;
  }

  magnitude.textContent =
    data.magnitude != null ? `${data.magnitude.toFixed(1)} M` : "--.- M";

  place.textContent = data.place || "Unknown location";

  time.textContent =
    (data.time ? new Date(data.time).toLocaleString() : "--") +
    " - " +
    (data.depth != null ? `Depth: ${data.depth.toFixed(1)} km` : "Depth: --");
}

async function RefreshEathquakeData() {
  earthquake.Init(latInput.value, lonInput.value);
  try {
    window.EARTHQUAKE_DATA = await earthquake.getLatest();
    updateEarthquakeUI(window.EARTHQUAKE_DATA);
  } catch (err) {
    const magnitude = document.getElementById("earthquakeMagnitude");
    const place = document.getElementById("earthquakePlace");
    const time = document.getElementById("earthquakeTime");
    magnitude.textContent = "N/A";
    place.textContent = "Cannot show earthquake data";
    time.textContent = navigator.onLine
      ? "Please check your internet and refresh."
      : "You're offline";
  }
}

// ----------------------
// Refresh / clear
// ----------------------
function clearInfo() {
  document.getElementById("weathercityText").textContent = "--";
  document.getElementById("weatherdegreeText").textContent = "--";
  document.getElementById("weatherHumidityText").textContent =
    "Getting data...";
  document.getElementById("weatherIcon").src = folder + "unknown.svg";

  displayWeather(false); // force fetch
  RefreshEathquakeData();
}

document.getElementById("refreshWeather").onclick = clearInfo;

// ----------------------
// Initial load + auto update every 30 mins
// ----------------------
clearInfo(); // force fetch on start
setInterval(() => clearInfo(), 30 * 60 * 1000); // 30 mins auto-update

const dashboards = document.querySelectorAll(
  '[aria-type="SFXSTUDIO_INFO_DASHBOARD"]',
);

if (dashboards.length > 0) {
  let currentCard = 0;

  function showCard(index) {
    dashboards.forEach((dashboard, i) => {
      dashboard.style.setProperty("--showcard", i === index ? "flex" : "none");
    });
  }

  showCard(0);

  setInterval(() => {
    currentCard = (currentCard + 1) % dashboards.length;

    showCard(currentCard);
  }, 15000);
}

ipcRenderer.on("update-coords", (event, coords) => {
  latInput.value = coords.lat;
  lonInput.value = coords.lng;
  latInput.dispatchEvent(new Event("input", { bubbles: true }));
  lonInput.dispatchEvent(new Event("input", { bubbles: true }));
});

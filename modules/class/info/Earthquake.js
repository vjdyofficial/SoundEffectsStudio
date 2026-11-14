class EarthquakeModule {
  constructor() {
    // ---------------------------------------------------------
    // LOCATION
    // ---------------------------------------------------------

    this.latitude = null;
    this.longitude = null;

    // Search radius
    this.radiusKm = 1000;

    // Search previous 7 days
    this.searchDays = 7;

    // Cache for 30 minutes
    this.cacheDuration = 30 * 60 * 1000;

    this.cacheKey = "vjdyfm_earthquake";

    this.lastData = null;
  }

  // ---------------------------------------------------------
  // INITIALIZE
  // ---------------------------------------------------------

  Init(latitude, longitude) {
    this.latitude = Number(latitude);

    this.longitude = Number(longitude);

    if (!Number.isFinite(this.latitude) || !Number.isFinite(this.longitude)) {
      throw new Error("[Earthquake] Invalid coordinates.");
    }

    console.log("[Earthquake] Initialized:", this.latitude, this.longitude);
  }

  // ---------------------------------------------------------
  // FETCH EARTHQUAKE
  // ---------------------------------------------------------

  async fetchEarthquake() {
    if (!Number.isFinite(this.latitude) || !Number.isFinite(this.longitude)) {
      throw new Error("[Earthquake] Coordinates are not initialized.");
    }

    // -----------------------------------------------------
    // CHECK CACHE
    // -----------------------------------------------------

    const cached = localStorage.getItem(this.cacheKey);

    if (cached) {
      try {
        const cache = JSON.parse(cached);

        const cacheAge = Date.now() - cache.timestamp;

        const sameCoordinates =
          cache.latitude === this.latitude &&
          cache.longitude === this.longitude;

        if (cacheAge < this.cacheDuration && sameCoordinates) {
          console.log("[Earthquake] Using cached data.");

          console.log(
            "[Earthquake] Cache age:",
            Math.round(cacheAge / 1000),
            "seconds",
          );

          this.lastData = cache.earthquake;

          return cache.earthquake;
        }
      } catch (error) {
        console.warn("[Earthquake] Invalid cache. Ignoring it.");
      }
    }

    // -----------------------------------------------------
    // REQUEST USGS
    // -----------------------------------------------------

    console.log("[Earthquake] Requesting USGS...");

    const now = Date.now();

    const startTime = new Date(
      now - this.searchDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const endTime = new Date(now).toISOString();

    const params = new URLSearchParams({
      format: "geojson",

      latitude: this.latitude,

      longitude: this.longitude,

      maxradiuskm: this.radiusKm,

      starttime: startTime,

      endtime: endTime,

      orderby: "time",

      limit: 1,
    });

    const url =
      "https://earthquake.usgs.gov/fdsnws/event/1/query?" + params.toString();

    console.log("[Earthquake] URL:", url);

    // -----------------------------------------------------
    // FETCH
    // -----------------------------------------------------

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`[Earthquake] USGS HTTP ${response.status}`);
    }

    const data = await response.json();

    console.log("[Earthquake] USGS feature count:", data.features?.length ?? 0);

    // -----------------------------------------------------
    // NO EARTHQUAKE
    // -----------------------------------------------------

    if (!data.features || data.features.length === 0) {
      console.log("[Earthquake] No earthquakes found.");

      // Cache the empty result too.
      // This prevents repeatedly asking USGS
      // when there are no events.

      localStorage.setItem(
        this.cacheKey,

        JSON.stringify({
          timestamp: Date.now(),

          latitude: this.latitude,

          longitude: this.longitude,

          earthquake: null,
        }),
      );

      this.lastData = null;

      return null;
    }

    // -----------------------------------------------------
    // GET MOST RECENT
    // -----------------------------------------------------

    const earthquake = data.features[0];

    // -----------------------------------------------------
    // CACHE
    // -----------------------------------------------------

    localStorage.setItem(
      this.cacheKey,

      JSON.stringify({
        timestamp: Date.now(),

        latitude: this.latitude,

        longitude: this.longitude,

        earthquake: earthquake,
      }),
    );

    this.lastData = earthquake;

    console.log("[Earthquake] New data:", earthquake);

    return earthquake;
  }

  // ---------------------------------------------------------
  // GET FRIENDLY DATA
  // ---------------------------------------------------------

  async getLatest() {
    const earthquake = await this.fetchEarthquake();

    // -----------------------------------------------------
    // NO DATA
    // -----------------------------------------------------

    if (!earthquake) {
      return null;
    }

    const properties = earthquake.properties;

    const coordinates = earthquake.geometry.coordinates;

    return {
      id: earthquake.id,

      magnitude: properties.mag,

      place: properties.place,

      time: properties.time,

      depth: coordinates[2],

      longitude: coordinates[0],

      latitude: coordinates[1],

      tsunami: properties.tsunami,

      url: properties.url,
    };
  }

  // ---------------------------------------------------------
  // CLEAR CACHE
  // ---------------------------------------------------------

  clearCache() {
    localStorage.removeItem(this.cacheKey);

    this.lastData = null;

    console.log("[Earthquake] Cache cleared.");
  }
}

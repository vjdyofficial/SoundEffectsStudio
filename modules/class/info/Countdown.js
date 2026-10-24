class EventCountdownModule {
  constructor() {
    this.storageKey = "vjdyfm_event_scheduler";
    this.today = new Date();
    this.currentEvent = null;
  }

  // ---------------------------------------------------------
  // DATE HELPERS
  // ---------------------------------------------------------

  getToday() {
    const now = new Date();

    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    };
  }

  createDate(year, month, day) {
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  daysBetween(date1, date2) {
    const oneDay = 24 * 60 * 60 * 1000;

    return Math.ceil((date2 - date1) / oneDay);
  }

  // ---------------------------------------------------------
  // CHRISTMAS
  // ---------------------------------------------------------

  getChristmasDate(year) {
    return this.createDate(year, 12, 25);
  }

  getNextChristmas() {
    const today = this.createDate(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      new Date().getDate(),
    );

    let christmas = this.getChristmasDate(today.getFullYear());

    if (today > christmas) {
      christmas = this.getChristmasDate(today.getFullYear() + 1);
    }

    return christmas;
  }

  // ---------------------------------------------------------
  // NEW YEAR
  // ---------------------------------------------------------

  getNextNewYear() {
    const year = new Date().getFullYear();

    const today = this.createDate(
      year,
      new Date().getMonth() + 1,
      new Date().getDate(),
    );

    let newYear = this.createDate(year + 1, 1, 1);

    // Before New Year of current year
    if (today < this.createDate(year, 1, 1)) {
      newYear = this.createDate(year, 1, 1);
    }

    return newYear;
  }

  // ---------------------------------------------------------
  // CUSTOM EVENTS
  // ---------------------------------------------------------

  getCustomEvents() {
    try {
      const raw = localStorage.getItem(this.storageKey);

      if (!raw) {
        return [];
      }

      const events = JSON.parse(raw);

      if (!Array.isArray(events)) {
        return [];
      }

      return events;
    } catch (error) {
      console.error("[EventCountdown] Failed to load events:", error);

      return [];
    }
  }

  getNextCustomEvent() {
    const events = this.getCustomEvents();

    if (!events.length) {
      return null;
    }

    const now = new Date();

    const currentYear = now.getFullYear();

    let closest = null;

    for (const event of events) {
      if (!event.month || !event.day) {
        continue;
      }

      let eventDate = this.createDate(
        currentYear,
        Number(event.month),
        Number(event.day),
      );

      // If this year's event already passed,
      // use next year's occurrence.
      if (
        eventDate <
        this.createDate(currentYear, now.getMonth() + 1, now.getDate())
      ) {
        eventDate = this.createDate(
          currentYear + 1,
          Number(event.month),
          Number(event.day),
        );
      }

      const days = this.daysBetween(
        this.createDate(currentYear, now.getMonth() + 1, now.getDate()),
        eventDate,
      );

      if (closest === null || days < closest.days) {
        closest = {
          event,
          date: eventDate,
          days,
        };
      }
    }

    return closest;
  }

  // ---------------------------------------------------------
  // TODAY EVENT
  // ---------------------------------------------------------

  getEventHeldToday() {
    const today = this.getToday();

    const events = this.getCustomEvents();

    return (
      events.find((event) => {
        return (
          Number(event.month) === today.month && Number(event.day) === today.day
        );
      }) || null
    );
  }

  // ---------------------------------------------------------
  // MAIN COUNTDOWN
  // ---------------------------------------------------------

  getCountdown() {
    const now = new Date();

    const today = this.getToday();

    // -----------------------------------------------------
    // CHRISTMAS DAY
    // -----------------------------------------------------

    if (today.month === 12 && today.day === 25) {
      this.currentEvent = {
        type: "christmas",
        title: "Christmas Day",
        countdown: 0,
      };

      return this.currentEvent;
    }

    // -----------------------------------------------------
    // NEW YEAR'S DAY
    // -----------------------------------------------------

    if (today.month === 1 && today.day === 1) {
      this.currentEvent = {
        type: "newyear",
        title: "New Year",
        countdown: 0,
      };

      return this.currentEvent;
    }

    // -----------------------------------------------------
    // CUSTOM EVENT TODAY
    // -----------------------------------------------------

    const todayEvent = this.getEventHeldToday();

    if (todayEvent) {
      this.currentEvent = {
        type: "custom",
        title: todayEvent.name || todayEvent.title || "Event Today",
        countdown: 0,
        event: todayEvent,
      };

      return this.currentEvent;
    }

    // -----------------------------------------------------
    // CUSTOM EVENT < 15 DAYS
    // -----------------------------------------------------

    const customEvent = this.getNextCustomEvent();

    if (customEvent && customEvent.days > 0 && customEvent.days < 7) {
      this.currentEvent = {
        type: "custom-countdown",
        title:
          customEvent.event.name || customEvent.event.title || "Upcoming Event",
        countdown: customEvent.days,
        event: customEvent.event,
        date: customEvent.date,
      };

      return this.currentEvent;
    }

    // -----------------------------------------------------
    // CHRISTMAS COUNTDOWN
    // -----------------------------------------------------

    const christmas = this.getNextChristmas();

    const christmasDays = this.daysBetween(
      this.createDate(today.year, today.month, today.day),
      christmas,
    );

    if (christmasDays > 0 && christmasDays <= 100) {
      this.currentEvent = {
        type: "christmas-countdown",
        title: "Christmas",
        countdown: christmasDays,
        date: christmas,
      };

      return this.currentEvent;
    }

    // -----------------------------------------------------
    // NEW YEAR COUNTDOWN
    // -----------------------------------------------------

    const newYear = this.createDate(today.year + 1, 1, 1);

    const newYearDays = this.daysBetween(
      this.createDate(today.year, today.month, today.day),
      newYear,
    );

    this.currentEvent = {
      type: "newyear-countdown",
      title: "New Year",
      countdown: newYearDays,
      date: newYear,
    };

    return this.currentEvent;
  }
}

class EventSchedulerStorage {
  constructor() {
    this.storageKey = "vjdyfm_event_scheduler";
  }

  // ---------------------------------------------------------
  // LOAD
  // ---------------------------------------------------------

  getEvents() {
    try {
      const raw = localStorage.getItem(this.storageKey);

      if (!raw) {
        return [];
      }

      const events = JSON.parse(raw);

      if (!Array.isArray(events)) {
        return [];
      }

      return events;
    } catch (error) {
      console.error("[EventScheduler] Failed to load events:", error);

      return [];
    }
  }

  // ---------------------------------------------------------
  // SAVE ARRAY
  // ---------------------------------------------------------

  saveEvents(events) {
    if (!Array.isArray(events)) {
      console.error("[EventScheduler] events must be an array.");

      return false;
    }

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(events));

      return true;
    } catch (error) {
      console.error("[EventScheduler] Failed to save events:", error);

      return false;
    }
  }

  // ---------------------------------------------------------
  // GENERATE ID
  // ---------------------------------------------------------

  createId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }

  // ---------------------------------------------------------
  // ADD EVENT
  // ---------------------------------------------------------

  saveEvent(event) {
    if (!event || typeof event !== "object") {
      console.error("[EventScheduler] Invalid event.");

      return null;
    }

    const events = this.getEvents();

    const newEvent = {
      id: event.id || this.createId(),

      name: event.name || "Untitled Event",

      month: Number(event.month),

      day: Number(event.day),
    };

    // Optional fields are preserved if supplied.

    if (event.description !== undefined) {
      newEvent.description = event.description;
    }

    if (event.time !== undefined) {
      newEvent.time = event.time;
    }

    if (event.startTime !== undefined) {
      newEvent.startTime = event.startTime;
    }

    if (event.endTime !== undefined) {
      newEvent.endTime = event.endTime;
    }

    events.push(newEvent);

    this.saveEvents(events);

    console.log("[EventScheduler] Event saved:", newEvent);

    return newEvent;
  }

  // ---------------------------------------------------------
  // GET EVENT
  // ---------------------------------------------------------

  getEvent(id) {
    const events = this.getEvents();

    return events.find((event) => String(event.id) === String(id)) || null;
  }

  // ---------------------------------------------------------
  // EDIT EVENT
  // ---------------------------------------------------------

  editEvent(id, changes) {
    const events = this.getEvents();

    const index = events.findIndex((event) => String(event.id) === String(id));

    if (index === -1) {
      console.warn("[EventScheduler] Event not found:", id);

      return null;
    }

    events[index] = {
      ...events[index],
      ...changes,

      id: events[index].id,
    };

    // Normalize recurring date.

    if (changes.month !== undefined) {
      events[index].month = Number(changes.month);
    }

    if (changes.day !== undefined) {
      events[index].day = Number(changes.day);
    }

    this.saveEvents(events);

    console.log("[EventScheduler] Event edited:", events[index]);

    return events[index];
  }

  // ---------------------------------------------------------
  // DELETE EVENT
  // ---------------------------------------------------------

  deleteEvent(id) {
    const events = this.getEvents();

    const index = events.findIndex((event) => String(event.id) === String(id));

    if (index === -1) {
      console.warn("[EventScheduler] Event not found:", id);

      return false;
    }

    const deleted = events.splice(index, 1)[0];

    this.saveEvents(events);

    console.log("[EventScheduler] Event deleted:", deleted);

    return true;
  }

  // ---------------------------------------------------------
  // DELETE ALL
  // ---------------------------------------------------------

  clearEvents() {
    localStorage.removeItem(this.storageKey);

    console.log("[EventScheduler] All events cleared.");
  }
}

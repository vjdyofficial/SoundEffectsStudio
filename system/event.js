const eventScheduler = new EventSchedulerStorage();

let editingEventId = null;
window.SFXSTUDIO_EVENT_DIALOG = document.getElementById("scheduleDialog");

// ---------------------------------------------------------
// ELEMENTS
// ---------------------------------------------------------

const eventNameInput = document.getElementById("eventSchedulerName");
const eventMonthInput = document.getElementById("eventSchedulerMonth");
const eventDayInput = document.getElementById("eventSchedulerDay");
const eventStartTimeInput = document.getElementById("eventSchedulerStartTime");
const eventEndTimeInput = document.getElementById("eventSchedulerEndTime");

const eventDescriptionInput = document.getElementById(
  "eventSchedulerDescription",
);

const eventSaveButton = document.getElementById("eventSchedulerSave");
const eventCancelButton = document.getElementById("eventSchedulerCancel");
const eventTableBody = document.getElementById("eventSchedulerTableBody");

// ---------------------------------------------------------
// RENDER TABLE
// ---------------------------------------------------------

function renderEventScheduler() {
  const events = eventScheduler.getEvents();

  eventTableBody.innerHTML = "";

  events.forEach((event) => {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");

    nameCell.textContent = event.name;

    const dateCell = document.createElement("td");

    dateCell.textContent = `${String(event.month).padStart(2, "0")}/${String(
      event.day,
    ).padStart(2, "0")}`;

    const timeCell = document.createElement("td");

    if (event.startTime || event.endTime) {
      timeCell.textContent = `${event.startTime || "--"} – ${
        event.endTime || "--"
      }`;
    } else {
      timeCell.textContent = "--";
    }

    const descriptionCell = document.createElement("td");
    descriptionCell.textContent = event.description || "--";
    const actionsCell = document.createElement("td");

    // EDIT

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => editEvent(event.id));

    // DELETE

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Remove";
    deleteButton.addEventListener("click", () => deleteEvent(event.id));
    actionsCell.append(editButton, deleteButton);
    row.append(nameCell, dateCell, timeCell, descriptionCell, actionsCell);
    eventTableBody.appendChild(row);
  });
}

// ---------------------------------------------------------
// ADD / SAVE
// ---------------------------------------------------------

eventSaveButton.addEventListener("click", () => {
  const name = eventNameInput.value.trim();
  const month = Number(eventMonthInput.value);
  const day = Number(eventDayInput.value);

  if (!name) {
    alert("Please enter an event name.", "Can't perform this action");

    return;
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    alert("Please enter a valid month.", "Can't perform this action");

    return;
  }

  if (!Number.isInteger(day) || day < 1 || day > 31) {
    alert("Please enter a valid day.", "Can't perform this action");

    return;
  }

  const data = {
    name,
    month,
    day,
    description: eventDescriptionInput.value.trim(),
    startTime: eventStartTimeInput.value,
    endTime: eventEndTimeInput.value,
  };

  // EDIT MODE

  if (editingEventId !== null) {
    eventScheduler.editEvent(editingEventId, data);
    editingEventId = null;
    eventSaveButton.textContent = "Add Event";
  }

  // ADD MODE
  else {
    eventScheduler.saveEvent(data);
  }
  CloseAnimationInit(window.SFXSTUDIO_EVENT_DIALOG);
  clearEventForm();
  renderEventScheduler();
});

// ---------------------------------------------------------
// EDIT
// ---------------------------------------------------------

function editEvent(id) {
  const event = eventScheduler.getEvent(id);

  if (!event) {
    return;
  }

  editingEventId = event.id;
  eventNameInput.value = event.name || "";
  eventMonthInput.value = event.month || "";
  eventDayInput.value = event.day || "";
  eventStartTimeInput.value = event.startTime || "";
  eventEndTimeInput.value = event.endTime || "";
  eventDescriptionInput.value = event.description || "";
  eventSaveButton.textContent = "Save Changes";
  eventNameInput.focus();

  window.SFXSTUDIO_EVENT_DIALOG.show();
  floatingcard3.hidden = true;
}

// ---------------------------------------------------------
// DELETE
// ---------------------------------------------------------

function deleteEvent(id) {
  const event = eventScheduler.getEvent(id);
  if (!event) {
    return;
  }

  choice({
    title: "Confirmation",
    message:
      "Are you sure you want to remove this event? This action cannot be undone.",
    onConfirm: () => {
      eventScheduler.deleteEvent(id);
      if (String(editingEventId) === String(id)) {
        cancelEventEdit();
      }
      renderEventScheduler();
    },
  });
}

// ---------------------------------------------------------
// CANCEL EDIT
// ---------------------------------------------------------

eventCancelButton.addEventListener("click", cancelEventEdit);

function cancelEventEdit() {
  CloseAnimationInit(window.SFXSTUDIO_EVENT_DIALOG);
  editingEventId = null;
  clearEventForm();
  eventSaveButton.textContent = "Add Event";
}

// ---------------------------------------------------------
// CLEAR FORM
// ---------------------------------------------------------

function clearEventForm() {
  eventNameInput.value = "";
  eventMonthInput.value = "";
  eventDayInput.value = "";
  eventStartTimeInput.value = "";
  eventEndTimeInput.value = "";
  eventDescriptionInput.value = "";
}

// ---------------------------------------------------------
// INITIAL LOAD
// ---------------------------------------------------------

renderEventScheduler();

let timerInterval = null;
let elapsedSeconds = 0; // counts seconds

// Convert seconds to mm:ss
function formatTime(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

// Start the timer
function startTimer() {
  document.getElementById("timerDisplay").textContent = formatTime(elapsedSeconds);

  if (timerInterval) return; // prevent multiple intervals
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    document.getElementById("timerDisplay").textContent = formatTime(elapsedSeconds);

    if (elapsedSeconds >= 30 * 60) { // 30 minutes
      stopTimer();
      recorder.stop();
      elapsedSeconds = 0;
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}
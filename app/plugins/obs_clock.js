(() => {
    // month abbreviations for "DD MMM YYYY"
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const $colon = document.getElementById('colon');
    const $hour = document.getElementById('hour');
    const $minute = document.getElementById('minute');
    const $ampm = document.getElementById('ampm');
    const $date = document.getElementById('date');

    // format number with leading zero
    const pad = (n) => n.toString().padStart(2, '0');
    let withcolon = false

    function updateClock() {
        const now = new Date();

        // Hours in 12-hour format with leading zero
        let hours = now.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';

        // convert to 12-hour; keep leading zero for hours like 08
        hours = hours % 12;
        if (hours === 0) hours = 12; // 12 AM / 12 PM
        const hoursStr = pad(hours);

        const mins = pad(now.getMinutes());

        // Time string: "HH:mm" with AM/PM shown in separate element
        if (!withcolon) {
            withcolon = true;
        } else if (withcolon) {
            withcolon = false;
        }

        $hour.textContent = `${hoursStr}`
        $minute.textContent = `${mins}`
        $colon.style.opacity = withcolon ? 1 : 0;
        $ampm.textContent = ampm;

        // Date string: "DD MMM YYYY"
        const day = pad(now.getDate());
        const mon = MONTHS[now.getMonth()];
        const year = now.getFullYear();
        $date.textContent = `${day} ${mon} ${year}`;
    }

    // update immediately, then every second (no heavy work)
    updateClock();
    setInterval(updateClock, 500);
})();

const textElements = document.querySelectorAll(".scroll-text p");

textElements.forEach(el => {
    const parent = el.parentElement;
    if (!parent) return;

    const updateAnimation = () => {
        const parentWidth = parent.clientWidth;
        const childWidth = el.scrollWidth;

        const overflowing = childWidth > parentWidth;

        if (overflowing) {
            el.setAttribute("data-direction", "tv");
            el.style.setProperty("--tv-start", `${parentWidth}px`);

            // compute dynamic duration
            const defaultParent = parentWidth;    // baseline width
            const defaultDuration = 20;   // 10s at 200px

            const ratio = childWidth / defaultParent;
            const newDuration = ratio * defaultDuration;

            el.style.animationDuration = `${newDuration}s`;
        } else {
            el.removeAttribute("data-direction");
            el.style.animationDuration = ""; // reset
        }
    };

    // Initial check
    updateAnimation();

    // Observe parent and child size changes
    const observer = new ResizeObserver(updateAnimation);
    observer.observe(parent);
    observer.observe(el);
});

const visual_channel = new BroadcastChannel('visual_channel');

visual_channel.onmessage = (event) => {
    const data = event.data;
    document.getElementById('obs_clock').style.transform = `translateX(${data.clock ? 0 : -100}%) translateY(${data.ticker ? 2 : 64}px)`;
    document.getElementById('obs_date').style.transform = `translateX(${data.clock ? 0 : 100}%) translateY(${data.ticker ? 2 : 64}px)`;
    document.getElementById('obs_weather').style.transform = 
    `translateX(${data.weather ? 0 : 100}%) ` + 
    `translateY(calc(${data.ticker ? 0 : data.clock ? 0 : 100}%` + 
    ` + ${(data.ticker && data.clock) ? 4 : (data.ticker) ? 112 : data.clock ? 66 : -6}px))`;

    document.getElementById('obs_logo').hidden = !data.logo;

    document.getElementById('obs_ticker').style.transform = `translateY(${data.ticker ? 0 : 100}%)`;

    document.getElementById('tickertext').textContent = data.text;

    latInput = data.latitude;
    lonInput = data.longitude
}

setTimeout(() => {displayWeather()}, 3000)

const control = new BroadcastChannel('control');

control.onmessage = (event) => {
    const data = event.data;
    
    if (data.action == 1009) {
        window.location.reload();
    } else if (data.action == 1012) {
        clearWeatherInfo();
    }
}
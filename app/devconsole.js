(function () {
    const devConsole = document.getElementById("dev-console");

    function appendMessage(type, args) {
        const line = document.createElement("div");
        line.style.whiteSpace = "pre-wrap";
        line.style.margin = "2px 0";

        if (type === "warn") line.classList.add('mns_warning_devconsole');
        if (type === "error") line.classList.add('mns_error_devconsole');
        if (type === "log") line.classList.add('mns_info_devconsole');

        function icon(type) {
            if (type === "warn") return `images/icons-system/warning.svg`;
            if (type === "error") return `images/icons-system/error.svg`;
            if (type === "log") return `images/icons-system/output.svg`;
        }

        function capitalize(str) {
            return str.charAt(0).toUpperCase() + str.slice(1);
        }

        const prefix = document.createElement("p");
        prefix.classList.add('monospace_font_sub');
        prefix.classList.add('mns-text-large');
        prefix.classList.add('mns-font-800');
        prefix.innerHTML = `<span class="mns_alignitems_center"><img alt="debug" src="${icon(type)}" width="24px" class="logo topbar_marginright_btn">${capitalize(type)}</span>`;
        line.appendChild(prefix);

        args.forEach(arg => {
            const span = document.createElement("span");
            span.classList.add('monospace_font_sub');
            span.classList.add('mns-text-medium');

            if (arg instanceof Error) {
                span.textContent = arg.stack || arg.message;
            } else if (typeof arg === "object") {
                try {
                    span.textContent = JSON.stringify(arg, null, 2);
                } catch {
                    span.textContent = String(arg);
                }
            } else {
                span.textContent = String(arg);
            }

            line.appendChild(span);
            line.appendChild(document.createTextNode(""));
        });

        devConsole.appendChild(line);
        devConsole.scrollTop = devConsole.scrollHeight;
    }

    // Hook console methods
    ["log", "warn", "error"].forEach(type => {
        const original = console[type];
        console[type] = function (...args) {
            appendMessage(type, args);
            original.apply(console, args);
        };
    });

    // ✅ Catch uncaught errors from *any* script
    window.addEventListener("error", (event) => {
        appendMessage("error", [
            event.error instanceof Error ? event.error : event.message
        ]);
    });

    // ✅ Catch unhandled Promise rejections
    window.addEventListener("unhandledrejection", (event) => {
        appendMessage("error", [
            event.reason instanceof Error ? event.reason : event.reason
        ]);
    });

    setInterval(() => {
        document.getElementById("dev-console").innerHTML = ""
    }, 300000);
})();
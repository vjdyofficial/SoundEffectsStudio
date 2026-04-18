// keep original console methods
        const originalConsole = {
            log: console.log,
            warn: console.warn,
            error: console.error,
            info: console.info,
        };

        function getCallerLine() {
            const err = new Error();
            const stack = err.stack?.split("\n") || [];

            // stack[0] = Error
            // stack[1] = this function
            // stack[2] = console override
            // stack[3] = actual caller (usually)
            return stack[3]?.trim() || "unknown";
        }

        function sendLog(event, args) {
            ipcRenderer.send("renderer-log", {
                event,
                msg: args.map(a =>
                    typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)
                ).join(" "),
                line: getCallerLine(),
                time: new Date().toISOString()
            });
        }

        // override console methods
        console.log = (...args) => {
            sendLog("log", args);
            originalConsole.log(...args);
        };

        console.warn = (...args) => {
            sendLog("warn", args);
            originalConsole.warn(...args);
        };

        console.error = (...args) => {
            sendLog("error", args);
            originalConsole.error(...args);
        };

        console.info = (...args) => {
            sendLog("info", args);
            originalConsole.info(...args);
        };
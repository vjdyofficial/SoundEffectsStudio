class WindowManager {
    constructor() {
        this.apps = new Map();
    }

    createWindow(windowId, aspectRatio, width, height, title) {
        if (document.getElementById(windowId))
            return;

        const windowDiv = document.createElement("div");
        let windowtitle = title || windowId;
        windowDiv.className = "window-manager-window";
        windowDiv.id = windowId;
        windowDiv.style.position = "fixed";
        windowDiv.style.left = "0px";
        windowDiv.style.top = "32px";

        if (width !== undefined) {
            windowDiv.style.width = typeof width === "number" ? `${width}px` : width;
        }

        if (height !== undefined) {
            windowDiv.style.setProperty("--windowheight", typeof height === "number" ? `${height}px` : height);
        }

        if (aspectRatio !== undefined) {
            windowDiv.style.aspectRatio = typeof aspectRatio === "number"
                ? `${aspectRatio}`
                : aspectRatio;
        }

        windowDiv.innerHTML = `
            <div class="window-manager-titlebar">
                <button class="window-manager-hide" title="Hide Window">
                    <img class="logo-onprimary" src="icons/codicons/eye.svg">
                </button>
                <span>${windowtitle}</span>
                <button class="window-manager-close" title="Close Window">
                    <img class="logo-onprimary" src="icons/codicons/close.svg">
                </button>
            </div>
            <div class="window-manager-content"></div>
        `;

        document.body.appendChild(windowDiv);

        const titlebar = windowDiv.querySelector(".window-manager-titlebar");
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        const safeZoneTop = 32;
        const pxToVw = (px) => (px / window.innerWidth) * 100;

        const onMouseMove = (event) => {
            if (!isDragging)
                return;

            const rect = windowDiv.getBoundingClientRect();
            const maxX = Math.max(0, window.innerWidth - rect.width);
            const maxY = Math.max(safeZoneTop, window.innerHeight - rect.height);

            const moveX = Math.min(maxX, Math.max(0, event.clientX - dragOffsetX));
            const moveY = Math.min(maxY, Math.max(safeZoneTop, event.clientY - dragOffsetY));

            windowDiv.style.left = `${pxToVw(moveX)}vw`;
            windowDiv.style.top = `${pxToVw(moveY)}vw`;
        };

        const onMouseUp = () => {
            if (!isDragging)
                return;

            isDragging = false;
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };

        titlebar.addEventListener("mousedown", (event) => {
            isDragging = true;
            const rect = windowDiv.getBoundingClientRect();
            dragOffsetX = event.clientX - rect.left;
            dragOffsetY = event.clientY - rect.top;
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
            event.preventDefault();
        });

        windowDiv.querySelector(".window-manager-close")
            .addEventListener("click", () => {
                const appId = windowDiv.dataset.app;
                if (appId)
                    this.quitFromWindow(appId);
            });

        windowDiv.querySelector(".window-manager-hide")
            .addEventListener("click", () => {
                windowDiv.dataset.hide = windowDiv.dataset.hide === "true" ? "false" : "true";
            });
    }

    bringToWindow(appId, windowId) {
        const app = document.getElementById(appId);
        const windowDiv = document.getElementById(windowId);

        if (!app || !windowDiv)
            return;

        if (!this.apps.has(appId)) {
            this.apps.set(appId, {
                element: app,
                parent: app.parentNode,
                nextSibling: app.nextSibling
            });
        }

        const content = windowDiv.querySelector(".window-manager-content");
        content.appendChild(app);
        windowDiv.dataset.app = appId;
        windowDiv.style.setProperty("--windowvisible", "flex");
    }

    quitFromWindow(appId) {
        const info = this.apps.get(appId);

        if (!info)
            return;

        const app = info.element;

        if (
            info.nextSibling &&
            info.nextSibling.parentNode === info.parent
        ) {
            info.parent.insertBefore(app, info.nextSibling);
        } else {
            info.parent.appendChild(app);
        }

        const windowDiv = document.querySelector(`[data-app="${appId}"]`);

        if (windowDiv) {
            windowDiv.style.setProperty("--windowvisible", "none");
            windowDiv.dataset.app = "";
        }

        this.onWindowQuit?.(appId);
    }
}
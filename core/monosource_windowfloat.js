class WindowManager {
    constructor() {
        this.apps = new Map();
    }

    registerAppWindow(id) {
        const app = document.getElementById(id);

        if (!app) {
            console.warn(`App '${id}' not found.`);
            return;
        }

        this.apps.set(id, {
            element: app,
            originalParent: app.parentNode,
            originalNextSibling: app.nextSibling,
            currentWindow: null
        });
    }

    bringToWindow(appId, windowId) {
        const appData = this.apps.get(appId);

        if (!appData) {
            console.warn(`App '${appId}' is not registered.`);
            return;
        }

        const window = document.getElementById(windowId);

        if (!window) {
            console.warn(`Window '${windowId}' not found.`);
            return;
        }

        window.appendChild(appData.element);
        appData.currentWindow = windowId;
    }

    quitFromWindow(appId) {
        const appData = this.apps.get(appId);

        if (!appData) return;

        if (
            appData.originalNextSibling &&
            appData.originalNextSibling.parentNode === appData.originalParent
        ) {
            appData.originalParent.insertBefore(
                appData.element,
                appData.originalNextSibling
            );
        } else {
            appData.originalParent.appendChild(appData.element);
        }

        appData.currentWindow = null;
    }

    isInWindow(appId) {
        const appData = this.apps.get(appId);
        return appData ? appData.currentWindow !== null : false;
    }

    getWindow(appId) {
        const appData = this.apps.get(appId);
        return appData ? appData.currentWindow : null;
    }
}


/**
 * Registers a context menu on Alt-menu trigger.
 *
 * @param {Event} ev - Triggering event (click / contextmenu / key event)
 * @param {HTMLElement} element - Element to attach the context menu to
 * @param {ContextMenuItem[]} items - Context menu item definitions
 */

/**
 * @typedef {Object} ContextMenuItem
 * @property {"titlegroup"|"titleholder"|"item"} type
 * @property {string} [label] - Display text
 * @property {Function} [action] - Callback when clicked
 * @property {string} [icon] - Icon name or path
 * @property {string} [icontint] - CSS color or filter
 */

let currentMenuItems = [];
let currentTarget = null;

function registerContextMenu(ev, element, items) {
    ev.preventDefault();
    currentTarget = element;
    showContextMenu(ev.pageX, ev.pageX, ev.pageY, items);
}

function registerContextMenuonButton(ev, element, items) {
    ev.preventDefault();
    currentTarget = element;

    // Get button position and size
    const rect = element.getBoundingClientRect();

    // Calculate center of the button
    const centerX = rect.left + (window.scrollX / 2);
    const centerX2 = rect.left + rect.width + window.scrollX;
    const centerY = rect.top + (rect.height / 2) + (window.scrollY / 2);

    // Show menu in the center of the button
    showContextMenu(centerX, centerX2, centerY, items);
}
function registerContextMenuonAltMenu(ev, element, items) {
    ev.preventDefault();
    hideContextMenuAlt();
    currentTarget = element;

    // Get button position and size
    const rect = element.getBoundingClientRect();

    // Calculate center of the button
    const centerX = rect.left + window.scrollX;
    const centerX2 = rect.left + rect.width + window.scrollX;
    const centerY = rect.top + rect.height + window.scrollY;

    // Show menu in the center of the button
    showContextMenu(centerX, centerX2, centerY, items, true);
}

/**
 * @param {number} x
 * @param {number} x2
 * @param {number} y
 * @param {{ 
 *   label: string,
 *   icon?: string,
 *   disabled?: boolean,
 *   action: Function
 * }[]} items
 * @param {boolean} [disableAnimation=false]
 */

function showContextMenu(x, x2, y, items, disableAnimation) {
    const menu = document.getElementById("globalContextMenu");
    const list = document.getElementById("contextMenuItems");

    // Clear previous items
    list.innerHTML = "";

    const anyIcons = items.some(i => i.icon);
    let directionClass = "anim_smoothright"; // for items

    // Build menu items
    items.forEach((item, index) => {
        if (item.titleholder) {
            const title = document.createElement("p");
            title.className = "context-menu-title";
            title.innerText = item.titleholder;
            list.appendChild(title);
            return;
        }

        if (item.titlegroup) {
            const title = document.createElement("p");
            title.className = "context-menu-title-group";
            title.innerText = item.titlegroup;
            list.appendChild(title);
            return;
        }

        const row = document.createElement("div");
        row.className = "context-menu-item";
        row.style.animationDelay = `${index * 0.025}s`;

        if (item.icon) {
            const icon = document.createElement("img");
            icon.src = item.icon;
            icon.className = "context-menu-icon";
            if (item.icontint) icon.classList.add("logo-onprimary");
            row.appendChild(icon);
        } else {
            const spacer = document.createElement("div");
            spacer.className = "context-menu-icon-spacer";
            row.appendChild(spacer);
        }

        const label = document.createElement("span");
        label.className = "context-menu-label";
        label.innerText = item.label || "";
        row.appendChild(label);

        if (item.type === "checkbox") {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = !!item.checked;
            checkbox.style.pointerEvents = 'none';
            checkbox.className = "monosource_checkbox_small";

            checkbox.addEventListener("click", (e) => {
                e.stopPropagation();
                item.checked = checkbox.checked;
                if (typeof item.onchange === "function") item.onchange(checkbox.checked);
            });

            row.appendChild(checkbox);

            row.addEventListener("click", () => {
                checkbox.checked = !checkbox.checked;
                item.checked = checkbox.checked;
                if (typeof item.onchange === "function") item.onchange(checkbox.checked);
                hideContextMenu();
            });
        } else if (item.type === "radio") {
            const radio = document.createElement("input");
            radio.type = "checkbox";
            radio.checked = !!item.checked;
            radio.style.pointerEvents = 'none';
            radio.className = "monosource_radio_small";

            radio.addEventListener("click", (e) => {
                e.stopPropagation();
                item.checked = radio.checked;
                if (typeof item.onchange === "function") item.onchange(radio.checked);
            });

            row.appendChild(radio);

            row.addEventListener("click", () => {
                radio.checked = !radio.checked;
                item.checked = radio.checked;
                if (typeof item.onchange === "function") item.onchange(radio.checked);
                hideContextMenu();
            });
        } else {
            row.addEventListener("click", () => {
                if (typeof item.action === "function") item.action();
                hideContextMenu();
            });
            const spacer = document.createElement("div");
            spacer.className = "context-menu-checkbox-spacer";
            row.appendChild(spacer);
        }

        list.appendChild(row);
    });

    // Hide icon column if unused
    if (!anyIcons) {
        list.querySelectorAll(".context-menu-icon, .context-menu-icon-spacer")
            .forEach(el => el.style.display = "none");
    }

    // ===== Render offscreen to measure real size =====
    menu.style.display = "block";
    menu.style.visibility = "hidden";

    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    let posX = x;
    let posX2 = x2;
    let posY = y;

    // Horizontal snap
    let horizontalSnap = "right";
    if (x + menuWidth > screenW) {
        posX = x - menuWidth;
        posX2 = x2 - menuWidth;
        horizontalSnap = "left";
    }

    // Vertical snap
    let verticalSnap = "bottom";
    if (y + menuHeight > screenH) {
        posY = y - menuHeight;
        verticalSnap = "top";
    }

    // Keep inside viewport
    posX = Math.max(0, Math.min(posX, screenW - menuWidth));
    posY = Math.max(0, Math.min(posY, screenH - menuHeight));

    let originX = "center";
    let originY = "center";

    // Horizontal
    if (horizontalSnap === "left") originX = "right";
    else if (horizontalSnap === "right") originX = "left";

    // Vertical
    if (verticalSnap === "top") originY = "bottom";
    else if (verticalSnap === "bottom") originY = "top";

    // Apply combined origin
    menu.style.transformOrigin = `${originX} ${originY}`;

    // Apply final position
    if (originX === "right") {
        menu.style.left = posX2 + "px";
    } else if (originX === "left") {
        menu.style.left = posX + "px";
    }

    menu.style.top = posY + "px";
    menu.style.visibility = "visible";

    // Apply item animation classes
    // list.querySelectorAll(".context-menu-item").forEach(el => {
    //    el.classList.remove("anim_smoothleft", "anim_smoothright");
    //    if (originX === "right") {
    //        directionClass = "anim_smoothleft"; // for items
    //    } else if (originX === "left") {
    //        directionClass = "anim_smoothright"; // for items
    //    }

    //    el.classList.add(directionClass);
    //});

    // Show menu with fade + scale
    menu.classList.remove("showopacity");
    void menu.offsetWidth; // force reflow
    menu.classList.add("showopacity");

    document.getElementById("blockArea2").classList.add("enable");
}

function hideContextMenu() {
    const menu = document.getElementById("globalContextMenu");
    menu.classList.remove("showopacity");
    menu.style.display = "none";
    document.getElementById("blockArea2").classList.remove("enable");
    document.getElementById('contextMenuItems').innerHTML = '';
    isonContextMenu = false;
}

function hideContextMenuAlt() {
    const menu = document.getElementById("globalContextMenu");
    menu.classList.remove("showopacity");
    menu.style.display = "none";
    document.getElementById("blockArea2").classList.remove("enable");
    document.getElementById('contextMenuItems').innerHTML = '';
}

document.getElementById("blockArea2").addEventListener("click", hideContextMenu);
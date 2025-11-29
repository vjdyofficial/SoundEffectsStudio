let lines = [];       // compiled text
let avoidTeleprompt = false;
let currentIndex = 0; // active line

// Utility to split raw text into lines/groups
function compileLines(raw) {
    const result = [];
    let buffer = "";
    let insideGroup = false;
    let i = 0;

    while (i < raw.length) {
        // Detect start of group
        if (!insideGroup && raw.slice(i, i + 7) === "group[{") {
            insideGroup = true;
            buffer += "group[{";
            i += 7;
            continue;
        }

        // Detect end of group
        if (insideGroup && raw.slice(i, i + 2) === "}]") {
            buffer += "}]";
            result.push(buffer.trim());
            buffer = "";
            insideGroup = false;
            i += 2;
            continue;
        }

        // Regular character
        const char = raw[i];
        buffer += char;

        // Split by \n only if not inside group
        if (!insideGroup && char === "\n") {
            if (buffer.trim()) result.push(buffer.trim());
            buffer = "";
        }

        i++;
    }

    // Push remaining buffer
    if (buffer.trim()) result.push(buffer.trim());
    return result;
}

// Compile function
document.getElementById("compileBtn").addEventListener("click", () => {
    if (!avoidTeleprompt) {
        const raw = document.getElementById("inputText").value;
        lines = compileLines(raw);
        snackbar('Teleprompter started');
        currentIndex = 0;
        showCurrentLine();
    } else {
        alert(
            "The BBCode contains HTML element which " +
            "is not\nallowed to use here. \n\n" +
            "This might be getting issue with Stroke Effect that \n" +
            "cannot be used in the first layer. Be sure to remove \n" +
            "Stroke Layer and try adding it at the end of the layer in BBCode Designer.",
            "Teleprompt Error!"
        )
    }
});

document.getElementById("stopCompileBtn").addEventListener("click", () => {
    lines = [];
    currentIndex = 0;
    snackbar('Teleprompter stopped');
    document.getElementById('slideIndicator').textContent = "No Slides";
    output.innerHTML = "";
    outputNext.innerHTML = "";
    ipcRenderer.send("teleprompt_output", "");
});

// Navigation
document.getElementById("nextBtn").addEventListener("click", () => {
    if (currentIndex < lines.length - 1) {
        currentIndex++;
        showCurrentLine();
    }
});

document.getElementById("prevBtn").addEventListener("click", () => {
    if (currentIndex > 0) {
        currentIndex--;
        showCurrentLine();
    }
});

function parseBBCode(raw) {
    // Escape all HTML first
    raw = raw.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Line breaks
    raw = raw.replace(/\[br\]/gi, "<br>");
    raw = raw.replace(/\[hr\]/gi, "<hr>");

    // Basic tags
    raw = raw.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, "<strong>$1</strong>");
    raw = raw.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "<em>$1</em>");
    raw = raw.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, "<u>$1</u>");
    raw = raw.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, "<s>$1</s>");
    raw = raw.replace(/\[color=([\s\S]*?)\]([\s\S]*?)\[\/color\]/gi, '<span style="color:$1">$2</span>');
    raw = raw.replace(/\[c=([\s\S]*?)\]([\s\S]*?)\[\/c\]/gi, '<span style="color:$1">$2</span>');
    raw = raw.replace(/\[bg=([\s\S]*?)\]([\s\S]*?)\[\/bg\]/gi, '<span style="background:$1; display:inline-block;">$2</span>');

    raw = raw.replace(/\[bgr=([\s\S]*?)\]([\s\S]*?)\[\/bgr\]/gi,
        (_, value, content) => {
            const [angle, ...colors] = value.split(",").map(s => s.trim());
            const gradientCSS = `linear-gradient(${angle}deg, ${colors.join(", ")})`;
            return `<span style="background:${gradientCSS}; display:inline-block;">${content}</span>`;
        }
    );

    raw = raw.replace(/\[size=([\s\S]*?)\]([\s\S]*?)\[\/size\]/gi,
        (_, factor, content) => {
            factor = parseFloat(factor) || 1;
            return `<span style="font-size:calc(var(--fontsize-to-teleprompt)*${factor}); line-height:calc(var(--fontsize-to-teleprompt)*${factor});">${content}</span>`;
        }
    );

    raw = raw.replace(/\[sz=([\s\S]*?)\]([\s\S]*?)\[\/sz\]/gi,
        (_, factor, content) => {
            factor = parseFloat(factor) || 1;
            return `<span style="font-size:calc(var(--fontsize-to-teleprompt)*${factor}); line-height:calc(var(--fontsize-to-teleprompt)*${factor});">${content}</span>`;
        }
    );

    raw = raw.replace(/\[font=([\s\S]*?)\]([\s\S]*?)\[\/font\]/gi, '<span style="font-family:$1">$2</span>');
    raw = raw.replace(/\[f=([\s\S]*?)\]([\s\S]*?)\[\/f\]/gi, '<span style="font-family:$1">$2</span>');

    // Shadow
    raw = raw.replace(
        /\[sh=([-+]?\d*\.?\d+)\s*,\s*([^,]+)\s*,\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\]([\s\S]*?)\[\/sh\]/gi,
        (_, blur, color, x, y, content) =>
            `<span style="text-shadow:
            calc(var(--fontsize-to-teleprompt) * ${x})
            calc(var(--fontsize-to-teleprompt) * ${y})
            calc(var(--fontsize-to-teleprompt) * ${blur})
            ${color}
        ">${content}</span>`
    );

    // Shadow
    raw = raw.replace(
        /\[shb=([-+]?\d*\.?\d+)\s*,\s*([^,]+)\s*,\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\]([\s\S]*?)\[\/shb\]/gi,
        (_, blur, color, x, y, content) =>
            `<span style="display: inline-block; box-shadow:
            calc(var(--fontsize-to-teleprompt) * ${x})
            calc(var(--fontsize-to-teleprompt) * ${y})
            calc(var(--fontsize-to-teleprompt) * ${blur})
            ${color}
        ">${content}</span>`
    );

    // Blur alias
    raw = raw.replace(/\[bl=([\s\S]*?)\]([\s\S]*?)\[\/bl\]/gi,
        (_, factor, content) => {
            factor = parseFloat(factor) || 0;  // fallback to 1 if factor is invalid
            return `<span style="filter: blur(calc(var(--fontsize-to-teleprompt)*${factor}));">${content}</span>`;
        }
    );

    raw = raw.replace(/\[blur=([\s\S]*?)\]([\s\S]*?)\[\/blur\]/gi,
        (_, factor, content) => {
            factor = parseFloat(factor) || 0;  // fallback to 1 if factor is invalid
            return `<span style="filter: blur(calc(var(--fontsize-to-teleprompt)*${factor}));">${content}</span>`;
        }
    );

    // Gradient text
    raw = raw.replace(/\[gradient=([\s\S]*?)\]([\s\S]*?)\[\/gradient\]/gi,
        (_, value, content) => {
            const [angle, ...colors] = value.split(",").map(s => s.trim());
            const gradientCSS = `linear-gradient(${angle}deg, ${colors.join(", ")})`;
            return `<span style="background:${gradientCSS}; -webkit-background-clip:text; color:transparent !important; display:inline-block;">${content}</span>`;
        }
    );
    raw = raw.replace(/\[g=([\s\S]*?)\]([\s\S]*?)\[\/g\]/gi,
        (_, value, content) => {
            const [angle, ...colors] = value.split(",").map(s => s.trim());
            const gradientCSS = `linear-gradient(${angle}deg, ${colors.join(", ")})`;
            return `<span style="background:${gradientCSS}; -webkit-background-clip:text; color:transparent !important; display:inline-block;">${content}</span>`;
        }
    );

    // Scale X / Y
    raw = raw.replace(/\[x=([\s\S]*?)\]([\s\S]*?)\[\/x\]/gi,
        (_, factor, content) => `<span style="display:inline-block; transform: scaleX(${parseFloat(factor) || 1})">${content}</span>`
    );
    raw = raw.replace(/\[y=([\s\S]*?)\]([\s\S]*?)\[\/y\]/gi,
        (_, factor, content) => `<span style="display:inline-block; transform: scaleY(${parseFloat(factor) || 1})">${content}</span>`
    );

    /* --------------------------
       AXIS HANDLING (wg / wh aliases)
       -------------------------- */

    // 1) Handle wg / wght -> font-weight
    raw = raw.replace(/\[(?:wg|wght)=([+\-]?\d+\.?\d*)\]([\s\S]*?)\[\/(?:wg|wght)\]/gi,
        (_, val, content) => {
            const n = Math.round(Number(val) || 400);
            return `<span style="font-weight:${n}">${content}</span>`;
        }
    );

    // Letter-spacing [ls] as scale (default 0.1)
    raw = raw.replace(/\[ls=([+\-]?\d*\.?\d+)?\]([\s\S]*?)\[\/ls\]/gi,
        (_, val, content) => {
            let scale = parseFloat(val);
            if (!Number.isFinite(scale)) scale = 0.1; // default scale
            return `<span style="letter-spacing:${scale}em !important;">${content}</span>`;
        }
    );

    // 2) Handle wh / wdth -> font-stretch (percent). Accept numeric like 100 or percent string.
    raw = raw.replace(/\[(?:wh|wdth)=([+\-]?\d+\.?\d*%?)\]([\s\S]*?)\[\/(?:wh|wdth)\]/gi,
        (_, rawVal, content) => {
            let out;
            if (String(rawVal).includes("%")) {
                out = rawVal; // use provided percent
            } else {
                // If user gives raw number, convert to percent (e.g. 100 -> 100%)
                const n = Number(rawVal);
                out = Number.isFinite(n) ? `${Math.round(n)}` : "100";
            }
            return `<span style="font-variation-settings: 'wdth' ${out} !important;">${content}</span>`;
        }
    );

    function escapeHTML(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    raw = raw.replace(/\[st=([\w#]+)\s*,\s*([\d.]+(?:-[\d.]+)?)\]([\s\S]*?)\[\/st\]/gi,
        (_, color, factorRange, content) => {

            const safeContent = escapeHTML(content);

            let factor = factorRange.includes('-')
                ? factorRange.split('-')[1]
                : factorRange;

            return `
        <div class="textstroke-wrapper">
            <span class="textstroke" 
                data-text="${safeContent}"
                style="--stroke-color:${color};--stroke-factor:${factor}">
                ${safeContent}
            </span>
        </div>`;
        }
    );

    raw = raw.replace(/\[stb=([\w#]+)\s*,\s*([\d.]+(?:-[\d.]+)?)\]([\s\S]*?)\[\/stb\]/gi,
        (_, color, factorRange, content) => {
            const safeContent = content.replace(/"/g, '&quot;');

            // Extract min/max, use the max if range exists
            let factor = factorRange.includes('-')
                ? factorRange.split('-')[1]
                : factorRange;

            return `<span style="border: calc(var(--fontsize-to-teleprompt) * ${factor}) solid ${color}; display: inline-block;">${safeContent}</span>`;
        }
    );

    // Text alignment: [left], [center], [right]
    raw = raw.replace(/\[(left|center|right)\]([\s\S]*?)\[\/\1\]/gi,
        (_, align, content) => `<div style="text-align:${align}; width:100%">${content}</div>`
    );

    return raw;
}

function parseBBCodeWithGroups(raw, isFinal = false) {
    let animClass = "";
    let animDuration = 1;
    let animDelay = 0;

    // ========= Animation tag outside group =========
    const animMatch = raw.match(/^\{([^}]+)\}\s*/);
    if (animMatch) {
        const parts = animMatch[1].trim().split(/\s+/);

        animClass = parts[0];
        animDuration = parts[1] ? parseFloat(parts[1]) : 1;
        animDelay = parts[2] ? parseFloat(parts[2]) : 0;

        raw = raw.replace(/^\{[^}]+\}\s*/, "");
    }

    // ========= Group block =========
    const groupMatch = raw.match(/^group\[\{([\s\S]*?)\}\]/);
    if (groupMatch) {
        const inner = groupMatch[1].trim();

        // Recursively parse each line inside the group
        const lines = inner.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

        // Pass isFinal = true so inner lines get their animations applied
        const parsedLines = lines.map(line => parseBBCodeWithGroups(line, isFinal == true));

        // Wrap group content
        let groupHtml = `<div class="group">${parsedLines.map(line => `<span class="line">${line}</span>`).join("")}</div>`;

        // Apply outer animation if specified
        if (animClass && isFinal == true) {
            groupHtml = `<div class="animated ${animClass}" style="
                animation-duration: ${animDuration}s !important;
                animation-delay: ${animDelay}s !important;
                animation-fill-mode: both !important;
            ">${groupHtml}</div>`;
        }

        return groupHtml;
    }

    // ========= Normal line =========
    raw = parseBBCode(raw);

    // Wrap normal text with animation if specified
    if (animClass && isFinal == true) {
        return `<div class="animated ${animClass}" style="
            animation-duration: ${animDuration}s !important;
            animation-delay: ${animDelay}s !important;
            animation-fill-mode: both !important;
        ">${raw}</div>`;
    }

    return raw;
}

const output = document.getElementById("output");
const outputNext = document.getElementById("outputNext");

function fixVerticalBBCode(raw) {
    const lines = raw.split(/\r?\n/);
    const result = [];

    let insideBB = false;
    let bbTag = "";
    let buffer = [];

    for (let line of lines) {
        const trimmed = line.trim();

        // Detect opening BBCode only tag
        const open = trimmed.match(/^\[([a-z]+)(=[^\]]+)?\]$/i);
        if (open && !insideBB) {
            insideBB = true;
            bbTag = open[1];
            buffer = [trimmed]; // store opener
            continue;
        }

        // If inside BBCode accumulation
        if (insideBB) {
            buffer.push(trimmed);

            // Detect correct closing tag
            const close = trimmed.match(/^\[\/([a-z]+)\]$/i);
            if (close && close[1].toLowerCase() === bbTag.toLowerCase()) {

                // Merge into single-line BBCode
                const merged = buffer.join("\n");
                const inner = merged
                    .replace(new RegExp(`^\\[${bbTag}[^\\]]*\\]`), "")
                    .replace(new RegExp(`\\[\\/${bbTag}\\]$`), "")
                    .trim();

                result.push(`[${bbTag}]${inner}[/${bbTag}]`);

                insideBB = false;
                bbTag = "";
                buffer = [];
            }

            continue;
        }

        // Normal line
        result.push(line);
    }

    // If something left unclosed
    if (buffer.length > 0) {
        result.push(buffer.join("\n"));
    }

    return result.join("\n");
}

// Display the result
function showCurrentLine() {
    if (lines.length === 0) {
        snackbar('No text compiled to present!');
        document.getElementById('slideIndicator').textContent = "No Slides";
        return;
    }

    const rawLine = lines[currentIndex];
    const rawLineNext = lines[currentIndex + 1];
    const htmlLinePreview = parseBBCodeWithGroups(rawLine.replace("[breakline]", ""), false);

    const htmlLinePreviewNext =
        rawLineNext != undefined ?
            parseBBCodeWithGroups(rawLineNext.replace("[breakline]", ""), false) : "No next slide";

    const htmlLineOutput = parseBBCodeWithGroups(rawLine.replace("[breakline]", ""), true);
    outputNext.innerHTML = htmlLinePreviewNext;
    output.innerHTML = htmlLinePreview;
    ipcRenderer.send("teleprompt_output", htmlLineOutput);
    document.getElementById('slideIndicator').textContent = `${currentIndex + 1} / ${lines.length}`
}

const textarea = document.getElementById("inputText");
const bbcodeprev = document.getElementById("bbcodePreview");
const playanimation = document.getElementById('playanimation');

function containsHTML(text) {
    // detects <tag>, </tag>, <tag/>
    return /<\s*\/?\s*\w+[^>]*>/g.test(text);
}

function updatePreview() {
    const raw = textarea.value;
    const lines = compileLines(raw); // ← SIMPLE ARRAY

    const finalOutput = [];

    for (let i = 0; i < lines.length; i++) {
        const parsed = parseBBCodeWithGroups(lines[i], playanimation.checked);

        finalOutput.push(`
            <span data-index="${i}">${parsed.replace("[breakline]", "")}</span>
        `);
    }

    bbcodeprev.innerHTML = finalOutput.join("<hr>");
    document.getElementById('slideLength').textContent = lines.length

    if (containsHTML(bbcodeprev.textContent)) {
        document.getElementById('warning_bbcode').title =
            "The BBCode contains HTML element which " +
            "is not\nallowed to use here. \n\n" +
            "This might be getting issue with Stroke Effect that \n" +
            "cannot be used in the first layer. Be sure to remove \n" +
            "Stroke Layer and try adding it at the end of the layer.";
        document.getElementById('warning_bbcode').style.visibility = `visible`;
        avoidTeleprompt = true;
    } else {
        document.getElementById('warning_bbcode').style.visibility = `collapse`;
        avoidTeleprompt = false;
    }
}


// Event listeners
textarea.addEventListener("input", updatePreview);
textarea.addEventListener("click", updatePreview);
textarea.addEventListener("select", updatePreview);

// Initial render
updatePreview();

function insertBBCode(tag) {
    const startTag = `[${tag}]`;
    const endTag = `[/${tag}]`;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const text = textarea.value;

    // If user selected something, wrap it
    if (start !== end) {
        textarea.value =
            text.slice(0, start) +
            startTag +
            text.slice(start, end) +
            endTag +
            text.slice(end);

        // Place cursor after the end tag
        textarea.selectionStart = textarea.selectionEnd =
            end + startTag.length + endTag.length;
    } else {
        // No selection → insert empty tags and put cursor inside
        textarea.value =
            text.slice(0, start) +
            startTag + endTag +
            text.slice(start);

        // Cursor goes between tags
        const pos = start + startTag.length;
        textarea.selectionStart = textarea.selectionEnd = pos;
    }

    textarea.focus();
}

function insertBBCodeSpecial(startCode, endCode) {
    const startTag = `${startCode}`;
    const endTag = `${endCode}`;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const text = textarea.value;

    // If user selected something, wrap it
    if (start !== end) {
        textarea.value =
            text.slice(0, start) +
            startTag +
            text.slice(start, end) +
            endTag +
            text.slice(end);

        // Place cursor after the end tag
        textarea.selectionStart = textarea.selectionEnd =
            end + startTag.length + endTag.length;
    } else {
        // No selection → insert empty tags and put cursor inside
        textarea.value =
            text.slice(0, start) +
            startTag + endTag +
            text.slice(start);

        // Cursor goes between tags
        const pos = start + startTag.length;
        textarea.selectionStart = textarea.selectionEnd = pos;
    }

    textarea.focus();
}

function stripSelectedBBCode(textarea, switchCaseNum) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start === end) return;

    let selectedText = textarea.value.slice(start, end);
    let found = false;

    switch (switchCaseNum) {

        case 1: // Basic formatting (b, i, u, s)
            found = /\[\/?(b|i|u|s)\]/gi.test(selectedText);
            selectedText = selectedText.replace(/\[\/?(b|i|u|s)\]/gi, "");
            if (!found) snackbar("No basic BBCode (b, i, u, s) found.");
            break;

        case 2: // Text color / gradient
            found = /\[\/?(color|c|g|gradient)(=[^\]]+)?\]/gi.test(selectedText);
            selectedText = selectedText.replace(/\[\/?(color|c|g|gradient)(=[^\]]+)?\]/gi, "");
            if (!found) snackbar("No text color BBCode found.");
            break;

        case 3: // Font
            found = /\[\/?(font|f)(=[^\]]+)?\]/gi.test(selectedText);
            selectedText = selectedText.replace(/\[\/?(font|f)(=[^\]]+)?\]/gi, "");
            if (!found) snackbar("No font BBCode found.");
            break;

        case 4: // Variable font weight/width
            found = /\[\/?(wg|wh)(=[^\]]+)?\]/gi.test(selectedText);
            selectedText = selectedText.replace(/\[\/?(wg|wh)(=[^\]]+)?\]/gi, "");
            if (!found) snackbar("No font variable BBCode found.");
            break;

        case 5: // Letter spacing
            found = /\[\/?ls(=[^\]]+)?\]/gi.test(selectedText);
            selectedText = selectedText.replace(/\[\/?ls(=[^\]]+)?\]/gi, "");
            if (!found) snackbar("No letter-spacing BBCode found.");
            break;

        case 6: // Scale x,y
            found = /\[\/?(x|y)(=[^\]]+)?\]/gi.test(selectedText);
            selectedText = selectedText.replace(/\[\/?(x|y)(=[^\]]+)?\]/gi, "");
            if (!found) snackbar("No scale BBCode found.");
            break;

        case 7: // Shadow
            found = /\[\/?(sh|shb)(=[^\]]+)?\]/gi.test(selectedText);
            selectedText = selectedText.replace(/\[\/?(sh|shb)(=[^\]]+)?\]/gi, "");
            if (!found) snackbar("No shadow BBCode found.");
            break;

        case 8: // Groups
            found = /group\[\{([\s\S]*?)\}\]/gi.test(selectedText);
            selectedText = selectedText.replace(/group\[\{([\s\S]*?)\}\]/gi, "$1");
            if (!found) snackbar("No groups found.");
            break;

        case 9: // Animation placeholders + [an]
            found = (
                /\[an=[^\]]+\][\s\S]*?\[\/an\]/gi.test(selectedText) ||
                /\{[\w-]+\}/g.test(selectedText)
            );
            selectedText = selectedText
                .replace(/\[an=[^\]]+\][\s\S]*?\[\/an\]/gi, "")
                .replace(/\{[\w-]+\}/g, "");
            if (!found) snackbar("No animation placeholders found.");
            break;

        case 10: // Text alignments
            found = /\[\/?(left|center|right)\]/gi.test(selectedText);
            selectedText = selectedText.replace(/\[\/?(left|center|right)\]/gi, "");
            if (!found) snackbar("No text alignment BBCode found.");
            break;

        case 11: // Background color
            found = /\[\/?(bg|bgr)(=[^\]]+)?\]/gi.test(selectedText);
            selectedText = selectedText.replace(/\[\/?(bg|bgr)(=[^\]]+)?\]/gi, "");
            if (!found) snackbar("No background color BBCode found.");
            break;

        case 12: // Font size
            found = /\[\/?(size|sz)(=[^\]]+)?\]/gi.test(selectedText);
            selectedText = selectedText.replace(/\[\/?(size|sz)(=[^\]]+)?\]/gi, "");
            if (!found) snackbar("No font size BBCode found.");
            break;

        case 13: // Blur
            found = /\[\/?(bl|blur)(=[^\]]+)?\]/gi.test(selectedText);
            selectedText = selectedText.replace(/\[\/?(bl|blur)(=[^\]]+)?\]/gi, "");
            if (!found) snackbar("No blur BBCode found.");
            break;

        case 14: // NEW — Stroke (st)
            found = /\[\/?(st|stb)(=[^\]]+)?\]/gi.test(selectedText);
            selectedText = selectedText.replace(/\[\/?st(=[^\]]+)?\]/gi, "");
            if (!found) snackbar("No stroke BBCode found.");
            break;

        case 15: // NEW — Line breaks / hr
            found = /\[(br|line|ln|one|hr)\]/gi.test(selectedText);
            selectedText = selectedText.replace(/\[(br|line|ln|one|hr)\]/gi, "");
            if (!found) snackbar("No line/HR BBCode found.");
            break;

        default: // Remove everything
            found = true;
            selectedText = selectedText
                .replace(/\[\/?(b|i|u|s)\]/gi, "")
                .replace(/\[\/?(color|c|bg|bgr|gradient|g)(=[^\]]+)?\]/gi, "")
                .replace(/\[\/?(font|f|size|sz)(=[^\]]+)?\]/gi, "")
                .replace(/\[\/?(wg|wh)(=[^\]]+)?\]/gi, "")
                .replace(/\[\/?ls(=[^\]]+)?\]/gi, "")
                .replace(/\[\/?(x|y)(=[^\]]+)?\]/gi, "")
                .replace(/\[\/?(sh|shb)(=[^\]]+)?\]/gi, "")
                .replace(/\[\/?(st|stb)(=[^\]]+)?\]/gi, "")          // NEW
                .replace(/\[(br|line|ln|one|hr)\]/gi, "")      // NEW
                .replace(/group\[\{([\s\S]*?)\}\]/gi, "$1")
                .replace(/\[an=[^\]]+\][\s\S]*?\[\/an\]/gi, "")
                .replace(/\{[\w-]+\}/g, "");
            break;
    }

    const stripped = selectedText.trim();

    textarea.value =
        textarea.value.slice(0, start) +
        stripped +
        textarea.value.slice(end);

    textarea.selectionStart = start;
    textarea.selectionEnd = start + stripped.length;
}

document.getElementById("insertGroup").onclick = () => {
    insertBBCodeSpecial("group[{", "}]");
}

document.getElementById("insertBreakline").onclick = () => {
    insertBBCodeSpecial("[br]", "");
}

document.getElementById("insertHairline").onclick = () => {
    insertBBCodeSpecial("[hr]", "");
}

document.getElementById("insertBreaklinePage").onclick = () => {
    insertBBCodeSpecial("[breakline]", "");
}

document.getElementById("insertColor").onclick = () => {
    const color1 = document.getElementById('colornode').value
    insertBBCodeSpecial(`[c=${color1}]`, "[/c]");
}

document.getElementById("insertBGColor").onclick = () => {
    const color1 = document.getElementById('bgcolornode').value
    insertBBCodeSpecial(`[bg=${color1}]`, "[/bg]");
}

function updateGradientPreview() {
    const angle = document.getElementById('gradientAngle').value
    const color1 = document.getElementById('gradcolor1').value
    const color2 = document.getElementById('gradcolor2').value
    const textarea = document.getElementById("gradientnode");
    document.getElementById('gradientAnglevalue').textContent = angle

    if (textarea.value.trim() === "") {
        document.getElementById('gradientbox').style.background = `linear-gradient(${angle}deg, ${color1}, ${color2})`;
    } else {
        document.getElementById('gradientbox').style.background = `linear-gradient(${angle}deg, ${textarea.value})`;
    }
}

updateGradientPreview();

document.getElementById('gradientAngle').oninput = updateGradientPreview;
document.getElementById('gradcolor1').oninput = updateGradientPreview;
document.getElementById('gradcolor2').oninput = updateGradientPreview;
document.getElementById('gradientnode').oninput = updateGradientPreview;

document.getElementById("insertGradColor").onclick = () => {
    const angle = document.getElementById('gradientAngle').value
    const color1 = document.getElementById('gradcolor1').value
    const color2 = document.getElementById('gradcolor2').value
    const textarea = document.getElementById("gradientnode");

    if (textarea.value.trim() === "") {
        insertBBCodeSpecial(`[g=${Number(angle)},${color1},${color2}]`, "[/g]");
    } else {
        insertBBCodeSpecial(`[g=${Number(angle)},${textarea.value}]`, "[/g]");
    }
}

document.getElementById("insertBGGradColor").onclick = () => {
    const angle = document.getElementById('gradientAngle').value
    const color1 = document.getElementById('gradcolor1').value
    const color2 = document.getElementById('gradcolor2').value
    const textarea = document.getElementById("gradientnode");

    if (textarea.value.trim() === "") {
        insertBBCodeSpecial(`[bgr=${Number(angle)},${color1},${color2}]`, "[/bgr]");
    } else {
        insertBBCodeSpecial(`[bgr=${Number(angle)},${textarea.value}]`, "[/bgr]");
    }
}

ipcRenderer.on('apply-font', (event, fontFamily) => {
    console.log("Apply this font to your text:", fontFamily);
    insertBBCodeSpecial(`[f=${fontFamily}]`, "[/f]");
});

document.getElementById('variablefont_slider').oninput = (e) => {
    const value = Number(e.target.value);
    document.getElementById('variablefont_slidervalue').textContent = value
    document.getElementById('weightpreview').style.fontWeight = value
};

document.getElementById("variablefont_add").onclick = () => {
    const value = document.getElementById('variablefont_slider').value;
    insertBBCodeSpecial(`[wg=${Number(value)}]`, "[/wg]");
}

document.getElementById('fontsize_slider').oninput = (e) => {
    const value = Number(e.target.value).toFixed(2);
    document.getElementById('fontsize_preview').style.fontSize = `calc(32px * ${value})`
    document.getElementById('fontsize_slidervalue').textContent = value
};

document.getElementById("fontsize_add").onclick = () => {
    const value = document.getElementById('fontsize_slider').value;
    insertBBCodeSpecial(`[sz=${Number(value)}]`, "[/sz]");
}

document.getElementById('fontblur_slider').oninput = (e) => {
    const value = Number(e.target.value).toFixed(1);
    document.getElementById('fontblur_preview').style.filter = `blur(calc(14px * ${value}))`;
    document.getElementById('fontblur_slidervalue').textContent = value
};

document.getElementById("fontblur_add").onclick = () => {
    const value = document.getElementById('fontblur_slider').value;
    insertBBCodeSpecial(`[bl=${Number(value)}]`, "[/bl]");
}

document.getElementById('animationSelect').onchange = (e) => {
    document.getElementById('animationpreview').className = ""
    setTimeout(() => {
        document.getElementById('animationpreview').className = e.target.value
    }, 250)
}

document.getElementById('animation_parentadd').onclick = (e) => {
    const select = document.getElementById('animationSelect');
    const value = select.value;
    insertBBCodeSpecial(`{${value}}`, "");
}

document.getElementById('variablefontwidth_slider').oninput = (e) => {
    const value = Number(e.target.value);
    document.getElementById('variablefontwidth_slidervalue').textContent = value
    document.getElementById('widthpreview').style.fontVariationSettings = `"wdth" ${value}`;
};

document.getElementById("variablefontwidth_add").onclick = () => {
    const value = document.getElementById('variablefontwidth_slider').value;
    insertBBCodeSpecial(`[wh=${Number(value)}]`, "[/wh]");
}

document.getElementById('save_bbcode').addEventListener('click', () => {
    const content = textarea.value;
    ipcRenderer.invoke('save-bbcode-file', content);
});

document.getElementById('open_bbcode').addEventListener('click', async () => {
    const content = await ipcRenderer.invoke('open-bbcode-file');
    if (content !== null) {
        document.getElementById('inputText').value = content;
        updatePreview();
    }
});

function shadowpreview() {
    const x = document.getElementById('shadow_x_slider').value;
    const y = document.getElementById('shadow_y_slider').value;
    const blur = document.getElementById('shadow_blur_slider').value;
    const decimal = document.getElementById('shadow_decimal_slider').value;
    const color = document.getElementById('shadow_color').value;

    document.getElementById('shadow_x_value').textContent = x;
    document.getElementById('shadow_y_value').textContent = y;
    document.getElementById('shadow_decimal_value').textContent = decimal;
    document.getElementById('shadow_blur_value').textContent = blur;

    const preview = document.getElementById('shadowpreview');
    preview.style.boxShadow = `
        calc(var(--fontsize-to-teleprompt) * ${x}) 
        calc(var(--fontsize-to-teleprompt) * ${y}) 
        calc(var(--fontsize-to-teleprompt) * ${blur}) 
        ${color}${decimalToHexAlpha(decimal)}
    `;
}

// Attach input events
document.getElementById('shadow_x_slider').oninput = shadowpreview;
document.getElementById('shadow_y_slider').oninput = shadowpreview;
document.getElementById('shadow_blur_slider').oninput = shadowpreview;
document.getElementById('shadow_decimal_slider').oninput = shadowpreview;
document.getElementById('shadow_color').oninput = shadowpreview;

shadowpreview();

document.getElementById("shadow_add").onclick = () => {
    const x = document.getElementById('shadow_x_slider').value;
    const y = document.getElementById('shadow_y_slider').value;
    const blur = document.getElementById('shadow_blur_slider').value;
    const decimal = document.getElementById('shadow_decimal_slider').value;
    const color = document.getElementById('shadow_color').value;

    document.getElementById('shadow_x_value').textContent = x;
    document.getElementById('shadow_y_value').textContent = y;
    document.getElementById('shadow_decimal_value').textContent = decimal;
    document.getElementById('shadow_blur_value').textContent = blur;

    insertBBCodeSpecial(`[sh=${blur}, ${color}${decimalToHexAlpha(decimal)}, ${x}, ${y}]`, "[/sh]");
}

document.getElementById("shadowbox_add").onclick = () => {
    const x = document.getElementById('shadow_x_slider').value;
    const y = document.getElementById('shadow_y_slider').value;
    const blur = document.getElementById('shadow_blur_slider').value;
    const decimal = document.getElementById('shadow_decimal_slider').value;
    const color = document.getElementById('shadow_color').value;

    document.getElementById('shadow_x_value').textContent = x;
    document.getElementById('shadow_y_value').textContent = y;
    document.getElementById('shadow_decimal_value').textContent = decimal;
    document.getElementById('shadow_blur_value').textContent = blur;

    insertBBCodeSpecial(`[shb=${blur}, ${color}${decimalToHexAlpha(decimal)}, ${x}, ${y}]`, "[/shb]");
}

function strokepreview() {
    const value = document.getElementById('strokeslider').value;
    const color = document.getElementById('strokecolor').value;
    document.getElementById('stroketextvalue').textContent = Number(value).toFixed(2);
    const el = document.getElementById('textstrokebox');
    el.style.setProperty('--stroke-color', color);
    el.style.setProperty('--stroke-factor', value);
}

document.getElementById('strokeslider').oninput = strokepreview;
document.getElementById('strokecolor').oninput = strokepreview;

document.getElementById("strokeadd").onclick = () => {
    const value = document.getElementById('strokeslider').value;
    const color = document.getElementById('strokecolor').value;
    insertBBCodeSpecial(`[st=${color}, ${value}]`, "[/st]");
}

document.getElementById("strokeboxadd").onclick = () => {
    const value = document.getElementById('strokeslider').value;
    const color = document.getElementById('strokecolor').value;
    insertBBCodeSpecial(`[stb=${color}, ${value}]`, "[/stb]");
}

strokepreview();

document.getElementById('xscale_slider').oninput = (e) => {
    const value = Number(e.target.value).toFixed(2);
    document.getElementById('xscale_preview').style.transform = `scaleX(${value})`;
    document.getElementById('xscale_slidervalue').textContent = value;
};

document.getElementById("xscale_add").onclick = () => {
    const value = document.getElementById('xscale_slider').value;
    insertBBCodeSpecial(`[x=${Number(value)}]`, "[/x]");
}

document.getElementById('yscale_slider').oninput = (e) => {
    const value = Number(e.target.value).toFixed(2);
    document.getElementById('yscale_preview').style.transform = `scaleY(${value})`;
    document.getElementById('yscale_slidervalue').textContent = value;
};

document.getElementById("yscale_add").onclick = () => {
    const value = document.getElementById('yscale_slider').value;
    insertBBCodeSpecial(`[y=${Number(value)}]`, "[/y]");
}

document.getElementById('lspacing_slider').oninput = (e) => {
    const value = Number(e.target.value).toFixed(2);
    document.getElementById('lspacing_preview').style.letterSpacing = `${value}em`
    document.getElementById('lspacing_slidervalue').textContent = value;
};

document.getElementById("lspacing_add").onclick = () => {
    const value = document.getElementById('lspacing_slider').value;
    insertBBCodeSpecial(`[ls=${Number(value)}]`, "[/ls]");
}
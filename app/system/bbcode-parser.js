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

    raw = raw.replace(/\[an=([\w-]+)(?:\s+([\d.]+)\s+([\d.]+))?\]([\s\S]*?)\[\/an\]/g,
        (match, animName, duration, delay, content) => {

            // defaults
            const d = duration ? `${duration}s` : "1s";
            const dy = delay ? `${delay}s` : "0s";

            return `<div class="textanimation-container" data-clip="${isAnimHasClip(animName)}"><div class="animated textanimation_${animName}" style="
                animation-duration: ${d} !important;
                animation-delay: ${dy} !important;
                animation-fill-mode: both !important; display: inline-block;">${content}</div></div>`;
        }
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
            groupHtml = `<div class="textanimation-container" data-clip="${isAnimHasClip(animClass)}"><div class="animated textanimation_${animClass}" style="
                animation-duration: ${animDuration}s !important;
                animation-delay: ${animDelay}s !important;
                animation-fill-mode: both !important;
            ">${groupHtml}</div></div>`;
        }

        return groupHtml;
    }

    // ========= Normal line =========
    raw = parseBBCode(raw);

    // Wrap normal text with animation if specified
    if (animClass && isFinal == true) {
        return `<div class="textanimation-container" data-clip="${isAnimHasClip(animClass)}"><div class="animated textanimation_${animClass}" style="
            animation-duration: ${animDuration}s !important;
            animation-delay: ${animDelay}s !important;
            animation-fill-mode: both !important;
        ">${raw}</div></div>`;
    }

    return raw;
}

function isAnimHasClip(classString) {
    if (!classString || typeof classString !== 'string') return false;

    // List all “clip/insert/push” animation names
    const clipAnimations = [
        'dirinsertup',
        'dirinsertright',
        'dirinsertdown',
        'dirinsertleft',
        'dirpushup',
        'dirpushright',
        'dirpushdown',
        'dirpushleft'
    ];

    // Check if the string contains any of these
    return clipAnimations.some(name => classString.includes(name));
}
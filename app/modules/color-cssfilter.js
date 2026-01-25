// cssFilterSolver.js (CommonJS)

/* ---------- Utility functions ---------- */

function expandHex(hex) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    return hex.replace(shorthandRegex, (_, r, g, b) =>
        r + r + g + g + b + b
    );
}

function rgbToHex(r, g, b) {
    const toHex = (c) => {
        const h = c.toString(16);
        return h.length === 1 ? "0" + h : h;
    };
    return "#" + toHex(r) + toHex(g) + toHex(b);
}

function hexToRgbColor(hex) {
    const expanded = expandHex(hex);
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(expanded);
    return match
        ? [
            parseInt(match[1], 16),
            parseInt(match[2], 16),
            parseInt(match[3], 16),
        ]
        : null;
}

/* ---------- Color class ---------- */

class Color {
    constructor(r, g, b) {
        this.set(r, g, b);
    }

    clamp(v) {
        return Math.max(0, Math.min(255, v));
    }

    set(r, g, b) {
        this.r = this.clamp(r);
        this.g = this.clamp(g);
        this.b = this.clamp(b);
    }

    toRgb() {
        return `rgb(${Math.round(this.r)}, ${Math.round(this.g)}, ${Math.round(
            this.b
        )})`;
    }

    toHex() {
        return rgbToHex(
            Math.round(this.r),
            Math.round(this.g),
            Math.round(this.b)
        );
    }

    multiply(m) {
        const r =
            this.r * m[0] + this.g * m[1] + this.b * m[2];
        const g =
            this.r * m[3] + this.g * m[4] + this.b * m[5];
        const b =
            this.r * m[6] + this.g * m[7] + this.b * m[8];
        this.set(r, g, b);
    }

    invert(v = 1) {
        this.r = this.clamp((v + (this.r / 255) * (1 - 2 * v)) * 255);
        this.g = this.clamp((v + (this.g / 255) * (1 - 2 * v)) * 255);
        this.b = this.clamp((v + (this.b / 255) * (1 - 2 * v)) * 255);
    }

    sepia(v = 1) {
        this.multiply([
            0.393 + 0.607 * (1 - v),
            0.769 - 0.769 * (1 - v),
            0.189 - 0.189 * (1 - v),
            0.349 - 0.349 * (1 - v),
            0.686 + 0.314 * (1 - v),
            0.168 - 0.168 * (1 - v),
            0.272 - 0.272 * (1 - v),
            0.534 - 0.534 * (1 - v),
            0.131 + 0.869 * (1 - v),
        ]);
    }

    saturate(v = 1) {
        this.multiply([
            0.213 + 0.787 * v,
            0.715 - 0.715 * v,
            0.072 - 0.072 * v,
            0.213 - 0.213 * v,
            0.715 + 0.285 * v,
            0.072 - 0.072 * v,
            0.213 - 0.213 * v,
            0.715 - 0.715 * v,
            0.072 + 0.928 * v,
        ]);
    }

    hueRotate(deg) {
        const rad = (deg / 180) * Math.PI;
        const s = Math.sin(rad);
        const c = Math.cos(rad);

        this.multiply([
            0.213 + c * 0.787 - s * 0.213,
            0.715 - c * 0.715 - s * 0.715,
            0.072 - c * 0.072 + s * 0.928,
            0.213 - c * 0.213 + s * 0.143,
            0.715 + c * 0.285 + s * 0.14,
            0.072 - c * 0.072 - s * 0.283,
            0.213 - c * 0.213 - s * 0.787,
            0.715 - c * 0.715 + s * 0.715,
            0.072 + c * 0.928 + s * 0.072,
        ]);
    }

    brightness(v = 1) {
        this.linear(v);
    }

    contrast(v = 1) {
        this.linear(v, -(0.5 * v) + 0.5);
    }

    linear(slope = 1, intercept = 0) {
        this.r = this.clamp(this.r * slope + intercept * 255);
        this.g = this.clamp(this.g * slope + intercept * 255);
        this.b = this.clamp(this.b * slope + intercept * 255);
    }

    hsl() {
        const r = this.r / 255;
        const g = this.g / 255;
        const b = this.b / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s;
        const l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                default:
                    h = (r - g) / d + 4;
            }
            h /= 6;
        }

        return { h: h * 100, s: s * 100, l: l * 100 };
    }
}

/* ---------- Solver ---------- */

class Solver {
    constructor(target) {
        this.target = target;
        this.targetHSL = target.hsl();
        this.reusedColor = new Color(0, 0, 0);
    }

    solve() {
        const result = this.solveNarrow(this.solveWide());
        return {
            values: result.values,
            loss: result.loss,
            css: this.css(result.values),
            raw: this.raw(result.values),
        };
    }

    solveWide() {
        const A = 5;
        const c = 15;
        const a = [60, 180, 18000, 600, 1.2, 1.2];

        let best = { loss: Infinity };
        for (let i = 0; i < 3; i++) {
            const initial = [50, 20, 3750, 50, 100, 100];
            const r = this.spsa(A, a, c, initial, 1000);
            if (r.loss < best.loss) best = r;
        }
        return best;
    }

    solveNarrow(wide) {
        const A = wide.loss;
        const c = 2;
        const A1 = A + 1;
        const a = [
            0.25 * A1,
            0.25 * A1,
            A1,
            0.25 * A1,
            0.2 * A1,
            0.2 * A1,
        ];
        return this.spsa(A, a, c, wide.values, 500);
    }


    spsa(A, a, c, values, iters) {
        const alpha = 1;
        const gamma = 1 / 6;

        let best = values.slice();
        let bestLoss = Infinity;

        const deltas = new Array(6);
        const highArgs = new Array(6);
        const lowArgs = new Array(6);

        for (let k = 0; k < iters; k++) {
            const ck = c / Math.pow(k + 1, gamma);

            for (let i = 0; i < 6; i++) {
                deltas[i] = Math.random() > 0.5 ? 1 : -1;
                highArgs[i] = values[i] + ck * deltas[i];
                lowArgs[i] = values[i] - ck * deltas[i];
            }

            const lossDiff =
                this.loss(highArgs) - this.loss(lowArgs);

            for (let i = 0; i < 6; i++) {
                const g = (lossDiff / (2 * ck)) * deltas[i];
                const ak = a[i] / Math.pow(A + k + 1, alpha);
                values[i] = fix(values[i] - ak * g, i);
            }

            const loss = this.loss(values);
            if (loss < bestLoss) {
                bestLoss = loss;
                best = values.slice();
            }
        }

        return { values: best, loss: bestLoss };

        function fix(value, idx) {
            let max = 100;
            if (idx === 2) max = 7500;
            if (idx === 4 || idx === 5) max = 200;

            if (idx === 3) {
                value = ((value % max) + max) % max;
            } else {
                value = Math.max(0, Math.min(max, value));
            }
            return value;
        }
    }

    loss(filters) {
        const c = this.reusedColor;
        c.set(0, 0, 0);
        c.invert(filters[0] / 100);
        c.sepia(filters[1] / 100);
        c.saturate(filters[2] / 100);
        c.hueRotate(filters[3] * 3.6);
        c.brightness(filters[4] / 100);
        c.contrast(filters[5] / 100);

        const hsl = c.hsl();
        return (
            Math.abs(c.r - this.target.r) +
            Math.abs(c.g - this.target.g) +
            Math.abs(c.b - this.target.b) +
            Math.abs(hsl.h - this.targetHSL.h) +
            Math.abs(hsl.s - this.targetHSL.s) +
            Math.abs(hsl.l - this.targetHSL.l)
        );
    }

    raw(f) {
        return `brightness(0) saturate(100%) invert(${f[0]}%) sepia(${f[1]}%)
saturate(${f[2]}%) hue-rotate(${f[3] * 3.6}deg)
brightness(${f[4]}%) contrast(${f[5]}%)`;
    }

    css(f) {
        return `${this.raw(f)};`;
    }
}

/* ---------- Exports ---------- */

module.exports = {
    Color,
    Solver,
    hexToRgbColor,
    rgbToHex,
};

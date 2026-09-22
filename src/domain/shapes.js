export const SHAPE_DEFS = {
    event: { w: 170, h: 64, prefix: 'evt', labelKey: 'shape.event', section: 'flow', hotkey: '1', colorVar: '--shape-event' },
    function: { w: 170, h: 64, prefix: 'fnc', labelKey: 'shape.function', section: 'flow', hotkey: '2', colorVar: '--shape-function' },
    and: { w: 54, h: 54, prefix: 'and', labelKey: 'shape.and', section: 'logic', hotkey: '3', colorVar: '--shape-operator' },
    or: { w: 54, h: 54, prefix: 'or', labelKey: 'shape.or', section: 'logic', hotkey: '4', colorVar: '--shape-operator' },
    xor: { w: 54, h: 54, prefix: 'xor', labelKey: 'shape.xor', section: 'logic', hotkey: '5', colorVar: '--shape-operator' },
    vac: { w: 210, h: 70, prefix: 'vac', labelKey: 'shape.vac', section: 'vacd', hotkey: '6', colorVar: '--shape-vac' },
    goal: {
        w: 170, h: 70, prefix: 'goal', labelKey: 'shape.goal', section: 'goals',
        hotkey: '7', colorVar: '--shape-goal', labelCy: 0.62
    },
    org: { w: 170, h: 64, prefix: 'org', labelKey: 'shape.org', section: 'res', hotkey: '8', colorVar: '--shape-org' },
    role: { w: 170, h: 64, prefix: 'role', labelKey: 'shape.role', section: 'res', hotkey: '9', colorVar: '--shape-role' },
    person: { w: 170, h: 64, prefix: 'pers', labelKey: 'shape.person', section: 'res', hotkey: '0', colorVar: '--shape-person' },
};

export const OPERATORS = new Set(['and', 'or', 'xor']);
export const isOperator = (type) => OPERATORS.has(type);
export const ORG_FAMILY = new Set(['org', 'role', 'person']);

export function hexagonPath(w, h) {
    const k = Math.min(h / 2, w * 0.22);
    return `M ${k} 0 H ${w - k} L ${w} ${h / 2} L ${w - k} ${h} H ${k} L 0 ${h / 2} Z`;
}
export function octagonPath(w, h) {
    const c = Math.min(w, h) * 0.3;
    return `M ${c} 0 H ${w - c} L ${w} ${c} V ${h - c} L ${w - c} ${h} H ${c} L 0 ${h - c} V ${c} Z`;
}
export function roundedRectPath(w, h, r = h * 0.28) {
    r = Math.min(r, w / 2, h / 2);
    return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h}
          H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}
export const ellipsePath = (w, h) =>
    `M ${w / 2} 0 A ${w / 2} ${h / 2} 0 1 1 ${w / 2} ${h} A ${w / 2} ${h / 2} 0 1 1 ${w / 2} 0 Z`;

export function chevronPath(w, h, flat = false) {
    const k = Math.min(h * 0.5, w * 0.25);
    return flat
        ? `M 0 0 H ${w - k} L ${w} ${h / 2} L ${w - k} ${h} H 0 Z`
        : `M 0 0 H ${w - k} L ${w} ${h / 2} L ${w - k} ${h} H 0 L ${k} ${h / 2} Z`;
}
export function housePath(w, h) {
    const roof = h * 0.3;
    return `M ${w / 2} 0 L ${w} ${roof} V ${h} H 0 V ${roof} Z`;
}


export const HAS_BAR = new Set(['org', 'role']);
export function barGeom(type, w, h) {
    return type === 'org'
        ? { x: Math.round(w * 0.17), y1: h * 0.18, y2: h * 0.82 }   // эллипс: черта поглубже от края
        : { x: Math.round(w * 0.13), y1: h * 0.15, y2: h * 0.85 };  // скруглённый прямоугольник
}

export function shapePath(type, w, h, opts = {}) {
    switch (type) {
        case 'event': return hexagonPath(w, h);
        case 'function': return roundedRectPath(w, h);
        case 'goal': return housePath(w, h);
        case 'org': return ellipsePath(w, h);
        case 'role':
        case 'person': return roundedRectPath(w, h, 14);
        case 'vac': return chevronPath(w, h, !!opts.flatLeft);
        case 'and': case 'or': case 'xor': return octagonPath(w, h);
        default: return roundedRectPath(w, h, 8);
    }
}
export const OPERATOR_GLYPH = { and: '∧', or: '∨', xor: '⊕' };
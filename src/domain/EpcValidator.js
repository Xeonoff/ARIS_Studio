import { isOperator, ORG_FAMILY } from './shapes.js';

const cls = (type) => (isOperator(type) ? 'op' : type);

/**
 * Матрица допустимых пар для ПОТОКА УПРАВЛЕНИЯ:
 *   Событие → Функция | Оператор | Шаг ЦС
 *   Функция → Событие | Оператор | Цель
 *   Оператор→ Событие | Функция | Оператор
 *   Шаг ЦС  → Шаг ЦС | Событие
 *   Цель    → Цель
 * Орг.типы в поток управления не входят — только ресурсные/иерархические связи.
 */
const CONTROL_MATRIX = {
    event: new Set(['function', 'op', 'vac']),
    function: new Set(['event', 'op', 'goal']),
    op: new Set(['event', 'function', 'op']),
    vac: new Set(['vac', 'event']),
    goal: new Set(['goal']),
    org: new Set(), role: new Set(), person: new Set(),
};

/** Иерархия: оргструктура (орг↔роль↔сотрудник) и дерево функций (фукнция↔функция). */
const HIERARCHY_OK = (s, t) =>
    (ORG_FAMILY.has(s.type) && ORG_FAMILY.has(t.type)) ||
    (s.type === 'function' && t.type === 'function');

export class EpcValidator {
    static canConnect(source, target, kind, existingEdges = []) {
        if (kind === 'hierarchy') {
            return HIERARCHY_OK(source, target)
                ? { ok: true }
                : { ok: false, key: 'val.hierarchyForbidden' };
        }
        if (kind === 'resource') {
            if (!ORG_FAMILY.has(source.type))
                return { ok: false, key: 'val.resourceSource', params: { a: source.label } };
            if (target.type !== 'function' && target.type !== 'vac')
                return { ok: false, key: 'val.resourceTarget', params: { a: target.label } };
            return { ok: true };
        }
        const sc = cls(source.type), tc = cls(target.type);
        if (!CONTROL_MATRIX[sc]?.has(tc))
            return { ok: false, key: 'val.edgeForbidden', params: { a: source.label, b: target.label } };
        if (existingEdges.some((e) => e.source === source.id && e.target === target.id && e.kind === 'control'))
            return { ok: false, key: 'val.edgeForbidden', params: { a: source.label, b: target.label } };
        return { ok: true };
    }

    static validate(doc, i18n = null) {
        const issues = [];
        const push = (level, key, params, targets) =>
            issues.push({ level, key, params, targets, message: i18n ? i18n.t(key, params) : key });

        const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
        const degIn = new Map(), degOut = new Map(), hierDeg = new Map();
        nodes.forEach((_, id) => { degIn.set(id, 0); degOut.set(id, 0); hierDeg.set(id, 0); });

        for (const e of doc.edges.filter((x) => x.kind === 'control')) {
            const s = nodes.get(e.source), t = nodes.get(e.target);
            if (!s || !t) continue;
            degOut.set(e.source, degOut.get(e.source) + 1);
            degIn.set(e.target, degIn.get(e.target) + 1);
            if (!CONTROL_MATRIX[cls(s.type)]?.has(cls(t.type)))
                push('error', 'val.edgeForbidden', { a: s.label, b: t.label }, [e.id]);
        }

        for (const e of doc.edges.filter((x) => x.kind === 'hierarchy')) {
            const s = nodes.get(e.source), t = nodes.get(e.target);
            if (!s || !t) continue;
            hierDeg.set(e.source, hierDeg.get(e.source) + 1);
            hierDeg.set(e.target, hierDeg.get(e.target) + 1);
            if (!HIERARCHY_OK(s, t)) push('error', 'val.hierarchyForbidden', {}, [e.id]);
        }

        for (const e of doc.edges.filter((x) => x.kind === 'resource')) {
            const s = nodes.get(e.source), t = nodes.get(e.target);
            if (!s || !t) continue;
            if (!ORG_FAMILY.has(s.type)) push('error', 'val.resourceSource', { a: s.label }, [e.id]);
            if (t.type !== 'function' && t.type !== 'vac') push('error', 'val.resourceTarget', { a: t.label }, [e.id]);
        }

        const SKIP_BOUNDARY = new Set(['event', 'goal', ...ORG_FAMILY]);
        for (const n of doc.nodes) {
            const din = degIn.get(n.id) ?? 0, dout = degOut.get(n.id) ?? 0;
            const res = doc.edges.filter((e) => e.kind === 'resource' && (e.source === n.id || e.target === n.id)).length;
            if (din + dout + res + (hierDeg.get(n.id) ?? 0) === 0) {
                push('warning', 'val.isolated', { a: n.label }, [n.id]);
                continue;
            }
            if (n.type === 'event' && (din > 1 || dout > 1))
                push('error', 'val.eventDegree', { a: n.label, in: din, out: dout }, [n.id]);
            if (n.type === 'function' && (din > 1 || dout > 1))
                push('error', 'val.funcDegree', { a: n.label }, [n.id]);
            if (isOperator(n.type) && din > 1 && dout > 1)
                push('error', 'val.opMixed', { a: n.label }, [n.id]);
            // Границы процесса (только для участников потока управления)
            if (!SKIP_BOUNDARY.has(n.type) && din + dout > 0) {
                if (din === 0 && dout > 0) push('warning', 'val.startEvent', { a: n.label }, [n.id]);
                if (dout === 0 && din > 0) push('warning', 'val.endEvent', { a: n.label }, [n.id]);
            }
        }
        return issues;
    }
}
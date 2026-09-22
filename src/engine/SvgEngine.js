import { GraphEngine } from './GraphEngine.js';
import { shapePath, OPERATOR_GLYPH, isOperator, HAS_BAR, barGeom, SHAPE_DEFS } from '../domain/shapes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRID = 20, SNAP_GUIDE_PX = 7, MIN_Z = 0.2, MAX_Z = 3;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Встроенный адаптер на чистом SVG. Сознательно компактный (~450 LOC):
 * его роль — работать без внешних зависимостей и служить эталоном
 * контракта. Для тяжёлых сцен (1000+ элементов, ортогональная
 * трассировка, миникарта) подключайте JointEngineAdapter.
 */
export class SvgEngine extends GraphEngine {
    #nodes = new Map();           // id -> node data (зеркало сторы для O(1) доступа)
    #edges = new Map();
    #nodeEls = new Map();         // id -> <g>
    #edgeEls = new Map();         // id -> <g>
    #vp = { x: 0, y: 0, z: 1 };
    #palette = null;
    #gridVisible = true;
    #snapping = true;
    #drag = null;                 // активное перетаскивание узла
    #link = null;                 // активное создание связи
    #pan = null;
    #marquee = null;
    #spaceDown = false;
    #measure = document.createElement('canvas').getContext('2d'); // для переноса текста
    #selected = new Set();

    mount(container) {
        container.innerHTML = '';
        const svg = this.svg = this.#el('svg', { class: 'engine-svg' });
        svg.innerHTML = `
      <defs>
        <pattern id="gridMinor" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse">
          <path d="M ${GRID} 0 H 0 V ${GRID}" fill="none" stroke="var(--grid-minor)" stroke-width="1"/>
        </pattern>
        <pattern id="gridMajor" width="${GRID * 5}" height="${GRID * 5}" patternUnits="userSpaceOnUse">
          <path d="M ${GRID * 5} 0 H 0 V ${GRID * 5}" fill="none" stroke="var(--grid-major)" stroke-width="1"/>
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" fill="var(--edge-control)"/>
        </marker>
        <marker id="arrowRes" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" fill="var(--edge-resource)"/>
        </marker>
        <marker id="arrowBad" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" fill="var(--danger)"/>
        </marker>
      </defs>
      <rect class="gridA" width="200%" height="200%" x="-50%" y="-50%" fill="url(#gridMinor)"/>
      <rect class="gridB" width="200%" height="200%" x="-50%" y="-50%" fill="url(#gridMajor)"/>
      <g class="vp">
        <g class="layer-edges"></g>
        <g class="layer-nodes"></g>
        <g class="layer-fx"></g>
      </g>`;
        container.appendChild(svg);

        this.gVp = svg.querySelector('.vp');
        this.gEdges = svg.querySelector('.layer-edges');
        this.gNodes = svg.querySelector('.layer-nodes');
        this.gFx = svg.querySelector('.layer-fx');
        this.gridA = svg.querySelector('#gridMinor');
        this.gridB = svg.querySelector('#gridMajor');

        this.#bind();
        this.#applyVp();
    }

    /* ── Viewport ── */
    #applyVp() {
        const { x, y, z } = this.#vp;
        this.gVp.setAttribute('transform', `translate(${x} ${y}) scale(${z})`);
        const pt = `translate(${x} ${y}) scale(${z})`;
        this.gridA.setAttribute('patternTransform', pt);
        this.gridB.setAttribute('patternTransform', pt);
        this.emit('viewport', { ...this.#vp });
    }
    screenToWorld(cx, cy) {
        const r = this.svg.getBoundingClientRect();
        return { x: (cx - r.left - this.#vp.x) / this.#vp.z, y: (cy - r.top - this.#vp.y) / this.#vp.z };
    }
    zoomAt(px, py, factor) { // px/py — экранные, относительно svg
        const z = clamp(this.#vp.z * factor, MIN_Z, MAX_Z);
        const k = z / this.#vp.z;
        this.#vp.x = px - (px - this.#vp.x) * k;   // точка под курсором остаётся на месте
        this.#vp.y = py - (py - this.#vp.y) * k;
        this.#vp.z = z;
        this.#applyVp();
    }
    zoomBy(factor) {
        const r = this.svg.getBoundingClientRect();
        this.zoomAt(r.width / 2, r.height / 2, factor);
    }
    setZoom(z) { const r = this.svg.getBoundingClientRect(); this.zoomAt(r.width / 2, r.height / 2, z / this.#vp.z); }
    getZoom() { return this.#vp.z; }

    fitContent() {
        const list = [...this.#nodes.values()];
        if (!list.length) return;
        const x0 = Math.min(...list.map((n) => n.x)) - 60, y0 = Math.min(...list.map((n) => n.y)) - 60;
        const x1 = Math.max(...list.map((n) => n.x + n.w)) + 60, y1 = Math.max(...list.map((n) => n.y + n.h)) + 60;
        const r = this.svg.getBoundingClientRect();
        const z = clamp(Math.min(r.width / (x1 - x0), r.height / (y1 - y0)), MIN_Z, 1.25);
        this.#vp = { z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - (y1 - y0) * z) / 2 - y0 * z };
        this.#applyVp();
    }

    setPalette(p) { this.#palette = p; this.#nodes.forEach((n) => this.#paintNode(n.id)); this.#edges.forEach((e) => this.#paintEdge(e.id)); }
    setGridVisible(v) { this.#gridVisible = v; this.svg.querySelectorAll('.gridA,.gridB').forEach((el) => el.style.display = v ? '' : 'none'); }
    setSnapping(v) { this.#snapping = v; }

    /* ── CRUD узлов ── */
    addNode(n) {
        this.#nodes.set(n.id, { ...n });
        const g = this.#el('g', { class: `node type-${n.id ? n.type : ''}`, 'data-id': n.id, 'data-type': n.type });
        g.innerHTML = `
      <path class="shape"/>
      ${HAS_BAR.has(n.type) ? '<line class="bar" stroke-width="1.6"/>' : ''}
      ${isOperator(n.type) ? `<text class="op-glyph" text-anchor="middle" dominant-baseline="central"
          style="font: 800 ${n.h * 0.42}px var(--font-ui); fill: var(--shape-operator-line); pointer-events:none">${OPERATOR_GLYPH[n.type]}</text>` : ''}
      <text class="label"></text>
      <text class="lock-mark" hidden>🔒</text>
      <g class="port"><circle r="6"/></g>`;
        this.gNodes.appendChild(g);
        this.#nodeEls.set(n.id, g);
        this.#layoutNode(n.id);
        this.#paintNode(n.id);
        this.#edges.forEach((e, eid) => {
            if (e.source === n.id || e.target === n.id) this.#layoutEdge(eid);
        });
    }

    updateNode(id, patch) {
        const n = this.#nodes.get(id);
        if (!n) return;
        Object.assign(n, patch);
        this.#layoutNode(id);
        if ('style' in patch || 'type' in patch) this.#paintNode(id);
        this.#edges.forEach((e, eid) => {
            if (e.source === id || e.target === id) this.#layoutEdge(eid);
        });
    }

    removeNode(id) {
        this.#nodeEls.get(id)?.remove();
        this.#nodeEls.delete(id); this.#nodes.delete(id);
    }

    #layoutNode(id) {
        const n = this.#nodes.get(id), g = this.#nodeEls.get(id);
        const bar = g.querySelector('.bar');
        if (bar) {
            const b = barGeom(n.type, n.w, n.h);
            bar.setAttribute('x1', b.x); bar.setAttribute('x2', b.x);
            bar.setAttribute('y1', b.y1); bar.setAttribute('y2', b.y2);
        }
        g.setAttribute('transform', `translate(${n.x} ${n.y})`);
        g.querySelector('.shape').setAttribute('d', shapePath(n.type, n.w, n.h, n.style ?? {}));
        g.querySelector('.op-glyph')?.setAttribute('transform', `translate(${n.w / 2} ${n.h / 2})`);
        g.querySelector('.port').setAttribute('transform', `translate(${n.w} ${n.h / 2})`);
        const lock = g.querySelector('.lock-mark');
        lock.hidden = !n.locked;
        lock.setAttribute('x', n.w - 14); lock.setAttribute('y', 12);
        g.classList.toggle('locked', !!n.locked);
        g.classList.toggle('grouped', !!n.group);
        this.#renderLabel(n, g.querySelector('.label'));
    }

    #paintNode(id) {
        if (!this.#palette) return;
        const n = this.#nodes.get(id), g = this.#nodeEls.get(id), p = this.#palette.nodes[n.type];
        const shape = g.querySelector('.shape');
        const bar = g.querySelector('.bar');
        if (bar) { bar.setAttribute('stroke', p.ink); bar.setAttribute('opacity', '0.55'); }
        shape.setAttribute('fill', n.style?.fill || p.fill);
        shape.setAttribute('stroke', p.stroke);
        g.querySelector('.label').setAttribute('fill', p.ink);
    }

    /** Перенос подписи по ширине (measureText на скрытом 2D-контексте). */
    #renderLabel(n, textEl) {
        textEl.textContent = '';
        if (isOperator(n.type) || !n.label) return;
        this.#measure.font = '700 12px Manrope, sans-serif';
        const maxW = n.w * (n.type === 'event' || n.type === 'vac' ? 0.62 : 0.82); // у гексагона полезная зона уже
        const words = String(n.label).split(/\s+/), lines = [];
        let line = '';
        for (const w of words) {
            const probe = line ? `${line} ${w}` : w;
            if (this.#measure.measureText(probe).width > maxW && line) { lines.push(line); line = w; }
            else line = probe;
        }
        if (line) lines.push(line);
        const shown = lines.slice(0, 3);
        if (lines.length > 3) shown[2] = shown[2].slice(0, -1) + '…';
        const lh = 14;
        const cy = (SHAPE_DEFS[n.type]?.labelCy ?? 0.5) * n.h - ((shown.length - 1) * lh) / 2;
        shown.forEach((ln, i) => {
            const ts = this.#el('tspan', { x: n.w / 2, y: cy + i * lh, 'dominant-baseline': 'central' });
            ts.textContent = ln;
            textEl.appendChild(ts);
        });
    }

    /* ── CRUD рёбер ── */
    addEdge(e) {
        this.#edges.set(e.id, { ...e });
        const g = this.#el('g', { class: 'edge', 'data-id': e.id });
        g.innerHTML = `<path class="hit"/><path class="line"/><text class="elabel"></text>`;
        this.gEdges.appendChild(g);
        this.#edgeEls.set(e.id, g);
        this.#layoutEdge(e.id);
        this.#paintEdge(e.id);
    }
    updateEdge(id, patch) { Object.assign(this.#edges.get(id) ?? {}, patch); this.#layoutEdge(id); this.#paintEdge(id); }
    removeEdge(id) { this.#edgeEls.get(id)?.remove(); this.#edgeEls.delete(id); this.#edges.delete(id); }

    /** Точка на границе bbox узла по направлению к цели (аппроксимация, достаточная для EPC). */
    #anchor(n, tx, ty) {
        const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
        const dx = tx - cx, dy = ty - cy;
        if (!dx && !dy) return { x: cx, y: cy };
        const s = Math.min((n.w / 2) / Math.abs(dx || 1e-9), (n.h / 2) / Math.abs(dy || 1e-9));
        return { x: cx + dx * s, y: cy + dy * s };
    }

    #layoutEdge(id) {
        const e = this.#edges.get(id), g = this.#edgeEls.get(id);
        const s = this.#nodes.get(e.source), t = this.#nodes.get(e.target);
        if (!s || !t) return;
        const p1 = this.#anchor(s, t.x + t.w / 2, t.y + t.h / 2);
        const p2 = this.#anchor(t, s.x + s.w / 2, s.y + s.h / 2);
        const d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
        g.querySelector('.line').setAttribute('d', d);
        g.querySelector('.hit').setAttribute('d', d);
        const lbl = g.querySelector('.elabel');
        lbl.textContent = e.label || '';
        lbl.setAttribute('x', (p1.x + p2.x) / 2);
        lbl.setAttribute('y', (p1.y + p2.y) / 2 - 6);
    }
    // #paintEdge(id) {
    //     const e = this.#edges.get(id), g = this.#edgeEls.get(id);
    //     g.classList.toggle('kind-resource', e.kind === 'resource');
    //     const color = e.kind === 'resource' ? 'var(--edge-resource)' : 'var(--edge-control)';
    //     g.querySelector('.line').setAttribute('stroke', color);
    //     g.querySelector('.line').setAttribute('marker-end', `url(#${e.kind === 'resource' ? 'arrowRes' : 'arrow'})`);
    // }
    // markEdgeInvalid(id, bad) {
    //     const g = this.#edgeEls.get(id); if (!g) return;
    //     g.classList.toggle('invalid', bad);
    //     g.querySelector('.line').setAttribute('marker-end', `url(#${bad ? 'arrowBad' : this.#edges.get(id).kind === 'resource' ? 'arrowRes' : 'arrow'})`);
    // }

    setSelected(ids) {
        this.#selected = new Set(ids);
        this.svg.querySelectorAll('.selected').forEach((el) => el.classList.remove('selected'));
        ids.forEach((id) => { (this.#nodeEls.get(id) ?? this.#edgeEls.get(id))?.classList.add('selected'); });
    }
    bringToFront(id) { const g = this.#nodeEls.get(id); if (g) this.gNodes.appendChild(g); }
    sendToBack(id) { const g = this.#nodeEls.get(id); if (g) this.gNodes.prepend(g); }
    clear() { this.gNodes.innerHTML = ''; this.gEdges.innerHTML = ''; this.#nodes.clear(); this.#edges.clear(); this.#nodeEls.clear(); this.#edgeEls.clear(); }

    /* ── Интерактив: drag / pan / zoom / link / smart guides ── */
    #bind() {
        const svg = this.svg;

        // Space — временный режим «рука» (панорамирование левой кнопкой)
        window.addEventListener('keydown', (ev) => {
            if (ev.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '')) {
                this.#spaceDown = true; svg.classList.add('space-pan'); ev.preventDefault();
            }
        });
        window.addEventListener('keyup', (ev) => {
            if (ev.code === 'Space') { this.#spaceDown = false; svg.classList.remove('space-pan'); }
        });

        svg.addEventListener('wheel', (ev) => {
            ev.preventDefault();
            const r = svg.getBoundingClientRect();
            this.zoomAt(ev.clientX - r.left, ev.clientY - r.top, ev.deltaY < 0 ? 1.1 : 1 / 1.1);
        }, { passive: false });

        svg.addEventListener('pointerdown', (ev) => {
            // Средняя кнопка или Space+левая — панорамирование
            if (ev.button === 1 || (ev.button === 0 && this.#spaceDown)) {
                ev.preventDefault();
                this.#pan = { sx: ev.clientX, sy: ev.clientY, vx: this.#vp.x, vy: this.#vp.y, moved: false, quiet: true };
                svg.setPointerCapture(ev.pointerId);
                return;
            }
            if (ev.button !== 0) return;

            const port = ev.target.closest('.port');
            const nodeG = ev.target.closest('.node');
            const edgeG = ev.target.closest('.edge');

            if (port && nodeG) { // создание связи — без изменений
                ev.preventDefault();
                const src = nodeG.dataset.id;
                this.#link = { src, temp: this.#el('path', { class: 'temp-link' }) };
                this.gFx.appendChild(this.#link.temp);
                svg.classList.add('linking');
                svg.setPointerCapture(ev.pointerId);
                return;
            }
            if (nodeG) {
                const n = this.#nodes.get(nodeG.dataset.id);
                if (n.locked) { this.emit('select', { ids: [n.id] }); return; }
                ev.preventDefault(); // см. баг 2
                const w = this.screenToWorld(ev.clientX, ev.clientY);

                const alreadySelected = this.#selected.has(n.id);

                // Тащим вместе: всё множественное выделение + группу узла
                const buddies = new Set();
                if (alreadySelected && this.#selected.size > 1) {
                    this.#selected.forEach((id) => buddies.add(id));
                }
                this.#expandGroup(n.id).forEach((id) => buddies.add(id));
                buddies.delete(n.id);

                const members = [];
                buddies.forEach((id) => {
                    const m = this.#nodes.get(id); // ID рёбер здесь отсеются сами
                    if (m && !m.locked) members.push({ id, ox: m.x, oy: m.y });
                });

                this.#drag = {
                    id: n.id, sx: w.x, sy: w.y, ox: n.x, oy: n.y,
                    moved: false, members,
                    idleCollapse: alreadySelected && !ev.shiftKey,
                };

                // Если узел уже в выделении — НЕ схлопываем его на старте перетаскивания
                if (!alreadySelected || ev.shiftKey) {
                    this.emit('select', { ids: this.#expandGroup(n.id), additive: ev.shiftKey });
                }
                svg.setPointerCapture(ev.pointerId);
                return;
            }
            if (edgeG) {
                this.emit('select', { ids: [edgeG.dataset.id], edge: !ev.shiftKey, additive: ev.shiftKey });
                return;
            }

            ev.preventDefault();
            const w = this.screenToWorld(ev.clientX, ev.clientY);
            this.#marquee = {
                x0: w.x, y0: w.y, moved: false, additive: ev.shiftKey, cur: null,
                rect: this.#el('rect', { class: 'marquee' }),
            };
            this.gFx.appendChild(this.#marquee.rect);
            svg.setPointerCapture(ev.pointerId);
        });

        svg.addEventListener('pointermove', (ev) => {
            if ((this.#drag || this.#link || this.#marquee || this.#pan) && ev.buttons === 0) {
                this.#endInteraction(ev);
            }
            const w = this.screenToWorld(ev.clientX, ev.clientY);
            this.emit('pointer', w);

            if (this.#marquee) {
                const m = this.#marquee;
                const x = Math.min(m.x0, w.x), y = Math.min(m.y0, w.y);
                const rw = Math.abs(w.x - m.x0), rh = Math.abs(w.y - m.y0);
                if (rw > 4 / this.#vp.z || rh > 4 / this.#vp.z) m.moved = true;
                m.cur = { x, y, w: rw, h: rh };
                m.rect.setAttribute('x', x); m.rect.setAttribute('y', y);
                m.rect.setAttribute('width', rw); m.rect.setAttribute('height', rh);
                return;
            }

            if (this.#drag) {
                const d = this.#drag, n = this.#nodes.get(d.id);
                let nx = d.ox + (w.x - d.sx), ny = d.oy + (w.y - d.sy);
                const g = this.#smartGuides(d.id, nx, ny);
                nx = g.x; ny = g.y; this.#drawGuides(g);
                if (this.#snapping && !g.snappedX) nx = Math.round(nx / GRID) * GRID;
                if (this.#snapping && !g.snappedY) ny = Math.round(ny / GRID) * GRID;
                if (Math.abs(nx - d.ox) > 1 || Math.abs(ny - d.oy) > 1) d.moved = true;
                n.x = nx; n.y = ny;
                const movedIds = new Set([d.id]);
                this.#layoutNode(d.id);
                if (d.members.length) {
                    const dx = nx - d.ox, dy = ny - d.oy;
                    for (const mem of d.members) {
                        const mn = this.#nodes.get(mem.id);
                        mn.x = mem.ox + dx; mn.y = mem.oy + dy;
                        movedIds.add(mem.id);
                        this.#layoutNode(mem.id);
                    }
                }
                this.#edges.forEach((e, eid) => {
                    if (movedIds.has(e.source) || movedIds.has(e.target)) this.#layoutEdge(eid);
                });
                return;
            }

            if (this.#link) {
                const s = this.#nodes.get(this.#link.src);
                const a = this.#anchor(s, w.x, w.y);
                this.#link.temp.setAttribute('d', `M ${a.x} ${a.y} L ${w.x} ${w.y}`);
                this.svg.querySelectorAll('.link-target').forEach((el) => el.classList.remove('link-target'));
                const hit = this.#nodeAt(w.x, w.y, this.#link.src);
                if (hit) this.#nodeEls.get(hit.id)?.classList.add('link-target');
                return;
            }

            if (this.#pan) {
                const dx = ev.clientX - this.#pan.sx, dy = ev.clientY - this.#pan.sy;
                if (Math.abs(dx) + Math.abs(dy) > 3) { this.#pan.moved = true; svg.classList.add('panning'); }
                this.#vp.x = this.#pan.vx + dx; this.#vp.y = this.#pan.vy + dy;
                this.#applyVp();
            }
        });

        const finish = (ev) => this.#endInteraction(ev);
        svg.addEventListener('pointerup', finish);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', () => this.#endInteraction(null, true));
        window.addEventListener('blur', () => this.#endInteraction(null, true));
    }
    #endInteraction(ev, cancel = false) {
        const svg = this.svg;

        if (this.#marquee) {
            const m = this.#marquee;
            m.rect.remove(); this.#marquee = null;
            if (!cancel) {
                if (m.moved && m.cur) this.#marqueeSelect(m.cur, m.additive);
                else this.emit('blank');
            }
        }

        if (this.#drag) {
            const d = this.#drag; this.#drag = null; this.#drawGuides(null);
            if (!cancel) {
                const n = this.#nodes.get(d.id);
                if (!d.moved && d.idleCollapse) {
                    this.emit('select', { ids: this.#expandGroup(d.id) });
                } else if (d.moved) {
                    const moves = [{ id: d.id, from: { x: d.ox, y: d.oy }, to: { x: n.x, y: n.y } }];
                    for (const mem of d.members) {
                        const mn = this.#nodes.get(mem.id);
                        moves.push({ id: mem.id, from: { x: mem.ox, y: mem.oy }, to: { x: mn.x, y: mn.y } });
                    }
                    this.emit('node:moved', { moves });
                }
            }
        }

        if (this.#link) {
            if (!cancel && ev) {
                const src = this.#link.src;
                const w = this.screenToWorld(ev.clientX, ev.clientY);
                const target = this.#nodeAt(w.x, w.y, src);
                if (target) this.emit('link:create', { source: src, target: target.id });
            }
            this.#link.temp.remove(); this.#link = null;
            svg.classList.remove('linking');
            svg.querySelectorAll('.link-target').forEach((el) => el.classList.remove('link-target'));
        }

        if (this.#pan) {
            const wasClick = !this.#pan.moved && !this.#pan.quiet;
            this.#pan = null;
            svg.classList.remove('panning');
            if (!cancel && wasClick) this.emit('blank');
        }
    }
    #expandGroup(id) {
        const n = this.#nodes.get(id);
        if (!n?.group) return [id];
        return [...this.#nodes.values()].filter((m) => m.group === n.group).map((m) => m.id);
    }
    #nodeAt(x, y, exceptId) {
        return [...this.#nodes.values()].find((n) =>
            n.id !== exceptId && x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) ?? null;
    }
    #marqueeSelect(r, additive) {
        const ids = [];
        const expanded = new Set();
        this.#nodes.forEach((n) => {
            const hit = n.x < r.x + r.w && n.x + n.w > r.x && n.y < r.y + r.h && n.y + n.h > r.y;
            if (hit) this.#expandGroup(n.id).forEach((x) => expanded.add(x));
        });
        ids.push(...expanded);
        this.#edges.forEach((e) => {
            const s = this.#nodes.get(e.source), t = this.#nodes.get(e.target);
            if (!s || !t) return;
            const p1 = this.#anchor(s, t.x + t.w / 2, t.y + t.h / 2);
            const p2 = this.#anchor(t, s.x + s.w / 2, s.y + s.h / 2);
            if (this.#segIntersectsRect(p1.x, p1.y, p2.x, p2.y, r)) ids.push(e.id);
        });
        this.emit('select', { ids, additive });
    }

    #segIntersectsRect(x1, y1, x2, y2, r) {
        const inside = (x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
        if (inside(x1, y1) || inside(x2, y2)) return true;
        let t0 = 0, t1 = 1;
        const dx = x2 - x1, dy = y2 - y1;
        const p = [-dx, dx, -dy, dy];
        const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
        for (let i = 0; i < 4; i++) {
            if (p[i] === 0) { if (q[i] < 0) return false; }
            else {
                const t = q[i] / p[i];
                if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
                else { if (t < t0) return false; if (t < t1) t1 = t; }
            }
        }
        return true;
    }
    /**
     * Smart Guides: выравнивание центра/краёв перетаскиваемого узла
     * по центрам/краям соседей. Возвращает скорректированные x, y.
     * PERF: при >500 узлах заменить полный перебор на квадродерево.
     */
    #smartGuides(id, nx, ny) {
        const me = this.#nodes.get(id), th = SNAP_GUIDE_PX / this.#vp.z;
        const cand = { x: [], y: [] };
        this.#nodes.forEach((o) => {
            if (o.id === id || (me.group && o.group === me.group)) return;
            cand.x.push(o.x, o.x + o.w / 2, o.x + o.w);
            cand.y.push(o.y, o.y + o.h / 2, o.y + o.h);
        });
        const mine = { x: [nx, nx + me.w / 2, nx + me.w], y: [ny, ny + me.h / 2, ny + me.h] };
        let bx = null, by = null, gx = null, gy = null;
        for (const mx of mine.x) for (const cx of cand.x) {
            const d = cx - mx;
            if (Math.abs(d) < th && (bx === null || Math.abs(d) < Math.abs(bx))) { bx = d; gx = cx; }
        }
        for (const my of mine.y) for (const cy of cand.y) {
            const d = cy - my;
            if (Math.abs(d) < th && (by === null || Math.abs(d) < Math.abs(by))) { by = d; gy = cy; }
        }
        return {
            x: bx !== null ? nx + bx : nx, y: by !== null ? ny + by : ny,
            gx, gy, snappedX: bx !== null, snappedY: by !== null,
        };
    }

    #drawGuides(g) {
        this.gFx.querySelectorAll('.guide').forEach((el) => el.remove());
        if (!g) return;
        const r = this.getVisibleWorldRect();
        if (g.gx !== null) this.gFx.appendChild(this.#el('line', { class: 'guide', x1: g.gx, y1: r.y, x2: g.gx, y2: r.y + r.h }));
        if (g.gy !== null) this.gFx.appendChild(this.#el('line', { class: 'guide', x1: r.x, y1: g.gy, x2: r.x + r.w, y2: g.gy }));
    }
    getVisibleWorldRect() {
        const rc = this.svg.getBoundingClientRect();
        return { x: -this.#vp.x / this.#vp.z, y: -this.#vp.y / this.#vp.z, w: rc.width / this.#vp.z, h: rc.height / this.#vp.z };
    }

    #el(tag, attrs = {}) {
        const el = document.createElementNS(SVG_NS, tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        return el;
    }
    #paintEdge(id) {
        const e = this.#edges.get(id), g = this.#edgeEls.get(id);
        g.classList.toggle('kind-resource', e.kind === 'resource');
        const color = e.kind === 'resource' ? 'var(--edge-resource)' : 'var(--edge-control)';
        const line = g.querySelector('.line');
        line.setAttribute('stroke', color);
        line.setAttribute('marker-end',
            e.kind === 'control' ? 'url(#arrow)' : e.kind === 'resource' ? 'url(#arrowRes)' : 'none');
    }

    markEdgeInvalid(id, bad) {
        const e = this.#edges.get(id), g = this.#edgeEls.get(id);
        if (!g) return;
        g.classList.toggle('invalid', bad);
        const line = g.querySelector('.line');
        if (bad) { line.setAttribute('marker-end', e.kind === 'hierarchy' ? 'none' : 'url(#arrowBad)'); return; }
        line.setAttribute('marker-end',
            e.kind === 'control' ? 'url(#arrow)' : e.kind === 'resource' ? 'url(#arrowRes)' : 'none');
    }
}
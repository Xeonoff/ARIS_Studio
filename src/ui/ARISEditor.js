import { SHAPE_DEFS, isOperator, shapePath, ORG_FAMILY, HAS_BAR, barGeom } from '../domain/shapes.js';
import { EpcValidator } from '../domain/EpcValidator.js';
import { Exporter } from '../services/Exporter.js';
import { uid } from '../core/uid.js';


export class ARISEditor {
    constructor({ engine, store, history, i18n, els }) {
        Object.assign(this, { engine, store, history, i18n, els });
        engine.mount(els.canvas);
        this.selection = new Set();
        this.selectedEdge = null;
        this.exporter = new Exporter(store, () => this.palette());
        this.#bridgeStoreToEngine();
        this.#bindEngine();
        this.#bindToolbar();
        this.#buildPalette();
        this.#bindHotkeys();
        this.#scheduleValidation();
    }

    /* ── Палитра из CSS-токенов (перекраска при смене темы) ── */
    palette() {
        const cs = getComputedStyle(document.documentElement);
        const v = (name) => cs.getPropertyValue(name).trim();
        return {
            nodes: {
                event: { fill: v('--shape-event'), stroke: 'rgba(0,0,0,.25)', ink: v('--shape-event-ink') },
                function: { fill: v('--shape-function'), stroke: 'rgba(0,0,0,.25)', ink: v('--shape-function-ink') },
                and: { fill: v('--shape-operator'), stroke: v('--shape-operator-line'), ink: v('--shape-operator-ink') },
                or: { fill: v('--shape-operator'), stroke: v('--shape-operator-line'), ink: v('--shape-operator-ink') },
                xor: { fill: v('--shape-operator'), stroke: v('--shape-operator-line'), ink: v('--shape-operator-ink') },
                org: { fill: v('--shape-org'), stroke: 'rgba(0,0,0,.25)', ink: v('--shape-org-ink') },
                vac: { fill: v('--shape-vac'), stroke: 'rgba(0,0,0,.25)', ink: v('--shape-vac-ink') },
                goal: { fill: v('--shape-goal'), stroke: 'rgba(0,0,0,.25)', ink: v('--shape-goal-ink') },
                role: { fill: v('--shape-role'), stroke: 'rgba(0,0,0,.25)', ink: v('--shape-role-ink') },
                person: { fill: v('--shape-person'), stroke: 'rgba(0,0,0,.25)', ink: v('--shape-person-ink') },
            },
            edgeResource: v('--edge-resource'),
            edge: v('--edge-control'),
            canvasBg: v('--canvas-bg'),
        };
    }

    #bridgeStoreToEngine() {
        const { store, engine } = this;
        store.on('node:add', (n) => engine.addNode(n));
        store.on('node:update', ({ id, patch }) => engine.updateNode(id, patch));
        store.on('node:remove', (id) => engine.removeNode(id));
        store.on('edge:add', (e) => engine.addEdge(e));
        store.on('edge:update', ({ id, patch }) => engine.updateEdge(id, patch));
        store.on('edge:remove', (id) => engine.removeEdge(id));
        store.on('load', (doc) => {
            engine.clear();
            doc.nodes.forEach((n) => engine.addNode(n));
            doc.edges.forEach((e) => engine.addEdge(e));
            engine.fitContent();
            this.select([]);
        });
    }

    #bindEngine() {
        const { engine } = this;
        engine.setPalette(this.palette());

        engine.on('select', ({ ids, edge }) => this.select(ids, { edge, keepInspector: true }));
        engine.on('blank', () => this.select([]));
        engine.on('pointer', ({ x, y }) => { this.els.stPos.textContent = `x: ${Math.round(x)} · y: ${Math.round(y)}`; });
        engine.on('viewport', ({ z }) => { this.els.stZoom.textContent = `${Math.round(z * 100)}%`; });

        engine.on('node:moved', ({ moves }) => {
            const real = moves.filter((m) => m.from.x !== m.to.x || m.from.y !== m.to.y);
            if (!real.length) return;
            this.history.execute({
                do: () => real.forEach((m) => this.store.updateNode(m.id, { x: m.to.x, y: m.to.y })),
                undo: () => real.forEach((m) => this.store.updateNode(m.id, { x: m.from.x, y: m.from.y })),
            });
        });

        engine.on('link:create', ({ source, target }) => {
            const s = this.store.getNode(source), t = this.store.getNode(target);
            const kind =
                (ORG_FAMILY.has(s.type) && ORG_FAMILY.has(t.type)) || (s.type === 'function' && t.type === 'function')
                    ? 'hierarchy'
                    : ORG_FAMILY.has(s.type) ? 'resource'
                        : 'control';
            const verdict = EpcValidator.canConnect(s, t, kind, this.store.doc.edges);
            if (!verdict.ok) {
                this.toast(this.i18n.t('toast.linkBlocked') + ': ' + this.i18n.t(verdict.key, verdict.params ?? {}), 'error');
                return;
            }
            const edge = { id: uid('flw'), source, target, kind, label: '', vertices: [], style: {} };
            this.history.execute({
                do: () => this.store.addEdge(edge),
                undo: () => this.store.removeEdge(edge.id),
            });
        });

        const canvas = this.els.canvas;
        canvas.addEventListener('dragover', (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; });
        canvas.addEventListener('drop', (ev) => {
            ev.preventDefault();
            const type = ev.dataTransfer.getData('application/x-aris-shape');
            if (!type) return;
            const p = engine.screenToWorld(ev.clientX, ev.clientY);
            this.#spawnNode(type, p.x, p.y);
        });
    }

    #spawnNode(type, wx, wy) {
        const def = SHAPE_DEFS[type];
        const node = {
            id: uid(def.prefix), type,
            label: this.i18n.t(def.labelKey),
            description: '',
            x: Math.round((wx - def.w / 2) / 20) * 20,
            y: Math.round((wy - def.h / 2) / 20) * 20,
            w: def.w, h: def.h,
            z: this.store.maxZ() + 1,
            locked: false, group: null, style: {}, attrs: {},
        };
        this.history.execute({
            do: () => this.store.addNode(node),
            undo: () => this.store.removeNode(node.id),
        });
        this.select([node.id]);
    }

    #buildPalette() {
        const box = this.els.palette;
        box.innerHTML = '';
        const sections = {
            flow: 'tbx.sec.flow', logic: 'tbx.sec.logic',
            vacd: 'tbx.sec.vacd', goals: 'tbx.sec.goals', res: 'tbx.sec.res',
        };
        for (const [key, titleKey] of Object.entries(sections)) {
            const h = document.createElement('div');
            h.className = 'palette__section'; h.dataset.i18n = titleKey;
            box.appendChild(h);
            for (const [type, def] of Object.entries(SHAPE_DEFS).filter(([, d]) => d.section === key)) {
                const btn = document.createElement('button');
                btn.className = 'tool-item';
                btn.draggable = true;
                btn.dataset.shape = type;
                btn.innerHTML = `
          <svg class="tool-item__shape" viewBox="0 0 ${def.w} ${def.h}">
            <path d="${shapePath(type, def.w, def.h)}" fill="var(${def.colorVar})"
                  stroke="rgba(0,0,0,.28)" stroke-width="3"/>
                  ${HAS_BAR.has(type) ? (() => {
                        const b = barGeom(type, def.w, def.h);
                        return `<line x1="${b.x}" x2="${b.x}" y1="${b.y1}" y2="${b.y2}"
            stroke="rgba(0,0,0,.45)" stroke-width="3"/>`;
                    })() : ''}
            ${isOperator(type) ? `<text x="${def.w / 2}" y="${def.h / 2}" text-anchor="middle" dominant-baseline="central"
                style="font:800 ${def.h * .5}px var(--font-ui);fill:var(--shape-operator-line)">${{ and: '∧', or: '∨', xor: '⊕' }[type]}</text>` : ''}
          </svg>
          <span class="tool-item__name" data-i18n="${def.labelKey}"></span>
          <kbd>${def.hotkey}</kbd>`;
                btn.addEventListener('dragstart', (ev) =>
                    ev.dataTransfer.setData('application/x-aris-shape', type));
                btn.addEventListener('click', () => { // доступный способ без DnD
                    const r = this.engine.getVisibleWorldRect();
                    this.#spawnNode(type, r.x + r.w / 2 + (Math.random() * 60 - 30), r.y + r.h / 2);
                });
                box.appendChild(btn);
            }
        }
        this.i18n.applyDom(box);
    }

    #bindToolbar() {
        document.addEventListener('click', (ev) => {
            const btn = ev.target.closest('[data-action]');
            if (btn) this.#action(btn.dataset.action);
            const dd = this.els.exportMenu;
            if (!ev.target.closest('#export-dd')) dd.hidden = true;
        });
        this.els.docName.addEventListener('change', () => { this.store.doc.meta.name = this.els.docName.value; });
        document.querySelectorAll('[data-lang]').forEach((b) =>
            b.addEventListener('click', () => this.#setLang(b.dataset.lang)));
        this.history.on('change', (s) => {
            document.querySelector('[data-action="undo"]').disabled = !s.canUndo;
            document.querySelector('[data-action="redo"]').disabled = !s.canRedo;
        });
    }

    #action(name) {
        const E = this.engine, S = this.store, ids = [...this.selection];
        switch (name) {
            case 'undo': this.history.undo(); break;
            case 'redo': this.history.redo(); break;
            case 'zoom:in': E.zoomBy(1.2); break;
            case 'zoom:out': E.zoomBy(1 / 1.2); break;
            case 'zoom:fit': E.fitContent(); break;
            case 'grid:toggle': {
                const btn = document.querySelector('[data-action="grid:toggle"]');
                const on = !btn.classList.contains('is-active');
                btn.classList.toggle('is-active', on);
                E.setGridVisible(on); E.setSnapping(on);
                break;
            }
            case 'theme:toggle': this.#toggleTheme(); break;
            case 'delete': this.deleteSelection(); break;
            case 'group': this.#group(ids); break;
            case 'ungroup': this.#ungroup(ids); break;
            case 'z:front': ids.forEach((id) => { S.updateNode(id, { z: S.maxZ() + 1 }); E.bringToFront(id); }); break;
            case 'z:back': ids.forEach((id) => { S.updateNode(id, { z: 0 }); E.sendToBack(id); }); break;
            case 'validate:toggle': this.els.valDock.hidden = !this.els.valDock.hidden; break;
            case 'export:open': this.els.exportMenu.hidden = !this.els.exportMenu.hidden; break;
            case 'import': this.els.fileInput.click(); break;
            case 'export:json': this.exporter.downloadJSON(); this.toast(this.i18n.t('toast.exported', { fmt: 'JSON' })); break;
            case 'export:svg': this.exporter.downloadSVG(this.store.doc); this.toast(this.i18n.t('toast.exported', { fmt: 'SVG' })); break;
            case 'export:png': this.exporter.downloadPNG(this.store.doc); this.toast(this.i18n.t('toast.exported', { fmt: 'PNG' })); break;
            case 'export:xml': this.exporter.downloadXML(); this.toast(this.i18n.t('toast.exported', { fmt: 'XML' })); break;
        }
    }

    #toggleTheme() {
        const root = document.documentElement;
        root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('aris.theme', root.dataset.theme);
        this.engine.setPalette(this.palette()); // перекраска фигур на лету
    }

    #setLang(lang) {
        this.i18n.setLang(lang);
        document.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('is-active', b.dataset.lang === lang));
        this.i18n.applyDom();
        this.#buildPalette();
        this.#renderInspector();
        this.#runValidation();
    }

    select(ids, { edge = false, additive = false } = {}) {
        if (additive) {
            ids.forEach((id) => this.selection.has(id) ? this.selection.delete(id) : this.selection.add(id));
        } else {
            this.selection = new Set(ids);
        }
        const arr = [...this.selection];
        this.selectedEdge = (edge && arr.length === 1) ? arr[0] : null;
        this.engine.setSelected(arr);
        this.els.stSel.textContent = arr.length ? this.i18n.t('st.selected', { n: arr.length }) : '';
        this.#renderInspector();
    }

    #renderInspector() {
        const body = this.els.insBody;
        const t = (k, v) => this.i18n.t(k, v);
        body.innerHTML = '';

        if (this.selectedEdge) return this.#renderEdgeForm(body);
        const ids = [...this.selection];
        if (!ids.length) {
            body.innerHTML = `<p class="ins-empty">${t('ins.empty').replaceAll('\n', '<br>')}</p>`;
            return;
        }
        if (ids.length > 1) {
            body.innerHTML = `
    <p class="ins-empty">${t('st.selected', { n: ids.length })}</p>
    <div class="ins-actions">
      <button class="btn--ghost" data-action="group">${t('tb.group')}</button>
      <button class="btn--ghost" data-action="ungroup">${t('tb.ungroup')}</button>
      <button class="btn--danger-ghost" data-action="delete">${t('tb.delete')}</button>
    </div>`;
            return;
        }
        const n = this.store.getNode(ids[0]);
        if (!n) return;
        const chipCls = isOperator(n.type) ? 'operator' : n.type;
        body.innerHTML = `
      <div class="ins-idrow"><code class="ins-id">${n.id}</code>
        <span class="chip chip--${chipCls}">${t(SHAPE_DEFS[n.type].labelKey)}</span></div>
      ${this.#field('label', t('ins.label'), 'text', n.label ?? '')}
      <label class="field"><span class="field__label">${t('ins.description')}</span>
        <textarea data-prop="description">${n.description ?? ''}</textarea></label>
        ${n.type === 'vac' ? `
<label class="field field--row">
  <span class="field__label">${t('ins.flatLeft')}</span>
  <span class="switch"><input type="checkbox" data-flat ${n.style?.flatLeft ? 'checked' : ''}><i></span>
</label>` : ''}
      <label class="field field--row"><span class="field__label">${t('ins.lock')}</span>
        <span class="switch"><input type="checkbox" data-prop="locked" ${n.locked ? 'checked' : ''}><i></i></span></label>
      <div class="ins-actions">
        <button class="btn--ghost" data-action="z:front">${t('tb.front')}</button>
        <button class="btn--ghost" data-action="z:back">${t('tb.back')}</button>
        <button class="btn--danger-ghost" data-action="delete">${t('tb.delete')}</button>
      </div>`;

        body.querySelectorAll('[data-prop]').forEach((input) => {
            const prop = input.dataset.prop;
            const get = () => prop === 'locked' ? input.checked : input.value;
            const apply = (v) => this.store.updateNode(n.id, { [prop]: v });
            let before = null;
            input.addEventListener('focus', () => { before = get(); });
            input.addEventListener('input', () => apply(get()));
            input.addEventListener('change', () => {
                const after = get();
                if (after === before) return;
                this.history.execute({ do: () => apply(after), undo: () => apply(before) });
            });
        });
        const flat = body.querySelector('[data-flat]');
        if (flat) {
            flat.addEventListener('change', () => {
                const before = !flat.checked, after = flat.checked;
                const apply = (v) => this.store.updateNode(n.id, { style: { ...n.style, flatLeft: v } });
                this.history.execute({ do: () => apply(after), undo: () => apply(before) });
            });
        }
    }

    #renderEdgeForm(body) {
        const e = this.store.getEdge(this.selectedEdge);
        const t = (k) => this.i18n.t(k);
        body.innerHTML = `
      <div class="ins-idrow"><code class="ins-id">${e.id}</code><span class="chip chip--edge">flow</span></div>
      <label class="field"><span class="field__label">${t('ins.edge.kind')}</span>
        <select data-prop="kind">
  <option value="control"   ${e.kind === 'control' ? 'selected' : ''}>${t('ins.edge.control')}</option>
  <option value="resource"  ${e.kind === 'resource' ? 'selected' : ''}>${t('ins.edge.resource')}</option>
  <option value="hierarchy" ${e.kind === 'hierarchy' ? 'selected' : ''}>${t('ins.edge.hierarchy')}</option>
</select></label>
      ${this.#field('label', t('ins.edge.label'), 'text', e.label ?? '')}
      <button class="btn--danger-ghost" data-action="delete">${t('tb.delete')}</button>`;
        body.querySelectorAll('[data-prop]').forEach((input) => {
            const prop = input.dataset.prop, before = e[prop];
            const apply = (v) => this.store.updateEdge(e.id, { [prop]: v });
            input.addEventListener('change', () => {
                const after = input.value;
                if (after === before) return;
                this.history.execute({ do: () => apply(after), undo: () => apply(before) });
            });
        });
    }
    #field(prop, label, type, value) {
        return `<label class="field"><span class="field__label">${label}</span>
      <input type="${type}" data-prop="${prop}" value="${String(value).replaceAll('"', '&quot;')}"></label>`;
    }

    deleteSelection() {
        const ids = [...this.selection];
        if (!ids.length) return;
        const nodeIds = ids.filter((id) => this.store.getNode(id));
        const touched = new Set(ids.filter((id) => this.store.getEdge(id)));
        nodeIds.forEach((id) => this.store.edgesOf(id).forEach((e) => touched.add(e.id)));
        const edges = [...touched].map((id) => structuredClone(this.store.getEdge(id))).filter(Boolean);
        const nodes = nodeIds.map((id) => structuredClone(this.store.getNode(id)));
        this.history.execute({
            do: () => { edges.forEach((e) => this.store.removeEdge(e.id)); nodes.forEach((n) => this.store.removeNode(n.id)); },
            undo: () => { nodes.forEach((n) => this.store.addNode(n)); edges.forEach((e) => this.store.addEdge(e)); },
        });
        this.select([]);
    }
    #group(ids) {
        if (ids.length < 2) { this.toast(this.i18n.t('toast.groupNeed')); return; }
        const gid = uid('grp');
        const before = ids.map((id) => ({ id, g: this.store.getNode(id)?.group ?? null }));
        this.history.execute({
            do: () => ids.forEach((id) => this.store.updateNode(id, { group: gid })),
            undo: () => before.forEach(({ id, g }) => this.store.updateNode(id, { group: g })),
        });
    }
    #ungroup(ids) {
        const grouped = ids.filter((id) => this.store.getNode(id)?.group);
        if (!grouped.length) { this.toast(this.i18n.t('toast.groupNeed')); return; }
        const before = grouped.map((id) => ({ id, g: this.store.getNode(id).group }));
        this.history.execute({
            do: () => grouped.forEach((id) => this.store.updateNode(id, { group: null })),
            undo: () => before.forEach(({ id, g }) => this.store.updateNode(id, { group: g })),
        });
    }

    /* ── Валидация: дебаунс + подсветка + док ──
       PERF: при больших графах перенести в Web Worker (пакет сериализуется) */
    #scheduleValidation() {
        const run = () => this.#runValidation();
        ['node:add', 'node:remove', 'edge:add', 'edge:remove', 'node:update', 'edge:update', 'load']
            .forEach((evt) => this.store.on(evt, () => {
                clearTimeout(this._vt);
                this._vt = setTimeout(run, 180);
            }));
    }
    #runValidation() {
        const issues = EpcValidator.validate(this.store.doc, this.i18n);
        this.store.doc.edges.forEach((e) => {
            const bad = issues.some((i) => i.targets.includes(e.id));
            this.engine.markEdgeInvalid?.(e.id, bad);
        });
        const errs = issues.filter((i) => i.level === 'error').length;
        this.els.stIssues.hidden = issues.length === 0;
        this.els.stIssues.textContent = issues.length;
        const list = this.els.valList;
        list.innerHTML = '';
        if (!issues.length) {
            list.innerHTML = `<li class="ok">${this.i18n.t('val.ok')}</li>`;
            return;
        }
        issues.forEach((iss) => {
            const li = document.createElement('li');
            li.className = iss.level;
            li.textContent = iss.message;
            li.addEventListener('click', () => this.select(iss.targets));
            list.appendChild(li);
        });
    }

    #bindHotkeys() {
        window.addEventListener('keydown', (ev) => {
            const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '');
            if (typing) return;
            if ((ev.ctrlKey || ev.metaKey) && ev.code === 'KeyZ') { ev.preventDefault(); ev.shiftKey ? this.history.redo() : this.history.undo(); }
            else if ((ev.ctrlKey || ev.metaKey) && ev.code === 'KeyY') { ev.preventDefault(); this.history.redo(); }
            else if (ev.key === 'Delete' || ev.key === 'Backspace') this.deleteSelection();
            else if (ev.key === 'Escape') this.select([]);
            else if (/^[0-9]$/.test(ev.key)) {
                const type = Object.values(SHAPE_DEFS).find((d) => d.hotkey === ev.key);
                if (type) {
                    const r = this.engine.getVisibleWorldRect();
                    const key = Object.keys(SHAPE_DEFS).find((k) => SHAPE_DEFS[k] === type);
                    this.#spawnNode(key, r.x + r.w / 2, r.y + r.h / 2);
                }
            }
        });
    }

    toast(msg, kind = 'info') {
        const el = document.createElement('div');
        el.className = `toast toast--${kind}`;
        el.textContent = msg;
        this.els.toasts.appendChild(el);
        setTimeout(() => el.remove(), 3200);
    }

    importJSON(file) {
        file.text().then((txt) => {
            try {
                this.store.load(JSON.parse(txt));
                this.history.clear();
                this.toast(this.i18n.t('toast.imported'));
            } catch (e) { this.toast(e.message, 'error'); }
        });
    }
}
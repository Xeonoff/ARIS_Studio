import { GraphEngine } from './GraphEngine.js';
import { SHAPE_DEFS, shapePath, OPERATOR_GLYPH, isOperator } from '../domain/shapes.js';

/**
 * Боевой адаптер под JointJS (CDN: joint.js 3.7+ / Rappid).
 * Демонстрирует, как доменные фигуры маппятся на нативные примитивы
 * библиотеки: интерактив, зум/пан и рендер тысяч элементов берёт на себя она.
 */
export class JointEngineAdapter extends GraphEngine {
    mount(container) {
        if (typeof joint === 'undefined') throw new Error('JointJS не загружен');
        JointEngineAdapter.registerShapes(joint);

        this.graph = new joint.dia.Graph();
        this.paper = new joint.dia.Paper({
            el: container, model: this.graph,
            width: '100%', height: '100%',
            gridSize: 20, drawGrid: { name: 'mesh', args: [{ thickness: 1, color: 'rgba(120,140,170,.15)' }] },
            background: { color: 'transparent' },
            interactive: (el) => !el.get('locked'),
            snapLinks: true, linkPinning: false,
            validateConnection: (sv, _sm, tv, _tm, _end, linkView) => {
                const rule = this.connectionRule;
                if (!rule || !tv) return false;
                return rule(sv.model.get('aris'), tv.model.get('aris')).ok;
            },
        });

        this.paper.on('element:pointerdown', (elView) =>
            this.emit('select', { ids: [elView.model.id] }));
        this.paper.on('blank:pointerdown', () => this.emit('blank'));
        this.paper.on('element:pointerup', (elView) => {
            const p = elView.model.position(), prev = elView.model.previous('position') ?? p;
            if (p.x !== prev.x || p.y !== prev.y)
                this.emit('node:moved', { id: elView.model.id, from: prev, to: p });
        });
        this.graph.on('add', (cell) => {
            if (cell.isLink()) this.emit('link:create', {
                source: cell.get('source').id, target: cell.get('target').id,
            });
        });
    }

    static registerShapes(joint) {
        for (const [type, def] of Object.entries(SHAPE_DEFS)) {
            joint.dia.Element.define(
                `aris.${type[0].toUpperCase()}${type.slice(1)}`,
                def.w, def.h,
                {
                    attrs: {
                        body: { refD: shapePath(type, def.w, def.h), strokeWidth: 1.5 },
                        label: {
                            refX: '50%', refY: '50%', textVerticalAnchor: 'middle', textAnchor: 'middle',
                            fontSize: 12, fontWeight: 700
                        }
                    }
                },
                [{ tagName: 'path', selector: 'body' }, { tagName: 'text', selector: 'label' }]
            );
        }
    }

    addNode(n) {
        const Shape = joint.shapes.aris[n.type[0].toUpperCase() + n.type.slice(1)];
        const el = new Shape({ id: n.id });
        el.set('aris', n);
        el.attr('label/text', isOperator(n.type) ? OPERATOR_GLYPH[n.type] : n.label);
        el.position(n.x, n.y).addTo(this.graph);
    }
    updateNode(id, patch) { const el = this.graph.getCell(id); if (el) { el.set(patch); } }
    removeNode(id) { this.graph.getCell(id)?.remove(); }
    addEdge(e) {
        const link = new joint.dia.Link({ id: e.id, source: { id: e.source }, target: { id: e.target } });
        link.attr('line/strokeDasharray', e.kind === 'resource' ? '7 5' : 'none');
        link.addTo(this.graph);
    }
    updateEdge() { } removeEdge(id) { this.graph.getCell(id)?.remove(); }
    setSelected(ids) { /* через joint.ui.Selection при наличии Rappid */ }
    screenToWorld(x, y) { return this.paper.clientToLocalPoint({ x, y }); }
    zoomBy(f) { this.paper.scale({ sx: this.paper.scale().sx * f, sy: this.paper.scale().sy * f }); }
    fitContent() { this.paper.scaleContentToFit({ padding: 60, maxScale: 1.25 }); }
    clear() { this.graph.clearCells(); }
    setPalette() { } setGridVisible() { } setSnapping() { } bringToFront() { } sendToBack() { }
}
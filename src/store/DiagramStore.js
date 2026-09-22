import { EventEmitter } from '../core/EventEmitter.js';

/** Единственный источник истины. Эмитит гранулярные события для проекций (движка). */
export class DiagramStore extends EventEmitter {
    constructor() {
        super();
        this.doc = DiagramStore.empty();
    }

    static empty() {
        return {
            schema: 'aris-epc/1',
            meta: { id: `dgm_${Math.random().toString(36).slice(2, 7)}`, name: 'Новая модель', lang: 'ru', revision: 0, updatedAt: null },
            viewport: { x: 0, y: 0, z: 1 },
            nodes: [], edges: [],
        };
    }

    load(doc) {
        if (doc?.schema !== 'aris-epc/1' || !Array.isArray(doc.nodes) || !Array.isArray(doc.edges))
            throw new Error('Некорректный формат документа');
        this.doc = structuredClone(doc);
        this.emit('load', this.doc);
    }
    serialize() {
        this.doc.meta.revision++;
        this.doc.meta.updatedAt = new Date().toISOString();
        return structuredClone(this.doc);
    }

    getNode(id) { return this.doc.nodes.find((n) => n.id === id); }
    getEdge(id) { return this.doc.edges.find((e) => e.id === id); }
    edgesOf(id) { return this.doc.edges.filter((e) => e.source === id || e.target === id); }
    maxZ() { return this.doc.nodes.reduce((m, n) => Math.max(m, n.z ?? 0), 0); }

    addNode(n) { this.doc.nodes.push(n); this.emit('node:add', n); }
    updateNode(id, patch) {
        const n = this.getNode(id); if (!n) return;
        Object.assign(n, patch);
        this.emit('node:update', { id, patch });
    }
    removeNode(id) {
        this.doc.nodes = this.doc.nodes.filter((n) => n.id !== id);
        this.emit('node:remove', id);
    }
    addEdge(e) { this.doc.edges.push(e); this.emit('edge:add', e); }
    updateEdge(id, patch) { Object.assign(this.getEdge(id) ?? {}, patch); this.emit('edge:update', { id, patch }); }
    removeEdge(id) { this.doc.edges = this.doc.edges.filter((e) => e.id !== id); this.emit('edge:remove', id); }
}
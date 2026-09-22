export class EventEmitter {
    #h = new Map();
    on(evt, fn) {
        if (!this.#h.has(evt)) this.#h.set(evt, new Set());
        this.#h.get(evt).add(fn);
        return () => this.off(evt, fn);
    }
    off(evt, fn) { this.#h.get(evt)?.delete(fn); }
    emit(evt, payload) { this.#h.get(evt)?.forEach((fn) => fn(payload)); }
}
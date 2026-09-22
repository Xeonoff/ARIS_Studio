import { EventEmitter } from './EventEmitter.js';
/**
 * История изменений через Command Pattern.
 * Команда обязана быть идемпотентной в do()/undo() — это позволяет
 * безопасно «догонять» состояние при отмене посреди ввода.
 */
export class HistoryManager extends EventEmitter {
    #stack = []; #ptr = -1;
    constructor(limit = 120) { super(); this.limit = limit; }

    execute(cmd) {
        cmd.do();
        this.#stack.splice(this.#ptr + 1);       // новая ветка истории отрезает «будущее»
        this.#stack.push(cmd);
        if (this.#stack.length > this.limit) this.#stack.shift();
        this.#ptr = this.#stack.length - 1;
        this.#emitState();
    }
    undo() { if (this.#ptr < 0) return; this.#stack[this.#ptr--].undo(); this.#emitState(); }
    redo() { if (this.#ptr >= this.#stack.length - 1) return; this.#stack[++this.#ptr].do(); this.#emitState(); }
    clear() { this.#stack = []; this.#ptr = -1; this.#emitState(); }
    #emitState() { this.emit('change', { canUndo: this.#ptr >= 0, canRedo: this.#ptr < this.#stack.length - 1 }); }
}
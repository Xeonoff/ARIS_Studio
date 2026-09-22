import { EventEmitter } from '../core/EventEmitter.js';

/**
 * ПОРТ холста. Любой рендер-бэкенд (JointJS, mxGraph/MaxGraph, Fabric,
 * собственный SVG) обязан реализовать этот контракт. Ядро редактора
 * программируется только против него.
 *
 * События, которые движок ОБЯЗАН эмитить:
 *   'select'      { ids: string[], edge?: boolean }
 *   'blank'       — клик по пустому месту
 *   'node:moved'  { id, from:{x,y}, to:{x,y} }
 *   'link:create' { source, target }
 *   'pointer'     { x, y }  — мировые координаты курсора
 *   'viewport'    { x, y, z }
 */
export class GraphEngine extends EventEmitter {
    mount(container) { }
    setPalette(palette) { }
    setGridVisible(v) { } setSnapping(v) { }
    addNode(node) { } updateNode(id, patch) { } removeNode(id) { }
    addEdge(edge) { } updateEdge(id, patch) { } removeEdge(id) { }
    setSelected(ids) { } clear() { }
    screenToWorld(clientX, clientY) { }
    zoomBy(factor) { } fitContent() { }
    bringToFront(id) { } sendToBack(id) { }
    getVisibleWorldRect() { }
}
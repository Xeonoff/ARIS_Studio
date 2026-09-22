import { I18nManager } from './i18n/I18nManager.js';
import { DiagramStore } from './store/DiagramStore.js';
import { HistoryManager } from './core/HistoryManager.js';
import { SvgEngine } from './engine/SvgEngine.js';
import { JointEngineAdapter } from './engine/JointEngineAdapter.js';
import { ARISEditor } from './ui/ARISEditor.js';

// Автовыбор бэкенда: если в прод-сборке подключён JointJS — берём его,
// иначе работаем на встроенном SVG-адаптере. Контракт идентичен.
const engine = (typeof window.joint !== 'undefined') ? new JointEngineAdapter() : new SvgEngine();

const i18n = new I18nManager();
const store = new DiagramStore();
const history = new HistoryManager();

const editor = new ARISEditor({
    engine, store, history, i18n,
    els: {
        canvas: document.getElementById('canvas'),
        palette: document.getElementById('palette'),
        insBody: document.getElementById('ins-body'),
        stPos: document.getElementById('st-pos'),
        stZoom: document.getElementById('st-zoom'),
        stSel: document.getElementById('st-sel'),
        stIssues: document.getElementById('st-issues'),
        valDock: document.getElementById('val-dock'),
        valList: document.getElementById('val-list'),
        toasts: document.getElementById('toasts'),
        exportMenu: document.querySelector('#export-dd .dropdown__menu'),
        fileInput: document.getElementById('file-input'),
        docName: document.getElementById('doc-name'),
    },
});

document.documentElement.dataset.theme = localStorage.getItem('aris.theme') ?? 'light';
i18n.applyDom();
editor.fileInput?.addEventListener?.('change', (e) => e.target.files[0] && editor.importJSON(e.target.files[0]));
document.getElementById('file-input').addEventListener('change', (e) => e.target.files[0] && editor.importJSON(e.target.files[0]));

store.load({
    schema: 'aris-epc/1',
    meta: { id: 'dgm_demo', name: 'Обработка заказа', lang: 'ru', revision: 1, updatedAt: null },
    viewport: { x: 0, y: 0, z: 1 },
    nodes: [
        { id: 'evt_1', type: 'event', label: 'Заказ получен', description: '', x: 60, y: 180, w: 170, h: 64, z: 1, locked: false, group: null, style: {}, attrs: {} },
        { id: 'fnc_1', type: 'function', label: 'Проверить заказ', description: 'Наличие товара и кредитный лимит', x: 320, y: 180, w: 170, h: 64, z: 2, locked: false, group: null, style: {}, attrs: {} },
        { id: 'xor_1', type: 'xor', label: '', description: '', x: 580, y: 184, w: 54, h: 54, z: 3, locked: false, group: null, style: {}, attrs: {} },
        { id: 'evt_2', type: 'event', label: 'Заказ подтверждён', description: '', x: 720, y: 80, w: 170, h: 64, z: 4, locked: false, group: null, style: {}, attrs: {} },
        { id: 'evt_3', type: 'event', label: 'Заказ отклонён', description: '', x: 720, y: 290, w: 170, h: 64, z: 5, locked: false, group: null, style: {}, attrs: {} },
        { id: 'org_1', type: 'org', label: 'Отдел продаж', description: '', x: 320, y: 30, w: 170, h: 64, z: 6, locked: false, group: null, style: {}, attrs: {} },
    ],
    edges: [
        { id: 'flw_1', source: 'evt_1', target: 'fnc_1', kind: 'control', label: '', vertices: [], style: {} },
        { id: 'flw_2', source: 'fnc_1', target: 'xor_1', kind: 'control', label: '', vertices: [], style: {} },
        { id: 'flw_3', source: 'xor_1', target: 'evt_2', kind: 'control', label: '', vertices: [], style: {} },
        { id: 'flw_4', source: 'xor_1', target: 'evt_3', kind: 'control', label: '', vertices: [], style: {} },
        { id: 'flw_5', source: 'org_1', target: 'fnc_1', kind: 'resource', label: 'выполняет', vertices: [], style: {} },
    ],
});
history.clear();
import { EventEmitter } from '../core/EventEmitter.js';

const DICT = {
    ru: {
        'tb.undo': 'Отменить (Ctrl+Z)', 'tb.redo': 'Повторить (Ctrl+Y)',
        'tb.zoomIn': 'Приблизить', 'tb.zoomOut': 'Отдалить', 'tb.zoomFit': 'Вписать в экран',
        'tb.grid': 'Сетка и привязка', 'tb.theme': 'Тема оформления',
        'tb.export': 'Экспорт', 'tb.import': 'Импорт JSON', 'tb.validate': 'Проверка',
        'tb.group': 'Группировать', 'tb.front': 'На передний план', 'tb.back': 'На задний план',
        'tb.delete': 'Удалить (Del)',
        'tbx.title': 'Элементы EPC',
        'tbx.hint': 'Перетащите элемент на холст или нажмите клавиши 1–6.',
        'tbx.sec.flow': 'Поток управления', 'tbx.sec.logic': 'Логические операторы', 'tbx.sec.res': 'Ресурсы',
        'shape.event': 'Событие', 'shape.function': 'Функция',
        'shape.and': 'И (AND)', 'shape.or': 'ИЛИ (OR)', 'shape.xor': 'ИСКЛ. ИЛИ (XOR)',
        'shape.org': 'Орг. единица / Ресурс',
        'ins.title': 'Свойства', 'ins.empty': 'Выберите элемент на холсте.\nПодсказка: связи создаются перетаскиванием за синюю точку на правом крае фигуры.',
        'ins.label': 'Название', 'ins.description': 'Описание', 'ins.lock': 'Блокировка',
        'ins.color': 'Цвет переопределения', 'ins.reset': 'Сброс',
        'ins.edge.kind': 'Тип связи', 'ins.edge.control': 'Поток управления',
        'ins.edge.resource': 'Ресурсная (пунктир)', 'ins.edge.label': 'Подпись связи',
        'ins.attrs.risk': 'Уровень риска', 'ins.attrs.sla': 'SLA',
        'ins.flatLeft': 'Первый блок цепочки (плоский левый край)',
        'val.title': 'Проверка нотации EPC', 'val.ok': 'Модель корректна. Нарушений не найдено.',
        'val.edgeForbidden': 'Нарушено чередование: «{a}» нельзя соединить с «{b}» напрямую.',
        'val.eventDegree': 'Событие «{a}» имеет {in} вх. и {out} исх. связи. Допустимо не более одной в каждом направлении.',
        'val.funcDegree': 'Функция «{a}» имеет несколько входов/выходов. Ветвление выполняйте через операторы.',
        'val.opMixed': 'Оператор «{a}» смешивает слияние и разветвление. Оператор работает либо на вход, либо на выход.',
        'val.resourceTarget': 'Ресурс «{a}» может быть связан только с Функцией.',
        'val.isolated': 'Элемент «{a}» не подключён к процессу.',
        'val.startEvent': 'Цепь должна начинаться с События. Проверьте «{a}».',
        'val.endEvent': 'Цепь должна завершаться Событием. Проверьте «{a}».',
        'toast.linkBlocked': 'Связь запрещена правилами EPC',
        'toast.imported': 'Модель импортирована', 'toast.exported': 'Экспортировано: {fmt}',
        'exp.json.hint': 'состояние модели', 'exp.svg.hint': 'вектор', 'exp.png.hint': 'растр ×2', 'exp.xml.hint': 'ARIS/BPMN subset',
        'st.ready': 'Готово', 'st.selected': 'Выбрано: {n}',
        'shape.goal': 'Цель', 'shape.vac': 'Шаг цепочки стоимости',
        'shape.role': 'Роль / Должность', 'shape.person': 'Сотрудник',
        'tbx.sec.vacd': 'Цепочки добавленной стоимости', 'tbx.sec.goals': 'Модель целей',
        'tbx.sec.res': 'Оргструктура и ресурсы',
        'tbx.hint': 'Перетащите элемент на холст или нажмите клавиши 1–9 и 0.',
        'ins.edge.hierarchy': 'Иерархическая (без стрелки)',
        'val.hierarchyForbidden': 'Иерархическая связь допустима только внутри оргструктуры или дерева функций.',
        'val.resourceSource': 'Источник ресурсной связи должен быть орг. единицей, ролью или сотрудником.',
        'tb.ungroup': 'Разгруппировать',
        'toast.groupNeed': 'Выделите не менее двух элементов',
        'tbx.hint': 'Перетащите элемент на холст (клавиши 1–9 и 0). Рамка на пустом месте выделяет область, Shift — добавляет к выделению. Панорама: средняя кнопка мыши или Space + мышь.',
    },
    en: {
        'tb.undo': 'Undo (Ctrl+Z)', 'tb.redo': 'Redo (Ctrl+Y)',
        'tb.zoomIn': 'Zoom in', 'tb.zoomOut': 'Zoom out', 'tb.zoomFit': 'Fit to screen',
        'tb.grid': 'Grid & snapping', 'tb.theme': 'Toggle theme',
        'tb.export': 'Export', 'tb.import': 'Import JSON', 'tb.validate': 'Validate',
        'tb.group': 'Group', 'tb.front': 'Bring to front', 'tb.back': 'Send to back',
        'tb.delete': 'Delete (Del)',
        'tbx.title': 'EPC Elements',
        'tbx.hint': 'Drag an element onto the canvas or press keys 1–6.',
        'tbx.sec.flow': 'Control flow', 'tbx.sec.logic': 'Logic operators', 'tbx.sec.res': 'Resources',
        'shape.event': 'Event', 'shape.function': 'Function',
        'shape.and': 'AND', 'shape.or': 'OR', 'shape.xor': 'XOR',
        'shape.org': 'Org. unit / Resource',
        'ins.title': 'Properties', 'ins.empty': 'Select an element on the canvas.\nTip: create connections by dragging the blue port on the right edge of a shape.',
        'ins.label': 'Name', 'ins.description': 'Description', 'ins.lock': 'Locked',
        'ins.color': 'Override color', 'ins.reset': 'Reset',
        'ins.edge.kind': 'Connector type', 'ins.edge.control': 'Control flow',
        'ins.edge.resource': 'Resource (dashed)', 'ins.edge.label': 'Connector label',
        'ins.attrs.risk': 'Risk level', 'ins.attrs.sla': 'SLA',
        'ins.flatLeft': 'First block in chain (flat left edge)',
        'val.title': 'EPC notation check', 'val.ok': 'Model is valid. No violations found.',
        'val.edgeForbidden': 'Alternation violated: “{a}” cannot connect directly to “{b}”.',
        'val.eventDegree': 'Event “{a}” has {in} in / {out} out flows. At most one per direction is allowed.',
        'val.funcDegree': 'Function “{a}” has multiple inputs/outputs. Use operators to branch.',
        'val.opMixed': 'Operator “{a}” mixes join and split. An operator works either as join or split.',
        'val.resourceTarget': 'Resource “{a}” may only be attached to a Function.',
        'val.isolated': 'Element “{a}” is not connected to the process.',
        'val.startEvent': 'A chain must start with an Event. Check “{a}”.',
        'val.endEvent': 'A chain must end with an Event. Check “{a}”.',
        'toast.linkBlocked': 'Connection forbidden by EPC rules',
        'toast.imported': 'Model imported', 'toast.exported': 'Exported: {fmt}',
        'exp.json.hint': 'model state', 'exp.svg.hint': 'vector', 'exp.png.hint': 'raster ×2', 'exp.xml.hint': 'ARIS/BPMN subset',
        'st.ready': 'Ready', 'st.selected': 'Selected: {n}',
        'shape.goal': 'Goal', 'shape.vac': 'Value-added chain step',
        'shape.role': 'Role / Position', 'shape.person': 'Person',
        'tbx.sec.vacd': 'Value-added chains', 'tbx.sec.goals': 'Goal model',
        'tbx.sec.res': 'Org structure & resources',
        'tbx.hint': 'Drag an element onto the canvas or press keys 1–9 and 0.',
        'ins.edge.hierarchy': 'Hierarchy (no arrow)',
        'val.hierarchyForbidden': 'Hierarchy links are only allowed within org structure or a function tree.',
        'val.resourceSource': 'A resource link must originate from an org unit, role or person.',
        'tb.ungroup': 'Ungroup',
        'toast.groupNeed': 'Select at least two elements',
        'tbx.hint': 'Drag an element onto the canvas (keys 1–9 and 0). Drag on empty space for area selection, Shift adds to selection. Pan: middle mouse button or Space + drag.',
    },
};

export class I18nManager extends EventEmitter {
    constructor(defaultLang = 'ru') {
        super();
        this.lang = localStorage.getItem('aris.lang') || defaultLang;
    }
    t(key, vars) {
        let s = DICT[this.lang]?.[key] ?? DICT.en[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
        return s;
    }
    setLang(lang) {
        if (!DICT[lang] || lang === this.lang) return;
        this.lang = lang;
        localStorage.setItem('aris.lang', lang);
        this.emit('change', lang);
    }
    applyDom(root = document) {
        root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = this.t(el.dataset.i18n); });
        root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = this.t(el.dataset.i18nTitle); });
        document.documentElement.lang = this.lang;
    }
}
import { shapePath, OPERATOR_GLYPH, isOperator, SHAPE_DEFS, HAS_BAR, barGeom } from '../domain/shapes.js';

const esc = (s) => String(s ?? '').replace(/[<>&"']/g,
  (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

/** Экспорт/импорт. Строит артефакты напрямую из модели, не зависит от движка. */
export class Exporter {
  constructor(store, getPalette) { this.store = store; this.getPalette = getPalette; }

  /* ── 1) JSON: внутреннее состояние ── */
  downloadJSON() {
    this.#download(
      JSON.stringify(this.store.serialize(), null, 2),
      `${this.#fname()}.json`, 'application/json');
  }

  /* ── 2) SVG: автономный вектор (стили инлайн) ── */
  buildSVG(doc) {
    const pal = this.getPalette();
    const pad = 40;
    const nodes = doc.nodes.length ? doc.nodes : [{ x: 0, y: 0, w: 100, h: 100 }];
    const x0 = Math.min(...nodes.map((n) => n.x)) - pad;
    const y0 = Math.min(...nodes.map((n) => n.y)) - pad;
    const x1 = Math.max(...nodes.map((n) => n.x + n.w)) + pad;
    const y1 = Math.max(...nodes.map((n) => n.y + n.h)) + pad;

    const anchor = (n, tx, ty) => {
      const cx = n.x + n.w / 2, cy = n.y + n.h / 2, dx = tx - cx, dy = ty - cy;
      const s = Math.min((n.w / 2) / Math.abs(dx || 1e-9), (n.h / 2) / Math.abs(dy || 1e-9));
      return { x: cx + dx * s, y: cy + dy * s };
    };

    const edges = doc.edges.map((e) => {
      const s = doc.nodes.find((n) => n.id === e.source), t = doc.nodes.find((n) => n.id === e.target);
      if (!s || !t) return '';
      const vs = e.vertices ?? [];
      const aim1 = vs[0] ?? { x: t.x + t.w / 2, y: t.y + t.h / 2 };
      const aim2 = vs[vs.length - 1] ?? { x: s.x + s.w / 2, y: s.y + s.h / 2 };
      const p1 = anchor(s, aim1.x, aim1.y), p2 = anchor(t, aim2.x, aim2.y);
      const d = [p1, ...vs, p2].map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
      const color = e.kind === 'resource' ? (pal.edgeResource ?? '#0f8f83') : pal.edge;
      const dash = e.kind === 'resource' ? 'stroke-dasharray="7 5"' : '';
      const marker = e.kind === 'control' ? 'url(#arr)' : e.kind === 'resource' ? 'url(#arrR)' : 'none';
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" ${dash} marker-end="${marker}"/>`;
    }).join('\n  ');

    const nodesXml = doc.nodes.map((n) => {
      const p = pal.nodes[n.type];
      const fill = n.style?.fill || p.fill;
      const def = SHAPE_DEFS[n.type] ?? {};
      const ly = n.y + (def.labelCy ?? 0.5) * n.h;
      const bar = HAS_BAR.has(n.type)
        ? (() => {
          const b = barGeom(n.type, n.w, n.h);
          return `<line x1="${n.x + b.x}" x2="${n.x + b.x}" y1="${n.y + b.y1}" y2="${n.y + b.y2}"
                 stroke="${p.ink}" stroke-width="1.6" opacity="0.55"/>`;
        })()
        : '';
      const glyph = isOperator(n.type)
        ? `<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2}" text-anchor="middle" dominant-baseline="central"
         font-family="Manrope, sans-serif" font-weight="800" font-size="${n.h * .42}" fill="${p.stroke}">${OPERATOR_GLYPH[n.type]}</text>` : '';
      const label = isOperator(n.type) ? '' :
        `<text x="${n.x + n.w / 2}" y="${ly}" text-anchor="middle" dominant-baseline="central"
       font-family="Manrope, sans-serif" font-weight="700" font-size="12" fill="${p.ink}">${esc(n.label)}</text>`;
      return `<g><path d="${shapePath(n.type, n.w, n.h, n.style ?? {})}" transform="translate(${n.x} ${n.y})"
    fill="${fill}" stroke="${p.stroke}" stroke-width="1.5"/>${bar}${glyph}${label}</g>`;
    }).join('\n  ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" width="${x1 - x0}" height="${y1 - y0}">
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 Z" fill="${pal.edge}"/></marker>
    <marker id="arrR" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 Z" fill="${pal.edgeResource ?? '#0f8f83'}"/></marker>
  </defs>
  <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${pal.canvasBg ?? '#ffffff'}"/>
  ${edges}
  ${nodesXml}
</svg>`;
  }
  downloadSVG(doc) { this.#download(this.buildSVG(doc), `${this.#fname()}.svg`, 'image/svg+xml'); }

  /* ── 3) PNG: SVG → Image → Canvas ×2 (PERF: большие сцены → OffscreenCanvas в Worker'е) ── */
  downloadPNG(doc, scale = 2) {
    const svgText = this.buildSVG(doc);
    const [, , bw, bh] = svgText.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    const img = new Image();
    img.onload = () => {
      const cnv = document.createElement('canvas');
      cnv.width = bw * scale; cnv.height = bh * scale;
      cnv.getContext('2d').drawImage(img, 0, 0, cnv.width, cnv.height);
      cnv.toBlob((blob) => this.#downloadBlob(blob, `${this.#fname()}.png`), 'image/png');
    };
    img.src = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  }

  /* ── 4) XML: подмножество ARIS AML / BPMN 2.0 DI ── */
  downloadXML() {
    const d = this.store.serialize();
    const byType = (t) => d.nodes.filter((n) => n.type === t);
    const item = (tag, n, extra = '') =>
      `    <${tag} id="${esc(n.id)}" name="${esc(n.label)}" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}"${extra}>
      <description>${esc(n.description)}</description>
    </${tag}>`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Сгенерировано ARIS EPC Studio. Упрощённая схема в духе ARIS AML / BPMN 2.0 -->
<epcModel id="${esc(d.meta.id)}" name="${esc(d.meta.name)}" revision="${d.meta.revision}"
          updatedAt="${d.meta.updatedAt}" xmlns="https://example.org/schemas/aris-epc/1.0">
  <events>
${byType('event').map((n) => item('event', n)).join('\n')}
  </events>
  <functions>
${byType('function').map((n) => item('function', n)).join('\n')}
  </functions>
  <controls>
${['and', 'or', 'xor'].flatMap((t) => byType(t)).map((n) => item('control', n, ` operator="${n.type.toUpperCase()}"`)).join('\n')}
  </controls>
  <goals>
${byType('goal').map((n) => item('goal', n)).join('\n')}
  </goals>
  <vacSteps>
${byType('vac').map((n) => item('vacStep', n)).join('\n')}
  </vacSteps>
  <orgUnits>
${['org', 'role', 'person'].flatMap((t) => byType(t)).map((n) => item('orgUnit', n, ` kind="${n.type}"`)).join('\n')}
  </orgUnits>
  <flows>
${d.edges.map((e) => `    <flow id="${esc(e.id)}" sourceRef="${esc(e.source)}" targetRef="${esc(e.target)}" kind="${esc(e.kind)}"/>`).join('\n')}
  </flows>
</epcModel>`;
    this.#download(xml, `${this.#fname()}.xml`, 'application/xml');
  }

  #fname() { return (this.store.doc.meta.name || 'epc-model').replace(/\s+/g, '_'); }
  #download(text, name, mime) { this.#downloadBlob(new Blob([text], { type: mime }), name); }
  #downloadBlob(blob, name) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}
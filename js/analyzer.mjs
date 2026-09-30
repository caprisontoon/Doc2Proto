// PDF 기획서 페이지 분석기
// - 빨간 점선/실선 박스 → 핫스팟(클릭 영역)
// - 빨간 점선 연결선 + 화살표 → 핫스팟과 디스크립션 블록 연결
// - 텍스트/도형을 근접도로 묶어 블록(목업, 설명 표 등) 생성

const MOVE = 13, LINE = 14, CURVE = 15, CURVE2 = 16, CURVE3 = 17, CLOSE = 18, RECT = 19;

const isRed = (c) => c && c[0] > 170 && c[1] < 90 && c[2] < 90;
const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const pad = (b, p) => [b[0] - p, b[1] - p, b[2] + p, b[3] + p];
const contains = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const gap = (a, b) => {
  const dx = Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]));
  const dy = Math.max(0, Math.max(a[1], b[1]) - Math.min(a[3], b[3]));
  return Math.hypot(dx, dy);
};
const distPtBox = (x, y, b) => gap([x, y, x, y], b);
const inside = (inner, outer, tol = 0) =>
  inner[0] >= outer[0] - tol && inner[1] >= outer[1] - tol && inner[2] <= outer[2] + tol && inner[3] <= outer[3] + tol;

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// constructPath 인자를 서브패스(점 목록) 배열로 변환
function toSubpaths(ops, coords, ctm) {
  const subs = [];
  let cur = null, k = 0;
  const pt = (x, y) => apply(ctm, x, y);
  for (const op of ops) {
    if (op === MOVE) { cur = { pts: [pt(coords[k], coords[k + 1])], curve: false }; subs.push(cur); k += 2; }
    else if (op === LINE) { cur?.pts.push(pt(coords[k], coords[k + 1])); k += 2; }
    else if (op === CURVE) { if (cur) { cur.curve = true; cur.pts.push(pt(coords[k + 4], coords[k + 5])); } k += 6; }
    else if (op === CURVE2 || op === CURVE3) { if (cur) { cur.curve = true; cur.pts.push(pt(coords[k + 2], coords[k + 3])); } k += 4; }
    else if (op === CLOSE) { /* noop */ }
    else if (op === RECT) {
      const [x, y, w, h] = coords.slice(k, k + 4); k += 4;
      subs.push({ pts: [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)], rect: true });
    }
  }
  for (const s of subs) {
    const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
    s.bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  return subs;
}

// 오퍼레이터 리스트에서 도형 추출
function extractShapes(opList, OPS) {
  const shapes = [];
  let st = { stroke: [0, 0, 0], fill: [0, 0, 0], dash: false, ctm: [1, 0, 0, 1, 0, 0] };
  const stack = [];
  let path = null;
  const paintOps = new Set([OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const strokeOps = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const fillOps = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], a = argsArray[i];
    if (fn === OPS.save) stack.push({ ...st });
    else if (fn === OPS.restore) st = stack.pop() || st;
    else if (fn === OPS.transform) st.ctm = mul(st.ctm, a);
    else if (fn === OPS.setStrokeRGBColor) st.stroke = [a[0], a[1], a[2]];
    else if (fn === OPS.setFillRGBColor) st.fill = [a[0], a[1], a[2]];
    else if (fn === OPS.setDash) st.dash = Array.isArray(a[0]) ? a[0].length > 0 : false;
    else if (fn === OPS.constructPath) path = a;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
      const c = [apply(st.ctm, 0, 0), apply(st.ctm, 1, 0), apply(st.ctm, 0, 1), apply(st.ctm, 1, 1)];
      const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
      shapes.push({ subs: [], bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], image: true, red: false });
    }
    else if (fn === OPS.endPath) path = null;
    else if (paintOps.has(fn) && path) {
      const subs = toSubpaths(path[0], path[1], st.ctm);
      if (subs.length) {
        const bbox = subs.map((s) => s.bbox).reduce(union);
        const isStroke = strokeOps.has(fn), isFill = fillOps.has(fn);
        shapes.push({
          subs, bbox, dash: st.dash, stroke: isStroke, fill: isFill,
          red: (isStroke && isRed(st.stroke)) || (isFill && !isStroke && isRed(st.fill)),
        });
      }
      path = null;
    }
  }
  return shapes;
}

function extractTexts(textContent) {
  const out = [];
  for (const it of textContent.items) {
    if (!it.str || !it.str.trim()) continue;
    const [a, b, , d, e, f] = it.transform;
    const size = Math.hypot(a, b) || Math.abs(d) || 10;
    out.push({ str: it.str, bbox: [e, f - size * 0.2, e + it.width, f + size * 0.85], size });
  }
  return out;
}

// 근접한 요소들을 묶어 블록 생성 (Union-Find)
function cluster(items, threshold) {
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++)
      if (gap(items[i].bbox, items[j].bbox) <= threshold) parent[find(i)] = find(j);
  const groups = new Map();
  items.forEach((it, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(it);
  });
  return [...groups.values()];
}

function textOf(texts, bbox) {
  const lines = [];
  const inBox = texts.filter((t) => contains(pad(bbox, 1), (t.bbox[0] + t.bbox[2]) / 2, (t.bbox[1] + t.bbox[3]) / 2));
  inBox.sort((p, q) => q.bbox[1] - p.bbox[1] || p.bbox[0] - q.bbox[0]);
  for (const t of inBox) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - t.bbox[1]) < t.size * 0.5) last.parts.push(t);
    else lines.push({ y: t.bbox[1], parts: [t] });
  }
  return lines.map((l) => l.parts.sort((p, q) => p.bbox[0] - q.bbox[0]).map((p) => p.str.trim()).join(' ')).join('\n');
}

export async function analyzePage(page, OPS) {
  const [vx0, vy0, vx1, vy1] = page.view;
  const W = vx1 - vx0, H = vy1 - vy0;
  const [opList, tc] = await Promise.all([page.getOperatorList(), page.getTextContent()]);
  const shapes = extractShapes(opList, OPS);
  const texts = extractTexts(tc);
  const pageArea = W * H;

  // 페이지 제목(Page Name 옆 텍스트)
  let title = '';
  const pn = texts.find((t) => /^page\s*name$/i.test(t.str.trim()));
  if (pn) {
    const cand = texts.filter((t) => t !== pn && Math.abs(t.bbox[1] - pn.bbox[1]) < 6 && t.bbox[0] > pn.bbox[2])
      .sort((p, q) => p.bbox[0] - q.bbox[0]);
    const proj = cand.findIndex((t) => /^project$/i.test(t.str.trim()));
    title = (proj >= 0 ? cand.slice(0, proj) : cand.slice(0, 6)).map((t) => t.str.trim()).join(' ').replace(/\s+/g, ' ').trim();
  }

  // 템플릿 영역(헤더, 우측 Description 사이드바, 푸터) 제외
  let headerY = H, sidebarX = W;
  if (pn) headerY = pn.bbox[1] - 4;
  const desc = texts.find((t) => t.str.trim() === 'Description' && t.bbox[0] > W * 0.6);
  if (desc) sidebarX = desc.bbox[0] - 70;
  const content = [vx0, vy0 + 20, sidebarX, headerY];
  const inContent = (b) => inside(b, content, 2);

  const redShapes = shapes.filter((s) => s.red);
  const plain = shapes.filter((s) => !s.red && area(s.bbox) < pageArea * 0.4 && inContent(s.bbox) && area(s.bbox) > 0.5);
  const contentTexts = texts.filter((t) => inContent(t.bbox));

  // 1) 핫스팟: 빨간 선으로 그린 사각형/닫힌 도형
  const hotspots = [];
  for (const s of redShapes) {
    if (!s.stroke) continue;
    for (const sub of s.subs) {
      const b = sub.bbox;
      if (b[2] - b[0] > 6 && b[3] - b[1] > 6 && (sub.rect || sub.pts.length >= 4)) hotspots.push({ bbox: b, targets: [], arrows: [] });
    }
  }

  // 2) 연결선: 빨간 채움 도형(점선 조각 + 원형 점 + 화살촉)
  const connectors = [];
  for (const s of redShapes) {
    if (s.stroke) continue;
    const tris = s.subs.filter((q) => !q.curve && !q.rect && q.pts.length === 3);
    const dots = s.subs.filter((q) => q.curve);
    if (!tris.length) continue;
    const tri = tris[tris.length - 1];
    const cx = tri.pts.reduce((p, q) => p + q[0], 0) / 3, cy = tri.pts.reduce((p, q) => p + q[1], 0) / 3;
    const tip = tri.pts.reduce((best, p) => (Math.hypot(p[0] - cx, p[1] - cy) > Math.hypot(best[0] - cx, best[1] - cy) ? p : best));
    let src;
    if (dots.length) { const d = dots[0].bbox; src = [(d[0] + d[2]) / 2, (d[1] + d[3]) / 2]; }
    else {
      const all = s.subs.flatMap((q) => q.pts);
      src = all.reduce((best, p) => (Math.hypot(p[0] - tip[0], p[1] - tip[1]) > Math.hypot(best[0] - tip[0], best[1] - tip[1]) ? p : best));
    }
    const len = Math.hypot(tip[0] - cx, tip[1] - cy) || 1;
    connectors.push({ src, tip, dir: [(tip[0] - cx) / len, (tip[1] - cy) / len], bbox: s.bbox });
  }

  // 3) 블록: 텍스트 + 일반 도형 근접 클러스터
  const items = [...contentTexts.map((t) => ({ bbox: t.bbox })), ...plain.map((s) => ({ bbox: s.bbox }))];
  const blocks = cluster(items, 5).map((g) => ({ bbox: g.map((x) => x.bbox).reduce(union) }))
    .filter((b) => area(b.bbox) > 40);
  // 겹치는 블록 병합
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < blocks.length; i++)
      for (let j = i + 1; j < blocks.length; j++)
        if (gap(blocks[i].bbox, blocks[j].bbox) === 0) {
          blocks[i].bbox = union(blocks[i].bbox, blocks[j].bbox); blocks.splice(j, 1); merged = true; break outer;
        }
  }
  blocks.forEach((b, i) => { b.id = i; b.text = textOf(contentTexts, b.bbox); });

  // 화살표가 가리키는 블록 찾기
  const elems = [...contentTexts, ...plain];
  const addBlock = (bbox, caption) => {
    const ex = blocks.find((b) => b.bbox.every((v, k) => Math.abs(v - bbox[k]) < 1));
    if (ex) return ex;
    const b = { id: blocks.length, bbox, text: '', sub: true, caption: caption || '' };
    blocks.push(b);
    return b;
  };
  function findTarget(c, h) {
    const probe = [c.tip[0] + c.dir[0] * 4, c.tip[1] + c.dir[1] * 4];
    const srcBlock = blockAt((h.bbox[0] + h.bbox[2]) / 2, (h.bbox[1] + h.bbox[3]) / 2);
    // 화살표가 다른 핫스팟을 가리키면 그 영역을 대상으로
    const hsHit = hotspots.find((o) => o !== h && distPtBox(probe[0], probe[1], o.bbox) < 6);
    if (hsHit) return addBlock(hsHit.bbox, textOf(contentTexts, hsHit.bbox).split('\n')[0]);
    const hit = blockAt(probe[0], probe[1]);
    if (hit && hit !== srcBlock && !inside(h.bbox, hit.bbox, 1)) return hit;
    const ahead = (b) => {
      const cxb = Math.min(Math.max(c.tip[0], b[0]), b[2]), cyb = Math.min(Math.max(c.tip[1], b[1]), b[3]);
      const vx = cxb - c.tip[0], vy = cyb - c.tip[1];
      return vx * c.dir[0] + vy * c.dir[1] >= -2;
    };
    if (hit && hit === srcBlock) {
      // 목업 내부를 가리키는 경우: 화살표 앞의 하위 요소(이미지/도형)
      const sub = elems
        .filter((e) => area(e.bbox) > 150 && area(e.bbox) < area(srcBlock.bbox) * 0.6 && !inside(e.bbox, h.bbox, 1) && ahead(e.bbox))
        .map((e) => ({ e, d: distPtBox(probe[0], probe[1], e.bbox) }))
        .filter((x) => x.d < 12)
        .sort((p, q) => p.d - q.d || area(q.e.bbox) - area(p.e.bbox))[0];
      if (sub) return addBlock(sub.e.bbox);
    }
    const cands = blocks.filter((b) => b !== srcBlock && !inside(h.bbox, b.bbox, 1) && ahead(b.bbox));
    const t = cands.map((b) => ({ b, d: distPtBox(c.tip[0], c.tip[1], b.bbox) })).sort((p, q) => p.d - q.d)[0];
    return t && t.d < 40 ? t.b : null;
  }

  // 4) 연결선의 출발점 → 핫스팟 (없으면 출발점 주변 요소로 가상 핫스팟 생성)
  const blockAt = (x, y) => blocks.filter((b) => contains(pad(b.bbox, 2), x, y)).sort((p, q) => area(p.bbox) - area(q.bbox))[0];
  for (const c of connectors) {
    let hs = hotspots.map((h) => ({ h, d: distPtBox(c.src[0], c.src[1], h.bbox) })).sort((p, q) => p.d - q.d)[0];
    if (!hs || hs.d > 6) {
      const near = [...contentTexts, ...plain]
        .filter((t) => area(t.bbox) < 4000)
        .map((t) => ({ t, d: distPtBox(c.src[0], c.src[1], t.bbox) }))
        .filter((x) => x.d < 14)
        .sort((p, q) => p.d - q.d || area(p.t.bbox) - area(q.t.bbox))[0];
      const b = near ? pad(near.t.bbox, 3) : [c.src[0] - 9, c.src[1] - 9, c.src[0] + 9, c.src[1] + 9];
      const h = { bbox: b, targets: [], arrows: [], virtual: true };
      hotspots.push(h);
      hs = { h };
    }
    hs.h.arrows.push({ src: c.src, tip: c.tip });
    const tb = findTarget(c, hs.h);
    if (tb && !hs.h.targets.includes(tb.id)) hs.h.targets.push(tb.id);
  }

  // 5) 연결선 없는 핫스팟 → 오른쪽 가장 가까운 블록
  for (const h of hotspots) {
    if (h.targets.length) continue;
    const srcBlock = blockAt((h.bbox[0] + h.bbox[2]) / 2, (h.bbox[1] + h.bbox[3]) / 2);
    const cands = blocks.filter((b) => b !== srcBlock && b.bbox[0] >= h.bbox[2] - 2);
    const t = cands.map((b) => ({ b, d: gap(h.bbox, b.bbox) })).sort((p, q) => p.d - q.d)[0];
    if (t && t.d < 120) h.targets.push(t.b.id);
  }

  // 중복 핫스팟 제거
  const uniq = [];
  for (const h of hotspots) {
    const dup = uniq.find((u) => Math.abs(u.bbox[0] - h.bbox[0]) < 2 && Math.abs(u.bbox[1] - h.bbox[1]) < 2 && Math.abs(u.bbox[2] - h.bbox[2]) < 2 && Math.abs(u.bbox[3] - h.bbox[3]) < 2);
    if (dup) { for (const t of h.targets) if (!dup.targets.includes(t)) dup.targets.push(t); dup.arrows.push(...h.arrows); }
    else uniq.push(h);
  }
  uniq.forEach((h, i) => {
    h.id = i;
    h.label = textOf(contentTexts, h.bbox).split('\n')[0] || '';
    const mock = blockAt((h.bbox[0] + h.bbox[2]) / 2, (h.bbox[1] + h.bbox[3]) / 2);
    h.mockup = mock ? mock.id : null;
  });

  // 블록 바로 위의 한 줄 텍스트(소제목)를 캡션으로 사용
  for (const b of blocks) {
    if (b.sub) continue;
    const above = contentTexts.filter((t) => t.bbox[1] >= b.bbox[3] - 2 && t.bbox[1] - b.bbox[3] < 20 && Math.abs(t.bbox[0] - b.bbox[0]) < 25)
      .sort((p, q) => p.bbox[1] - q.bbox[1])[0];
    let cap = '';
    if (above) cap = textOf(contentTexts, [b.bbox[0] - 25, above.bbox[1], b.bbox[2], above.bbox[3]]).split('\n')[0];
    const first = b.text.split('\n')[0];
    b.caption = cap && cap.length < 40 ? cap : (first.length < 30 ? first : '');
  }

  return { width: W, height: H, origin: [vx0, vy0], title, blocks, hotspots: uniq };
}

export async function analyzeDocument(pdf, OPS, onProgress) {
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    pages.push(await analyzePage(page, OPS));
    onProgress?.(i, pdf.numPages);
  }
  // 제목이 없는 페이지는 앞 페이지 제목 없이 번호만 사용
  pages.forEach((p, i) => { p.index = i; });

  // 여러 페이지에서 같은 위치에 반복되는 목업 → 다른 페이지 핫스팟을 프로토타입 링크로 연결
  const same = (a, b) => a.every((v, k) => Math.abs(v - b[k]) < 4);
  for (const p of pages) {
    p.links = [];
    const mockIds = new Set(p.hotspots.map((h) => h.mockup).filter((x) => x != null));
    // 핫스팟이 없는 페이지도 가장 큰 좌측 블록을 목업 후보로 사용
    if (!mockIds.size && p.blocks.length) {
      const big = [...p.blocks].sort((a, b) => area(b.bbox) - area(a.bbox))[0];
      if (area(big.bbox) > p.width * p.height * 0.12) mockIds.add(big.id);
    }
    const mocks = [...mockIds].map((id) => p.blocks[id].bbox);
    for (const q of pages) {
      if (q === p) continue;
      for (const h of q.hotspots) {
        if (h.mockup == null || !h.targets.length) continue;
        const qm = q.blocks[h.mockup].bbox;
        if (!mocks.some((m) => same(m, qm))) continue;
        if (p.hotspots.some((own) => same(own.bbox, h.bbox))) continue;
        // 목업 전체를 가리키는 큰 핫스팟은 제외
        if (area(h.bbox) > area(qm) * 0.5) continue;
        p.links.push({ page: q.index, hotspot: h.id, bbox: h.bbox });
      }
    }
  }
  return pages;
}

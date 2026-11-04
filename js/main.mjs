// 정적 문서(docs/<slug>/<version>/data.json) 로딩 + 랜딩 목록 + PDF 빠른 미리보기(로컬 변환)
const $ = (s) => document.querySelector(s);
const landing = $('#landing');
const statusEl = $('#status');

function status(msg) {
  statusEl.textContent = msg;
  statusEl.hidden = !msg;
}

// claude.ai 아티팩트 버전: 빌드(tools/build_artifact.py)가 D2P_HOST·D2P_DOCS·D2P_SHARE를 넣는다
//   주소는 #<key>(기획서·버전) — claude.ai는 쿼리를 넘기지 않고 #영문·숫자·- 만 넘겨준다
const ART = window.D2P_HOST === 'artifact';
const DOCS = window.D2P_DOCS || [];   // [{ key, slug, version, title, date, pages, live, path, ext? }] — ext: 다른 아티팩트에 있는 기획서 링크
const keyOfHash = () => { const m = /^#([A-Za-z0-9]+)/.exec(location.hash); return m && DOCS.some((d) => d.key === m[1] && !d.ext) ? m[1] : null; };

function start(model, opts) {
  landing.hidden = true;
  document.title = model.title + ' — Doc2Proto';
  const home = ART ? () => { location.hash = ''; location.reload(); } : () => { location.href = location.pathname; };
  window.D2P.init(model, { onNew: home, ...opts });
}

/* ---------- 배포된 문서 열기: ?doc=docs/<slug>/<version> (아티팩트: #<key>) ---------- */
async function openDoc(docPath, art) {
  const base = art ? art.path : docPath.replace(/\/+$/, '') + '/';
  if (!art && !/^docs\/[\w가-힣.-]+\/[\w가-힣.-]+\/$/.test(base)) { status('잘못된 문서 경로예요'); return; }
  status('문서 불러오는 중…');
  const res = await fetch(base + 'data.json', { cache: 'no-cache' }).catch(() => null);
  if (!res || !res.ok) { status('문서를 찾을 수 없어요: ' + docPath); return; }
  const data = await res.json();
  const live = art && !art.live ? null : await fetch(base + 'live.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (live && live.src) live.src = base + live.src;
  if (live && live.apps) for (const a of Object.values(live.apps)) a.src = base + a.src;
  // 버전 비교: 새 버전 폴더의 diff.json (이전 버전 대비)
  const diff = art && !art.diff ? null : await fetch(base + 'diff.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const versions = await versionsOf(data.slug, data.version);
  if (diff) {
    const prev = art && DOCS.find((d) => d.slug === data.slug && d.version === diff.base);
    diff.baseDir = art ? (prev ? prev.path : null) : base.replace(/[^/]+\/$/, '') + diff.base + '/';
  }
  const model = {
    title: data.title, version: data.version, generated: data.generated, size: data.size,
    pages: data.pages.map((p) => ({ ...p, img: base + p.img })), live, diff,
  };
  status('');
  start(model, {
    getShareUrl: async () => (art ? (window.D2P_SHARE || location.href.split('#')[0]) + location.hash : location.href),
    hashKey: art ? art.key : '', shareBase: art ? window.D2P_SHARE || '' : '',
    versions,
    diffOn: q.get('diff') !== '0',
    comments: import(art ? './comments-artifact.mjs' : './comments.mjs').then((m) => m.createComments({ doc: data.slug, version: data.version })).catch((e) => { console.error('코멘트 기능을 불러오지 못했어요', e); return null; }),
  });
}

async function versionsOf(slug, current) {
  if (ART) return DOCS.filter((d) => d.slug === slug && !d.ext).map((d) => ({ version: d.version, label: d.version, href: '#' + d.key, current: d.version === current }));
  const idx = await fetch('docs/index.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const doc = idx && idx.docs.find((d) => d.slug === slug);
  if (!doc) return null;
  return doc.versions.map((v) => ({ version: v.version, label: v.version, href: `?doc=docs/${slug}/${v.version}`, current: v.version === current }));
}

/* ---------- 랜딩: 문서 목록 + 관리 (js/landing.mjs) ---------- */
const renderList = () => (ART ? renderArtifactList() : import('./landing.mjs').then((m) => m.renderLanding()));

// 아티팩트 랜딩: 보기 전용 목록 (올리기·삭제·GitHub 연결은 웹 버전에서만)
function renderArtifactList() {
  const box = $('#doclist'); box.innerHTML = '';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const bySlug = new Map();
  for (const d of DOCS) { if (!bySlug.has(d.slug)) bySlug.set(d.slug, []); bySlug.get(d.slug).push(d); }
  for (const vs of [...bySlug.values()].reverse()) {
    const latest = vs[vs.length - 1];
    const card = el('div', 'doc');
    const go = (n, d) => { if (d.ext) { n.href = d.ext; n.target = '_blank'; n.rel = 'noopener'; } else n.href = '#' + d.key; return n; };   // 다른 아티팩트는 새 탭
    const a = go(el('a', 'doc-title', latest.title + (latest.ext ? ' ↗' : '')), latest); if (latest.ext) a.title = '다른 아티팩트에서 열려요'; card.append(a);
    card.append(el('div', 'doc-meta', `최신 ${latest.version} · ${latest.date} · ${latest.pages}쪽 · 버전 ${vs.length}개`));
    const vers = el('div', 'doc-vers');
    for (const v of [...vs].reverse()) { const l = go(el('a', v === latest ? 'latest' : null, v.version), v); l.title = `${v.date} · ${v.pages}쪽`; vers.append(l); }
    card.append(vers);
    card.append(el('div', 'livest ' + (latest.live ? 'on' : 'off'), latest.live ? '● 동작 화면 있음' : '○ 동작 화면 없음 — 스냅샷·Description 연결만'));
    box.append(card);
  }
  if (!DOCS.length) box.append(el('div', 'empty', '담긴 기획서가 없어요.'));
}

/* ---------- PDF 빠른 미리보기 (브라우저 안 변환, 공유 불가) ---------- */
async function openPdf(file) {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { status('PDF 파일만 미리볼 수 있어요'); return; }
  status('변환 모듈 불러오는 중…');
  const [{ analyzeDocument }, pdfjs] = await Promise.all([import('./analyzer.mjs'), import('../vendor/pdfjs/pdf.min.mjs')]);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    const pdf = await pdfjs.getDocument({
      data,
      cMapUrl: new URL('../vendor/pdfjs/cmaps/', import.meta.url).href, cMapPacked: true,
      standardFontDataUrl: new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href,
    }).promise;
    const pages = await analyzeDocument(pdf, pdfjs.OPS, (i, n) => status(`구조 분석 중… ${i}/${n}`));
    const toRect = (bbox, p) => {
      const [vx0, vy0] = p.origin, W = p.width, H = p.height;
      return { l: ((bbox[0] - vx0) / W) * 100, t: ((H - (bbox[3] - vy0)) / H) * 100, w: ((bbox[2] - bbox[0]) / W) * 100, h: ((bbox[3] - bbox[1]) / H) * 100 };
    };
    const model = { title: file.name.replace(/\.pdf$/i, '') + ' (미리보기)', size: [pages[0] ? pages[0].width : 960, pages[0] ? pages[0].height : 540], pages: [] };
    for (let i = 0; i < pages.length; i++) {
      status(`페이지 렌더링 중… ${i + 1}/${pages.length}`);
      const p = pages[i];
      const page = await pdf.getPage(i + 1);
      const vp = page.getViewport({ scale: Math.min(2, 2600 / p.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      model.pages.push({
        img: canvas.toDataURL('image/jpeg', 0.85), title: p.title,
        blocks: p.blocks.map((b) => ({ id: b.id, rect: toRect(b.bbox, p), text: b.text, caption: b.caption, inner: !!b.sub })),
        hotspots: p.hotspots.map((h) => ({ id: h.id, rect: toRect(h.bbox, p), label: h.label, targets: h.targets })),
        links: p.links.map((l) => ({ page: l.page, hotspot: l.hotspot, rect: toRect(l.bbox, p) })),
        behaviors: [], tables: [], num: String(i + 1), label: p.title || `페이지 ${i + 1}`,
      });
    }
    status('');
    start(model, {
      getShareUrl: async () => { throw new Error('로컬 미리보기는 공유할 수 없어요. 로컬 Claude Code에서 /doc2proto 로 배포하세요'); },
    });
  } catch (e) {
    console.error(e);
    status('변환에 실패했어요: ' + (e && e.message ? e.message : e));
  }
}

/* ---------- 이벤트 ---------- */
const drop = $('#drop'), fileIn = $('#file');
if (drop) drop.addEventListener('click', () => fileIn.click());
if (fileIn) fileIn.addEventListener('change', () => fileIn.files[0] && openPdf(fileIn.files[0]));
if (drop) ['dragover', 'dragleave', 'drop'].forEach((t) =>
  drop.addEventListener(t, (e) => {
    e.preventDefault();
    drop.classList.toggle('over', t === 'dragover');
    if (t === 'drop' && e.dataTransfer.files[0]) openPdf(e.dataTransfer.files[0]);
  }));

const q = new URLSearchParams(location.search);
if (ART) {
  let cur = keyOfHash();
  if (cur) openDoc(null, DOCS.find((d) => d.key === cur)); else renderList();
  // 다른 기획서·버전으로 이동: 목록에서 처음 열 때만 그 자리에서, 나머지는 새로 불러온다 (뷰어는 한 페이지에 하나)
  window.addEventListener('hashchange', () => {
    const k = keyOfHash(); if (k === cur) return;
    if (!cur && k) { cur = k; openDoc(null, DOCS.find((d) => d.key === k)); } else location.reload();
  });
} else if (q.get('doc')) openDoc(q.get('doc'));
else renderList();

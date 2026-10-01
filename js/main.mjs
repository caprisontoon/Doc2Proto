// 정적 문서(docs/<slug>/<version>/data.json) 로딩 + 랜딩 목록 + PDF 빠른 미리보기(로컬 변환)
const $ = (s) => document.querySelector(s);
const landing = $('#landing');
const statusEl = $('#status');

function status(msg) {
  statusEl.textContent = msg;
  statusEl.hidden = !msg;
}

function start(model, opts) {
  landing.hidden = true;
  document.title = model.title + ' — Doc2Proto';
  window.D2P.init(model, { onNew: () => { location.href = location.pathname; }, ...opts });
}

/* ---------- 배포된 문서 열기: ?doc=docs/<slug>/<version> ---------- */
async function openDoc(docPath) {
  const base = docPath.replace(/\/+$/, '') + '/';
  if (!/^docs\/[\w가-힣.-]+\/[\w가-힣.-]+\/$/.test(base)) { status('잘못된 문서 경로예요'); return; }
  status('문서 불러오는 중…');
  const res = await fetch(base + 'data.json', { cache: 'no-cache' }).catch(() => null);
  if (!res || !res.ok) { status('문서를 찾을 수 없어요: ' + docPath); return; }
  const data = await res.json();
  const live = await fetch(base + 'live.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (live) live.src = base + live.src;
  // 버전 비교: 새 버전 폴더의 diff.json (이전 버전 대비)
  const diff = await fetch(base + 'diff.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const versions = await versionsOf(data.slug, data.version);
  if (diff) diff.baseDir = base.replace(/[^/]+\/$/, '') + diff.base + '/';
  const model = {
    title: data.title, version: data.version, generated: data.generated, size: data.size,
    pages: data.pages.map((p) => ({ ...p, img: base + p.img })), live, diff,
  };
  status('');
  start(model, {
    getShareUrl: async () => location.href,
    versions,
    diffOn: q.get('diff') !== '0',
  });
}

async function versionsOf(slug, current) {
  const idx = await fetch('docs/index.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const doc = idx && idx.docs.find((d) => d.slug === slug);
  if (!doc) return null;
  return doc.versions.map((v) => ({ version: v.version, label: v.version, href: `?doc=docs/${slug}/${v.version}`, current: v.version === current }));
}

/* ---------- 랜딩: 문서 목록 + 관리 (js/landing.mjs) ---------- */
const renderList = () => import('./landing.mjs').then((m) => m.renderLanding());

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
drop.addEventListener('click', () => fileIn.click());
fileIn.addEventListener('change', () => fileIn.files[0] && openPdf(fileIn.files[0]));
['dragover', 'dragleave', 'drop'].forEach((t) =>
  drop.addEventListener(t, (e) => {
    e.preventDefault();
    drop.classList.toggle('over', t === 'dragover');
    if (t === 'drop' && e.dataTransfer.files[0]) openPdf(e.dataTransfer.files[0]);
  }));

const q = new URLSearchParams(location.search);
if (q.get('doc')) openDoc(q.get('doc'));
else renderList();

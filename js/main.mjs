// 업로드 → pdf.js 로드 → 분석 → 뷰어 초기화 → URL 공유
import { analyzeDocument } from './analyzer.mjs';
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

const $ = (s) => document.querySelector(s);
const landing = $('#landing');
const statusEl = $('#status');
const MAX_SHARE = 4 * 1024 * 1024; // Vercel 함수 본문 한도(4.5MB) 이하

let sharedSrc = null; // 이미 URL로 접근 가능한 PDF 경로
let localBytes = null; // 업로드된 파일 원본(공유 시 서버로 전송)

function status(msg) {
  statusEl.textContent = msg;
  statusEl.hidden = !msg;
}

function toRect(bbox, page) {
  const [vx0, vy0] = page.origin, W = page.width, H = page.height;
  return {
    l: ((bbox[0] - vx0) / W) * 100,
    t: ((H - (bbox[3] - vy0)) / H) * 100,
    w: ((bbox[2] - bbox[0]) / W) * 100,
    h: ((bbox[3] - bbox[1]) / H) * 100,
  };
}

async function buildModel(data, name) {
  status('PDF 여는 중…');
  const pdf = await pdfjs.getDocument({
    data,
    cMapUrl: new URL('../vendor/pdfjs/cmaps/', import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href,
  }).promise;

  status('기획서 구조 분석 중…');
  const pages = await analyzeDocument(pdf, pdfjs.OPS, (i, n) => status(`기획서 구조 분석 중… ${i}/${n}`));

  const model = { title: name.replace(/\.pdf$/i, ''), pages: [] };
  for (let i = 0; i < pages.length; i++) {
    status(`페이지 렌더링 중… ${i + 1}/${pages.length}`);
    const p = pages[i];
    const page = await pdf.getPage(i + 1);
    const scale = Math.min(2, 2600 / p.width);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    model.pages.push({
      img: canvas.toDataURL('image/jpeg', 0.85),
      title: p.title,
      blocks: p.blocks.map((b) => ({ id: b.id, rect: toRect(b.bbox, p), text: b.text, caption: b.caption, sub: !!b.sub })),
      hotspots: p.hotspots.map((h) => ({ id: h.id, rect: toRect(h.bbox, p), label: h.label, targets: h.targets })),
      links: p.links.map((l) => ({ page: l.page, hotspot: l.hotspot, rect: toRect(l.bbox, p) })),
    });
  }
  status('');
  return model;
}

async function getShareUrl() {
  if (!sharedSrc) {
    if (!localBytes) throw new Error('공유할 문서가 없어요');
    if (localBytes.byteLength > MAX_SHARE) throw new Error('4MB 이하 PDF만 URL로 공유할 수 있어요');
    status('공유 URL 만드는 중…');
    const res = await fetch('api/upload', { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: localBytes })
      .catch(() => null);
    status('');
    if (!res || !res.ok) {
      const msg = res ? await res.text().catch(() => '') : '';
      throw new Error(res && res.status === 404
        ? '이 배포에는 공유 저장소가 아직 연결되지 않았어요'
        : '업로드에 실패했어요' + (msg ? `: ${msg.slice(0, 80)}` : ''));
    }
    sharedSrc = (await res.json()).url;
  }
  const u = new URL(location.href);
  u.search = '?src=' + encodeURIComponent(sharedSrc);
  return u.href;
}

async function open(data, name) {
  try {
    const model = await buildModel(data, name);
    landing.hidden = true;
    document.title = model.title + ' — Doc2Proto';
    window.D2P.init(model, {
      getShareUrl,
      onNew: () => { location.href = location.pathname; },
    });
  } catch (e) {
    console.error(e);
    status('변환에 실패했어요: ' + (e && e.message ? e.message : e));
  }
}

function pick(file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { status('PDF 파일만 올릴 수 있어요'); return; }
  sharedSrc = null;
  file.arrayBuffer().then((buf) => {
    localBytes = buf.slice(0);
    open(new Uint8Array(buf), file.name);
  });
}

// URL로 열기 (?src=…) — 같은 출처 또는 Vercel Blob만 허용
async function openFromSrc(src) {
  let u;
  try { u = new URL(src, location.href); } catch { status('잘못된 문서 주소예요'); return; }
  const ok = u.origin === location.origin || /\.public\.blob\.vercel-storage\.com$/.test(u.hostname);
  if (!ok) { status('허용되지 않은 문서 주소예요'); return; }
  status('문서 내려받는 중…');
  const res = await fetch(u).catch(() => null);
  if (!res || !res.ok) { status('문서를 내려받지 못했어요'); return; }
  const buf = await res.arrayBuffer();
  sharedSrc = u.origin === location.origin ? u.pathname.replace(/^\//, '') : u.href;
  localBytes = buf.slice(0);
  const name = decodeURIComponent(u.pathname.split('/').pop() || 'document.pdf');
  open(new Uint8Array(buf), name);
}

/* 랜딩 이벤트 */
const drop = $('#drop'), fileIn = $('#file');
drop.addEventListener('click', () => fileIn.click());
fileIn.addEventListener('change', () => pick(fileIn.files[0]));
['dragover', 'dragleave', 'drop'].forEach((t) =>
  drop.addEventListener(t, (e) => {
    e.preventDefault();
    drop.classList.toggle('over', t === 'dragover');
    if (t === 'drop') pick(e.dataTransfer.files[0]);
  }));
$('#trySample').addEventListener('click', () => openFromSrc('sample.pdf'));

const src = new URLSearchParams(location.search).get('src');
if (src) openFromSrc(src);

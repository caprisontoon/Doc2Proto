/* Doc2Proto 문서 뷰어 — window.D2P.init(model, opts)
   ① 스냅샷: PowerPoint가 내보낸 슬라이드 이미지를 그대로 보여준다 (다시 그리지 않음)
   ② 동작 화면: model.live 의 프로토타입을 목업 자리에 같은 크기로 끼운다 (인터랙션 ON)
   ③ 연결: 동작 화면 요소 data-spec="페이지:번호" ↔ Description 행/하위 항목 하이라이트
   model: { title, version, size:[wpt,hpt], pages:[{ img, num, label, kind, rows, hotspots, links, behaviors }], live }
   rect: { l, t, w, h } (슬라이드 대비 %) */
(function () {
  'use strict';

  const CSS = `
  :root{
    --bg:#e9ebef; --side:#ffffff; --ink:#1b1d22; --ink2:#4a4f5a; --muted:#8a909c; --line:#dde0e6;
    --brand:#4a55e0; --brand-soft:#eceefe; --hot:#e0454a; --hot-soft:rgba(224,69,74,.10);
    --link:#0e7a8f; --shadow:0 2px 14px rgba(20,24,40,.10);
    --fm:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans KR',sans-serif;
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg:#121317; --side:#1b1d23; --ink:#eceef2; --ink2:#b8bdc8; --muted:#7d8391; --line:#2c2f38;
      --brand:#7b84ff; --brand-soft:#262a4a; --hot:#ff6b70; --hot-soft:rgba(255,107,112,.14);
      --link:#4fc3d8; --shadow:0 2px 18px rgba(0,0,0,.5);
    }
  }
  .d2p{position:fixed;inset:0;display:grid;grid-template-columns:260px minmax(0,1fr);background:var(--bg);color:var(--ink);font:14px/1.6 var(--fm);-webkit-font-smoothing:antialiased}
  .d2p *{box-sizing:border-box}
  .d2p button{font:inherit;cursor:pointer;border:1px solid var(--line);background:var(--side);color:var(--ink);border-radius:8px;padding:6px 11px}
  .d2p button:hover{border-color:var(--brand)}
  /* ---- 사이드바 ---- */
  .d2p nav.toc{overflow:auto;padding:22px 14px 30px;background:var(--side);border-right:1px solid var(--line)}
  .d2p .toc .home{display:block;font-size:11px;letter-spacing:.14em;color:var(--brand);text-decoration:none;font-weight:800;padding:0 10px 6px}
  .d2p .toc .brand{font-weight:800;font-size:14px;padding:0 10px 2px;line-height:1.35}
  .d2p .toc .ver{font-size:12px;color:var(--muted);padding:0 10px 14px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .d2p .toc select{font:inherit;font-size:12px;border:1px solid var(--line);border-radius:6px;background:var(--side);color:var(--ink);padding:2px 4px}
  .d2p .ctl{margin:0 4px 14px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--bg)}
  .d2p .ctl .row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
  .d2p .ctl .row:last-child{margin-bottom:0}
  .d2p .ctl b{font-size:13px}
  .d2p .ctl small{display:block;color:var(--muted);font-size:11.5px;line-height:1.45;margin:2px 0 8px}
  .d2p .sw{width:46px;height:24px;border-radius:999px;border:0;background:#b9bdc8;position:relative;padding:0;flex:none}
  .d2p .sw::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .15s}
  .d2p .sw.on{background:var(--brand)} .d2p .sw.on::after{left:25px}
  .d2p .sw.sm{width:34px;height:18px} .d2p .sw.sm::after{width:12px;height:12px} .d2p .sw.sm.on::after{left:19px}
  .d2p .ctl .btns{display:flex;gap:6px}
  .d2p .ctl .btns button{flex:1;font-size:12.5px;padding:5px 6px}
  .d2p .evs{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}
  .d2p .evs button{font-size:12px;padding:3px 8px;border-radius:7px}
  .d2p .evlabel{font-size:11.5px;color:var(--muted);margin:8px 0 2px;font-weight:700}
  .d2p .ctl .live-only{display:none} .d2p.has-live .ctl .live-only{display:block}
  .d2p .toc a.sec{display:flex;gap:6px;text-decoration:none;color:var(--ink2);font-size:13.5px;padding:6px 10px;border-radius:7px;line-height:1.4}
  .d2p .toc a.sec em{font-style:normal;font-weight:700;color:var(--muted);min-width:28px;font-variant-numeric:tabular-nums}
  .d2p .toc a.sub{padding-left:22px;font-size:13px} .d2p .toc a.sub em{min-width:30px}
  .d2p .toc a.top{font-weight:700;color:var(--ink)}
  .d2p .toc a.chapter{margin-top:12px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:700}
  .d2p .toc a.plain{color:var(--muted)}
  .d2p .toc a .lv{margin-left:auto;font-size:10px;font-weight:800;color:#fff;background:var(--link);border-radius:4px;padding:0 5px;align-self:center;font-style:normal}
  .d2p .toc a:hover,.d2p .toc a.on{background:var(--brand-soft);color:var(--brand)}
  .d2p .toc a:hover em,.d2p .toc a.on em{color:var(--brand)}
  /* ---- 본문 ---- */
  .d2p main{overflow:auto;padding:26px 30px 80px;scroll-behavior:smooth}
  .d2p .slide-wrap{max-width:1400px;margin:0 auto 26px}
  .d2p .slide-scroll{overflow-x:auto;border-radius:6px;box-shadow:var(--shadow)}
  .d2p .slide{position:relative;container-type:inline-size;width:100%;min-width:760px;background:#fff;overflow:hidden}
  .d2p .slide img.bg{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none;pointer-events:none}
  .d2p .ov{position:absolute;border-radius:3px}
  /* 하이라이트 (원본 위에 투명하게) */
  .d2p .hl{position:absolute;pointer-events:none;border-radius:2px;opacity:0;transition:opacity .2s;background:rgba(255,214,0,.30);box-shadow:inset 0 0 0 2px #f2c94c}
  .d2p .hl.soft{background:rgba(255,214,0,.12);box-shadow:inset 0 0 0 1px rgba(242,201,76,.7)}
  .d2p .hl.on{opacity:1}
  .d2p .rowhit{position:absolute;cursor:pointer;border-radius:2px}
  .d2p .rowhit:hover{background:rgba(74,85,224,.07)}
  .d2p.off .rowhit,.d2p.off .dot,.d2p.off .hs,.d2p.off .lnk,.d2p.off .bh{display:none}
  /* 선택 가능한 텍스트 층 (인터랙션 OFF) — 원본 위에 투명하게 겹친 같은 글자 */
  .d2p .tl{position:absolute;inset:0;z-index:20;display:none;line-height:1;cursor:text;user-select:text;-webkit-user-select:text}
  .d2p.off .tl{display:block}
  .d2p .tl span{position:absolute;white-space:pre;color:transparent;transform-origin:0 0;font-family:var(--fm)}
  .d2p .tl span.b{font-weight:700}
  .d2p .tl ::selection{background:rgba(74,85,224,.32);color:transparent}

  /* 번호 마커 위 클릭 영역 (원본 마커 그대로, 테두리만) */
  .d2p .dot{position:absolute;z-index:12;transform:translate(-50%,-50%);width:calc(var(--d)*1.25);height:calc(var(--d)*1.25);border-radius:999px;cursor:pointer}
  .d2p .dot:hover,.d2p .dot.active{box-shadow:0 0 0 2px #fff,0 0 0 4px var(--brand)}
  .d2p .dot.inframe{display:none;width:auto;min-width:calc(var(--d)*1.05);height:calc(var(--d)*1.05);padding:0 calc(var(--d)*.2);background:#d93025;color:#fff;
    font-weight:800;font-size:calc(100cqw/var(--wpt)*6.6);line-height:calc(var(--d)*1.05);text-align:center;white-space:nowrap;box-shadow:0 0 0 1.5px #fff}
  .d2p.live-on.nums .dot.inframe{display:block}
  .d2p.live-on .dot.inframe.active{background:var(--brand)}
  .d2p .hs{border:2px dashed transparent;cursor:pointer;transition:border-color .15s,background .15s}
  .d2p .hs:hover,.d2p .hs.active{border-color:var(--hot);background:var(--hot-soft)}
  .d2p.live-on .slide.has-live .hs{display:none}
  .d2p .lnk{border:2px dotted var(--link);cursor:pointer;background:rgba(14,122,143,.04)}
  .d2p .lnk:hover{background:rgba(14,122,143,.16)}
  /* 동작 화면 */
  .d2p iframe.live{position:absolute;border:0;z-index:8;background:#fff;display:none}
  .d2p.live-on iframe.live{display:block}
  .d2p .livebadge{position:absolute;z-index:13;font-size:11px;font-weight:800;background:var(--link);color:#fff;border-radius:5px;padding:1px 7px;pointer-events:none;transform:translate(-100%,-125%);display:none}
  .d2p.live-on .livebadge{display:block}
  /* 단순 동작 (툴팁 등) */
  .d2p .bh{cursor:pointer;border:2px solid transparent;border-radius:5px;transition:background .15s,border-color .15s}
  .d2p .bh:hover{background:rgba(14,122,143,.14);border-color:var(--link)}
  .d2p .bh.on{background:rgba(74,85,224,.18);border-color:var(--brand)}
  .d2p .tip{position:absolute;z-index:25;max-width:280px;background:var(--ink);color:var(--bg);font-size:12.5px;line-height:1.5;padding:8px 11px;border-radius:8px;box-shadow:var(--shadow);pointer-events:none}
  .d2p .drop{position:absolute;z-index:24;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);overflow:hidden}
  .d2p .drop canvas,.d2p .modal canvas{display:block;max-width:100%;height:auto}
  .d2p .backdrop{position:fixed;inset:0;background:rgba(20,24,40,.45);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px}
  .d2p .modal{background:var(--side);border-radius:14px;box-shadow:var(--shadow);max-width:min(900px,96vw);max-height:90vh;overflow:auto}
  .d2p .modal .mh{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)} .d2p .modal .mh b{flex:1}
  .d2p .modal .mb{padding:14px} .d2p .modal .mb p{margin:0 0 10px;color:var(--ink2);font-size:13px;white-space:pre-wrap}
  .d2p .fakein{position:absolute;z-index:23;font:inherit;font-size:13px;padding:4px 8px;border:2px solid var(--brand);border-radius:6px;background:#fff;color:#1b1d22;outline:0}
  /* 관련 기획 카드 */
  .d2p .refs{position:fixed;right:18px;bottom:18px;width:min(380px,calc(100vw - 36px));max-height:52vh;overflow:auto;background:var(--side);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);z-index:30;display:none}
  .d2p .refs.open{display:block}
  .d2p .refs .rh{position:sticky;top:0;background:var(--side);display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)}
  .d2p .refs .rh b{flex:1;font-size:13.5px}
  .d2p .refs .rh button{padding:2px 8px;font-size:12px}
  .d2p .refs .it{padding:10px 14px;border-bottom:1px solid var(--line)}
  .d2p .refs .it:last-child{border-bottom:0}
  .d2p .refs .it .k{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700}
  .d2p .refs .it .k i{font-style:normal;background:#d93025;color:#fff;border-radius:999px;padding:0 6px;font-size:11px}
  .d2p .refs .it .k .here{color:var(--link);font-size:11px;font-weight:700}
  .d2p .refs .it .k button{margin-left:auto;padding:1px 8px;font-size:11.5px}
  .d2p .refs .it p{margin:4px 0 0;font-size:12.5px;color:var(--ink2);white-space:pre-wrap;line-height:1.5}
  .d2p .toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:9px 16px;border-radius:9px;font-size:13px;opacity:0;transition:opacity .25s;z-index:40;pointer-events:none}
  .d2p .toast.show{opacity:.95}
  .d2p .slide-wrap .cap{font-size:12px;color:var(--muted);margin:6px 4px 0;display:flex;gap:10px;align-items:center}
  .d2p .slide-wrap .cap b{color:var(--ink2)}
  .d2p .slide-wrap .cap a{color:var(--muted);text-decoration:none;margin-left:auto} .d2p .slide-wrap .cap a:hover{color:var(--brand)}
  .d2p .copybtn{position:absolute;z-index:6;font-size:11px;padding:1px 7px;border-radius:5px;background:#fff;border:1px solid #cfd3db;color:#444;opacity:0;transition:opacity .15s}
  .d2p .slide:hover .copybtn{opacity:.95}
  @media print{
    .d2p{position:static;display:block}
    .d2p nav.toc,.d2p .refs,.d2p .toast,.d2p .dot,.d2p .hs,.d2p .lnk,.d2p .bh,.d2p .hl,.d2p .rowhit,.d2p iframe.live,.d2p .livebadge,.d2p .copybtn,.d2p .cap{display:none!important}
    .d2p main{overflow:visible;padding:0}
    .d2p .slide-wrap{max-width:none;margin:0;page-break-after:always}
    .d2p .slide-scroll{box-shadow:none;border-radius:0}
    .d2p .slide{min-width:0}
  }
  @media (max-width:760px){ .d2p{grid-template-columns:1fr} .d2p nav.toc{display:none} .d2p main{padding:12px} }
  `;

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const place = (n, r) => { n.style.left = r.l + '%'; n.style.top = r.t + '%'; n.style.width = r.w + '%'; n.style.height = r.h + '%'; };

  function init(model, opts = {}) {
    if (!document.getElementById('d2p-style')) { const st = el('style'); st.id = 'd2p-style'; st.textContent = CSS; document.head.appendChild(st); }
    const root = opts.root || document.getElementById('app');
    root.innerHTML = '';
    root.className = 'd2p';
    const P = model.pages;
    const [WPT, HPT] = model.size || [960, 540];
    const LIVE = model.live || null;
    const liveByPage = {};
    if (LIVE) for (const f of LIVE.frames || []) liveByPage[f.page - 1] = f;
    if (LIVE) root.classList.add('has-live', 'live-on', 'nums');

    /* ---------- 공통 UI ---------- */
    const toast = el('div', 'toast'); let toastT;
    const say = (m) => { toast.textContent = m; toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 1800); };
    const refs = el('div', 'refs');

    /* ---------- 참조 해석: "21:7", "8:1-4", "20:공통" ---------- */
    function resolve(ref) {
      const m = /^(\d+):(.+)$/.exec(ref); if (!m) return null;
      const pi = +m[1] - 1, key = m[2].trim(), p = P[pi]; if (!p) return null;
      const rows = (p.rows || []).filter((r) => r.role !== 'tooltip');
      const main = key.includes('-') ? key.split('-')[0] : key;
      const row = rows.find((r) => r.key === key) || rows.find((r) => r.key === main);
      if (!row) return { pi, key, rect: null, title: key, text: '' };
      const sub = key.includes('-') && row.subs ? row.subs[key] : null;
      let text = row.text || '';
      if (sub) {   // 하위 항목 텍스트만 추출
        const lines = text.split('\n'); const i = lines.findIndex((l) => l.trim().startsWith(key + '.') || l.trim().startsWith(key + ' '));
        if (i >= 0) { let j = i + 1; while (j < lines.length && !/^\s*\d{1,2}\s*-\s*\d{1,2}\s*[.)]?\s/.test(lines[j])) j++; text = lines.slice(i, j).join('\n').trim(); }
      }
      const title = (sub ? text.split('\n')[0] : (row.title || key)).replace(new RegExp('^' + key + '\\s*\\|\\s*'), '');
      return { pi, key, rect: sub || row.rect, rowRect: row.rect, sub: !!sub, title, text };
    }

    /* ---------- 사이드바 ---------- */
    const nav = el('nav', 'toc');
    const home = el('a', 'home', 'DOC2PROTO'); home.href = opts.homeHref || './';
    nav.append(home, el('div', 'brand', model.title));
    const ver = el('div', 'ver');
    if (opts.versions && opts.versions.length > 1) {
      const sel = el('select');
      for (const v of opts.versions) { const o = el('option', null, v.label); o.value = v.href; o.selected = !!v.current; sel.append(o); }
      sel.onchange = () => { location.href = sel.value; };
      ver.append(sel);
    } else if (model.version) ver.append(el('span', null, model.version));
    if (model.generated) ver.append(el('span', null, '· ' + model.generated));
    nav.append(ver);

    const ctl = el('div', 'ctl');
    const r1 = el('div', 'row'); r1.append(el('b', null, '인터랙션'));
    const sw = el('button', 'sw on'); sw.setAttribute('aria-label', '인터랙션 모드'); r1.append(sw);
    ctl.append(r1);
    const offHint = el('small', null, '인터랙션을 끄면 원본 기획서를 그대로 보면서 텍스트를 드래그해 복사할 수 있어요.');
    const hint = el('small', null, LIVE
      ? '목업 자리의 화면이 실제로 동작해요. 요소를 누르면 해당 Description이 노랗게 표시되고, 다른 페이지의 관련 기획은 오른쪽 아래에 떠요. 끄면 원본 기획서 그대로 보여요.'
      : '번호 마커를 누르면 Description이 노랗게 표시돼요. Description을 누르면 화면 위치가 표시돼요.');
    ctl.append(hint, offHint); offHint.style.display = 'none';
    if (LIVE) {
      const r3 = el('div', 'row live-only'); r3.style.display = 'flex';
      r3.append(el('span', null, '기획 번호 표시'));
      const insp = el('button', 'sw sm on'); r3.append(insp);
      insp.onclick = () => { insp.classList.toggle('on'); const on = insp.classList.contains('on'); root.classList.toggle('nums', on); broadcast({ type: 'inspect', on }); };
      ctl.append(r3);
      for (const g of LIVE.events || []) {
        ctl.append(el('div', 'evlabel live-only', g.group));
        const box = el('div', 'evs live-only');
        for (const ev of g.items) {
          const b = el('button', null, ev.label);
          b.onclick = () => { const f = current(); if (f) send(f, { type: 'event', name: ev.name, value: ev.value }); else say('동작 화면이 있는 페이지에서 눌러 주세요'); };
          box.append(b);
        }
        ctl.append(box);
      }
    }
    const r2 = el('div', 'row btns'); r2.style.marginTop = '10px';
    const bPrint = el('button', null, '인쇄'); const bShare = el('button', null, '링크 복사');
    r2.append(bPrint, bShare);
    ctl.append(r2);
    nav.append(ctl);

    const tocLinks = P.map((p, i) => {
      const a = el('a');
      const kind = p.kind || 'page';
      a.className = 'sec ' + (kind === 'chapter' ? 'chapter' : !p.num ? 'plain' : p.num.includes('.') ? 'sub' : 'top');
      a.href = '#s' + (i + 1);
      if (p.num && kind !== 'chapter') a.append(el('em', null, p.num));
      a.append(el('span', null, p.label || p.title || `페이지 ${i + 1}`));
      if (liveByPage[i]) a.append(el('i', 'lv', 'LIVE'));
      a.onclick = (e) => { e.preventDefault(); goto(i); };
      nav.append(a);
      return a;
    });

    /* ---------- 본문 ---------- */
    const main = el('main');
    const slides = [];
    let floating = null;
    const clearFloating = () => { if (floating) { floating.remove(); floating = null; } };

    P.forEach((p, i) => {
      const sec = el('section', 'slide-wrap'); sec.id = 's' + (i + 1);
      const scroll = el('div', 'slide-scroll');
      const stage = el('div', 'slide');
      stage.style.aspectRatio = `${WPT}/${HPT}`;
      const img = el('img', 'bg'); img.src = p.img; img.alt = p.label || ''; img.loading = i < 3 ? 'eager' : 'lazy';
      stage.append(img);
      const S = { sec, stage, img, hlEls: [], hsEls: {}, frame: liveByPage[i] || null, iframe: null };
      slides.push(S);

      // Description 행/하위 항목: 투명 클릭 영역 + 하이라이트
      for (const r of p.rows || []) {
        if (r.role === 'tooltip') continue;
        const targets = r.subs ? Object.entries(r.subs) : [[r.key, r.rect]];
        if (r.subs) {   // 하위 항목이 있으면 행 머리(첫 하위 항목 위)도 행 단위로
          const first = Math.min(...Object.values(r.subs).map((x) => x.t));
          if (first - r.rect.t > 1) targets.unshift([r.key, { ...r.rect, h: first - r.rect.t }]);
        }
        for (const [key, rect] of targets) {
          const hit = el('div', 'rowhit'); place(hit, rect);
          hit.title = `${p.num ? p.num + ' · ' : ''}${key}`;
          hit.onclick = (e) => { e.stopPropagation(); fromDescription(i, key); };
          stage.append(hit);
        }
      }
      // 번호 마커 / 핫스팟
      const dd = `calc(100cqw / ${WPT} * 12)`;
      for (const h of p.hotspots || []) {
        const n = el('div', 'ov hs'); place(n, h.rect); n.title = h.label || '';
        n.onclick = (e) => { e.stopPropagation(); fromMarker(i, h); };
        stage.append(n); S.hsEls[h.id] = n;
        if (h.marker != null && h.marker_rect) {
          const d = el('div', 'dot'); d.style.setProperty('--d', dd);
          d.style.left = (h.marker_rect.l + h.marker_rect.w / 2) + '%'; d.style.top = (h.marker_rect.t + h.marker_rect.h / 2) + '%';
          d.title = `${h.marker}번`;
          const fr = liveByPage[i] && liveByPage[i].rect, mcx = h.marker_rect.l + h.marker_rect.w / 2, mcy = h.marker_rect.t + h.marker_rect.h / 2;
          if (fr && mcx > fr.l && mcx < fr.l + fr.w && mcy > fr.t && mcy < fr.t + fr.h) { d.classList.add('inframe'); d.textContent = String(h.marker); d.style.setProperty('--wpt', WPT); }
          d.onclick = (e) => { e.stopPropagation(); fromMarker(i, h); };
          stage.append(d); n._dot = d;
        }
      }
      for (const l of p.links || []) {
        const n = el('div', 'ov lnk'); place(n, l.rect);
        n.title = `${P[l.page].num ? P[l.page].num + ' ' : ''}${P[l.page].label || ''} 상세로 이동`;
        n.onclick = (e) => { e.stopPropagation(); goto(l.page, l.hotspot); };
        stage.append(n);
      }
      for (const b of p.behaviors || []) mountBehavior(S, i, b);
      // 표 복사 (보이지 않는 데이터에서 생성 — 원본 화면은 그대로)
      for (const t of p.tables || []) {
        if (!t.cells) continue;
        const cb = el('button', 'copybtn', '⧉ 표 복사');
        cb.style.left = `calc(${t.rect.l + t.rect.w}% - 64px)`; cb.style.top = `calc(${t.rect.t}% - 20px)`;
        cb.onclick = (e) => { e.stopPropagation(); copyTable(t); };
        stage.append(cb);
      }
      // 선택 가능한 텍스트 층
      if ((p.text || []).length) {
        const tl = el('div', 'tl');
        for (const t of p.text) {
          const sp = el('span', t.b ? 'b' : null, t.x);
          sp.style.left = t.l + '%'; sp.style.top = t.t + '%';
          sp.style.lineHeight = `calc(100cqw * ${(t.h * HPT / WPT).toFixed(4)} / 100)`;
          sp.style.fontSize = `calc(100cqw * ${t.s} / 100)`;
          sp.dataset.w = t.w;
          tl.append(sp, document.createElement('br'));
        }
        stage.append(tl); S.tl = tl;
      }
      // 동작 화면 자리
      if (S.frame) {
        const badge = el('div', 'livebadge', '● 동작 화면');
        badge.style.left = (S.frame.rect.l + S.frame.rect.w) + '%'; badge.style.top = S.frame.rect.t + '%';
        stage.append(badge);
        stage.classList.add('has-live');
      }
      const areaOf = (n) => parseFloat(n.style.width || 0) * parseFloat(n.style.height || 0);
      [...stage.querySelectorAll('.ov')].sort((a, b) => areaOf(b) - areaOf(a)).forEach((n) => stage.append(n));
      stage.onclick = () => { clearActive(); clearFloating(); };

      scroll.append(stage); sec.append(scroll);
      const cap = el('div', 'cap');
      if (p.num) cap.append(el('b', null, p.num));
      cap.append(el('span', null, p.label || p.title || ''));
      const lk = el('a', null, '#' + (i + 1)); lk.href = '#s' + (i + 1); lk.title = '이 페이지 링크 복사';
      lk.onclick = (e) => { e.preventDefault(); history.replaceState(null, '', '#s' + (i + 1)); navigator.clipboard.writeText(location.href).then(() => say('페이지 링크를 복사했어요')); };
      cap.append(lk);
      sec.append(cap);
      main.append(sec);
    });

    /* ---------- 텍스트 층 줄 폭 맞춤 ---------- */
    function fitText(S) {
      if (!S.tl || S.tlFit) return;
      const W = S.stage.clientWidth; if (!W) return;
      S.tl.style.display = 'block';
      for (const sp of S.tl.children) {
        if (sp.tagName !== 'SPAN') continue;
        sp.style.transform = '';
        const target = W * (+sp.dataset.w) / 100, real = sp.getBoundingClientRect().width;
        if (real > 0) sp.style.transform = `scaleX(${target / real})`;
      }
      S.tl.style.display = '';
      S.tlFit = true;
    }
    const tio = new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) { const S = slides.find((s) => s.sec === e.target); if (S) fitText(S); }
    }, { root: main, rootMargin: '600px 0px' });
    slides.forEach((S) => S.tl && tio.observe(S.sec));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => slides.forEach((S) => { if (S.tlFit) { S.tlFit = false; fitText(S); } }));

    /* ---------- 동작 화면 iframe (보이는 슬라이드만 띄움) ---------- */
    function mountLive(S) {
      if (S.iframe || !S.frame) return;
      const f = el('iframe', 'live');
      place(f, S.frame.rect);
      const qs = `embed=1&state=${encodeURIComponent(S.frame.state || 'live')}`;
      f.src = LIVE.src.startsWith('blob:') ? `${LIVE.src}#${qs}` : `${LIVE.src}${LIVE.src.includes('?') ? '&' : '?'}${qs}`;
      f.setAttribute('title', '동작 화면');
      f.setAttribute('allow', 'clipboard-write');
      S.stage.append(f); S.iframe = f;
    }
    function unmountLive(S) { if (S.iframe) { S.iframe.remove(); S.iframe = null; } }
    const lio = new IntersectionObserver((ents) => {
      for (const e of ents) { const S = slides.find((s) => s.sec === e.target); if (!S) continue; if (e.isIntersecting) mountLive(S); else unmountLive(S); }
    }, { root: main, rootMargin: '300px 0px' });
    if (LIVE) slides.forEach((S) => S.frame && lio.observe(S.sec));
    const send = (S, msg) => { if (S && S.iframe && S.iframe.contentWindow) S.iframe.contentWindow.postMessage(Object.assign({ d2p: true }, msg), '*'); };
    const broadcast = (msg) => slides.forEach((S) => send(S, msg));
    let currentIdx = 0;
    const current = () => { const S = slides[currentIdx]; return S && S.iframe ? S : slides.find((s) => s.iframe && isVisible(s.sec)); };
    const isVisible = (n) => { const r = n.getBoundingClientRect(), mr = main.getBoundingClientRect(); return r.bottom > mr.top + 80 && r.top < mr.bottom - 80; };

    window.addEventListener('message', (e) => {
      const m = e.data; if (!m || !m.d2p) return;
      const S = slides.find((s) => s.iframe && s.iframe.contentWindow === e.source); if (!S) return;
      const pi = slides.indexOf(S);
      if (m.type === 'spec') showRefs(pi, m.refs, m.label);
    });

    /* ---------- 하이라이트 ---------- */
    let hlTimer;
    function clearLit() { root.querySelectorAll('.hl').forEach((x) => x.remove()); }
    function clearActive() { root.querySelectorAll('.hs.active,.dot.active').forEach((x) => x.classList.remove('active')); }
    function light(pi, rect, soft) {
      if (!rect) return;
      const n = el('div', 'hl' + (soft ? ' soft' : '')); place(n, rect); slides[pi].stage.append(n);
      requestAnimationFrame(() => n.classList.add('on'));
      clearTimeout(hlTimer); hlTimer = setTimeout(clearLit, 5000);
    }
    function lightRef(ref, keep) {
      const r = resolve(ref); if (!r || !r.rect) return null;
      if (!keep) clearLit();
      if (r.sub) light(r.pi, r.rowRect, true);
      light(r.pi, r.rect);
      return r;
    }
    function markHotspots(pi, key) {
      for (const h of P[pi].hotspots || []) {
        if (String(h.marker) === key || (!key.includes('-') && String(h.marker) === key)) {
          const n = slides[pi].hsEls[h.id]; if (n) { n.classList.add('active'); if (n._dot) n._dot.classList.add('active'); }
        }
      }
    }
    // 번호 마커 클릭 → Description + 동작 화면 요소 표시
    function fromMarker(pi, h) {
      clearActive();
      const n = slides[pi].hsEls[h.id]; if (n) { n.classList.add('active'); if (n._dot) n._dot.classList.add('active'); }
      const key = h.marker != null ? String(h.marker) : null;
      let ok = null;
      if (key) ok = lightRef(`${pi + 1}:${key}`);
      if (!ok) {   // 마커가 없는 핫스팟: 연결된 블록
        clearLit();
        for (const id of h.targets || []) { const b = (P[pi].blocks || [])[id]; if (b) light(pi, b.rect); }
        if (!(h.targets || []).length) say('연결된 설명이 없는 영역이에요');
      }
      for (const b of P[pi].behaviors || []) if (b.source === 'connector' && b.rect && h.rect && Math.abs(b.rect.l - h.rect.l) < 0.5 && Math.abs(b.rect.t - h.rect.t) < 0.5) runBehavior(slides[pi], pi, b);
      if (key) focusLive(pi, `${pi + 1}:${key}`);
      history.replaceState(null, '', `#p=${pi + 1}&h=${h.id}`);
    }
    // Description 클릭 → 마커 + 동작 화면 요소 표시
    function fromDescription(pi, key) {
      clearActive();
      lightRef(`${pi + 1}:${key}`);
      markHotspots(pi, key);
      focusLive(pi, `${pi + 1}:${key}`);
    }
    function focusLive(pi, ref) {
      const S = slides[pi]; if (!S.iframe || !root.classList.contains('live-on')) return;
      send(S, { type: 'focus', ref });
    }
    // 동작 화면 요소 클릭 → 관련 기획 표시
    function showRefs(pi, list, label) {
      const items = list.map(resolve).filter(Boolean);
      if (!items.length) return;
      clearLit(); clearActive();
      items.filter((r) => r.pi === pi).forEach((r) => { lightRef(`${r.pi + 1}:${r.key}`, true); markHotspots(pi, r.key); });
      refs.innerHTML = '';
      const head = el('div', 'rh'); head.append(el('b', null, `관련 기획 · ${label || '선택한 요소'}`));
      const x = el('button', null, '✕'); x.onclick = () => refs.classList.remove('open'); head.append(x);
      refs.append(head);
      items.sort((a, b) => (a.pi === pi ? -1 : 0) - (b.pi === pi ? -1 : 0) || a.pi - b.pi);
      for (const r of items) {
        const it = el('div', 'it'); const k = el('div', 'k');
        k.append(el('span', null, `${r.pi + 1}p ${P[r.pi].num ? '(' + P[r.pi].num + ')' : ''}`), el('i', null, r.key));
        k.append(el('span', null, r.title.replace(/^\d{1,2}-\d{1,2}\.\s*/, '')));
        if (r.pi === pi) k.append(el('span', 'here', '이 페이지'));
        else { const go = el('button', null, '보기 →'); go.onclick = () => { goto(r.pi); setTimeout(() => { lightRef(`${r.pi + 1}:${r.key}`); markHotspots(r.pi, r.key); }, 450); }; k.append(go); }
        it.append(k);
        const body = r.text.split('\n').slice(1).join('\n').trim();
        if (body) it.append(el('p', null, body.length > 320 ? body.slice(0, 320) + '…' : body));
        refs.append(it);
      }
      refs.classList.add('open');
    }

    /* ---------- 표 복사 ---------- */
    async function copyTable(t) {
      const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      const rows = t.cells.rows.map((row) => row.filter(Boolean));
      const html = '<table border="1" cellspacing="0" style="border-collapse:collapse;font-family:Malgun Gothic,sans-serif;font-size:10pt">' +
        rows.map((row) => '<tr>' + row.map((c) => `<td style="padding:4px 8px;border:1px solid #d9d9d9;vertical-align:top;white-space:pre-wrap;${c.bold ? 'font-weight:700;' : ''}${c.bg ? 'background:' + c.bg + ';' : ''}"${c.colspan > 1 ? ` colspan="${c.colspan}"` : ''}${c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ''}>${esc(c.text).replace(/\n/g, '<br>')}</td>`).join('') + '</tr>').join('') + '</table>';
      const tsv = rows.map((row) => row.map((c) => c.text.replace(/\n/g, ' ').replace(/\t/g, ' ')).join('\t')).join('\n');
      try {
        if (window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([tsv], { type: 'text/plain' }) })]);
        else await navigator.clipboard.writeText(tsv);
        say('표를 복사했어요 — 엑셀·노션·메일에 붙여넣기');
      } catch { say('복사하지 못했어요'); }
    }

    /* ---------- 단순 동작 (라이브 화면이 없는 문서용) ---------- */
    function crop(img, rect, maxW) {
      const c = document.createElement('canvas');
      const sx = img.naturalWidth * rect.l / 100, sy = img.naturalHeight * rect.t / 100, sw = img.naturalWidth * rect.w / 100, sh = img.naturalHeight * rect.h / 100;
      const k = Math.min(1, maxW / sw); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height); return c;
    }
    function runBehavior(S, pi, b, n) {
      const stage = S.stage;
      const anchor = (node) => { const r = (n || stage).getBoundingClientRect(), sr = stage.getBoundingClientRect(); let top = r.bottom - sr.top + 6, left = r.left - sr.left; if (top + node.offsetHeight > stage.offsetHeight) top = Math.max(4, r.top - sr.top - node.offsetHeight - 6); left = Math.max(4, Math.min(left, stage.offsetWidth - node.offsetWidth - 4)); node.style.top = top + 'px'; node.style.left = left + 'px'; };
      if (b.kind === 'tooltip') { clearFloating(); const t = el('div', 'tip', b.content); stage.append(t); anchor(t); floating = t; }
      else if (b.kind === 'dropdown') { clearFloating(); const d = el('div', 'drop'); if (b.show_rect) d.append(crop(S.img, b.show_rect, 420)); else { const q = el('div', null, b.content); q.style.cssText = 'padding:10px 12px;font-size:13px;max-width:280px;color:#1b1d22'; d.append(q); } stage.append(d); anchor(d); floating = d; }
      else if (b.kind === 'popup') { clearFloating(); const bd = el('div', 'backdrop'); const m = el('div', 'modal'); const mh = el('div', 'mh'); const x = el('button', null, '✕'); mh.append(el('b', null, b.label || '팝업'), x); const mb = el('div', 'mb'); if (b.content) mb.append(el('p', null, b.content)); if (b.show_rect) mb.append(crop(S.img, b.show_rect, 860)); m.append(mh, mb); bd.append(m); root.append(bd); const close = () => bd.remove(); x.onclick = close; bd.onclick = (e) => { if (e.target === bd) close(); }; }
      else if (b.kind === 'navigate') { if (b.target_page != null && P[b.target_page - 1]) goto(b.target_page - 1); else say('이동: ' + (b.content || b.label)); }
      else if (b.kind === 'toast') say(b.content || b.label);
      else if (b.kind === 'toggle' && n) { n.classList.toggle('on'); say((n.classList.contains('on') ? 'ON — ' : 'OFF — ') + (b.content || b.label)); }
      else if (b.kind === 'input' && n) { clearFloating(); const inp = el('input', 'fakein'); inp.placeholder = b.content || '입력'; const r = n.getBoundingClientRect(), sr = stage.getBoundingClientRect(); inp.style.left = (r.left - sr.left) + 'px'; inp.style.top = (r.top - sr.top) + 'px'; inp.style.width = Math.max(120, r.width) + 'px'; inp.onclick = (e) => e.stopPropagation(); inp.onkeydown = (e) => { if (e.key === 'Enter') { say('전송: ' + (inp.value || '(빈 입력)')); inp.value = ''; } }; stage.append(inp); inp.focus(); floating = inp; }
    }
    function mountBehavior(S, pi, b) {
      if (b.source === 'connector') return;   // 마커 클릭 시 함께 실행
      if (S.frame) return;                     // 동작 화면이 있으면 그쪽이 담당
      const n = el('div', 'ov bh k-' + b.kind); place(n, b.rect); n.title = b.label || '';
      if (b.trigger === 'hover' && b.kind === 'tooltip') { n.onmouseenter = () => runBehavior(S, pi, b, n); n.onmouseleave = clearFloating; n.onclick = (e) => e.stopPropagation(); }
      else n.onclick = (e) => { e.stopPropagation(); runBehavior(S, pi, b, n); };
      S.stage.append(n);
    }

    /* ---------- 이동 / 해시 / 목차 ---------- */
    let navLock = 0;
    function goto(i, hsId) {
      const S = slides[i]; if (!S) return;
      tocLinks.forEach((a, k) => a.classList.toggle('on', k === i)); currentIdx = i;
      navLock = Date.now() + 900;
      S.sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', '#s' + (i + 1));
      if (hsId != null) { const h = (P[i].hotspots || []).find((x) => x.id === hsId); if (h) setTimeout(() => fromMarker(i, h), 450); }
    }
    function applyHash() {
      let m = /#p=(\d+)(?:&h=(\d+))?/.exec(location.hash);
      if (m) { goto(+m[1] - 1, m[2] != null ? +m[2] : undefined); return; }
      m = /#s(\d+)/.exec(location.hash);
      if (m) goto(+m[1] - 1);
    }
    const io = new IntersectionObserver((ents) => {
      if (Date.now() < navLock) return;
      const vis = ents.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!vis) return;
      const i = slides.findIndex((s) => s.sec === vis.target);
      currentIdx = i;
      tocLinks.forEach((a, k) => a.classList.toggle('on', k === i));
    }, { root: main, threshold: [0.25, 0.5, 0.75] });
    slides.forEach((s) => io.observe(s.sec));

    /* ---------- 컨트롤 ---------- */
    sw.onclick = () => {
      sw.classList.toggle('on');
      const on = sw.classList.contains('on');
      root.classList.toggle('off', !on);
      hint.style.display = on ? '' : 'none'; offHint.style.display = on ? 'none' : '';
      if (LIVE) root.classList.toggle('live-on', on);
      if (!on) { refs.classList.remove('open'); clearLit(); clearActive(); }
    };
    bPrint.onclick = () => setTimeout(() => window.print(), 50);
    bShare.onclick = async () => {
      try { const url = await (opts.getShareUrl ? opts.getShareUrl() : Promise.resolve(location.href)); await navigator.clipboard.writeText(url); say('링크를 복사했어요'); }
      catch (e) { say(e && e.message ? e.message : '링크를 만들지 못했어요'); }
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { clearFloating(); refs.classList.remove('open'); const bd = root.querySelector('.backdrop'); if (bd) bd.remove(); } });
    window.addEventListener('hashchange', applyHash);

    root.append(nav, main, refs, toast);
    setTimeout(applyHash, 50);
    return { goto, lightRef };
  }

  window.D2P = { init };
})();

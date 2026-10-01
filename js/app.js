/* Doc2Proto 문서 뷰어 — window.D2P.init(model, opts)
   한 페이지로 이어지는 슬라이드 + 목차, 슬라이드 위에 HTML 표, 번호 dot ↔ Description, 프로토타입 동작.
   model: { title, version, size:[wpt,hpt], pages:[{ img, num, label, kind, tables, blocks, hotspots, links, behaviors }] }
   rect: { l, t, w, h } (슬라이드 대비 %) */
(function () {
  'use strict';

  const CSS = `
  :root{
    --bg:#e9ebef; --side:#ffffff; --ink:#1b1d22; --ink2:#4a4f5a; --muted:#8a909c; --line:#dde0e6;
    --brand:#4a55e0; --brand-soft:#eceefe; --hot:#e0454a; --hot-soft:rgba(224,69,74,.10);
    --link:#0e7a8f; --lit:#fff3b0; --lit-line:#f2c94c; --shadow:0 2px 14px rgba(20,24,40,.10);
    --fm:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans KR',sans-serif;
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg:#121317; --side:#1b1d23; --ink:#eceef2; --ink2:#b8bdc8; --muted:#7d8391; --line:#2c2f38;
      --brand:#7b84ff; --brand-soft:#262a4a; --hot:#ff6b70; --hot-soft:rgba(255,107,112,.14);
      --link:#4fc3d8; --lit:#5a4a10; --lit-line:#c9a227; --shadow:0 2px 18px rgba(0,0,0,.5);
    }
  }
  .d2p{position:fixed;inset:0;display:grid;grid-template-columns:250px minmax(0,1fr);background:var(--bg);color:var(--ink);
    font:14px/1.6 var(--fm);-webkit-font-smoothing:antialiased}
  .d2p *{box-sizing:border-box}
  .d2p button{font:inherit;cursor:pointer;border:1px solid var(--line);background:var(--side);color:var(--ink);border-radius:8px;padding:6px 11px}
  .d2p button:hover{border-color:var(--brand)}
  /* ---- 목차 ---- */
  .d2p nav.toc{overflow:auto;padding:22px 14px 30px;background:var(--side);border-right:1px solid var(--line)}
  .d2p .toc .home{display:block;font-size:11px;letter-spacing:.14em;color:var(--brand);text-decoration:none;font-weight:800;padding:0 10px 6px}
  .d2p .toc .brand{font-weight:800;font-size:14px;padding:0 10px 2px;line-height:1.35}
  .d2p .toc .ver{font-size:12px;color:var(--muted);padding:0 10px 14px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .d2p .toc select{font:inherit;font-size:12px;border:1px solid var(--line);border-radius:6px;background:var(--side);color:var(--ink);padding:2px 4px}
  .d2p .ctl{margin:0 4px 14px;padding:12px 12px 10px;border:1px solid var(--line);border-radius:12px;background:var(--bg)}
  .d2p .ctl .row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
  .d2p .ctl .row:last-child{margin-bottom:0}
  .d2p .ctl b{font-size:13px}
  .d2p .sw{width:46px;height:24px;border-radius:999px;border:0;background:#b9bdc8;position:relative;padding:0}
  .d2p .sw::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .15s}
  .d2p .sw.on{background:var(--brand)} .d2p .sw.on::after{left:25px}
  .d2p .ctl .btns{display:flex;gap:6px}
  .d2p .ctl .btns button{flex:1;font-size:12.5px;padding:5px 6px}
  .d2p .toc a.sec{display:flex;gap:6px;text-decoration:none;color:var(--ink2);font-size:13.5px;padding:6px 10px;border-radius:7px;line-height:1.4}
  .d2p .toc a.sec em{font-style:normal;font-weight:700;color:var(--muted);min-width:28px;font-variant-numeric:tabular-nums}
  .d2p .toc a.sub{padding-left:22px;font-size:13px} .d2p .toc a.sub em{min-width:30px}
  .d2p .toc a.top{font-weight:700;color:var(--ink)}
  .d2p .toc a.chapter{margin-top:12px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:700}
  .d2p .toc a.plain{color:var(--muted)}
  .d2p .toc a:hover,.d2p .toc a.on{background:var(--brand-soft);color:var(--brand)}
  .d2p .toc a:hover em,.d2p .toc a.on em{color:var(--brand)}
  /* ---- 본문 ---- */
  .d2p main{overflow:auto;padding:26px 30px 80px;scroll-behavior:smooth}
  .d2p .slide-wrap{max-width:1400px;margin:0 auto 26px}
  .d2p .slide-scroll{overflow-x:auto;border-radius:6px;box-shadow:var(--shadow)}
  .d2p .slide{position:relative;container-type:inline-size;width:100%;min-width:760px;background:#fff;color:#000;overflow:hidden}
  .d2p .slide img.bg{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none;pointer-events:none}
  .d2p .ov{position:absolute;border-radius:4px}
  /* 표 */
  .d2p table.pt{position:absolute;border-collapse:collapse;table-layout:fixed;background:#fff;color:#000;line-height:1.55;font-family:var(--fm)}
  .d2p table.pt td{border:calc(.75*var(--pt)) solid #d9d9d9;padding:calc(1.6*var(--pt)) calc(5*var(--pt));vertical-align:middle;overflow-wrap:anywhere;word-break:keep-all;white-space:pre-wrap}
  .d2p table.pt tr.lit td{background:var(--lit)!important;box-shadow:inset 0 0 0 1px var(--lit-line)}
  .d2p table.pt tr.rowlink{cursor:pointer}
  .d2p table.pt tr.rowlink:hover td{filter:brightness(.97)}
  .d2p table.desc td.n{text-align:center;font-weight:800;color:#fff;background:transparent!important;vertical-align:top;padding-top:calc(3*var(--pt))}
  .d2p table.desc td.n i{display:inline-block;font-style:normal;background:#d93025;border-radius:50%;width:calc(11*var(--pt));height:calc(11*var(--pt));line-height:calc(11*var(--pt));font-size:calc(7*var(--pt))}
  .d2p .chips{display:flex;flex-wrap:wrap;gap:calc(2*var(--pt));margin-top:calc(2*var(--pt))}
  .d2p .chip{font-size:calc(6.4*var(--pt));line-height:1.5;padding:0 calc(4*var(--pt));border-radius:999px;background:#e8ecff;color:#3b46c4;cursor:pointer;white-space:nowrap;font-weight:700}
  .d2p .chip:hover{background:#4a55e0;color:#fff}
  .d2p .copybtn{position:absolute;z-index:6;font-size:calc(7*var(--pt));padding:calc(1.5*var(--pt)) calc(5*var(--pt));border-radius:calc(3*var(--pt));
    background:#fff;border:calc(.75*var(--pt)) solid #cfd3db;color:#444;opacity:0;transition:opacity .15s;cursor:pointer}
  .d2p .slide:hover .copybtn{opacity:.95}
  /* 번호 dot / 핫스팟 */
  .d2p .dot{position:absolute;z-index:5;transform:translate(-50%,-50%);width:calc(12*var(--pt));height:calc(12*var(--pt));border-radius:50%;
    background:#d93025;color:#fff;font-weight:800;font-size:calc(7*var(--pt));line-height:calc(12*var(--pt));text-align:center;cursor:pointer;
    box-shadow:0 0 0 calc(1.5*var(--pt)) #fff}
  .d2p .dot:hover,.d2p .dot.active{background:var(--brand);box-shadow:0 0 0 calc(1.5*var(--pt)) #fff,0 0 0 calc(4*var(--pt)) rgba(74,85,224,.25)}
  .d2p .hs{border:2px dashed transparent;cursor:pointer;transition:border-color .15s,background .15s}
  .d2p .hs:hover,.d2p .hs.active{border-color:var(--hot);background:var(--hot-soft)}
  .d2p .blk{pointer-events:none;border:2px solid transparent}
  .d2p .blk.lit{border-color:var(--lit-line);background:rgba(255,222,70,.28);animation:d2pPulse 1.2s ease 2}
  @keyframes d2pPulse{50%{box-shadow:0 0 0 8px rgba(242,201,76,.35)}}
  .d2p .lnk{border:2px dotted var(--link);cursor:pointer;background:rgba(14,122,143,.04)}
  .d2p .lnk:hover{background:rgba(14,122,143,.16)}
  .d2p .lnk::after{content:'상세 ↗';position:absolute;right:-2px;top:-20px;background:var(--link);color:#fff;font-size:11px;line-height:1;padding:3px 6px;border-radius:5px;white-space:nowrap;opacity:0;transition:opacity .15s}
  .d2p .lnk:hover::after{opacity:1}
  /* 동작 */
  .d2p .bh{cursor:pointer;border:2px solid transparent;border-radius:5px;transition:background .15s,border-color .15s}
  .d2p .bh:hover{background:rgba(14,122,143,.14);border-color:var(--link)}
  .d2p .bh.on{background:rgba(74,85,224,.18);border-color:var(--brand)}
  .d2p .bh.k-input{cursor:text}
  .d2p .tip{position:absolute;z-index:25;max-width:280px;background:var(--ink);color:var(--bg);font-size:12.5px;line-height:1.5;padding:8px 11px;border-radius:8px;box-shadow:var(--shadow);pointer-events:none;animation:d2pIn .15s ease}
  .d2p .tip::before{content:'';position:absolute;left:14px;top:-6px;border:6px solid transparent;border-top:0;border-bottom-color:var(--ink)}
  .d2p .tip.up::before{top:auto;bottom:-6px;border-bottom:0;border-top:6px solid var(--ink)}
  @keyframes d2pIn{from{opacity:0;transform:translateY(3px)}}
  .d2p .drop{position:absolute;z-index:24;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);overflow:hidden;animation:d2pIn .15s ease}
  .d2p .drop canvas,.d2p .modal canvas{display:block;max-width:100%;height:auto}
  .d2p .backdrop{position:fixed;inset:0;background:rgba(20,24,40,.45);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;animation:d2pFade .15s ease}
  @keyframes d2pFade{from{opacity:0}}
  .d2p .modal{background:var(--side);border-radius:14px;box-shadow:var(--shadow);max-width:min(900px,96vw);max-height:90vh;overflow:auto}
  .d2p .modal .mh{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)} .d2p .modal .mh b{flex:1}
  .d2p .modal .mb{padding:14px} .d2p .modal .mb p{margin:0 0 10px;color:var(--ink2);font-size:13px;white-space:pre-wrap}
  .d2p .modal canvas{border:1px solid var(--line);border-radius:8px;background:#fff}
  .d2p .fakein{position:absolute;z-index:23;font:inherit;font-size:13px;padding:4px 8px;border:2px solid var(--brand);border-radius:6px;background:#fff;color:#1b1d22;outline:0;box-shadow:var(--shadow)}
  /* 패널 / 토스트 */
  .d2p .panel{position:fixed;right:16px;bottom:16px;width:min(430px,calc(100vw - 32px));max-height:46vh;display:none;flex-direction:column;background:var(--side);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);z-index:30}
  .d2p .panel.open{display:flex}
  .d2p .panel .ph{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)} .d2p .panel .ph b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .d2p .panel .ph button{padding:3px 9px;font-size:12px}
  .d2p .panel .pb{overflow:auto;padding:12px 14px;white-space:pre-wrap;color:var(--ink2);font-size:13px}
  .d2p .toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:9px 16px;border-radius:9px;font-size:13px;opacity:0;transition:opacity .25s;z-index:40;pointer-events:none}
  .d2p .toast.show{opacity:.95}
  .d2p .slide-wrap .cap{font-size:12px;color:var(--muted);margin:6px 4px 0;display:flex;gap:10px;align-items:center}
  .d2p .slide-wrap .cap b{color:var(--ink2)}
  .d2p .slide-wrap .cap a{color:var(--muted);text-decoration:none;margin-left:auto} .d2p .slide-wrap .cap a:hover{color:var(--brand)}
  /* 인터랙션 OFF: 원본 그대로 (표는 유지) */
  .d2p.off .dot,.d2p.off .hs,.d2p.off .lnk,.d2p.off .bh,.d2p.off .blk,.d2p.off .chips{display:none}
  .d2p.raw table.pt,.d2p.raw .copybtn{display:none}
  @media print{
    .d2p{position:static;display:block}
    .d2p nav.toc,.d2p .panel,.d2p .toast,.d2p .dot,.d2p .hs,.d2p .lnk,.d2p .bh,.d2p .blk,.d2p .copybtn,.d2p .cap{display:none!important}
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
    const pt = (v) => `calc(${v}*var(--pt))`;

    /* ---------- 공통 UI ---------- */
    const toast = el('div', 'toast'); let toastT;
    const say = (m) => { toast.textContent = m; toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 1800); };
    const panel = el('div', 'panel'); const ph = el('div', 'ph'); const pTitle = el('b'); const bCopy = el('button', null, '복사'); const bClose = el('button', null, '✕');
    ph.append(pTitle, bCopy, bClose); const pb = el('div', 'pb'); panel.append(ph, pb);
    const openPanel = (cap, text) => { pTitle.textContent = cap || '설명'; pb.textContent = text || '(설명 텍스트 없음)'; panel.classList.add('open'); };
    bClose.onclick = () => panel.classList.remove('open');
    bCopy.onclick = () => navigator.clipboard.writeText(pb.textContent).then(() => say('복사했어요'), () => say('복사하지 못했어요'));

    /* ---------- 목차 ---------- */
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
    const r2 = el('div', 'row btns');
    const bRaw = el('button', null, '원본 보기'); const bPrint = el('button', null, '인쇄'); const bShare = el('button', null, '링크 복사');
    r2.append(bRaw, bPrint, bShare);
    ctl.append(r1, r2);
    nav.append(ctl);
    const tocLinks = P.map((p, i) => {
      const a = el('a');
      const kind = p.kind || 'page';
      a.className = 'sec ' + (kind === 'chapter' ? 'chapter' : !p.num ? 'plain' : p.num.includes('.') ? 'sub' : 'top');
      a.href = '#s' + (i + 1);
      if (p.num && kind !== 'chapter') a.append(el('em', null, p.num));
      a.append(el('span', null, p.label || p.title || `페이지 ${i + 1}`));
      a.onclick = (e) => { e.preventDefault(); goto(i); };
      nav.append(a);
      return a;
    });

    /* ---------- 본문 ---------- */
    const main = el('main');
    const slides = [];      // {sec, stage, img, blkEls, hsEls, rowEls}
    const rowIndex = [];    // {page, blk, caption, tr, role, text} — 칩 링크용
    let floating = null;
    const clearFloating = () => { if (floating) { floating.remove(); floating = null; } };
    const c0 = (row) => { const c = row.find((x) => x && x.text.trim()); return c ? c.text.split('\n')[0].trim() : ''; };

    function tableHtml(p, t, pi) {
      const tbl = el('table', 'pt' + (t.role === 'desc' ? ' desc' : ''));
      tbl.style.left = t.rect.l + '%'; tbl.style.top = t.rect.t + '%'; tbl.style.width = t.rect.w + '%';
      const cg = el('colgroup');
      for (const w of t.cells.cols) { const c = el('col'); c.style.width = w + '%'; cg.append(c); }
      tbl.append(cg);
      const rowsBlk = t.rows || [];
      t.cells.rows.forEach((row, ri) => {
        const tr = el('tr');
        const blkId = rowsBlk[ri];
        const blk = blkId != null ? p.blocks[blkId] : null;
        if (blk) { tr.dataset.blk = blkId; tr.style.height = pt(blk.rect.h * HPT / 100); }
        row.forEach((c, ci) => {
          if (!c) return;
          const td = el('td');
          if (c.colspan > 1) td.colSpan = c.colspan;
          if (c.rowspan > 1) td.rowSpan = c.rowspan;
          td.style.fontSize = pt(c.size || 9);
          if (c.bold) td.style.fontWeight = '700';
          if (c.color) td.style.color = c.color;
          if (c.bg) td.style.background = c.bg;
          if (c.align) td.style.textAlign = c.align;
          const isNum = t.role === 'desc' && ci === 0 && /^\s*(\d{1,2}|[①-⑳])\s*$/.test(c.text);
          if (isNum) { td.className = 'n'; td.append(el('i', null, c.text.trim())); }
          else {
            const lines = c.text.split('\n');
            if (t.role === 'desc' && ci === 1 && lines.length > 1) {
              td.append(el('b', null, lines[0]), document.createTextNode('\n' + lines.slice(1).join('\n')));
            } else td.textContent = c.text;
          }
          tr.append(td);
        });
        tbl.append(tr);
        if (blk && c0(row)) rowIndex.push({ page: pi, blk: blkId, caption: blk.caption || c0(row), tr, role: t.role, text: blk.text || '' });
      });
      return tbl;
    }

    P.forEach((p, i) => {
      const sec = el('section', 'slide-wrap'); sec.id = 's' + (i + 1);
      const scroll = el('div', 'slide-scroll');
      const stage = el('div', 'slide');
      stage.style.aspectRatio = `${WPT}/${HPT}`;
      stage.style.setProperty('--pt', `calc(100cqw/${WPT})`);
      const img = el('img', 'bg'); img.src = p.img; img.alt = p.label || '';
      img.loading = i < 3 ? 'eager' : 'lazy';
      stage.append(img);
      const S = { sec, stage, img, blkEls: {}, hsEls: {}, rowEls: {} };
      slides.push(S);

      // 블록(하이라이트 대상) — 표의 행은 HTML 표가 담당
      for (const b of p.blocks || []) {
        if (b.kind === 'row' || b.rect.w < 0.8 || b.rect.h < 0.5) continue;
        const q = el('div', 'ov blk'); place(q, b.rect); stage.append(q); S.blkEls[b.id] = q;
      }
      // HTML 표
      for (const t of p.tables || []) {
        const tbl = tableHtml(p, t, i);
        stage.append(tbl);
        tbl.querySelectorAll('tr[data-blk]').forEach((tr) => { S.rowEls[tr.dataset.blk] = tr; });
        const cb = el('button', 'copybtn', '⧉ 표 복사');
        cb.style.left = `calc(${t.rect.l + t.rect.w}% - ${pt(40)})`; cb.style.top = `calc(${t.rect.t}% - ${pt(13)})`;
        cb.onclick = (e) => { e.stopPropagation(); copyTable(tbl); };
        stage.append(cb);
      }
      // 핫스팟 + 번호 dot
      for (const h of p.hotspots || []) {
        const n = el('div', 'ov hs'); place(n, h.rect); n.title = h.label || '';
        n.onclick = (e) => { e.stopPropagation(); activate(i, h); };
        stage.append(n); S.hsEls[h.id] = n;
        if (h.marker != null && h.marker_rect) {
          const d = el('div', 'dot', String(h.marker));
          d.style.left = (h.marker_rect.l + h.marker_rect.w / 2) + '%'; d.style.top = (h.marker_rect.t + h.marker_rect.h / 2) + '%';
          d.onclick = (e) => { e.stopPropagation(); activate(i, h); };
          stage.append(d); n._dot = d;
        }
      }
      // 다른 페이지 상세 링크
      for (const l of p.links || []) {
        const n = el('div', 'ov lnk'); place(n, l.rect);
        n.title = `${P[l.page].num ? P[l.page].num + ' ' : ''}${P[l.page].label || ''} 상세로 이동`;
        n.onclick = (e) => { e.stopPropagation(); goto(l.page, l.hotspot); };
        stage.append(n);
      }
      // 프로토타입 동작
      for (const b of p.behaviors || []) mountBehavior(S, i, b);
      // 작은 오버레이가 위로
      const areaOf = (n) => parseFloat(n.style.width || 0) * parseFloat(n.style.height || 0);
      [...stage.querySelectorAll('.ov')].sort((a, b) => areaOf(b) - areaOf(a)).forEach((n) => stage.append(n));
      stage.onclick = () => { clearActive(); panel.classList.remove('open'); clearFloating(); };

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

    /* ---------- 칩: 설명 행 텍스트에 다른 행의 항목명이 나오면 링크 ---------- */
    const captions = rowIndex.filter((r) => r.caption && r.caption.length >= 2 && !/^\d+$/.test(r.caption) && !/^(항목|툴팁|No\.?|Version)$/i.test(r.caption));
    for (const r of rowIndex) {
      if (r.role !== 'desc') continue;
      const hits = [];
      for (const c of captions) {
        if (c === r || (c.page === r.page && c.role === 'desc')) continue;
        const re = new RegExp('(^|[^가-힣A-Za-z0-9])' + c.caption.replace(/[.*+?^$()[\]{}|\\]/g, '\\$&') + '([^가-힣A-Za-z0-9]|$)');
        if ((c.caption.length >= 3 || re.test(r.text)) && r.text.includes(c.caption) && !hits.some((h) => h.caption === c.caption)) hits.push(c);
        if (hits.length >= 4) break;
      }
      if (!hits.length) continue;
      const box = el('div', 'chips');
      for (const h of hits) {
        const ch = el('span', 'chip', `${P[h.page].num || (h.page + 1)} ${h.caption}`);
        ch.onclick = (e) => { e.stopPropagation(); goto(h.page); lightRows(h.page, [h.blk]); };
        box.append(ch);
      }
      r.tr.lastElementChild.append(box);
    }

    /* ---------- 하이라이트 ---------- */
    let litTimer;
    function clearLit() { root.querySelectorAll('.lit').forEach((x) => x.classList.remove('lit')); }
    function clearActive() { root.querySelectorAll('.hs.active,.dot.active').forEach((x) => x.classList.remove('active')); }
    function lightRows(pi, ids, keep) {
      const S = slides[pi];
      if (!keep) clearLit();
      for (const id of ids) {
        const n = S.rowEls[id] || S.blkEls[id];
        if (n) n.classList.add('lit');
      }
      clearTimeout(litTimer);
      litTimer = setTimeout(clearLit, 4000);
    }
    function activate(pi, h) {
      const S = slides[pi];
      clearActive();
      const n = S.hsEls[h.id]; if (n) { n.classList.add('active'); if (n._dot) n._dot.classList.add('active'); }
      lightRows(pi, h.targets);
      const p = P[pi];
      const t = h.targets.map((id) => p.blocks[id]).filter(Boolean);
      const nonRow = t.filter((b) => b.kind !== 'row');
      if (nonRow.length) openPanel(nonRow[0].caption || h.label, nonRow.map((b) => b.text).filter(Boolean).join('\n\n'));
      else if (!t.length) say(h.label ? `${h.label}: 연결된 설명이 없어요` : '연결된 설명이 없는 영역이에요');
      history.replaceState(null, '', `#p=${pi + 1}&h=${h.id}`);
    }
    // 설명 행 클릭 → 해당 마커 표시
    root.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-blk]'); if (!tr || e.target.closest('.chip')) return;
      const sec = tr.closest('.slide-wrap'); const pi = slides.findIndex((s) => s.sec === sec); if (pi < 0) return;
      const id = +tr.dataset.blk; const p = P[pi];
      const hs = (p.hotspots || []).filter((h) => h.targets.includes(id));
      clearActive(); lightRows(pi, [id]);
      for (const h of hs) { const n = slides[pi].hsEls[h.id]; if (n) { n.classList.add('active'); if (n._dot) n._dot.classList.add('active'); } }
      e.stopPropagation();
    });
    rowIndex.forEach((r) => { if ((P[r.page].hotspots || []).some((h) => h.targets.includes(r.blk))) r.tr.classList.add('rowlink'); });

    /* ---------- 표 복사 (HTML + TSV) ---------- */
    async function copyTable(tbl) {
      const t = tbl.cloneNode(true);
      t.querySelectorAll('.chips').forEach((x) => x.remove());
      t.removeAttribute('style'); t.removeAttribute('class');
      t.setAttribute('border', '1'); t.setAttribute('cellspacing', '0'); t.setAttribute('style', 'border-collapse:collapse;font-family:Malgun Gothic,sans-serif;font-size:10pt');
      t.querySelectorAll('td').forEach((td) => {
        const cs = td.style; const st = `padding:4px 8px;border:1px solid #d9d9d9;vertical-align:middle;white-space:pre-wrap;${cs.fontWeight ? 'font-weight:' + cs.fontWeight + ';' : ''}${cs.color ? 'color:' + cs.color + ';' : ''}${cs.background ? 'background:' + cs.background + ';' : ''}${cs.textAlign ? 'text-align:' + cs.textAlign + ';' : ''}`;
        td.setAttribute('style', st); td.removeAttribute('class');
        td.querySelectorAll('i').forEach((i) => i.replaceWith(document.createTextNode(i.textContent)));
      });
      t.querySelectorAll('tr').forEach((tr) => { tr.removeAttribute('style'); tr.removeAttribute('class'); delete tr.dataset.blk; });
      t.querySelectorAll('col').forEach((c) => c.removeAttribute('style'));
      const html = t.outerHTML;
      const tsv = [...tbl.rows].map((r) => [...r.cells].map((c) => (c.innerText || '').replace(/\n/g, ' ').replace(/\t/g, ' ')).join('\t')).join('\n');
      try {
        if (window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([tsv], { type: 'text/plain' }) })]);
        else await navigator.clipboard.writeText(tsv);
        say('표를 복사했어요 — 엑셀·노션·메일에 붙여넣기');
      } catch { say('복사하지 못했어요'); }
    }

    /* ---------- 프로토타입 동작 ---------- */
    function mountBehavior(S, pi, b) {
      const stage = S.stage, img = S.img;
      const n = el('div', 'ov bh k-' + b.kind); place(n, b.rect);
      n.title = `${b.label || ''} · ${({ tooltip: '툴팁', popup: '팝업', dropdown: '드롭다운', navigate: '화면 이동', toggle: '토글', input: '입력', toast: '토스트' })[b.kind] || b.kind}`;
      const crop = (rect, maxW) => {
        const c = document.createElement('canvas');
        const sx = img.naturalWidth * rect.l / 100, sy = img.naturalHeight * rect.t / 100, sw = img.naturalWidth * rect.w / 100, sh = img.naturalHeight * rect.h / 100;
        const k = Math.min(1, maxW / sw); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
        c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height); return c;
      };
      const anchorPos = (node) => { const r = n.getBoundingClientRect(), sr = stage.getBoundingClientRect(); let top = r.bottom - sr.top + 6, left = r.left - sr.left; if (top + node.offsetHeight > stage.offsetHeight) { top = Math.max(4, r.top - sr.top - node.offsetHeight - 6); node.classList.add('up'); } left = Math.max(4, Math.min(left, stage.offsetWidth - node.offsetWidth - 4)); node.style.top = top + 'px'; node.style.left = left + 'px'; };
      const showTip = () => { clearFloating(); const t = el('div', 'tip', b.content); stage.append(t); anchorPos(t); floating = t; floating._src = n; };
      const showDrop = () => { clearFloating(); const d = el('div', 'drop'); if (b.show_rect) d.append(crop(b.show_rect, 420)); else { const q = el('div', null, b.content); q.style.cssText = 'padding:10px 12px;font-size:13px;max-width:280px;color:#1b1d22'; d.append(q); } stage.append(d); anchorPos(d); floating = d; floating._src = n; };
      const showModal = () => { clearFloating(); const bd = el('div', 'backdrop'); const m = el('div', 'modal'); const mh = el('div', 'mh'); const x = el('button', null, '✕'); mh.append(el('b', null, b.label || '팝업'), x); const mb = el('div', 'mb'); if (b.content) mb.append(el('p', null, b.content)); if (b.show_rect) mb.append(crop(b.show_rect, 860)); m.append(mh, mb); bd.append(m); root.append(bd); const close = () => bd.remove(); x.onclick = close; bd.onclick = (e) => { if (e.target === bd) close(); }; m.onclick = (e) => e.stopPropagation(); };
      const showInput = () => { clearFloating(); const inp = el('input', 'fakein'); inp.placeholder = b.content || '입력'; const r = n.getBoundingClientRect(), sr = stage.getBoundingClientRect(); inp.style.left = (r.left - sr.left) + 'px'; inp.style.top = (r.top - sr.top) + 'px'; inp.style.width = Math.max(120, r.width) + 'px'; inp.style.height = Math.max(26, r.height) + 'px'; inp.onclick = (e) => e.stopPropagation(); inp.onkeydown = (e) => { if (e.key === 'Enter') { say('전송: ' + (inp.value || '(빈 입력)')); inp.value = ''; } if (e.key === 'Escape') clearFloating(); }; stage.append(inp); inp.focus(); floating = inp; };
      const run = (e) => {
        e.stopPropagation();
        if (b.kind === 'tooltip') { if (floating && floating._src === n) { clearFloating(); return; } showTip(); }
        else if (b.kind === 'popup') showModal();
        else if (b.kind === 'dropdown') { if (floating && floating._src === n) { clearFloating(); return; } showDrop(); }
        else if (b.kind === 'navigate') { if (b.target_page != null && P[b.target_page - 1]) goto(b.target_page - 1); else say('이동: ' + (b.content || b.label)); }
        else if (b.kind === 'toast') say(b.content || b.label);
        else if (b.kind === 'toggle') { n.classList.toggle('on'); say((n.classList.contains('on') ? 'ON — ' : 'OFF — ') + (b.content || b.label)); }
        else if (b.kind === 'input') showInput();
      };
      if (b.trigger === 'hover' && b.kind === 'tooltip') { n.onmouseenter = showTip; n.onmouseleave = () => { if (floating && floating._src === n) clearFloating(); }; n.onclick = (e) => e.stopPropagation(); }
      else n.onclick = run;
      stage.append(n);
    }

    /* ---------- 이동 / 해시 / 목차 활성 ---------- */
    let navLock = 0;
    function goto(i, hsId) {
      const S = slides[i]; if (!S) return;
      tocLinks.forEach((a, k) => a.classList.toggle('on', k === i));
      navLock = Date.now() + 900;
      S.sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', '#s' + (i + 1));
      if (hsId != null) { const h = (P[i].hotspots || []).find((x) => x.id === hsId); if (h) setTimeout(() => activate(i, h), 400); }
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
      tocLinks.forEach((a, k) => a.classList.toggle('on', k === i));
    }, { root: main, threshold: [0.25, 0.5, 0.75] });
    slides.forEach((s) => io.observe(s.sec));

    /* ---------- 컨트롤 ---------- */
    sw.onclick = () => { sw.classList.toggle('on'); root.classList.toggle('off', !sw.classList.contains('on')); };
    bRaw.onclick = () => { root.classList.toggle('raw'); bRaw.textContent = root.classList.contains('raw') ? '표 보기' : '원본 보기'; };
    bPrint.onclick = () => setTimeout(() => window.print(), 50);
    bShare.onclick = async () => {
      try { const url = await (opts.getShareUrl ? opts.getShareUrl() : Promise.resolve(location.href)); await navigator.clipboard.writeText(url); say('링크를 복사했어요'); }
      catch (e) { say(e && e.message ? e.message : '링크를 만들지 못했어요'); }
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { clearFloating(); panel.classList.remove('open'); const bd = root.querySelector('.backdrop'); if (bd) bd.remove(); } });
    window.addEventListener('hashchange', applyHash);

    root.append(nav, main, panel, toast);
    setTimeout(applyHash, 50);
    return { goto, lightRows };
  }

  window.D2P = { init };
})();

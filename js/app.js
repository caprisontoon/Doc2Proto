/* Doc2Proto 뷰어 UI — window.D2P.init(model, opts)
   model: { title, pages: [{ img, title, blocks, hotspots, links }] }
   rect: { l, t, w, h } (페이지 대비 %) */
(function () {
  'use strict';

  const CSS = `
  :root{
    --bg:#e9ebef; --side:#ffffff; --ink:#1b1d22; --ink2:#4a4f5a; --muted:#8a909c; --line:#dde0e6;
    --brand:#4a55e0; --brand-soft:#eceefe; --hot:#e0454a; --hot-soft:rgba(224,69,74,.10);
    --link:#0e7a8f; --shadow:0 2px 14px rgba(20,24,40,.10);
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg:#121317; --side:#1b1d23; --ink:#eceef2; --ink2:#b8bdc8; --muted:#7d8391; --line:#2c2f38;
      --brand:#7b84ff; --brand-soft:#262a4a; --hot:#ff6b70; --hot-soft:rgba(255,107,112,.14);
      --link:#4fc3d8; --shadow:0 2px 18px rgba(0,0,0,.5);
    }
  }
  .d2p{position:fixed;inset:0;display:flex;flex-direction:column;background:var(--bg);color:var(--ink);
    font:14px/1.6 'Malgun Gothic','맑은 고딕','Noto Sans KR',sans-serif}
  .d2p *{box-sizing:border-box}
  .d2p button{font:inherit;cursor:pointer;border:1px solid var(--line);background:var(--side);color:var(--ink);
    border-radius:8px;padding:7px 13px}
  .d2p button:hover{border-color:var(--brand)}
  .d2p .primary{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:700}
  .d2p header{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--side);
    border-bottom:1px solid var(--line);flex-wrap:wrap}
  .d2p .logo{font-weight:800;color:var(--brand);text-decoration:none;font-size:15px}
  .d2p .doctitle{font-weight:700;max-width:34ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .d2p .modes{display:flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;margin-left:auto}
  .d2p .modes button{border:0;border-radius:0;padding:7px 15px;background:transparent}
  .d2p .modes button.on{background:var(--brand);color:#fff;font-weight:700}
  .d2p .body{flex:1;display:flex;min-height:0}
  .d2p nav{width:216px;overflow:auto;background:var(--side);border-right:1px solid var(--line);padding:10px}
  .d2p nav .pg{display:flex;gap:8px;align-items:center;width:100%;text-align:left;border:1px solid transparent;
    background:transparent;padding:7px 9px;border-radius:8px;margin-bottom:2px}
  .d2p nav .pg .no{color:var(--muted);font-size:12px;min-width:2ch}
  .d2p nav .pg.on{background:var(--brand-soft);border-color:var(--brand);font-weight:700}
  .d2p main{flex:1;overflow:auto;padding:18px;min-width:0}
  .d2p .stage{position:relative;max-width:1200px;margin:0 auto;box-shadow:var(--shadow);border-radius:6px;
    overflow:hidden;background:#fff}
  .d2p .stage img{display:block;width:100%;height:auto;user-select:none;-webkit-user-drag:none}
  .d2p .ov{position:absolute;border-radius:4px}
  .d2p .hs{border:2px dashed transparent;cursor:pointer;transition:border-color .15s, background .15s}
  .d2p .hs:hover,.d2p .hs.active{border-color:var(--hot);background:var(--hot-soft)}
  .d2p .hs.active{box-shadow:0 0 0 3px var(--hot-soft)}
  .d2p .blk{cursor:pointer;border:2px solid transparent}
  .d2p .blk.quiet{pointer-events:none;cursor:default}
  .d2p .blk.quiet:hover{border-color:transparent;background:transparent}
  .d2p .blk:hover{border-color:var(--brand);background:rgba(74,85,224,.06)}
  .d2p .blk.lit{border-color:var(--brand);background:var(--brand-soft);animation:d2pPulse 1.2s ease 2;
    mix-blend-mode:multiply}
  @media (prefers-color-scheme: dark){ .d2p .blk.lit{mix-blend-mode:screen} }
  @keyframes d2pPulse{50%{box-shadow:0 0 0 8px var(--brand-soft)}}
  .d2p .lnk{border:2px dotted var(--link);cursor:pointer;background:rgba(14,122,143,.05)}
  .d2p .lnk:hover{background:rgba(14,122,143,.16)}
  .d2p .lnk::after{content:'상세 ↗';position:absolute;right:-2px;top:-20px;background:var(--link);color:#fff;
    font-size:11px;line-height:1;padding:3px 6px;border-radius:5px;white-space:nowrap;opacity:0;transition:opacity .15s}
  .d2p .lnk:hover::after{opacity:1}
  .d2p .panel{position:fixed;right:16px;bottom:16px;width:min(430px,calc(100vw - 32px));max-height:46vh;
    display:none;flex-direction:column;background:var(--side);border:1px solid var(--line);border-radius:12px;
    box-shadow:var(--shadow);z-index:30}
  .d2p .panel.open{display:flex}
  .d2p .panel .ph{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)}
  .d2p .panel .ph b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .d2p .panel .ph button{padding:3px 9px;font-size:12px}
  .d2p .panel .pb{overflow:auto;padding:12px 14px;white-space:pre-wrap;color:var(--ink2);font-size:13px}
  .d2p .hint{max-width:1200px;margin:0 auto 10px;color:var(--muted);font-size:12.5px}
  .d2p .pager{display:flex;gap:8px;align-items:center}
  .d2p .pager .cur{color:var(--muted);font-size:13px;min-width:7ch;text-align:center}
  .d2p .toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:var(--ink);color:var(--bg);
    padding:9px 16px;border-radius:9px;font-size:13px;opacity:0;transition:opacity .25s;z-index:40;pointer-events:none}
  .d2p .toast.show{opacity:.95}
  /* AI 프로토타입 동작 */
  .d2p .bh{cursor:pointer;border:2px solid transparent;border-radius:5px;transition:background .15s,border-color .15s}
  .d2p.showai .bh{box-shadow:inset 0 0 0 1px rgba(14,122,143,.35)}
  .d2p .bh:hover{background:rgba(14,122,143,.14);border-color:var(--link)}
  .d2p .bh.on{background:rgba(74,85,224,.18);border-color:var(--brand)}
  .d2p .bh.k-input{cursor:text}
  .d2p .tip{position:absolute;z-index:25;max-width:280px;background:var(--ink);color:var(--bg);font-size:12.5px;
    line-height:1.5;padding:8px 11px;border-radius:8px;box-shadow:var(--shadow);pointer-events:none;
    animation:d2pIn .15s ease}
  .d2p .tip::before{content:'';position:absolute;left:14px;top:-6px;border:6px solid transparent;border-top:0;
    border-bottom-color:var(--ink)}
  .d2p .tip.up::before{top:auto;bottom:-6px;border-bottom:0;border-top:6px solid var(--ink)}
  @keyframes d2pIn{from{opacity:0;transform:translateY(3px)}}
  .d2p .drop{position:absolute;z-index:24;background:#fff;border:1px solid var(--line);border-radius:8px;
    box-shadow:var(--shadow);overflow:hidden;animation:d2pIn .15s ease}
  .d2p .drop canvas,.d2p .modal canvas{display:block;max-width:100%;height:auto}
  .d2p .backdrop{position:fixed;inset:0;background:rgba(20,24,40,.45);z-index:50;display:flex;align-items:center;
    justify-content:center;padding:20px;animation:d2pFade .15s ease}
  @keyframes d2pFade{from{opacity:0}}
  .d2p .modal{background:var(--side);border-radius:14px;box-shadow:var(--shadow);max-width:min(900px,96vw);
    max-height:90vh;overflow:auto;padding:0}
  .d2p .modal .mh{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)}
  .d2p .modal .mh b{flex:1}
  .d2p .modal .mb{padding:14px}
  .d2p .modal .mb p{margin:0 0 10px;color:var(--ink2);font-size:13px;white-space:pre-wrap}
  .d2p .modal canvas{border:1px solid var(--line);border-radius:8px;background:#fff}
  .d2p .fakein{position:absolute;z-index:23;font:inherit;font-size:13px;padding:4px 8px;border:2px solid var(--brand);
    border-radius:6px;background:#fff;color:#1b1d22;outline:0;box-shadow:var(--shadow)}
  .d2p .vers{font:inherit;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--side);color:var(--ink)}
  .d2p .aibtn.has{border-color:var(--link);color:var(--link);font-weight:700}
  .d2p .legend{display:inline-flex;gap:10px;margin-left:8px;color:var(--muted);font-size:12px;align-items:center}
  .d2p .legend i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;margin-right:4px}
  .d2p.print main{padding:0;background:var(--bg)}
  .d2p .sheet{max-width:1200px;margin:14px auto;box-shadow:var(--shadow);background:#fff}
  .d2p .sheet img{display:block;width:100%}
  @media print{
    .d2p header,.d2p nav,.d2p .panel,.d2p .toast{display:none!important}
    .d2p{position:static}
    .d2p main{overflow:visible;padding:0}
    .d2p .sheet{margin:0;box-shadow:none;page-break-after:always}
  }
  @media (max-width:760px){ .d2p nav{display:none} .d2p .doctitle{max-width:16ch} }
  `;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const place = (n, r) => {
    n.style.left = r.l + '%'; n.style.top = r.t + '%';
    n.style.width = r.w + '%'; n.style.height = r.h + '%';
  };

  function init(model, opts = {}) {
    if (!document.getElementById('d2p-style')) {
      const st = el('style'); st.id = 'd2p-style'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    const root = opts.root || document.getElementById('app');
    root.innerHTML = '';
    root.className = 'd2p';

    let cur = 0, mode = 'inter';
    const P = model.pages;

    /* ---------- header ---------- */
    const header = el('header');
    const logo = el('a', 'logo', 'Doc2Proto'); logo.href = opts.homeHref || './';
    const title = el('span', 'doctitle', model.title || '기획서');
    const pager = el('div', 'pager');
    const prev = el('button', null, '◀'), next = el('button', null, '▶');
    const curLb = el('span', 'cur');
    pager.append(prev, curLb, next);
    const modes = el('div', 'modes');
    const bInter = el('button', 'on', '인터랙션 모드');
    const bPrint = el('button', null, '인쇄 모드');
    modes.append(bInter, bPrint);
    const bShare = el('button', 'primary', 'URL로 공유');
    const bPrintGo = el('button', null, '인쇄');
    const bAI = el('button', 'aibtn', 'AI 프로토타입 생성');
    if (!opts.generate) bAI.hidden = true;
    const verSel = el('select', 'vers');
    if (opts.versions && opts.versions.length > 1) {
      for (const v of opts.versions) { const o = el('option', null, v.label); o.value = v.href; o.selected = !!v.current; verSel.append(o); }
      verSel.onchange = () => { location.href = verSel.value + location.hash; };
    } else verSel.hidden = true;
    header.append(logo, title, verSel, pager, modes, bAI, bShare, bPrintGo);
    if (opts.onNew) { const b = el('button', null, '새 문서'); b.onclick = opts.onNew; header.append(b); }

    /* ---------- body ---------- */
    const body = el('div', 'body');
    const nav = el('nav');
    const main = el('main');
    body.append(nav, main);

    const panel = el('div', 'panel');
    const ph = el('div', 'ph');
    const pTitle = el('b');
    const bCopy = el('button', null, '복사');
    const bClose = el('button', null, '✕');
    ph.append(pTitle, bCopy, bClose);
    const pb = el('div', 'pb');
    panel.append(ph, pb);

    const toast = el('div', 'toast');
    root.append(header, body, panel, toast);

    let toastT;
    function say(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(toastT);
      toastT = setTimeout(() => toast.classList.remove('show'), 1800);
    }
    function openPanel(cap, text) {
      pTitle.textContent = cap || '설명';
      let t = text || '';
      if (cap && t.split('\n')[0].trim() === cap.trim()) t = t.split('\n').slice(1).join('\n');
      pb.textContent = t || '(이 영역의 설명 텍스트를 찾지 못했어요)';
      panel.classList.add('open');
    }
    bClose.onclick = () => panel.classList.remove('open');
    bCopy.onclick = async () => {
      try { await navigator.clipboard.writeText(pb.textContent); say('설명을 복사했어요'); }
      catch { say('복사하지 못했어요'); }
    };

    /* ---------- nav ---------- */
    const navBtns = P.map((p, i) => {
      const b = el('button', 'pg');
      b.append(el('span', 'no', String(i + 1)), el('span', null, p.title || `페이지 ${i + 1}`));
      b.onclick = () => goto(i);
      nav.append(b);
      return b;
    });

    /* ---------- 인터랙션 페이지 ---------- */
    function renderInter() {
      main.innerHTML = '';
      const p = P[cur];
      const hint = el('div', 'hint',
        '화면의 점선 영역을 클릭하면 해당 설명이 하이라이트돼요. 설명 영역을 클릭하면 반대로 화면 위치가 표시돼요. 청록 점선은 상세 페이지로 이동해요.');
      if (p.behaviors && p.behaviors.length) {
        const lg = el('span', 'legend');
        lg.innerHTML = '<i style="background:rgba(14,122,143,.35)"></i>AI 프로토타입 동작 ' + p.behaviors.length + '개 — 요소를 눌러보세요';
        hint.append(lg);
      }
      const stage = el('div', 'stage');
      const img = el('img'); img.src = p.img; img.alt = p.title || `페이지 ${cur + 1}`;
      stage.append(img);

      const isMock = (b) => b.rect.w * b.rect.h > 1200 &&
        p.hotspots.some((h) => h.rect.l >= b.rect.l && h.rect.t >= b.rect.t &&
          h.rect.l + h.rect.w <= b.rect.l + b.rect.w && h.rect.t + h.rect.h <= b.rect.t + b.rect.h);
      const blkEls = {};
      for (const b of p.blocks) {
        if (b.rect.w < 1 || b.rect.h < 0.6) continue;
        if (b.inner || isMock(b)) {
          // 목업·그룹 안쪽 도형, 표의 행: 클릭은 안 되지만 하이라이트 대상으로는 필요
          const q = el('div', 'ov blk quiet');
          place(q, b.rect);
          stage.append(q);
          blkEls[b.id] = q;
          continue;
        }
        const n = el('div', 'ov blk');
        place(n, b.rect);
        n.title = b.caption || '';
        n.onclick = (e) => {
          e.stopPropagation();
          light([b.id]);
          const hs = p.hotspots.filter((h) => h.targets.includes(b.id));
          for (const h of hs) flashHs(h.id);
          openPanel(b.caption, b.text);
        };
        stage.append(n);
        blkEls[b.id] = n;
      }

      const hsEls = {};
      for (const h of p.hotspots) {
        const n = el('div', 'ov hs');
        place(n, h.rect);
        n.title = h.label || '';
        n.onclick = (e) => {
          e.stopPropagation();
          stage.querySelectorAll('.hs.active').forEach((x) => x.classList.remove('active'));
          n.classList.add('active');
          light(h.targets);
          const t = h.targets.map((id) => p.blocks[id]).filter(Boolean);
          openPanel(t[0]?.caption || h.label, t.map((b) => b.text).filter(Boolean).join('\n\n'));
          setHash(cur, h.id);
        };
        stage.append(n);
        hsEls[h.id] = n;
      }

      /* AI 프로토타입 동작 */
      let floating = null;
      function clearFloating() { if (floating) { floating.remove(); floating = null; } }
      function cropCanvas(rect, maxW) {
        const c = document.createElement('canvas');
        const sx = img.naturalWidth * rect.l / 100, sy = img.naturalHeight * rect.t / 100;
        const sw = img.naturalWidth * rect.w / 100, sh = img.naturalHeight * rect.h / 100;
        const k = Math.min(1, maxW / sw);
        c.width = Math.round(sw * k); c.height = Math.round(sh * k);
        c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        return c;
      }
      function showTip(anchor, text) {
        clearFloating();
        const t = el('div', 'tip', text);
        stage.append(t);
        const r = anchor.getBoundingClientRect(), sr = stage.getBoundingClientRect();
        let top = r.bottom - sr.top + 8, left = r.left - sr.left;
        if (top + t.offsetHeight > stage.offsetHeight) { top = r.top - sr.top - t.offsetHeight - 8; t.classList.add('up'); }
        left = Math.max(4, Math.min(left, stage.offsetWidth - t.offsetWidth - 4));
        t.style.top = top + 'px'; t.style.left = left + 'px';
        floating = t;
      }
      function showDropdown(anchor, b) {
        clearFloating();
        const d = el('div', 'drop');
        if (b.show_rect) d.append(cropCanvas(b.show_rect, 420));
        else { const q = el('div', null, b.content); q.style.cssText = 'padding:10px 12px;font-size:13px;max-width:280px;color:#1b1d22'; d.append(q); }
        stage.append(d);
        const r = anchor.getBoundingClientRect(), sr = stage.getBoundingClientRect();
        let top = r.bottom - sr.top + 4, left = r.left - sr.left;
        if (top + d.offsetHeight > stage.offsetHeight) top = Math.max(4, r.top - sr.top - d.offsetHeight - 4);
        left = Math.max(4, Math.min(left, stage.offsetWidth - d.offsetWidth - 4));
        d.style.top = top + 'px'; d.style.left = left + 'px';
        floating = d;
      }
      function showModal(b) {
        clearFloating();
        const bd = el('div', 'backdrop');
        const m = el('div', 'modal');
        const mh = el('div', 'mh');
        const x = el('button', null, '✕');
        mh.append(el('b', null, b.label || '팝업'), x);
        const mb = el('div', 'mb');
        if (b.content) mb.append(el('p', null, b.content));
        if (b.show_rect) mb.append(cropCanvas(b.show_rect, 860));
        m.append(mh, mb);
        bd.append(m);
        root.append(bd);
        const close = () => bd.remove();
        x.onclick = close;
        bd.onclick = (e) => { if (e.target === bd) close(); };
        m.onclick = (e) => e.stopPropagation();
      }
      function showInput(anchor, b) {
        clearFloating();
        const inp = el('input', 'fakein');
        inp.placeholder = b.content || '입력';
        const r = anchor.getBoundingClientRect(), sr = stage.getBoundingClientRect();
        inp.style.left = (r.left - sr.left) + 'px'; inp.style.top = (r.top - sr.top) + 'px';
        inp.style.width = Math.max(120, r.width) + 'px'; inp.style.height = Math.max(26, r.height) + 'px';
        inp.onclick = (e) => e.stopPropagation();
        inp.onkeydown = (e) => { if (e.key === 'Enter') { say('전송: ' + (inp.value || '(빈 입력)')); inp.value = ''; } if (e.key === 'Escape') clearFloating(); };
        stage.append(inp);
        inp.focus();
        floating = inp;
      }
      for (const b of (p.behaviors || [])) {
        const n = el('div', 'ov bh k-' + b.kind);
        place(n, b.rect);
        n.title = `${b.label || ''} · ${({ tooltip: '툴팁', popup: '팝업', dropdown: '드롭다운', navigate: '화면 이동', toggle: '토글', input: '입력', toast: '토스트' })[b.kind] || b.kind}`;
        const run = (e) => {
          e.stopPropagation();
          if (b.kind === 'tooltip') { if (floating && floating._src === n) { clearFloating(); return; } showTip(n, b.content); floating._src = n; }
          else if (b.kind === 'popup') showModal(b);
          else if (b.kind === 'dropdown') { if (floating && floating._src === n) { clearFloating(); return; } showDropdown(n, b); floating._src = n; }
          else if (b.kind === 'navigate') {
            if (b.target_page != null && P[b.target_page - 1]) goto(b.target_page - 1);
            else say('이동: ' + (b.content || b.label));
          }
          else if (b.kind === 'toast') say(b.content || b.label);
          else if (b.kind === 'toggle') { n.classList.toggle('on'); say((n.classList.contains('on') ? 'ON — ' : 'OFF — ') + (b.content || b.label)); }
          else if (b.kind === 'input') showInput(n, b);
        };
        if (b.trigger === 'hover' && b.kind === 'tooltip') {
          n.onmouseenter = () => { showTip(n, b.content); floating._src = n; };
          n.onmouseleave = () => { if (floating && floating._src === n) clearFloating(); };
          n.onclick = (e) => e.stopPropagation();
        } else n.onclick = run;
        stage.append(n);
      }

      for (const l of p.links) {
        const n = el('div', 'ov lnk');
        place(n, l.rect);
        n.title = `${P[l.page].title || '페이지 ' + (l.page + 1)} 상세로 이동`;
        n.onclick = (e) => { e.stopPropagation(); goto(l.page, l.hotspot); };
        stage.append(n);
      }

      function light(ids) {
        stage.querySelectorAll('.blk.lit').forEach((x) => x.classList.remove('lit'));
        for (const id of ids) {
          const n = blkEls[id];
          if (!n) continue;
          n.classList.add('lit');
          setTimeout(() => n.classList.remove('lit'), 2600);
        }
      }
      function flashHs(id) {
        const n = hsEls[id];
        if (!n) return;
        n.classList.add('active');
        setTimeout(() => n.classList.remove('active'), 2600);
      }
      stage.onclick = () => {
        stage.querySelectorAll('.hs.active').forEach((x) => x.classList.remove('active'));
        panel.classList.remove('open');
        clearFloating();
      };
      // 작은 오버레이가 큰 오버레이에 가려지지 않게 면적 내림차순으로 쌓는다
      const areaOf = (n) => parseFloat(n.style.width) * parseFloat(n.style.height);
      [...stage.querySelectorAll('.ov')].sort((a, b) => areaOf(b) - areaOf(a)).forEach((n) => stage.append(n));
      main.append(hint, stage);
      renderInter.activate = (hsId) => {
        const n = hsEls[hsId];
        if (n) setTimeout(() => n.click(), 60);
      };
    }

    /* ---------- 인쇄 모드 ---------- */
    function renderPrint() {
      main.innerHTML = '';
      for (const p of P) {
        const s = el('div', 'sheet');
        const img = el('img'); img.src = p.img; img.alt = p.title || '';
        s.append(img);
        main.append(s);
      }
    }

    function render() {
      root.classList.toggle('print', mode === 'print');
      bInter.classList.toggle('on', mode === 'inter');
      bPrint.classList.toggle('on', mode === 'print');
      pager.style.visibility = mode === 'inter' ? 'visible' : 'hidden';
      if (mode === 'inter') renderInter(); else renderPrint();
      curLb.textContent = `${cur + 1} / ${P.length}`;
      navBtns.forEach((b, i) => b.classList.toggle('on', i === cur));
      panel.classList.remove('open');
    }

    function goto(i, hsId) {
      cur = Math.max(0, Math.min(P.length - 1, i));
      if (mode !== 'inter') { mode = 'inter'; }
      render();
      setHash(cur, hsId);
      if (hsId != null) renderInter.activate(hsId);
      main.scrollTop = 0;
    }
    function setHash(i, hsId) {
      const h = '#p=' + (i + 1) + (hsId != null ? '&h=' + hsId : '');
      if (location.hash !== h) history.replaceState(null, '', h);
    }
    function applyHash() {
      const m = /p=(\d+)(?:&h=(\d+))?/.exec(location.hash);
      if (m) goto(parseInt(m[1], 10) - 1, m[2] != null ? parseInt(m[2], 10) : undefined);
    }

    prev.onclick = () => goto(cur - 1);
    next.onclick = () => goto(cur + 1);
    bInter.onclick = () => { mode = 'inter'; render(); };
    bPrint.onclick = () => { mode = 'print'; render(); };
    bPrintGo.onclick = () => { if (mode !== 'print') { mode = 'print'; render(); } setTimeout(() => window.print(), 120); };
    bShare.onclick = async () => {
      bShare.disabled = true;
      try {
        const url = await (opts.getShareUrl
          ? opts.getShareUrl()
          : Promise.resolve(location.href));
        await navigator.clipboard.writeText(url).catch(() => prompt('공유 URL', url));
        say('공유 URL을 복사했어요');
      } catch (e) {
        say(e && e.message ? e.message : '공유 URL을 만들지 못했어요');
      } finally { bShare.disabled = false; }
    };
    const aiCount = () => P.reduce((n, p) => n + ((p.behaviors || []).length), 0);
    function refreshAI() {
      const n = aiCount();
      bAI.textContent = n ? `AI 프로토타입 ✓ ${n}개 (다시 생성)` : 'AI 프로토타입 생성';
      bAI.classList.toggle('has', n > 0);
      root.classList.toggle('showai', n > 0);
      if (!opts.generate) bAI.hidden = true;
    }
    bAI.onclick = async () => {
      if (!opts.generate) return;
      if (aiCount() && !confirm('AI 프로토타입 동작을 다시 생성할까요? (페이지 수만큼 AI 호출이 일어나요)')) return;
      bAI.disabled = true;
      try {
        const r = await opts.generate((d, n) => { bAI.textContent = `AI 분석 중… ${d}/${n}`; });
        refreshAI();
        render();
        say(r && r.failed ? `${r.failed}개 페이지는 분석하지 못했어요: ${r.lastErr}` : `AI 프로토타입 동작 ${aiCount()}개를 만들었어요`);
      } catch (e) {
        say(e && e.message ? e.message : 'AI 분석에 실패했어요');
      } finally { bAI.disabled = false; refreshAI(); }
    };
    refreshAI();
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input,textarea')) return;
      if (e.key === 'ArrowLeft') goto(cur - 1);
      if (e.key === 'ArrowRight') goto(cur + 1);
    });
    window.addEventListener('hashchange', applyHash);

    render();
    applyHash();
    return { goto };
  }

  window.D2P = { init };
})();

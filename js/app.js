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
  .d2p .ctl button.reset{display:none;width:100%;margin-top:10px;font-size:12.5px;padding:5px 6px;color:var(--brand);border-color:var(--brand);background:var(--brand-soft)}
  .d2p.has-live .ctl button.reset{display:block}
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
  /* 관련 기획 패널: 넓은 화면 = 오른쪽 칸(기획서를 밀어냄), 좁은 화면 = 하단 접이식 시트 */
  .d2p .refs{display:none;background:var(--side);overflow:auto;min-width:0}
  .d2p.rp-open .refs{display:block}
  .d2p .refs .rh .cnt{font-weight:400;color:var(--muted);font-size:12px;margin-left:4px}
  .d2p .refs .it.here{padding:7px 14px;cursor:pointer}
  .d2p .refs .it.here .k{font-weight:600}
  .d2p .refs .it.here .k .tg{margin-left:auto;color:var(--muted);font-size:11px;font-weight:400}
  .d2p .refs .it.here:hover{background:var(--brand-soft)}
  .d2p .refs .sect{font-size:11px;font-weight:800;letter-spacing:.06em;color:var(--muted);padding:12px 14px 4px}
  .d2p .refs .hist{padding:0 8px 14px}
  .d2p .refs .hist button{display:flex;width:100%;text-align:left;gap:6px;border:0;background:none;border-radius:7px;padding:5px 8px;font-size:12.5px;color:var(--ink2)}
  .d2p .refs .hist button:hover{background:var(--brand-soft);color:var(--brand)}
  .d2p .refs .hist button em{font-style:normal;color:var(--muted);min-width:34px}
  .d2p .rtab{display:none;position:fixed;z-index:31;border:1px solid var(--line);background:var(--side);color:var(--ink);box-shadow:var(--shadow);font-weight:700;font-size:12.5px;cursor:pointer}
  .d2p.rp-has:not(.rp-open):not(.off) .rtab{display:flex}
  .d2p .rtab b{background:var(--brand);color:#fff;border-radius:999px;font-size:11px;padding:0 6px;line-height:17px}
  @media (min-width:1101px){
    .d2p.rp-open{grid-template-columns:260px minmax(0,1fr) 340px}
    .d2p.rp-open.nav-off{grid-template-columns:minmax(0,1fr) 340px}
    .d2p .refs{height:100%;border-left:1px solid var(--line)}
    .d2p .rtab{right:0;top:50%;transform:translateY(-50%);writing-mode:vertical-rl;padding:14px 7px;border-radius:10px 0 0 10px;border-right:0;gap:8px;align-items:center}
    .d2p .rtab b{writing-mode:horizontal-tb}
    .d2p.rp-has:not(.rp-open):not(.off) main{padding-right:46px}
  }
  @media (max-width:1100px){
    .d2p .refs{position:fixed;left:0;right:0;bottom:0;max-height:46vh;z-index:30;border-top:1px solid var(--line);box-shadow:0 -6px 24px rgba(20,24,40,.14);border-radius:14px 14px 0 0}
    .d2p .rtab{left:50%;bottom:12px;transform:translateX(-50%);padding:8px 14px;border-radius:999px;gap:8px;align-items:center;max-width:calc(100vw - 32px);white-space:nowrap}
    .d2p .rtab span{overflow:hidden;text-overflow:ellipsis}
    .d2p.rp-open main{padding-bottom:48vh}
  }
  .d2p .refs .rh{position:sticky;top:0;background:var(--side);display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)}
  .d2p .refs .rh b{flex:1;font-size:13.5px}
  .d2p .refs .rh button{padding:2px 8px;font-size:12px}
  .d2p .refs .it{padding:10px 14px;border-bottom:1px solid var(--line)}
  .d2p .refs .it:last-child{border-bottom:0}
  .d2p .refs .it .k{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700}
  .d2p .refs .it .k i{font-style:normal;background:#d93025;color:#fff;border-radius:999px;padding:0 6px;font-size:11px}
  .d2p .refs .it .k b.kn{white-space:nowrap;color:var(--ink)}
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
  /* ---- 버전 비교 ---- */
  .d2p{--add:#1e9e5a;--mod:#e08a00;--del:#d93025}
  .d2p .dctl .cnt{display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 4px}
  .d2p .tag{display:inline-block;font-size:10.5px;font-weight:800;color:#fff;border-radius:4px;padding:0 5px;line-height:17px;font-style:normal;white-space:nowrap}
  .d2p .tag.added{background:var(--add)} .d2p .tag.modified{background:var(--mod)} .d2p .tag.removed{background:var(--del)} .d2p .tag.moved{background:#6b6fd6}
  .d2p .toc a .tag{align-self:center;margin-left:auto} .d2p .toc a .lv + .tag,.d2p .toc a .tag + .lv{margin-left:4px}
  .d2p:not(.diff-on) .toc a .tag,.d2p:not(.diff-on) .toc a.ghost,.d2p:not(.diff-on) .ghost,.d2p:not(.diff-on) .dm,.d2p:not(.diff-on) .chg,.d2p:not(.diff-on) .dsum{display:none!important}
  .d2p .toc a.ghost{color:var(--muted);text-decoration:line-through;text-decoration-color:var(--del)}
  .d2p .dm{position:absolute;z-index:14;border-radius:3px;pointer-events:none}
  .d2p .dm.added{box-shadow:inset 0 0 0 2px var(--add);background:rgba(30,158,90,.10)}
  .d2p .dm.modified{box-shadow:inset 0 0 0 2px var(--mod);background:rgba(224,138,0,.10)}
  .d2p .dm.removed{border:2px dashed var(--del);background:repeating-linear-gradient(135deg,rgba(217,48,37,.10) 0 6px,transparent 6px 12px)}
  .d2p .dm.was{border:2px dashed #6b6fd6;background:rgba(107,111,214,.06)}
  .d2p .dm .tag{position:absolute;left:-2px;top:0;transform:translateY(-100%);pointer-events:auto;cursor:pointer;border-radius:4px 4px 0 0}
  .d2p .dm.removed .tag,.d2p .dm.was .tag{top:auto;bottom:0;transform:translateY(100%);border-radius:0 0 4px 4px}
  .d2p.live-on .slide.has-live .dm.inlive{display:none}
  .d2p .chg{margin:0 0 6px;padding:8px 12px;border:1px solid var(--line);border-left:4px solid var(--mod);border-radius:8px;background:var(--side);font-size:12.5px}
  .d2p .chg.added{border-left-color:var(--add)}
  .d2p .chg .ch{display:flex;align-items:center;gap:8px;flex-wrap:wrap} .d2p .chg .ch b{font-size:13px}
  .d2p .chg .ch button{margin-left:auto;font-size:12px;padding:3px 9px}
  .d2p .chg ul{margin:6px 0 0;padding:0;list-style:none;display:grid;gap:3px}
  .d2p .chg li{display:flex;gap:7px;align-items:baseline;cursor:pointer;padding:2px 4px;border-radius:5px;line-height:1.5}
  .d2p .chg li:hover{background:var(--brand-soft)}
  .d2p .chg li .tx{color:var(--ink2);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .d2p del{background:rgba(217,48,37,.16);color:var(--del);text-decoration:line-through}
  .d2p ins{background:rgba(30,158,90,.18);color:var(--add);text-decoration:none;font-weight:700}
  .d2p .refs .it .seg{margin:6px 0 0;font-size:12.5px;white-space:pre-wrap;line-height:1.6;color:var(--ink2)}
  .d2p .refs .it .lbl{font-size:11px;font-weight:700;color:var(--muted);margin-top:8px}
  .d2p .ghost .slide{filter:grayscale(1);opacity:.55}
  .d2p .ghost .slide-scroll{position:relative;outline:3px dashed var(--del);outline-offset:-3px}
  .d2p .ghost .gban{position:absolute;inset:auto 0 0 0;z-index:5;background:rgba(217,48,37,.92);color:#fff;font-weight:800;font-size:14px;padding:8px 14px;text-align:center}
  .d2p .dsum{max-width:1400px;margin:0 auto 26px;background:var(--side);border:1px solid var(--line);border-radius:10px;padding:16px 18px;box-shadow:var(--shadow)}
  .d2p .dsum h2{margin:0 0 4px;font-size:17px} .d2p .dsum .sub{color:var(--muted);font-size:12.5px;margin-bottom:10px}
  .d2p .dsum table{width:100%;border-collapse:collapse;font-size:13px}
  .d2p .dsum td,.d2p .dsum th{border-top:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
  .d2p .dsum th{font-size:11.5px;color:var(--muted);font-weight:700}
  .d2p .dsum tr.go{cursor:pointer} .d2p .dsum tr.go:hover td{background:var(--brand-soft)}
  .d2p .dsum td.pg{white-space:nowrap;color:var(--ink2);font-variant-numeric:tabular-nums}
  .d2p .cmpbox{position:relative;width:min(1200px,92vw);aspect-ratio:var(--ar);background:#fff;user-select:none}
  .d2p .cmpbox img{position:absolute;inset:0;width:100%;height:100%}
  .d2p .cmpbox .old{clip-path:inset(0 calc(100% - var(--x)) 0 0)}
  .d2p .cmpbox .bar{position:absolute;top:0;bottom:0;left:var(--x);width:2px;background:var(--brand);box-shadow:0 0 0 1px #fff}
  .d2p .cmpbox .lab{position:absolute;top:8px;font-size:12px;font-weight:800;color:#fff;background:rgba(20,24,40,.75);border-radius:5px;padding:1px 8px}
  .d2p .cmpctl{display:flex;align-items:center;gap:10px;padding:10px 14px;font-size:12.5px;color:var(--ink2)}
  .d2p .cmpctl input{flex:1}
  @media print{
    .d2p .dm,.d2p .chg,.d2p .ghost,.d2p .dsum{display:none!important}
  }
  @media print{
    .d2p{position:static;display:block}
    .d2p nav.toc,.d2p .refs,.d2p .rtab,.d2p .toast,.d2p .dot,.d2p .hs,.d2p .lnk,.d2p .bh,.d2p .hl,.d2p .rowhit,.d2p iframe.live,.d2p .livebadge,.d2p .copybtn,.d2p .cap{display:none!important}
    .d2p main{overflow:visible;padding:0}
    .d2p .slide-wrap{max-width:none;margin:0;page-break-after:always}
    .d2p .slide-scroll{box-shadow:none;border-radius:0}
    .d2p .slide{min-width:0}
  }
  /* ---- 사이드 메뉴 접기 ---- */
  .d2p .toc .fold{position:absolute;top:16px;right:10px;width:28px;height:28px;padding:0;border-radius:7px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:15px;line-height:1}
  .d2p .toc .fold:hover{color:var(--brand)}
  .d2p nav.toc{position:relative} .d2p .toc .brand{padding-right:30px}
  .d2p .navopen{position:fixed;left:14px;top:14px;z-index:45;display:none;align-items:center;gap:6px;padding:7px 12px;border-radius:9px;box-shadow:var(--shadow);font-size:13px;font-weight:700}
  .d2p.nav-off{grid-template-columns:minmax(0,1fr)}
  .d2p.nav-off nav.toc{display:none}
  .d2p.nav-off .navopen{display:flex}
  .d2p.nav-off main{padding-top:58px} .d2p.nav-off .slide-wrap,.d2p.nav-off .dsum{scroll-margin-top:52px}
  @media print{ .d2p .navopen{display:none!important} }
  @media (max-width:760px){
    .d2p{grid-template-columns:1fr} .d2p nav.toc{display:none} .d2p main{padding:12px;padding-top:58px} .d2p .navopen{display:flex}
    .d2p.nav-show nav.toc{display:block;position:fixed;inset:0 auto 0 0;width:min(300px,86vw);z-index:60;box-shadow:var(--shadow)}
    .d2p.nav-show .navopen{display:none}
  }
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
    // 동작 화면: 한 문서에 여러 앱(예: 후원페이지·스튜디오·채팅)을 둘 수 있다.
    // live.json = { apps:{이름:{src,events}}, frames:[{page,rect,state,app}] }  (예전 형식 { src, events, frames } 도 지원)
    const LIVE = model.live ? (model.live.apps ? model.live : { ...model.live, apps: { main: { src: model.live.src, events: model.live.events || [] } } }) : null;
    const appOf = (f) => (LIVE && LIVE.apps[f && f.app] ? f.app : LIVE ? Object.keys(LIVE.apps)[0] : null);
    const liveByPage = {};
    if (LIVE) for (const f of LIVE.frames || []) liveByPage[f.page - 1] = f;
    if (LIVE) root.classList.add('has-live', 'live-on', 'nums');

    /* ---------- 공통 UI ---------- */
    const toast = el('div', 'toast'); let toastT;
    const say = (m) => { toast.textContent = m; toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 1800); };
    const refs = el('aside', 'refs');
    const rtab = el('button', 'rtab'); rtab.setAttribute('aria-label', '관련 기획 펼치기');
    const refHist = [];   // 최근 본 기획 (동작 화면 요소 단위)
    let refLabel = '';

    /* ---------- 참조 해석: "21:7", "8:1-4", "20:공통" ---------- */
    function resolve(ref) {
      const m = /^(\d+):(.+)$/.exec(ref); if (!m) return null;
      const pi = +m[1] - 1, key = m[2].trim(), p = P[pi]; if (!p) return null;
      // Description 행 → 툴팁 표 행 → 그 밖의 표 행 순서로 찾는다 (목업 안 표와 툴팁 표의 항목 이름이 겹칠 수 있음)
      const rank = { desc: 0, tooltip: 1 };
      const rows = [...(p.rows || [])].sort((a, b) => (rank[a.role] ?? 2) - (rank[b.role] ?? 2));
      const main = key.includes('-') ? key.split('-')[0] : key;
      const row = rows.find((r) => r.key === key) || rows.find((r) => r.key === main);
      if (!row) return { pi, key, rect: null, title: key, text: '' };
      const sub = key.includes('-') && row.subs ? row.subs[key] : null;
      let text = row.text || '';
      if (sub) {   // 하위 항목 텍스트만 추출
        const lines = text.split('\n'); const i = lines.findIndex((l) => l.trim().startsWith(key + '.') || l.trim().startsWith(key + ' '));
        if (i >= 0) { let j = i + 1; while (j < lines.length && !/^\s*\d{1,2}\s*-\s*\d{1,2}\s*[.)]?\s/.test(lines[j])) j++; text = lines.slice(i, j).join('\n').trim(); }
      }
      if (row.role !== 'desc' && !sub) {   // 표 행: 항목 이름 + 나머지 칸 내용 전체
        const rest = text.split(/\s*\|\s*/).slice(1).join(' · ').trim();
        return { pi, key, rect: row.rect, rowRect: row.rect, sub: false, title: '', text: '\n' + (rest || text) };
      }
      const title = (sub ? text.split('\n')[0] : (row.title || key)).replace(new RegExp('^' + key + '\\s*\\|\\s*'), '');
      return { pi, key, rect: sub || row.rect, rowRect: row.rect, sub: !!sub, title, text };
    }

    /* ---------- 사이드바 ---------- */
    const nav = el('nav', 'toc');
    const home = el('a', 'home', 'DOC2PROTO'); home.href = opts.homeHref || './';
    nav.append(home, el('div', 'brand', model.title));
    // 사이드 메뉴 접기/펴기 (상태는 이 브라우저에 기억)
    const fold = el('button', 'fold', '«'); fold.title = '메뉴 접기 ( [ )'; fold.setAttribute('aria-label', '사이드 메뉴 접기');
    const navOpen = el('button', 'navopen', '☰ 메뉴'); navOpen.title = '메뉴 펼치기 ( [ )'; navOpen.setAttribute('aria-label', '사이드 메뉴 펼치기');
    const mobile = () => matchMedia('(max-width:760px)').matches;
    const setNav = (show) => {
      if (mobile()) { root.classList.toggle('nav-show', show); return; }
      relayout(() => root.classList.toggle('nav-off', !show));   // 폭이 바뀌어도 보던 위치에 머문다
      try { localStorage.setItem('d2p.nav', show ? '1' : '0'); } catch {}
    };
    fold.onclick = () => setNav(false);
    navOpen.onclick = () => setNav(true);
    try { if (localStorage.getItem('d2p.nav') === '0') root.classList.add('nav-off'); } catch {}
    nav.append(fold);
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
      const anyEvents = Object.values(LIVE.apps).some((a) => (a.events || []).length);
      for (const [name, a] of Object.entries(LIVE.apps)) {
        for (const g of a.events || []) {
          const lab = el('div', 'evlabel live-only', g.group); lab.dataset.app = name;
          const box = el('div', 'evs live-only'); box.dataset.app = name;
          for (const ev of g.items) {
            const b = el('button', null, ev.label);
            b.onclick = () => { const f = current(); if (f && appOf(f.frame) === name) send(f, { type: 'event', name: ev.name, value: ev.value }); else say('이 이벤트는 해당 동작 화면이 있는 페이지에서 눌러 주세요'); };
            box.append(b);
          }
          ctl.append(lab, box);
        }
      }
      if (anyEvents) {
        const rs = el('button', 'reset live-only', '기본 상태로 초기화');
        rs.title = '이벤트·조작으로 바뀐 동작 화면을 이 페이지의 처음 상태로 되돌려요';
        rs.onclick = () => { const f = current(); if (!f) { say('동작 화면이 있는 페이지에서 눌러 주세요'); return; } unmountLive(f); mountLive(f); say('기본 상태로 되돌렸어요'); };
        ctl.append(rs);
      }
    }
    const r2 = el('div', 'row btns'); r2.style.marginTop = '10px';
    const bShare = el('button', null, '링크 복사');
    r2.append(bShare);
    ctl.append(r2);
    nav.append(ctl);

    /* ---------- 버전 비교 (diff.json) ---------- */
    const D = model.diff || null;
    const dPage = {};       // 새 페이지 index → diff 항목
    if (D) for (const e of D.pages || []) dPage[e.page - 1] = e;
    if (D) {
      root.classList.add('has-diff');
      if (opts.diffOn !== false) root.classList.add('diff-on');
      const dc = el('div', 'ctl dctl');
      const rr = el('div', 'row'); rr.append(el('b', null, `변경 사항 · ${D.base} → ${model.version || ''}`));
      const dsw = el('button', 'sw sm' + (root.classList.contains('diff-on') ? ' on' : '')); dsw.setAttribute('aria-label', '변경 사항 표시'); rr.append(dsw);
      dc.append(rr);
      const cnt = el('div', 'cnt'); const C = D.counts || {};
      if (C.modified) cnt.append(el('i', 'tag modified', `수정 ${C.modified}쪽`));
      if (C.added) cnt.append(el('i', 'tag added', `신규 ${C.added}쪽`));
      if (C.removed) cnt.append(el('i', 'tag removed', `삭제 ${C.removed}쪽`));
      if (!cnt.children.length) cnt.append(el('span', null, '바뀐 페이지가 없어요'));
      dc.append(cnt, el('small', null, '초록 = 추가, 주황 = 수정, 빨강 = 삭제. 표시를 누르면 이전 → 현재 내용이 보여요.'));
      const go = el('button', null, '변경 요약 보기'); go.style.width = '100%'; go.style.fontSize = '12.5px';
      go.onclick = () => { if (!root.classList.contains('diff-on')) dsw.click(); main.scrollTo({ top: 0, behavior: 'smooth' }); };
      dc.append(go);
      dsw.onclick = () => { dsw.classList.toggle('on'); root.classList.toggle('diff-on', dsw.classList.contains('on')); closePanel(); slides.forEach(sendChanged); };
      nav.append(dc);
    }
    const baseImg = (n) => (D && D.baseDir ? `${D.baseDir}p${n}.jpg` : null);
    const TAG = { added: '추가', modified: '수정', removed: '삭제', moved: '이동' };
    // 요약표용: 바뀌지 않은 긴 부분은 앞뒤만 남기고 줄인다
    const trimSegs = (segs) => segs.map(([op, t], k, arr) => {
      if (op !== '=' || t.length <= 36) return [op, t.replace(/\n/g, ' ')];
      const f = t.replace(/\n/g, ' ');
      return ['=', k === 0 ? '…' + f.slice(-16) : k === arr.length - 1 ? f.slice(0, 16) + '…' : f.slice(0, 12) + ' … ' + f.slice(-12)];
    });
    const pad = (r) => ({ l: r.l - 0.25, t: r.t - 0.35, w: r.w + 0.5, h: r.h + 0.7 });
    const segHtml = (segs) => {
      const box = el('div', 'seg');
      for (const [op, t] of segs) box.append(op === '=' ? document.createTextNode(t) : el(op === '+' ? 'ins' : 'del', null, t));
      return box;
    };

    const tocLinks = P.map((p, i) => {
      const a = el('a');
      const kind = p.kind || 'page';
      a.className = 'sec ' + (kind === 'chapter' ? 'chapter' : !p.num ? 'plain' : p.num.includes('.') ? 'sub' : 'top');
      a.href = '#s' + (i + 1);
      if (p.num && kind !== 'chapter') a.append(el('em', null, p.num));
      a.append(el('span', null, p.label || p.title || `페이지 ${i + 1}`));
      if (liveByPage[i]) a.append(el('i', 'lv', 'LIVE'));
      if (dPage[i] && dPage[i].status !== 'same') a.append(el('i', 'tag ' + dPage[i].status, dPage[i].status === 'added' ? '신규' : '수정'));
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

      if (dPage[i]) mountDiff(S, i, dPage[i]);
      if (S.chg) sec.append(S.chg);
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

    /* ---------- 버전 비교 표시 ---------- */
    function rowRectOf(pi, key) { const r = (P[pi].rows || []).find((x) => x.key === key); return r ? r.rect : null; }
    function inFrame(pi, rect) { const f = liveByPage[pi]; if (!f || !rect) return false; const cx = rect.l + rect.w / 2, cy = rect.t + rect.h / 2; return cx > f.rect.l && cx < f.rect.l + f.rect.w && cy > f.rect.t && cy < f.rect.t + f.rect.h; }
    function changeItems(pi, e) {
      const items = [];
      for (const r of e.rows || []) {
        if (r.status === 'renum') continue;
        const label = r.status === 'removed' ? `${r.old_key}번 삭제` : r.status === 'added' ? `${r.key}번 추가` : `${r.key}번 수정`;
        items.push({ kind: 'row', st: r.status, label, title: (r.title || '').split('\n')[0], rect: r.status === 'removed' ? null : rowRectOf(pi, r.key), d: r });
      }
      for (const sh of e.shapes || []) {
        const st = sh.status === 'modified' && sh.changes.length === 1 && sh.changes[0] === 'moved' ? 'moved' : sh.status;
        const what = st === 'moved' ? '위치 이동' : st === 'added' ? '화면 요소 추가' : st === 'removed' ? '화면 요소 삭제' : sh.changes.includes('text') ? '글자 수정' : '모양 수정';
        items.push({ kind: 'shape', st, label: what, title: (sh.text || sh.new || '').split('\n')[0].slice(0, 40) || '글자 없는 도형', rect: sh.rect || null, old: sh.old_rect || null, d: sh });
      }
      return items;
    }
    function mountDiff(S, pi, e) {
      if (e.status === 'same') return;
      const chg = el('div', 'chg ' + e.status); S.chg = chg;
      const ch = el('div', 'ch');
      if (e.status === 'added') {
        ch.append(el('i', 'tag added', '신규 페이지'), el('b', null, `${D.base}에 없던 페이지예요`));
        chg.append(ch); return;
      }
      ch.append(el('i', 'tag modified', '수정'), el('b', null, `${D.base} 대비 · ${e.summary || ''}`));
      if (e.base !== pi + 1) ch.append(el('span', null, `(${D.base} ${e.base}p)`));
      if (baseImg(e.base)) { const cb = el('button', null, '이전 버전과 겹쳐 보기'); cb.onclick = () => compare(pi, e); ch.append(cb); }
      chg.append(ch);
      const ul = el('ul');
      for (const it of changeItems(pi, e)) {
        const li = el('li'); li.append(el('i', 'tag ' + it.st, TAG[it.st]), el('span', null, it.label), el('span', 'tx', it.title));
        li.onclick = () => showChange(pi, it);
        ul.append(li);
        // 슬라이드 위 표시
        const live = inFrame(pi, it.rect || it.old);
        if (it.rect && it.st !== 'removed') {
          const m = el('div', 'dm ' + (it.st === 'moved' ? 'modified' : it.st) + (live ? ' inlive' : '')); place(m, pad(it.rect));
          const t = el('i', 'tag ' + it.st, TAG[it.st]); t.onclick = (ev) => { ev.stopPropagation(); showChange(pi, it); }; m.append(t);
          S.stage.append(m);
        }
        if (it.old) {
          const m = el('div', 'dm ' + (it.st === 'removed' ? 'removed' : 'was') + (live ? ' inlive' : '')); place(m, pad(it.old));
          const t = el('i', 'tag ' + (it.st === 'removed' ? 'removed' : 'moved'), it.st === 'removed' ? '삭제' : '이전 위치'); t.onclick = (ev) => { ev.stopPropagation(); showChange(pi, it); }; m.append(t);
          S.stage.append(m);
        }
      }
      chg.append(ul);
    }
    function showChange(pi, it) {
      panelStart(`변경 내용 · ${pi + 1}p ${it.label}`, '', '변경 내용');
      const box = el('div', 'it'); const d = it.d;
      const k = el('div', 'k'); k.append(el('i', 'tag ' + it.st, TAG[it.st]), el('span', null, it.title || it.label)); box.append(k);
      if (d.segs) { box.append(el('div', 'lbl', `${D.base} → ${model.version || '현재'}`), segHtml(d.segs)); }
      else if (it.st === 'added' && (d.new || d.text)) box.append(el('div', 'lbl', '추가된 내용'), segHtml([['+', d.new || d.text]]));
      else if (it.st === 'removed' && (d.old || d.text)) box.append(el('div', 'lbl', `${D.base}에 있던 내용`), segHtml([['-', d.old || d.text]]));
      if (it.st === 'moved') box.append(el('p', null, '위치가 바뀌었어요. 보라색 점선이 이전 위치예요.'));
      if (it.kind === 'row' && d.old_key && d.key && d.old_key !== d.key) box.append(el('p', null, `번호 변경: ${d.old_key} → ${d.key}`));
      refs.append(box); panelHistory();
      openPanel();
      clearLit();
      if (it.rect) light(pi, it.rect); if (it.old) light(pi, it.old, true);
      if (!isVisible(slides[pi].sec)) goto(pi);
    }
    function compare(pi, e) {
      const bd = el('div', 'backdrop'); const m = el('div', 'modal');
      const mh = el('div', 'mh'); const x = el('button', null, '✕');
      mh.append(el('b', null, `${pi + 1}p 겹쳐 보기 — 왼쪽 ${D.base} ${e.base}p / 오른쪽 ${model.version || '현재'}`), x);
      const box = el('div', 'cmpbox'); box.style.setProperty('--ar', `${WPT}/${HPT}`); box.style.setProperty('--x', '50%');
      const a = el('img'); a.src = P[pi].img; const b = el('img', 'old'); b.src = baseImg(e.base);
      const bar = el('div', 'bar'); const l1 = el('span', 'lab', D.base); l1.style.left = '8px'; const l2 = el('span', 'lab', model.version || '현재'); l2.style.right = '8px';
      box.append(a, b, bar, l1, l2);
      const ctl = el('div', 'cmpctl'); const rg = el('input'); rg.type = 'range'; rg.min = 0; rg.max = 100; rg.value = 50;
      rg.oninput = () => box.style.setProperty('--x', rg.value + '%');
      const blink = el('button', null, '번갈아 보기'); let bt = null;
      blink.onclick = () => { if (bt) { clearInterval(bt); bt = null; blink.textContent = '번갈아 보기'; return; } let on = false; bt = setInterval(() => { on = !on; box.style.setProperty('--x', on ? '100%' : '0%'); }, 700); blink.textContent = '멈춤'; };
      ctl.append(el('span', null, D.base), rg, el('span', null, model.version || '현재'), blink);
      const drag = (ev) => { const r = box.getBoundingClientRect(); const v = Math.max(0, Math.min(100, (ev.clientX - r.left) / r.width * 100)); rg.value = v; box.style.setProperty('--x', v + '%'); };
      box.onpointerdown = (ev) => { box.setPointerCapture(ev.pointerId); drag(ev); box.onpointermove = drag; };
      box.onpointerup = () => { box.onpointermove = null; };
      m.append(mh, box, ctl); m.style.maxWidth = 'none'; bd.append(m); root.append(bd);
      const close = () => { if (bt) clearInterval(bt); bd.remove(); }; x.onclick = close; bd.onclick = (ev) => { if (ev.target === bd) close(); };
    }
    function sendChanged(S) {
      const pi = slides.indexOf(S), e = dPage[pi];
      if (!S.iframe) return;
      const on = root.classList.contains('diff-on') && e && e.status !== 'same';
      let refsCh = [];
      if (on && e.status === 'added') refsCh = (P[pi].rows || []).map((r) => `${pi + 1}:${r.key}`);
      else if (on) {
        refsCh = (e.rows || []).filter((r) => r.status === 'added' || r.status === 'modified').map((r) => `${pi + 1}:${r.key}`);
        // 동작 화면 안에서 바뀐 도형 → 겹치는 번호 마커의 기획 번호로 알린다
        const hit = (a, b) => a.l < b.l + b.w && b.l < a.l + a.w && a.t < b.t + b.h && b.t < a.t + a.h;
        for (const sh of e.shapes || []) {
          const r = sh.rect || sh.old_rect; if (!inFrame(pi, r)) continue;
          for (const h of P[pi].hotspots || []) if (h.marker != null && hit(h.rect, r)) refsCh.push(`${pi + 1}:${h.marker}`);
        }
        refsCh = [...new Set(refsCh)];
      }
      send(S, { type: 'changed', refs: refsCh, base: D ? D.base : '' });
    }
    // 삭제된 페이지: 이전 버전 스냅샷을 회색으로 끼워 넣기
    function mountGhosts() {
      if (!D) return;
      for (const g of D.removed || []) {
        const sec = el('section', 'slide-wrap ghost'); sec.id = 'g' + g.base;
        const chg = el('div', 'chg'); chg.style.borderLeftColor = 'var(--del)';
        const ch = el('div', 'ch'); ch.append(el('i', 'tag removed', '삭제된 페이지'), el('b', null, `${D.base} ${g.base}p · ${g.title}`)); chg.append(ch);
        sec.append(chg);
        const sc = el('div', 'slide-scroll'); const st = el('div', 'slide'); st.style.aspectRatio = `${WPT}/${HPT}`;
        if (baseImg(g.base)) { const im = el('img', 'bg'); im.src = baseImg(g.base); im.loading = 'lazy'; st.append(im); }
        sc.append(st, el('div', 'gban', `${model.version || '이번 버전'}에서 삭제된 페이지예요`)); sec.append(sc);
        const prev = g.after > 0 ? slides[g.after - 1] : null;
        if (prev) prev.sec.after(sec); else main.prepend(sec);
        const a = el('a', 'sec ghost'); a.href = '#g' + g.base;
        if (g.num) a.append(el('em', null, g.num));
        a.append(el('span', null, g.title), el('i', 'tag removed', '삭제'));
        a.onclick = (ev) => { ev.preventDefault(); sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
        const pl = g.after > 0 ? tocLinks[g.after - 1] : null;
        if (pl) pl.after(a); else tocLinks[0] && tocLinks[0].before(a);
      }
      // 문서 첫머리 변경 요약표
      const sum = el('section', 'dsum'); sum.id = 'changes';
      sum.append(el('h2', null, `변경 요약 · ${D.base} → ${model.version || ''}`));
      const C = D.counts || {};
      sum.append(el('div', 'sub', `수정 ${C.modified || 0}쪽 · 신규 ${C.added || 0}쪽 · 삭제 ${C.removed || 0}쪽 — 행을 누르면 해당 페이지로 이동해요`));
      const tb = el('table'); const hr = el('tr'); ['페이지', '구분', '제목', '바뀐 내용'].forEach((h) => hr.append(el('th', null, h))); tb.append(hr);
      const rows = [];
      for (const e of D.pages || []) if (e.status !== 'same') rows.push({ pos: e.page, st: e.status, pg: `${e.page}p` + (e.base && e.base !== e.page ? ` (←${e.base}p)` : ''), title: e.title, what: e.status === 'added' ? '새 페이지' : e.summary, go: () => goto(e.page - 1), e });
      for (const g of D.removed || []) rows.push({ pos: g.after + 0.5, st: 'removed', pg: `${D.base} ${g.base}p`, title: g.title, what: '페이지 삭제', go: () => document.getElementById('g' + g.base).scrollIntoView({ behavior: 'smooth' }) });
      rows.sort((a, b) => a.pos - b.pos);
      for (const r of rows) {
        const tr = el('tr', 'go'); tr.onclick = r.go;
        const t1 = el('td', 'pg', r.pg); const t2 = el('td'); t2.append(el('i', 'tag ' + r.st, r.st === 'added' ? '신규' : r.st === 'removed' ? '삭제' : '수정'));
        const t4 = el('td'); t4.append(el('div', null, r.what || ''));
        if (r.e && r.e.rows) for (const x of r.e.rows) if (x.segs) { const sg = segHtml(trimSegs(x.segs)); sg.style.fontSize = '12px'; t4.append(sg); }
        tr.append(t1, t2, el('td', null, r.title), t4); tb.append(tr);
      }
      sum.append(tb);
      main.prepend(sum);
    }

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
      const src = LIVE.apps[appOf(S.frame)].src;
      f.src = src.startsWith('blob:') ? `${src}#${qs}` : `${src}${src.includes('?') ? '&' : '?'}${qs}`;
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
      else if (m.type === 'ready' && D) sendChanged(S);
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
    function panelStart(title, count, tabText) {
      refs.innerHTML = '';
      const head = el('div', 'rh'); const t = el('b', null, title); if (count) t.append(el('span', 'cnt', count)); head.append(t);
      const x = el('button', null, matchMedia('(max-width:1100px)').matches ? '▼' : '»'); x.title = '접기 (Esc)'; x.onclick = closePanel; head.append(x);
      refs.append(head);
      refLabel = tabText || title;
      rtab.innerHTML = ''; rtab.append(el('span', null, '관련 기획'), el('b', null, count ? count.replace(/\D/g, '') || '1' : '1'));
      if (tabText) rtab.append(el('span', null, tabText));
      rtab.title = `${refLabel} — 펼치기`;
      root.classList.add('rp-has');
    }
    function panelHistory() {
      if (refHist.length < 2) return;
      refs.append(el('div', 'sect', '최근 본 기획'));
      const h = el('div', 'hist');
      for (const e of refHist.slice(1, 6)) {
        const b = el('button'); b.append(el('em', null, `${e.pi + 1}p`), el('span', null, e.label || '선택한 요소'));
        b.onclick = () => { if (!isVisible(slides[e.pi].sec)) goto(e.pi); showRefs(e.pi, e.list, e.label); };
        h.append(b);
      }
      refs.append(h);
    }
    // 패널을 열고 닫아도 보던 위치 유지 (폭이 바뀌면 슬라이드 높이도 바뀜)
    function relayout(fn) {
      const top = main.scrollTop, S = slides.find((x) => x.sec.offsetTop + x.sec.offsetHeight > top) || slides[currentIdx];
      const frac = S ? (top - S.sec.offsetTop) / Math.max(1, S.sec.offsetHeight) : 0;
      fn();
      if (S) { main.style.scrollBehavior = 'auto'; main.scrollTop = S.sec.offsetTop + frac * S.sec.offsetHeight; main.style.scrollBehavior = ''; navLock = Date.now() + 300; }
    }
    function openPanel() { if (!root.classList.contains('rp-open')) relayout(() => root.classList.add('rp-open')); }
    function closePanel() { if (root.classList.contains('rp-open')) relayout(() => root.classList.remove('rp-open')); }
    rtab.onclick = openPanel;
    function showRefs(pi, list, label) {
      const items = list.map(resolve).filter(Boolean);
      if (!items.length) return;
      clearLit(); clearActive();
      items.filter((r) => r.pi === pi).forEach((r) => { lightRef(`${r.pi + 1}:${r.key}`, true); markHotspots(pi, r.key); });
      // 관련 기획이 모두 이 페이지에 있으면 Description 하이라이트로 충분 — 패널은 띄우지 않는다
      if (items.every((r) => r.pi === pi)) { closePanel(); root.classList.remove('rp-has'); return; }
      const key = pi + '|' + list.join(' ');
      const hi = refHist.findIndex((e) => e.key === key); if (hi >= 0) refHist.splice(hi, 1);
      refHist.unshift({ key, pi, list, label }); refHist.length = Math.min(refHist.length, 8);
      panelStart(`관련 기획 · ${label || '선택한 요소'}`, `${items.length}건`, label || '');
      items.sort((a, b) => (a.pi === pi ? -1 : 0) - (b.pi === pi ? -1 : 0) || a.pi - b.pi);
      for (const r of items) {
        if (r.pi === pi) {   // 이 페이지 항목: 이미 노랗게 표시되므로 한 줄로 (누르면 내용 펼침)
          const it = el('div', 'it here'); const k = el('div', 'k');
          if (/^\d{1,2}(-\d{1,2})?$/.test(r.key)) k.append(el('i', null, r.key)); else k.append(el('b', 'kn', r.key));
          k.append(el('span', null, r.title.replace(/^\d{1,2}-\d{1,2}\.\s*/, '')), el('span', 'tg', '이 페이지 ▾'));
          it.append(k);
          const body = r.text.split('\n').slice(1).join('\n').trim();
          let p = null;
          it.onclick = () => { if (p) { p.remove(); p = null; k.lastChild.textContent = '이 페이지 ▾'; return; } if (!body) return; p = el('p', null, body); it.append(p); k.lastChild.textContent = '이 페이지 ▴'; lightRef(`${r.pi + 1}:${r.key}`); };
          refs.append(it);
          continue;
        }
        const it = el('div', 'it'); const k = el('div', 'k');
        k.append(el('span', null, `${r.pi + 1}p ${P[r.pi].num ? '(' + P[r.pi].num + ')' : ''}`));
        if (/^\d{1,2}(-\d{1,2})?$/.test(r.key)) k.append(el('i', null, r.key)); else { const kb = el('b', 'kn', r.key); k.append(kb); }
        k.append(el('span', null, r.title.replace(/^\d{1,2}-\d{1,2}\.\s*/, '')));
        if (r.pi === pi) k.append(el('span', 'here', '이 페이지'));
        else { const go = el('button', null, '보기 →'); go.onclick = () => { goto(r.pi); setTimeout(() => { lightRef(`${r.pi + 1}:${r.key}`); markHotspots(r.pi, r.key); }, 450); }; k.append(go); }
        it.append(k);
        const body = r.text.split('\n').slice(1).join('\n').trim();
        if (body) it.append(el('p', null, body.length > 320 ? body.slice(0, 320) + '…' : body));
        refs.append(it);
      }
      panelHistory();
      openPanel();
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

    // 지금 보는 페이지의 동작 화면 앱에 맞는 이벤트 버튼만 보이게 (앱이 하나면 항상 보임)
    let lastApp;
    function syncEvents() {
      if (!LIVE || Object.keys(LIVE.apps).length < 2) return;
      let k = currentIdx; while (k >= 0 && !liveByPage[k]) k--;   // 동작 화면 없는 페이지는 직전 앱 유지
      const app = k >= 0 ? appOf(liveByPage[k]) : Object.keys(LIVE.apps)[0];
      if (app === lastApp) return; lastApp = app;
      root.querySelectorAll('.ctl [data-app]').forEach((n) => { n.style.display = n.dataset.app === app ? '' : 'none'; });
      const rs = root.querySelector('.ctl button.reset'); if (rs) rs.style.display = (LIVE.apps[app].events || []).length ? '' : 'none';
    }

    /* ---------- 이동 / 해시 / 목차 ---------- */
    let navLock = 0;
    function goto(i, hsId) {
      const S = slides[i]; if (!S) return;
      tocLinks.forEach((a, k) => a.classList.toggle('on', k === i)); currentIdx = i; syncEvents();
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
      currentIdx = i; syncEvents();
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
      if (!on) { closePanel(); clearLit(); clearActive(); }
    };
    bShare.onclick = async () => {
      try { const url = await (opts.getShareUrl ? opts.getShareUrl() : Promise.resolve(location.href)); await navigator.clipboard.writeText(url); say('링크를 복사했어요'); }
      catch (e) { say(e && e.message ? e.message : '링크를 만들지 못했어요'); }
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { clearFloating(); closePanel(); const bd = root.querySelector('.backdrop'); if (bd) bd.remove(); } });
    window.addEventListener('hashchange', applyHash);

    mountGhosts();
    syncEvents();
    root.append(nav, main, refs, toast, navOpen, rtab);
    document.addEventListener('keydown', (e) => {
      if (e.key !== '[' || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) return;
      setNav(mobile() ? !root.classList.contains('nav-show') : root.classList.contains('nav-off'));
    });
    // 모바일: 목차 항목을 누르면 메뉴를 닫는다
    nav.addEventListener('click', (e) => { if (mobile() && e.target.closest('a.sec')) root.classList.remove('nav-show'); });
    setTimeout(applyHash, 50);
    return { goto, lightRef };
  }

  window.D2P = { init };
})();

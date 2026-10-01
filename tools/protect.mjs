#!/usr/bin/env node
// 문서 폴더(data.json + p*.jpg)를 비밀번호로 잠근 단일 index.html로 묶는다.
// 사용: node tools/protect.mjs docs/<slug>/<version> <비밀번호>
// PBKDF2-SHA256 600,000회 → AES-256-GCM. 비밀번호는 어디에도 저장되지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto as crypto } from 'node:crypto';

const [dir, password] = process.argv.slice(2);
if (!dir || !password) { console.error('사용: node tools/protect.mjs docs/<slug>/<version> <비밀번호>'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname);
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const appJs = fs.readFileSync(path.join(here, '..', 'js', 'app.js'), 'utf8');

const model = {
  title: data.title, version: data.version, generated: data.generated, size: data.size,
  pages: data.pages.map((p) => ({ ...p, img: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, p.img)).toString('base64') })),
};
// 버전 비교 결과가 있으면 함께 (이전 버전 이미지는 넣지 않음 — 겹쳐 보기 대신 글자 비교만)
if (fs.existsSync(path.join(dir, 'diff.json'))) model.diff = JSON.parse(fs.readFileSync(path.join(dir, 'diff.json'), 'utf8'));
// 동작 화면(live)이 있으면 한 파일 안에 넣고, 열 때 blob URL로 띄운다
let liveHtml = null;
if (fs.existsSync(path.join(dir, 'live.json'))) {
  model.live = JSON.parse(fs.readFileSync(path.join(dir, 'live.json'), 'utf8'));
  liveHtml = fs.readFileSync(path.join(dir, model.live.src), 'utf8');
}
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
const inner = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${data.title.replace(/</g, '&lt;')}</title>
<style>html,body{margin:0;height:100%;background:#e9ebef}</style></head>
<body><div id="app"></div>
<script>${esc(appJs)}</script>
<script>(function(){var m=${esc(JSON.stringify(model))};${liveHtml ? `var L=${esc(JSON.stringify(liveHtml))};m.live.src=URL.createObjectURL(new Blob([L],{type:'text/html'}));` : ''}window.D2P.init(m,{homeHref:'../../../'});})();</script>
</body></html>`;

const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const iter = 600000;
const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(inner)));
const b64 = (u) => Buffer.from(u).toString('base64');
const payload = JSON.stringify({ v: 1, iter, salt: b64(salt), iv: b64(iv), ct: b64(ct) });

const lock = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>보호된 문서</title>
<style>
:root{--bg:#2b2b2e;--panel:#383838;--ink:#f2f2f4;--muted:#a9abb3;--line:#55565c;--accent:#7b84ff;--err:#ff8a8f;color-scheme:dark}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#e9ebef;--panel:#fff;--ink:#1b1d22;--muted:#666b76;--line:#d5d9e0;--accent:#4a55e0;--err:#d23b42;color-scheme:light}}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',system-ui,sans-serif;display:grid;place-items:center;padding-inline:16px}
.lock{width:min(380px,100%);background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:28px 26px}
.brand{font-size:11px;letter-spacing:.2em;color:var(--muted);text-transform:uppercase}
h1{margin:14px 0 4px;font-size:20px}p{margin:0 0 18px;color:var(--muted);font-size:13.5px}
label{display:block;font-size:12.5px;font-weight:700;margin-bottom:6px}
input{width:100%;font:15px inherit;font-family:inherit;padding:11px 12px;border-radius:9px;border:1px solid var(--line);background:transparent;color:var(--ink)}
input:focus{outline:2px solid var(--accent);outline-offset:1px}
button{width:100%;margin-top:12px;font:700 15px inherit;font-family:inherit;padding:11px;border:0;border-radius:9px;background:var(--accent);color:#fff;cursor:pointer}
button:disabled{opacity:.6;cursor:progress}.msg{min-height:1.6em;margin-top:10px;font-size:13px;color:var(--err)}.msg.wait{color:var(--muted)}
</style>
</head>
<body>
<main class="lock">
  <div class="brand">Doc2Proto</div>
  <h1>보호된 문서입니다</h1>
  <p>${data.title.replace(/</g, '&lt;')} ${data.version || ''}<br>비밀번호를 입력하면 문서가 이 브라우저 안에서 열립니다.</p>
  <form id="f" autocomplete="off">
    <label for="pw">비밀번호</label>
    <input id="pw" type="password" autocomplete="current-password" required autofocus>
    <button id="go" type="submit">문서 열기</button>
    <div class="msg" id="msg" role="status" aria-live="polite"></div>
  </form>
</main>
<script id="payload" type="application/json">${payload}</script>
<script>
(function(){
  var P = JSON.parse(document.getElementById('payload').textContent);
  function b64(s){ var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  var f = document.getElementById('f'), msg = document.getElementById('msg'), go = document.getElementById('go'), pw = document.getElementById('pw');
  if (!(window.crypto && crypto.subtle)) { msg.textContent = '이 브라우저에서는 열 수 없어요. https 주소나 최신 브라우저로 열어 주세요.'; go.disabled = true; return; }
  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    go.disabled = true; msg.className = 'msg wait'; msg.textContent = '문서를 여는 중…';
    try {
      var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw.value), 'PBKDF2', false, ['deriveKey']);
      var key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(P.salt), iterations: P.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      var buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(P.iv) }, key, b64(P.ct));
      var html = new TextDecoder().decode(buf);
      var hash = location.hash;
      document.open(); document.write(html); document.close();
      if (hash) setTimeout(function () { location.hash = hash; }, 100);
    } catch (err) {
      go.disabled = false; msg.className = 'msg'; msg.textContent = '비밀번호가 맞지 않아요. 다시 입력해 주세요.'; pw.select();
    }
  });
})();
</script>
</body>
</html>`;

fs.writeFileSync(path.join(dir, 'index.html'), lock);
console.log(`✓ ${path.join(dir, 'index.html')} (${(lock.length / 1024 / 1024).toFixed(1)} MB)`);

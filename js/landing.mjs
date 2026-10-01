// 랜딩: 배포된 기획서 목록 + 관리(새 버전 올리기 · 삭제)
import * as A from './admin.mjs';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const PKEY = 'd2p.pending';
const pending = {
  all() { try { return JSON.parse(localStorage.getItem(PKEY) || '[]'); } catch { return []; } },
  save(l) { try { localStorage.setItem(PKEY, JSON.stringify(l)); } catch {} },
  add(p) { this.save([...this.all().filter((x) => !(x.slug === p.slug && x.version === p.version)), p]); },
  drop(p) { this.save(this.all().filter((x) => !(x.slug === p.slug && x.version === p.version))); },
};
let INDEX = { docs: [] };
let toastT;
function say(m, ms = 2600) { const s = $('#status'); s.textContent = m; s.hidden = !m; clearTimeout(toastT); if (m && ms) toastT = setTimeout(() => { s.hidden = true; }, ms); }

async function loadIndex() {
  INDEX = await fetch('docs/index.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : { docs: [] })).catch(() => ({ docs: [] }));
  // 이미 배포된 대기 항목은 정리
  for (const p of pending.all()) {
    const d = INDEX.docs.find((x) => x.slug === p.slug);
    if (d && d.versions.some((v) => v.version === p.version) && !p.error) pending.drop(p);
  }
}

/* ---------- 연결 상태 ---------- */
// 미리보기 배포(브랜치 주소)에서는 운영 저장소를 건드리지 않도록 올리기·삭제를 막는다
const PROD = 'doc2proto.vercel.app';
const PREVIEW = /\.vercel\.app$/.test(location.hostname) && location.hostname !== PROD;
const blocked = () => { say('미리보기 주소에서는 올리기·삭제를 막아 두었어요 — 운영 사이트(doc2proto.vercel.app)에서 해 주세요', 4000); };

function renderConn() {
  const c = $('#conn'); c.innerHTML = '';
  const on = !!A.token.get();
  c.className = 'conn' + (on ? ' on' : '');
  c.append(el('i'), el('span', null, on ? 'GitHub 연결됨' : '보기 전용'));
  const b = el('button', null, on ? '연결 해제' : 'GitHub 연결');
  b.onclick = () => { if (on) { A.token.set(''); renderConn(); say('연결을 해제했어요'); } else connect(); };
  c.append(b);
}
function connect() {
  return new Promise((resolve) => {
    const d = $('#dlg-conn'), msg = $('#conn-msg'), ok = $('#conn-ok'), tok = $('#tok');
    d.querySelector('.repo').textContent = `${A.REPO.owner}/${A.REPO.repo}`;
    msg.textContent = ''; tok.value = '';
    ok.onclick = async (e) => {
      e.preventDefault();
      if (!tok.value.trim()) { msg.textContent = '토큰을 입력해 주세요'; return; }
      ok.disabled = true; msg.className = 'msg wait'; msg.textContent = '확인 중…';
      try { await A.verify(tok.value.trim()); d.close('ok'); renderConn(); say('GitHub에 연결했어요'); resolve(true); }
      catch (err) { msg.className = 'msg'; msg.textContent = err.message; }
      finally { ok.disabled = false; }
    };
    d.onclose = () => resolve(!!A.token.get());
    d.showModal(); tok.focus();
  });
}
async function needToken() { return A.token.get() ? true : connect(); }

/* ---------- 목록 ---------- */
function render() {
  const box = $('#doclist'); box.innerHTML = '';
  const pend = pending.all();
  const docs = [...INDEX.docs].reverse();
  // 아직 목록에 없는 새 기획서(변환 대기)
  for (const p of pend) if (!INDEX.docs.some((d) => d.slug === p.slug)) docs.unshift({ slug: p.slug, title: p.title, versions: [], _new: true });
  if (!docs.length) { box.append(el('div', 'empty', '배포된 기획서가 아직 없어요. 오른쪽 위 "새 기획서 올리기"로 시작하세요.')); return; }
  for (const d of docs) {
    const card = el('div', 'doc');
    const latest = d.versions[d.versions.length - 1];
    const href = (v) => `?doc=docs/${d.slug}/${v.version}`;
    const a = el(latest ? 'a' : 'span', 'doc-title', d.title); if (latest) a.href = href(latest);
    card.append(a);
    card.append(el('div', 'doc-meta', latest ? `최신 ${latest.version} · ${latest.date} · ${latest.pages}쪽 · 버전 ${d.versions.length}개` : '변환 대기 중'));
    const vers = el('div', 'doc-vers');
    for (const v of [...d.versions].reverse()) {
      const l = el('a', v === latest ? 'latest' : null, v.version); l.href = href(v); l.title = `${v.date} · ${v.pages}쪽`;
      vers.append(l);
    }
    for (const p of pend.filter((x) => x.slug === d.slug)) {
      const s = el('span', 'pend' + (p.error ? ' err' : ''), p.error ? `${p.version} 변환 실패` : `${p.version} 변환 중…`);
      s.title = p.error ? '눌러서 목록에서 지우기' : 'GitHub Actions가 변환하고 있어요 (2~3분)';
      if (p.error) { s.style.cursor = 'pointer'; s.onclick = () => { pending.drop(p); render(); }; }
      if (p.run) { const r = el('a', null, '로그'); r.href = p.run; r.target = '_blank'; r.rel = 'noopener'; r.style.border = 0; s.append(' ', r); }
      vers.append(s);
    }
    card.append(vers);
    if (latest) {   // 동작 화면(목업 자리의 실제 화면) 구현 여부
      const lv = el('div', 'livest', '동작 화면 확인 중…'); card.append(lv);
      fetch(`docs/${d.slug}/${latest.version}/live.json`, { method: 'HEAD', cache: 'no-cache' }).then((r) => r.ok).catch(() => false).then((ok) => {
        lv.className = 'livest ' + (ok ? 'on' : 'off');
        lv.textContent = ok ? '● 동작 화면 있음' : '○ 동작 화면 없음 — 스냅샷·Description 연결만 (Claude Code에서 구현)';
      });
    }
    const acts = el('div', 'doc-acts');
    const up = el('button', 'sm', '새 버전 올리기'); up.onclick = () => (PREVIEW ? blocked() : openUpload(d));
    const del = el('button', 'sm danger', '삭제'); del.onclick = () => (PREVIEW ? blocked() : openDelete(d)); if (d._new) del.disabled = true;
    if (PREVIEW) { up.title = del.title = '미리보기 주소에서는 사용할 수 없어요'; up.style.opacity = del.style.opacity = '.5'; }
    acts.append(up, el('span', 'grow'), del);
    card.append(acts);
    box.append(card);
  }
}

/* ---------- 파일 선택 칸 ---------- */
function filePicker(id, accept) {
  const box = $(id), input = box.querySelector('input'), nm = box.querySelector('.nm');
  const label = nm.textContent;
  let file = null;
  const set = (f) => { file = f; if (f) { const m = document.querySelector('#up-msg'); if (m) m.textContent = ''; } box.classList.toggle('has', !!f); nm.textContent = f ? `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)` : label; box.dispatchEvent(new Event('pick')); };
  box.onclick = () => input.click();
  input.onchange = () => { const f = input.files[0]; if (f && accept.test(f.name)) set(f); input.value = ''; };
  box.ondragover = (e) => { e.preventDefault(); box.classList.add('over'); };
  box.ondragleave = () => box.classList.remove('over');
  box.ondrop = (e) => { e.preventDefault(); box.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f && accept.test(f.name)) set(f); };
  return { get: () => file, set, box };
}
const fPptx = filePicker('#f-pptx', /\.pptx$/i);
const fPdf = filePicker('#f-pdf', /\.pdf$/i);
let upNew = false;
// 파일 이름에서 버전·제목 추측 (예: 후원페이지_v0.3.pptx)
fPptx.box.addEventListener('pick', () => {
  const f = fPptx.get(); if (!f) return;
  const base = f.name.replace(/\.pptx$/i, '');
  const m = /[_\s-]?v(\d+(?:\.\d+)*)\s*$/i.exec(base) || /[_\s-]v(\d+(?:\.\d+)*)/i.exec(base);
  if (m) $('#up-ver').value = 'v' + m[1];
  if (upNew && !$('#up-title').value) {
    const t = base.replace(m ? m[0] : '', '').replace(/_+/g, ' ').trim();
    $('#up-title').value = t;
    if (!$('#up-slug').dataset.touched) { $('#up-slug').value = slugify(t); $('#up-slug-p').textContent = $('#up-slug').value || '…'; }
  }
});

/* ---------- 올리기 ---------- */
async function openUpload(doc) {
  if (!(await needToken())) return;
  const d = $('#dlg-up'), msg = $('#up-msg'), ok = $('#up-ok');
  const isNew = !doc;
  $('#up-h').textContent = isNew ? '새 기획서 올리기' : '새 버전 올리기';
  $('#up-d').textContent = isNew ? 'PPTX와 PowerPoint PDF를 올리면 자동으로 변환해 배포해요.' : `「${doc.title}」의 새 버전이에요. 이전 버전(${doc.versions.length ? doc.versions[doc.versions.length - 1].version : '없음'})과 자동으로 비교해요.`;
  $('#up-new').hidden = !isNew;
  $('#up-title').value = ''; $('#up-slug').value = ''; $('#up-slug-p').textContent = '…';
  $('#up-ver').value = isNew ? 'v0.1' : A.nextVersion(doc.versions);
  fPptx.set(null); fPdf.set(null);
  msg.textContent = '';
  $('#up-note').innerHTML = isNew
    ? '올린 뒤 2~3분이면 목록에 나타나요. 동작 화면(목업 자리의 실제 화면)은 로컬 Claude Code의 <code>/doc2proto</code>로 만들어요.'
    : '변경 요약·변경 표시는 자동으로 만들어지고, 이전 버전의 동작 화면이 새 페이지 번호에 맞춰 복사돼요. 기능이 바뀐 부분은 로컬 Claude Code에서 반영해요.';
  upNew = isNew;
  $('#up-slug').oninput = () => { $('#up-slug-p').textContent = $('#up-slug').value || '…'; };
  $('#up-title').oninput = () => { if (!$('#up-slug').dataset.touched) { $('#up-slug').value = slugify($('#up-title').value); $('#up-slug-p').textContent = $('#up-slug').value || '…'; } };
  delete $('#up-slug').dataset.touched;
  $('#up-slug').onchange = () => { $('#up-slug').dataset.touched = '1'; };
  ok.onclick = async (e) => {
    e.preventDefault();
    const version = $('#up-ver').value.trim();
    const title = isNew ? $('#up-title').value.trim() : doc.title;
    const slug = isNew ? $('#up-slug').value.trim() : doc.slug;
    const err = (m) => { msg.className = 'msg'; msg.textContent = m; };
    if (isNew && !title) return err('기획서 제목을 입력해 주세요');
    if (!/^[\w가-힣.-]+$/.test(slug)) return err('주소 이름은 한글·영문·숫자·-·_ 만 쓸 수 있어요');
    if (isNew && INDEX.docs.some((x) => x.slug === slug)) return err('같은 주소 이름의 기획서가 이미 있어요. 그 기획서의 "새 버전 올리기"를 써 주세요');
    if (!/^[\w.-]+$/.test(version)) return err('버전은 v0.2 처럼 영문·숫자·. 로 써 주세요');
    if (!isNew && doc.versions.some((v) => v.version === version) && !confirm(`${version}이(가) 이미 있어요. 새 파일로 덮어쓸까요?`)) return;
    if (!fPptx.get()) return err('PPTX 파일을 선택해 주세요');
    if (!fPdf.get()) return err('PowerPoint에서 내보낸 PDF를 선택해 주세요 (원본 그대로 보이게 하는 스냅샷이에요)');
    ok.disabled = true; msg.className = 'msg wait';
    try {
      const sha = await A.upload({ slug, title, version, pptx: fPptx.get(), pdf: fPdf.get(), onProgress: (m) => { msg.textContent = m; } });
      pending.add({ slug, title, version, sha, at: Date.now() });
      d.close('ok'); render(); say(`올렸어요 — ${version} 변환을 시작했어요 (2~3분)`, 4000);
      watch();
    } catch (er) { err(er.message); }
    finally { ok.disabled = false; }
  };
  d.showModal();
}
function slugify(t) { return t.replace(/\s+/g, '-').replace(/[^\w가-힣-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }

/* ---------- 삭제 ---------- */
async function openDelete(doc) {
  if (!(await needToken())) return;
  const d = $('#dlg-del'), msg = $('#del-msg'), ok = $('#del-ok'), opts = $('#del-opts'), conf = $('#del-confirm');
  $('#del-d').textContent = `「${doc.title}」에서 무엇을 지울까요?`;
  opts.innerHTML = '';
  const choices = [...doc.versions].reverse().map((v) => ({ v: v.version, label: `${v.version}만 삭제 (${v.date} · ${v.pages}쪽)` }));
  choices.push({ v: '', label: `기획서 전체 삭제 (버전 ${doc.versions.length}개 모두)` });
  choices.forEach((c, i) => {
    const l = el('label'); const r = el('input'); r.type = 'radio'; r.name = 'delv'; r.value = c.v; r.checked = i === 0;
    r.onchange = upd; l.append(r, document.createTextNode(c.label)); opts.append(l);
  });
  function word() { const v = opts.querySelector('input:checked').value; return v || doc.slug; }
  function upd() { $('#del-word').textContent = word(); conf.value = ''; msg.textContent = ''; }
  upd();
  ok.onclick = async (e) => {
    e.preventDefault();
    if (conf.value.trim() !== word()) { msg.className = 'msg'; msg.textContent = `"${word()}"을(를) 정확히 입력해 주세요`; return; }
    const v = opts.querySelector('input:checked').value;
    ok.disabled = true; msg.className = 'msg wait'; msg.textContent = '삭제하는 중…';
    try {
      await A.removeDoc(doc.slug, v || null, (m) => { msg.textContent = m; });
      // 화면 목록은 바로 반영 (사이트 재배포는 1분쯤 걸림)
      const x = INDEX.docs.find((y) => y.slug === doc.slug);
      if (v) { x.versions = x.versions.filter((y) => y.version !== v); if (!x.versions.length) INDEX.docs = INDEX.docs.filter((y) => y !== x); }
      else INDEX.docs = INDEX.docs.filter((y) => y !== x);
      d.close('ok'); render(); say(v ? `${v}을(를) 삭제했어요 — 1분쯤 뒤 사이트에 반영돼요` : '기획서를 삭제했어요 — 1분쯤 뒤 사이트에 반영돼요', 4000);
    } catch (er) { msg.className = 'msg'; msg.textContent = er.message; }
    finally { ok.disabled = false; }
  };
  d.showModal(); conf.focus();
}

/* ---------- 변환 진행 확인 ---------- */
let watching = null;
function watch() {
  if (watching) return;
  const tick = async () => {
    const list = pending.all().filter((p) => !p.error);
    if (!list.length) { watching = null; return; }
    let changed = false;
    for (const p of list) {
      if (A.token.get() && p.sha) {
        try {
          const r = await A.runOf(p.sha);
          if (r) { p.run = r.html_url; if (r.status === 'completed' && r.conclusion !== 'success') { p.error = true; changed = true; } pending.add(p); }
        } catch {}
      }
      const live = await fetch(`docs/${p.slug}/${p.version}/data.json`, { method: 'HEAD', cache: 'no-cache' }).then((r) => r.ok).catch(() => false);
      if (live && Date.now() - p.at > 20000) { pending.drop(p); changed = true; say(`${p.title} ${p.version} 배포가 끝났어요`, 4000); }
      if (Date.now() - p.at > 30 * 60 * 1000 && !p.error) { p.error = true; pending.add(p); changed = true; }
    }
    if (changed) { await loadIndex(); render(); }
    watching = setTimeout(tick, 12000);
  };
  watching = setTimeout(tick, 4000);
}

export async function renderLanding() {
  renderConn();
  $('#newdoc').onclick = () => (PREVIEW ? blocked() : openUpload(null));
  if (PREVIEW) { $('#newdoc').style.opacity = '.5'; const t = document.querySelector('.top .t .sub'); if (t) t.insertAdjacentHTML('beforeend', ' <b style="color:#e08a00">· 미리보기(코멘트 기능 개발 중)</b>'); }
  await loadIndex();
  render();
  watch();
}

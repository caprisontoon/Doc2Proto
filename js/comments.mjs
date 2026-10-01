// 코멘트 저장소 어댑터 — Google Cloud Firestore + Google 로그인 (Firebase SDK), 설정이 없으면 데모 모드(이 브라우저에만 저장)
// 설정: js/comments-config.js 에 window.D2P_COMMENTS = { firebase: {...}, domain: 'toonation.co.kr' }
//
// 데이터 (Firestore)
//   threads/{id}            { doc, version, page, x, y, anchor, body, author{uid,name,email,photo}, role, status, createdAt, updatedAt, replies, lastAt }
//   threads/{id}/replies/{rid} { body, author, role, createdAt }
// Firebase SDK는 사이트 안에 번들해 둔다 (vendor/firebase, CDN이 막힌 사내망에서도 동작) — 다시 만들기: COMMENTS_SETUP.md 참고
const SDK_URL = new URL('../vendor/firebase/firebase-10.12.2.mjs', import.meta.url).href;

export async function createComments({ doc, version }) {
  const forceDemo = new URLSearchParams(location.search).has('cdemo');   // 테스트용: &cdemo=1 이면 데모 모드
  const cfg = !forceDemo && window.D2P_COMMENTS && window.D2P_COMMENTS.firebase && window.D2P_COMMENTS.firebase.apiKey ? window.D2P_COMMENTS : null;
  return cfg ? firebaseBackend(cfg, doc, version) : demoBackend(doc, version);
}

/* ---------------- Google Cloud Firestore ---------------- */
async function firebaseBackend(cfg, doc, version) {
  const M = await import(SDK_URL);
  const { initializeApp } = M, A = M, F = M;
  const app = initializeApp(cfg.firebase);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const domain = cfg.domain || '';
  let user = null;
  const authCbs = [];
  const toUser = (u) => (u ? { uid: u.uid, name: u.displayName || u.email.split('@')[0], email: u.email, photo: u.photoURL || '' } : null);
  A.onAuthStateChanged(auth, async (u) => {
    if (u && domain && !u.email.endsWith('@' + domain)) {   // 사내 계정만 (보안 규칙에서도 한 번 더 막는다)
      await A.signOut(auth);
      authCbs.forEach((cb) => cb(null, `@${domain} 계정으로 로그인해 주세요`));
      return;
    }
    user = toUser(u);
    authCbs.forEach((cb) => cb(user));
  });
  const ts = (v) => (v && v.toMillis ? v.toMillis() : Date.now());
  const thread = (d) => { const x = d.data(); return { id: d.id, ...x, createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt), lastAt: ts(x.lastAt) }; };
  const col = F.collection(db, 'threads');
  return {
    mode: 'cloud', domain,
    onAuth(cb) { authCbs.push(cb); cb(user); },
    async signIn() {
      const p = new A.GoogleAuthProvider();
      if (domain) p.setCustomParameters({ hd: domain, prompt: 'select_account' });
      await A.signInWithPopup(auth, p);
    },
    signOut: () => A.signOut(auth),
    me: () => user,
    subscribe(cb, onErr) {
      const qy = F.query(col, F.where('doc', '==', doc), F.where('version', '==', version));
      return F.onSnapshot(qy, (snap) => cb(snap.docs.map(thread)), (e) => onErr && onErr(e));
    },
    subscribeReplies(id, cb) {
      const qy = F.query(F.collection(db, 'threads', id, 'replies'), F.orderBy('createdAt'));
      return F.onSnapshot(qy, (snap) => cb(snap.docs.map((d) => { const x = d.data(); return { id: d.id, ...x, createdAt: ts(x.createdAt) }; })));
    },
    async create(t) {
      const now = F.serverTimestamp();
      const ref = await F.addDoc(col, { ...t, doc, version, author: user, status: 'open', replies: 0, createdAt: now, updatedAt: now, lastAt: now });
      return ref.id;
    },
    async reply(id, body, role) {
      const now = F.serverTimestamp();
      await F.addDoc(F.collection(db, 'threads', id, 'replies'), { body, role, author: user, createdAt: now });
      await F.updateDoc(F.doc(db, 'threads', id), { replies: F.increment(1), lastAt: now, updatedAt: now });
    },
    setStatus: (id, status) => F.updateDoc(F.doc(db, 'threads', id), { status, updatedAt: F.serverTimestamp(), resolvedBy: status === 'resolved' ? user : null }),
    edit: (id, body) => F.updateDoc(F.doc(db, 'threads', id), { body, updatedAt: F.serverTimestamp(), edited: true }),
    remove: (id) => F.deleteDoc(F.doc(db, 'threads', id)),
  };
}

/* ---------------- 데모 (설정 전 미리보기용, 이 브라우저에만 저장) ---------------- */
function demoBackend(doc, version) {
  const KEY = 'd2p.demo.comments', UKEY = 'd2p.demo.user';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{"threads":[],"replies":{}}'); } catch { return { threads: [], replies: {} }; } };
  const write = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} emit(); bc && bc.postMessage(1); };
  let user = null; try { user = JSON.parse(localStorage.getItem(UKEY) || 'null'); } catch {}
  const subs = new Set(), rsubs = new Map(), authCbs = [];
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('d2p-demo-comments') : null;
  if (bc) bc.onmessage = () => emit();
  function emit() {
    const s = read();
    const list = s.threads.filter((t) => t.doc === doc && t.version === version);
    subs.forEach((cb) => cb(list));
    rsubs.forEach((cbs, id) => cbs.forEach((cb) => cb(s.replies[id] || [])));
  }
  const id = () => Math.random().toString(36).slice(2, 10);
  return {
    mode: 'demo', domain: '',
    onAuth(cb) { authCbs.push(cb); cb(user); },
    async signIn() {
      const name = (prompt('데모 모드 — 표시할 이름을 입력하세요 (실제 서비스는 Google 로그인)', '') || '').trim();
      if (!name) return;
      user = { uid: 'demo-' + name, name, email: name + '@demo', photo: '' };
      try { localStorage.setItem(UKEY, JSON.stringify(user)); } catch {}
      authCbs.forEach((cb) => cb(user));
    },
    async signOut() { user = null; try { localStorage.removeItem(UKEY); } catch {} authCbs.forEach((cb) => cb(null)); },
    me: () => user,
    subscribe(cb) { subs.add(cb); setTimeout(emit, 0); return () => subs.delete(cb); },
    subscribeReplies(tid, cb) { if (!rsubs.has(tid)) rsubs.set(tid, new Set()); rsubs.get(tid).add(cb); setTimeout(emit, 0); return () => rsubs.get(tid).delete(cb); },
    async create(t) { const s = read(); const now = Date.now(); const n = { ...t, id: id(), doc, version, author: user, status: 'open', replies: 0, createdAt: now, updatedAt: now, lastAt: now }; s.threads.push(n); write(s); return n.id; },
    async reply(tid, body, role) { const s = read(); const now = Date.now(); (s.replies[tid] = s.replies[tid] || []).push({ id: id(), body, role, author: user, createdAt: now }); const t = s.threads.find((x) => x.id === tid); if (t) { t.replies++; t.lastAt = now; t.updatedAt = now; } write(s); },
    async setStatus(tid, status) { const s = read(); const t = s.threads.find((x) => x.id === tid); if (t) { t.status = status; t.updatedAt = Date.now(); t.resolvedBy = status === 'resolved' ? user : null; } write(s); },
    async edit(tid, body) { const s = read(); const t = s.threads.find((x) => x.id === tid); if (t) { t.body = body; t.edited = true; t.updatedAt = Date.now(); } write(s); },
    async remove(tid) { const s = read(); s.threads = s.threads.filter((x) => x.id !== tid); delete s.replies[tid]; write(s); },
  };
}

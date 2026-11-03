// 코멘트 저장소 어댑터 — claude.ai 아티팩트 버전 (공유 db + user 기능)
// Firestore 어댑터(comments.mjs)와 같은 모양: mode, onAuth, signIn, signOut, me, allowed, subscribe, subscribeReplies, create, reply, setStatus, edit, remove
//
// 데이터 (아티팩트 db)
//   threads/{id}               { doc, version, page, x, y, anchor, body, pageLabel, role, author:{uid}, status, createdAt, updatedAt, replies, lastAt, edited?, resolvedBy?:{uid} }
//   threads/{id}/replies/{rid} { body, role, author:{uid}, createdAt }
// 사람은 id만 저장하고, 이름·사진은 볼 때마다 user.profiles()로 바꾼다 (이름을 저장하지 않음)
// 이름 입력 없음 — claude.ai 계정으로 자동 식별. 쓰기는 아티팩트를 '참여자(Contributor)' 이상으로 공유받은 사람만 가능

const newId = () => { let s = ''; const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; const r = crypto.getRandomValues(new Uint8Array(14)); for (const b of r) s += a[b % 36]; return s; };

export async function createComments({ doc, version }) {
  if (!window.claude || !window.claude.use) return null;
  const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
  if (!db) return null;   // 이 화면에서는 db를 쓸 수 없음 (로그아웃 등) → 코멘트 메뉴 없이 기획서만
  const me0 = user ? await user.me() : null;
  let meId = me0 && me0.id;
  const canWrite = user ? await user.can('data.write') : null;   // null = 알 수 없음 → 써 보고 거절되면 안내
  let readOnly = canWrite === false;
  const profileCache = {};
  let me = null;
  const authCbs = [];
  const toMe = (p) => (p && meId ? { uid: meId, name: p.name || '나', email: '', photo: p.avatarUrl || '' } : null);
  if (meId) me = toMe(me0);

  // 저장된 id → 화면에 보일 이름 (profiles는 캐시·묶음 처리되므로 매번 불러도 됨)
  async function names(ids) {
    const u = [...new Set(ids.filter(Boolean))];
    if (!u.length || !user) return;
    try { Object.assign(profileCache, await user.profiles(u)); } catch (_) {}
  }
  const person = (a) => (a && a.uid ? { uid: a.uid, name: (profileCache[a.uid] && profileCache[a.uid].name) || '구성원', photo: '' } : null);
  const threadOf = (d) => { const x = d.data(); return { id: d.id, ...x, author: person(x.author), resolvedBy: person(x.resolvedBy) }; };

  const col = db.collection('threads');
  const failMsg = (e) => {
    if (e && e.code === 'invalid_argument' && readOnly !== true) { readOnly = true; return new Error('이 아티팩트에 쓰기 권한이 없어요 — 공유 권한을 참여자(Contributor) 이상으로 받아야 코멘트를 남길 수 있어요'); }
    if (e && e.code === 'quota_exceeded') return new Error('코멘트 저장 공간이 가득 찼어요 — 오래된 코멘트를 지워 주세요');
    return e instanceof Error ? e : new Error((e && e.message) || '저장하지 못했어요');
  };
  const guard = () => { if (!me) throw new Error('claude.ai에 로그인해야 코멘트를 남길 수 있어요'); if (readOnly) throw new Error('보기 권한만 있어요 — 코멘트를 남기려면 참여자(Contributor) 이상 권한이 필요해요'); };
  let cache = new Map();   // 최근 스레드 원본 (답변 수 갱신용)

  return {
    mode: 'artifact', domain: '', open: true, fixedName: true,
    signedOutText: 'claude.ai에 로그인하면 코멘트를 남길 수 있어요',
    onAuth(cb) { authCbs.push(cb); cb(me, readOnly ? '보기 권한만 있어요 — 코멘트를 읽을 수만 있어요' : ''); },
    async signIn() { if (!me) throw new Error('claude.ai에 로그인해야 해요'); },
    async signOut() {},
    me: () => me,
    allowed: async () => true,
    subscribe(cb, onErr) {
      let got = false;
      const timer = setTimeout(() => { if (!got && onErr) onErr({ code: 'timeout', message: '아직 연결 중이에요 — 잠시 뒤 다시 확인해 주세요' }); }, 10000);
      const qy = col.where('doc', '==', doc).where('version', '==', version);
      return qy.onSnapshot(async (snap) => {
        if (!snap.metadata.fromCache) { got = true; clearTimeout(timer); }
        cache = new Map(snap.docs.map((d) => [d.id, d.data()]));
        const ids = []; for (const d of snap.docs) { const x = d.data(); ids.push(x.author && x.author.uid, x.resolvedBy && x.resolvedBy.uid); }
        await names(ids);
        cb(snap.docs.map(threadOf));
      }, (e) => { got = true; clearTimeout(timer); onErr && onErr(e); });
    },
    subscribeReplies(id, cb) {
      return col.doc(id).collection('replies').orderBy('createdAt').onSnapshot(async (snap) => {
        await names(snap.docs.map((d) => { const x = d.data(); return x.author && x.author.uid; }));
        cb(snap.docs.map((d) => { const x = d.data(); return { id: d.id, ...x, author: person(x.author) }; }));
      }, () => {});
    },
    async create(t) {
      guard();
      const now = Date.now(), id = newId();
      const body = { ...JSON.parse(JSON.stringify(t)), doc, version, author: { uid: meId }, status: 'open', replies: 0, createdAt: now, updatedAt: now, lastAt: now };
      try { await col.doc(id).set(body); } catch (e) { throw failMsg(e); }
      return id;
    },
    async reply(id, body, role) {
      guard();
      const now = Date.now();
      try {
        await col.doc(id).collection('replies').doc(newId()).set({ body, role: role || '', author: { uid: meId }, createdAt: now });
        const cur = cache.get(id);
        await col.doc(id).update({ replies: ((cur && cur.replies) || 0) + 1, lastAt: now, updatedAt: now });
      } catch (e) { throw failMsg(e); }
    },
    async setStatus(id, status) {
      guard();
      try { await col.doc(id).update({ status, updatedAt: Date.now(), resolvedBy: status === 'resolved' ? { uid: meId } : null }); } catch (e) { throw failMsg(e); }
    },
    async edit(id, body) { guard(); try { await col.doc(id).update({ body, updatedAt: Date.now(), edited: true }); } catch (e) { throw failMsg(e); } },
    async remove(id) {
      guard();
      try {
        const rs = await col.doc(id).collection('replies').get();   // 답글도 함께 지움 (문서를 지워도 하위 문서는 남음)
        for (const r of rs.docs) await col.doc(id).collection('replies').doc(r.id).delete();
        await col.doc(id).delete();
      } catch (e) { throw failMsg(e); }
    },
  };
}

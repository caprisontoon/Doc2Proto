// 코멘트 Slack 알림 (Vercel 서버리스 함수) — 새 문의 / 답변 / 해결·다시 열림을 채널에 보낸다.
// 웹훅 주소는 브라우저에 두지 않고 Vercel 환경 변수 SLACK_WEBHOOK_URL 에 둔다. (설정 방법: COMMENTS_SETUP.md)
// 브라우저는 { kind, id, rid } 만 보내고, 내용은 이 함수가 Firestore 에서 직접 읽어 확인한다
// → 실제로 방금 생긴 코멘트일 때만 보내므로 아무 글이나 채널에 올릴 수 없다.
const PROJECT = process.env.FIREBASE_PROJECT_ID || 'doc2proto-16f74';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const FRESH = 2 * 60 * 1000;   // 2분 안에 생긴/바뀐 것만
const sent = new Set();        // 같은 알림 중복 방지 (인스턴스 단위)

// Firestore REST 값 → 일반 값
function val(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return obj(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  return null;
}
const obj = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, val(v)]));
async function get(path) {
  const r = await fetch(`${BASE}/${path}`);
  if (!r.ok) return null;
  const j = await r.json();
  return obj(j.fields || {});
}

const who = (m) => `${(m.author && m.author.name) || '누군가'}${m.role ? ` (${m.role})` : ''}`;
const cut = (s, n = 300) => (String(s || '').length > n ? String(s).slice(0, n) + '…' : String(s || ''));
const quote = (s) => '> ' + cut(s).replace(/\n/g, '\n> ');
const where = (t) => `${t.doc} ${t.version} · ${t.page}p${t.pageLabel ? ' ' + t.pageLabel : ''}${t.anchor && t.anchor.label ? ` · ${t.anchor.label}번` : ''}`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const hook = process.env.SLACK_WEBHOOK_URL;
  if (!hook) return res.status(200).json({ ok: false, reason: 'not-configured' });
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  const { kind, id, rid } = b;
  if (!/^[A-Za-z0-9]{10,40}$/.test(id || '') || (rid && !/^[A-Za-z0-9]{10,40}$/.test(rid))) return res.status(400).json({ ok: false });
  const key = `${kind}:${id}:${rid || ''}`;
  if (sent.has(key)) return res.status(200).json({ ok: true, dup: true });

  const t = await get(`threads/${id}`);
  if (!t) return res.status(404).json({ ok: false });
  const site = process.env.SITE_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const link = `${site}/?doc=docs/${encodeURIComponent(t.doc)}/${encodeURIComponent(t.version)}#c=${id}`;
  const now = Date.now();
  let text = '';
  if (kind === 'thread') {
    if (!(now - t.createdAt < FRESH)) return res.status(409).json({ ok: false, reason: 'stale' });
    text = `💬 *새 문의* — ${who(t)}\n<${link}|${where(t)}>\n${quote(t.body)}`;
  } else if (kind === 'reply') {
    const r = rid && await get(`threads/${id}/replies/${rid}`);
    if (!r || !(now - r.createdAt < FRESH)) return res.status(409).json({ ok: false, reason: 'stale' });
    const to = t.author && r.author && t.author.uid !== r.author.uid ? ` → ${t.author.name} 님` : '';
    text = `↩️ *답변*${to} — ${who(r)}\n<${link}|${where(t)}>  _"${cut(t.body, 60)}"_\n${quote(r.body)}`;
  } else if (kind === 'status') {
    if (!(now - t.updatedAt < FRESH)) return res.status(409).json({ ok: false, reason: 'stale' });
    text = t.status === 'resolved'
      ? `✅ *해결* — ${(t.resolvedBy && t.resolvedBy.name) || '누군가'} 님이 해결로 표시\n<${link}|${where(t)}>  _"${cut(t.body, 60)}"_`
      : `🔁 *다시 열림*\n<${link}|${where(t)}>  _"${cut(t.body, 60)}"_`;
  } else return res.status(400).json({ ok: false });

  const s = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!s.ok) return res.status(502).json({ ok: false, reason: 'slack', status: s.status });
  sent.add(kind === 'status' ? `${key}:${t.status}:${t.updatedAt}` : key);
  return res.status(200).json({ ok: true });
};

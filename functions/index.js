// 코멘트 Slack 알림 — 새 문의 / 답변 / 해결 시 채널에 보낸다.
// 웹훅 주소는 브라우저에 두지 않고 비밀값(Secret Manager)에 둔다:  firebase functions:secrets:set SLACK_WEBHOOK_URL
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const SLACK = defineSecret('SLACK_WEBHOOK_URL');
const SITE = defineString('SITE_URL', { default: 'https://doc2proto.vercel.app' });
const REGION = 'asia-northeast3';   // Firestore 위치(서울)와 같게

const link = (t, id) => `${SITE.value()}/?doc=docs/${encodeURIComponent(t.doc)}/${encodeURIComponent(t.version)}#c=${id}`;
const who = (m) => `${(m.author && m.author.name) || '누군가'}${m.role ? ` (${m.role})` : ''}`;
const cut = (s, n = 300) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));
const where = (t) => `${t.doc} ${t.version} · ${t.page}p${t.pageLabel ? ' ' + t.pageLabel : ''}${t.anchor ? ` · ${t.anchor.label}번` : ''}`;

async function post(text) {
  const res = await fetch(SLACK.value(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!res.ok) console.error('Slack 전송 실패', res.status, await res.text());
}

exports.notifyThread = onDocumentCreated({ document: 'threads/{id}', region: REGION, secrets: [SLACK] }, async (ev) => {
  const t = ev.data.data();
  await post(`💬 *새 문의* — ${who(t)}\n<${link(t, ev.params.id)}|${where(t)}>\n> ${cut(t.body).replace(/\n/g, '\n> ')}`);
});

exports.notifyReply = onDocumentCreated({ document: 'threads/{id}/replies/{rid}', region: REGION, secrets: [SLACK] }, async (ev) => {
  const r = ev.data.data();
  const snap = await getFirestore().doc(`threads/${ev.params.id}`).get();
  if (!snap.exists) return;
  const t = snap.data();
  const to = t.author && r.author && t.author.uid !== r.author.uid ? ` → ${t.author.name} 님` : '';
  await post(`↩️ *답변*${to} — ${who(r)}\n<${link(t, ev.params.id)}|${where(t)}>  _"${cut(t.body, 60)}"_\n> ${cut(r.body).replace(/\n/g, '\n> ')}`);
});

exports.notifyResolved = onDocumentUpdated({ document: 'threads/{id}', region: REGION, secrets: [SLACK] }, async (ev) => {
  const a = ev.data.before.data(), b = ev.data.after.data();
  if (a.status === b.status) return;
  const by = b.resolvedBy ? b.resolvedBy.name : '누군가';
  await post(b.status === 'resolved'
    ? `✅ *해결* — ${by} 님이 해결로 표시\n<${link(b, ev.params.id)}|${where(b)}>  _"${cut(b.body, 60)}"_`
    : `🔁 *다시 열림*\n<${link(b, ev.params.id)}|${where(b)}>  _"${cut(b.body, 60)}"_`);
});

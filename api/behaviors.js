// 공유 문서의 AI 프로토타입 동작 목록을 Blob에 저장/조회한다. (specs/<id>.behaviors.json)
import { put, get } from '@vercel/blob';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function handler(req, res) {
  const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
  if (!ID.test(id)) { res.statusCode = 400; return res.end('잘못된 문서 ID예요'); }
  const path = `specs/${id}.behaviors.json`;

  if (req.method === 'GET') {
    try {
      const r = await get(path, { access: 'private' });
      if (!r || r.statusCode !== 200) { res.statusCode = 404; return res.end('{}'); }
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');
      return res.end(Buffer.from(await new Response(r.stream).arrayBuffer()));
    } catch { res.statusCode = 404; return res.end('{}'); }
  }
  if (req.method === 'POST') {
    const chunks = [];
    let size = 0;
    for await (const c of req) { size += c.length; if (size > 2 * 1024 * 1024) { res.statusCode = 413; return res.end('too large'); } chunks.push(c); }
    const buf = Buffer.concat(chunks);
    try { JSON.parse(buf.toString('utf8')); } catch { res.statusCode = 400; return res.end('JSON이 아니에요'); }
    try {
      await put(path, buf, { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
      return res.end('ok');
    } catch (e) { res.statusCode = 503; return res.end('저장하지 못했어요: ' + (e && e.message ? e.message : e)); }
  }
  res.statusCode = 405;
  res.end('Method Not Allowed');
}

// 공유된 PDF를 비공개 Blob에서 읽어 내려준다.
import { get } from '@vercel/blob';
import { Readable } from 'node:stream';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function handler(req, res) {
  const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
  if (!ID.test(id)) { res.statusCode = 400; return res.end('잘못된 문서 ID예요'); }
  try {
    const r = await get(`specs/${id}.pdf`, { access: 'private' });
    if (!r || r.statusCode !== 200) { res.statusCode = 404; return res.end('문서를 찾을 수 없어요'); }
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('cache-control', 'private, max-age=3600');
    Readable.fromWeb(r.stream).pipe(res);
  } catch (e) {
    res.statusCode = /not.?found/i.test(String(e && e.message)) ? 404 : 503;
    res.end('문서를 불러오지 못했어요');
  }
}

// PDF를 Vercel Blob(비공개)에 저장하고 문서 ID를 돌려준다.
// 열람은 api/file?id=… 를 통해서만 가능하다.
import { put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';

const MAX = 4.4 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX) { res.statusCode = 413; return res.end('4MB 이하 PDF만 공유할 수 있어요'); }
    chunks.push(c);
  }
  const buf = Buffer.concat(chunks);
  if (buf.length < 5 || buf.subarray(0, 5).toString() !== '%PDF-') {
    res.statusCode = 415;
    return res.end('PDF 파일이 아니에요');
  }
  const id = randomUUID();
  try {
    await put(`specs/${id}.pdf`, buf, {
      access: 'private',
      contentType: 'application/pdf',
      addRandomSuffix: false,
    });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id }));
  } catch (e) {
    res.statusCode = 503;
    res.end('공유 저장소(Vercel Blob)에 올리지 못했어요: ' + (e && e.message ? e.message : e));
  }
}

// PDF를 Vercel Blob에 저장하고 공개 URL을 돌려준다.
// 프로젝트에 Blob 스토어가 연결되어 있어야 한다 (OIDC 또는 BLOB_READ_WRITE_TOKEN).
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
  try {
    const blob = await put(`specs/${randomUUID()}.pdf`, buf, {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: false,
    });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ url: blob.url }));
  } catch (e) {
    res.statusCode = 503;
    res.end('공유 저장소(Vercel Blob)에 올리지 못했어요: ' + (e && e.message ? e.message : e));
  }
}

// 관리 기능: 기획서 삭제 · 새 버전 올리기 — 브라우저에서 GitHub 저장소에 직접 커밋한다 (별도 서버·API 비용 없음)
// 올린 PPTX + PDF는 inbox/<slug>/<version>/ 에 들어가고, GitHub Actions(.github/workflows/convert.yml)가 docs/ 로 변환한다.
export const REPO = { owner: 'caprisontoon', repo: 'Doc2Proto', branch: 'main' };
const API = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}`;
const KEY = 'd2p.gh.token';

export const token = {
  get() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } },
  set(t) { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch {} },
};

async function gh(path, opts = {}) {
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    ...opts,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.get()}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let msg = res.status + '';
    try { msg += ' ' + (await res.json()).message; } catch {}
    const e = new Error(res.status === 401 ? '토큰이 맞지 않거나 만료됐어요' : res.status === 403 || res.status === 404 ? '이 토큰으로는 저장소에 쓸 수 없어요 (권한 확인)' : 'GitHub 오류: ' + msg);
    e.status = res.status; throw e;
  }
  return res.status === 204 ? null : res.json();
}

// 토큰 확인: 저장소 쓰기 권한이 있는지
export async function verify(t) {
  const prev = token.get(); token.set(t);
  try {
    const r = await gh('');
    if (!r.permissions || !r.permissions.push) throw new Error('이 토큰에 저장소 쓰기(Contents: Read and write) 권한이 없어요');
    return r;
  } catch (e) { token.set(prev); throw e; }
}

const b64 = (buf) => {
  const u = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
};
const utf8b64 = (str) => b64(new TextEncoder().encode(str));
const fromb64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

async function head() {
  const ref = await gh(`/git/ref/heads/${REPO.branch}`);
  const commit = await gh(`/git/commits/${ref.object.sha}`);
  return { sha: ref.object.sha, tree: commit.tree.sha };
}
async function readJson(path, ref) {
  const r = await gh(`/contents/${encodeURI(path)}?ref=${ref}`);
  return JSON.parse(fromb64(r.content));
}
// 한 번의 커밋으로 파일 추가·삭제. add: [{path, base64|text}], remove: [경로 또는 '폴더/' 접두어]
async function commit({ add = [], remove = [], message, onProgress }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const h = await head();
    const tree = [];
    if (remove.length) {
      const all = await gh(`/git/trees/${h.tree}?recursive=1`);
      for (const it of all.tree) if (it.type === 'blob' && remove.some((r) => (r.endsWith('/') ? it.path.startsWith(r) : it.path === r))) tree.push({ path: it.path, mode: '100644', type: 'blob', sha: null });
    }
    let n = 0;
    for (const f of add) {
      onProgress && onProgress(`업로드 중… ${++n}/${add.length} ${f.path.split('/').pop()}`);
      const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: f.base64 != null ? f.base64 : utf8b64(f.text), encoding: 'base64' }) });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    if (!tree.length) return null;
    onProgress && onProgress('커밋하는 중…');
    const t = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: h.tree, tree }) });
    const c = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: t.sha, parents: [h.sha] }) });
    try { await gh(`/git/refs/heads/${REPO.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) }); return c.sha; }
    catch (e) { if (e.status !== 422) throw e; }   // 그 사이 다른 커밋이 들어옴 → 다시
  }
  throw new Error('저장소가 바쁘네요. 잠시 후 다시 시도해 주세요');
}

/* ---------- 삭제 ---------- */
export async function removeDoc(slug, version, onProgress) {
  const h = await head();
  const idx = await readJson('docs/index.json', h.sha);
  const doc = idx.docs.find((d) => d.slug === slug);
  if (!doc) throw new Error('목록에 없는 기획서예요');
  const remove = [];
  const add = [];
  if (version) {
    doc.versions = doc.versions.filter((v) => v.version !== version);
    remove.push(`docs/${slug}/${version}/`);
    // 지운 버전을 기준으로 비교하던 다음 버전의 diff.json은 더 이상 맞지 않으므로 함께 지운다
    for (const v of doc.versions) {
      try { const d = await readJson(`docs/${slug}/${v.version}/diff.json`, h.sha); if (d.base === version) remove.push(`docs/${slug}/${v.version}/diff.json`); } catch {}
    }
    if (!doc.versions.length) idx.docs = idx.docs.filter((d) => d !== doc);
  } else {
    idx.docs = idx.docs.filter((d) => d !== doc);
    remove.push(`docs/${slug}/`);
  }
  add.push({ path: 'docs/index.json', text: JSON.stringify(idx, null, 1) });
  return commit({ add, remove, message: version ? `기획서 버전 삭제: ${slug} ${version}` : `기획서 삭제: ${slug}`, onProgress });
}

/* ---------- 업로드 ---------- */
export async function upload({ slug, title, version, pptx, pdf, onProgress }) {
  const dir = `inbox/${slug}/${version}/`;
  const add = [{ path: dir + 'meta.json', text: JSON.stringify({ slug, title, version, uploaded: new Date().toISOString() }, null, 1) }];
  const safe = (n) => n.replace(/[\\/:*?"<>|#%]/g, '_');
  add.push({ path: dir + safe(pptx.name), base64: b64(await pptx.arrayBuffer()) });
  if (pdf) add.push({ path: dir + safe(pdf.name), base64: b64(await pdf.arrayBuffer()) });
  return commit({ add, message: `기획서 업로드: ${slug} ${version}`, onProgress });
}

/* ---------- 변환 진행 상황 (GitHub Actions) ---------- */
export async function runOf(sha) {
  const r = await gh(`/actions/runs?head_sha=${sha}&per_page=5`);
  return (r.workflow_runs || [])[0] || null;
}

export function nextVersion(versions) {
  const last = versions.length ? versions[versions.length - 1].version : 'v0.0';
  const m = /^(.*?)(\d+)$/.exec(last);
  return m ? m[1] + (+m[2] + 1) : last + '-2';
}

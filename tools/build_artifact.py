#!/usr/bin/env python3
"""claude.ai 아티팩트 버전 만들기 — Vercel 없이 사내에서 claude.ai 링크로 보는 Doc2Proto

    python3 tools/build_artifact.py OUT_DIR [--bundle main|home] [--share https://claude.ai/artifact/...]

묶음(tools/artifact_bundles.json): 아티팩트 하나에 파일 511개까지라 큰 기획서는 다른 아티팩트로 나눠 올리고,
목록에서는 서로의 아티팩트로 링크된다. --share를 빼면 묶음의 url을 쓴다.

OUT_DIR 에 아티팩트로 올릴 파일을 만든다 (Vercel 배포와는 별개, 저장소 파일은 바꾸지 않음)
  index.html              아티팩트 본문 (doctype/html/head/body 없이 — claude.ai가 감싼다)
  js/app.js, js/main.mjs, js/comments-artifact.mjs
  d/<key>/...             docs/<slug>/<version>/ 복사 (claude.ai 주소는 #영문·숫자만 넘기므로 key로 바꿈)
  manifest.json           올릴 파일 목록 (255개씩 나눠 올리기용)
다른 점: 올리기·삭제·GitHub 연결·PDF 미리보기 없음, 코멘트는 아티팩트 db(claude.ai 계정), Slack 알림 없음
"""
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS = ['app.js', 'main.mjs', 'comments-artifact.mjs']


def key_of(slug, version, used):
    k = 'd' + hashlib.sha1(slug.encode()).hexdigest()[:6] + re.sub(r'[^A-Za-z0-9]', '', version)
    while k in used:
        k += 'x'
    used.add(k)
    return k


def page_html(docs, share, title='Doc2Proto'):
    src = (ROOT / 'index.html').read_text(encoding='utf-8')
    style = re.search(r'<style>(.*?)</style>', src, re.S).group(1)
    # 다크 모드 토큰: 시스템 설정 + claude.ai 테마(data-theme) 둘 다 따름
    dark = re.search(r'@media \(prefers-color-scheme: dark\)\{\s*:root\{(.*?)\}\s*\}', style, re.S)
    if dark:
        toks = dark.group(1)
        style = style.replace(dark.group(0), '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){%s}}\n:root[data-theme="dark"]{%s}' % (toks, toks))
    body = re.search(r'<body>(.*?)</body>', src, re.S).group(1)
    body = re.sub(r'<dialog.*?</dialog>', '', body, flags=re.S)
    body = re.sub(r'<!--.*?-->', '', body, flags=re.S)
    body = re.sub(r'<script.*?</script>', '', body, flags=re.S)
    body = re.sub(r'<div class="acts">.*?</div>', '', body, count=1, flags=re.S)
    body = re.sub(r'<div class="foot">.*?</details>\s*</div>\s*(?=</div>)',
                  '<div class="foot">새 기획서·버전 올리기와 삭제, Slack 알림은 웹 버전(doc2proto.vercel.app)에서 해요. 코멘트는 claude.ai 계정 이름으로 남고 이 아티팩트를 볼 수 있는 사람이 모두 봐요.</div>\n',
                  body, count=1, flags=re.S)
    cfg = {'docs': docs}
    boot = ('<script>window.D2P_HOST="artifact";window.D2P_SHARE=%s;window.D2P_DOCS=%s;</script>'
            % (json.dumps(share or ''), json.dumps(docs, ensure_ascii=False)))
    return ('<title>' + title + '</title>\n<style>%s</style>\n%s\n%s\n'
            '<script src="js/app.js"></script>\n<script type="module" src="js/main.mjs"></script>\n'
            % (style, body.strip(), boot))


def bundle_of(slug, bundles):
    for name, b in bundles.items():
        if not name.startswith('_') and isinstance(b.get('slugs'), list) and slug in b['slugs']:
            return name
    return next(n for n, b in bundles.items() if not n.startswith('_') and b.get('slugs') == '*')


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    out = Path(sys.argv[1]).resolve()
    bundles = json.loads((ROOT / 'tools' / 'artifact_bundles.json').read_text(encoding='utf-8'))
    bundle = sys.argv[sys.argv.index('--bundle') + 1] if '--bundle' in sys.argv else 'main'
    share = sys.argv[sys.argv.index('--share') + 1] if '--share' in sys.argv else bundles[bundle].get('url', '')
    if out.exists():
        shutil.rmtree(out)
    (out / 'js').mkdir(parents=True)
    for f in JS:
        shutil.copy(ROOT / 'js' / f, out / 'js' / f)
    idx = json.loads((ROOT / 'docs' / 'index.json').read_text(encoding='utf-8'))
    docs, used = [], set()
    for d in idx['docs']:
        for v in d['versions']:
            srcdir = ROOT / 'docs' / d['slug'] / v['version']
            if not (srcdir / 'data.json').exists():
                continue
            k = key_of(d['slug'], v['version'], used)
            entry = {'key': k, 'slug': d['slug'], 'version': v['version'], 'title': d['title'], 'date': v.get('date', ''),
                     'pages': v.get('pages', 0), 'live': (srcdir / 'live.json').exists(), 'diff': (srcdir / 'diff.json').exists(), 'path': 'd/%s/' % k}
            home = bundle_of(d['slug'], bundles)
            if home != bundle:   # 다른 아티팩트에 있는 기획서: 목록에 그 아티팩트 링크로만 보임
                if bundles[home].get('url'):
                    entry['ext'] = bundles[home]['url'] + '#' + k
                    docs.append(entry)
                continue
            shutil.copytree(srcdir, out / 'd' / k, ignore=shutil.ignore_patterns('data.json'))
            data = json.loads((srcdir / 'data.json').read_text(encoding='utf-8'))
            for p in data.get('pages', []):
                p.pop('shapes', None)   # 버전 비교용 도형 서명 — 뷰어는 쓰지 않음 (용량 절반 가까이)
            (out / 'd' / k / 'data.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            docs.append(entry)
    (out / 'index.html').write_text(page_html(docs, share, bundles[bundle].get('title', 'Doc2Proto')), encoding='utf-8')
    files = sorted(str(p.relative_to(out)) for p in out.rglob('*') if p.is_file() and str(p.relative_to(out)) not in ('index.html', 'manifest.json'))
    size = sum((out / f).stat().st_size for f in files)
    big = max(((out / f).stat().st_size, f) for f in files)
    (out / 'manifest.json').write_text(json.dumps({'files': files, 'docs': docs}, ensure_ascii=False, indent=1), encoding='utf-8')
    print('bundle:', bundle, '· share:', share or '(없음)')
    print('docs:', ', '.join('%s %s → %s' % (x['slug'], x['version'], x.get('ext') or '#' + x['key']) for x in docs))
    print('files: %d, %.1f MB (가장 큰 파일 %.1f MB %s)' % (len(files), size / 1e6, big[0] / 1e6, big[1]))


if __name__ == '__main__':
    main()

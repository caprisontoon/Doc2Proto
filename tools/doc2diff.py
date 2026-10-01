#!/usr/bin/env python3
"""두 버전의 data.json을 비교해 새 버전 폴더에 diff.json을 쓴다.

사용:
  python tools/doc2diff.py docs/<slug>/<새 버전> [--base <이전 버전>] [--remap-live]

- 페이지 짝짓기: 슬라이드 고유 id(sid)가 같으면 같은 페이지, 남은 것은 제목·내용 유사도로
- Description/표 행: 내용 정렬(difflib)로 추가·수정·삭제, 수정은 글자 단위 비교(segs)
- 도형: 최상위 도형 id·이름·글자로 짝지어 추가·삭제·이동·글자 변경
- --remap-live: 이전 버전의 동작 화면(live/, live.json)을 새 페이지 번호로 옮겨 복사 (data-spec 참조 포함)
"""
import argparse
import difflib
import json
import re
import shutil
import sys
from pathlib import Path


def load(d):
    return json.loads((d / 'data.json').read_text(encoding='utf-8'))


def ratio(a, b):
    if not a and not b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def page_text(p):
    return '\n'.join([p.get('title', '')] + [r['text'] for r in p.get('rows', [])] + [s['text'] for s in p.get('shapes', [])])


def segs(a, b):
    """글자 단위 비교 → [['=',텍스트], ['-',삭제], ['+',추가]]"""
    tok = lambda s: re.findall(r'\d+(?:[.,]\d+)*|[가-힣]+|[A-Za-z]+|\s+|.', s)
    ta, tb = tok(a), tok(b)
    out = []
    sm = difflib.SequenceMatcher(None, ta, tb, autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == 'equal':
            out.append(['=', ''.join(ta[i1:i2])])
        else:
            if i2 > i1:
                out.append(['-', ''.join(ta[i1:i2])])
            if j2 > j1:
                out.append(['+', ''.join(tb[j1:j2])])
    return out


def match_pages(old, new):
    pairs = {}
    by_sid = {p.get('sid'): i for i, p in enumerate(old['pages']) if p.get('sid') is not None}
    used = set()
    for j, p in enumerate(new['pages']):
        i = by_sid.get(p.get('sid'))
        if i is not None and i not in used:
            pairs[j] = i
            used.add(i)
    # sid로 못 찾은 페이지: 제목 + 내용 유사도
    for j, p in enumerate(new['pages']):
        if j in pairs:
            continue
        best, bi = 0, None
        for i, q in enumerate(old['pages']):
            if i in used:
                continue
            sc = 0.4 * ratio(p.get('title', ''), q.get('title', '')) + 0.6 * ratio(page_text(p), page_text(q))
            if sc > best:
                best, bi = sc, i
        if bi is not None and best >= 0.8:
            pairs[j] = bi
            used.add(bi)
    return pairs


def diff_rows(orows, nrows):
    """행 목록 비교. 반환: [{status, key, old_key, title, old, new, segs}]"""
    out = []
    a = [r['text'] for r in orows]
    b = [r['text'] for r in nrows]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == 'equal':
            for k in range(i2 - i1):
                o, n = orows[i1 + k], nrows[j1 + k]
                if o['key'] != n['key']:
                    out.append({'status': 'renum', 'key': n['key'], 'old_key': o['key'], 'title': n.get('title', '')})
            continue
        olds, news = list(range(i1, i2)), list(range(j1, j2))
        # 바뀐 구간 안에서 비슷한 것끼리 '수정'으로 짝짓기
        cand = sorted(((ratio(orows[i]['text'], nrows[j]['text']) + (0.15 if orows[i]['key'] == nrows[j]['key'] else 0), i, j)
                       for i in olds for j in news), reverse=True)
        mi, mj = {}, {}
        for sc, i, j in cand:
            if sc < 0.45 or i in mi or j in mj:
                continue
            mi[i] = j
            mj[j] = i
        for j in news:
            n = nrows[j]
            if j in mj:
                o = orows[mj[j]]
                out.append({'status': 'modified', 'key': n['key'], 'old_key': o['key'], 'title': n.get('title', ''),
                            'old': o['text'], 'new': n['text'], 'segs': segs(o['text'], n['text'])})
            else:
                out.append({'status': 'added', 'key': n['key'], 'title': n.get('title', ''), 'new': n['text']})
        for i in olds:
            if i not in mi:
                o = orows[i]
                out.append({'status': 'removed', 'old_key': o['key'], 'title': o.get('title', ''), 'old': o['text'], 'old_rect': o['rect']})
    return out


def moved(a, b, tol=0.4):
    return any(abs(a[k] - b[k]) > tol for k in ('l', 't', 'w', 'h'))


def diff_shapes(oshapes, nshapes):
    out = []
    by_id = {s['id']: s for s in oshapes}
    used = set()
    pairs = []
    for n in nshapes:
        o = by_id.get(n['id'])
        if o is not None and (o['name'] == n['name'] or ratio(o['text'], n['text']) > 0.6):
            pairs.append((o, n))
            used.add(o['id'])
        else:
            pairs.append((None, n))
    # id가 바뀐 경우(복사·붙여넣기 등): 이름+글자로 다시 짝짓기
    left = [o for o in oshapes if o['id'] not in used]
    for k, (o, n) in enumerate(pairs):
        if o is not None:
            continue
        cand = [x for x in left if x['name'] == n['name'] and x['text'] == n['text'] and x['look'] == n['look']]
        if cand:
            best = min(cand, key=lambda x: abs(x['rect']['l'] - n['rect']['l']) + abs(x['rect']['t'] - n['rect']['t']))
            pairs[k] = (best, n)
            left.remove(best)
    for o, n in pairs:
        if o is None:
            out.append({'status': 'added', 'rect': n['rect'], 'text': n['text'][:120], 'name': n['name']})
            continue
        ch = []
        if moved(o['rect'], n['rect']):
            ch.append('moved')
        if o['text'] != n['text']:
            ch.append('text')
        if o['look'] != n['look']:
            ch.append('look')
        if ch:
            e = {'status': 'modified', 'changes': ch, 'rect': n['rect'], 'name': n['name']}
            if 'moved' in ch:
                e['old_rect'] = o['rect']
            if 'text' in ch:
                e['old'] = o['text'][:400]
                e['new'] = n['text'][:400]
                e['segs'] = segs(o['text'][:400], n['text'][:400])
            out.append(e)
    for o in left:
        out.append({'status': 'removed', 'old_rect': o['rect'], 'text': o['text'][:120], 'name': o['name']})
    return out


def summarize(rows, shapes):
    parts = []
    c = lambda lst, st: sum(1 for x in lst if x['status'] == st)
    if c(rows, 'added'):
        parts.append(f"항목 {c(rows, 'added')}개 추가")
    if c(rows, 'modified'):
        parts.append(f"항목 {c(rows, 'modified')}개 수정")
    if c(rows, 'removed'):
        parts.append(f"항목 {c(rows, 'removed')}개 삭제")
    if shapes:
        parts.append(f'화면 요소 {len(shapes)}곳 변경')
    return ', '.join(parts)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('newdir')
    ap.add_argument('--base', help='비교할 이전 버전 (기본: docs/index.json에서 바로 앞 버전)')
    ap.add_argument('--remap-live', action='store_true', help='이전 버전의 동작 화면을 새 페이지 번호로 옮겨 복사')
    args = ap.parse_args()

    nd = Path(args.newdir).resolve()
    new = load(nd)
    slug_dir = nd.parent
    base = args.base
    if not base:
        idx = json.loads((slug_dir.parent / 'index.json').read_text(encoding='utf-8'))
        doc = next(d for d in idx['docs'] if d['slug'] == new['slug'])
        vs = [v['version'] for v in doc['versions']]
        k = vs.index(new['version'])
        if k == 0:
            sys.exit('이전 버전이 없어요 (--base 로 지정)')
        base = vs[k - 1]
    od = slug_dir / base
    old = load(od)
    if not any('sid' in p for p in old['pages']):
        print('경고: 이전 버전 data.json에 서명(sid·shapes)이 없어 비교가 거칠어요. '
              f'python tools/doc2proto.py <이전.pptx> --slug {new["slug"]} --version {base} --sign-only 로 먼저 추가하세요', file=sys.stderr)

    pairs = match_pages(old, new)
    inv = {i: j for j, i in pairs.items()}
    pages = []
    for j, p in enumerate(new['pages']):
        if j not in pairs:
            pages.append({'page': j + 1, 'status': 'added', 'title': p.get('label') or p.get('title', '')})
            continue
        i = pairs[j]
        q = old['pages'][i]
        rows = diff_rows(q.get('rows', []), p.get('rows', []))
        shapes = diff_shapes(q.get('shapes', []), p.get('shapes', []))
        real_rows = [r for r in rows if r['status'] != 'renum']
        e = {'page': j + 1, 'base': i + 1, 'status': 'modified' if (real_rows or shapes) else 'same',
             'title': p.get('label') or p.get('title', '')}
        if q.get('title') != p.get('title'):
            e['old_title'] = q.get('label') or q.get('title', '')
        if rows:
            e['rows'] = rows
        if shapes:
            e['shapes'] = shapes
        if e['status'] == 'modified':
            e['summary'] = summarize(real_rows, shapes)
        pages.append(e)
    removed = [{'base': i + 1, 'status': 'removed', 'title': q.get('label') or q.get('title', ''), 'num': q.get('num', ''),
                'after': max([j + 1 for j, ii in pairs.items() if ii < i], default=0)}
               for i, q in enumerate(old['pages']) if i not in inv]
    pagemap = {str(i + 1): j + 1 for j, i in pairs.items()}
    out = {'base': base, 'version': new['version'], 'pagemap': pagemap, 'pages': pages, 'removed': removed,
           'counts': {'modified': sum(1 for p in pages if p['status'] == 'modified'),
                      'added': sum(1 for p in pages if p['status'] == 'added'), 'removed': len(removed)}}
    (nd / 'diff.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    c = out['counts']
    print(f"✓ {nd / 'diff.json'}  {base} → {new['version']}: 수정 {c['modified']}쪽, 신규 {c['added']}쪽, 삭제 {c['removed']}쪽")
    for p in pages:
        if p['status'] != 'same':
            print(f"  {p['page']:>3}p {'신규' if p['status'] == 'added' else '수정'}  {p['title']}  {p.get('summary', '')}")
    for r in removed:
        print(f"  (이전 {r['base']}p) 삭제  {r['title']}")

    if args.remap_live and (od / 'live.json').exists():
        remap_live(od, nd, pagemap)


def remap_live(od, nd, pagemap):
    """이전 버전 동작 화면을 복사하면서 페이지 번호 참조("7:3")를 새 번호로 바꾼다."""
    live = json.loads((od / 'live.json').read_text(encoding='utf-8'))
    src_dir = (od / live['src']).parent
    dst_dir = nd / Path(live['src']).parent
    if dst_dir.exists():
        print(f'  {dst_dir} 이(가) 이미 있어 동작 화면 복사는 건너뛰어요', file=sys.stderr)
        return
    shutil.copytree(src_dir, dst_dir)
    lost = set()

    def ref(m):
        o = m.group(1)
        if o not in pagemap:
            lost.add(o)
            return m.group(0)
        return f'{pagemap[o]}:'
    for f in dst_dir.rglob('*.html'):
        s = f.read_text(encoding='utf-8')
        # data-spec="7:3 8:1-4" 같은 참조 안의 '페이지:' 만 바꾼다
        s = re.sub(r'(data-spec\s*=\s*")([^"]*)"', lambda m: m.group(1) + re.sub(r'(?<![\w:])(\d+):', ref, m.group(2)) + '"', s)
        f.write_text(s, encoding='utf-8')
    frames = []
    for fr in live.get('frames', []):
        k = str(fr['page'])
        if k in pagemap:
            frames.append({**fr, 'page': pagemap[k]})
        else:
            lost.add(k)
    live['frames'] = sorted(frames, key=lambda f: f['page'])
    (nd / 'live.json').write_text(json.dumps(live, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'  동작 화면 복사 → {dst_dir}  (프레임 {len(frames)}개, 페이지 번호 다시 매김)')
    if lost:
        print(f'  삭제된 페이지를 가리키던 참조: {", ".join(sorted(lost, key=int))}p — 직접 확인하세요', file=sys.stderr)


if __name__ == '__main__':
    main()

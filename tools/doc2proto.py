#!/usr/bin/env python3
"""PPTX 상세기획서 → Doc2Proto 정적 문서(docs/<slug>/<version>/) 변환기.

사용법:
  python tools/doc2proto.py <기획서.pptx> --slug 투네이션채팅 --version v0.2 [--pdf 같은내용.pdf]

하는 일:
  1. PPTX를 열어 슬라이드마다 도형·텍스트·연결선·하이퍼링크를 읽는다 (python-pptx)
  2. 빨간 점선 도형 → 핫스팟, 연결선의 시작/끝 도형 → 핫스팟↔설명 블록 매핑,
     슬라이드 점프 하이퍼링크 → navigate 동작
  3. LibreOffice(또는 --pdf)로 페이지 이미지를 만든다 (PyMuPDF)
  4. docs/<slug>/<version>/data.json + p1.jpg… 를 쓰고 docs/index.json을 갱신한다

이후 Claude가 data.json의 behaviors(툴팁·팝업 등)를 채운다 — .claude/skills/doc2proto/SKILL.md 참고.
"""
import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

try:
    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE
    from pptx.util import Emu
except ImportError:
    sys.exit("python-pptx가 필요해요:  pip install python-pptx pymupdf")

NS = {
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}


# ---------- 기하 ----------
def rect_pct(x, y, w, h, SW, SH):
    return {'l': round(x / SW * 100, 3), 't': round(y / SH * 100, 3),
            'w': round(w / SW * 100, 3), 'h': round(h / SH * 100, 3)}


def contains(outer, inner, tol=0.3):
    return (inner['l'] >= outer['l'] - tol and inner['t'] >= outer['t'] - tol and
            inner['l'] + inner['w'] <= outer['l'] + outer['w'] + tol and
            inner['t'] + inner['h'] <= outer['t'] + outer['h'] + tol)


def area(r):
    return r['w'] * r['h']


def dist_pt_rect(x, y, r):
    dx = max(r['l'] - x, 0, x - (r['l'] + r['w']))
    dy = max(r['t'] - y, 0, y - (r['t'] + r['h']))
    return (dx * dx + dy * dy) ** 0.5


def same_rect(a, b, tol=0.6):
    return all(abs(a[k] - b[k]) < tol for k in 'ltwh')


# ---------- 도형 읽기 ----------
def is_red(rgb):
    if rgb is None:
        return False
    r, g, b = rgb
    return r > 170 and g < 90 and b < 90


def line_info(shape):
    """(dashed, rgb) — 테두리 선 정보. 없으면 (False, None)."""
    ln = shape._element.find('.//a:ln', NS)
    if ln is None:
        return False, None
    if ln.find('a:noFill', NS) is not None:
        return False, None
    dashed = ln.find('a:prstDash', NS) is not None and ln.find('a:prstDash', NS).get('val') not in (None, 'solid')
    rgb = None
    srgb = ln.find('.//a:srgbClr', NS)
    if srgb is not None:
        v = srgb.get('val')
        rgb = tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))
    return dashed, rgb


def fill_rgb(shape):
    sp = shape._element.find('p:spPr', NS)
    if sp is None:
        return None
    sf = sp.find('a:solidFill/a:srgbClr', NS)
    if sf is None:
        return None
    v = sf.get('val')
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))


def shape_text(shape):
    if shape.has_text_frame:
        return '\n'.join(p.text for p in shape.text_frame.paragraphs if p.text.strip()).strip()
    if getattr(shape, 'has_table', False) and shape.has_table:
        rows = []
        for row in shape.table.rows:
            cells = [c.text.strip().replace('\n', ' ') for c in row.cells]
            if any(cells):
                rows.append(' | '.join(cells))
        return '\n'.join(rows)
    return ''


def walk(shapes, SW, SH, xf=None, depth=0):
    """그룹을 풀어 (shape, rect%, depth, group_root_id) 목록으로. xf = 그룹 좌표 변환."""
    out = []
    for sh in shapes:
        x, y, w, h = sh.left or 0, sh.top or 0, sh.width or 0, sh.height or 0
        if xf:
            x, y, w, h = xf(x, y, w, h)
        if sh.shape_type == MSO_SHAPE_TYPE.GROUP:
            grp = sh._element.find('p:grpSpPr/a:xfrm', NS)
            off = grp.find('a:off', NS); ext = grp.find('a:ext', NS)
            choff = grp.find('a:chOff', NS); chext = grp.find('a:chExt', NS)
            gx, gy = int(off.get('x')), int(off.get('y'))
            gw, gh = int(ext.get('cx')), int(ext.get('cy'))
            cx, cy = int(choff.get('x')), int(choff.get('y'))
            cw, ch = int(chext.get('cx')) or gw, int(chext.get('cy')) or gh
            sx, sy = gw / cw if cw else 1, gh / ch if ch else 1
            outer = xf

            def inner(px, py, pw, ph, gx=gx, gy=gy, cx=cx, cy=cy, sx=sx, sy=sy, outer=outer):
                nx, ny, nw, nh = gx + (px - cx) * sx, gy + (py - cy) * sy, pw * sx, ph * sy
                return outer(nx, ny, nw, nh) if outer else (nx, ny, nw, nh)

            out.append((sh, rect_pct(x, y, w, h, SW, SH), depth))
            out.extend(walk(sh.shapes, SW, SH, inner, depth + 1))
        else:
            out.append((sh, rect_pct(x, y, w, h, SW, SH), depth))
    return out


def connector_ends(shape, rect):
    """연결선의 시작/끝 좌표(%) + 연결된 도형 id + 화살표 방향."""
    el = shape._element
    cxn = el.find('p:nvCxnSpPr/p:cNvCxnSpPr', NS)
    st = cxn.find('a:stCxn', NS) if cxn is not None else None
    en = cxn.find('a:endCxn', NS) if cxn is not None else None
    xfrm = el.find('p:spPr/a:xfrm', NS)
    flipH = xfrm is not None and xfrm.get('flipH') == '1'
    flipV = xfrm is not None and xfrm.get('flipV') == '1'
    x0, y0 = rect['l'], rect['t']
    x1, y1 = rect['l'] + rect['w'], rect['t'] + rect['h']
    if flipH:
        x0, x1 = x1, x0
    if flipV:
        y0, y1 = y1, y0
    ln = el.find('p:spPr/a:ln', NS)
    head = ln is not None and ln.find('a:headEnd', NS) is not None and ln.find('a:headEnd', NS).get('type') not in (None, 'none')
    tail = ln is not None and ln.find('a:tailEnd', NS) is not None and ln.find('a:tailEnd', NS).get('type') not in (None, 'none')
    return {
        'start': (x0, y0), 'end': (x1, y1),
        'start_id': int(st.get('id')) if st is not None else None,
        'end_id': int(en.get('id')) if en is not None else None,
        'arrow_at_end': tail or not head,  # 기본은 끝쪽 화살표
    }


def page_title(items):
    """템플릿 헤더: 'Page Name' 셀 오른쪽 텍스트. 없으면 가장 큰 글자의 짧은 텍스트."""
    texts = [(sh, r, shape_text(sh)) for sh, r, d in items if shape_text(sh)]
    for sh, r, t in texts:
        if getattr(sh, 'has_table', False) and sh.has_table:
            for row in sh.table.rows:
                cells = [c.text.strip() for c in row.cells]
                for i, c in enumerate(cells):
                    if c.lower() == 'page name':
                        for nxt in cells[i + 1:]:
                            if nxt and nxt.lower() != 'project':
                                return nxt
        if t.strip().lower() == 'page name':
            right = [(r2['l'], t2) for sh2, r2, t2 in texts if abs(r2['t'] - r['t']) < 1.5 and r2['l'] > r['l'] and t2.lower() not in ('page name', 'project')]
            if right:
                return sorted(right)[0][1].split('\n')[0]
    return ''


def analyze_slide(slide, idx, SW, SH):
    items = walk(slide.shapes, SW, SH)
    title = page_title(items)

    hotspots, blocks, connectors, nav = [], [], [], []
    id_to_block, id_to_hotspot = {}, {}
    # 템플릿 틀(헤더 표, Description 사이드바, 푸터)은 블록에서 제외
    for sh, r, depth in items:
        sid = sh.shape_id
        text = shape_text(sh)
        if sh.shape_type == MSO_SHAPE_TYPE.GROUP:
            child_texts = [shape_text(c) for c, _, _ in walk(sh.shapes, SW, SH) if shape_text(c)]
            b = {'id': len(blocks), 'rect': r, 'text': '\n'.join(child_texts), 'caption': '', 'shape_id': sid,
                 'depth': depth, 'kind': 'group'}
            blocks.append(b)
            id_to_block[sid] = b
            continue
        is_conn = sh._element.tag.endswith('}cxnSp')
        if is_conn:
            c = connector_ends(sh, r)
            dashed, rgb = line_info(sh)
            c['red'] = is_red(rgb)
            connectors.append(c)
            continue
        dashed, rgb = line_info(sh)
        if is_red(rgb) and dashed and r['w'] > 0.4 and r['h'] > 0.4 and not text:
            h = {'id': len(hotspots), 'rect': r, 'label': '', 'targets': [], 'shape_id': sid}
            hotspots.append(h)
            id_to_hotspot[sid] = h
            continue
        if r['w'] < 0.3 or r['h'] < 0.3:
            continue
        low = text.lower()
        if low in ('description', 'page name', 'project') or low.startswith('copyright') or low.startswith('we make creative'):
            continue
        b = {'id': len(blocks), 'rect': r, 'text': text, 'caption': '', 'shape_id': sid,
             'depth': depth, 'kind': 'table' if getattr(sh, 'has_table', False) and sh.has_table else
             ('picture' if sh.shape_type == MSO_SHAPE_TYPE.PICTURE else 'shape')}
        blocks.append(b)
        id_to_block[sid] = b
        # 슬라이드 점프 하이퍼링크 → navigate 동작
        try:
            ca = sh.click_action
            if ca is not None and ca.target_slide is not None:
                nav.append({'rect': r, 'label': text.split('\n')[0][:30] if text else '', 'target_slide_id': ca.target_slide.slide_id})
        except Exception:
            pass
        if sh.has_text_frame:
            for p in sh.text_frame.paragraphs:
                for run in p.runs:
                    try:
                        tgt = run.hyperlink._hlinkClick if run.hyperlink else None
                    except Exception:
                        tgt = None
                    if tgt is not None and tgt.get('action', '').startswith('ppaction://hlinksldjump'):
                        rid = tgt.get('{%s}id' % NS['r'])
                        rel = slide.part.rels.get(rid)
                        if rel is not None and hasattr(rel.target_part, 'slide_id'):
                            nav.append({'rect': r, 'label': run.text[:30], 'target_slide_id': rel.target_part.slide_id})

    # 그룹 안쪽 도형, 목업(핫스팟을 품은 큰 블록) 안쪽 도형은 inner 표시 → 뷰어에서 클릭 오버레이 제외
    for b in blocks:
        b['inner'] = b['depth'] > 0
    for h in hotspots:
        for m in blocks:
            if contains(m['rect'], h['rect']) and area(m['rect']) > max(area(h['rect']) * 1.5, 300):
                for b in blocks:
                    if b is not m and contains(m['rect'], b['rect']):
                        b['inner'] = True

    # 그룹 안 핫스팟의 label: 핫스팟 안에 있는 텍스트
    for h in hotspots:
        inside = [b for b in blocks if contains(h['rect'], b['rect'], 0.5) and b['text']]
        if inside:
            h['label'] = min(inside, key=lambda b: area(b['rect']))['text'].split('\n')[0][:40]

    # 캡션: 블록 바로 위의 짧은 한 줄 텍스트
    for b in blocks:
        cands = [o for o in blocks if o is not b and o['text'] and '\n' not in o['text'] and len(o['text']) < 40
                 and 0 <= b['rect']['t'] - (o['rect']['t'] + o['rect']['h']) < 2.5 and abs(o['rect']['l'] - b['rect']['l']) < 4]
        if cands:
            b['caption'] = cands[0]['text']
        elif b['text'] and len(b['text'].split('\n')[0]) < 30:
            b['caption'] = b['text'].split('\n')[0]

    # 연결선 → 핫스팟 ↔ 블록 매핑
    def nearest_hotspot(pt):
        c = [(dist_pt_rect(pt[0], pt[1], h['rect']), h) for h in hotspots]
        c = [x for x in c if x[0] < 2.5]
        return min(c, key=lambda x: x[0])[1] if c else None

    def nearest_block(pt, exclude):
        c = [(dist_pt_rect(pt[0], pt[1], b['rect']), b) for b in blocks if b not in exclude and not b['inner'] and area(b['rect']) < 60 * 60]
        c = [x for x in c if x[0] < 4]
        return min(c, key=lambda x: (x[0], area(x[1]['rect'])))[1] if c else None

    for c in connectors:
        if not c['red']:
            continue
        src_pt, dst_pt = (c['start'], c['end']) if c['arrow_at_end'] else (c['end'], c['start'])
        src_id, dst_id = (c['start_id'], c['end_id']) if c['arrow_at_end'] else (c['end_id'], c['start_id'])
        h = id_to_hotspot.get(src_id) or nearest_hotspot(src_pt)
        if h is None:
            # 출발점에 핫스팟이 없으면 출발 도형 자체를 가상 핫스팟으로
            sb = id_to_block.get(src_id) or nearest_block(src_pt, [])
            if sb is None:
                continue
            h = {'id': len(hotspots), 'rect': sb['rect'], 'label': sb['text'].split('\n')[0][:40], 'targets': [], 'shape_id': None, 'virtual': True}
            hotspots.append(h)
        mock = [b for b in blocks if contains(b['rect'], h['rect']) and area(b['rect']) > area(h['rect'])]
        tb = id_to_block.get(dst_id)
        if tb is None or tb in mock:
            tb = nearest_block(dst_pt, mock)
        if tb is not None and tb['id'] not in h['targets']:
            h['targets'].append(tb['id'])

    # 연결선 없는 핫스팟: 오른쪽 가장 가까운 설명 블록
    for h in hotspots:
        if h['targets']:
            continue
        mock = [b for b in blocks if contains(b['rect'], h['rect']) and area(b['rect']) > area(h['rect'])]
        cands = [b for b in blocks if b not in mock and b['rect']['l'] >= h['rect']['l'] + h['rect']['w'] - 0.5 and b['text']]
        if cands:
            best = min(cands, key=lambda b: dist_pt_rect(h['rect']['l'] + h['rect']['w'], h['rect']['t'] + h['rect']['h'] / 2, b['rect']))
            if dist_pt_rect(h['rect']['l'] + h['rect']['w'], h['rect']['t'] + h['rect']['h'] / 2, best['rect']) < 15:
                h['targets'].append(best['id'])

    # 목업(핫스팟을 품은 가장 큰 블록) 표시
    for h in hotspots:
        mock = [b for b in blocks if contains(b['rect'], h['rect']) and area(b['rect']) > area(h['rect'])]
        h['mockup'] = max(mock, key=lambda b: area(b['rect']))['id'] if mock else None

    return {
        'index': idx, 'title': title, 'slide_id': slide.slide_id,
        'blocks': [{k: v for k, v in b.items() if k not in ('depth',)} for b in blocks],
        'hotspots': [{k: v for k, v in h.items() if k != 'shape_id'} for h in hotspots],
        'nav': nav, 'links': [], 'behaviors': [],
    }


def cross_page_links(pages):
    """같은 목업이 반복되는 다른 페이지의 핫스팟을 현재 페이지에 투영."""
    for p in pages:
        mocks = [p['blocks'][h['mockup']]['rect'] for h in p['hotspots'] if h.get('mockup') is not None]
        if not mocks and p['blocks']:
            big = max(p['blocks'], key=lambda b: area(b['rect']))
            if area(big['rect']) > 12 * 100:
                mocks = [big['rect']]
        for q in pages:
            if q is p:
                continue
            for h in q['hotspots']:
                if h.get('mockup') is None or not h['targets']:
                    continue
                qm = q['blocks'][h['mockup']]['rect']
                if not any(same_rect(m, qm) for m in mocks):
                    continue
                if any(same_rect(own['rect'], h['rect']) for own in p['hotspots']):
                    continue
                if area(h['rect']) > area(qm) * 0.5:
                    continue
                p['links'].append({'page': q['index'], 'hotspot': h['id'], 'rect': h['rect']})


def resolve_nav(pages):
    by_slide = {p['slide_id']: p['index'] for p in pages}
    for p in pages:
        for n in p.pop('nav'):
            tgt = by_slide.get(n['target_slide_id'])
            if tgt is None:
                continue
            p['behaviors'].append({'kind': 'navigate', 'trigger': 'click', 'rect': n['rect'], 'label': n['label'] or '링크',
                                   'content': f"{pages[tgt]['title'] or '페이지 ' + str(tgt + 1)}(으)로 이동",
                                   'show_rect': None, 'target_page': tgt + 1, 'source': 'hyperlink'})


# ---------- 렌더링 ----------
def find_soffice():
    for name in ('soffice', 'libreoffice'):
        p = shutil.which(name)
        if p:
            return p
    cands = {
        'Windows': [r'C:\Program Files\LibreOffice\program\soffice.exe', r'C:\Program Files (x86)\LibreOffice\program\soffice.exe'],
        'Darwin': ['/Applications/LibreOffice.app/Contents/MacOS/soffice'],
    }.get(platform.system(), [])
    for c in cands:
        if os.path.exists(c):
            return c
    return None


def pptx_to_pdf(pptx, workdir):
    soffice = find_soffice()
    if soffice:
        subprocess.run([soffice, '--headless', '--convert-to', 'pdf', '--outdir', str(workdir), str(pptx)],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
        out = workdir / (Path(pptx).stem + '.pdf')
        if out.exists():
            return out
    if platform.system() == 'Windows':
        # PowerPoint COM으로 PDF 내보내기
        out = workdir / (Path(pptx).stem + '.pdf')
        ps = (f"$p=New-Object -ComObject PowerPoint.Application; $d=$p.Presentations.Open('{Path(pptx).resolve()}',$true,$false,$false);"
              f"$d.SaveAs('{out.resolve()}',32); $d.Close(); $p.Quit()")
        subprocess.run(['powershell', '-NoProfile', '-Command', ps], check=False, timeout=300)
        if out.exists():
            return out
    sys.exit('LibreOffice(soffice)나 PowerPoint를 찾지 못했어요. PowerPoint에서 PDF로 내보낸 뒤 --pdf 로 넘겨주세요.')


def render_pages(pdf, outdir, width=1920):
    try:
        import pymupdf
    except ImportError:
        sys.exit('PyMuPDF가 필요해요:  pip install pymupdf')
    doc = pymupdf.open(str(pdf))
    n = 0
    for i, page in enumerate(doc):
        zoom = width / page.rect.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        pix.save(str(outdir / f'p{i + 1}.jpg'), jpg_quality=85)
        n += 1
    return n


# ---------- 메인 ----------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pptx')
    ap.add_argument('--slug', help='문서 폴더 이름 (기본: 파일명)')
    ap.add_argument('--version', default=None, help='버전 폴더 이름 (기본: v + 날짜)')
    ap.add_argument('--title', help='문서 제목 (기본: 파일명)')
    ap.add_argument('--pdf', help='이미 내보낸 PDF (LibreOffice/PowerPoint 없을 때)')
    ap.add_argument('--docs', default=str(Path(__file__).resolve().parent.parent / 'docs'), help='docs 폴더 경로')
    ap.add_argument('--no-render', action='store_true', help='페이지 이미지 생성 생략')
    args = ap.parse_args()

    pptx_path = Path(args.pptx)
    if not pptx_path.exists():
        sys.exit(f'파일이 없어요: {pptx_path}')
    stem = pptx_path.stem
    slug = args.slug or re.sub(r'[^\w가-힣-]+', '-', stem).strip('-')
    version = args.version or ('v' + date.today().strftime('%Y%m%d'))
    title = args.title or stem
    outdir = Path(args.docs) / slug / version
    outdir.mkdir(parents=True, exist_ok=True)

    prs = Presentation(str(pptx_path))
    SW, SH = prs.slide_width, prs.slide_height
    pages = []
    for i, slide in enumerate(prs.slides):
        pages.append(analyze_slide(slide, i, SW, SH))
    resolve_nav(pages)
    cross_page_links(pages)

    if not args.no_render:
        with tempfile.TemporaryDirectory() as td:
            pdf = Path(args.pdf) if args.pdf else pptx_to_pdf(pptx_path, Path(td))
            n = render_pages(pdf, outdir)
        if n != len(pages):
            print(f'경고: 슬라이드 {len(pages)}장 vs 렌더링 {n}장 — 숨긴 슬라이드가 있으면 번호가 어긋날 수 있어요', file=sys.stderr)

    data = {
        'title': title, 'slug': slug, 'version': version, 'source': pptx_path.name,
        'generated': date.today().isoformat(), 'aspect': round(SW / SH, 4),
        'pages': [{
            'title': p['title'], 'img': f'p{p["index"] + 1}.jpg',
            'blocks': [{'id': b['id'], 'rect': b['rect'], 'text': b['text'], 'caption': b['caption'], 'kind': b['kind'], 'inner': b['inner']} for b in p['blocks']],
            'hotspots': [{'id': h['id'], 'rect': h['rect'], 'label': h['label'], 'targets': h['targets']} for h in p['hotspots']],
            'links': p['links'], 'behaviors': p['behaviors'],
        } for p in pages],
    }
    (outdir / 'data.json').write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')

    # docs/index.json 갱신
    index_path = Path(args.docs) / 'index.json'
    index = json.loads(index_path.read_text(encoding='utf-8')) if index_path.exists() else {'docs': []}
    entry = next((d for d in index['docs'] if d['slug'] == slug), None)
    if entry is None:
        entry = {'slug': slug, 'title': title, 'versions': []}
        index['docs'].append(entry)
    entry['title'] = title
    entry['versions'] = [v for v in entry['versions'] if v['version'] != version]
    entry['versions'].append({'version': version, 'date': date.today().isoformat(), 'pages': len(pages)})
    entry['versions'].sort(key=lambda v: v['date'] + v['version'])
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding='utf-8')

    hs = sum(len(p['hotspots']) for p in pages)
    tg = sum(1 for p in pages for h in p['hotspots'] if h['targets'])
    nv = sum(len(p['behaviors']) for p in pages)
    print(f'✓ {outdir}  페이지 {len(pages)}장, 핫스팟 {hs}개(설명 연결 {tg}개), 하이퍼링크 이동 {nv}개')
    print(f'  미리보기: index.html?doc=docs/{slug}/{version}')


if __name__ == '__main__':
    main()

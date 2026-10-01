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


def rgb_of(color):
    try:
        if color is not None and color.type is not None and color.rgb is not None:
            return '#%02x%02x%02x' % tuple(color.rgb)
    except Exception:
        pass
    return None


def table_cells(shape, SW, SH):
    """표를 셀 단위 데이터로. {cols:[%...], rows:[[{text,bold,color,bg,align,size,colspan,rowspan}|None,...],...]}"""
    from pptx.enum.text import PP_ALIGN
    tbl = shape.table
    total = sum(c.width for c in tbl.columns) or 1
    cols = [round(c.width / total * 100, 2) for c in tbl.columns]
    rows = []
    sizes = []
    for r in tbl.rows:
        row = []
        for c in r.cells:
            if c.is_spanned:
                row.append(None)
                continue
            paras = []
            bold = None; color = None; size = None; align = None
            for pg in c.text_frame.paragraphs:
                runs = pg.runs
                txt = ''.join(run.text for run in runs) if runs else pg.text
                if runs:
                    if bold is None and runs[0].font.bold is not None:
                        bold = runs[0].font.bold
                    if color is None:
                        color = rgb_of(runs[0].font.color)
                    if size is None and runs[0].font.size is not None:
                        size = runs[0].font.size.pt
                if align is None and pg.alignment is not None:
                    align = {PP_ALIGN.CENTER: 'center', PP_ALIGN.RIGHT: 'right'}.get(pg.alignment, 'left')
                paras.append(txt.replace('\x0b', '\n'))
            if size:
                sizes.append(size)
            bg = None
            try:
                if c.fill.type == 1:  # solid
                    bg = rgb_of(c.fill.fore_color)
            except Exception:
                pass
            row.append({'text': '\n'.join(paras).strip(), 'bold': bool(bold), 'color': color, 'bg': bg, 'align': align,
                        'size': size, 'colspan': c.span_width if c.is_merge_origin else 1, 'rowspan': c.span_height if c.is_merge_origin else 1})
        rows.append(row)
    default = min(sizes) if sizes else 9
    for row in rows:
        for c in row:
            if c and not c['size']:
                c['size'] = default
    return {'cols': cols, 'rows': rows}


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
    if not title:
        try:
            if slide.shapes.title is not None and slide.shapes.title.has_text_frame:
                title = slide.shapes.title.text_frame.text.strip().split('\n')[0]
        except Exception:
            pass
    if title:
        shorter = [shape_text(sh).split('\n')[0].strip() for sh, r, d in items
                   if r['t'] < 15 and shape_text(sh) and len(shape_text(sh).split('\n')[0].strip()) < len(title)
                   and title.endswith(shape_text(sh).split('\n')[0].strip())]
        full_title = title
        if shorter:
            title = min(shorter, key=len)
    else:
        full_title = ''

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

    # 표의 행을 블록으로 (번호 행 ↔ 번호 마커 매핑, 툴팁 표용). 저장된 행 높이는 최소값이라 줄 수로 가중해 프레임에 맞춘다
    numbered_rows, tooltip_rows, tables = {}, [], []
    for sh, r, depth in items:
        if not (getattr(sh, 'has_table', False) and sh.has_table):
            continue
        rows = list(sh.table.rows)
        if not rows:
            continue
        texts = [[c.text.strip() for c in row.cells] for row in rows]
        col0_w = (sh.table.columns[0].width / SW * 100) if len(sh.table.columns) else r['w'] * 0.3
        tmeta = {'rect': r, 'col0_w': col0_w, 'rows': [], 'cells': table_cells(sh, SW, SH), 'role': 'table'}
        tables.append(tmeta)
        weights = []
        for row, cells in zip(rows, texts):
            lines = max(len(c.replace('\x0b', '\n').split('\n')) + sum(len(l) // 28 for l in c.replace('\x0b', '\n').split('\n')) for c in cells) if any(cells) else 1
            weights.append(max(row.height / SH * 100, lines * 2.1))
        scale = r['h'] / sum(weights) if sum(weights) else 1
        y = r['t']
        is_tip_table = any('툴팁' in c for c in texts[0])
        if is_tip_table:
            tmeta['role'] = 'tooltip'
        elif any(re.fullmatch(r'0*\d{1,2}|[①-⑳]', t[0]) for t in texts if t and t[0]) and r['l'] > 65:
            tmeta['role'] = 'desc'
        for i, (row, cells) in enumerate(zip(rows, texts)):
            h = weights[i] * scale
            rr = {'l': r['l'], 't': round(y, 3), 'w': r['w'], 'h': round(h, 3)}
            y += h
            body = ' | '.join(c for c in cells if c)
            if not body:
                continue
            first = cells[0]
            is_num = bool(re.fullmatch(r'[0-9①-⑳]+', first))
            blk = {'id': len(blocks), 'rect': rr, 'text': (' | '.join(c for c in cells[1:] if c) if is_num else body),
                   'caption': (cells[1].split('\n')[0][:30] if len(cells) > 1 and cells[1] else first[:30]), 'shape_id': None, 'depth': 1, 'kind': 'row'}
            blocks.append(blk)
            tmeta['rows'].append({'block': blk['id'], 'key': first.replace('\x0b', '\n').split('\n')[0].strip()})
            m = re.fullmatch(r'0*(\d{1,2})', first)
            if m:
                numbered_rows.setdefault(int(m.group(1)), blk)
            elif first in '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳' and first:
                numbered_rows.setdefault('①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'.index(first) + 1, blk)
            if is_tip_table and i > 0 and len(cells) >= 2 and cells[0] and cells[1]:
                tooltip_rows.append((cells[0], cells[1], blk))

    # 그룹 안쪽 도형, 목업(핫스팟을 품은 큰 블록) 안쪽 도형은 inner 표시 → 뷰어에서 클릭 오버레이 제외
    for b in blocks:
        b['inner'] = b['depth'] > 0
    # 텍스트 없는 큰 도형 = 화면 컨테이너 → 그 안의 도형은 inner
    for m in blocks:
        if not m['text'] and area(m['rect']) > 15 * 100 and m['kind'] in ('shape', 'picture'):
            for b in blocks:
                if b is not m and contains(m['rect'], b['rect']):
                    b['inner'] = True

    def small_text_shapes(pattern):
        return [b for b in blocks if b['kind'] == 'shape' and b['rect']['w'] < 3.5 and b['rect']['h'] < 5 and re.fullmatch(pattern, b['text'].strip())]

    # 번호 마커(작은 빨간 원 + 숫자) → 번호 행. 마커가 붙어 있는 UI 요소까지 핫스팟으로 확장
    marker_ids = set()
    for sh, r, depth in items:
        text = shape_text(sh).strip()
        m = re.fullmatch(r'0*(\d{1,2})|([①-⑳])', text)
        if not m or r['w'] > 3.5 or r['h'] > 5:
            continue
        dashed, rgb = line_info(sh)
        if not (is_red(rgb) or is_red(fill_rgb(sh))):
            continue
        n = int(m.group(1)) if m.group(1) else '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'.index(m.group(2)) + 1
        marker_ids.add(sh.shape_id)
        cx, cy = r['l'] + r['w'] / 2, r['t'] + r['h'] / 2
        cands = [b for b in blocks if b['shape_id'] != sh.shape_id and b['kind'] != 'row' and area(b['rect']) > area(r) * 3
                 and area(b['rect']) < 45 * 100 and abs(b['rect']['l'] - cx) < 3.5
                 and (abs(b['rect']['t'] - cy) < 3 or b['rect']['t'] <= cy <= b['rect']['t'] + b['rect']['h'])]
        if cands:
            e = min(cands, key=lambda b: (round(((b['rect']['l'] - cx) ** 2 + (b['rect']['t'] - cy) ** 2) ** 0.5), area(b['rect'])))['rect']
            l, t = min(r['l'], e['l']), min(r['t'], e['t'])
            hr = {'l': l, 't': t, 'w': max(r['l'] + r['w'], e['l'] + e['w']) - l, 'h': max(r['t'] + r['h'], e['t'] + e['h']) - t}
        else:
            hr = {'l': r['l'] - 0.6, 't': r['t'] - 0.6, 'w': max(r['w'] + 1.2, 2.5), 'h': max(r['h'] + 1.2, 3.5)}
        h = {'id': len(hotspots), 'rect': hr, 'label': f'{n}번', 'targets': [], 'shape_id': sh.shape_id, 'marker': n, 'marker_rect': r}
        row = numbered_rows.get(n)
        if row is not None:
            h['targets'].append(row['id'])
        hotspots.append(h)
    for b in blocks:
        if b['shape_id'] in marker_ids:
            b['inner'] = True

    # 툴팁 표 (항목 | 툴팁): 목업에서 항목 텍스트 도형을 찾고 그 옆 ?/ⓘ 아이콘에 hover 툴팁
    tooltip_behaviors = []
    icons = small_text_shapes(r'[?？!ⓘi]')
    for name, tip, row_blk in tooltip_rows:
        named = [b for b in blocks if b['kind'] in ('shape',) and b['text'].strip() == name and b is not row_blk]
        if not named:
            continue
        tgt = min(named, key=lambda b: area(b['rect']))
        near = [(dist_pt_rect(tgt['rect']['l'] + tgt['rect']['w'], tgt['rect']['t'] + tgt['rect']['h'] / 2, i['rect']), i) for i in icons]
        near = [x for x in near if x[0] < 6]
        anchor = min(near, key=lambda x: x[0])[1]['rect'] if near else tgt['rect']
        ar = {'l': anchor['l'] - 0.3, 't': anchor['t'] - 0.3, 'w': max(anchor['w'] + 0.6, 2), 'h': max(anchor['h'] + 0.6, 3)}
        tooltip_behaviors.append({'kind': 'tooltip', 'trigger': 'hover', 'rect': ar, 'label': f'{name} 도움말', 'content': tip,
                                  'show_rect': None, 'target_page': None, 'source': 'tooltip-table'})
        if near:
            for b in blocks:
                if b['rect'] == anchor:
                    b['inner'] = True

    # 말풍선(callout) 도형: 꼬리가 가리키는 아이콘의 툴팁. 꼬리 위치는 adj1/adj2(도형 중심 기준 % ×1000)
    for sh, r, depth in items:
        g = sh._element.find('.//a:prstGeom', NS) if sh._element.tag.endswith('}sp') else None
        if g is None or 'allout' not in (g.get('prst') or ''):
            continue
        text = shape_text(sh).strip()
        if not text:
            continue
        adj = {a.get('name'): a.get('fmla') for a in g.findall('.//a:gd', NS)}
        def val(k, d):
            f = adj.get(k)
            try:
                return int(f.split()[-1]) / 100000 if f else d
            except ValueError:
                return d
        tx = r['l'] + r['w'] / 2 + val('adj1', -0.2) * r['w']
        ty = r['t'] + r['h'] / 2 + val('adj2', 0.6) * r['h']
        cands = [b for b in blocks if b['shape_id'] != sh.shape_id and area(b['rect']) < 40 and b['kind'] == 'shape'
                 and dist_pt_rect(tx, ty, b['rect']) < 4]
        if any(bh['content'] == text for bh in tooltip_behaviors):
            cands = []  # 툴팁 표에서 이미 같은 문구를 붙였으면 중복 생성하지 않음
        if cands:
            a = min(cands, key=lambda b: dist_pt_rect(tx, ty, b['rect']))['rect']
            ar = {'l': a['l'] - 0.3, 't': a['t'] - 0.3, 'w': max(a['w'] + 0.6, 2), 'h': max(a['h'] + 0.6, 3)}
            tooltip_behaviors.append({'kind': 'tooltip', 'trigger': 'hover', 'rect': ar, 'label': '툴팁', 'content': text,
                                      'show_rect': None, 'target_page': None, 'source': 'callout'})
        for b in blocks:
            if b['shape_id'] == sh.shape_id:
                b['inner'] = True
    for h in hotspots:
        for m in blocks:
            if contains(m['rect'], h['rect']) and area(m['rect']) > max(area(h['rect']) * 1.5, 300):
                for b in blocks:
                    if b is not m and contains(m['rect'], b['rect']):
                        b['inner'] = True

    # 그룹 안 핫스팟의 label: 핫스팟 안에 있는 텍스트
    for h in hotspots:
        if h.get('marker') is not None:
            continue
        inside = [b for b in blocks if contains(h['rect'], b['rect'], 0.5) and b['text']]
        if inside:
            h['label'] = min(inside, key=lambda b: area(b['rect']))['text'].split('\n')[0][:40]

    # 캡션: 블록 바로 위의 짧은 한 줄 텍스트
    for b in blocks:
        if b['kind'] == 'row':
            continue
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

    # 목업(핫스팟을 품은 가장 큰 블록) 표시
    for h in hotspots:
        mock = [b for b in blocks if contains(b['rect'], h['rect']) and area(b['rect']) > area(h['rect'])]
        h['mockup'] = max(mock, key=lambda b: area(b['rect']))['id'] if mock else None

    return {
        'index': idx, 'title': title, 'full_title': full_title or title, 'slide_id': slide.slide_id,
        'blocks': [{k: v for k, v in b.items() if k not in ('depth',)} for b in blocks],
        'hotspots': [{k: v for k, v in h.items() if k not in ('shape_id',)} for h in hotspots],
        'nav': nav, 'links': [], 'behaviors': tooltip_behaviors, 'tables': tables,
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
                if h.get('mockup') is None or h.get('marker') is not None:
                    continue
                qm = q['blocks'][h['mockup']]['rect']
                if not any(same_rect(m, qm) for m in mocks):
                    continue
                if any(same_rect(own['rect'], h['rect']) for own in p['hotspots']):
                    continue
                if area(h['rect']) > area(qm) * 0.5:
                    continue
                p['links'].append({'page': q['index'], 'hotspot': h['id'], 'rect': h['rect']})


def number_sections(pages, items_by_page=None):
    """슬라이드 제목으로 목차 번호를 만든다.
    경로형 제목(A > B > C)은 공통 접두 경로를 뗀 뒤, 같은 그룹이 이어지면 N, N.1, N.2 …
    같은 제목이 연속되면(화면 하나를 여러 장에 나눠 설명) 역시 N.1, N.2 …"""
    def segs(t):
        return [x.strip() for x in t.replace('\x0b', ' ').split('>') if x.strip()]
    titled = [segs(p.get('full_title') or p['title']) for p in pages if (p.get('full_title') or p['title']).strip()]
    crumbs = [t for t in titled if len(t) > 1]
    prefix = []
    if crumbs:
        for i in range(min(len(t) for t in crumbs)):
            if all(t[i] == crumbs[0][i] for t in crumbs):
                prefix.append(crumbs[0][i])
            else:
                break
        if any(len(t) - len(prefix) < 1 for t in crumbs):
            prefix = prefix[:-1]
    def rel(t):
        sg = segs(t)
        return sg[len(prefix):] if len(sg) > len(prefix) and sg[:len(prefix)] == prefix else sg
    n = 0; sub = 0
    prev_group = None; prev_title = None
    last = len(pages) - 1
    for p in pages:
        t = (p.get('full_title') or p['title']).replace('\x0b', ' ').strip()
        has_table = any(b['kind'] == 'table' for b in p['blocks'])
        content = bool(p['hotspots']) or has_table or len(p['blocks']) > 8
        if p['index'] == 0 and not has_table:
            p['num'] = ''; p['label'] = '표지'; prev_group = None; prev_title = None; continue
        if not t and not content:
            big = sorted([b for b in p['blocks'] if b['text']], key=lambda b: -area(b['rect']))
            p['num'] = ''; p['label'] = (big[0]['text'].split('\n')[0][:24] if big else f"페이지 {p['index'] + 1}")
            p['kind'] = 'chapter' if (big and p['index'] != last) else 'plain'
            prev_group = None; prev_title = None; continue
        if not t:
            text = ' '.join(b['text'] for b in p['blocks'])
            t = '개정 이력' if ('Version' in text or '변경' in text) else f"페이지 {p['index'] + 1}"
        r = rel(t) or [t]
        group = r[0]
        is_sub = (len(r) >= 2 and group == prev_group) or (t == prev_title)
        if is_sub and n:
            sub += 1
            p['num'] = f'{n}.{sub}'
            if t == prev_title:
                cands = [b['text'].split('\n')[0].strip() for b in p['blocks'] if not b['inner'] and b['text'] and b['kind'] == 'shape'
                         and b['rect']['t'] < 35 and b['rect']['l'] > 30 and 1 < len(b['text'].split('\n')[0].strip()) < 24 and b['text'].split('\n')[0].strip() != p['title']]
                p['label'] = cands[0] if cands else f"{r[-1]} ({sub})"
            else:
                p['label'] = r[-1]
        else:
            n += 1; sub = 0
            p['num'] = str(n)
            p['label'] = ' > '.join(r[-2:]) if len(r) >= 2 else r[-1]
        prev_group = group; prev_title = t


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


def refine_rows(pdf, pages):
    """렌더링된 PDF에서 각 행 첫 칸 텍스트의 y좌표를 찾아 행 블록의 세로 경계를 정확히 맞춘다."""
    try:
        import pymupdf
    except ImportError:
        return
    doc = pymupdf.open(str(pdf))
    for p in pages:
        if p['index'] >= doc.page_count:
            break
        page = doc[p['index']]
        PW, PH = page.rect.width, page.rect.height
        words = [(w[0] / PW * 100, w[1] / PH * 100, w[2] / PW * 100, w[3] / PH * 100, w[4]) for w in page.get_text('words')]
        for t in p['tables']:
            r = t['rect']
            inside = [w for w in words if r['l'] - 0.5 <= w[0] <= r['l'] + t['col0_w'] + 0.5 and r['t'] - 0.5 <= w[1] <= r['t'] + r['h'] + 0.5]
            inside.sort(key=lambda w: w[1])
            ys, used = [], set()
            for row in t['rows']:
                key = row['key'].split()[0] if row['key'] else ''
                hit = next((w for w in inside if id(w) not in used and w[1] > (ys[-1] if ys else -1) and key and w[4].startswith(key[:4])), None)
                if hit is None:
                    ys.append(None)
                    continue
                used.add(id(hit))
                ys.append(hit[1])
            if sum(y is not None for y in ys) < 2 and len(t['rows']) > 1:
                continue
            # 경계: 연속한 텍스트 y의 중간값. 첫 행은 표 상단, 마지막 행은 표 하단
            tops = []
            for i, y in enumerate(ys):
                tops.append(y)
            known = [(i, y) for i, y in enumerate(tops) if y is not None]
            bounds = [None] * (len(tops) + 1)
            bounds[0] = r['t']
            bounds[-1] = r['t'] + r['h']
            # 첫 칸 텍스트는 행 상단에 붙어 있으므로, 행 경계 = 그 텍스트 바로 위
            for (j, y2) in known[1:]:
                bounds[j] = y2 - 0.7
            for i in range(1, len(bounds) - 1):
                if bounds[i] is None:
                    prev = max(k for k in range(i) if bounds[k] is not None)
                    nxt = min(k for k in range(i + 1, len(bounds)) if bounds[k] is not None)
                    bounds[i] = bounds[prev] + (bounds[nxt] - bounds[prev]) * (i - prev) / (nxt - prev)
            for i, row in enumerate(t['rows']):
                blk = p['blocks'][row['block']]
                blk['rect'] = {'l': r['l'], 't': round(bounds[i], 3), 'w': r['w'], 'h': round(max(bounds[i + 1] - bounds[i], 1.0), 3)}


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
    ap.add_argument('--protect', metavar='비밀번호', help='비밀번호로 잠근 단일 index.html로 배포 (원본 data.json·이미지는 work/ 로 이동)')
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
    number_sections(pages, None)

    if not args.no_render:
        with tempfile.TemporaryDirectory() as td:
            pdf = Path(args.pdf) if args.pdf else pptx_to_pdf(pptx_path, Path(td))
            n = render_pages(pdf, outdir)
            refine_rows(pdf, pages)
        if n != len(pages):
            print(f'경고: 슬라이드 {len(pages)}장 vs 렌더링 {n}장 — 숨긴 슬라이드가 있으면 번호가 어긋날 수 있어요', file=sys.stderr)

    data = {
        'title': title, 'slug': slug, 'version': version, 'source': pptx_path.name,
        'generated': date.today().isoformat(), 'aspect': round(SW / SH, 4), 'size': [round(SW / 12700, 2), round(SH / 12700, 2)],
        'pages': [{
            'title': p['title'], 'num': p.get('num', ''), 'label': p.get('label', p['title']), 'kind': p.get('kind', 'page'), 'img': f'p{p["index"] + 1}.jpg',
            'tables': [{'rect': t['rect'], 'role': t['role'], 'cells': t['cells'], 'rows': [r['block'] for r in t['rows']]} for t in p['tables']],
            'blocks': [{'id': b['id'], 'rect': b['rect'], 'text': b['text'], 'caption': b['caption'], 'kind': b['kind'], 'inner': b['inner']} for b in p['blocks']],
            'hotspots': [{'id': h['id'], 'rect': h['rect'], 'label': h['label'], 'targets': h['targets'],
                          **({'marker': h['marker'], 'marker_rect': h['marker_rect']} if h.get('marker') is not None else {})} for h in p['hotspots']],
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
    entry['versions'].append({'version': version, 'date': date.today().isoformat(), 'pages': len(pages), 'protected': bool(args.protect)})
    entry['versions'].sort(key=lambda v: v['date'] + v['version'])
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding='utf-8')

    if args.protect:
        node = shutil.which('node')
        if not node:
            sys.exit('--protect 에는 Node.js가 필요해요 (node 명령을 찾지 못함)')
        subprocess.run([node, str(Path(__file__).resolve().parent / 'protect.mjs'), str(outdir), args.protect], check=True)
        work = Path(args.docs).parent / 'work' / slug / version
        work.mkdir(parents=True, exist_ok=True)
        for f in list(outdir.glob('p*.jpg')) + [outdir / 'data.json']:
            shutil.move(str(f), str(work / f.name))
        print(f'  원본(data.json·이미지)은 {work} 에 두었어요 (git에 올라가지 않음). 동작을 고친 뒤 다시 잠그려면:')
        print(f'  node tools/protect.mjs {work} <비밀번호>  →  생성된 index.html을 {outdir} 로 복사')

    hs = sum(len(p['hotspots']) for p in pages)
    tg = sum(1 for p in pages for h in p['hotspots'] if h['targets'])
    nv = sum(len(p['behaviors']) for p in pages)
    print(f'✓ {outdir}  페이지 {len(pages)}장, 핫스팟 {hs}개(설명 연결 {tg}개), 하이퍼링크 이동 {nv}개')
    print(f'  미리보기: ' + (f'docs/{slug}/{version}/index.html (비밀번호)' if args.protect else f'index.html?doc=docs/{slug}/{version}'))


if __name__ == '__main__':
    main()

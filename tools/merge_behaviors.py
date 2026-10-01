#!/usr/bin/env python3
"""data.json을 다시 생성한 뒤, 이전 data.json의 수동 작성 동작(source=claude)을 페이지 번호 기준으로 되살린다.
사용: python tools/merge_behaviors.py <old data.json> <new data.json>"""
import json, sys
old = json.load(open(sys.argv[1], encoding='utf-8')); new = json.load(open(sys.argv[2], encoding='utf-8'))
n = 0
for i, p in enumerate(new['pages']):
    if i >= len(old['pages']):
        break
    keep = [b for b in old['pages'][i].get('behaviors', []) if b.get('source') not in ('hyperlink', 'tooltip-table', 'callout')]
    have = {(b['kind'], round(b['rect']['l'], 1), round(b['rect']['t'], 1)) for b in p['behaviors']}
    for b in keep:
        if (b['kind'], round(b['rect']['l'], 1), round(b['rect']['t'], 1)) not in have:
            p['behaviors'].append(b); n += 1
json.dump(new, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'동작 {n}개 복원')

#!/usr/bin/env python3
"""inbox/<slug>/<version>/ 에 올라온 기획서(PPTX + PowerPoint PDF)를 docs/ 로 변환한다. (GitHub Actions에서 실행)

inbox/<slug>/<version>/
  meta.json   {"title": "...", "slug": "...", "version": "v0.3"}
  *.pptx      기획서
  *.pdf       PowerPoint에서 내보낸 PDF (스냅샷)
변환이 끝난 폴더는 지운다. 이전 버전이 있으면 doc2proto.py가 자동으로 비교(diff.json)하고 동작 화면을 옮겨 복사한다.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
inbox = ROOT / 'inbox'
ok = fail = 0
for meta_path in sorted(inbox.glob('*/*/meta.json')):
    d = meta_path.parent
    meta = json.loads(meta_path.read_text(encoding='utf-8'))
    pptx = next(iter(sorted(d.glob('*.pptx'))), None)
    pdf = next(iter(sorted(d.glob('*.pdf'))), None)
    if not pptx:
        print(f'✗ {d}: PPTX가 없어요', file=sys.stderr); fail += 1; continue
    cmd = [sys.executable, str(ROOT / 'tools' / 'doc2proto.py'), str(pptx), '--slug', meta['slug'], '--version', meta['version'], '--title', meta['title']]
    if pdf:
        cmd += ['--pdf', str(pdf)]
    print('▶', ' '.join(cmd[1:]), flush=True)
    r = subprocess.run(cmd)
    if r.returncode != 0:
        print(f'✗ {d}: 변환 실패', file=sys.stderr); fail += 1; continue
    shutil.rmtree(d)
    ok += 1
for p in sorted(inbox.glob('*'), reverse=True):   # 빈 폴더 정리
    if p.is_dir() and not any(p.iterdir()):
        p.rmdir()
print(f'완료 {ok}건, 실패 {fail}건')
sys.exit(1 if fail else 0)

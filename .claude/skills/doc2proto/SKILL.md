---
name: doc2proto
description: PPTX 상세기획서를 "스냅샷 + 실제 동작 화면 + Description 연결" 문서(docs/<slug>/<version>)로 만들어 배포한다. "/doc2proto 기획서.pptx", "기획서 배포해줘", "이 기획서대로 동작하게 만들어줘"에 사용.
---

# /doc2proto — 기획서 스냅샷 + 동작 화면 + 연결

인자: `<기획서.pptx> --pdf <PowerPoint에서 내보낸.pdf> [--slug 이름] [--version v0.2]`

원칙: **기획서 원본은 절대 다시 그리지 않는다.** PowerPoint가 내보낸 PDF를 그대로 스냅샷으로 쓰고,
기능은 별도의 동작 화면으로 구현해서 목업 자리에 끼우며, 둘을 Description 번호로 연결한다.

## 1. 스냅샷 + 좌표 (스크립트)

```bash
python tools/doc2proto.py "<기획서.pptx>" --pdf "<PowerPoint에서 내보낸.pdf>" --slug <slug> --version <version> --title "<문서 제목>"
```

- **`--pdf`는 반드시 PowerPoint에서 "PDF로 내보내기"한 파일**을 쓴다. LibreOffice 렌더링은 글꼴·도형이 원본과 달라진다. 사용자에게 PDF를 요청하고, 없으면 Windows에서는 PowerPoint 자동 내보내기를 시도한다.
- 스크립트가 만드는 것: `p1.jpg…`(스냅샷), `data.json` — 페이지 제목·목차 번호, 번호 마커 위치, Description 행과 하위 항목(`1-4.`)의 정확한 사각형(PDF 글자 위치로 보정), 연결선·하이퍼링크에서 나온 기본 동작.
- 결과 요약(핫스팟 n개, 설명 연결 n개)과 목차를 확인한다. 어긋나면 `data.json`의 `num`/`label`을 고치거나 분석 규칙을 보완한다.

## 2. 동작 화면 구현 (Claude)

`docs/<slug>/<version>/live/index.html` — 기획서의 화면을 **실제로 동작하는 웹으로** 만든다. 참고 구현: `docs/후원페이지/v0.1/live/index.html`.

1. **범위 정하기**: 같은 목업이 반복되는 슬라이드 묶음 하나가 하나의 동작 화면이다 (예: 후원페이지 7~23p). 사용자와 범위를 합의한다.
2. **기획서 전부 읽기**: 해당 슬라이드의 Description 행·하위 항목을 하나도 빠짐없이 목록으로 만든다 (`data.json`의 `pages[].rows`). 각 항목이 "무엇을 구현해야 하는지"로 바뀌어야 한다.
3. **크기·위치는 스냅샷과 동일하게**: PPTX에서 목업 틀(프레임)과 각 요소의 pt 좌표를 뽑아(python-pptx, 그룹 좌표 변환 포함) 프레임 기준 절대 위치로 배치한다. 단위는 `calc(n*var(--u))`, `--u = 프레임 폭 / 프레임 pt 폭`. 색은 목업의 색을 그대로 쓴다 (영상 자리도 목업과 같은 회색 + 아주 은은한 움직임 정도).
4. **로직은 기획서 규칙 그대로**: 기본값, 클릭/호버 동작, 상태 전환(모드 간 우선순위·복귀), 표시 규칙(숫자 포맷 등), 갱신 주기, 예외 화면. 근거 없는 기능은 만들지 않고, 기획서에 없는 부분은 "(프로토타입)" 토스트로 표시한다.
5. **연결 표시**: 모든 요소에 `data-spec="페이지:번호"` (여러 개면 공백으로). 번호는 마커 번호(`1-4`) 또는 행 키(`공통`).
6. **상태 프리셋**: `?state=` 로 각 슬라이드가 그리는 상태(메뉴 열림, PIP, 송출 끊김 등)로 시작할 수 있게 한다.
7. **부모 뷰어와 메시지** (참고 구현의 "기획서 연결" 부분을 그대로 쓴다):
   - 보냄: `{d2p:true, type:'spec', refs:[...], label}` — `[data-spec]` 요소 클릭 시
   - 받음: `focus`(ref에 해당하는 요소 반짝임), `inspect`(번호 칩 표시), `event`(이벤트 발생), `state`
8. `live.json` 작성:
   ```json
   {"src": "live/index.html", "size": [732.4, 454.3],
    "frames": [{"page": 8, "rect": {"l":1.32,"t":11.94,"w":76.29,"h":84.13}, "state": "controls"}, …],
    "events": [{"group": "방송 상태", "items": [{"label": "버퍼링", "name": "buffer"}, …]}]}
   ```
   `rect`는 슬라이드 대비 % (목업 틀 그대로), `state`는 그 슬라이드가 그리는 상태.

## 3. 검증

```bash
python -m http.server 8080   # http://localhost:8080/?doc=docs/<slug>/<version>
```

- **스냅샷 대조**: 각 상태의 동작 화면 스크린샷과 스냅샷의 같은 영역을 나란히 놓고 위치·크기·색을 맞춘다 (Playwright + PyMuPDF `clip`).
- **연결 대조**: 2단계에서 만든 Description 항목 목록의 모든 항목이 어떤 요소의 `data-spec`에 있는지 확인한다. 빠진 항목은 구현하거나, 화면이 없는 정책이면 이유를 사용자에게 알린다.
- **동작 대조**: 규칙마다 브라우저 테스트(클릭 → 상태 확인). 모드 간 전환 규칙(예: 영화관 → PIP → 종료 시 영화관 복귀)은 꼭 테스트한다.

## 4. 배포

```bash
git add docs/<slug>/<version> docs/index.json
git commit -m "docs: <문서 제목> <version>"
git push
```

공유 링크: `https://doc2proto.vercel.app/?doc=docs/<slug>/<version>` · 특정 페이지 `#s8` · 특정 마커 `#p=8&h=3`.

## 스냅샷은 반드시 PowerPoint PDF로

LibreOffice로 그리면 맑은 고딕이 없어 다른 글꼴로 바뀌고 글자 위치가 원본과 달라진다. 변환기가 "⚠ 스냅샷 PDF를 만든 프로그램"
경고를 내면 배포하지 말고 기획자에게 PowerPoint에서 내보낸 PDF를 받아 `--pdf`로 다시 돌린다 (새 버전 포함).

## 새 버전이 왔을 때 (변경 사항 표시)

작업자가 "어디가 바뀌었는지" 바로 보게 하는 것이 목적이다.

1. 같은 slug에 새 version으로 1단계를 돌린다. data.json에 슬라이드 고유 id(`sid`)와 도형 서명(`shapes`)이 함께 저장된다.
   이전 버전 data.json에 `sid`가 없으면 먼저 이전 PPTX로 서명만 추가한다:
   `python tools/doc2proto.py <이전.pptx> --slug <slug> --version <이전 버전> --sign-only`
2. 1단계가 이전 버전과 **자동으로 비교**한다 (`tools/doc2diff.py` 실행, `--no-diff`로 끔). 따로 돌리려면 `python tools/doc2diff.py docs/<slug>/<새 버전> --remap-live`
   - `diff.json`: 페이지 짝짓기(sid → 제목·내용 유사도), Description/표 행 추가·수정·삭제(글자 비교 포함), 도형 추가·이동·삭제·글자 변경, 삭제된 페이지, 페이지 번호 대응표(`pagemap`)
   - 새 버전에 동작 화면이 아직 없으면 자동으로 `--remap-live`: 이전 버전 `live/`·`live.json`을 복사하면서 `data-spec="7:3"` 참조와 프레임 페이지 번호를 새 번호로 바꾼다. 삭제된 페이지를 가리키던 참조는 경고로 알려준다
3. 출력된 변경 목록을 보고 **바뀐 기획만** 동작 화면에 반영한다 (예: 시간·옵션 값, 새 버튼/모달, 새 상태 화면 → `live.json` 프레임·이벤트 추가). 삭제된 행을 가리키는 `data-spec`은 지운다.
   동작 화면은 부모가 보내는 `{type:'changed', refs:[...]}` 메시지를 받아 해당 `data-spec` 요소에 `data-chg`를 달고 주황 점선으로 표시해야 한다 (후원페이지 v0.2 live 참고).
4. 손으로 쓴 단순 동작은 `python tools/merge_behaviors.py <이전 data.json> <새 data.json>`로 되살린다.
5. 검증: `?doc=docs/<slug>/<새 버전>` — 변경 요약표, 목차 배지, 각 변경 표시 클릭 시 이전→현재 비교, 겹쳐 보기, 삭제 페이지, 동작 화면 표시. `&diff=0`이면 변경 표시 없이 연다.

주의: 겹쳐 보기는 두 버전 스냅샷을 픽셀로 겹치므로 **같은 프로그램(PowerPoint)으로 PDF를 내보내야** 글꼴 차이가 변경처럼 보이지 않는다. 행·도형 변경 판정은 PPTX 구조로 하므로 렌더러와 무관하다.

## 분석기가 읽는 기획서 관행

- **번호 마커**: 빨간 원 + 숫자(1, 2 / 하위 `1-1`, `1-2` / ①②). Description 표의 같은 번호 행, 행 안의 `1-1.` 단락과 연결된다.
- **페이지 제목**: 슬라이드 상단의 가장 큰 제목 텍스트. 헤더 Page Name은 섹션 이름. 목차는 `A > B`의 A가 같으면 하위 번호로 묶는다.
- **툴팁 표**(머리글 "툴팁") · **말풍선 도형** → hover 툴팁. **빨간 점선 사각형** → 핫스팟. **빨간 연결선**(화살촉 쪽이 도착) → 핫스팟↔설명, 마커→모달 목업이면 팝업. **슬라이드 하이퍼링크** → 화면 이동.

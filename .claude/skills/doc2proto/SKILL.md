---
name: doc2proto
description: PPTX 상세기획서를 인터랙티브 기획서(docs/<slug>/<version>)로 변환해 배포한다. "/doc2proto 기획서.pptx", "기획서 배포해줘", "이 PPT를 프로토타입으로 만들어줘"에 사용.
---

# /doc2proto — PPTX 기획서 → 인터랙티브 기획서 배포

인자: `<기획서.pptx> [--slug 이름] [--version v0.2] [--pdf 내보낸.pdf] [--protect 비밀번호]`

## 흐름

### 1. 구조 변환 (스크립트)

```bash
python tools/doc2proto.py "<기획서.pptx>" --slug <slug> --version <version> --title "<문서 제목>"
```

- slug: 문서를 식별하는 폴더 이름(한글 가능, 공백 없이). 같은 문서의 새 버전은 **같은 slug**에 version만 올린다.
- version: 기획서의 버전 표기를 그대로(v0.1, v0.2 …). 인자가 없으면 사용자에게 묻는다.
- 스크립트가 하는 일: 빨간 점선 도형 → 핫스팟, 연결선의 시작/끝 도형 → 핫스팟↔설명 블록 매핑, 슬라이드 점프 하이퍼링크 → `navigate` 동작, LibreOffice/PowerPoint로 페이지 이미지(`p1.jpg`…) 생성, `data.json` 작성, `docs/index.json` 갱신.
- `python-pptx`, `pymupdf`가 필요하다. LibreOffice도 PowerPoint도 없으면 사용자에게 PowerPoint에서 PDF로 내보내 달라고 하고 `--pdf`로 넘긴다.
- 표는 셀 단위(텍스트·굵기·색·병합·열 너비)로 추출되어 뷰어에서 HTML 표로 다시 그려진다. 목차 번호(3, 4.1 …)는 슬라이드 제목에서 자동으로 매긴다 — 어색하면 `data.json`의 `num`/`label`을 직접 고친다.
- 비밀번호가 필요한 문서는 `--protect <비밀번호>`: 암호화된 단일 `index.html`만 `docs/`에 남고 원본은 `work/<slug>/<version>/`(git 제외)에 둔다. 동작을 고친 뒤에는 `node tools/protect.mjs work/<slug>/<version> <비밀번호>`로 다시 잠그고 생성된 index.html을 docs 쪽으로 복사한다. 비밀번호는 커밋 메시지·문서 어디에도 적지 않는다.
- 다시 돌릴 때 손으로 쓴 동작을 지키려면: 돌리기 전 `data.json`을 복사해 두고 `python tools/merge_behaviors.py <이전> <새>`로 되살린다.
- 출력 요약(핫스팟 n개, 설명 연결 n개)을 확인한다. 설명 연결이 0개면 기획서가 빨간 점선/연결선 관행을 쓰지 않는 것이니, 사용자에게 어떤 표기 규칙을 쓰는지 묻고 `tools/doc2proto.py`의 `is_red`/`line_info` 판정을 조정한다.

### 2. 프로토타입 동작 작성 (Claude)

`docs/<slug>/<version>/data.json`의 각 페이지 `behaviors` 배열을 채운다. 페이지 이미지(`p{n}.jpg`)를 **직접 보고**, `blocks`의 텍스트(디스크립션)를 읽어서 판단한다.

동작 하나의 형식:

```json
{"kind": "tooltip|popup|dropdown|navigate|toggle|input|toast", "trigger": "click|hover",
 "rect": {"l": 28.1, "t": 15.2, "w": 3.3, "h": 5.5},
 "label": "더보기(⋮) 아이콘", "content": "설정 메뉴가 열린다. 크리에이터만 노출.",
 "show_rect": {"l": 36, "t": 18, "w": 22, "h": 46}, "target_page": null, "source": "claude"}
```

- 좌표는 페이지 너비·높이 대비 퍼센트. **`rect`는 `blocks`에 있는 도형 좌표를 그대로 쓴다** — 눈대중으로 만들지 않는다. 아이콘처럼 도형 일부만 가리킬 때만 그 도형 rect를 잘라 쓴다.
- `kind`별 의미
  - `tooltip`: 올리거나 눌렀을 때 뜨는 문구. `content`에 실제 툴팁 문구. 디스크립션에 "툴팁"이라고 적힌 것만.
  - `popup` / `dropdown`: 누르면 뜨는 모달·폼·메뉴. 결과 화면이 같은 페이지에 목업으로 있으면 `show_rect`에 그 블록(그룹) rect를 넣는다. 뷰어가 그 영역을 오려서 띄운다.
  - `navigate`: 다른 화면으로 이동. 문서 안 페이지면 `target_page`(1부터). 스크립트가 하이퍼링크에서 이미 만든 것(`source: "hyperlink"`)은 건드리지 않는다.
  - `toggle`: 스위치·체크·탭. `content`에 ON/OFF의 의미.
  - `input`: 입력창. `content`에 placeholder 또는 글자 수 제한.
  - `toast`: 누르면 하단에 잠깐 뜨는 안내. `content`에 토스트 문구 (예: "복사되었습니다").
- 근거 없는 동작은 만들지 않는다. 디스크립션·화살표에 근거가 있는 것만. 페이지당 12개 이하.
- 어떤 버튼이 어디로 가는지, 팝업이 어느 목업인지 **모호하면 사용자에게 묻는다**. 추측해서 배포하지 않는다.
- 핫스팟이 이미 설명 블록에 연결된 영역은 `behaviors`로 중복하지 않는다 (핫스팟 클릭은 설명 하이라이트가 기본 동작).
- 스크립트가 이미 만든 동작(`source`가 `hyperlink`, `tooltip-table`, `callout`)은 유지하고, 그 위에 추가한다.
- 디스크립션에 "버튼 클릭 시 팝업", "토스트", "[복사] → …", "메뉴로 이동" 같은 서술이 있으면 그 요소의 `rect`(blocks에서 찾기)에 `popup`/`navigate`/`toggle`을 단다. 팝업 목업이 다른 페이지에 있으면 `navigate`로 그 페이지를 가리킨다.

### 3. 미리보기

```bash
python -m http.server 8080
```

`http://localhost:8080/?doc=docs/<slug>/<version>` 을 열어 확인한다. Playwright가 있으면 핫스팟·동작을 자동 클릭해 스크린샷으로 검증한다. 사용자에게도 확인을 받는다.

### 4. 배포

```bash
git add docs/<slug>/<version> docs/index.json
git commit -m "docs: <문서 제목> <version>"
git push
```

Vercel이 `main`을 자동 배포한다. 공유 링크: `https://doc2proto.vercel.app/?doc=docs/<slug>/<version>` (보호 문서는 `https://doc2proto.vercel.app/docs/<slug>/<version>/index.html`) — 특정 페이지는 `#s4`, 특정 마커는 `#p=4&h=1`을 붙인다.

## 수정·재배포

- 기획서가 바뀌면 같은 slug에 새 version으로 1~4를 반복한다. 이전 버전 URL은 그대로 남는다.
- 동작만 고칠 때는 `data.json`의 `behaviors`만 편집하고 커밋한다. 스크립트를 다시 돌리면 `behaviors`가 초기화되니, 다시 돌려야 하면 먼저 기존 `behaviors`를 백업했다가 합친다.

## 기획서 작성 규칙 (분석기가 읽는 관행)

두 가지 스타일을 모두 지원한다. 섞어 써도 된다.

**A. 번호 마커 스타일** (투네이션 스튜디오 기획서)
- **번호 마커**: 빨간 테두리(또는 빨간 채움)의 작은 원에 숫자(1, 2, … 또는 ①②). 마커가 붙어 있는 UI 요소(마커 중심의 오른쪽/아래로 맞닿은 도형)까지 핫스팟으로 확장된다.
- **Description 표**: 첫 칸이 번호인 행 → 같은 번호의 마커와 연결. 행의 세로 위치는 렌더링된 PDF에서 번호 글자 위치로 정확히 잡는다.
- **툴팁 표**: 머리글에 "툴팁"이 있는 표(항목 | 툴팁). 각 행의 항목 이름과 같은 텍스트 도형을 목업에서 찾고, 그 오른쪽의 `?`/`ⓘ` 아이콘에 hover 툴팁을 자동으로 붙인다 (`source: "tooltip-table"`).
- **말풍선 도형**(callout): 꼬리가 가리키는 작은 도형에 hover 툴팁을 붙인다 (`source: "callout"`).
- 슬라이드 제목 개체가 페이지 제목이 된다. 상단에 더 짧은 제목(제목의 뒷부분과 일치)이 있으면 그걸 쓴다.

**B. 점선 핫스팟 + 연결선 스타일** (samples/ 샘플)
- **핫스팟**: 빨간(#E0xxxx 계열) 점선 테두리 사각형, 채움 없음, 텍스트 없음
- **연결선**: 빨간 연결선. 시작을 핫스팟 도형에, 끝을 설명 표·도형·그룹에 **연결점으로 붙인다**(스냅). 화살촉은 끝(설명 쪽)에.
- 시작을 붙이지 않은 연결선은 시작점에서 가장 가까운 도형이 핫스팟이 된다 (예: "투표 만들기" 버튼 → 투표 폼).
- **팝업·폼 목업**은 그룹으로 묶어두면 `show_rect`로 바로 쓸 수 있다.
- **화면 이동**: 도형에 슬라이드 하이퍼링크를 걸면 AI 없이 `navigate`가 된다.
- 헤더 표의 `Page Name` 오른쪽 칸이 페이지 제목이 된다.

**공통**
- 텍스트 없는 큰 도형(화면 틀)과 그룹 안의 도형은 클릭 영역에서 빠지고, 하이라이트 대상으로만 쓰인다.
- 빨간 점선 사각형에 연결선·마커가 없으면(예: 좌측 메뉴의 현재 위치 표시) 설명 없이 위치만 표시한다. 같은 자리에 다른 페이지가 있으면 그 페이지로 가는 링크가 된다.

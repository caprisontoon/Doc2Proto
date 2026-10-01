# Doc2Proto

서비스기획자의 **PPTX 상세기획서를 인터랙티브 기획서**로 바꿔 디자이너·개발자에게 URL로 전달하는 도구.
정적인 문서 대신 클릭해 볼 수 있는 기획서로 기획 의도를 오해 없이 전달하는 것이 목적이다.

- 변환·AI 해석은 **기획자 PC의 Claude Code**에서 (`/doc2proto`), 웹은 정적 뷰어만 → 런타임 API 비용 없음
- 결과는 `docs/<slug>/<version>/`에 커밋 → Vercel 자동 배포 → 버전별 URL, git으로 이력 관리

## 사용 흐름

1. 로컬 Claude Code에서 `/doc2proto 투네이션채팅_v0.2.pptx --slug 투네이션채팅 --version v0.2`
2. 스크립트가 PPTX 구조(핫스팟·연결선·하이퍼링크)를 읽고 페이지 이미지를 만든다
3. Claude가 페이지를 보고 디스크립션을 읽어 툴팁·팝업·드롭다운·이동·토글·입력 동작을 `data.json`에 적는다 (모호하면 묻는다)
4. 로컬 미리보기 → commit/push → `https://doc2proto.vercel.app/?doc=docs/투네이션채팅/v0.2`

뷰어 기능: 핫스팟 클릭 → 디스크립션 하이라이트(반대도 됨), 요소 클릭 → 툴팁/팝업/드롭다운/화면 이동/토글/입력,
인터랙션 모드 / 인쇄 모드, 버전 전환, 딥링크(`#p=6&h=0`), 설명 텍스트 복사.

## 준비물 (기획자 PC)

```bash
pip install python-pptx pymupdf
```

페이지 이미지는 LibreOffice(`soffice`) 또는 Windows PowerPoint로 만든다. 둘 다 없으면 PowerPoint에서 PDF로 내보낸 뒤 `--pdf`로 넘긴다.

## 기획서 작성 규칙 (분석기가 읽는 관행)

| 표기 | 해석 |
|---|---|
| 빨간 점선 사각형 (채움·텍스트 없음) | 핫스팟 (클릭 영역) |
| 빨간 연결선, 시작은 핫스팟·끝은 설명 표/그룹에 스냅 | 핫스팟 → 설명 연결. 화살촉은 설명 쪽 |
| 시작을 붙이지 않은 연결선 | 시작점에서 가장 가까운 도형이 핫스팟 (버튼 → 폼) |
| 도형의 슬라이드 하이퍼링크 | 화면 이동(navigate) 동작 |
| 팝업·폼 목업을 그룹으로 | 팝업 동작의 `show_rect`로 바로 사용 |
| 헤더 표 `Page Name` 오른쪽 칸 | 페이지 제목 |

샘플: `samples/투네이션채팅_상세기획서_샘플.pptx` → `docs/sample/v0.1`

## 구조

| 경로 | 역할 |
|---|---|
| `tools/doc2proto.py` | PPTX 분석 + 렌더링 + `docs/` 출력 (python-pptx, PyMuPDF, LibreOffice) |
| `.claude/skills/doc2proto/SKILL.md` | Claude Code 스킬: 변환 → 동작 작성 → 미리보기 → 배포 |
| `docs/<slug>/<version>/data.json` | 페이지·블록·핫스팟·링크·동작 데이터 (좌표는 %) |
| `docs/index.json` | 문서·버전 목록 (랜딩 페이지가 읽음) |
| `index.html` + `js/main.mjs` | 랜딩(문서 목록) + 문서 로딩 + PDF 빠른 미리보기 |
| `js/app.js` | 뷰어 UI (인터랙션/인쇄 모드, 하이라이트, 동작, 딥링크) |
| `js/analyzer.mjs`, `vendor/pdfjs/` | PDF 빠른 미리보기용 브라우저 분석기 (배포 경로 아님) |

## data.json 동작(behavior) 형식

```json
{"kind": "popup", "trigger": "click",
 "rect": {"l": 28.1, "t": 15.2, "w": 3.3, "h": 5.5},
 "label": "더보기(⋮) 아이콘", "content": "설정 메뉴가 열린다.",
 "show_rect": {"l": 36, "t": 18, "w": 22, "h": 46}, "target_page": null, "source": "claude"}
```

`kind`: `tooltip` · `popup` · `dropdown` · `navigate`(`target_page` 1부터) · `toggle` · `input`

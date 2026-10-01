# Doc2Proto

서비스기획자의 **PPTX 상세기획서**를 디자이너·개발자에게 전달하는 인터랙티브 문서로 만든다.

1. **스냅샷** — PowerPoint가 내보낸 PDF를 그대로 보여준다. 원본은 다시 그리지 않는다.
2. **동작 화면** — 기획서의 화면을 Claude가 실제로 작동하는 웹으로 구현해서 목업 자리에 같은 크기로 끼운다.
3. **연결** — 동작 화면의 요소를 누르면 해당 Description 행/하위 항목이 노랗게 표시되고, 다른 페이지의 관련 기획은 카드로 뜬다. 반대로 Description을 누르면 동작 화면의 요소가 반짝인다.

변환·구현은 기획자 PC의 Claude Code에서(`/doc2proto`), 웹은 정적 파일만 → 런타임 비용 없음.
예시: `docs/후원페이지/v0.1` (7~23p 동작 화면: 플레이어·해상도·설정·PIP·영화관·전체 화면·버퍼링·송출 끊김·방송 종료·오프라인·제재·탈퇴, 시청자 수 표시 규칙, 크리에이터 정보·프로필 모달).

## 사용 흐름

1. 로컬 Claude Code에서 `/doc2proto 후원페이지_v0.2.pptx --pdf 후원페이지_v0.2.pdf --slug 후원페이지 --version v0.2`
2. 스크립트가 스냅샷과 좌표(마커·Description 행·하위 항목)를 만든다
3. Claude가 기획서를 읽고 동작 화면(`live/index.html`)을 구현하고 `data-spec`으로 연결한다 — 모호하면 묻는다
4. 스냅샷 대조·연결 대조·동작 테스트 → commit/push → `https://doc2proto.vercel.app/?doc=docs/후원페이지/v0.2`

뷰어: 한 페이지 스크롤 + 번호 목차(동작 화면이 있는 페이지는 LIVE 표시), 인터랙션 ON/OFF(OFF = 원본 그대로 +
**텍스트 드래그 복사** — PDF의 글자 위치에 투명한 텍스트 층을 겹쳐 알럿 문구·정책 문장을 그대로 가져갈 수 있음),
기획 번호 표시, 이벤트 발생 버튼(버퍼링·송출 끊김·방송 종료·시청자 수…), 표 복사, 동작 화면 기본 상태로 초기화, 버전 전환, 딥링크(`#s8`, `#p=8&h=3`).
**버전 비교**: 새 버전을 열면 이전 버전 대비 변경 요약표(수정·신규·삭제 페이지), 목차 배지, 페이지마다 바뀐 Description 행
(초록 추가·주황 수정·빨강 삭제, 누르면 이전→현재 글자 비교), 추가·이동·삭제된 화면 요소, 삭제된 페이지(회색 스냅샷),
이전 버전과 겹쳐 보기(슬라이더·번갈아 보기)가 나오고, 동작 화면에서도 바뀐 기획 번호가 걸린 요소가 주황 점선으로 표시된다.
같은 slug에 새 버전을 변환하면 이전 버전과 자동으로 비교해 `diff.json`을 만든다.
예시: `docs/후원페이지/v0.2` (`samples/make_v02_test.py`로 만든 테스트 버전).

## 웹에서 올리기·삭제 (메인 페이지)

메인 페이지의 **새 기획서 올리기 / 새 버전 올리기 / 삭제**는 브라우저가 GitHub 저장소에 바로 커밋한다 (서버 없음).
1. 처음 한 번 **GitHub 연결**: Fine-grained token — Repository access `caprisontoon/Doc2Proto`만, Permissions `Contents: Read and write`, `Actions: Read-only`. 토큰은 그 브라우저(localStorage)에만 저장.
2. PPTX + PowerPoint PDF를 올리면 `inbox/<slug>/<version>/`에 들어가고, `.github/workflows/convert.yml`(GitHub Actions)이 `tools/inbox.py`로 변환 → 이전 버전 자동 비교·동작 화면 복사 → `main`에 커밋 → Vercel 재배포 (2~3분). 카드에 "변환 중…" 표시.
3. 삭제는 버전 하나 또는 기획서 전체. 지운 버전을 기준으로 하던 다음 버전의 `diff.json`도 함께 지운다. 저장소 기록에는 남아 되살릴 수 있다.
4. 기능이 바뀐 동작 화면 반영은 로컬 Claude Code(`/doc2proto`)에서.

## 준비물 (기획자 PC)

```bash
pip install python-pptx pymupdf
```

페이지 이미지는 LibreOffice(`soffice`) 또는 Windows PowerPoint로 만든다. 둘 다 없으면 PowerPoint에서 PDF로 내보낸 뒤 `--pdf`로 넘긴다.

## 기획서 작성 규칙 (분석기가 읽는 관행)

| 표기 | 해석 |
|---|---|
| 빨간 테두리 작은 원 + 숫자 (번호 마커) | 마커가 붙은 UI 요소가 핫스팟, Description 표의 같은 번호 행이 설명 |
| 하위 마커 `1-1`, `1-2` … | Description 1번 행 안의 `1-1.` 단락만 하이라이트 |
| 마커 → 빨간 연결선 → 모달 목업 | 마커 클릭 시 그 목업이 팝업으로 뜸 (자동) |
| 상단의 가장 큰 제목 텍스트 | 페이지 제목·목차 (`A > B`의 A가 같으면 하위 번호로 묶음) |
| 머리글에 "툴팁"이 있는 표 (항목 \| 툴팁) | 목업의 항목 옆 `?` 아이콘에 hover 툴팁 자동 생성 |
| 말풍선(callout) 도형 | 꼬리가 가리키는 아이콘의 hover 툴팁 |
| 빨간 점선 사각형 (채움·텍스트 없음) | 핫스팟 (클릭 영역) |
| 빨간 연결선, 시작은 핫스팟·끝은 설명 표/그룹에 스냅 | 핫스팟 → 설명 연결. 화살촉은 설명 쪽 |
| 시작을 붙이지 않은 연결선 | 시작점에서 가장 가까운 도형이 핫스팟 (버튼 → 폼) |
| 도형의 슬라이드 하이퍼링크 | 화면 이동(navigate) 동작 |
| 팝업·폼 목업을 그룹으로 | 팝업 동작의 `show_rect`로 바로 사용 |
| 헤더 표 `Page Name` 오른쪽 칸 | 페이지 제목 |

샘플: `samples/투네이션채팅_상세기획서_샘플.pptx` → `docs/sample/v0.1` (점선+연결선 스타일),
`docs/스트리밍서비스/v0.01` (번호 마커 + 툴팁 표 스타일, 실제 기획서),
`docs/후원페이지/v0.1` (하위 마커 1-1…, 27장, 실제 기획서)

## 구조

| 경로 | 역할 |
|---|---|
| `tools/doc2proto.py` | PPTX 분석(마커·Description 행·하위 항목·연결선·하이퍼링크·목차) + 스냅샷 렌더링 + `docs/` 출력 |
| `js/landing.mjs`, `js/admin.mjs` | 메인 페이지 목록 + 올리기·삭제 (GitHub Git Data API로 커밋) |
| `tools/inbox.py`, `.github/workflows/convert.yml` | 웹에서 올린 기획서를 GitHub Actions에서 변환 |
| `tools/doc2diff.py` | 새 버전 ↔ 이전 버전 비교 → `diff.json` (페이지 짝짓기·행/도형 변경·글자 비교), `--remap-live`로 동작 화면을 새 페이지 번호로 복사 |
| `tools/merge_behaviors.py` | 재생성한 data.json에 이전에 손으로 쓴 동작을 되살림 |
| `.claude/skills/doc2proto/SKILL.md` | Claude Code 스킬: 변환 → 동작 작성 → 미리보기 → 배포 |
| `docs/<slug>/<version>/data.json` | 페이지·블록·핫스팟·링크·동작 데이터 (좌표는 %) |
| `docs/index.json` | 문서·버전 목록 (랜딩 페이지가 읽음) |
| `index.html` + `js/main.mjs` | 랜딩(문서 목록) + 문서 로딩 + PDF 빠른 미리보기 |
| `js/app.js` | 뷰어 (스냅샷, 하이라이트, 동작 화면 iframe 연결, 이벤트, 딥링크) |
| `docs/<slug>/<version>/live/` + `live.json` | 동작 화면과 슬라이드별 배치·초기 상태·이벤트 |
| `js/analyzer.mjs`, `vendor/pdfjs/` | PDF 빠른 미리보기용 브라우저 분석기 (배포 경로 아님) |

## data.json 동작(behavior) 형식

```json
{"kind": "popup", "trigger": "click",
 "rect": {"l": 28.1, "t": 15.2, "w": 3.3, "h": 5.5},
 "label": "더보기(⋮) 아이콘", "content": "설정 메뉴가 열린다.",
 "show_rect": {"l": 36, "t": 18, "w": 22, "h": 46}, "target_page": null, "source": "claude"}
```

`kind`: `tooltip` · `popup` · `dropdown` · `navigate`(`target_page` 1부터) · `toggle` · `input` · `toast`

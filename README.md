# Doc2Proto

서비스기획자의 **PPTX 상세기획서**를 디자이너·개발·QA가 함께 보는 인터랙티브 문서로 만든다.
운영 주소: **https://doc2proto.vercel.app** (`main` 브랜치가 Vercel에 자동 배포)

1. **스냅샷** — PowerPoint가 내보낸 PDF를 그대로 보여준다. 원본은 다시 그리지 않는다.
2. **동작 화면** — 기획서의 화면을 Claude가 실제로 작동하는 웹으로 구현해서 목업 자리에 같은 크기로 끼운다.
3. **연결** — 동작 화면의 요소를 누르면 해당 Description 행·하위 항목이 노랗게 표시되고, 반대로 Description을 누르면 동작 화면의 요소가 반짝인다.
4. **코멘트** — 기획서의 원하는 위치(또는 Description 행)에 문의를 달고 답변·해결 처리, Slack 채널로 알림.

웹은 정적 파일 + 작은 서버리스 함수(Slack 알림) 하나 → 런타임 비용 거의 없음. 동작 화면 구현은 기획자 PC의 Claude Code(`/doc2proto`)에서.

## 배포된 기획서

| 기획서 | 버전 | 동작 화면 |
|---|---|---|
| `docs/후원페이지` | v0.1, v0.2 | 플레이어·해상도·설정·PIP·영화관·전체 화면·버퍼링·송출 끊김·방송 종료·오프라인·제재·탈퇴, 시청자 수 규칙, 프로필 모달 (v0.2는 버전 비교 테스트용) |
| `docs/투네이션-스트리밍-서비스-20260930` | v1.00 | 방송 스튜디오, 채팅(클린봇·투표·차단·팝업 분리), 후원페이지 |
| `docs/리모컨개편-상세기획-20260220` | v0.21 | 클라이언트 리모컨(분할 레이아웃·Dock·프리셋·설정·자석·창 분리), 실행 화면, 후원 리스트 위젯(표/카드 반응형), 기타 위젯 10종, PC 웹·모바일 웹 리모컨 |

## 뷰어 기능

- **목차·이동**: 한 페이지 스크롤 + 번호 목차(동작 화면이 있는 페이지는 LIVE), 왼쪽 메뉴 접기(`[` 키), 딥링크(`#s8`, `#p=8&h=3`, `#c=코멘트id`)
- **인터랙션 ON/OFF**: OFF = 원본 그대로 + **텍스트 드래그 복사**(PDF 글자 위치에 투명 텍스트 층). 사용법은 `?` 툴팁
- **이벤트 버튼**: 동작 화면 묶음(앱)별로 페이지 순서대로 정렬. 누르면 그 상태를 보여주는 대표 페이지로 이동해 실행하고, 같은 앱의 다른 페이지 목록도 띄운다. 이미 그 앱 화면이면 제자리에서 실행
- **기본 상태로 초기화**, 기획 번호 표시, 표 복사, 버전 전환
- **관련 기획**: 왼쪽 메뉴 하단에 다른 페이지의 관련 Description 카드
- **버전 비교**: 새 버전을 열면 이전 버전 대비 변경 요약표, 목차 배지, 바뀐 Description 행(초록 추가·주황 수정·빨강 삭제, 이전→현재 글자 비교), 추가·이동·삭제된 화면 요소, 삭제된 페이지, 이전 버전과 겹쳐 보기(슬라이더·번갈아 보기), 동작 화면의 바뀐 요소 주황 점선
- **코멘트**(오른쪽 사이드 메뉴, `]` 키): 이름만 입력하면 누구나 작성. 핀·스레드·답변·해결/다시 열기·내 코멘트 삭제·링크 복사, 목차 💬 배지, 열림/해결/전체/내 것 필터

## 사용 흐름

**로컬 (동작 화면까지)**
1. Claude Code에서 `/doc2proto 기획서.pptx --pdf 기획서.pdf --slug 이름 --version v0.2`
2. 스크립트가 스냅샷과 좌표(마커·Description 행·하위 항목)를 만든다. 같은 slug의 이전 버전이 있으면 자동으로 비교해 `diff.json`을 만든다
3. Claude가 기획서를 읽고 동작 화면(`live/<앱>/index.html`)을 구현하고 `data-spec`으로 연결한다 — 모호하면 묻는다
4. 스냅샷·연결·동작 테스트 → commit/push → `https://doc2proto.vercel.app/?doc=docs/이름/v0.2`

**웹 (메인 페이지에서 올리기·삭제)** — 브라우저가 GitHub 저장소에 바로 커밋한다
1. 처음 한 번 **GitHub 연결**: Fine-grained token — Repository access `caprisontoon/Doc2Proto`만, Permissions `Contents: Read and write`, `Actions: Read-only`. 토큰은 그 브라우저에만 저장
2. PPTX + PowerPoint PDF를 올리면 `inbox/<slug>/<version>/`에 들어가고, GitHub Actions(`convert.yml` → `tools/inbox.py`)가 변환 → 이전 버전 자동 비교·동작 화면 복사 → `main`에 커밋 → 재배포 (2~3분)
3. 삭제는 버전 하나 또는 기획서 전체 (저장소 기록에는 남아 되살릴 수 있음)
4. 웹으로 올린 기획서는 스냅샷·연결까지만 — **동작 화면은 로컬 Claude Code에서** 추가

> 스냅샷은 꼭 **PowerPoint로 내보낸 PDF**를 쓴다. LibreOffice로 렌더링하면 맑은 고딕이 없어 글꼴·글자 위치가 달라진다(변환 시 경고). 숨긴 슬라이드는 제외된다.

## 코멘트 · Slack 알림 설정

자세한 단계는 [`COMMENTS_SETUP.md`](COMMENTS_SETUP.md).
- 저장소: Google Cloud **Firestore** (`js/comments-config.js`에 공개 식별자, 규칙은 `firestore.rules` — 이름만으로 누구나 작성). 설정이 없거나 `&cdemo=1`이면 데모 모드(그 브라우저에만 저장)
- Slack: Slack Incoming Webhook 주소를 Vercel 환경 변수 `SLACK_WEBHOOK_URL`에 넣고 Redeploy. `api/notify.js`가 Firestore에서 방금 생긴 코멘트인지 확인한 뒤 💬 새 문의 / ↩️ 답변 / ✅ 해결 · 🔁 다시 열림을 보낸다. 알림은 웹훅을 만든 채널의 멤버가 본다
- 사이트는 로그인 없이 공개 — 링크를 받은 사람은 누구나 보고 코멘트를 달 수 있다

## 준비물 (기획자 PC)

```bash
pip install python-pptx pymupdf
```

## 기획서 작성 규칙 (분석기가 읽는 관행)

| 표기 | 해석 |
|---|---|
| 빨간 테두리 작은 원 + 숫자 (번호 마커) | 마커가 붙은 UI 요소가 핫스팟, Description 표의 같은 번호 행이 설명 |
| 하위 마커 `1-1`, `1-2` … | Description 1번 행 안의 `1-1` 단락만 하이라이트 |
| 마커 → 빨간 연결선 → 모달 목업 | 마커 클릭 시 그 목업이 팝업으로 뜸 |
| 상단의 가장 큰 제목 / 헤더 표 `Page Name` 오른쪽 칸 | 페이지 제목·목차 (`A > B`의 A가 같으면 하위 번호로 묶음) |
| 머리글에 "툴팁"이 있는 표 (항목 \| 툴팁) | 목업의 항목 옆 `?` 아이콘에 hover 툴팁 |
| 말풍선(callout) 도형 | 꼬리가 가리키는 아이콘의 hover 툴팁 |
| 빨간 점선 사각형 (채움·텍스트 없음) | 핫스팟 (클릭 영역) |
| 빨간 연결선 (핫스팟 → 설명 표/그룹) | 핫스팟 → 설명 연결 |
| 도형의 슬라이드 하이퍼링크 | 화면 이동(navigate) 동작 |

샘플: `samples/투네이션채팅_상세기획서_샘플.pptx`, `samples/make_v02_test.py`(버전 비교 테스트 PPTX 생성)

## 구조

| 경로 | 역할 |
|---|---|
| `index.html` + `js/main.mjs` | 메인(문서 목록) + 문서 로딩 (data.json·live.json·diff.json) |
| `js/landing.mjs`, `js/admin.mjs` | 메인 페이지 카드 + 올리기·삭제 (GitHub Git Data API) |
| `js/app.js` | 뷰어 (스냅샷, 텍스트 층, 하이라이트, 동작 화면 iframe, 이벤트, 버전 비교, 코멘트, 딥링크) |
| `js/comments.mjs`, `js/comments-config.js`, `vendor/firebase/` | 코멘트 저장소 어댑터 (Firestore / 데모), Firebase SDK 번들 |
| `api/notify.js` | Slack 알림 (Vercel 서버리스 함수) |
| `firestore.rules`, `firebase.json`, `functions/` | Firestore 규칙, (대안) Firebase Functions 알림 |
| `tools/doc2proto.py` | PPTX 분석(마커·Description 행·하위 항목·연결선·하이퍼링크·목차) + 스냅샷 + `docs/` 출력 + 자동 비교 |
| `tools/doc2diff.py` | 버전 비교 → `diff.json`, `--remap-live`로 동작 화면을 새 페이지 번호로 복사 |
| `tools/inbox.py`, `.github/workflows/convert.yml` | 웹에서 올린 기획서를 GitHub Actions에서 변환 |
| `tools/merge_behaviors.py` | 재생성한 data.json에 이전에 손으로 쓴 동작을 되살림 |
| `.claude/skills/doc2proto/SKILL.md` | Claude Code 스킬: 변환 → 동작 화면 → 테스트 → 배포 |
| `docs/index.json` | 문서·버전 목록 |
| `docs/<slug>/<version>/data.json` | 페이지·블록·Description 행·핫스팟·도형 (좌표는 %) |
| `docs/<slug>/<version>/live/<앱>/` + `live.json` | 동작 화면과 페이지별 배치·초기 상태·이벤트 |
| `docs/<slug>/<version>/diff.json` | 이전 버전 대비 변경 내역 |

## live.json 형식 (여러 동작 화면)

```json
{
  "apps": {
    "remote": {
      "title": "클라이언트 리모컨", "src": "live/remote/index.html", "size": [585.3, 356],
      "events": [{ "group": "위젯 동작", "items": [{ "label": "추가 · 뽑기 잔여 수량", "name": "add", "value": "gacha", "page": 21 }] }]
    }
  },
  "frames": [{ "page": 21, "rect": { "l": 7.4, "t": 20.11, "w": 60.97, "h": 65.93 }, "state": "add", "app": "remote" }]
}
```

- `frames`: 페이지마다 동작 화면 위치(슬라이드 기준 %)·초기 상태·앱. iframe은 `?embed=1&state=…`로 열린다
- `events[].items[].page`: 이벤트의 대표 페이지 (현재 페이지가 그 앱이 아니면 그 페이지로 이동해 실행)
- 동작 화면 ↔ 뷰어는 `postMessage({d2p:true, type})` — `spec`(요소 클릭 → Description 표시), `focus`(Description → 요소 반짝임), `event`, `state`, `inspect`, `changed`, `ready`
- 요소 연결은 `data-spec="페이지:항목"` (예: `data-spec="12:4 21:2"`)
- 예전 형식 `{src, events, frames}`(앱 하나)도 그대로 읽는다

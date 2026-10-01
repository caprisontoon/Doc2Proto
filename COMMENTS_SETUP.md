# 코멘트 기능 — Google Cloud 테스트 프로젝트 연결

`feature/comments` 브랜치에서 개발 중이에요. 운영(doc2proto.vercel.app)과는 별개예요.
설정값이 비어 있으면 **데모 모드**(이 브라우저에만 저장)로 동작하고, 아래 설정을 마치면 사내 공용 코멘트가 돼요.

## 1. Google Cloud 프로젝트 만들기
1. https://console.cloud.google.com/projectcreate
2. 프로젝트 이름: `doc2proto-comments-dev` → **만들기**
3. 결제 계정 연결: 탐색 메뉴 → **결제** → 이 프로젝트에 기존 결제 계정 연결
   (Slack 알림 함수(Cloud Functions)에 결제 계정이 필요해요. 사용량은 무료 범위 안이에요.)

## 2. 이 프로젝트에 Firebase 붙이기
1. https://console.firebase.google.com → **프로젝트 추가**
2. **"기존 Google Cloud 프로젝트에 Firebase 추가"** → `doc2proto-comments-dev` 선택
3. Google 애널리틱스는 **사용 안 함**으로 해도 돼요.

## 3. Google 로그인 켜기
1. Firebase 콘솔 → **Authentication** → 시작하기 → 로그인 방법 → **Google** → 사용 설정 → 지원 이메일 선택 → 저장
2. Authentication → **설정** → **승인된 도메인**에 추가
   - `doc2proto.vercel.app`
   - 미리보기 주소 (Vercel → 프로젝트 → Deployments 에서 `feature/comments` 배포의 주소, 예: `doc2proto-git-feature-comments-xxxx.vercel.app`)

## 4. Firestore 만들기
1. Firebase 콘솔 → **Firestore Database** → 데이터베이스 만들기
2. 위치: **asia-northeast3 (서울)**, 모드: **프로덕션 모드**
3. **규칙** 탭 → 저장소의 `firestore.rules` 내용을 붙여넣고 **게시**
   (@toonation.co.kr 계정만 읽고 쓸 수 있게 하는 규칙이에요)

## 5. 웹 앱 설정값 받기
1. Firebase 콘솔 → 프로젝트 설정(⚙) → 일반 → **내 앱** → 웹(`</>`) → 앱 닉네임 `doc2proto` → 등록
2. 나오는 `firebaseConfig`의 `apiKey`, `authDomain`, `projectId`, `appId` 를 Claude에게 전달
   (또는 `js/comments-config.js` 에 직접 입력). 이 값들은 공개돼도 되는 식별자예요.

## 6. Slack 알림 (새 문의·답변·해결)
1. https://api.slack.com/apps → **Create New App** → From scratch → 이름 `Doc2Proto` → 워크스페이스 선택
2. **Incoming Webhooks** → 켜기 → **Add New Webhook to Workspace** → 알림 받을 채널 선택
3. 생성된 웹훅 주소(`https://hooks.slack.com/services/...`)는 **채팅에 붙여넣지 말고** 아래 Cloud Shell 명령에서만 입력하세요.
4. Google Cloud 콘솔 오른쪽 위 **Cloud Shell(>_)** 을 열고:
   ```bash
   git clone -b feature/comments https://github.com/caprisontoon/Doc2Proto.git && cd Doc2Proto
   firebase login --no-localhost        # 안내된 주소로 로그인 후 코드 붙여넣기
   firebase use doc2proto-comments-dev
   firebase functions:secrets:set SLACK_WEBHOOK_URL    # 웹훅 주소 붙여넣기
   (cd functions && npm install)
   firebase deploy --only firestore:rules,functions
   ```
   테스트 중 알림의 링크를 미리보기 주소로 받고 싶으면 배포할 때 `SITE_URL` 값을 물어보면 미리보기 주소를 입력하세요 (기본: 운영 주소).

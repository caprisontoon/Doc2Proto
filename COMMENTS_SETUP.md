# 코멘트 기능 — Google Cloud 테스트 프로젝트 연결

`feature/comments` 브랜치에서 개발 중이에요. 운영(doc2proto.vercel.app)과는 별개예요.
설정값이 비어 있으면 **데모 모드**(이 브라우저에만 저장)로 동작하고, 아래 설정을 마치면 사내 공용 코멘트가 돼요.

## 1. Google Cloud 프로젝트 만들기
1. https://console.cloud.google.com/projectcreate
2. 프로젝트 이름: `doc2proto-16f74` → **만들기**
3. 결제 계정 연결: 탐색 메뉴 → **결제** → 이 프로젝트에 기존 결제 계정 연결
   (Slack 알림 함수(Cloud Functions)에 결제 계정이 필요해요. 사용량은 무료 범위 안이에요.)

## 2. 이 프로젝트에 Firebase 붙이기
1. https://console.firebase.google.com → **프로젝트 추가**
2. **"기존 Google Cloud 프로젝트에 Firebase 추가"** → `doc2proto-16f74` 선택
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
   (권한 없음 — 로그인 없이 이름만 입력하면 누구나 읽고 쓸 수 있는 규칙이에요. Google 로그인 설정은 필요 없어요.)

## 5. 웹 앱 설정값 받기
1. Firebase 콘솔 → 프로젝트 설정(⚙) → 일반 → **내 앱** → 웹(`</>`) → 앱 닉네임 `doc2proto` → 등록
2. 나오는 `firebaseConfig`의 `apiKey`, `authDomain`, `projectId`, `appId` 를 Claude에게 전달
   (또는 `js/comments-config.js` 에 직접 입력). 이 값들은 공개돼도 되는 식별자예요.

## 6. Slack 알림 (새 문의·답변·해결) — Vercel 환경 변수 하나로 끝
알림은 이 사이트의 서버리스 함수 `api/notify.js` 가 보내요. 브라우저는 "방금 무엇이 생겼는지(id)"만 알리고,
함수가 Firestore 에서 그 코멘트를 직접 읽어 **2분 안에 실제로 생긴 것일 때만** 채널에 올려요. 웹훅 주소는 서버에만 있어요.

1. https://api.slack.com/apps → **Create New App** → From scratch → 이름 `Doc2Proto` → 워크스페이스 선택
2. 왼쪽 **Incoming Webhooks** → 켜기 → 아래 **Add New Webhook to Workspace** → 알림 받을 채널 선택 → 허용
3. 생성된 웹훅 주소(`https://hooks.slack.com/services/...`)를 복사 — **채팅이나 저장소에 붙여넣지 마세요**
4. Vercel → 프로젝트 `doc2proto` → **Settings → Environment Variables**
   - Key: `SLACK_WEBHOOK_URL` / Value: 복사한 웹훅 주소 / Environments: Production (미리보기에서도 받으려면 Preview도 체크) → **Save**
5. Vercel → **Deployments** → 맨 위 배포의 `⋯` → **Redeploy** (환경 변수는 다시 배포해야 적용돼요)
6. 기획서에 코멘트를 하나 달아 보면 채널에 알림이 와요.
   - 메시지: 💬 새 문의 / ↩️ 답변 (누구에게) / ✅ 해결 · 🔁 다시 열림 — 기획서 이름·버전·페이지·Description 번호와 바로가기 링크 포함
   - 링크 주소는 코멘트를 단 사이트 주소를 따라가요. 고정하려면 환경 변수 `SITE_URL` 에 `https://doc2proto.vercel.app` 을 넣으세요.
   - 알림을 끄려면 `SLACK_WEBHOOK_URL` 을 지우고 Redeploy.

(대안) Firebase Cloud Functions 로 보내는 방법도 `functions/index.js` 에 있어요 — Blaze 요금제와 Cloud Shell 배포가 필요해서 위 방법을 권장해요.

## 참고: Firebase SDK 번들 다시 만들기
`vendor/firebase/firebase-10.12.2.mjs` 는 필요한 함수만 묶은 파일이에요.
```bash
npm i firebase@10.12.2 esbuild && cat > entry.js <<'X'
export { initializeApp } from 'firebase/app';
export { getAuth, onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
export { getFirestore, collection, query, where, orderBy, onSnapshot, getDoc, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, increment } from 'firebase/firestore';
X
npx esbuild entry.js --bundle --format=esm --minify --target=es2020 --outfile=firebase-10.12.2.mjs
```

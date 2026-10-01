/* 코멘트 기능 설정 — Google Cloud(Firebase) 프로젝트의 웹 앱 설정값을 넣는다.
   비어 있으면 '데모 모드'(이 브라우저에만 저장)로 동작한다. 아래 값은 공개돼도 되는 식별자이며,
   실제 접근 제어는 Firestore 보안 규칙(firestore.rules)이 한다 — Google 계정 누구나 로그인할 수 있지만,
   members 컬렉션(허용 목록)에 이메일이 등록된 사람만 코멘트를 읽고 쓸 수 있다. */
window.D2P_COMMENTS = {
  domain: '',   // 특정 회사 도메인만 로그인시키려면 'toonation.co.kr'
  firebase: {
    apiKey: 'AIzaSyCbFvN7QgRu4ctG595V_H1YAcvF6PTRCNc',
    authDomain: 'doc2proto-16f74.firebaseapp.com',
    projectId: 'doc2proto-16f74',
    appId: '1:336272072448:web:2707a1afb607259e8d1de5',
  },
};

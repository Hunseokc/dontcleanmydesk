# 어질러진 방

마구잡이로 저장하고, 어질러진 책상처럼 흩뿌려 보며 영감을 얻는 아이디어 수집 앱. 개발 초안(2026-10-14)을 따라 웹 우선으로 만들었다.

```
app/     Expo(React Native) + Expo Router — 웹·모바일 공용 클라이언트
server/  Kotlin(Ktor) — 링크 메타데이터, 이미지 프록시, 계정·동기화, 파일 업로드
```

## 실행

```bash
# 서버 (기본 포트 8787, 데이터는 server/data/)
cd server
./gradlew run            # Windows: gradlew.bat run

# 웹 앱
cd app
npm install
npm run web              # http://localhost:8081
```

서버 없이도 앱은 동작한다(로컬 저장, 절차적 썸네일). 서버가 있으면 링크 썸네일·제목과 동기화가 붙는다.
앱이 보는 서버 주소는 `EXPO_PUBLIC_API_URL`(기본 `http://localhost:8787`)이다.

### 서버 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | |
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | H2 파일(`./data/messy-room`, PostgreSQL 모드) | PostgreSQL 은 `jdbc:postgresql://…` |
| `FILES_DIR` | `./data/files` | 미디어 원본·썸네일 (S3 는 `FileStorage` 구현 추가) |
| `CORS_ORIGINS` | `*` | 쉼표 구분, 예: `https://room.example.com` |
| `ALLOW_PRIVATE_FETCH` | `false` | 내부망 URL 가져오기 허용 (개발용) |

사내망처럼 TLS 를 검사하는 프록시 뒤에서는 JVM 이 외부 HTTPS 를 신뢰하지 못해 링크 미리보기가 실패한다.
Windows 라면 `JAVA_OPTS=-Djavax.net.ssl.trustStoreType=Windows-ROOT` 로 OS 인증서 저장소를 쓰게 한다.

## 검사

```bash
cd app && npm run typecheck && npm run lint && npm test     # 방 규칙·분류·ID3 단위 테스트
cd server && ./gradlew test                                  # 동기화 LWW, 인증, 파일, SSRF 차단, OG 파싱
```

## 구조 한눈에

- `app/src/core/room.ts` — 어질러진 방 규칙(밀도 제한, 가중치 랜덤, 상태 유지, 자연 순환, 뒤지기, 침입자). 순수 로직.
- `app/src/desk/` — Skia 책상. 레이어 1~3과 5~6은 한 번 구워 이미지로 쓰고, 매 프레임엔 카드(구김 셰이더 + 따뜻한 그림자)와 나뭇잎 흔들림만 그린다. 웹에서는 이 화면에 들어올 때 CanvasKit 을 지연 로딩한다.
- `app/src/collect/` — 첫 화면(입력 + matter.js 통), 드래그 앤 드롭·붙여넣기·클립보드 링크 제안, 북마클릿·PWA 공유 대상 수신.
- `app/src/thumbs/` — 썸네일 파이프라인(og:image → oEmbed → 영상 프레임 / ID3 커버 → 파형 → 절차적).
- `app/src/themes/` — 테마 매니페스트. 기본 `오후 햇살`, 변형 `아침`·`밤`.
- `app/src/store/` — 로컬 우선 저장(웹 IndexedDB, 모바일 expo-sqlite + 파일), `sync/` 는 서버와 LWW 동기화.

## 아직 안 한 것 (로드맵 7·8단계)

- 모바일 앱화: 공유 시트(Swift / Kotlin), 위젯, 모바일 영상 프레임·파형·재생기·흔들기. 모바일 코드 경로는 타입체크만 통과했고 기기에서 돌려 보지 않았다.
- 생성형 썸네일, 임베딩 기반 "적당히 먼 것" 추천, 다운로드형 테마 팩, 사용자 사진 책상.
- 계정은 이메일 없이 8자리 연결 코드 방식이다. 코드 만료·재발급과 무차별 대입 제한이 필요하다.

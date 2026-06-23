# qr-guard-browser — 작업 계획서 (v2)

## TL;DR (사람이 읽는 요약)

**무엇을 만드나:** QR 사이트 로그인 세션을 살려두는 데스크톱 앱. 평소엔 QR 화면을 **로컬 잠금(금고)** 뒤에 숨겨두고, 직원이 **아이디 + 인증 코드**를 넣으면 설정된 시간(기본 10초) 동안만 QR을 보여준 뒤 자동으로 다시 잠근다. 누가 언제 열었는지 **출입 기록**을 남긴다.

**왜 이 방식인가:** QR 사이트는 일반 iframe 안에서 로그인 쿠키가 막혀 실패했다. Electron은 QR 사이트를 **진짜 Chromium 웹페이지**(자체 영속 세션 보유)로 열고, 그 위에 잠금·설정·로그 레이어를 따로 얹는다.

**핵심 위협 모델 (v2에서 명확화):**
- **숨겨야 하는 것 = 매 주기 새로 갱신되는 QR 코드 이미지 그 자체.**
- **숨길 필요 없는 것 = 로그인 화면, 로그인 세션, QR이 아닌 일반 페이지.** 로그인 화면은 비밀이 아니다.
- QR이 짧은 주기로 갱신되므로 "한 장 캡처되면 끝"의 위험은 낮다(캡처본 유효시간이 제한적). 그래도 0은 아니다.

**v2에서 바뀐 핵심 설계 원칙 — "헷갈리면 무조건 잠근다(fail-safe lock)":**
앱은 화면을 보고 "지금 로그인 화면이냐 / QR 화면이냐"를 스스로 판단한다. 이 판단이 **틀리는 방향**이 중요하다.
- 로그인 화면인데 QR로 오판 → 별일 없음(괜히 인증 한 번 더 요구). **안전한 실패.**
- **QR 화면인데 로그인으로 오판 → 인증 없이 QR 노출. 치명적 실패.**
- 따라서 **"확실히 로그인 화면이라고 적극 판정될 때만" 잠금을 풀고, 애매하거나 모르는 상태(unknown)는 무조건 잠근다.**

**무엇을 하지 않나:** 지역 인증코드는 저장/자동입력/자동잠금해제하지 않는다. QR 사이트 로그인 자격증명은 운영자가 선택한 경우에만 OS 계정에 묶인 `safeStorage` 봉인 파일에 저장하고 로그인 폼에 자동입력할 수 있지만, 자동 제출은 하지 않는다. 리버스 프록시·클라우드 백엔드 없음. 로컬 관리자/리버스 엔지니어에 대한 tamper-proof 보안을 약속하지 않는다(이건 "정직한 사용자의 무심코한 접근"을 막는 운영 통제이지, 작정한 공격을 막는 통제가 아니다).

**최종 산출물 (이번 요구):**
- **macOS용 앱** (`.dmg` 또는 `.zip`)
- **Windows용 앱** (`.exe` Squirrel 설치본)
- 두 플랫폼 모두 빌드하는 방법과 한계를 문서화(코드 서명, 크로스 빌드 제약, CI 매트릭스).

**난이도:** 중 / **위험:** 중 — 가장 불확실한 부분은 실제 QR 사이트의 로그인/로그인완료 URL·title 패턴을 아직 모른다는 점. 그래서 fail-safe 기본값과 수동 폴백 버튼을 둔다.

**다음 행동:** Wave 1(Bootstrap)부터 구현 시작.

---

> TL;DR (machine): Electron + TypeScript. 영속 `persist:qr-site` WebContentsView로 QR 사이트 호스팅. 잠금/설정/로그 control view를 위에 얹음. **잠금 = QR 뷰를 실제로 `setVisible(false)` 처리**(덮기 아님). QR webContents는 `backgroundThrottling:false`로 숨김 상태에서도 갱신 유지. 로그인 감지는 **fail-safe(unknown→lock, 로그인 페이지 이탈 즉시 relock)**. 로컬 salted-hash 인증, brute-force 잠금, idle auto-lock, JSONL 감사 로그. macOS(dmg/zip) + Windows(squirrel) 듀얼 패키징 + GitHub Actions 매트릭스.

---

## 1. 위협 모델 (먼저 합의)

| 구분 | 자산 | 처리 |
| --- | --- | --- |
| **보호 (Protected)** | 현재 유효한, 주기적으로 갱신되는 QR 코드가 화면에 렌더링되는 것 | 인증 없이는 절대 노출 금지 |
| **비보호 (Not protected)** | 로그인 화면, 로그인 세션 쿠키, QR이 아닌 일반 페이지 | 인증 없이 노출 허용 |
| **위협 행위자** | 단말 앞에 앉은 비인가 직원, 어깨너머 관찰자, 화면 공유/원격 데스크톱 | 운영 통제 수준에서 억제 |
| **명시적 비대상** | 로컬 관리자, 리버스 엔지니어, 디스크 직접 접근자 | 막지 못함을 문서화 |

**Fail-safe 방향(설계 불변식):** 앱이 "지금 QR이 보이면 안 되는 상태인지"에 대해 확신이 없으면, **항상 잠금 쪽으로 행동한다.** 노출은 오직 (a) 올바른 인증 성공, 또는 (b) "확실히 로그인 화면"이라고 적극 판정된 경우에만 일어난다.

---

## 2. Scope

### Must have
- 프로젝트 위치: `/Users/inthek/Documents/tele_proj/qr-guard-browser`.
- Electron + TypeScript 앱, 이름 `QR Guard Browser`.
- QR 사이트는 **`WebContentsView`** 로 호스팅(iframe·deprecated `BrowserView` 금지).
- QR 세션은 **`persist:qr-site`** 파티션 사용(앱 재시작에도 로그인 유지).
- QR 뷰에 **`backgroundThrottling: false`** 적용(숨겨진 동안에도 QR 자동 갱신이 멈추지 않도록).
- 잠금/설정/타이머/로그를 위한 별도 control 레이어.
- **잠금 동작은 QR 뷰를 실제로 화면 합성에서 제외**(`setVisible(false)` 또는 bounds 제거). "위에 천을 덮는" 방식 금지(전환 순간 1프레임 누수 방지).
- 첫 실행 설정: QR URL, 관리자 인증 코드, 사용자 1명 이상(아이디+코드), 노출 시간(기본 10초), 로그인 감지 규칙.
- 설정 화면(관리자 인증 필요): QR URL, 노출 시간, 사용자 추가/수정/삭제, 사용자 코드 재설정, 로그인 감지 규칙, QR 세션 초기화.
- 잠금 해제 흐름:
  - 잠금 상태 = QR 숨김 + 아이디/코드 입력.
  - 인증 성공 → 설정 시간 동안 QR 노출, 툴바에 카운트다운 표시.
  - 타이머 만료 → QR을 **reload 없이** 다시 숨김.
  - 수동 잠금 버튼 즉시 동작.
- 로그인-만료 흐름 (**fail-safe**):
  - QR 뷰가 **확실히 로그인 페이지**라고 판정될 때만 `loginMode`로 전환하여 인증 없이 노출.
  - **로그인 페이지에서 이탈하는 네비게이션이 일어나는 즉시 무조건 잠금**(로그인완료 패턴 매칭을 기다리지 않음).
  - 자동 판정이 틀릴 때를 위한 수동 버튼 `로그인 완료 후 잠금`.
  - `unknown`(판정 불가) 상태는 항상 잠금.
- 보안 보강:
  - 인증 코드 **brute-force 방어**(연속 실패 시 점증 지연/일시 잠금).
  - **유휴 자동 잠금**(노출 중 일정 시간 무입력 시 자동 relock; 기본 별도 설정값).
  - production 빌드에서 **DevTools 비활성화**, **single-instance lock**.
- 로컬 감사 로그:
  - 성공 잠금해제 기록(`userId`, `unlockedAt`, `lockedAt`, `durationSeconds`, `reason`, `appVersion`).
  - 사용자별 마지막 성공 잠금해제 시각 표시.
  - 사용자 아이디 필터가 있는 로그 테이블.
  - JSONL/CSV 내보내기.
- 패키징(**이번 핵심 요구 — 두 OS 모두**):
  - macOS: `npm run make`로 `.dmg`(또는 `.zip`) 산출.
  - Windows: `npm run make`로 Squirrel `.exe` 설치본 산출.
  - GitHub Actions 매트릭스(`macos-latest` + `windows-latest`)로 양쪽 자동 빌드.
  - 코드 서명 미적용 시 Gatekeeper(macOS)/SmartScreen(Windows) 경고가 뜬다는 점과 서명 절차를 문서화.

### Must NOT have (가드레일)
- 지역 인증코드 저장/자동입력/자동잠금해제 금지.
- QR 사이트 로그인 자동 제출 금지(저장된 QR 사이트 아이디/비밀번호는 운영자 선택 후 `safeStorage`로 봉인하고 로그인 폼에 자동입력만 허용).
- 실제 QR 사이트에 iframe 사용 금지.
- v1에서 원격 서버/클라우드 DB/리버스 프록시 의존 금지.
- 감사 로그 제거, 타이머 비활성화, 매 잠금마다 QR reload로 잠금을 약화시키는 것 금지.
- tamper-proof 접근 통제를 약속하지 않음.
- **로그인 감지가 애매할 때 노출 쪽으로 기우는 설계 금지(반드시 잠금 쪽).**
- 프로젝트 디렉터리 밖 파일 생성/덮어쓰기 금지(evidence는 프로젝트 내부 `./evidence/`).
- 실제로 해당 OS에서 빌드·실행하지 않은 산출물을 "검증됐다"고 주장 금지.

---

## 3. 아키텍처 & 상세 구현 계획

### 3.1 프로세스 구조
```
┌─────────────────────────── Electron Main Process ───────────────────────────┐
│  app lifecycle · single-instance lock · BaseWindow                           │
│  ┌────────────────────────── BaseWindow (contentView) ──────────────────┐    │
│  │  ┌──────────────────────────┐   ┌──────────────────────────────────┐ │    │
│  │  │  QR WebContentsView       │   │  App Control WebContentsView      │ │    │
│  │  │  - session: persist:qr-site│  │  - 잠금화면/설정/로그/툴바         │ │    │
│  │  │  - backgroundThrottling:F │   │  - contextIsolation:true          │ │    │
│  │  │  - 잠금 시 setVisible(false)│  │  - preload 브리지로만 main과 통신  │ │    │
│  │  └──────────────────────────┘   └──────────────────────────────────┘ │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│  State machine · settings repo · audit log · login detector · auth service    │
└──────────────────────────────────────────────────────────────────────────────┘
```
- **QR 뷰**는 오직 QR 사이트만 로드. 노출 가시성은 main이 `setVisible()`로 제어.
- **Control 뷰**는 항상 위에 존재. 잠금 시 control 뷰가 전체를 덮고 QR 뷰는 `setVisible(false)`로 합성에서 빠짐(이중 안전장치).
- 두 렌더러 모두 `nodeIntegration:false`, `contextIsolation:true`. 앱 API는 좁은 preload(`window.qrGuard.*`)로만 노출.

### 3.2 상태 머신 (fail-safe 핵심)
```
states: needsSetup | locked | unlocked | loginMode | settings

needsSetup --(첫 실행 설정 완료)--> locked

locked --(인증 성공)----------------> unlocked
locked --(QR뷰가 '확실히 로그인페이지'로 판정)--> loginMode
locked --(관리자 인증)--------------> settings

unlocked --(타이머 만료)------------> locked        // QR reload 없음
unlocked --(수동 잠금)--------------> locked
unlocked --(유휴 타임아웃)----------> locked
unlocked --(QR뷰 네비게이션이 로그인페이지로 감)--> loginMode

loginMode --(로그인 페이지에서 '이탈'하는 네비게이션)--> locked   // ★ 즉시. 완료패턴 안 기다림
loginMode --(수동 '로그인 완료 후 잠금')-----------> locked
loginMode --(loginMode 진입 후 하트비트 타임아웃)----> locked   // 보조 안전장치

settings --(닫기)-------------------> locked

* 어떤 상태에서든 판정이 unknown이면 -> locked 로 수렴.
* QR 노출(setVisible true)은 unlocked 또는 (loginMode이면서 현재 URL이 로그인 패턴 매치)일 때만.
```

**QR 노출 가시성 규칙(단일 함수로 강제):**
```
function shouldShowQrView(state, currentUrlMatchesLoginPattern):
    if state == 'unlocked': return true
    if state == 'loginMode' and currentUrlMatchesLoginPattern: return true
    return false   // locked, settings, needsSetup, loginMode(이탈), unknown → 숨김
```
이 함수가 가시성의 **유일한 진입점**. 모든 전환은 이 함수를 다시 평가한다.

### 3.3 로그인 감지 로직 (fail-safe)
입력: 현재 QR webContents의 `url`, `title`. 설정의 규칙: `loginUrlPattern`, `loggedInUrlPattern`(선택), `titleContains`(선택).
```
classify(url, title):
    if matches(url, loginUrlPattern) or contains(title, loginTitleHint):
        return 'login'        // 확실히 로그인 화면
    if matches(url, loggedInUrlPattern):
        return 'loggedIn'     // 확실히 로그인 완료(=QR 영역)
    return 'unknown'          // 모르면 unknown
```
- `loginMode`로 진입하는 조건: `classify == 'login'` (적극 판정).
- `loginMode`에서 빠져나오는 조건: **현재 url이 더 이상 `loginUrlPattern`에 매치되지 않는 네비게이션이 발생** → 즉시 `locked`. (`loggedIn` 패턴 매치를 기다리지 않는다 — 못 잡으면 QR이 새므로.)
- `locked` 상태에서 `loginMode`로 자동 전환은 `classify=='login'`일 때만. `unknown`이면 그대로 `locked` 유지(인증으로만 진입 가능).
- 모든 webContents 이벤트(`did-navigate`, `did-navigate-in-page`, `page-title-updated`)에서 재평가.

### 3.4 폴더 구조 (feature 단위)
```
qr-guard-browser/
├── package.json            # scripts: dev typecheck lint test test:e2e package make
├── forge.config.ts         # makers: dmg/zip(mac) + squirrel(win)
├── tsconfig.json           # strict
├── vite.*.config.ts        # main/preload/renderer
├── src/
│   ├── main/
│   │   ├── index.ts                # app 부트, single-instance, 윈도우/뷰 생성
│   │   ├── views.ts                # QR/Control WebContentsView 구성, setVisible 제어
│   │   ├── ipc.ts                  # ipcMain 핸들러 등록
│   │   └── windows-permissions.ts  # new-window deny, permission 핸들러
│   ├── core/                       # 순수 로직(Vitest 대상, Electron 비의존)
│   │   ├── state-machine.ts        # 상태 전이 + shouldShowQrView
│   │   ├── login-detector.ts       # classify()
│   │   ├── auth.ts                 # scrypt 해시/검증, brute-force 카운터
│   │   ├── settings-repo.ts        # 스키마 + 마이그레이션 + 기본값
│   │   └── audit-log.ts            # JSONL append/read/filter/export
│   ├── preload/
│   │   └── index.ts                # window.qrGuard 좁은 브리지
│   └── renderer/
│       ├── App.tsx
│       ├── lock/LockScreen.tsx
│       ├── settings/SettingsView.tsx
│       ├── logs/AuditLogView.tsx
│       └── toolbar/Toolbar.tsx     # 카운트다운, 수동 잠금, '로그인 완료 후 잠금'
├── fixtures/
│   └── qr-site-server.ts           # /login /dashboard /qr 픽스처 서버
├── e2e/                            # Playwright Electron
├── docs/
│   ├── README.md
│   ├── build-macos.md
│   ├── build-windows.md
│   └── security-limits.md
└── evidence/                       # 검증 출력물(프로젝트 내부)
```

### 3.5 데이터 스키마
**settings.json** (userData, safeStorage로 봉인, 버전드):
```jsonc
{
  "schemaVersion": 2,
  "qrUrl": "https://...",
  "unlockDurationSeconds": 10,
  "idleAutoLockSeconds": 30,
  "loginDetection": { "loginUrlPattern": "", "loggedInUrlPattern": "", "titleContains": "" },
  "admin": { "salt": "...", "hash": "..." },               // scrypt
  "users": [ { "userId": "staff01", "salt": "...", "hash": "...", "lastAuthenticatedAt": "ISO|null" } ]
}
```
- 인증 코드는 평문 저장 금지. **scrypt** 파라미터 명시: `N=2^15, r=8, p=1, keylen=32`, per-record 랜덤 salt 16바이트.
- safeStorage 불가 환경(일부 CI)에서는 결정적 테스트 폴백만 사용(프로덕션 경로와 분리).

**audit log (JSONL, append-only 파일):**
```json
{"userId":"staff01","unlockedAt":"...","lockedAt":"...","durationSeconds":10,"reason":"timer|manual|idle","appVersion":"1.0.0"}
```
- 실패한 인증은 성공 이벤트를 만들지 않는다.
- UI에서 일반 사용자는 로그 편집/삭제 불가. clear/export는 관리자 코드 요구.
- 무결성은 운영 수준임을 `security-limits.md`에 명시(로컬 파일은 외부에서 수정 가능).

### 3.6 IPC API (preload 브리지)
```
window.qrGuard = {
  getState(): StateSnapshot
  onStateChange(cb)
  submitUnlock(userId, code): { ok, errorCode? }        // brute-force 적용
  manualLock()
  manualLoginComplete()                                 // '로그인 완료 후 잠금'
  openSettings(adminCode): { ok }
  saveSettings(patch): { ok, errors? }
  listUsers() / addUser / updateUser / deleteUser / resetUserCode
  clearQrSession(adminCode)
  queryAuditLog(filter) / exportAuditLog(format)
}
```
- 모든 인증성/상태변경 호출은 main에서 검증(렌더러 신뢰 금지).
- 렌더러는 raw hash/salt/내부 경로를 절대 받지 않음.

### 3.7 핵심 기술 결정
- 스캐폴드: **Electron Forge + Vite + TypeScript** 템플릿.
- 렌더러: React + TS(검증 용이). 무겁지 않게 유지.
- 테스트: 순수 로직 **Vitest**, 앱 플로우 **Playwright Electron**.
- 해시: Node `crypto.scrypt`. 별도 네이티브 의존 회피.
- 저장: 평이한 JSON + JSONL(네이티브 DB 의존 회피, 크로스 OS 빌드 단순화).

---

## 4. 검증 전략
> 사람 개입 0 — 모든 검증은 에이전트가 실행.
- 방식: tests-after + state-machine-first. 순수 로직 Vitest, 앱 플로우 Playwright Electron.
- 단위 테스트 대상: scrypt 해시/검증, brute-force 카운터, settings 마이그레이션/기본값, audit append/read/export, **상태 머신 전이**, **login-detector classify + fail-safe(unknown→lock, 이탈→lock)**.
- 앱/e2e 대상: 첫 실행 설정, 잠금→인증→카운트다운→타이머 relock(QR reload 없음 확인), 실패 인증은 잠금 유지+성공 로그 없음, loginMode가 픽스처 로그인 페이지를 인증 없이 노출, 로그인 페이지 이탈 즉시 relock, 수동 `로그인 완료 후 잠금`, 유휴 자동 잠금, 설정 변경 반영.
- **fail-safe 전용 회귀 테스트**: classify가 unknown을 반환하는 픽스처에서 QR이 노출되지 않음을 단언. loginMode 중 QR/대시보드 URL로 네비게이트하면 즉시 잠김을 단언.
- 픽스처 QR 사이트: 프로젝트 내부 로컬 서버. 라우트 `/login` `/dashboard` `/qr`. 쿠키 기반 세션 시뮬레이션 + 만료/유효 강제 토글 + QR 주기 갱신 시뮬레이션.
- 증거 경로(프로젝트 내부): `./evidence/task-1..8.txt`, `./evidence/final.txt`.

---

## 5. 실행 전략

### 병렬 실행 웨이브
- **Wave 1:** Bootstrap, secure shell + QR/Control 뷰, 저장/인증 프리미티브.
- **Wave 2:** 첫 실행/설정 UI, 잠금 타이머+노출 흐름, 상태 머신.
- **Wave 3:** 로그인-만료(fail-safe), 감사 로그/내보내기, 듀얼 패키징 + 최종 QA.

### 의존성 매트릭스
| Todo | Depends on | Blocks | Parallel with |
| --- | --- | --- | --- |
| 1. Bootstrap | none | 2~8 | none |
| 2. Secure shell + QR/Control 뷰 | 1 | 5,6,8 | 3,4 |
| 3. 저장 + scrypt + brute-force | 1 | 4,5,6,7,8 | 2 |
| 4. 첫 실행/설정 UI | 1,3 | 5,6,7,8 | 2 |
| 5. 잠금 타이머 + 노출 흐름 + 상태머신 | 1,2,3,4 | 6,7,8 | none |
| 6. 로그인-만료 fail-safe + idle-lock | 1,2,3,4,5 | 7,8 | none |
| 7. 감사 로그 뷰/내보내기 | 1,3,4,5 | 8 | 6 after 5 |
| 8. 듀얼 패키징(mac+win) + 최종 QA | 1~7 | final | none |

---

## 6. Todos
> 구현 + 테스트 = 하나의 Todo. 분리 금지.

- [ ] **1. Bootstrap — Electron + TS 프로젝트 스캐폴드**
  할 일 / 금지: 대상 경로에 Electron Forge + Vite + TypeScript 스캐폴드. strict TS, ESLint, Vitest, Playwright Electron 설정. scripts: `dev typecheck lint test test:e2e package make`. 소스를 프로젝트 밖에 두지 말 것.
  수용 기준: `npm run typecheck`, `npm run lint`, `npm run test` 모두 exit 0. 출력 `./evidence/task-1.txt`.
  QA: Happy — `npm run dev`가 제목 `QR Guard Browser`의 빈 셸 실행. Failure — 필수 import를 깨뜨려 typecheck 실패 확인 후 복구.
  Commit: chore(scaffold): create Electron TypeScript app shell

- [ ] **2. Secure shell + QR/Control WebContentsView**
  할 일 / 금지: main에서 `contextIsolation:true`, `nodeIntegration:false`, 좁은 preload, remote 모듈 없음. `WebContentsView` 2개(QR/Control). QR은 `session.fromPartition('persist:qr-site')` + **`backgroundThrottling:false`**. 잠금은 QR 뷰 **`setVisible(false)`**(덮기 아님). 예기치 않은 new-window deny, permission 제한. iframe·`BrowserView` 금지.
  수용 기준: QR 파티션명이 `persist:qr-site`임, 렌더러가 Node 글로벌 접근 불가, iframe 미사용을 단언하는 스모크 테스트. `typecheck/lint/test`. 출력 `./evidence/task-2.txt`.
  QA: Happy — Playwright Electron이 픽스처 URL을 QR 뷰에 로드. Failure — 픽스처가 `window.open` 호출 시 앱이 차단/안전 처리.
  Commit: feat(shell): add secure Electron QR browser surface

- [ ] **3. 로컬 저장 + scrypt 해시 + brute-force 방어**
  할 일 / 금지: `app.getPath('userData')`에 버전드 settings 저장. 사용자/관리자 코드는 **scrypt(N=2^15,r=8,p=1,keylen=32, salt 16B)** salted hash. 가능 시 `safeStorage`로 봉인, 테스트는 결정적 폴백. v1→v2 마이그레이션 포함. **연속 실패 brute-force 카운터(점증 지연/일시 잠금)**. 평문 코드 저장 금지.
  수용 기준: Vitest — 기본값, 해시 성공/실패, save/load, v1→v2 마이그레이션, 저장 파일에 평문 코드 없음, brute-force 임계 후 차단/해제. `npm run test -- --run`. 출력 `./evidence/task-3.txt`.
  QA: Happy — `staff01` 저장 후 올바른 코드 통과. Failure — 저장 픽스처에 원문 코드 부재 단언, 오답 N회 후 잠금.
  Commit: feat(storage): add encrypted settings, scrypt hashing, lockout

- [ ] **4. 첫 실행 설정 + 설정 UI**
  할 일 / 금지: 첫 실행 시 QR URL, 관리자 코드, 사용자 1명+, 노출 시간(기본 10s), 유휴 자동잠금 시간, 로그인 감지 규칙 입력. 설정 진입은 관리자 인증 필요. QR URL/사용자 CRUD/코드 재설정/노출·유휴 시간/로그인 패턴/QR 세션 초기화. raw hash·내부 경로 노출 금지.
  수용 기준: 검증 에러(URL/사용자/관리자 코드 누락), 저장, 관리자 인증 필요, 코드 재설정이 hash 갱신, 노출 시간 ≥1s. `npm run test`. 출력 `./evidence/task-4.txt`.
  QA: Happy — Playwright 첫 실행 여정이 URL+사용자 생성 후 잠금 화면 도달. Failure — 틀린 관리자 코드로 설정 진입 차단.
  Commit: feat(settings): add first-run setup and admin settings

- [ ] **5. 상태 머신 + 잠금 타이머 + 노출 흐름**
  할 일 / 금지: 상태 `needsSetup|locked|unlocked|loginMode|settings`. **가시성은 `shouldShowQrView()` 단일 함수로만 제어.** 올바른 인증 → `unlockDurationSeconds` 노출 후 **reload 없이** relock. 실패 코드는 잠금 유지+성공 로그 없음. 성공 시 감사 이벤트+`lastAuthenticatedAt` 갱신. 잠금 시 QR webContents/쿠키 파괴 금지.
  수용 기준: 단위 — 오답/정답/타이머만료/수동잠금/QR세션 보존 전이. e2e — 카운트다운 가시 + 단축 시간 relock + QR reload 없음. `npm run test`,`npm run test:e2e`. 출력 `./evidence/task-5.txt`.
  QA: Happy — 잠금 토글·카운트다운 만료 동안 픽스처 QR 페이지 유지. Failure — 오답이 QR 노출/성공로그 미생성.
  Commit: feat(lock): add timed unlock flow with single visibility gate

- [ ] **6. 로그인-만료 fail-safe + 유휴 자동 잠금**
  할 일 / 금지: `classify(url,title)`로 `login|loggedIn|unknown` 판정. **`login`일 때만 `loginMode` 진입**(인증 없이 로그인 화면 노출). **로그인 패턴 이탈 네비게이션 즉시 relock**(완료 패턴 대기 금지). `unknown`은 항상 locked. loginMode 하트비트 타임아웃. 수동 `로그인 완료 후 잠금`. **유휴 자동 잠금**(무입력 시 relock). 자격증명 저장/주입 금지.
  수용 기준: 단위 — login/loggedIn/title 매치, **unknown→lock**, **loginMode 중 이탈→즉시 lock**, 수동 완료 relock, 유휴 타임아웃 relock. e2e — `/login`에서 인증 없이 노출 → `/qr`로 이동 시 즉시 relock. `npm run test`,`npm run test:e2e`. 출력 `./evidence/task-6.txt`.
  QA: Happy — 픽스처 로그인 페이지 인증 없이 노출, 이탈 시 relock. Failure — 자동 패턴 비활성 시 수동 버튼이 relock.
  Commit: feat(auth-state): add fail-safe login-mode and idle lock

- [ ] **7. 감사 로그 뷰 + 마지막 인증 표시 + 내보내기**
  할 일 / 금지: userData에 append-only JSONL. 성공 이벤트+잠금 사유 저장. 설정 내 로그 테이블(사용자 필터)+사용자별 마지막 성공 시각. CSV/JSONL 내보내기. 일반 사용자 편집/삭제 불가, clear/export는 관리자 코드 요구.
  수용 기준: 단위 — append/read/filter/마지막인증 도출/깨진 라인 스킵·보고/내보내기. e2e — 두 사용자로 2회 잠금해제 후 마지막인증 갱신. `npm run test`,`npm run test:e2e`. 출력 `./evidence/task-7.txt`.
  QA: Happy — 성공 잠금해제가 테이블+내보내기 파일에 출현. Failure — 실패 인증은 성공 이벤트 미생성.
  Commit: feat(audit): add local unlock history

- [ ] **8. 듀얼 패키징(macOS + Windows) + 운영 문서 + 최종 QA**
  할 일 / 금지: `forge.config.ts`에 makers 구성 — macOS `@electron-forge/maker-dmg`(+ `maker-zip` 폴백), Windows `@electron-forge/maker-squirrel`. `.github/workflows/build.yml`에 `macos-latest`+`windows-latest` 매트릭스로 `npm run make` 실행, 산출물 artifact 업로드. `docs/README.md`(설치·첫설정·운영), `docs/build-macos.md`, `docs/build-windows.md`(크로스 빌드 한계: mac에서 win exe 빌드 제약/win에서 dmg 빌드 불가, 그래서 CI 매트릭스 사용), `docs/security-limits.md`(로컬 통제 한계, 로그 무결성, 코드 서명 미적용 시 Gatekeeper/SmartScreen 경고). 실제 빌드·실행 안 한 산출물을 검증됐다고 주장 금지.
  수용 기준: `typecheck/lint/test/test:e2e/package` 통과. 현재 OS에서 `npm run make` 성공(산출물 경로 기록). 타 OS는 CI 매트릭스 빌드로 충당하고, 로컬에서 미생성된 플랫폼은 "CI에서 빌드/미검증"을 evidence와 docs에 정확히 기록. 출력 `./evidence/task-8.txt`.
  QA: Happy — 패키지 앱이 첫설정→잠금해제→relock→loginMode→설정 여정 완료. Failure — QR 세션 초기화 후 loginMode 진입, 픽스처 로그인 뒤 relock.
  Commit: chore(package): add macOS + Windows packaging and operator docs

---

## 7. 최종 검증 웨이브
> 모든 Todo 후 병렬 실행. 전원 APPROVE 필요. 결과를 사용자에게 보고하고 명시적 동의 전 "완료" 선언 금지.
- [ ] **F1. 계획 준수 감사** — 모든 Must have 구현/문서화, 모든 Must NOT have 준수, 프로젝트 경로 정확. 증거 `./evidence/final.txt`.
- [ ] **F2. 코드 품질/보안 자세** — `nodeIntegration` 없음, `contextIsolation` on, preload 좁음, QR 자격증명 미저장, QR iframe 없음, 평문 코드 없음, **fail-safe 불변식(unknown→lock, loginMode 이탈→lock, 가시성 단일 게이트) 코드로 확인**. 증거 `./evidence/final.txt`.
- [ ] **F3. 실제 수동 QA** — 첫설정, 설정 진입, 실패 잠금해제, 성공 잠금해제, 타이머 relock, 유휴 relock, 로그인-만료 픽스처, 로그인 이탈 즉시 relock, 감사 로그 표시/내보내기. 스크린샷/트레이스 캡처. 증거 `./evidence/final.txt`.
- [ ] **F4. 패키징 충실도** — macOS·Windows makers 구성 존재, CI 매트릭스 동작, 로컬에서 실제 빌드된 플랫폼만 "검증됨"으로 표기, 미빌드 플랫폼은 정확히 표기. 리버스 프록시·자격증명 자동화·클라우드 없음. 증거 `./evidence/final.txt`.

---

## 8. 커밋 전략
- 모든 Todo 통과 후 최종 커밋 1회(사용자가 분할 요청 시 분할).
- 제안 메시지: `feat: add QR guard Electron browser (macOS + Windows)`
- 스테이징은 프로젝트 디렉터리로 한정. 무관 파일 금지.

## 9. 성공 기준
- `/Users/inthek/Documents/tele_proj/qr-guard-browser`에 Electron 앱 존재.
- QR 사이트를 iframe 아닌 최상위 Chromium 페이지로 호스팅, `persist:qr-site` 세션이 잠금/재시작에도 유지.
- 잠금 상태는 QR을 실제로 숨김(`setVisible(false)`), 인증 성공 시 설정 시간만 노출 후 reload 없이 relock.
- **fail-safe**: 로그인 화면만 인증 없이 노출, 로그인 페이지 이탈 즉시 relock, unknown 상태는 잠금.
- backgroundThrottling 비활성으로 숨김 중에도 QR 갱신 유지(잠금 해제 시 stale QR 없음).
- brute-force 잠금, 유휴 자동 잠금 동작.
- 설정으로 QR URL/사용자/코드/노출·유휴 시간/로그인 규칙 관리.
- 감사 로그가 성공 잠금해제를 기록하고 사용자별 마지막 시각 표시.
- 테스트·e2e·fail-safe 회귀 통과.
- **macOS `.dmg`(또는 `.zip`)와 Windows `.exe` 두 산출물이** 로컬 또는 CI 매트릭스로 빌드되고, 각 플랫폼의 검증 상태가 정확히 문서화됨.

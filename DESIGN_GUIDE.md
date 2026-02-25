# 독바(DogBa) 디자인 가이드 v1

> **NOTE**: ART_DIRECTION_GUIDE.md가 디자인의 최종 기준입니다.
> 본 문서와 충돌 시 ART_DIRECTION_GUIDE의 Neo-Brutalist 방향이 우선합니다.

> 캐릭터 기반 비주얼 시스템 — "귀여운 동물 친구들의 사무실"

---

## 1. 디자인 철학

### 1.1 핵심 원칙
- **Neo-Brutal Friendly**: 굵은 검은 테두리와 솔리드 섀도우로 팝아트 감성을 만들되, 캐릭터의 친근함을 유지
- **Bold & Clear**: 두꺼운 보더(border-2~4 border-black)와 하드 섀도우(shadow-[4px_4px_0_0_#000])로 UI 요소를 명확히 구분
- **Readable Cuteness**: 장식이 정보를 가리지 않아야 함 — 가독성 우선, Neo-Brutal 스타일이 콘텐츠를 보강

### 1.2 무드보드 키워드
```
네오 브루탈리즘 / 팝아트 / 굵은 테두리 / 솔리드 섀도우 / 비비드 파스텔 /
플랫 컬러 / 치비 캐릭터 / 오피스 / 장난감 같은 / 힐링 타이쿤
```

### 1.3 절대 하지 않는 것
- ❌ 네온 컬러 / 사이버펑크 톤
- ❌ 번지는(Blurry) 부드러운 그림자 (솔리드 블랙 섀도우만 사용)
- ❌ 그라데이션 배경 (플랫 단색 기반)
- ❌ 테두리 없는 UI 요소 (모든 컴포넌트에 검은 보더 적용)
- ❌ 성인/폭력적 이미지

---

## 2. 컬러 시스템

### 2.1 메인 팔레트

```css
:root {
  /* Primary — 따뜻한 크림 기반 */
  --color-cream-50:  #FFF9F0;   /* 배경 (라이트 모드) */
  --color-cream-100: #FFF3E0;   /* 카드 배경 */
  --color-cream-200: #FFE8CC;   /* 호버 상태 */
  --color-cream-300: #FFD9A8;   /* 활성 상태 */
  
  /* Secondary — 부드러운 브라운 */
  --color-brown-400: #D4A574;   /* 보조 텍스트 */
  --color-brown-500: #B8886E;   /* 아이콘 */
  --color-brown-600: #8B6F5E;   /* 제목 */
  --color-brown-700: #5D4E42;   /* 본문 텍스트 */
  --color-brown-800: #3E342D;   /* 강조 텍스트 */
  --color-brown-900: #2A231E;   /* 최강조 */

  /* Accent — 캐릭터 컬러에서 추출 */
  --color-pink:    #FFB5B5;     /* 햄스터 핑크 — CTA, 알림 */
  --color-gray:    #A0AEC0;     /* 너구리 그레이 — 코드, 기술 요소 */
  --color-amber:   #F6C67C;     /* 고양이 앰버 — 경고, 하이라이트 */
  --color-lavender:#D6BCFA;     /* 토끼 라벤더 — 정보, 힌트 */
  --color-blue:    #90CDF4;     /* 펭귄 블루 — 성공, 완료 */
  --color-peach:   #FEB2B2;     /* 여우 피치 — 디자인, 창의 */
  
  /* Status */
  --color-success: #9AE6B4;     /* 성공 — 민트 그린 */
  --color-error:   #FEB2B2;     /* 에러 — 소프트 레드 */
  --color-warning: #FEFCBF;     /* 경고 — 크림 옐로우 */
  --color-info:    #BEE3F8;     /* 정보 — 스카이 블루 */
  --color-running: #C4B5FD;     /* 진행 중 — 소프트 퍼플 */
  
  /* Dark Mode Overrides */
  --dark-bg:       #1A1612;     /* 다크 모드 배경 — 따뜻한 차콜 */
  --dark-surface:  #2D2520;     /* 다크 모드 카드 */
  --dark-border:   #4A3F36;     /* 다크 모드 보더 */
  --dark-text:     #E8DDD4;     /* 다크 모드 텍스트 */
}
```

### 2.2 캐릭터별 테마 컬러

| 캐릭터 | Primary | Light | Dark | 용도 |
|--------|---------|-------|------|------|
| 뭉치 (햄스터) | #FFB5B5 | #FFE4E1 | #C53030 | PM 관련 UI, CTA |
| 라쿠 (너구리) | #A0AEC0 | #E2E8F0 | #4A5568 | 코드, 터미널 영역 |
| 나비 (고양이) | #F6C67C | #FEEBC8 | #C05621 | QA, 경고, 테스트 |
| 토토 (토끼) | #D6BCFA | #E9D8FD | #6B46C1 | 아키텍처, 구조 |
| 펭 (펭귄) | #90CDF4 | #BEE3F8 | #2B6CB0 | Export, 완료 |
| 여우 | #FEB2B2 | #FED7D7 | #C53030 | 디자인, 창의 |

### 2.3 Neo-Brutal 색상 사용 원칙

```css
/*
 * Neo-Brutalism: 그라데이션 금지. 플랫 단색만 사용.
 * ART_DIRECTION_GUIDE.md 참조: "그라데이션 절대 금지(Flat 100%)"
 *
 * 대신 비비드/파스텔 단색으로 구분:
 *   - CTA: #FFD100 (비비드 옐로우)
 *   - 성공: #22C55E (비비드 그린)
 *   - 위험: #FF6B6B (비비드 레드)
 *   - 보조: #A78BFA (비비드 퍼플)
 *   - 정보: #60A5FA (비비드 블루)
 *   - 민트: #9DE5DC (소프트 민트)
 *
 * 모든 색상 패널에 border-4 border-black + shadow-[4px_4px_0_0_#000] 적용
 */
```

---

## 3. 타이포그래피

### 3.1 폰트 스택

```css
:root {
  /* 디스플레이 — 제목, 캐릭터 이름, 말풍선 */
  --font-display: 'Pretendard Variable', 'Pretendard', -apple-system, sans-serif;
  
  /* 본문 — 문서, 설명, UI 텍스트 */
  --font-body: 'Pretendard Variable', 'Pretendard', -apple-system, sans-serif;
  
  /* 코드 — 터미널, 코드 블록, 로그 */
  --font-code: 'JetBrains Mono', 'D2Coding', 'Consolas', monospace;
  
  /* 대안: 영문 전용 디스플레이 */
  --font-display-en: 'Nunito', 'Quicksand', sans-serif;
}
```

### 3.2 크기 체계

| 토큰 | 크기 | 용도 |
|------|------|------|
| --text-xs | 11px / 0.6875rem | 캡션, 타임스탬프 |
| --text-sm | 13px / 0.8125rem | 보조 텍스트, 뱃지 |
| --text-base | 15px / 0.9375rem | 본문 |
| --text-lg | 17px / 1.0625rem | 강조 본문 |
| --text-xl | 20px / 1.25rem | 소제목 |
| --text-2xl | 24px / 1.5rem | 제목 |
| --text-3xl | 30px / 1.875rem | 페이지 타이틀 |
| --text-4xl | 36px / 2.25rem | 히어로 |

### 3.3 텍스트 스타일

| 요소 | 폰트 | 크기 | 무게 | 행간 |
|------|------|------|------|------|
| H1 (페이지 타이틀) | Display | 30px | 700 | 1.3 |
| H2 (섹션 타이틀) | Display | 24px | 600 | 1.3 |
| H3 (서브 타이틀) | Display | 20px | 600 | 1.4 |
| Body | Body | 15px | 400 | 1.6 |
| Body Bold | Body | 15px | 600 | 1.6 |
| Caption | Body | 11px | 400 | 1.4 |
| Code | Code | 14px | 400 | 1.5 |
| 말풍선 | Display | 13px | 500 | 1.4 |

---

## 4. 아이콘 & 그래픽 시스템

### 4.1 아이콘 스타일
- **스타일**: 라운드 아웃라인 (Phosphor Icons "Regular" 또는 Lucide)
- **크기**: 16px(소) / 20px(기본) / 24px(대)
- **스트로크**: 1.5px (캐릭터 아웃라인 두께와 조화)
- **컬러**: `--color-brown-500` (기본), 캐릭터 컬러(강조)

### 4.2 상태 아이콘 (에이전트용)

| 상태 | 아이콘 | 컬러 |
|------|--------|------|
| Idle | ☕ 커피잔 | brown-400 |
| Ingesting | 📖 책 | lavender |
| Planning | 💭 생각 구름 | lavender |
| Drafting | ✏️ 연필 | amber |
| Reviewing | 🔍 돋보기 | amber |
| Asking | ❓ 물음표 | pink |
| Testing | 🧪 시험관 | blue |
| Success | ✨ 별 | success |
| Error | 💢 짜증 | error |
| Exporting | 📦 박스 | blue |

### 4.3 일러스트레이션 가이드
- **빈 상태 일러스트**: 캐릭터가 해당 상황을 연기
  - 빈 프로젝트: 뭉치가 책상에서 기지개
  - 로딩: 라쿠가 타이핑 중
  - 에러: 나비가 당황한 표정
  - 성공: 전원이 점프 축하
- **스타일**: 첨부 캐릭터와 동일 (치비, 두꺼운 아웃라인, 파스텔 톤)
- **크기**: 최대 200×200px (빈 상태), 64×64px (인라인)

---

## 5. 컴포넌트 디자인

### 5.1 카드 (Neo-Brutal)

```css
.card {
  background: white;
  border: 4px solid #000000;
  border-radius: 16px;              /* rounded-2xl (Artience Guide) */
  padding: 20px;
  box-shadow: 6px 6px 0 0 #000000;  /* 솔리드 블랙 섀도우 */
  transition: all 0.2s ease;
}
.card:hover {
  transform: translateY(-4px);
  box-shadow: 8px 8px 0 0 #000000;
}

/* 프로젝트 카드 — 캐릭터 아바타 포함 */
.project-card {
  position: relative;
}
.project-card .avatar-stack {
  display: flex;
  margin-left: -8px;  /* 겹침 효과 */
}
.project-card .avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--color-cream-50);
}
```

### 5.2 버튼 (Neo-Brutal)

```css
/* Primary — CTA (Neo-Brutalism) */
.btn-primary {
  background: #FFD100;              /* 비비드 옐로우 */
  color: #000000;
  border: 4px solid #000000;
  border-radius: 8px;               /* rounded-lg (Artience Guide) */
  padding: 12px 24px;
  font-weight: 800;                 /* font-black */
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 4px 4px 0 0 #000000;  /* 솔리드 블랙 섀도우 */
  text-transform: uppercase;
}
.btn-primary:hover {
  transform: translateY(-4px);
  box-shadow: 6px 6px 0 0 #000000;
}
.btn-primary:active {
  transform: translateY(4px);
  box-shadow: none;
}

/* Secondary (Neo-Brutal) */
.btn-secondary {
  background: white;
  color: #000000;
  border: 4px solid #000000;
  border-radius: 8px;
  padding: 10px 20px;
  font-weight: 600;
  box-shadow: 4px 4px 0 0 #000000;
}
.btn-secondary:hover {
  transform: translateY(-4px);
  box-shadow: 6px 6px 0 0 #000000;
}
.btn-secondary:active {
  transform: translateY(4px);
  box-shadow: none;
}

/* Ghost (Minimal) */
.btn-ghost {
  background: transparent;
  color: #000000;
  border: 2px solid #000000;
  border-radius: 8px;
  padding: 8px 16px;
  font-weight: 600;
}
.btn-ghost:hover {
  background: #F5F5F5;
}

/* Icon Button (Neo-Brutal, 44x44 터치 타겟) */
.btn-icon {
  width: 44px;
  height: 44px;
  border: 4px solid #000000;
  border-radius: 8px;
  box-shadow: 4px 4px 0 0 #000000;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### 5.3 입력 필드

```css
.input {
  background: white;
  border: 2px solid var(--color-cream-200);
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 15px;
  color: var(--color-brown-700);
  transition: border-color 0.2s;
}
.input:focus {
  outline: none;
  border-color: var(--color-pink);
  box-shadow: 0 0 0 3px rgba(255, 181, 181, 0.2);
}
.input::placeholder {
  color: var(--color-brown-400);
}

/* 텍스트에어리어 */
.textarea {
  min-height: 100px;
  resize: vertical;
}

/* 채팅 입력 */
.chat-input {
  border-radius: 24px;
  padding: 12px 20px;
  padding-right: 48px; /* 전송 버튼 공간 */
}
```

### 5.4 말풍선 (Speech Bubble)

```css
.speech-bubble {
  position: absolute;
  background: white;
  border: 2px solid var(--color-brown-600);
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-brown-700);
  max-width: 180px;
  line-height: 1.4;
  
  /* 꼬리 */
  &::after {
    content: '';
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 8px solid white;
  }
  &::before {
    content: '';
    position: absolute;
    bottom: -10px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 9px solid transparent;
    border-right: 9px solid transparent;
    border-top: 9px solid var(--color-brown-600);
  }
}

/* Asking 상태 — 깜빡이는 효과 */
.speech-bubble.asking {
  border-color: var(--color-pink);
  animation: bubble-pulse 2s ease-in-out infinite;
}

@keyframes bubble-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 181, 181, 0); }
  50% { box-shadow: 0 0 0 6px rgba(255, 181, 181, 0.3); }
}
```

### 5.5 뱃지 & 태그

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}
.badge-success { background: #E6FFFA; color: #234E52; }
.badge-error   { background: #FFF5F5; color: #C53030; }
.badge-warning { background: #FFFFF0; color: #975A16; }
.badge-info    { background: #EBF8FF; color: #2B6CB0; }
.badge-running { background: #FAF5FF; color: #6B46C1; }

/* 캐릭터 역할 태그 */
.role-tag {
  border-radius: 20px;
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.role-pm       { background: #FFE4E1; color: #C53030; }
.role-dev      { background: #E2E8F0; color: #4A5568; }
.role-qa       { background: #FEEBC8; color: #C05621; }
.role-arch     { background: #E9D8FD; color: #6B46C1; }
.role-release  { background: #BEE3F8; color: #2B6CB0; }
.role-ux       { background: #FED7D7; color: #C53030; }
```

### 5.6 프로그레스 바

```css
.progress-bar {
  height: 8px;
  background: var(--color-cream-200);
  border-radius: 4px;
  overflow: hidden;
}
.progress-bar .fill {
  height: 100%;
  background: linear-gradient(90deg, #FFB5B5, #F6C67C, #90CDF4);
  border-radius: 4px;
  transition: width 0.5s ease;
}

/* 스텝 프로그레스 (타임라인) */
.step-progress {
  display: flex;
  align-items: center;
  gap: 0;
}
.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.step .dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--color-cream-300);
  background: white;
}
.step.active .dot {
  background: var(--color-pink);
  border-color: var(--color-pink);
  animation: step-pulse 1.5s ease-in-out infinite;
}
.step.completed .dot {
  background: var(--color-success);
  border-color: var(--color-success);
}
.step-line {
  flex: 1;
  height: 2px;
  background: var(--color-cream-300);
}
.step-line.completed {
  background: var(--color-success);
}
```

---

## 6. 모션 & 인터랙션

### 6.1 이징 함수

```css
:root {
  --ease-out-soft: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-gentle: cubic-bezier(0.4, 0, 0.2, 1);
}
```

### 6.2 트랜지션 규칙

| 요소 | 속성 | 시간 | 이징 |
|------|------|------|------|
| 버튼 호버 | transform, shadow | 200ms | ease-out-soft |
| 카드 호버 | transform, shadow, border | 200ms | ease-out-soft |
| 모달 열기 | opacity, transform | 300ms | ease-bounce |
| 모달 닫기 | opacity, transform | 200ms | ease-gentle |
| 토스트 등장 | transform(slide-up) | 300ms | ease-bounce |
| 페이지 전환 | opacity | 200ms | ease-gentle |
| 말풍선 등장 | opacity, transform(scale) | 200ms | ease-bounce |

### 6.3 캐릭터 애니메이션

```css
/* 아이들 — 살짝 위아래로 */
@keyframes idle-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

/* 타이핑 — 빠른 위아래 */
@keyframes typing {
  0%, 100% { transform: translateY(0); }
  25% { transform: translateY(-1px); }
  75% { transform: translateY(1px); }
}

/* 성공 — 점프 */
@keyframes success-jump {
  0% { transform: translateY(0) scale(1); }
  30% { transform: translateY(-12px) scale(1.05); }
  50% { transform: translateY(-12px) scale(1.05); }
  80% { transform: translateY(0) scale(0.98); }
  100% { transform: translateY(0) scale(1); }
}

/* 에러 — 좌우 흔들림 */
@keyframes error-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-3px); }
  40% { transform: translateX(3px); }
  60% { transform: translateX(-2px); }
  80% { transform: translateX(2px); }
}

/* 생각 — 작은 물결 */
@keyframes thinking {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-2deg); }
  75% { transform: rotate(2deg); }
}
```

---

## 7. 레이아웃 시스템

### 7.1 메인 레이아웃 구조

```
┌─────────────────────────────────────────────────┐
│  Sidebar (64px collapsed / 240px expanded)       │
│  ┌────┐ ┌────────────────────────────────────┐  │
│  │Nav │ │  Main Content Area                  │  │
│  │    │ │                                     │  │
│  │ 🏠 │ │  ┌─────────────────┬──────────────┐│  │
│  │ 📁 │ │  │                 │  Side Panel  ││  │
│  │ 🏘️ │ │  │  Primary View   │  (chat/log)  ││  │
│  │ ⚙️ │ │  │  (60~70%)       │  (30~40%)    ││  │
│  │    │ │  │                 │              ││  │
│  │    │ │  └─────────────────┴──────────────┘│  │
│  └────┘ └────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 7.2 스페이싱

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

### 7.3 Border Radius

```css
:root {
  --radius-sm: 8px;    /* 작은 요소 (뱃지, 입력) */
  --radius-md: 12px;   /* 중간 요소 (버튼, 카드) */
  --radius-lg: 16px;   /* 큰 요소 (패널, 모달) */
  --radius-xl: 24px;   /* 특수 (채팅 입력, 프로필) */
  --radius-full: 9999px; /* 원형 */
}
```

### 7.4 그림자 (Neo-Brutal: 솔리드 블랙 섀도우)

```css
:root {
  /* Neo-Brutalism: 번지는 그림자 금지, 솔리드 블랙 섀도우만 사용 */
  --shadow-sm: 2px 2px 0 0 #000000;   /* 작은 요소 (뱃지, 태그) */
  --shadow-md: 4px 4px 0 0 #000000;   /* 기본 요소 (버튼, 입력) */
  --shadow-lg: 6px 6px 0 0 #000000;   /* 큰 요소 (카드, 패널) */
  --shadow-xl: 8px 8px 0 0 #000000;   /* 특수 (모달, 히어로) */
  /* hover 시 섀도우 확대, active 시 섀도우 제거로 눌림 효과 */
}
```

---

## 8. Agent Town 비주얼 설계

### 8.1 타일셋 스타일 가이드

```
[바닥 타일]
- 나무 바닥: 따뜻한 베이지(#E8D5B7) — 메인 오피스
- 카펫: 소프트 그린(#D0E8C5) — 회의실
- 타일: 화이트(#F5F0EB) — QA룸
- 콘크리트: 라이트 그레이(#E2DDD8) — 출고장

[벽]
- 기본 벽: 크림 화이트(#FFF3E0) + 하단 우드 패널
- 창문: 하늘색 투명(#BEE3F8, 50% 알파) + 흰 프레임
- 문: 갈색 나무문(#B8886E) + 둥근 손잡이

[가구]
- 책상: 미니멀 우드(#D4A574) + 모니터(#708090)
- 의자: 색상별 (캐릭터 테마 컬러)
- 책장: 다크우드(#5D4E42) + 컬러풀 책들
- 화분: 테라코타(#C4A882) + 그린 식물
- 소파: 소프트 핑크(#FFE4E1) — 휴게 공간
```

### 8.2 렌더링 규칙
- **타일 크기**: 16×16px (기본), 렌더 시 3x~4x 스케일
- **스케일링**: `image-rendering: pixelated` (nearest-neighbor)
- **레이어 순서**: 바닥 → 벽/가구 → 캐릭터 → UI 오버레이(말풍선 등)
- **조명**: 전체적으로 밝고 따뜻한 톤, 그림자는 최소화
- **시간대 연출(옵션)**: 배경 그라디언트로 아침/오후/저녁 분위기

### 8.3 카메라
- **기본 뷰**: 탑다운(위에서 내려다보기) 또는 약간의 아이소메트릭
- **줌**: 1x~4x (마우스 휠)
- **팬**: 마우스 드래그 또는 WASD
- **오토 포커스**: 현재 활동 중인 에이전트 자동 추적 (토글 가능)

---

## 9. 사운드 디자인

### 9.1 효과음 가이드
| 이벤트 | 사운드 | 톤 | 길이 |
|--------|--------|------|------|
| 에이전트 스폰 | 짧은 팝 | 높고 밝은 | 0.3s |
| 작업 시작 | 부드러운 벨 | 중간 | 0.5s |
| 작업 완료 | 멜로디컬 차임 | 밝고 기쁜 | 0.8s |
| 에러 발생 | 부드러운 "봉" | 낮고 둥근 | 0.5s |
| 질문 필요 | 2음 알림 | 중간, 물음표 느낌 | 0.5s |
| Export 완료 | 팡파레 짧은 버전 | 밝고 축하 | 1.2s |
| 말풍선 등장 | 작은 "팝" | 높고 가벼운 | 0.2s |
| 걷기 | 작은 발자국 | 소프트 | 0.15s/step |

### 9.2 BGM (옵션, v2)
- 로파이 힙합 / 카페 재즈 느낌
- 볼륨: 매우 낮게 (15~20%)
- 토글: 사용자가 켜고 끌 수 있음

---

## 10. 다크 모드

### 10.1 원칙
- **차가운 다크가 아닌 따뜻한 다크**: 순수 블랙(#000) 대신 따뜻한 차콜(#1A1612)
- **캐릭터 컬러는 유지**: 다크 모드에서도 캐릭터 색감은 밝게
- **대비 보정**: 텍스트와 배경 사이 최소 4.5:1 비율

### 10.2 다크 모드 팔레트

| 라이트 모드 | 다크 모드 | 용도 |
|------------|----------|------|
| cream-50 (#FFF9F0) | dark-bg (#1A1612) | 배경 |
| cream-100 (#FFF3E0) | dark-surface (#2D2520) | 카드 배경 |
| cream-200 (#FFE8CC) | dark-border (#4A3F36) | 보더 |
| brown-700 (#5D4E42) | dark-text (#E8DDD4) | 본문 텍스트 |
| brown-800 (#3E342D) | cream-50 (#FFF9F0) | 제목 텍스트 |
| white | #352E28 | 입력 배경 |

---

## 11. 반응형 & 최소 사이즈

| Breakpoint | 폭 | 레이아웃 |
|-----------|-----|---------|
| Desktop (기본) | 1280px+ | 사이드바 + 메인 + 사이드패널 |
| Tablet | 1024~1279px | 사이드바 collapsed + 메인 + 사이드패널 토글 |
| Minimum | 1024px | 최소 지원 해상도 (Electron) |

---

## 12. 접근성 체크리스트

- [ ] 모든 인터랙티브 요소에 포커스 스타일
- [ ] 키보드 내비게이션 (Tab/Enter/Esc)
- [ ] 스크린 리더용 aria-label
- [ ] 색각 이상 시에도 구분 가능한 상태 표시 (아이콘 + 텍스트 병행)
- [ ] 모션 감소 설정 시 애니메이션 비활성화 (`prefers-reduced-motion`)
- [ ] 최소 색대비 4.5:1 (본문), 3:1 (대형 텍스트)

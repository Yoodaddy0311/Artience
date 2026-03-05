# 🎨 DogBa Platform: Art Direction & Design Guide (v2.0)

본 가이드는 제공된 게임 벤치마킹 이미지(FeeDog, 고양이 스낵바 등 힐링/타이쿤 장르)를 바탕으로, DogBa 플랫폼이 지향해야 할 시각적 룩앤필(Look & Feel)과 아트 컨셉을 정의합니다.

---

## 1. 핵심 컨셉 (Core Concept)

- **장르/무드**: Cozy Tycoon / Healing Simulation (힐링 경영 시뮬레이션)
- **키워드**: 따뜻함(Warm), 둥글둥글함(Chubby), 포근함(Soft), 스트레스 없는(Stress-free), 장난감 같은(Toy-like)
- **목표**: 차가운 CLI 도구나 일반적인 SaaS 대시보드가 아닌, **"귀여운 동물 직원들이 일하는 아기자기한 오피스를 관리하는 모바일 게임"**처럼 느끼게 한다.

## 2. 아트 및 일러스트레이션 스타일 (Art Style)

- **형태 (Shapes)**: 날카로운 모서리 배제. 모든 곡선은 과장되고 부드럽고 둥글어야 함 (Chibi 프로포션).
- **라인 아트 (Line Art)**:
    - 순수 검은색(#000) 사용 금지.
    - 대신 **진한 갈색(Dark Brown, #4A3525)** 이나 **다크 퍼플** 계열의 굵고 일정한 두께(Thick Stroke)의 테두리를 사용하여 스티커나 동화책 같은 느낌 부여.
- **채색 및 명암**:
    - 복잡한 그라데이션이나 사실적인 빛 반사 배제.
    - 플랫(Flat)한 단색 베이스에 매우 단순화된 1단계 명암(셀 셰이딩)만 사용.
- **캐릭터**: 단순한 점 눈(Dot eyes), 짧은 팔다리, 푹신해 보이는 체형 중심.

## 3. UI/UX 디자인 시스템 (Neo-Brutalism + Artience Guide)

모바일 타이쿤 게임의 직관적인 레이아웃 및 팝아트 감성과 함께 **네오 브루탈리즘(Neo-Brutalism)** 스타일을 유지하되, 핵심적인 타이포그래피와 라운딩 수치는 **[Artience UX Design System]** 의 표준 규격을 엄격히 따릅니다.

### A. 패널 및 컨테이너 (Rounding & Borders)

- **테두리**: 모든 UI 컴포넌트에 **완전한 검은색(#000000) 의 굵은 테두리(Border, 3~4px)** 적용.
- **그림자**: 번지는(Blurry) 부드러운 그림자 금지. **단단하고 날카로운 솔리드 블랙 섀도우(Hard Black Shadow, 예: `shadow-[4px_4px_0_0_#000]`)** 로 팝업창 느낌 극대화.
- **라운드 (Border Radius)**: 아티언스 디자인 가이드를 준수합니다.
    - **기본 반경 (컴포넌트, 버튼, 뱃지 레이블)**: `8px` (`rounded-lg`)
    - **대형 패널 (카드, 드롭다운, 바텀 시트)**: `16px` (`rounded-2xl`)

### B. 타이포그래피 (Typography)

- **메인 폰트**: 시스템 전반에 `Pretendard` 폰트를 사용합니다.
- **행간 및 자간**: Line-height는 기본 **148% (`leading-[1.48]`)** 배수를 적용하며, 텍스트가 여러 줄일 경우 가독성을 확보합니다. 자간(Tracking)은 기본(`tracking-normal`)을 유지합니다.
- **사이즈 시스템**: UX 가이드의 Type Scale에 맞춰 고정된 px 값(예: 12px, 15px, 18px, 20px 등)을 사용하며, 글씨 효과는 외곽선 없이 볼드한 솔리드 블랙으로 처리합니다.

### C. 컬러 팔레트 (Color Palette)

- **Background**: 눈이 편안한 밝은 톤 또는 완전한 하얀색(Pure White) 베이스.
- **UI Elements**:
    - 그라데이션 절대 금지(Flat 100%).
    - 액션 버튼과 강조 요소에는 채도가 높고 명료한 비비드(Vivid) 또는 파스텔 톤 단색(Pastel Yellow, Light Blue, Mint)을 꽉 채워 사용.

## 4. 구체적 화면 레이아웃 (Game HUD)

1. **좌측 상단 (Profile)**:
    - 프로필 썸네일(네모+둥근 모서리) + 굵은 테두리
    - 경험치 바(Exp Bar)는 큼직하고 둥글게, 형광색 사용.
    - 닉네임과 레벨은 두터운 글씨체.
2. **우측 상단 (Currency)**:
    - 골드(W) 및 다이아몬드(💎) 등 재화 패널. 검은색/어두운 반투명 배경 위에 빛나는 아이콘 디자인.
3. **우측 하단 (Quick Actions)**:
    - 플랫 + 두터운 외곽선을 가진 아이콘 (업적, 설정, 상점, 관리 등).
4. **중앙 하단 (Dock)**:
    - 실제 투입된 에이전트 목록 표시 및 상태창.

---

> _이 가이드는 나노바나나(Nano Banana) 프롬프트 생성 시 "cute 2d mobile game ui icon, thick dark brown outlines, flat pastel colors" 등의 지시어로 번역되어 일관된 에셋 생성을 주도합니다._

# Artience UX Design System - 웹/앱 개발 디자인 가이드

## 개요
Artience UX Design System "Seamless Flow"는 일관된 사용자 경험을 제공하기 위한 디자인 시스템입니다. 이 문서는 IDE 내에서 웹/앱 구축 시 적용해야 할 디자인 구성 기준을 정리합니다.

---

## 1. Foundations (디자인 기반)

### 1.1 Color (컬러)
브랜드 아이덴티티를 유지하고 핵심 정보를 강조하며 상태를 명확하게 전달하는 컬러 사용 기준입니다.

#### Primary Color - Gray Scale
- 정보 전달과 시각적 위계의 기반이 되며, WCAG 웹 접근성 명도 대비를 준수합니다
- **400단계 이하**: UI 구조 요소(보더라인, 배경 등)에 사용
- **500단계 이상**: 텍스트에 사용 (텍스트와 배경 간 최소 4.5:1 명도 대비)

#### 배경색별 권장 토큰
| Semantic Token | White BG | Gray BG |
|----------------|----------|---------|
| text.tertiary | Gray 500 | Gray 550 (+50) |
| border.primary | Gray 400 | Gray 450 (+50) |
| fill.secondary.default | Gray 100 | Gray 150 (+50) |
| icon.tertiary | Gray 400 | Gray 450 (+50) |
| text.feedback.critical | Red 500 | Red 600 (+100) |

#### Accent Color
- **Accent Primary**: Red 400, Red 500 (브랜드/서비스 강조)
- **Accent Secondary**: Teal 400, Teal 500 (보조 컬러)
- **Color Ratio**: Gray Scale과 Accent를 **8:2 비율**로 사용 권장

#### Feedback Color
- 성공, 안내, 긴급 등 시스템 상태를 직관적으로 전달
- 완료/성공: 녹색, 안내/정보: 파란색, 긴급/중요: 빨간색

#### Transparent
- 배경 음영 처리: **투명도 65%** 사용

#### Screen Mode
- Light Mode와 Dark Mode 지원, 동일한 팔레트 기반으로 시각적 명료성 유지

---

### 1.2 Typography (타이포그래피)
효율적인 정보 전달을 위한 폰트, 크기, 굵기, 행간 표준화 기준입니다.

#### Typefaces
- **Display**: Artience Flow (브랜드 에셋용, Bold/Medium)
- **Title & Body**: Pretendard (본문 가독성 확보)

#### Type Scale
| Category | Weight | Size | Line-Height | Role |
|----------|--------|------|-------------|------|
| Display 1 | Medium, Bold | 60px (4rem) | 130% | 최상위 헤드라인 (PC권장) |
| Display 2 | Medium, Bold | 40px (2.67rem) | 130% | 메인 타이틀 (PC권장) |
| Display 3 | Medium, Bold | 36px (2.4rem) | 148% | 강조형 헤드라인 |
| Heading 1 | Medium, Bold | 32px (2.133rem) | 148% | 페이지 상위 제목 |
| Heading 2 | Medium, Bold | 24px (1.6rem) | 148% | 하위 제목 |
| Heading 3 | Medium, Bold | 22px (1.47rem) | 148% | 소제목, 그룹 제목 |
| Title 1 | Medium, Bold | 20px (1.33rem) | 148% | 콘텐츠 타이틀 |
| Title 2 | Medium, Semibold, Bold | 18px (1.2rem) | 148% | 서브 페이지 제목 |
| Body 1 | Regular~Bold | 16px (1.07rem) | 148%/170% | 본문 텍스트 (PC권장) |
| Body 2 | Regular~Bold | 15px (1rem) | 148%/158% | 본문 텍스트 |
| Body 3 | Regular~Bold | 14px (0.933rem) | 148%/158% | 본문 소형 텍스트 |
| Label 1 | Medium | 17px (1.133rem) | 148% | 버튼 라벨 (PC권장) |
| Label 2 | SemiBold | 15px (1rem) | 148% | 버튼, 입력 폼 |
| Label 3 | Medium, Semibold | 13px (0.87rem) | 148% | 입력 레이블 |
| Label 4 | Medium~Bold | 10px (0.625rem) | Auto | 바텀 아이콘 레이블 |
| Caption | Medium, SemiBold | 12px (0.8rem) | 148% | 툴팁, 보조 설명 |

#### Spec
- **Responsive**: 화면 크기에 따라 폰트 스타일 자동 전환
- **Size**: 정보성 텍스트(레이블, 본문)는 **15px** 사용
- **Line-height**: 기본 **148%**, 장문 **170%**

---

### 1.3 Elevation (엘리베이션)
컴포넌트의 시각적 위계와 공간감을 부여하는 기준입니다.

#### Elevation Levels
| Level | 주요 구성 요소 | 시맨틱 적용 예시 |
|-------|---------------|-----------------|
| Level 0 | Background | Background Default (시스템 베이스 레이어) |
| Level 1 | Chip, Button, Text Field 등 | Surface Primary 01 (기본 컴포넌트) |
| Level 2 | 유의사항, Canvas (Side Panel) | Surface Primary 02 |
| Level 3 | Dropdown, AI Process Indicator | Surface Primary 03 |
| Level 4 | Popup, Bottom Sheet, Navigation Bar | Surface Primary 04 (최상위 레이어) |

#### Shadow
- **Shadow 1**: 인풋, 셀렉트의 Focused 상태
- **Shadow 2**: 드롭다운 메뉴 (다른 요소와 구분)
- **Shadow 3**: 팝업 (강한 구분)
- **Component Shadow**: Handle(슬라이더, 스위치), Top Navigation(스크롤)

#### Dim
- 음영 효과: 특정 레이어 강조용

---

### 1.4 Breakpoint (브레이크포인트)
다양한 디바이스 환경에서 일관된 사용자 경험을 제공하는 반응형 레이아웃 기준입니다.

#### Breakpoints
| Size | Width Range |
|------|-------------|
| xsmall | 0-359px |
| small | 360-767px |
| medium | 768-1279px |
| large | 1280-1919px |
| xlarge | 1920px+ |

#### Grid System
- 컬럼, 마진, 거터로 구성
- Mobile, Tablet, Desktop별 그리드 적용

#### Spacing (4pt Grid)
- 모든 여백과 간격을 **4point 단위**로 설정
- 상세/복잡한 컴포넌트: 2의 배수 단위 제한적 사용

#### Use Case
- **Space 4**: 라디오 버튼과 레이블 사이 갭
- **Space 8**: 컴포넌트 요소 사이 갭
- **Space 16**: 컴포넌트 패딩
- **Space 20**: 마진

---

### 1.5 Radius (라운드)
UI의 형태적 일관성을 유지하는 라운드 사용 기준입니다.

#### Radius Values
- 0, 2, 4, 6, 8, 12, 16, circle
- **기본 값: 8px**
- 지나치게 둥근 형태 사용 지양

#### Use Case
- **6px**: 툴팁 같이 작은 요소
- **8px**: 기본 (버튼, 인풋, 드롭다운 등)
- **16px**: 바텀시트 같이 화면에서 큰 비율 차지 요소
- **Circle**: 칩, 인디케이터 (반원 형태)

#### Structure (중첩 컴포넌트)
- 4px / 8px, 8px / 12px, 8px / 4px, 16px / 8px

---

### 1.6 Iconography (아이콘)
효율적인 시각 언어로 소통하기 위한 아이콘 사용 기준입니다.

#### Style
- **Line**: 기본형 아이콘
- **Fill**: 강조 요소

#### Grid
- **24px** 사이즈 기준으로 제작
- 2px 여백 유지, 20px 영역 안에서 작업

#### Size & Touch Area
- 최소 **12px** 이상
- 터치 영역: **44px** 확보

#### Shape
- **Stroke**: 2px 기준 (1.2~4px 범위)
- **Round**: 24px 아이콘 기준 2px 라운드
- **End Point**: 라운드 사용

---

### 1.7 Motion (모션)
화면 전환과 상호작용을 자연스럽게 연결하는 기준입니다.

#### Consideration
- **Easing**: 모션 속도 조절로 리듬 정의 (가속/감속)
- **Duration**: 목적과 스타일에 따라 구분
- **Transition**: 화면과 요소 간 변화 연결

---

### 1.8 Accessibility (접근성)
신체적, 환경적 조건과 관계없이 접근성을 보장하기 위한 기준입니다. **WCAG 준수 필수**.

#### 접근성 4원칙
1. **인식의 용이성**: 텍스트 명도 대비, 폰트 크기, 콘텐츠 구분
2. **운용의 용이성**: 키보드, 스크린리더, 음성 명령 지원
3. **이해의 용이성**: 명확하고 직관적인 레이블, 에러 메시지, 피드백
4. **견고성**: 다양한 디바이스, 보조기기 일관 작동

#### Color Contrast
| 유형 | 대비율 | 가이드 |
|------|--------|--------|
| 본문 | 배경 대비 최소 4.5:1 | 필수 적용 |
| 제목 | 배경 대비 최소 3:1 | 18px/Bold 이상 |
| 비활성화 상태 | 배경 대비 최소 3:1 권장 | 예외 적용 가능 |
| CTA Button | 배경 대비 최소 3:1 | 비활성화 예외 |
| Icon | 배경 대비 최소 3:1 | 비활성화 예외 |

#### Readability
- **Minimum Font Size**: 모바일 12px+, PC 14px+
- **Line-height**: 단문 148%, 장문 170%
- **Weight Variation**: SemiBold, Bold, Medium으로 시각적 위계 설정

#### Focus & Interaction
- **Touch & Click Target**: 최소 44x44px
- **Keyboard Interaction**: 모든 기능 키보드 조작 지원
- **Reading & Focus Process**: 왼쪽→오른쪽, 위→아래 순서 유지

#### Motion 접근성
- 모션 대체 제공 (간소화된 전환)
- '모션 줄이기' 설정 감지 적용
- 과도한 속도/반짝임/갑작스러움 지양

---

### 1.9 Design Token (디자인 토큰)
디자이너와 개발자의 효율적인 협업을 위한 코드화된 기준입니다.

#### Token Tier
1. **Primitive Token**: 시각적 속성의 기본 단위 (Raw Data)
2. **Semantic Token**: 의미 기반 값, 테마별 구성
3. **Component Token**: 컴포넌트 속성 표현 (코드베이스 관리)

#### Token Format
- Figma에서 정의된 토큰 → 플랫폼별 포맷으로 변환
- **W3C Design Tokens 표준** 준수

---

### 1.10 Visual Communication (비주얼 커뮤니케이션)
'Seamless Flow'를 구현하기 위한 비주얼 커뮤니케이션 가이드입니다.

#### 컬러
- 화이트 기준, Black과 Gray를 키 컬러로 사용
- Accent Red와 Teal은 강조할 때만 제한적 사용

#### 타이포그래피
- **Artience Flow**: 브랜드 정체성
- **Pretendard**: 일관된 가독성

#### 아이콘
- 라인 아이콘 기본
- 필 아이콘은 핵심정보 강조용

#### 인포그래픽
- 과도한 표현 지양
- 정보를 명확하고 간결하게 표현

#### 실사 이미지
- 피사체 선명하게 드러내기
- 브랜드 톤에 맞춘 정제된 감도
- 명료한 구도와 간결한 배경

---

## 2. Components (컴포넌트)

재사용 가능한 UI 구성 요소 사용 기준입니다.

### 2.1 Button
사용자의 의도를 명확하게 전달하고 행동을 유도합니다.

**Anatomy**: Container, Label, Icon (Optional)

**Type**
1. Button
2. Text Button
3. Floating Action Button (FAB)

**Spec**
- Mobile (0-767px): 화면 너비에 맞춰 확장
- Tablet/Desktop (768px+): 최대 너비 **610px**
- Primary 버튼: 화면 하단 고정 배치
- Extended FAB: 하단 스크롤 시 축소, 상단 스크롤 시 확장

---

### 2.2 Bottom Navigation
서비스의 핵심 기능을 빠르게 탐색할 수 있는 경로를 제공합니다.

**Anatomy**: Container, Divider, Icon, Label

---

### 2.3 Bottom Sheet
현재 화면의 맥락을 유지하면서 연관 정보를 확인하고 상호작용할 수 있습니다.

**Anatomy**: Dim, Container, Header Area, Content Area, Footer Area, Close Button

**Spec**
- 최대 높이: 디바이스 높이의 **90%**
- 내용이 길어질 경우: 고정된 높이 내 스크롤, 헤더/푸터 고정

---

### 2.4 Card
공통된 정보를 시각적으로 묶어서 제공합니다.

**Anatomy**: Container, Title Text, Body Text

**Type**
1. Full Image
2. Image + Text

---

### 2.5 Checkbox
여러 항목 중 하나 이상을 선택하거나 해제합니다.

**Anatomy**: Checkbox, Label

**Type**
1. Basic
2. Button

---

### 2.6 Chip
항목을 선택하거나 상태를 표시합니다.

**Anatomy**: Container, Label, Icon (Optional)

**Type**
1. Select Chip
2. Filter Chip
3. Input Chip

---

### 2.7 Data Visual
정량적 데이터를 시각적으로 표현합니다.

**Anatomy**: Title, Dropdown (Optional), Chart Contents, Legend

**Color Palette**
- **배합형 Default**: 범주 구분이 명확한 데이터
- **배합형 Light**: 다수 항목 부드럽게 구분
- **강조형 Strong**: 특정 데이터 상대적 강조
- **확장형 Extended**: 데이터 항목이 많을 때
- **순차형 Sequential**: 값의 크기나 흐름 표현

**Chart Type**
1. **Bar Chart**: 카테고리별 데이터 값 크기 비교 (5개 이하)
2. **Pie/Donut Chart**: 전체의 비율 (8개 미만, 8개 이상은 기타로 합산)
3. **Line Chart**: 시간 흐름에 따른 추이

---

### 2.8 Data Table
데이터를 행과 열로 구조화하여 빠르게 탐색하고 비교합니다.

**Anatomy**: Header Row, Body Row, Divider, Column, Cell

**Type**
1. Data Table
2. List Table

**Responsive**: 모바일에서 가로 스크롤 방식

---

### 2.9 Dropdown
여러 항목 중 하나를 선택합니다.

**Anatomy**: Container, Label, Dropdown Icon

**Responsive**
- Mobile: 바텀시트로 제공, 화면 너비에 맞춰 확장
- Desktop: 드롭다운 메뉴 형태, 최대 너비 610px

---

### 2.10 Text Field
사용자의 의도에 따라 데이터를 수집하고 입력 과정에 피드백과 안내를 제공합니다.

**Anatomy**: Container, Placeholder, Label, Input Text, Clear Icon, Helper Text

**Type**
1. Text Input
2. Text Area

**Responsive**
- Mobile: 화면 너비에 맞춰 확장
- Desktop: 최대 너비 610px, Label과 Text field 분리 사용

---

### 기타 컴포넌트
- Divider, Indicator, List, Loading, Notification, Popup, Radio Button, Search, Slider, Switch, Tab, Tag, Tooltip, Top Navigation

---

## 3. Patterns (패턴)

재사용 가능한 공통 UI / 업무 단위 기준입니다.

### 3.1 Common UI

**입력 폼**
- 복잡한 입력 과정을 쉽게 완료할 수 있는 패턴
- 관련 컴포넌트: Text Field, Checkbox, Button, Dropdown, Divider

**약관 동의**
- 약관에 대한 명확한 이해와 동의를 구하기 위한 패턴
- 관련 컴포넌트: Checkbox, Dropdown, Button, Bottom Sheet, Divider

**빈 화면**
- 콘텐츠가 없을 때의 상태 표현

**유의사항**
- 중요 정보 전달 패턴

---

### 3.2 Service Pattern

**온보딩**
- 서비스의 주요 기능과 사용 방법을 안내하는 패턴
- 관련 컴포넌트: Indicator, Bottom Sheet, Button

**검색**
- 검색 전·중·후 상황과 검색 대상 범위에 따른 패턴
- 관련 컴포넌트: Search, Tab, Chip, List, Button, Divider, Bottom Sheet

**시스템 상태**
- 정상적인 서비스 이용이 어려운 상황을 명확히 전달하고 대응 경로를 안내
- 타입: 기본형, 버튼형
- 관련 컴포넌트: Button

---

## 4. UX Writing (UX 라이팅)

KT의 모든 서비스에서 준수해야 할 글쓰기 원칙입니다.

### 4.1 Principles

#### 1. 간결하고 명확한
- 1-1. 꼭 필요한 텍스트만 남깁니다
- 1-2. 명확한 의미로 작성합니다
- 1-3. 가독성 높게 작성합니다

#### 2. 쉽고 편리한
- 2-1. 사용자 친화적인 언어를 사용합니다
- 2-2. 부드러운 높임말을 사용합니다
- 2-3. 말하듯이 대화체로 작성합니다

#### 3. 공감하고 배려하는
- 3-1. 긍정적인 메시지로 소통합니다
- 3-2. 사용자의 감정을 존중합니다
- 3-3. 문제의 해결 방법을 제시합니다

---

### 4.2 활용 사례

#### 1-1. 꼭 필요한 텍스트만 남깁니다
- **핵심만 전달**: 텍스트 길이 줄여 정보를 한 번에 파악
- **중복 최소화**: 각 텍스트마다 고유 정보
- **의례적 표현 생략**: 과도한 감사/사과 지양

#### 1-2. 명확한 의미로 작성합니다
- 하나의 개념은 하나의 용어로 통일
- 이중 부정 표현 사용하지 않음

#### 1-3. 가독성 높게 작성합니다
- **핵심 정보 강조**: 타이틀, 본문, 버튼명 등 시각적 요소 활용
- **짧은 문장 사용**: 긴 문장은 두 개로 분리
- **구조화된 텍스트 제공**: 줄 바꿈, 불릿, 번호 사용

---

## 5. 개발 시 체크리스트

### 컬러
- [ ] Gray Scale과 Accent 8:2 비율 준수
- [ ] 텍스트 명도 대비 4.5:1 이상 확인
- [ ] Dark Mode 지원 시 토큰 매핑 확인

### 타이포그래피
- [ ] Type Scale에 맞는 폰트 사이즈 적용
- [ ] 정보성 텍스트 15px 사용
- [ ] Line-height 148% (장문 170%)

### 레이아웃
- [ ] Breakpoint별 반응형 레이아웃 적용
- [ ] 4pt Grid 기반 Spacing 적용
- [ ] 모바일/태블릿/데스크톱 그리드 시스템 적용

### 컴포넌트
- [ ] Radius 기본값 8px 적용
- [ ] 터치 영역 44x44px 확보
- [ ] Elevation Level에 따른 Shadow 적용

### 접근성
- [ ] WCAG 2.1 AA 기준 충족
- [ ] 키보드 네비게이션 지원
- [ ] 스크린리더 호환성 확인
- [ ] 모션 줄이기 설정 대응

---

*Document Version: 1.2*
*Source: Artience UX Design System - Seamless Flow*
*Generated: 2026-01-20*

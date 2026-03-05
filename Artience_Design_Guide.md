# Artience - UI/UX 디자인 가이드

## 📋 목차

1. [전체 개요](#전체-개요)
2. [컬러 시스템](#컬러-시스템)
3. [컴포넌트 디자인](#컴포넌트-디자인)
4. [아이콘 시스템](#아이콘-시스템)
5. [인터랙션 & 모션](#인터랙션--모션)
6. [마이크로 인터랙션 상세](#마이크로-인터랙션-상세)
7. [애니메이션 라이브러리](#애니메이션-라이브러리)
8. [엘리베이션 & 그림자](#엘리베이션--그림자)
9. [라운드 (Border Radius)](#라운드-border-radius)
10. [페이지별 상세 분석](#페이지별-상세-분석)

---

## 전체 개요

### 서비스 정보

- **서비스명**: Artience
- **타겟**: B2B 기업 고객 (퍼포먼스 마케팅 에이전시)
- **디자인 스타일**: 모던, 클린, 미니멀리즘 기반의 SaaS 대시보드

### 디자인 원칙

- 화이트 스페이스를 충분히 활용한 여유로운 레이아웃
- 카드 기반의 정보 그룹화
- 명확한 시각적 계층 구조
- 친근하고 부드러운 인상의 UI
- **부드럽고 자연스러운 인터랙션**
- **피드백이 명확한 마이크로 인터랙션**

---

## 컬러 시스템

### Primary Colors

| 이름          | HEX     | 용도                  |
| ------------- | ------- | --------------------- |
| Primary Black | #1A1A1A | CTA 버튼, 헤딩 텍스트 |
| Primary White | #FFFFFF | 배경, 카드            |

### Secondary Colors

| 이름           | HEX     | 용도                        |
| -------------- | ------- | --------------------------- |
| Soft Blue      | #E8F4FD | 히어로 섹션 배경, 강조 영역 |
| Success Green  | #10B981 | 성공 상태, 긍정적 지표      |
| Info Blue      | #3B82F6 | 정보, 링크                  |
| Warning Yellow | #F59E0B | 경고, 주의                  |
| Error Red      | #EF4444 | 오류, 삭제                  |

### Status Badge Colors

| 상태          | 배경색                 | 텍스트색         |
| ------------- | ---------------------- | ---------------- |
| Artience 추천 | #1F2937 (Dark Gray)    | White            |
| 진행 중       | #DBEAFE (Light Blue)   | #1E40AF (Blue)   |
| 완료          | #D1FAE5 (Light Green)  | #065F46 (Green)  |
| 최적화 필요   | #FEF3C7 (Light Yellow) | #92400E (Yellow) |
| 작성 중       | #F3F4F6 (Light Gray)   | #6B7280 (Gray)   |

### Neutral Colors

| 이름     | HEX     | 용도                      |
| -------- | ------- | ------------------------- |
| Gray 50  | #F9FAFB | 페이지 배경               |
| Gray 100 | #F3F4F6 | 카드 배경, 입력 필드 배경 |
| Gray 200 | #E5E7EB | 보더, 구분선              |
| Gray 400 | #9CA3AF | Placeholder 텍스트        |
| Gray 600 | #4B5563 | 보조 텍스트               |
| Gray 900 | #111827 | 메인 텍스트               |

---

## 컴포넌트 디자인

### 버튼 (Buttons)

#### Primary Button (CTA)

```css
.btn-primary {
    background: #1f2937;
    color: #ffffff;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
}

.btn-primary::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    transform: translate(-50%, -50%);
    transition:
        width 0.6s,
        height 0.6s;
}

.btn-primary:hover {
    background: #374151;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(31, 41, 55, 0.3);
}

.btn-primary:hover::before {
    width: 300px;
    height: 300px;
}

.btn-primary:active {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(31, 41, 55, 0.2);
}
```

#### Secondary Button (Ghost)

```css
.btn-secondary {
    background: transparent;
    color: #1f2937;
    padding: 12px 24px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-weight: 500;
    transition: all 0.2s ease;
}

.btn-secondary:hover {
    background: #f9fafb;
    border-color: #1f2937;
    transform: translateY(-1px);
}

.btn-secondary:active {
    transform: scale(0.98);
}
```

#### Icon Button (아이콘 버튼)

```css
.btn-icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    transition: all 0.2s ease;
}

.btn-icon:hover {
    background: #f3f4f6;
    transform: rotate(90deg);
}

.btn-icon svg {
    transition: all 0.2s ease;
}

.btn-icon:hover svg {
    transform: scale(1.1);
}
```

### 카드 (Cards)

#### 기본 카드

```css
.card {
    background: #ffffff;
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.card:hover {
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.12);
    transform: translateY(-4px);
}
```

#### 인터랙티브 카드 (클릭 가능)

```css
.card-interactive {
    background: #ffffff;
    border-radius: 16px;
    padding: 24px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
}

.card-interactive::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(
        135deg,
        rgba(59, 130, 246, 0.05) 0%,
        rgba(16, 185, 129, 0.05) 100%
    );
    opacity: 0;
    transition: opacity 0.3s ease;
}

.card-interactive:hover {
    transform: translateY(-6px) scale(1.02);
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.15);
}

.card-interactive:hover::after {
    opacity: 1;
}

.card-interactive:active {
    transform: translateY(-2px) scale(1);
}
```

### 입력 필드 (Input Fields)

#### 텍스트 입력

```css
.input-text {
    width: 100%;
    padding: 14px 16px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    transition: all 0.2s ease;
    background: #ffffff;
}

.input-text:hover {
    border-color: #d1d5db;
}

.input-text:focus {
    border-color: #1f2937;
    outline: none;
    box-shadow: 0 0 0 4px rgba(31, 41, 55, 0.1);
    transform: translateY(-1px);
}

/* Label Animation */
.input-group {
    position: relative;
}

.input-label {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 14px;
    color: #9ca3af;
    pointer-events: none;
    transition: all 0.2s ease;
}

.input-text:focus + .input-label,
.input-text:not(:placeholder-shown) + .input-label {
    top: -8px;
    font-size: 12px;
    background: #ffffff;
    padding: 0 4px;
    color: #1f2937;
}
```

### 토글 스위치 (Toggle Switch)

```css
.toggle {
    width: 48px;
    height: 26px;
    border-radius: 13px;
    background: #e5e7eb;
    position: relative;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle.active {
    background: #10b981;
}

.toggle-thumb {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #ffffff;
    position: absolute;
    top: 2px;
    left: 2px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.toggle.active .toggle-thumb {
    left: 24px;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
}

.toggle:hover .toggle-thumb {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    transform: scale(1.1);
}
```

### 체크박스 (Checkbox)

```css
.checkbox {
    width: 20px;
    height: 20px;
    border: 2px solid #e5e7eb;
    border-radius: 4px;
    position: relative;
    cursor: pointer;
    transition: all 0.2s ease;
}

.checkbox:hover {
    border-color: #1f2937;
}

.checkbox.checked {
    background: #1f2937;
    border-color: #1f2937;
}

.checkbox.checked::after {
    content: '';
    position: absolute;
    left: 6px;
    top: 2px;
    width: 4px;
    height: 9px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
    animation: checkmark 0.3s ease;
}

@keyframes checkmark {
    0% {
        height: 0;
        width: 0;
    }
    50% {
        height: 9px;
        width: 0;
    }
    100% {
        height: 9px;
        width: 4px;
    }
}
```

### 드롭다운 (Dropdown)

```css
.dropdown {
    position: relative;
    width: 100%;
}

.dropdown-trigger {
    width: 100%;
    padding: 14px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #ffffff;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: all 0.2s ease;
}

.dropdown-trigger:hover {
    border-color: #1f2937;
}

.dropdown-trigger.open {
    border-color: #1f2937;
    box-shadow: 0 0 0 3px rgba(31, 41, 55, 0.1);
}

.dropdown-icon {
    transition: transform 0.3s ease;
}

.dropdown-trigger.open .dropdown-icon {
    transform: rotate(180deg);
}

.dropdown-menu {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    width: 100%;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
    opacity: 0;
    transform: translateY(-10px);
    pointer-events: none;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 10;
}

.dropdown-menu.open {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
}

.dropdown-item {
    padding: 12px 16px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.dropdown-item:first-child {
    border-radius: 12px 12px 0 0;
}

.dropdown-item:last-child {
    border-radius: 0 0 12px 12px;
}

.dropdown-item:hover {
    background: #f9fafb;
    padding-left: 20px;
}

.dropdown-item.selected {
    background: #e8f4fd;
    color: #1f2937;
    font-weight: 600;
}
```

### 탭 (Tabs)

```css
.tabs {
    display: flex;
    gap: 8px;
    border-bottom: 2px solid #e5e7eb;
    position: relative;
}

.tab-item {
    padding: 12px 20px;
    font-size: 14px;
    color: #6b7280;
    cursor: pointer;
    position: relative;
    transition: all 0.2s ease;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
}

.tab-item:hover {
    color: #1f2937;
    background: #f9fafb;
    border-radius: 8px 8px 0 0;
}

.tab-item.active {
    color: #1f2937;
    border-bottom-color: #1f2937;
    font-weight: 600;
}

.tab-indicator {
    position: absolute;
    bottom: -2px;
    height: 2px;
    background: #1f2937;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Tab Content Animation */
.tab-content {
    animation: fadeInUp 0.4s ease;
}

@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

### 모달 (Modal)

```css
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

.modal {
    background: #ffffff;
    border-radius: 24px;
    padding: 32px;
    max-width: 600px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    animation: modalSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes modalSlideIn {
    from {
        opacity: 0;
        transform: translateY(-50px) scale(0.9);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.modal-close {
    position: absolute;
    top: 24px;
    right: 24px;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: transparent;
    transition: all 0.2s ease;
    cursor: pointer;
}

.modal-close:hover {
    background: #f3f4f6;
    transform: rotate(90deg);
}
```

---

## 아이콘 시스템

### 아이콘 스타일

- **타입**: 라인 아이콘 (Outline)
- **두께**: 1.5px - 2px
- **스타일**: 부드러운 곡선, 둥근 끝처리

### 아이콘 애니메이션

```css
/* 기본 아이콘 호버 */
.icon {
    transition: all 0.2s ease;
}

.icon:hover {
    transform: scale(1.1);
}

/* 회전 아이콘 */
.icon-rotate:hover {
    transform: rotate(180deg);
}

/* 흔들림 아이콘 */
@keyframes shake {
    0%,
    100% {
        transform: translateX(0);
    }
    25% {
        transform: translateX(-5px);
    }
    75% {
        transform: translateX(5px);
    }
}

.icon-shake:hover {
    animation: shake 0.4s ease;
}

/* 펄스 아이콘 */
@keyframes pulse {
    0%,
    100% {
        transform: scale(1);
    }
    50% {
        transform: scale(1.1);
    }
}

.icon-pulse {
    animation: pulse 2s ease-in-out infinite;
}

/* 바운스 아이콘 */
@keyframes bounce {
    0%,
    100% {
        transform: translateY(0);
    }
    50% {
        transform: translateY(-10px);
    }
}

.icon-bounce:hover {
    animation: bounce 0.5s ease;
}
```

---

## 인터랙션 & 모션

### 호버 효과 (Hover Effects)

#### 버튼 호버 - 고급 효과

```css
.btn-advanced {
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
}

/* Ripple Effect */
.btn-advanced::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.5);
    transform: translate(-50%, -50%);
    transition:
        width 0.6s,
        height 0.6s;
}

.btn-advanced:hover::before {
    width: 300px;
    height: 300px;
}

/* Shine Effect */
.btn-shine {
    position: relative;
    overflow: hidden;
}

.btn-shine::after {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
        90deg,
        transparent,
        rgba(255, 255, 255, 0.3),
        transparent
    );
    transition: left 0.5s ease;
}

.btn-shine:hover::after {
    left: 100%;
}

/* Gradient Shift */
.btn-gradient {
    background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
    background-size: 200% 200%;
    transition: all 0.4s ease;
}

.btn-gradient:hover {
    background-position: 100% 50%;
    box-shadow: 0 8px 20px rgba(31, 41, 55, 0.3);
}
```

#### 카드 호버 - 3D 효과

```css
.card-3d {
    transition: all 0.3s ease;
    transform-style: preserve-3d;
}

.card-3d:hover {
    transform: perspective(1000px) rotateX(5deg) rotateY(5deg) translateY(-10px);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

/* Tilt Effect */
.card-tilt {
    transition: transform 0.3s ease;
}

.card-tilt:hover {
    transform: perspective(1000px) rotateY(10deg);
}
```

#### 링크 호버 - 언더라인 애니메이션

```css
.link-animated {
    position: relative;
    text-decoration: none;
    color: #3b82f6;
    transition: color 0.2s ease;
}

.link-animated::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    width: 0;
    height: 2px;
    background: #1f2937;
    transition: width 0.3s ease;
}

.link-animated:hover::after {
    width: 100%;
}

/* Slide Underline */
.link-slide::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: -100%;
    width: 100%;
    height: 2px;
    background: #1f2937;
    transition: left 0.3s ease;
}

.link-slide:hover::after {
    left: 0;
}
```

### 클릭 효과 (Active/Pressed)

```css
/* Scale Press */
.btn:active {
    transform: scale(0.95);
    transition: transform 0.1s ease;
}

/* Depth Press */
.btn-depth {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
}

.btn-depth:active {
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    transform: translateY(2px);
}

/* Ripple Click Effect */
.ripple {
    position: relative;
    overflow: hidden;
}

.ripple::after {
    content: '';
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
    width: 100px;
    height: 100px;
    margin-left: -50px;
    margin-top: -50px;
    animation: ripple-animation 0.6s;
    opacity: 0;
}

@keyframes ripple-animation {
    from {
        opacity: 1;
        transform: scale(0);
    }
    to {
        opacity: 0;
        transform: scale(4);
    }
}
```

### 포커스 효과 (Focus)

```css
.input-focus {
    border: 2px solid #e5e7eb;
    transition: all 0.2s ease;
}

.input-focus:focus {
    border-color: #1f2937;
    outline: none;
    box-shadow: 0 0 0 4px rgba(31, 41, 55, 0.1);
}

/* Glow Focus */
.input-glow:focus {
    box-shadow:
        0 0 0 3px rgba(59, 130, 246, 0.3),
        0 0 20px rgba(59, 130, 246, 0.2);
}

/* Pulse Focus */
@keyframes pulse-ring {
    0% {
        box-shadow: 0 0 0 0 rgba(31, 41, 55, 0.5);
    }
    100% {
        box-shadow: 0 0 0 10px rgba(31, 41, 55, 0);
    }
}

.input-pulse:focus {
    animation: pulse-ring 1.5s infinite;
}
```

### 페이지 전환 애니메이션

```css
/* Fade Transition */
@keyframes pageTransitionFade {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

.page-transition-fade {
    animation: pageTransitionFade 0.4s ease;
}

/* Slide Transition */
@keyframes pageTransitionSlide {
    from {
        opacity: 0;
        transform: translateX(-30px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.page-transition-slide {
    animation: pageTransitionSlide 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Scale Transition */
@keyframes pageTransitionScale {
    from {
        opacity: 0;
        transform: scale(0.95);
    }
    to {
        opacity: 1;
        transform: scale(1);
    }
}

.page-transition-scale {
    animation: pageTransitionScale 0.3s ease;
}
```

### 로딩 애니메이션

```css
/* Spinner */
@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #e5e7eb;
    border-top-color: #1f2937;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

/* Pulse Loader */
@keyframes pulse-loader {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.5;
    }
}

.pulse-loader {
    animation: pulse-loader 1.5s ease-in-out infinite;
}

/* Dots Loader */
.dots-loader {
    display: flex;
    gap: 8px;
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #1f2937;
    animation: dot-bounce 1.4s infinite ease-in-out;
}

.dot:nth-child(1) {
    animation-delay: -0.32s;
}

.dot:nth-child(2) {
    animation-delay: -0.16s;
}

@keyframes dot-bounce {
    0%,
    80%,
    100% {
        transform: scale(0);
    }
    40% {
        transform: scale(1);
    }
}

/* Progress Bar */
@keyframes progress {
    from {
        transform: translateX(-100%);
    }
    to {
        transform: translateX(100%);
    }
}

.progress-bar-animated {
    position: relative;
    overflow: hidden;
    background: #e5e7eb;
    height: 4px;
    border-radius: 2px;
}

.progress-bar-animated::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, #1f2937, transparent);
    animation: progress 1.5s ease-in-out infinite;
}

/* Skeleton Loader */
@keyframes skeleton-loading {
    0% {
        background-position: -200px 0;
    }
    100% {
        background-position: calc(200px + 100%) 0;
    }
}

.skeleton {
    background: linear-gradient(90deg, #e5e7eb 0px, #f3f4f6 40px, #e5e7eb 80px);
    background-size: 200px 100%;
    animation: skeleton-loading 1.2s ease-in-out infinite;
}
```

### 스크롤 애니메이션

```css
/* Fade In on Scroll */
@keyframes fadeInScroll {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.scroll-fade-in {
    animation: fadeInScroll 0.6s ease-out;
}

/* Slide In on Scroll */
@keyframes slideInScroll {
    from {
        opacity: 0;
        transform: translateX(-50px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.scroll-slide-in {
    animation: slideInScroll 0.6s ease-out;
}

/* Stagger Children Animation */
.stagger-container > * {
    animation: fadeInScroll 0.5s ease-out;
    animation-fill-mode: both;
}

.stagger-container > *:nth-child(1) {
    animation-delay: 0.1s;
}
.stagger-container > *:nth-child(2) {
    animation-delay: 0.2s;
}
.stagger-container > *:nth-child(3) {
    animation-delay: 0.3s;
}
.stagger-container > *:nth-child(4) {
    animation-delay: 0.4s;
}
.stagger-container > *:nth-child(5) {
    animation-delay: 0.5s;
}
```

---

## 마이크로 인터랙션 상세

### 1. 좋아요/북마크 버튼

```css
.like-button {
    position: relative;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: transparent;
    border: 2px solid #e5e7eb;
    cursor: pointer;
    transition: all 0.3s ease;
}

.like-button:hover {
    border-color: #ef4444;
    transform: scale(1.1);
}

.like-button.active {
    background: #ef4444;
    border-color: #ef4444;
    animation: likeAnimation 0.5s ease;
}

@keyframes likeAnimation {
    0% {
        transform: scale(1);
    }
    25% {
        transform: scale(1.3);
    }
    50% {
        transform: scale(0.9);
    }
    75% {
        transform: scale(1.1);
    }
    100% {
        transform: scale(1);
    }
}

/* Heart Icon Animation */
.like-button svg {
    transition: all 0.3s ease;
}

.like-button.active svg {
    fill: white;
    animation: heartBeat 0.3s ease;
}

@keyframes heartBeat {
    0%,
    100% {
        transform: scale(1);
    }
    50% {
        transform: scale(1.2);
    }
}
```

### 2. 알림 카운터

```css
.notification-badge {
    position: absolute;
    top: -8px;
    right: -8px;
    background: #ef4444;
    color: white;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 10px;
    min-width: 18px;
    text-align: center;
    animation: badgePulse 2s ease-in-out infinite;
}

@keyframes badgePulse {
    0%,
    100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
    }
    50% {
        transform: scale(1.05);
        box-shadow: 0 0 0 4px rgba(239, 68, 68, 0);
    }
}

/* New Badge Animation */
.notification-badge.new {
    animation: badgeAppear 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes badgeAppear {
    from {
        transform: scale(0) rotate(180deg);
        opacity: 0;
    }
    to {
        transform: scale(1) rotate(0deg);
        opacity: 1;
    }
}
```

### 3. 토스트 알림

```css
.toast {
    position: fixed;
    top: 24px;
    right: 24px;
    background: white;
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 12px;
    animation: toastSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 1000;
}

@keyframes toastSlideIn {
    from {
        transform: translateX(400px);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

.toast.exit {
    animation: toastSlideOut 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes toastSlideOut {
    from {
        transform: translateX(0);
        opacity: 1;
    }
    to {
        transform: translateX(400px);
        opacity: 0;
    }
}

/* Toast Progress Bar */
.toast-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    background: #1f2937;
    animation: toastProgress 3s linear;
}

@keyframes toastProgress {
    from {
        width: 100%;
    }
    to {
        width: 0;
    }
}

/* Success Toast */
.toast.success {
    border-left: 4px solid #10b981;
}

/* Error Toast */
.toast.error {
    border-left: 4px solid #ef4444;
}

/* Warning Toast */
.toast.warning {
    border-left: 4px solid #f59e0b;
}
```

### 4. 드래그 앤 드롭

```css
.draggable {
    cursor: grab;
    transition: all 0.2s ease;
}

.draggable:active {
    cursor: grabbing;
}

.draggable.dragging {
    opacity: 0.5;
    transform: scale(1.05) rotate(5deg);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.drop-zone {
    border: 2px dashed #e5e7eb;
    border-radius: 12px;
    padding: 24px;
    transition: all 0.2s ease;
}

.drop-zone.drag-over {
    border-color: #3b82f6;
    background: rgba(59, 130, 246, 0.05);
    transform: scale(1.02);
}

@keyframes dropSuccess {
    0% {
        background: rgba(16, 185, 129, 0.2);
    }
    100% {
        background: transparent;
    }
}

.drop-zone.drop-success {
    animation: dropSuccess 0.5s ease;
}
```

### 5. 복사하기 버튼

```css
.copy-button {
    position: relative;
    padding: 8px 16px;
    background: #f3f4f6;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.copy-button:hover {
    background: #e5e7eb;
}

.copy-button.copied {
    background: #d1fae5;
    color: #065f46;
}

.copy-button.copied::after {
    content: 'Copied!';
    position: absolute;
    top: -30px;
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    color: white;
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    white-space: nowrap;
    animation: tooltipFade 2s ease;
}

@keyframes tooltipFade {
    0%,
    100% {
        opacity: 0;
        transform: translateX(-50%) translateY(5px);
    }
    10%,
    90% {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
    }
}
```

### 6. 검색 인풋 애니메이션

```css
.search-input {
    position: relative;
    width: 200px;
    transition: width 0.3s ease;
}

.search-input:focus-within {
    width: 300px;
}

.search-input input {
    width: 100%;
    padding: 12px 40px 12px 16px;
    border: 2px solid #e5e7eb;
    border-radius: 24px;
    transition: all 0.2s ease;
}

.search-input input:focus {
    border-color: #1f2937;
    box-shadow: 0 0 0 4px rgba(31, 41, 55, 0.1);
}

.search-icon {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    transition: all 0.3s ease;
}

.search-input:focus-within .search-icon {
    transform: translateY(-50%) rotate(90deg);
}

/* Loading State */
.search-input.loading .search-icon {
    animation: spin 1s linear infinite;
}
```

### 7. 페이지네이션

```css
.pagination {
    display: flex;
    gap: 8px;
    align-items: center;
}

.pagination-item {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-weight: 500;
}

.pagination-item:hover {
    background: #f3f4f6;
    transform: translateY(-2px);
}

.pagination-item.active {
    background: #1f2937;
    color: white;
    transform: scale(1.1);
}

.pagination-item.disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.pagination-item.disabled:hover {
    transform: none;
}
```

### 8. 별점 (Rating)

```css
.rating {
    display: flex;
    gap: 4px;
}

.star {
    width: 24px;
    height: 24px;
    cursor: pointer;
    transition: all 0.2s ease;
    fill: #e5e7eb;
}

.star:hover,
.star.active {
    fill: #f59e0b;
    transform: scale(1.2) rotate(72deg);
}

.star.active {
    animation: starPop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes starPop {
    0% {
        transform: scale(0) rotate(0deg);
    }
    50% {
        transform: scale(1.3) rotate(180deg);
    }
    100% {
        transform: scale(1) rotate(72deg);
    }
}
```

### 9. 슬라이더 (Range Slider)

```css
.slider {
    -webkit-appearance: none;
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: #e5e7eb;
    outline: none;
    transition: all 0.2s ease;
}

.slider:hover {
    background: #d1d5db;
}

.slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #1f2937;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.slider::-webkit-slider-thumb:active {
    transform: scale(1.3);
    box-shadow: 0 0 0 8px rgba(31, 41, 55, 0.1);
}
```

### 10. 아코디언 애니메이션

```css
.accordion-item {
    border-bottom: 1px solid #e5e7eb;
    transition: all 0.2s ease;
}

.accordion-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 0;
    cursor: pointer;
    transition: all 0.2s ease;
}

.accordion-header:hover {
    color: #1f2937;
}

.accordion-icon {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.accordion-header.open .accordion-icon {
    transform: rotate(180deg);
}

.accordion-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.accordion-content.open {
    max-height: 500px;
    padding-bottom: 20px;
    animation: accordionSlideDown 0.3s ease;
}

@keyframes accordionSlideDown {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

---

## 애니메이션 라이브러리

### 유틸리티 애니메이션 클래스

```css
/* Fade Animations */
.fade-in {
    animation: fadeIn 0.3s ease;
}
.fade-out {
    animation: fadeOut 0.3s ease;
}
.fade-in-up {
    animation: fadeInUp 0.4s ease;
}
.fade-in-down {
    animation: fadeInDown 0.4s ease;
}
.fade-in-left {
    animation: fadeInLeft 0.4s ease;
}
.fade-in-right {
    animation: fadeInRight 0.4s ease;
}

@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes fadeInDown {
    from {
        opacity: 0;
        transform: translateY(-20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes fadeInLeft {
    from {
        opacity: 0;
        transform: translateX(-20px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

@keyframes fadeInRight {
    from {
        opacity: 0;
        transform: translateX(20px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

@keyframes fadeOut {
    from {
        opacity: 1;
    }
    to {
        opacity: 0;
    }
}

/* Zoom Animations */
.zoom-in {
    animation: zoomIn 0.3s ease;
}
.zoom-out {
    animation: zoomOut 0.3s ease;
}

@keyframes zoomIn {
    from {
        opacity: 0;
        transform: scale(0.8);
    }
    to {
        opacity: 1;
        transform: scale(1);
    }
}

@keyframes zoomOut {
    from {
        opacity: 1;
        transform: scale(1);
    }
    to {
        opacity: 0;
        transform: scale(0.8);
    }
}

/* Slide Animations */
.slide-in-left {
    animation: slideInLeft 0.4s ease;
}
.slide-in-right {
    animation: slideInRight 0.4s ease;
}
.slide-in-up {
    animation: slideInUp 0.4s ease;
}
.slide-in-down {
    animation: slideInDown 0.4s ease;
}

@keyframes slideInLeft {
    from {
        transform: translateX(-100%);
    }
    to {
        transform: translateX(0);
    }
}

@keyframes slideInRight {
    from {
        transform: translateX(100%);
    }
    to {
        transform: translateX(0);
    }
}

@keyframes slideInUp {
    from {
        transform: translateY(100%);
    }
    to {
        transform: translateY(0);
    }
}

@keyframes slideInDown {
    from {
        transform: translateY(-100%);
    }
    to {
        transform: translateY(0);
    }
}

/* Rotate Animations */
.rotate-in {
    animation: rotateIn 0.5s ease;
}
.rotate-out {
    animation: rotateOut 0.5s ease;
}

@keyframes rotateIn {
    from {
        opacity: 0;
        transform: rotate(-200deg) scale(0);
    }
    to {
        opacity: 1;
        transform: rotate(0) scale(1);
    }
}

@keyframes rotateOut {
    from {
        opacity: 1;
        transform: rotate(0) scale(1);
    }
    to {
        opacity: 0;
        transform: rotate(200deg) scale(0);
    }
}

/* Bounce Animations */
.bounce {
    animation: bounce 1s ease infinite;
}
.bounce-in {
    animation: bounceIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes bounceIn {
    0% {
        opacity: 0;
        transform: scale(0.3);
    }
    50% {
        opacity: 1;
        transform: scale(1.05);
    }
    70% {
        transform: scale(0.9);
    }
    100% {
        transform: scale(1);
    }
}

/* Shake Animation */
.shake {
    animation: shake 0.5s ease;
}

@keyframes shake {
    0%,
    100% {
        transform: translateX(0);
    }
    10%,
    30%,
    50%,
    70%,
    90% {
        transform: translateX(-10px);
    }
    20%,
    40%,
    60%,
    80% {
        transform: translateX(10px);
    }
}

/* Flip Animation */
.flip {
    animation: flip 0.6s ease;
}

@keyframes flip {
    0% {
        transform: perspective(400px) rotateY(0);
    }
    100% {
        transform: perspective(400px) rotateY(360deg);
    }
}

/* Swing Animation */
.swing {
    animation: swing 1s ease;
}

@keyframes swing {
    20% {
        transform: rotate(15deg);
    }
    40% {
        transform: rotate(-10deg);
    }
    60% {
        transform: rotate(5deg);
    }
    80% {
        transform: rotate(-5deg);
    }
    100% {
        transform: rotate(0deg);
    }
}

/* Heartbeat Animation */
.heartbeat {
    animation: heartbeat 1.5s ease infinite;
}

@keyframes heartbeat {
    0%,
    100% {
        transform: scale(1);
    }
    10%,
    30% {
        transform: scale(0.9);
    }
    20%,
    40% {
        transform: scale(1.1);
    }
}
```

### 애니메이션 타이밍 함수

```css
/* Easing Variables */
:root {
    --ease-in-quad: cubic-bezier(0.55, 0.085, 0.68, 0.53);
    --ease-in-cubic: cubic-bezier(0.55, 0.055, 0.675, 0.19);
    --ease-in-quart: cubic-bezier(0.895, 0.03, 0.685, 0.22);
    --ease-in-quint: cubic-bezier(0.755, 0.05, 0.855, 0.06);

    --ease-out-quad: cubic-bezier(0.25, 0.46, 0.45, 0.94);
    --ease-out-cubic: cubic-bezier(0.215, 0.61, 0.355, 1);
    --ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1);
    --ease-out-quint: cubic-bezier(0.23, 1, 0.32, 1);

    --ease-in-out-quad: cubic-bezier(0.455, 0.03, 0.515, 0.955);
    --ease-in-out-cubic: cubic-bezier(0.645, 0.045, 0.355, 1);
    --ease-in-out-quart: cubic-bezier(0.77, 0, 0.175, 1);
    --ease-in-out-quint: cubic-bezier(0.86, 0, 0.07, 1);

    --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
    --ease-elastic: cubic-bezier(0.68, -0.6, 0.32, 1.6);
}
```

### 애니메이션 딜레이 유틸리티

```css
.delay-100 {
    animation-delay: 0.1s;
}
.delay-200 {
    animation-delay: 0.2s;
}
.delay-300 {
    animation-delay: 0.3s;
}
.delay-400 {
    animation-delay: 0.4s;
}
.delay-500 {
    animation-delay: 0.5s;
}

.duration-100 {
    animation-duration: 0.1s;
}
.duration-200 {
    animation-duration: 0.2s;
}
.duration-300 {
    animation-duration: 0.3s;
}
.duration-500 {
    animation-duration: 0.5s;
}
.duration-700 {
    animation-duration: 0.7s;
}
.duration-1000 {
    animation-duration: 1s;
}
```

---

## 엘리베이션 & 그림자

### 그림자 레벨

| 레벨    | Box Shadow                   | 용도             |
| ------- | ---------------------------- | ---------------- |
| Level 0 | none                         | 기본 상태        |
| Level 1 | 0 1px 2px rgba(0,0,0,0.05)   | 입력 필드        |
| Level 2 | 0 1px 3px rgba(0,0,0,0.1)    | 카드 기본        |
| Level 3 | 0 4px 6px rgba(0,0,0,0.1)    | 카드 호버        |
| Level 4 | 0 10px 15px rgba(0,0,0,0.1)  | 드롭다운, 팝오버 |
| Level 5 | 0 25px 50px rgba(0,0,0,0.25) | 모달             |

### 그림자 애니메이션

```css
.shadow-transition {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: box-shadow 0.3s ease;
}

.shadow-transition:hover {
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
}

/* Glow Effect */
.glow {
    box-shadow: 0 0 10px rgba(59, 130, 246, 0.3);
    transition: box-shadow 0.3s ease;
}

.glow:hover {
    box-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
}

/* Inner Shadow */
.inner-shadow {
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
}
```

---

## 라운드 (Border Radius)

### 라운드 크기 체계

| 토큰         | 값     | 용도            |
| ------------ | ------ | --------------- |
| rounded-none | 0px    | -               |
| rounded-sm   | 4px    | 작은 뱃지, 태그 |
| rounded      | 8px    | 입력 필드, 버튼 |
| rounded-md   | 12px   | 작은 카드       |
| rounded-lg   | 16px   | 일반 카드       |
| rounded-xl   | 20px   | 필터 칩, 태그   |
| rounded-2xl  | 24px   | 모달            |
| rounded-full | 9999px | 아바타, 토글    |

### 컴포넌트별 라운드

```css
.btn {
    border-radius: 8px;
}
.input {
    border-radius: 8px;
}
.card {
    border-radius: 16px;
}
.modal {
    border-radius: 24px;
}
.avatar {
    border-radius: 50%;
}
.tag {
    border-radius: 16px;
}
.toggle {
    border-radius: 12px;
}
.badge {
    border-radius: 4px;
}
```

---

## 페이지별 상세 분석

### 1. 대시보드 메인 페이지

**애니메이션 특징:**

- 페이지 로드 시 카드 순차적 등장 (stagger animation)
- 통계 숫자 카운트업 애니메이션
- 차트 데이터 점진적 렌더링
- 호버 시 카드 상승 효과

### 2. 캠페인 관리 페이지

**인터랙션 특징:**

- 드래그 앤 드롭으로 캠페인 우선순위 변경
- 상태 변경 시 뱃지 색상 부드러운 전환
- 삭제 시 슬라이드 아웃 애니메이션
- 필터 적용 시 리스트 재정렬 애니메이션

### 3. 캠페인 생성 플로우

**모션 특징:**

- 스텝 간 슬라이드 전환
- 입력 값 유효성 검사 실시간 피드백
- 완료 시 success 애니메이션
- 뒤로 가기 시 역방향 슬라이드

### 4. 리포트 페이지

**애니메이션 특징:**

- 차트 로딩 스켈레톤 UI
- 데이터 포인트 순차 등장
- 필터 변경 시 부드러운 데이터 전환
- 내보내기 버튼 프로그레스 표시

---

## 성능 최적화 가이드

### 1. GPU 가속 활용

```css
/* GPU 가속이 필요한 애니메이션에는 transform 사용 */
.optimized-animation {
    will-change: transform, opacity;
    transform: translateZ(0);
}

/* 애니메이션 종료 후 will-change 제거 */
.optimized-animation.complete {
    will-change: auto;
}
```

### 2. 애니메이션 축소 옵션

```css
/* 사용자가 애니메이션 축소를 선호하는 경우 */
@media (prefers-reduced-motion: reduce) {
    * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
}
```

### 3. 레이어 최적화

```css
/* 별도 레이어로 승격하여 리페인트 최소화 */
.layer-optimized {
    transform: translate3d(0, 0, 0);
    backface-visibility: hidden;
}
```

---

## 마무리

Artience는 사용자 경험을 극대화하는 인터랙티브한 디자인을 지향합니다.

### 핵심 원칙

- **부드러운 전환**: 모든 상태 변화는 즉각적이지 않고 자연스러운 애니메이션 적용
- **명확한 피드백**: 사용자 액션에 대한 즉각적이고 명확한 시각적 피드백 제공
- **일관성**: 유사한 인터랙션에는 동일한 애니메이션 패턴 적용
- **성능**: 60fps를 유지하는 최적화된 애니메이션 구현
- **접근성**: 애니메이션 축소 옵션 지원

이 가이드를 참고하여 퍼포먼스 마케팅 대시보드에 생동감 있고 직관적인 인터랙션을 구현하시기 바랍니다.

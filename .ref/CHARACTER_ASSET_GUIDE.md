# Character Asset Guide

캐릭터 에셋 작업 시 아래 규격을 따라야 합니다.

## 현재 캐릭터 목록

| ch | Animal | Name | Agent ID | Role | Profile Image |
|----|--------|------|----------|------|---------------|
| ch0 | Otter (수달) | Dokba | `raccoon` | AI 어시스턴트 | `dokba_profile.png` |
| ch1 | Cat (고양이) | Sera | `a01` | 콘텐츠 마케터 | `cat_profile.png` |
| ch2 | Hamster (햄스터) | Rio | `a02` | 인턴 | `hamster_profile.png` |
| ch3 | Dog (시바견) | Luna | `a03` | PM | `dog_profile.png` |
| ch4 | Rabbit (토끼) | Alex | `a04` | 디자이너 | `rabbit_profile.png` |

## 캐릭터당 필요 파일 (5개)

```
ch{N}/
├── {Animal} Profile Headshot.png    ← 프로필/독바 헤드샷
├── {Animal}_NE_View.png             ← 뒷모습 (북동)
├── {Animal}_NW_View.png             ← 뒷모습 (북서)
├── {Animal}_SE_View.png             ← 앞모습 (남동)
└── {Animal}_SW_View.png             ← 앞모습 (남서)
```

## 렌더 사이즈 규격

- **맵 캐릭터 높이**: `72px` (ANIMAL_SPRITE_HEIGHT in `animal-runtime.ts`)
- 모든 캐릭터가 동일한 높이로 렌더링됨
- 소스 이미지의 원본 크기와 관계없이 세로 72px 기준 자동 스케일 적용

## 새 캐릭터 추가 절차

1. `.ref/image/ch{N}/` 폴더에 4방향 스프라이트 + 프로필 이미지 배치
2. `public/sprites/iso/` 에 방향별 스프라이트 복사:
   - `{animal}-nw.png`, `{animal}-ne.png`, `{animal}-sw.png`, `{animal}-se.png`
3. `public/assets/characters/` 에 프로필 이미지 복사:
   - `{animal}_profile.png`
4. `animal-runtime.ts` — `AnimalType` union 및 `ANIMAL_PATHS`에 추가
5. `platform.ts` — `SPRITES`, `AGENT_ANIMAL_MAP`, `DEFAULT_AGENTS`에 추가

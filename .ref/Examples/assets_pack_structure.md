# 에셋팩(첨부 ZIP) 구조 가이드(권장)

## 목표
비개발자도 ZIP 하나로 “테마/타일/오브젝트/스프라이트”를 쉽게 교체할 수 있게 한다.

## 권장 구조
asset_pack.zip
  pack.json
  tiles/
    floor.png
    wall.png
  objects/
    desk.png
    chair.png
  sprites/
    doggo_idle_12x1_256.png
    doggo_walk_8x1_256.png
  thumbs/
    preview.png

## pack.json 예시
{
  "name": "Minimal Office Pack",
  "version": "1.0.0",
  "tilesets": [
    { "id": "floor", "path": "tiles/floor.png", "tileSize": 32 },
    { "id": "wall", "path": "tiles/wall.png", "tileSize": 32 }
  ],
  "objects": [
    { "id": "desk", "path": "objects/desk.png", "w": 2, "h": 1, "collides": true },
    { "id": "chair", "path": "objects/chair.png", "w": 1, "h": 1, "collides": false }
  ],
  "sprites": [
    { "id": "doggo_idle", "path": "sprites/doggo_idle_12x1_256.png", "frame": 256, "frames": 12, "fps": 12 },
    { "id": "doggo_walk", "path": "sprites/doggo_walk_8x1_256.png", "frame": 256, "frames": 8, "fps": 12 }
  ]
}

## Import 원칙
- ZIP 업로드 → pack.json 파싱 → Assets 탭 등록
- “Apply Pack” 시 theme/world/agent sprite 키 매핑 UI 제공

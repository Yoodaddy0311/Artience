# 데이터 모델(요약)

## Project
- meta, theme, world, agents, recipes
- history: snapshots(Apply 단위)

## World
- width, height, tileSize
- layers: floor/wall/collision/objects/spawn

## Recipe
- command/args/cwd/env + parserRules

## Snapshot
- id, createdAt, summary, project(또는 patch)

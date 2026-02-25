# IPC 이벤트 계약(초안)

## Renderer → Main
- job:run { recipeId, args?, cwd? }
- job:stop { jobId }
- project:save { project }
- project:export { path }
- project:import { path }

## Main → Renderer
- job:started { jobId, recipeId, startedAt }
- job:log { jobId, stream: stdout|stderr, text, ts }
- job:ended { jobId, exitCode, endedAt }
- project:loaded { project }
- error { scope, message, detail? }

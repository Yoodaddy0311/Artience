# Team Meeting Flow

> Date: 2026-03-26
> Status: Planning note
> Purpose: Record the intended "assign -> gather -> discuss -> split -> work" flow and compare it with the current implementation.

---

## Goal

The intended platform flow is:

1. The user assigns a task through a prompt.
2. Dokba selects or summons the needed sub agents / team members.
3. The team gathers in the meeting room.
4. They discuss the task, exchange opinions, and reach a consensus.
5. After the plan is decided, each member moves to the work zone.
6. Each agent works on its assigned slice and reports progress/results.

This is meant to feel like a real office simulation, not just a terminal wrapper.

---

## Desired Runtime Sequence

### Phase 1. Task intake

- User submits a prompt or team command.
- Platform determines whether the task is solo or team-based.
- If team-based, create a meeting session before work begins.

### Phase 2. Team summon

- Required agents are mapped into `activeTeamMembers`.
- Party/status UI should show the active team immediately.
- Summoned members should enter a `meeting_pending` or `meeting_gathering` state instead of going directly to desks.

### Phase 3. Meeting room gathering

- All active participants move to the meeting zone.
- The meeting view should display:
    - participants
    - round timeline
    - opinions
    - current consensus
- World animation should make it visually obvious that the team is "in a meeting".

### Phase 4. Consensus

- Meeting manager runs one or more rounds.
- Consensus produces:
    - final approach
    - per-agent assignment
    - optional review/cross-check plan

### Phase 5. Work execution

- Only after consensus is reached, agents transition to work states.
- Each assigned member moves from meeting zone to work zone.
- Work states should then drive desk animation, progress, and mail/report output.

### Phase 6. Finish / return

- Success or error is shown per agent.
- Agents return to rest only after task completion, not immediately after meeting creation.

---

## What Already Exists

The current codebase already contains several pieces of this flow:

- `MeetingManager` exists and can create/start/stop meetings, collect opinions, and resolve consensus.
- `useMeetingStore` exists for meeting state in the renderer.
- `MeetingView` exists and can render round-by-round opinion timelines.
- `AgentTown` already has both meeting and work zones.
- `AgentTown` can move agents to:
    - meeting zone for `reading`
    - work desks for `thinking`, `working`, `typing`, `writing`
- `activeTeamMembers` already exists as the current team roster model.

In short: the building blocks are present.

---

## Current Gap

The intended flow is **not** fully connected end-to-end yet.

### Gap A. Team summon goes to desks too early

- When team members are added, they currently move toward desk/work positions.
- This skips the "gather in the meeting room first" behavior.

### Gap B. Meeting is not the default orchestration step

- Task delegation does not automatically create and start a meeting before work.
- The meeting system exists, but it is not yet the default entry point for team execution.

### Gap C. Meeting result does not fan out into explicit assignments

- Consensus is produced, but the code does not yet turn that result into a per-agent task split that drives the world state.

### Gap D. Meeting UI is not fully integrated into the main flow

- `MeetingView` exists, but it is not yet a guaranteed part of the standard "team task" user journey.

### Gap E. Meeting-specific state is missing

- Current world activity mapping uses `reading` as the closest proxy for moving into the meeting zone.
- A dedicated activity/state such as `meeting`, `gathering`, or `in_discussion` is still needed.

---

## Recommended Implementation Order

When this work resumes, implement in this order:

1. Add explicit meeting activities/states.
    - Example: `meeting_gathering`, `meeting_active`, `post_meeting_assignment`

2. Change team summon behavior.
    - New team members should go to the meeting zone first, not directly to desks.

3. Make meeting creation automatic for team tasks.
    - Team task starts should call `meeting:create` and `meeting:start`.

4. Wire consensus output into assignments.
    - Convert the final meeting result into per-agent task instructions.

5. Transition members from meeting zone to work zone only after consensus.

6. Integrate `MeetingView` into the main UX so the user can clearly see the meeting lifecycle.

---

## Design Decision

The office simulation should follow this rule:

> Team work begins with a meeting, and desk work begins only after agreement.

This should be treated as the canonical orchestration model for multi-agent collaboration.

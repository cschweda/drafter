import { SPRINT_MINUTES, useSprint } from '~/stats/sprint';
import type { Behavior } from './behavior';

/** The sprint's commands (Phase 1 design §7.3; out of `builtin.ts`, 2026-11-04). */
export function sprintBehaviors(): Record<string, Behavior> {
  const sprint = useSprint();
  const sprintOn = () => sprint.state.value.status !== 'idle';
  return {
    // Sprints (Phase 1 design §7.3): the three lengths here; any length from the Counts panel.
    ...Object.fromEntries(
      SPRINT_MINUTES.map((minutes): [string, Behavior] => [
        `sprint-${minutes}`,
        { enabled: () => !sprintOn(), run: () => sprint.start(minutes) },
      ]),
    ),
    'sprint-pause': {
      enabled: () => sprint.state.value.status === 'running',
      run: sprint.pause,
    },
    'sprint-resume': {
      enabled: () => sprint.state.value.status === 'paused',
      run: sprint.resume,
    },
    'sprint-stop': { enabled: sprintOn, run: sprint.stop },
    'sprint-hide': {
      enabled: () => sprintOn() && !sprint.hidden.value,
      run: () => {
        sprint.hidden.value = true;
      },
    },
    'sprint-show': {
      enabled: () => sprintOn() && sprint.hidden.value,
      run: () => {
        sprint.hidden.value = false;
      },
    },
  };
}

// The rows of the `settings` table that belong to a script: its goal and each day's starting
// counts. They sit outside the `Settings` shape, like a module's `module:<id>:<key>` rows.

export const GOAL_PREFIX = 'goal:';
export const DAY_PREFIX = 'day:';

export const goalKey = (projectId: string) => `${GOAL_PREFIX}${projectId}`;
/** `date` is the local `YYYY-MM-DD`. */
export const dayKey = (projectId: string, date: string) => `${DAY_PREFIX}${projectId}:${date}`;
/** The range of keys holding every day of a script. */
export const daysOf = (projectId: string): [string, string] => [
  `${DAY_PREFIX}${projectId}:`,
  `${DAY_PREFIX}${projectId}:\uffff`,
];

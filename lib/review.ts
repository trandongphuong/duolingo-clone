const DAY = 86_400_000;
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14] as const;

/** Simple spaced practice: wrong answers become due now; correct answers move one step. */
export function nextReview(
  previousStep: number,
  correct: boolean,
  now = new Date()
) {
  const current = Math.max(0, Math.min(3, Math.trunc(previousStep)));
  return {
    step: correct ? Math.min(current + 1, 3) : 0,
    dueAt: new Date(
      now.getTime() + (correct ? REVIEW_INTERVAL_DAYS[current] * DAY : 0)
    ),
    lastResult: correct,
  };
}

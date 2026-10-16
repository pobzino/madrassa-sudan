import { describe, it, expect } from 'vitest';
import {
  evaluatePath,
  isPlacementOffered,
  isTestPassed,
  milestoneNodeId,
  placementState,
  splitPathMilestones,
  type PathInput,
  type StudentProgressInput,
  type TestResultInput,
} from '@/lib/learning-path';

// Two weeks: week 1 has 2 lessons + a test, week 2 has 2 lessons (no test).
const PATH: PathInput = {
  weeks: [
    {
      id: 'w1',
      weekNumber: 1,
      testAssignmentId: 'test1',
      steps: [
        { id: 's1', lessonId: 'l1', sequence: 1 },
        { id: 's2', lessonId: 'l2', sequence: 2 },
      ],
    },
    {
      id: 'w2',
      weekNumber: 2,
      testAssignmentId: null,
      steps: [
        { id: 's3', lessonId: 'l3', sequence: 1 },
        { id: 's4', lessonId: 'l4', sequence: 2 },
      ],
    },
  ],
};

function progress(
  completion: Record<string, boolean | 'started'>,
  testResults: Record<string, TestResultInput> = {}
): StudentProgressInput {
  const lessonCompletion: StudentProgressInput['lessonCompletion'] = {};
  for (const [lessonId, v] of Object.entries(completion)) {
    lessonCompletion[lessonId] = {
      completed: v === true,
      started: v === true || v === 'started',
    };
  }
  return { lessonCompletion, testResults };
}

const passingTest: TestResultInput = { status: 'graded', score: 9, totalPoints: 10, passingScore: 80 };
const failingTest: TestResultInput = { status: 'graded', score: 5, totalPoints: 10, passingScore: 80 };

describe('isTestPassed', () => {
  it('passes at exactly the threshold', () => {
    expect(isTestPassed({ status: 'graded', score: 8, totalPoints: 10, passingScore: 80 })).toBe(true);
  });
  it('fails below the threshold', () => {
    expect(isTestPassed({ status: 'graded', score: 7.9, totalPoints: 10, passingScore: 80 })).toBe(false);
  });
  it('is not passed while still submitted/ungraded', () => {
    expect(isTestPassed({ status: 'submitted', score: 10, totalPoints: 10, passingScore: 80 })).toBe(false);
  });
  it('is not passed without a score', () => {
    expect(isTestPassed({ status: 'graded', score: null, totalPoints: 10, passingScore: 80 })).toBe(false);
  });
});

describe('evaluatePath', () => {
  it('with no progress, only week 1 step 1 is available; week 2 locked', () => {
    const r = evaluatePath(PATH, progress({}));
    expect(r.weeks[0].state).toBe('available');
    expect(r.weeks[0].steps[0].state).toBe('available');
    expect(r.weeks[0].steps[1].state).toBe('locked'); // sequential
    expect(r.weeks[0].testState).toBe('locked'); // lessons not done
    expect(r.weeks[1].state).toBe('locked');
    expect(r.currentStepId).toBe('s1');
  });

  it('gates step 2 behind step 1, then bird advances', () => {
    const r = evaluatePath(PATH, progress({ l1: true }));
    expect(r.weeks[0].steps[0].state).toBe('completed');
    expect(r.weeks[0].steps[1].state).toBe('available');
    expect(r.currentStepId).toBe('s2');
  });

  it('finishing week 1 lessons unlocks the test but NOT week 2', () => {
    const r = evaluatePath(PATH, progress({ l1: true, l2: true }));
    expect(r.weeks[0].testState).toBe('available');
    expect(r.weeks[0].state).toBe('in_progress'); // lessons done, test unpassed
    expect(r.weeks[1].state).toBe('locked');
    expect(r.currentStepId).toBe('test-w1'); // bird on the test node
  });

  it('failing the test keeps week 2 locked and marks the test failed', () => {
    const r = evaluatePath(PATH, progress({ l1: true, l2: true }, { test1: failingTest }));
    expect(r.weeks[0].testState).toBe('failed');
    expect(r.weeks[0].state).toBe('in_progress');
    expect(r.weeks[1].state).toBe('locked');
    expect(r.currentStepId).toBe('test-w1');
  });

  it('passing the test completes week 1 and unlocks week 2', () => {
    const r = evaluatePath(PATH, progress({ l1: true, l2: true }, { test1: passingTest }));
    expect(r.weeks[0].testState).toBe('passed');
    expect(r.weeks[0].state).toBe('completed');
    expect(r.weeks[1].state).toBe('available');
    expect(r.weeks[1].steps[0].state).toBe('available');
    expect(r.currentStepId).toBe('s3'); // bird advanced into week 2
  });

  it('does not unlock a later week from out-of-order lesson completion', () => {
    const p: PathInput = {
      weeks: [
        { id: 'w1', weekNumber: 1, testAssignmentId: null, steps: [{ id: 'a', lessonId: 'la', sequence: 1 }] },
        { id: 'w2', weekNumber: 2, testAssignmentId: null, steps: [{ id: 'b', lessonId: 'lb', sequence: 1 }] },
        { id: 'w3', weekNumber: 3, testAssignmentId: null, steps: [{ id: 'c', lessonId: 'lc', sequence: 1 }] },
      ],
    };
    const r = evaluatePath(p, progress({ lc: true }));
    expect(r.weeks[0].state).toBe('available');
    expect(r.weeks[1].state).toBe('locked');
    expect(r.weeks[2].state).toBe('locked');
    expect(r.currentStepId).toBe('a');
  });

  it('unlocks every lesson and test in staff review mode without completing progress', () => {
    const r = evaluatePath(PATH, progress({}), { unlockAll: true });

    expect(r.weeks[0].steps.map((step) => step.state)).toEqual(['available', 'available']);
    expect(r.weeks[1].steps.map((step) => step.state)).toEqual(['available', 'available']);
    expect(r.weeks[0].testState).toBe('available');
    expect(r.weeks[1].state).toBe('available');
  });

  it('a week with no test completes on lessons alone (finishing everything)', () => {
    const r = evaluatePath(
      PATH,
      progress({ l1: true, l2: true, l3: true, l4: true }, { test1: passingTest })
    );
    expect(r.weeks[1].state).toBe('completed');
    expect(r.currentStepId).toBeNull(); // nothing left
    expect(r.currentWeekId).toBeNull();
  });
});

describe('per-step practice gating', () => {
  // One week, two lessons; each lesson gates on its own practice.
  const PRACTICE_PATH: PathInput = {
    weeks: [
      {
        id: 'w1',
        weekNumber: 1,
        testAssignmentId: null,
        steps: [
          { id: 's1', lessonId: 'l1', sequence: 1, practiceAssignmentId: 'p1' },
          { id: 's2', lessonId: 'l2', sequence: 2, practiceAssignmentId: 'p2' },
        ],
      },
    ],
  };

  it('watching the video alone does not complete a practice step', () => {
    const result = evaluatePath(PRACTICE_PATH, progress({ l1: true }));
    const [s1, s2] = result.weeks[0].steps;
    expect(s1.state).toBe('in_progress');
    expect(s1.practiceState).toBe('available');
    expect(s1.lessonWatched).toBe(true);
    expect(s2.state).toBe('locked');
    expect(result.currentStepId).toBe('s1');
  });

  it('passing the practice completes the step and unlocks the next', () => {
    const result = evaluatePath(
      PRACTICE_PATH,
      progress({ l1: true }, { p1: passingTest })
    );
    const [s1, s2] = result.weeks[0].steps;
    expect(s1.state).toBe('completed');
    expect(s1.practiceState).toBe('passed');
    expect(s2.state).toBe('available');
    expect(result.currentStepId).toBe('s2');
  });

  it('failing the practice keeps the step in progress with a retryable practice', () => {
    const result = evaluatePath(
      PRACTICE_PATH,
      progress({ l1: true }, { p1: failingTest })
    );
    const [s1, s2] = result.weeks[0].steps;
    expect(s1.state).toBe('in_progress');
    expect(s1.practiceState).toBe('failed');
    expect(s2.state).toBe('locked');
  });

  it('week completes only when every practice is passed', () => {
    const partial = evaluatePath(
      PRACTICE_PATH,
      progress({ l1: true, l2: true }, { p1: passingTest })
    );
    expect(partial.weeks[0].state).toBe('in_progress');

    const full = evaluatePath(
      PRACTICE_PATH,
      progress({ l1: true, l2: true }, { p1: passingTest, p2: passingTest })
    );
    expect(full.weeks[0].state).toBe('completed');
    expect(full.currentStepId).toBeNull();
  });

  it('steps without a practice keep the original completion rule', () => {
    const result = evaluatePath(PATH, progress({ l1: true }));
    expect(result.weeks[0].steps[0].state).toBe('completed');
    expect(result.weeks[0].steps[0].practiceState).toBe('none');
  });
});

describe('milestones (Big Challenge after every 4 weeks)', () => {
  // Eight one-lesson weeks (no week tests), lesson ids l1..l8.
  const weeks = Array.from({ length: 8 }, (_, i) => ({
    id: `w${i + 1}`,
    weekNumber: i + 1,
    testAssignmentId: null,
    steps: [{ id: `s${i + 1}`, lessonId: `l${i + 1}`, sequence: 1 }],
  }));
  const PATH_8: PathInput = { weeks, milestones: [{ id: 'm4', afterWeekNumber: 4 }] };
  const doneThrough = (n: number) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`l${i + 1}`, true as const]));
  const withMilestones = (
    base: StudentProgressInput,
    extra: Pick<StudentProgressInput, 'passedMilestoneIds' | 'activeBattleMilestoneIds'>
  ): StudentProgressInput => ({ ...base, ...extra });

  it('keeps the milestone locked until week 4 is completed', () => {
    const r = evaluatePath(PATH_8, progress(doneThrough(3)));
    expect(r.milestones).toEqual([{ id: 'm4', afterWeekNumber: 4, state: 'locked' }]);
    expect(r.weeks[4].state).toBe('locked');
    expect(r.currentStepId).toBe('s4');
  });

  it('opens the milestone after week 4 and keeps week 5 locked; the bird waits there', () => {
    const r = evaluatePath(PATH_8, progress(doneThrough(4)));
    expect(r.weeks[3].state).toBe('completed');
    expect(r.milestones[0].state).toBe('available');
    expect(r.weeks[4].state).toBe('locked');
    expect(r.weeks[4].steps[0].state).toBe('locked');
    expect(r.currentStepId).toBe(milestoneNodeId('m4'));
    expect(r.currentStepId).toBe('milestone-m4');
    expect(r.currentWeekId).toBe('w4');
  });

  it('shows an active battle as in_battle and still gates week 5', () => {
    const r = evaluatePath(
      PATH_8,
      withMilestones(progress(doneThrough(4)), { activeBattleMilestoneIds: ['m4'] })
    );
    expect(r.milestones[0].state).toBe('in_battle');
    expect(r.weeks[4].state).toBe('locked');
    expect(r.currentStepId).toBe('milestone-m4');
  });

  it('passing the milestone unlocks week 5 and moves the bird on', () => {
    const r = evaluatePath(
      PATH_8,
      withMilestones(progress(doneThrough(4)), { passedMilestoneIds: ['m4'], activeBattleMilestoneIds: ['m4'] })
    );
    expect(r.milestones[0].state).toBe('passed');
    expect(r.weeks[4].state).toBe('available');
    expect(r.weeks[4].steps[0].state).toBe('available');
    expect(r.currentStepId).toBe('s5');
    expect(r.currentWeekId).toBe('w5');
  });

  it('a passed milestone without the block completed shows passed but does not unlock week 5', () => {
    const r = evaluatePath(
      PATH_8,
      withMilestones(progress(doneThrough(3)), { passedMilestoneIds: ['m4'] })
    );
    expect(r.milestones[0].state).toBe('passed');
    expect(r.weeks[3].state).toBe('available');
    expect(r.weeks[4].state).toBe('locked');
    expect(r.currentStepId).toBe('s4');
  });

  it('later lesson progress cannot skip past an unpassed milestone', () => {
    const r = evaluatePath(PATH_8, progress(doneThrough(8)));
    expect(r.milestones[0].state).toBe('available');
    expect(r.weeks.slice(4).map((w) => w.state)).toEqual(['locked', 'locked', 'locked', 'locked']);
    expect(r.currentStepId).toBe('milestone-m4');
  });

  it('respects the week test before opening the milestone', () => {
    const tested: PathInput = {
      weeks: weeks.map((w) => (w.weekNumber === 4 ? { ...w, testAssignmentId: 't4' } : w)),
      milestones: [{ id: 'm4', afterWeekNumber: 4 }],
    };
    const before = evaluatePath(tested, progress(doneThrough(4)));
    expect(before.milestones[0].state).toBe('locked');
    expect(before.currentStepId).toBe('test-w4');

    const after = evaluatePath(tested, progress(doneThrough(4), { t4: passingTest }));
    expect(after.milestones[0].state).toBe('available');
    expect(after.currentStepId).toBe('milestone-m4');
  });

  it('unlockAll opens every milestone and week without changing progress', () => {
    const r = evaluatePath(PATH_8, progress({}), { unlockAll: true });
    expect(r.milestones[0].state).toBe('available');
    expect(r.weeks.every((w) => w.state !== 'locked')).toBe(true);
    expect(r.weeks[4].steps[0].state).toBe('available');

    const battling = evaluatePath(
      PATH_8,
      withMilestones(progress({}), { activeBattleMilestoneIds: ['m4'] }),
      { unlockAll: true }
    );
    expect(battling.milestones[0].state).toBe('in_battle');
  });

  it('omits a milestone whose week does not exist', () => {
    const r = evaluatePath(
      { weeks: weeks.slice(0, 6), milestones: [{ id: 'm4', afterWeekNumber: 4 }, { id: 'm8', afterWeekNumber: 8 }] },
      progress(doneThrough(4))
    );
    expect(r.milestones.map((m) => m.id)).toEqual(['m4']);
  });

  it('chains milestones: week 9 needs milestone 8 as well', () => {
    const nine = [...weeks, { id: 'w9', weekNumber: 9, testAssignmentId: null, steps: [{ id: 's9', lessonId: 'l9', sequence: 1 }] }];
    const r = evaluatePath(
      { weeks: nine, milestones: [{ id: 'm8', afterWeekNumber: 8 }, { id: 'm4', afterWeekNumber: 4 }] },
      withMilestones(progress(doneThrough(8)), { passedMilestoneIds: ['m4'] })
    );
    expect(r.milestones.map((m) => [m.id, m.state])).toEqual([['m4', 'passed'], ['m8', 'available']]);
    expect(r.weeks[8].state).toBe('locked');
    expect(r.currentStepId).toBe('milestone-m8');
  });

  it('with no milestones the output matches the original engine exactly', () => {
    const cases: Array<[PathInput, StudentProgressInput]> = [
      [PATH, progress({})],
      [PATH, progress({ l1: true, l2: true })],
      [PATH, progress({ l1: true, l2: true }, { test1: passingTest })],
      [{ weeks }, progress(doneThrough(5))],
    ];
    for (const [path, prog] of cases) {
      const withEmpty = evaluatePath({ ...path, milestones: [] }, prog);
      const without = evaluatePath({ weeks: path.weeks }, prog);
      expect(withEmpty).toEqual(without);
      expect(without.milestones).toEqual([]);
    }
    // Without milestones nothing gates week 5.
    const r = evaluatePath({ weeks }, progress(doneThrough(4)));
    expect(r.weeks[4].state).toBe('available');
    expect(r.currentStepId).toBe('s5');
  });
});

describe('placement ("Meet your first boss")', () => {
  const weeks = Array.from({ length: 8 }, (_, i) => ({
    id: `w${i + 1}`,
    weekNumber: i + 1,
    testAssignmentId: null,
    steps: [{ id: `s${i + 1}`, lessonId: `l${i + 1}`, sequence: 1 }],
  }));
  const rows = [
    { id: 'pl', kind: 'placement', after_week_number: 0 },
    { id: 'm4', kind: 'milestone', after_week_number: 4 },
  ];

  it('never enters milestones and never gates week 1', () => {
    const split = splitPathMilestones(rows);
    expect(split.placement?.id).toBe('pl');
    expect(split.milestones.map((m) => m.id)).toEqual(['m4']);
    const r = evaluatePath(
      { weeks, milestones: split.milestones.map((m) => ({ id: m.id, afterWeekNumber: m.after_week_number })) },
      progress({})
    );
    expect(r.milestones.map((m) => m.id)).toEqual(['m4']);
    expect(r.weeks[0].state).toBe('available');
    expect(r.weeks[0].steps[0].state).toBe('available');
    expect(r.currentStepId).toBe('s1');
  });

  it('treats a week-0 row as the placement even without a kind', () => {
    const split = splitPathMilestones([{ id: 'x', after_week_number: 0 }, { id: 'm4', after_week_number: 4 }]);
    expect(split.placement?.id).toBe('x');
    expect(split.milestones.map((m) => m.id)).toEqual(['m4']);
  });

  it('is offered once to everyone (0, 3 or 4+ lessons done) until completed', () => {
    // Owner default: every learner may meet the boss once per path; a late one is flagged by the server.
    for (const done of [0, 3, 4, 12]) {
      expect({ done, offered: isPlacementOffered(placementState([])) }).toEqual({ done, offered: true });
    }
    expect(isPlacementOffered(placementState([{ status: 'active', supersededAt: null, isPreview: false }]))).toBe(true);
    expect(isPlacementOffered(placementState([{ status: 'completed', supersededAt: null, isPreview: false }]))).toBe(false);
  });

  it('completed vs superseded vs preview', () => {
    expect(placementState([{ status: 'completed', supersededAt: null, isPreview: false }])).toBe('completed');
    // A staff reset supersedes the old result: the child can play again.
    expect(placementState([{ status: 'completed', supersededAt: '2026-10-16T00:00:00Z', isPreview: false }])).toBe('available');
    expect(
      placementState([
        { status: 'completed', supersededAt: '2026-10-16T00:00:00Z', isPreview: false },
        { status: 'active', supersededAt: null, isPreview: false },
      ])
    ).toBe('in_battle');
    // A staff preview never counts as met.
    expect(placementState([{ status: 'completed', supersededAt: null, isPreview: true }])).toBe('available');
  });
});

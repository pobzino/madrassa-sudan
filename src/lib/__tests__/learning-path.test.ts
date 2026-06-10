import { describe, it, expect } from 'vitest';
import {
  evaluatePath,
  isTestPassed,
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

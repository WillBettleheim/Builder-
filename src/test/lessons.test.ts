import { describe, expect, it } from 'vitest';
import { LESSONS } from '../lessons';
import { QUIZZES } from '../quizzes';
import { PARTS } from '../sim/parts';
import { runSketch } from './helpers';

describe('lessons', () => {
  it('has unique ids', () => {
    expect(new Set(LESSONS.map(l => l.id)).size).toBe(LESSONS.length);
  });

  for (const l of LESSONS) {
    describe(l.title, () => {
      it('uses only real parts', () => {
        for (const p of l.parts) expect(PARTS[p.type], p.type).toBeDefined();
      });

      it('starter code runs', () => {
        expect(() => runSketch(l.code, 3000)).not.toThrow();
      });

      it('solution runs', () => {
        expect(() => runSketch(l.solution || l.code, 3000)).not.toThrow();
      });

      it('has a quiz whose answers exist', () => {
        const qs = QUIZZES[l.id];
        expect(qs?.length).toBeGreaterThan(0);
        for (const q of qs) expect(q.a[q.correct]).toBeDefined();
      });
    });
  }
});

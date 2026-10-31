import { describe, expect, it } from 'vitest';
import { LESSONS } from '../lessons';
import { QUIZZES } from '../quizzes';
import { PARTS } from '../sim/parts';
import { RuntimeError } from '../interp/interpreter';
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
        // a bug hunt may start with a sketch that crashes on purpose, but it must still compile
        if (l.level === 'Debug') {
          try { runSketch(l.code, 3000); } catch (e) { expect(e).toBeInstanceOf(RuntimeError); }
        } else expect(() => runSketch(l.code, 3000)).not.toThrow();
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

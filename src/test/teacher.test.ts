import { describe, expect, it } from 'vitest';
import { pack } from '../ui/codec';
import { classCsv, importReports, newClassCode, readInvite, type Report, type TeacherStore } from '../ui/teacher';

const report = (n: string, t: number, done: string[], c = 'ABC234'): Report => ({ v: 1, c, n, t, done, part: { fade: 1 }, badges: 3, quiz: 4 });
const store = (): TeacherStore => ({ classes: [{ code: 'ABC234', name: 'Robotics', teacher: 'Ms P', created: 0 }], reports: {} });
const lessons = [{ id: 'blink', title: 'Blink', level: 'Basics', goals: 2 }, { id: 'fade', title: 'Fade', level: 'Basics', goals: 2 }];

describe('teacher mode', () => {
  it('makes readable class codes', () => {
    const code = newClassCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it('reads invite links back', async () => {
    expect(await readInvite(await pack({ c: 'ABC234', n: 'Robotics', t: 'Ms P' }))).toEqual({ code: 'ABC234', name: 'Robotics', teacher: 'Ms P' });
    expect(await readInvite('not-a-real-link')).toBeNull();
  });

  it('imports pasted report links, keeping each student’s newest and skipping other classes', async () => {
    const s = store();
    const text = [
      `see https://x/#report=${await pack(report('Ana', 2, ['blink']))}`,
      `https://x/#report=${await pack(report('ana', 1, []))}`, // older, same student
      `https://x/#report=${await pack(report('Ben', 5, [], 'ZZZ999'))}`, // another class
      'https://x/#report=garbage',
    ].join('\n');
    expect(await importReports(s, text)).toEqual({ added: 1, skipped: 3 });
    expect(Object.keys(s.reports.ABC234)).toEqual(['ana']);
    expect(s.reports.ABC234.ana.done).toEqual(['blink']);
  });

  it('exports a CSV row per student with a column per lesson', async () => {
    const s = store();
    await importReports(s, `report=${await pack(report('Ana', 2, ['blink']))}`);
    expect(classCsv(s, 'ABC234', lessons).split('\n')[1]).toBe('"Ana",1,3,4,"1970-01-01T00:00:00.002Z",done,1/2');
  });
});

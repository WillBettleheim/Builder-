// Hostile input: crafted share links, imported files, saved data and sketches.
import { describe, expect, it } from 'vitest';
import { MAX_UNPACKED, pack, unpack } from '../ui/codec';
import { escapeHtml } from '../ui/html';
import { cleanPartList, cleanProps, cleanWireList, isHexColor } from '../sim/sanitize';
import { RuntimeError } from '../interp/interpreter';
import { Board } from '../sim/board';
import { classCsv, cleanReport, readInvite } from '../ui/teacher';
import { inSetup, runSketch } from './helpers';
import { LESSONS } from '../lessons';

const XSS = '"><img src=x onerror=alert(1)>';

describe('HTML escaping', () => {
  it('escapes every character that can break out of text or an attribute', () => {
    expect(escapeHtml(`<a href='x' title="y">&</a>`)).toBe('&lt;a href=&#39;x&#39; title=&quot;y&quot;&gt;&amp;&lt;/a&gt;');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('scene sanitising', () => {
  it('drops props that are not real values for the part', () => {
    const p = cleanProps('pot', { value: XSS });
    expect(p.value).toBeUndefined();
    expect(cleanProps('led', { color: XSS }).color).toBeUndefined();
    expect(cleanProps('led', { color: 'green' }).color).toBe('green');
  });

  it('clamps range props into their limits', () => {
    expect(cleanProps('pot', { value: 1e12 }).value).toBe(1023);
    expect(cleanProps('pot', { value: Number.NaN }).value).toBeUndefined();
  });

  it('keeps only unknown-free parts with safe ids and numbers', () => {
    const list = cleanPartList([
      { type: '__proto__' }, { type: 'nope' }, null, 'x',
      { id: XSS, type: 'led', x: Infinity, z: 1e9, rot: 7, pins: { pin: 99, [XSS]: 3 }, props: { color: 'blue', mount: XSS } },
    ]);
    expect(list).toHaveLength(1);
    const [led] = list;
    expect(led.id).toMatch(/^[\w-]+$/);
    expect(led.x).toBe(0);
    expect(led.z).toBe(400);
    expect(led.rot).toBe(3);
    expect(led.pins).toEqual({ pin: null });
    expect(led.props).toEqual({ color: 'blue' });
  });

  it('keeps every prop the lessons themselves set', () => {
    for (const l of LESSONS) {
      for (const spec of l.parts) {
        expect(cleanProps(spec.type, spec.props ?? {}), `${l.id} ${spec.type}`).toEqual(spec.props ?? {});
      }
    }
  });

  it('caps the number of parts', () => {
    expect(cleanPartList(Array.from({ length: 5000 }, () => ({ type: 'led' })))).toHaveLength(200);
  });

  it('limits SD card files from a link to safe names and a small size', () => {
    const files = cleanProps('sdcard', { files: { 'log.txt': 'x'.repeat(1e6), [XSS]: 'a', 'b.txt': 5 } }).files;
    expect(Object.keys(files)).toEqual(['log.txt']);
    expect(files['log.txt'].length).toBe(64 * 1024);
  });

  it('only accepts hex wire colours and part:terminal endpoints', () => {
    const w = cleanWireList([
      { a: 'uno:13', b: 'led:pin', color: `red;background:url(//evil)` },
      { a: XSS, b: 'led:pin', color: '#fff' },
      { a: 'uno:GND', b: 'led:gnd', color: '#2a2a2e' },
    ], () => 'w-new')!;
    expect(w.map(x => x.color)).toEqual(['#3b82c4', '#2a2a2e']);
    expect(isHexColor('#12345')).toBe(true);
    expect(isHexColor('expression(alert(1))')).toBe(false);
  });
});

describe('share link decoding', () => {
  it('round-trips normal data', async () => {
    expect(await unpack(await pack({ a: [1, 2, 3] }))).toEqual({ a: [1, 2, 3] });
  });

  it('refuses a tiny link that inflates past the limit (zip bomb)', async () => {
    const bomb = await pack({ s: ' '.repeat(MAX_UNPACKED * 3) });
    expect(bomb.length).toBeLessThan(20_000);
    await expect(unpack(bomb)).rejects.toThrow(/too large/);
  });

  it('refuses absurdly long links', async () => {
    await expect(unpack('A'.repeat(300_000))).rejects.toThrow(/too long/);
  });
});

describe('teacher reports', () => {
  it('forces every field to a safe type', () => {
    const r = cleanReport({ v: 1, c: 'ABC123', n: 'Sam', t: 'x', done: ['blink', 5], part: { __proto__: 3, blink: '2' }, badges: XSS, quiz: -4 })!;
    expect(r).toMatchObject({ n: 'Sam', t: 0, done: ['blink'], badges: 0, quiz: 0 });
    expect(Object.keys(r.part)).toEqual([]);
  });

  it('rejects names that would reach the object prototype', () => {
    expect(cleanReport({ v: 1, c: 'ABC123', n: '__proto__', done: [] })).toBeNull();
  });

  it('rejects invites with a malformed class code', async () => {
    const { pack } = await import('../ui/codec');
    expect(await readInvite(await pack({ c: XSS, n: 'Class' }))).toBeNull();
  });

  it('stops spreadsheet formulas in exported names', () => {
    const csv = classCsv({ classes: [], reports: { C: { a: { v: 1, c: 'C', n: '=HYPERLINK("http://x")', t: 0, done: [], part: {}, badges: 0, quiz: 0 } } } }, 'C', []);
    expect(csv.split('\n')[1].startsWith(`"'=HYPERLINK`)).toBe(true);
  });
});

describe('sketch limits', () => {
  it('refuses arrays far bigger than the board’s memory', () => {
    expect(() => runSketch(inSetup('long big[100000000];'), 50)).toThrow(/too big/);
    expect(() => runSketch(inSetup('int grid[1000][1000];'), 50)).toThrow(RuntimeError);
  });

  it('stops runaway recursion with a message instead of crashing the tab', () => {
    expect(() => runSketch(inSetup('f(0);', 'int f(int n) { return f(n + 1); }'), 50)).toThrow(/recursion/);
  });

  it('stops a String that doubles forever', () => {
    expect(() => runSketch(inSetup('String s = "ab"; while (true) { s += s; }'), 50)).toThrow(/too long/);
  });

  it('clamps print digits and number bases instead of crashing', () => {
    const out = runSketch(inSetup('Serial.println(1.5, 500); Serial.println(255, 99); Serial.println(255, 0);'), 50).serial.trim().split('\n');
    expect(out[0]).toMatch(/^1\.50+$/);
    expect(out[1]).toBe('73'); // base clamped to 36
    expect(out[2]).toBe('255');
  });

  it('fills the SD card only so far, and rejects odd file names', () => {
    const files: Record<string, string> = {};
    const board = new Board();
    board.listeners.push({ sd: cs => (cs === 10 ? files : undefined) });
    expect(() => runSketch(inSetup('SD.begin(10); File f = SD.open("log.txt", FILE_WRITE); while (true) f.print("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");'), 2000, board)).toThrow(/full/);
    expect(files['log.txt'].length).toBeLessThanOrEqual(64 * 1024);
    const b2 = new Board();
    const f2: Record<string, string> = {};
    b2.listeners.push({ sd: cs => (cs === 10 ? f2 : undefined) });
    expect(() => runSketch(inSetup('SD.begin(10); File f = SD.open("__proto__/../x<>", FILE_WRITE);'), 50, b2)).toThrow(/file name/);
    expect(Object.hasOwn(f2, '__proto__')).toBe(false);
  });
});

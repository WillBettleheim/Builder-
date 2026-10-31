import { describe, expect, it } from 'vitest';
import { CompileError } from '../interp/lexer';
import { parse } from '../interp/parser';
import { RuntimeError } from '../interp/interpreter';
import { inSetup, runSketch } from './helpers';

const out = (body: string, globals = '') => runSketch(inSetup(body, globals), 50).serial.trim().split('\n');

describe('arithmetic and types', () => {
  it('divides whole numbers like C, and floats with decimals', () => {
    expect(out('Serial.println(7 / 2); Serial.println(7 / 2.0);')).toEqual(['3', '3.50']);
  });

  it('wraps a 16-bit int past 32767', () => {
    expect(out('int x = 32767; x++; Serial.println(x);')).toEqual(['-32768']);
  });

  it('prints floats with two decimals or the requested digits', () => {
    expect(out('float f = 3.14159; Serial.println(f); Serial.println(f, 4);')).toEqual(['3.14', '3.1416']);
  });

  it('joins Strings and numbers', () => {
    expect(out('String s = "cm: " + String(42); s += "!"; Serial.println(s);')).toEqual(['cm: 42!']);
  });

  it('supports function-style casts like float(x) and int(x)', () => {
    expect(out('Serial.println(int(3.9)); Serial.println(byte(260)); Serial.println(float(1) / 4); Serial.println(long(5) * 2);')).toEqual(['3', '4', '0.25', '10']);
  });

  it('switches the pull-up off when a pin goes back to INPUT', () => {
    const { board } = runSketch('void setup() { pinMode(4, INPUT_PULLUP); pinMode(4, INPUT); }\nvoid loop() {}', 50);
    expect(board.pins[4].value).toBe(0);
    expect(board.level(4)).toBe(0);
  });

  it('prints chars as letters', () => {
    expect(out("char c = 'A'; c++; Serial.println(c);")).toEqual(['B']);
  });

  it('formats numbers in other bases', () => {
    expect(out('Serial.println(255, HEX); Serial.println(5, BIN);')).toEqual(['FF', '101']);
  });

  it('maps ranges', () => {
    expect(out('Serial.println(map(512, 0, 1023, 0, 255));')).toEqual(['127']);
  });
});

describe('arrays, functions and control flow', () => {
  it('supports 2D arrays and sizeof', () => {
    const lines = out(
      'Serial.println(grid[1][2]); Serial.println(sizeof(grid) / sizeof(grid[0]));',
      'int grid[2][3] = {{1, 2, 3}, {4, 5, 6}};',
    );
    expect(lines).toEqual(['6', '2']);
  });

  it('passes references so functions can change variables', () => {
    expect(out('int a = 1, b = 2; swap(a, b); Serial.println(a * 10 + b);', 'void swap(int &x, int &y) { int t = x; x = y; y = t; }')).toEqual(['21']);
  });

  it('recurses', () => {
    expect(out('Serial.println(fact(6));', 'long fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }')).toEqual(['720']);
  });

  it('runs switch statements with fall-through and default', () => {
    expect(out('for (int i = 0; i < 3; i++) { switch (i) { case 0: Serial.print("a"); case 1: Serial.print("b"); break; default: Serial.print("c"); } } Serial.println();')).toEqual(['abbc']);
  });

  it('expands #define macros', () => {
    expect(runSketch('#define LED 13\nvoid setup() { Serial.begin(9600); Serial.println(LED + 1); }\nvoid loop() {}', 20).serial.trim()).toBe('14');
  });
});

describe('time and pins', () => {
  it('advances simulated time with delay() and millis()', () => {
    const { serial } = runSketch(inSetup('delay(250); Serial.println(millis() >= 250);'), 400);
    expect(serial.trim()).toBe('1');
  });

  it('records blinking on pin 13', () => {
    const { board } = runSketch('void setup() { pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, HIGH); delay(100); digitalWrite(13, LOW); delay(100); }', 1000);
    expect(board.transitions.get(13)!.filter(t => t.v === 1).length).toBeGreaterThanOrEqual(4);
  });

  it('hints when an output pin was never set up with pinMode', () => {
    const { hints } = runSketch('void setup() { digitalWrite(9, HIGH); }\nvoid loop() {}', 20);
    expect(hints.join(' ')).toMatch(/pinMode/);
  });
});

describe('errors', () => {
  it('reports a missing semicolon on the right line', () => {
    try {
      parse('void setup() {\n  int x = 5\n}\nvoid loop() {}');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CompileError);
      expect((e as CompileError).line).toBe(2);
    }
  });

  it('requires setup() and loop()', () => {
    expect(() => parse('void setup() {}')).toThrow(/loop/);
  });

  it('stops on out-of-range array access instead of corrupting memory', () => {
    expect(() => runSketch(inSetup('int a[3]; a[5] = 1;'), 20)).toThrow(RuntimeError);
  });

  it('names unknown functions', () => {
    expect(() => runSketch(inSetup('blink();'), 20)).toThrow(/Unknown function "blink\(\)"/);
  });
});

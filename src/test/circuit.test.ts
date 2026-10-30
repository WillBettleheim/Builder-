import { describe, expect, it } from 'vitest';
import { autoWires, endpoint, solve, type Wire } from '../sim/circuit';
import { newPart } from '../sim/parts';

const setup = () => {
  const uno = newPart('uno', { id: 'uno' });
  const led = newPart('led', { id: 'led' });
  return { uno, led, parts: [uno, led] };
};
const wire = (a: string, b: string): Wire => ({ id: `${a}-${b}`, a, b, color: '#000' });

describe('circuit solver', () => {
  it('finds the pin a part is wired to, and that it is powered', () => {
    const { parts, led } = setup();
    const issues = solve(parts, [wire('uno:9', 'led:pin'), wire('uno:GND', 'led:gnd')]);
    expect(issues).toEqual([]);
    expect(led.pins.pin).toBe(9);
    expect(led.state.missing).toEqual([]);
  });

  it('notices a missing ground wire', () => {
    const { parts, led } = setup();
    solve(parts, [wire('uno:9', 'led:pin')]);
    expect(led.state.missing).toEqual(['GND']);
  });

  it('warns about short circuits', () => {
    const { parts } = setup();
    const issues = solve(parts, [wire('uno:5V', 'uno:GND')]);
    expect(issues.map(i => i.key)).toContainEqual(expect.stringMatching(/^short/));
  });

  it('connects through breadboard rails and strips', () => {
    const { uno, led } = setup();
    const bb = newPart('breadboard', { id: 'bb' });
    const parts = [uno, led, bb];
    solve(parts, [
      wire('uno:GND', 'bb:tn1'), wire('led:gnd', 'bb:tn20'), // same rail, opposite ends
      wire('uno:7', 'bb:3a'), wire('led:pin', 'bb:3e'), // same 5-hole strip
    ]);
    expect(led.state.missing).toEqual([]);
    expect(led.pins.pin).toBe(7);
  });

  it('generates wires that reproduce a pin assignment plus power', () => {
    const { parts, led } = setup();
    const wires = autoWires(parts, led, { pin: 5 });
    solve(parts, wires);
    expect(led.pins.pin).toBe(5);
    expect(led.state.missing).toEqual([]);
    expect(wires.some(w => w.b === endpoint('led', 'gnd'))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { type Wire } from '../sim/circuit';
import { measure } from '../sim/meter';
import { newPart } from '../sim/parts';
import { runSketch } from './helpers';

const parts = [newPart('uno', { id: 'uno' }), newPart('led', { id: 'led' })];
const wire = (a: string, b: string): Wire => ({ id: `${a}-${b}`, a, b, color: '#000' });
const wires = [wire('uno:9', 'led:pin'), wire('uno:GND', 'led:gnd')];
const sketch = (body: string) => runSketch(`void setup() { pinMode(9, OUTPUT); ${body} }\nvoid loop() {}`, 50).board;

describe('multimeter', () => {
  it('reads the board’s 5V, 3.3V and GND sockets even with nothing plugged in', () => {
    const board = sketch('');
    expect(measure(parts, [], board, true, 'volts', 'uno:5V', 'uno:GND').display).toBe('5.00');
    expect(measure(parts, [], board, true, 'volts', 'uno:3V3', 'uno:GND').display).toBe('3.30');
    expect(measure(parts, [], board, true, 'volts', 'uno:GND', 'uno:5V').display).toBe('-5.00');
  });

  it('reads a HIGH pin through the wires, and PWM as its average', () => {
    expect(measure(parts, wires, sketch('digitalWrite(9, HIGH);'), true, 'volts', 'led:pin', 'led:gnd').display).toBe('5.00');
    expect(measure(parts, wires, sketch('analogWrite(9, 51);'), true, 'volts', 'led:pin', 'led:gnd').display).toBe('1.00');
  });

  it('only measures pins while the sketch runs', () => {
    expect(measure(parts, wires, sketch('digitalWrite(9, HIGH);'), false, 'volts', 'led:pin', 'led:gnd').display).toBe('- - -');
  });

  it('beeps for continuity only when two points share a connection', () => {
    const board = sketch('');
    expect(measure(parts, wires, board, true, 'ohms', 'led:gnd', 'uno:GND').connected).toBe(true);
    expect(measure(parts, wires, board, true, 'ohms', 'led:pin', 'uno:GND').connected).toBe(false);
  });
});

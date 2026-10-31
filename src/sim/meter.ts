// The multimeter: what two probes on two terminals would read.
import type { Board } from './board';
import { buildNets, splitEndpoint, type NetInfo, type Wire } from './circuit';
import { BOARD_TERMINALS, type Part } from './parts';

export type MeterMode = 'volts' | 'ohms';

export interface Reading {
  /** What the meter's display shows, e.g. "4.98" or "OL". */
  display: string;
  unit: string;
  /** One line explaining the reading in plain words. */
  note: string;
  /** Continuity mode: the two probes are joined (the meter beeps). */
  connected?: boolean;
}

/** Voltage (0–5 V) on a net, or null when it floats or the board isn't running. */
function netVolts(info: (NetInfo & { volts?: number }) | undefined, board: Board, running: boolean): number | null {
  if (!info) return null;
  if (info.volts != null) return info.volts;
  if (info.ground) return 0;
  if (info.power) return 5;
  const pin = info.pins[0];
  if (pin == null || !running) return null;
  const p = board.pins[pin];
  if (p.mode === 'OUTPUT') return board.level(pin) * 5; // PWM reads as its average, like a real meter
  if (pin >= 14) {
    const a = board.peekAnalog(pin);
    if (a != null) return a * 5;
  }
  const d = board.peekDigital(pin);
  return d == null ? null : d * 5;
}

export function measure(parts: Part[], wires: Wire[], board: Board, running: boolean, mode: MeterMode, red: string | null, black: string | null): Reading {
  if (!red || !black) {
    return { display: mode === 'volts' ? '0.00' : 'OL', unit: mode === 'volts' ? 'V' : 'Ω', note: red ? 'Now click a second terminal for the black probe.' : 'Click any terminal to place the red probe.' };
  }
  const nets = buildNets(parts, wires);
  // the board's own sockets always carry their voltage, wired up or not
  const infoOf = (ep: string): (NetInfo & { volts?: number }) | undefined => {
    const wired = nets.infoOf(ep);
    if (wired) return wired;
    const [pid, key] = splitEndpoint(ep);
    if (parts.find(p => p.id === pid)?.type !== 'uno') return undefined;
    const t = BOARD_TERMINALS.find(x => x.key === key);
    if (key === '3V3') return { pins: [], power: true, ground: false, volts: 3.3 };
    return t && { pins: t.kind === 'pin' ? [t.pin!] : [], power: t.kind === '5V', ground: t.kind === 'GND' };
  };
  const ra = nets.rootOf(red), rb = nets.rootOf(black);
  const same = red === black || (ra != null && ra === rb);

  if (mode === 'ohms') {
    return same
      ? { display: '0.0', unit: 'Ω', note: 'Connected: these two points are joined by wires (beep!).', connected: true }
      : { display: 'OL', unit: 'Ω', note: 'Open: nothing joins these two points directly.', connected: false };
  }

  if (same) return { display: '0.00', unit: 'V', note: 'Both probes are on the same connection, so there is no voltage between them.' };
  const va = netVolts(infoOf(red), board, running), vb = netVolts(infoOf(black), board, running);
  if (va == null || vb == null) {
    const loose = va == null ? 'red' : 'black';
    const reach = (va == null ? infoOf(red) : infoOf(black))?.pins.length;
    return {
      display: '- - -', unit: 'V',
      note: reach && !running ? 'Press Run: pins only have a voltage while the sketch runs.' : `The ${loose} probe’s point isn’t connected to anything that sets a voltage (it floats).`,
    };
  }
  const v = va - vb;
  const pwm = running && [red, black].some(ep => { const pin = infoOf(ep)?.pins[0]; return pin != null && board.pins[pin].pwm != null; });
  const note = Math.abs(v) < 0.05 ? 'Same level on both sides: no voltage across them.'
    : v > 4.9 ? 'Full 5 V: the red side is HIGH and the black side is LOW.'
    : v > 0 ? (pwm ? 'A partial voltage: PWM switching fast, read as its average.' : `${v.toFixed(1)} V between these two points.`)
    : 'Negative: the black side is higher. Swap the probes for a positive reading.';
  return { display: v.toFixed(2), unit: 'V', note };
}

// Run a sketch on a bare simulated board for a stretch of simulated time.
import { parse } from '../interp/parser';
import { Interpreter } from '../interp/interpreter';
import { Board } from '../sim/board';

export function runSketch(code: string, ms = 1000, board = new Board()) {
  const hints: string[] = [];
  board.onHint = t => hints.push(t);
  const interp = new Interpreter(parse(code), board);
  const gen = interp.run();
  // advance in 16 ms frames, like the app's animation loop
  for (let t = 0; t < ms; t += 16) {
    board.target = Math.min(board.target, board.time) + 16;
    interp.resetBudget();
    if (board.time < board.target) gen.next();
  }
  return { board, interp, hints, serial: board.serialOut };
}

/** Wrap statements in setup() with Serial started, for quick language checks. */
export const inSetup = (body: string, globals = '') => `${globals}\nvoid setup() {\n  Serial.begin(9600);\n${body}\n}\nvoid loop() {}\n`;

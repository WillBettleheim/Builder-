import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../interp/interpreter';
import { Board } from '../sim/board';
import { digitsText } from '../sim/parts';
import { runSketch } from './helpers';

const sketch = (setup: string, loop = '', globals = '') => `${globals}\nvoid setup() {\n${setup}\n}\nvoid loop() {\n${loop}\n}\n`;

describe('IR remote library', () => {
  it('decodes queued button codes and exposes decodedIRData.command', () => {
    const board = new Board();
    const queue = [{ command: 0x0c, address: 0 }, { command: 0x18, address: 0 }];
    board.listeners.push({ ir: pin => (pin === 11 ? queue.shift() : undefined) });
    const { serial } = runSketch(sketch('Serial.begin(9600); IrReceiver.begin(11);', 'if (IrReceiver.decode()) { Serial.println(IrReceiver.decodedIRData.command, HEX); IrReceiver.resume(); }'), 50, board);
    expect(serial.trim().split('\n')).toEqual(['C', '18']);
  });
});

describe('SoftwareSerial (Bluetooth)', () => {
  it('reads what the phone sent and sends replies to the TX pin', () => {
    const board = new Board();
    const inbox = [...'1\n'].map(c => c.charCodeAt(0));
    let sent = '';
    board.listeners.push({ btInbox: rx => (rx === 10 ? inbox : undefined), btSend: (tx, t) => { if (tx !== 11) return false; sent += t; return true; } });
    runSketch(sketch('bt.begin(9600);', "if (bt.available()) { char c = bt.read(); if (c == '1') bt.println(\"LED ON\"); }", 'SoftwareSerial bt(10, 11);'), 50, board);
    expect(sent).toBe('LED ON\n');
  });
});

describe('SD library', () => {
  it('appends with FILE_WRITE and reads the file back', () => {
    const files: Record<string, string> = {};
    const board = new Board();
    board.listeners.push({ sd: cs => (cs === 10 ? files : undefined) });
    const { serial } = runSketch(sketch(`Serial.begin(9600);
      if (!SD.begin(10)) Serial.println("fail");
      for (int i = 1; i <= 2; i++) { File f = SD.open("log.txt", FILE_WRITE); f.print(i); f.println(",ok"); f.close(); }
      File r = SD.open("log.txt");
      while (r.available()) Serial.write(r.read());
      r.close();
      File missing = SD.open("nope.txt");
      if (!missing) Serial.println("missing");`), 50, board);
    expect(files['log.txt']).toBe('1,ok\n2,ok\n');
    expect(serial).toBe('1,ok\n2,ok\nmissing\n');
  });

  it('explains a file that failed to open', () => {
    const board = new Board();
    board.listeners.push({ sd: () => ({}) });
    expect(() => runSketch(sketch('SD.begin(10); File f = SD.open("nope.txt"); f.read();'), 50, board)).toThrow(RuntimeError);
  });
});

describe('TM1637 4-digit display', () => {
  const show = (code: string) => digitsText(runSketch(sketch(code, '', 'TM1637Display display(2, 3);'), 50).board.digits.get('2,3')!.segs);
  it('shows numbers right-aligned, with optional leading zeros and minus signs', () => {
    expect(show('display.showNumberDec(1234);')).toBe('1234');
    expect(show('display.showNumberDec(42);')).toBe('  42');
    expect(show('display.showNumberDec(7, true);')).toBe('0007');
    expect(show('display.showNumberDec(-5);')).toBe('  -5');
  });
  it('lights the colon with showNumberDecEx', () => {
    expect(show('display.showNumberDecEx(1230, 0b01000000, true);')).toBe('12:30');
  });
});

describe('QMC5883L compass library', () => {
  it('reads the heading from the compass module', () => {
    const board = new Board();
    board.listeners.push({ heading: () => 90 });
    const { serial } = runSketch(sketch('Serial.begin(9600); compass.init(); compass.read(); Serial.println(compass.getAzimuth()); Serial.println(compass.getBearing(compass.getAzimuth()));', '', '#include <QMC5883LCompass.h>\nQMC5883LCompass compass;'), 50, board);
    expect(serial.trim().split('\n')).toEqual(['90', '4']);
  });
});

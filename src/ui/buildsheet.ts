// "Build it for real": turns the circuit on the desk into a shopping list,
// numbered wiring steps and the code, in a printable sheet.
import { endpointLabel, splitEndpoint, type Wire } from '../sim/circuit';
import type { Part } from '../sim/parts';

/** What to actually buy for each part, including the small extras it needs. */
const SHOPPING: Record<string, { item: string; extras?: string[] }> = {
  uno: { item: 'Builder One board (or any 5 V microcontroller board with the same pin layout) + USB cable' },
  breadboard: { item: 'Half-size breadboard' },
  led: { item: '5 mm LED', extras: ['220 Ω resistor'] },
  rgb: { item: 'RGB LED, common cathode', extras: ['220 Ω resistor', '220 Ω resistor', '220 Ω resistor'] },
  button: { item: 'Push button (tactile switch)' },
  pot: { item: '10 kΩ potentiometer' },
  joystick: { item: 'Analog joystick module' },
  ldr: { item: 'Photoresistor (LDR)', extras: ['10 kΩ resistor'] },
  temp: { item: 'TMP36 temperature sensor' },
  dht: { item: 'DHT11 temperature & humidity sensor' },
  soil: { item: 'Soil moisture sensor with module board' },
  pir: { item: 'HC-SR501 PIR motion sensor' },
  buzzer: { item: 'Passive piezo buzzer' },
  ultrasonic: { item: 'HC-SR04 ultrasonic distance sensor' },
  servo: { item: 'SG90 micro servo' },
  stepper: { item: '28BYJ-48 stepper motor with ULN2003 driver board' },
  motor: { item: 'Small DC motor with fan', extras: ['NPN transistor (e.g. 2N2222)', '1N4001 diode', '1 kΩ resistor'] },
  relay: { item: '5 V relay module (1 channel)', extras: ['Low-voltage lamp and its own power supply'] },
  traffic: { item: 'Traffic light LED module' },
  seg7: { item: '7-segment display, common cathode', extras: Array(7).fill('220 Ω resistor') },
  lcd: { item: '16×2 LCD with I2C backpack' },
  oled: { item: '0.96" SSD1306 OLED display, 128×64, I2C' },
  neopixel: { item: 'WS2812B (NeoPixel) LED strip' },
  keypad: { item: '4×4 membrane keypad' },
  encoder: { item: 'KY-040 rotary encoder module' },
  matrix: { item: '8×8 LED matrix with MAX7219 driver module' },
  hall: { item: 'KY-003 Hall effect sensor module', extras: ['Small neodymium magnet'] },
  sound: { item: 'KY-037 sound sensor module' },
  gas: { item: 'MQ-2 gas / smoke sensor module' },
};

const COLOR_NAMES: Record<string, string> = {
  '#e2533b': 'red-orange', '#f39c34': 'orange', '#e9c43b': 'yellow', '#3fae5a': 'green', '#3b82c4': 'blue',
  '#8e5bd0': 'purple', '#e86fa6': 'pink', '#3bb7b0': 'teal', '#a0703c': 'brown', '#6c7a89': 'grey',
  '#d7263d': 'red', '#2a2a2e': 'black', '#f4f1ea': 'white',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Libraries the sketch includes, so people know what to install. */
function libraries(code: string): string[] {
  const known: Record<string, string> = {
    'Servo.h': 'Servo', 'LiquidCrystal_I2C.h': 'LiquidCrystal I2C', 'Adafruit_NeoPixel.h': 'Adafruit NeoPixel',
    'DHT.h': 'DHT sensor library', 'Adafruit_SSD1306.h': 'Adafruit SSD1306 (and Adafruit GFX)', 'Stepper.h': 'Stepper',
    'Keypad.h': 'Keypad', 'LedControl.h': 'LedControl',
  };
  return [...code.matchAll(/#include\s*<([\w.]+)>/g)].map(m => known[m[1]]).filter(Boolean);
}

export function buildSheetHtml(title: string, parts: Part[], wires: Wire[], code: string): string {
  // shopping list, counted
  const counts = new Map<string, number>();
  const add = (item: string, n = 1) => counts.set(item, (counts.get(item) ?? 0) + n);
  for (const p of parts) {
    const s = SHOPPING[p.type];
    if (!s) continue; // props like the toy car aren't electronics
    add(s.item);
    for (const x of s.extras ?? []) add(x);
  }
  add('Jumper wires', wires.length);

  // wiring steps: power first, then signals, so nothing is half-powered while wiring
  const kind = (w: Wire) => {
    const label = `${endpointLabel(parts, w.a)} ${endpointLabel(parts, w.b)}`;
    return /GND|− rail/.test(label) ? 0 : /5V|3\.3V|VCC|\+ rail/.test(label) ? 1 : 2;
  };
  const sorted = [...wires].sort((a, b) => kind(a) - kind(b));
  // name the board end first so steps read "from the board to the part"
  const boardFirst = (w: Wire) => {
    const [pa] = splitEndpoint(w.a);
    const aIsBoard = parts.find(p => p.id === pa)?.type === 'uno';
    return aIsBoard ? [w.a, w.b] : [w.b, w.a];
  };
  const libs = libraries(code);
  const hasMains = parts.some(p => p.type === 'relay');

  return `
    <div class="bs-head">
      <div>
        <div class="eyebrow">BUILD IT FOR REAL</div>
        <h2>${esc(title)}</h2>
      </div>
      <div class="row">
        <button class="mini" data-bs="copy">Copy code</button>
        <button class="mini" data-bs="download">Download sketch</button>
        <button class="mini primary" data-bs="print">Print</button>
        <button class="mini ghost" data-bs="close" aria-label="Close">×</button>
      </div>
    </div>
    <div class="bs-body">
      <section>
        <h3>1. Shopping list</h3>
        <ul class="bs-list">${[...counts].map(([item, n]) => `<li><b>${n}×</b> ${esc(item)}</li>`).join('')}</ul>
        ${libs.length ? `<p class="muted">Libraries to install: ${libs.map(esc).join(', ')}.</p>` : ''}
        ${hasMains ? '<p class="bs-warn">⚠️ Never switch mains voltage on a breadboard. Use a low-voltage lamp, or a sealed relay unit wired by an adult.</p>' : ''}
      </section>
      <section>
        <h3>2. Wiring (${wires.length} wire${wires.length === 1 ? '' : 's'})</h3>
        <p class="muted">Unplug the USB cable while you wire. Ground and power first, then signals.</p>
        <ol class="bs-steps">${sorted.map(w => {
          const [from, to] = boardFirst(w);
          return `<li><span class="bs-wire" style="background:${w.color}"></span><span><b>${esc(COLOR_NAMES[w.color] ?? 'any colour')}</b> wire: ${esc(endpointLabel(parts, from))} → ${esc(endpointLabel(parts, to))}</span></li>`;
        }).join('') || '<li>No wires yet.</li>'}</ol>
      </section>
      <section>
        <h3>3. Code</h3>
        <pre class="bs-code">${esc(code)}</pre>
      </section>
      <section>
        <h3>4. Try it</h3>
        <p>Check every wire against the list, plug in the USB cable, upload the sketch and compare with the simulator. If something doesn't work, look for a loose wire or a part plugged in backwards: LEDs have a long (+) leg and a short (−) leg.</p>
      </section>
    </div>`;
}

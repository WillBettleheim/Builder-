// Lesson content: scene setup, starter code, explanations and checkable goals.
import type { Board } from './sim/board';
import { IR_KEYS, digitsText, type Part } from './sim/parts';
import type { Wire } from './sim/circuit';

export interface GoalCtx {
  board: Board;
  parts: Part[];
  part(type: string): Part | undefined;
  serial: string;
  sent: string[];
  now: number; // wall-clock ms
  wires: Wire[];
}

export interface Goal {
  text: string;
  check(ctx: GoalCtx, mem: Record<string, any>): boolean;
}

export interface PartSpec {
  type: string;
  x: number;
  z: number;
  rot?: number;
  pins?: Record<string, number | null>;
  props?: Record<string, any>;
  noPower?: boolean; // leave power/ground for the learner to wire
}

export interface Lesson {
  id: string;
  title: string;
  icon: string; // part type used for the thumbnail
  iconProps?: Record<string, any>;
  level: 'Basics' | 'Displays' | 'Sensors' | 'Motion' | 'Debug' | 'Robotics' | 'Projects';
  intro: string;
  parts: PartSpec[];
  code: string;
  solution: string;
  goals: Goal[];
}

// ---------- goal helpers ----------
/** Durations (ms) of completed HIGH pulses on a pin. */
function highPulses(board: Board, pin: number): number[] {
  const tr = board.transitions.get(pin) ?? [];
  const out: number[] = [];
  for (let i = 1; i < tr.length; i++) if (tr[i - 1].v === 1 && tr[i].v === 0) out.push(tr[i].t - tr[i - 1].t);
  return out;
}

const serialLines = (s: string) => s.split('\n').map(l => l.trim()).filter(Boolean);

function lastNumber(s: string): number | null {
  const lines = serialLines(s);
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
    const m = lines[i].match(/-?\d+(\.\d+)?/g);
    if (m) return parseFloat(m[m.length - 1]);
  }
  return null;
}

/** Remembers that a condition was seen at least once. */
function seen(mem: Record<string, any>, key: string, cond: boolean): boolean {
  if (cond) mem[key] = true;
  return !!mem[key];
}

const BOARD: PartSpec = { type: 'uno', x: 0, z: 0 };

export const LESSONS: Lesson[] = [
  {
    id: 'blink',
    title: 'Blink an LED',
    icon: 'uno',
    level: 'Basics',
    intro: `
<p>Every Builder program (a <em>sketch</em>) has two functions:</p>
<ul>
  <li><code>setup()</code> runs <strong>once</strong> when the board powers on.</li>
  <li><code>loop()</code> runs <strong>over and over</strong>, forever.</li>
</ul>
<p>The board has a tiny LED marked <strong>L</strong> wired to pin 13. <code>pinMode(13, OUTPUT)</code> lets the pin send power out, then <code>digitalWrite()</code> switches it <code>HIGH</code> (5 V, on) or <code>LOW</code> (0 V, off). <code>delay(1000)</code> waits 1000 milliseconds, which is one second.</p>
<p><strong>Try it:</strong> press <kbd>Run</kbd> and look for the orange L LED near pin 13. Then change the delays to make it blink faster.</p>`,
    parts: [BOARD],
    code: `// Blink: turn the built-in LED on and off.

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);   // LED_BUILTIN is pin 13
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH); // LED on
  delay(1000);                     // wait one second
  digitalWrite(LED_BUILTIN, LOW);  // LED off
  delay(1000);
}
`,
    solution: `void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(200);
  digitalWrite(LED_BUILTIN, LOW);
  delay(200);
}
`,
    goals: [
      { text: 'Run the sketch and see the L LED blink 3 times', check: c => highPulses(c.board, 13).length >= 3 },
      { text: 'Make it blink faster: on for less than 300 ms', check: c => highPulses(c.board, 13).filter(d => d < 300).length >= 3 },
    ],
  },
  {
    id: 'circuit',
    title: 'Your First Circuit',
    icon: 'led',
    level: 'Basics',
    intro: `
<p>Now let's light a real LED on the breadboard. An LED needs two connections: a <strong>signal</strong> wire from a board pin, and a <strong>GND</strong> (ground) wire to complete the circuit. A 220&nbsp;Ω resistor limits the current so the LED doesn't burn out.</p>
<p>The code already uses <code>LED_PIN = 9</code>, but the LED isn't wired yet!</p>
<p><strong>Wire it:</strong> hover over the LED's left leg (it says <em>LED · Signal</em>), then drag a wire to the socket labelled <strong>Pin 9 ~</strong> on the board's top header. The GND wire (black) is already in place. You can also click the LED and pick a pin from the list.</p>
<p>The code and the wiring must always agree. If your code talks to pin 9 but the wire goes to pin 7, nothing happens. That's the most common wiring bug.</p>`,
    parts: [BOARD, { type: 'led', x: 11, z: -2, pins: { pin: null }, props: { color: 'green' } }],
    code: `// The pin number is stored in a constant so it's easy to change.
const int LED_PIN = 9;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(500);
}
`,
    solution: `const int LED_PIN = 7;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(500);
}
`,
    goals: [
      { text: 'Wire the LED’s Signal leg to pin 9', check: c => c.part('led')?.pins.pin === 9 },
      { text: 'Run it and watch the LED blink', check: (c, m) => { const l = c.part('led'); return seen(m, 'on', (l?.state.level ?? 0) > 0.5) && seen(m, 'off', !!m.on && l?.state.level === 0); } },
      { text: 'Move the wire to pin 7 and change the code to match', check: (c, m) => { const l = c.part('led'); return l?.pins.pin === 7 && seen(m, 'on7', (l?.state.level ?? 0) > 0.5); } },
    ],
  },
  {
    id: 'fade',
    title: 'Fade with PWM',
    icon: 'led',
    iconProps: { color: 'blue' },
    level: 'Basics',
    intro: `
<p>Digital pins can only be fully on or fully off. To fake "half brightness", the board switches the pin on and off very fast. This is called <strong>PWM</strong> (pulse-width modulation).</p>
<p><code>analogWrite(pin, value)</code> takes a value from <code>0</code> (always off) to <code>255</code> (always on). <code>127</code> is on half the time, so the LED looks half as bright.</p>
<p>Only pins marked with <strong>~</strong> on the board (3, 5, 6, 9, 10, 11) can do PWM.</p>
<p>The <code>for</code> loops below count brightness up from 0 to 255, then back down.</p>`,
    parts: [BOARD, { type: 'led', x: 11, z: -2, pins: { pin: 9 }, props: { color: 'blue' } }],
    code: `const int LED_PIN = 9;   // must be a ~ pin

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  // fade in
  for (int b = 0; b <= 255; b += 5) {
    analogWrite(LED_PIN, b);
    delay(30);
  }
  // fade out
  for (int b = 255; b >= 0; b -= 5) {
    analogWrite(LED_PIN, b);
    delay(30);
  }
}
`,
    solution: `const int LED_PIN = 9;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  for (int b = 0; b <= 255; b += 5) {
    analogWrite(LED_PIN, b);
    delay(70);   // 52 steps x 70 ms = 3.6 s
  }
  for (int b = 255; b >= 0; b -= 5) {
    analogWrite(LED_PIN, b);
    delay(70);
  }
}
`,
    goals: [
      { text: 'Run it and watch the LED fade through 20+ brightness levels', check: c => (c.board.pwmSeen.get(9)?.size ?? 0) >= 20 },
      {
        text: 'Slow it down: a full fade-in takes at least 3 seconds',
        check: (c, m) => {
          const pwm = c.board.pins[9]?.pwm;
          if (pwm != null && pwm <= 5) m.t0 = c.board.time;
          if (pwm != null && pwm >= 250 && m.t0 != null) {
            if (c.board.time - m.t0 >= 3000) m.done = true;
            m.t0 = null;
          }
          return !!m.done;
        },
      },
    ],
  },
  {
    id: 'rgb',
    title: 'Mix Colors',
    icon: 'rgb',
    level: 'Basics',
    intro: `
<p>An RGB LED holds a red, a green and a blue LED in one case. Set each one's brightness with <code>analogWrite()</code> and they blend into any color, just like the pixels on a screen.</p>
<ul>
  <li>red + green = <strong>yellow</strong></li>
  <li>red + blue = <strong>purple</strong></li>
  <li>all three = <strong>white</strong></li>
</ul>
<p>The sketch defines its own function, <code>setColor(r, g, b)</code>, so <code>loop()</code> stays short and readable. Writing your own functions is a key programming skill.</p>`,
    parts: [BOARD, { type: 'rgb', x: 11, z: -2, pins: { r: 9, g: 10, b: 11 } }],
    code: `const int RED = 9, GREEN = 10, BLUE = 11;

// Our own function: set all three colors at once (0-255 each)
void setColor(int r, int g, int b) {
  analogWrite(RED, r);
  analogWrite(GREEN, g);
  analogWrite(BLUE, b);
}

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(GREEN, OUTPUT);
  pinMode(BLUE, OUTPUT);
}

void loop() {
  setColor(255, 0, 0);  delay(800);   // red
  setColor(0, 255, 0);  delay(800);   // green
  setColor(0, 0, 255);  delay(800);   // blue
  // TODO: add purple and orange!
}
`,
    solution: `const int RED = 9, GREEN = 10, BLUE = 11;

void setColor(int r, int g, int b) {
  analogWrite(RED, r);
  analogWrite(GREEN, g);
  analogWrite(BLUE, b);
}

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(GREEN, OUTPUT);
  pinMode(BLUE, OUTPUT);
}

void loop() {
  setColor(255, 0, 0);   delay(800);
  setColor(0, 255, 0);   delay(800);
  setColor(0, 0, 255);   delay(800);
  setColor(255, 0, 255); delay(800);  // purple
  setColor(255, 120, 0); delay(800);  // orange
}
`,
    goals: [
      {
        text: 'Show pure red, green and blue',
        check: (c, m) => {
          const [r, g, b] = c.part('rgb')?.state.rgb ?? [0, 0, 0];
          seen(m, 'r', r > 0.8 && g < 0.1 && b < 0.1);
          seen(m, 'g', g > 0.8 && r < 0.1 && b < 0.1);
          seen(m, 'b', b > 0.8 && r < 0.1 && g < 0.1);
          return m.r && m.g && m.b;
        },
      },
      { text: 'Mix purple: red and blue on, green off', check: (c, m) => { const [r, g, b] = c.part('rgb')?.state.rgb ?? [0, 0, 0]; return seen(m, 'p', r > 0.6 && b > 0.6 && g < 0.15); } },
      { text: 'Mix orange: full red, about half green, no blue', check: (c, m) => { const [r, g, b] = c.part('rgb')?.state.rgb ?? [0, 0, 0]; return seen(m, 'o', r > 0.85 && g > 0.25 && g < 0.7 && b < 0.15); } },
    ],
  },
  {
    id: 'serial',
    title: 'Talk with Serial',
    icon: 'uno',
    level: 'Basics',
    intro: `
<p>The <strong>Serial Monitor</strong> lets your board send text to your computer over USB. You'll use it all the time to see what your code is doing.</p>
<ul>
  <li><code>Serial.begin(9600)</code> starts the connection (9600 is the speed).</li>
  <li><code>Serial.print(x)</code> prints without a new line. <code>Serial.println(x)</code> adds one.</li>
  <li><code>Serial.available()</code> tells you how many characters you've typed in. <code>Serial.readString()</code> reads them.</li>
</ul>
<p>A <strong>global variable</strong> (declared outside any function) keeps its value between runs of <code>loop()</code>, so it's perfect for a counter.</p>`,
    parts: [BOARD],
    code: `int counter = 0;   // global: remembered between loops

void setup() {
  Serial.begin(9600);
  Serial.println("Hello, Builder!");
}

void loop() {
  // TODO 1: print counter, then add 1 to it, once per second
  //         Serial.println(counter); counter++; delay(1000);

  // TODO 2: if you typed something, echo it back
  //         if (Serial.available() > 0) { ... Serial.readString() ... }
}
`,
    solution: `int counter = 0;

void setup() {
  Serial.begin(9600);
  Serial.println("Hello, Builder!");
}

void loop() {
  Serial.println(counter);
  counter++;

  if (Serial.available() > 0) {
    String text = Serial.readString();
    Serial.print("You said: ");
    Serial.println(text);
  }
  delay(1000);
}
`,
    goals: [
      { text: 'Print "Hello" to the Serial Monitor', check: c => /hello/i.test(c.serial) },
      { text: 'Print a counting number every second (5 numbers)', check: c => serialLines(c.serial).filter(l => /^\d+$/.test(l)).length >= 5 },
      { text: 'Echo back text you type into the Serial Monitor', check: c => c.sent.some(s => s.trim().length > 0 && c.serial.includes(s.trim())) },
    ],
  },
  {
    id: 'button',
    title: 'Read a Button',
    icon: 'button',
    level: 'Sensors',
    intro: `
<p>Pins can also be <strong>inputs</strong>. <code>digitalRead(pin)</code> returns <code>HIGH</code> or <code>LOW</code> depending on the voltage on the pin.</p>
<p>This button connects pin 2 to 5 V when pressed. A "pull-down" resistor holds the pin at <code>LOW</code> when it isn't pressed. Without that resistor the pin would "float" and read random values.</p>
<p><strong>Press and hold</strong> the red button cap in the scene with your mouse.</p>
<p><strong>Challenge:</strong> turn it into a toggle switch. Each press flips the LED. Remember the previous button state and react only when it changes from <code>LOW</code> to <code>HIGH</code>. This is called <em>edge detection</em>.</p>`,
    parts: [BOARD, { type: 'button', x: 11, z: 4, pins: { pin: 2 } }, { type: 'led', x: 12, z: -3, pins: { pin: 13 }, props: { color: 'yellow' } }],
    code: `const int BUTTON = 2;
const int LED = 13;

void setup() {
  pinMode(BUTTON, INPUT);
  pinMode(LED, OUTPUT);
}

void loop() {
  int state = digitalRead(BUTTON);
  if (state == HIGH) {
    digitalWrite(LED, HIGH);
  } else {
    digitalWrite(LED, LOW);
  }
}
`,
    solution: `const int BUTTON = 2;
const int LED = 13;

bool ledOn = false;
int lastState = LOW;

void setup() {
  pinMode(BUTTON, INPUT);
  pinMode(LED, OUTPUT);
}

void loop() {
  int state = digitalRead(BUTTON);
  if (state == HIGH && lastState == LOW) {  // just pressed
    ledOn = !ledOn;
    digitalWrite(LED, ledOn);
    delay(20);                               // debounce
  }
  lastState = state;
}
`,
    goals: [
      { text: 'Press the button: the LED turns on', check: (c, m) => seen(m, 'x', !!c.part('button')?.state.pressed && (c.part('led')?.state.level ?? 0) > 0.5) },
      { text: 'Release it: the LED turns off', check: (c, m) => { const b = c.part('button'); if (b?.state.pressed) m.pressed = true; return seen(m, 'x', !!m.pressed && !b?.state.pressed && c.part('led')?.state.level === 0); } },
      {
        text: 'Challenge: make it a toggle (LED stays on after release, next press turns it off)',
        check: (c, m) => {
          const pressed = !!c.part('button')?.state.pressed;
          if (m.prev && !pressed) m.releasedAt = c.now;
          m.prev = pressed;
          if (!pressed && m.releasedAt && c.now - m.releasedAt > 600) {
            m.releasedAt = 0;
            if ((c.part('led')?.state.level ?? 0) > 0.5) m.onAfter = true;
            else if (m.onAfter) m.offAfterOn = true;
          }
          return !!m.offAfterOn;
        },
      },
    ],
  },
  {
    id: 'pot',
    title: 'Turn a Knob',
    icon: 'pot',
    level: 'Sensors',
    intro: `
<p>A <strong>potentiometer</strong> is a knob that outputs a voltage between 0 V and 5 V. The analog pins (A0–A5) measure voltage with <code>analogRead()</code>, which returns a number from <strong>0 to 1023</strong>.</p>
<p><strong>Drag the knob up or down</strong> in the scene (or scroll over it) and watch the numbers in the Serial Monitor.</p>
<p>To control an LED you need to convert 0–1023 into 0–255. <code>map()</code> does exactly that:</p>
<pre>int b = map(value, 0, 1023, 0, 255);</pre>`,
    parts: [BOARD, { type: 'pot', x: 11, z: 4, pins: { sig: 14 } }, { type: 'led', x: 12, z: -3, pins: { pin: 9 }, props: { color: 'white' } }],
    code: `const int KNOB = A0;
const int LED = 9;

void setup() {
  Serial.begin(9600);
  pinMode(LED, OUTPUT);
}

void loop() {
  int value = analogRead(KNOB);   // 0..1023
  Serial.println(value);

  // TODO: map value to 0..255 and analogWrite it to the LED

  delay(100);
}
`,
    solution: `const int KNOB = A0;
const int LED = 9;

void setup() {
  Serial.begin(9600);
  pinMode(LED, OUTPUT);
}

void loop() {
  int value = analogRead(KNOB);
  Serial.println(value);
  int brightness = map(value, 0, 1023, 0, 255);
  analogWrite(LED, brightness);
  delay(100);
}
`,
    goals: [
      {
        text: 'Turn the knob and see the value change in the Serial Monitor',
        check: (c, m) => {
          const v = c.part('pot')?.props.value;
          (m.vals ??= new Set()).add(Math.round(v / 100));
          return m.vals.size >= 3 && serialLines(c.serial).length >= 5;
        },
      },
      {
        text: 'Make the LED brightness follow the knob',
        check: (c, m) => {
          const pot = c.part('pot');
          const pwm = c.board.pins[9]?.pwm;
          if (pot && pwm != null && Math.abs(pwm - pot.props.value / 4) < 12) (m.ok ??= new Set()).add(Math.round(pot.props.value / 200));
          return (m.ok?.size ?? 0) >= 3;
        },
      },
    ],
  },
  {
    id: 'nightlight',
    title: 'Night Light',
    icon: 'ldr',
    level: 'Sensors',
    intro: `
<p>A <strong>photoresistor</strong> (light-dependent resistor, or LDR) changes its resistance with light. Wired with a second resistor as a <em>voltage divider</em>, it gives <code>analogRead()</code> high values in bright light and low values in the dark.</p>
<p><strong>Drag the light sensor</strong> up and down to change the light level (or use the slider when it's selected).</p>
<p>The sketch compares the reading to a <strong>threshold</strong>. Below it, it's dark and the LED turns on.</p>
<p><strong>Challenge:</strong> instead of on/off, make the LED glow brighter the darker it gets. Hint: <code>map(light, 0, 1023, 255, 0)</code> flips a range.</p>`,
    parts: [BOARD, { type: 'ldr', x: 11, z: 4, pins: { sig: 14 }, props: { light: 70 } }, { type: 'led', x: 12, z: -3, pins: { pin: 9 }, props: { color: 'yellow' } }],
    code: `const int SENSOR = A0;
const int LED = 9;
const int DARK = 300;   // below this, it's dark

void setup() {
  Serial.begin(9600);
  pinMode(LED, OUTPUT);
}

void loop() {
  int light = analogRead(SENSOR);
  Serial.print("Light: ");
  Serial.println(light);

  if (light < DARK) {
    digitalWrite(LED, HIGH);
  } else {
    digitalWrite(LED, LOW);
  }
  delay(200);
}
`,
    solution: `const int SENSOR = A0;
const int LED = 9;

void setup() {
  Serial.begin(9600);
  pinMode(LED, OUTPUT);
}

void loop() {
  int light = analogRead(SENSOR);
  Serial.println(light);
  int brightness = map(light, 0, 1023, 255, 0);
  analogWrite(LED, constrain(brightness, 0, 255));
  delay(100);
}
`,
    goals: [
      { text: 'Make it dark (below 25% light): the LED turns on', check: (c, m) => seen(m, 'x', (c.part('ldr')?.props.light ?? 100) < 25 && (c.part('led')?.state.level ?? 0) > 0.5) },
      { text: 'Make it bright (above 60%): the LED turns off', check: (c, m) => seen(m, 'x', (c.part('ldr')?.props.light ?? 0) > 60 && c.part('led')?.state.level === 0) },
      { text: 'Challenge: dim smoothly (6+ brightness levels)', check: c => (c.board.pwmSeen.get(9)?.size ?? 0) >= 6 },
    ],
  },
  {
    id: 'sound',
    title: 'Make a Sound',
    icon: 'buzzer',
    level: 'Sensors',
    intro: `
<p>A piezo buzzer clicks every time its pin switches. Switch it 440 times per second and you hear the note A. <code>tone(pin, frequency, duration)</code> does that for you, and <code>noTone(pin)</code> stops it.</p>
<p>🔊 <em>Turn your sound on.</em> You can mute the simulator with the speaker button in the top bar.</p>
<p>A melody is just a list of frequencies. An <strong>array</strong> stores the list, and a <code>for</code> loop plays each note:</p>
<pre>int notes[] = {262, 294, 330};
notes[0]  // first item: 262</pre>`,
    parts: [BOARD, { type: 'buzzer', x: 11, z: 0, pins: { pin: 8 } }],
    code: `#define NOTE_C4 262
#define NOTE_D4 294
#define NOTE_E4 330
#define NOTE_F4 349
#define NOTE_G4 392
#define NOTE_A4 440

const int BUZZER = 8;

void setup() {
}

void loop() {
  tone(BUZZER, NOTE_A4, 200);   // beep!
  delay(1000);

  // TODO: play a melody with at least 4 different notes.
  // int melody[] = {NOTE_C4, NOTE_D4, ...};
  // for (int i = 0; i < 4; i++) { tone(...); delay(...); }
}
`,
    solution: `#define NOTE_C4 262
#define NOTE_D4 294
#define NOTE_E4 330
#define NOTE_F4 349
#define NOTE_G4 392

const int BUZZER = 8;
int melody[] = {NOTE_C4, NOTE_D4, NOTE_E4, NOTE_F4, NOTE_G4};
int count = sizeof(melody) / sizeof(melody[0]);

void setup() {
}

void loop() {
  for (int i = 0; i < count; i++) {
    tone(BUZZER, melody[i], 250);
    delay(300);
  }
  delay(1000);
}
`,
    goals: [
      { text: 'Play a beep with tone()', check: c => c.board.toneFreqs.size >= 1 },
      { text: 'Play a melody with 4+ different notes', check: c => c.board.toneFreqs.size >= 4 },
    ],
  },
  {
    id: 'distance',
    title: 'Measure Distance',
    icon: 'ultrasonic',
    level: 'Sensors',
    intro: `
<p>The <strong>HC-SR04</strong> works like a bat. It sends out a burst of ultrasound and times how long the echo takes to come back.</p>
<ol>
  <li>Send a 10 µs pulse on <strong>TRIG</strong>.</li>
  <li><code>pulseIn(ECHO, HIGH)</code> measures how long ECHO stays HIGH, in microseconds.</li>
  <li>Sound travels about 1 cm every 29 µs, there and back, so <code>cm = duration / 58</code>.</li>
</ol>
<p>Run the sketch, then <strong>drag the car</strong> toward the sensor. The teal beam shows what the sensor sees.</p>
<p><code>long</code> holds bigger numbers than <code>int</code> (which tops out at 32767). Echo times can be bigger than that!</p>`,
    parts: [BOARD, { type: 'ultrasonic', x: 11, z: 0, rot: 3, pins: { trig: 9, echo: 10 } }, { type: 'car', x: 28, z: 0, rot: 1 }],
    code: `const int TRIG = 9;
const int ECHO = 10;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
}

void loop() {
  // 1. send a 10 microsecond trigger pulse
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);

  // 2. time the echo
  long duration = pulseIn(ECHO, HIGH);

  // 3. convert to centimeters
  long cm = duration / 58;

  Serial.print("Distance: ");
  Serial.print(cm);
  Serial.println(" cm");
  delay(200);
}
`,
    solution: '',
    goals: [
      {
        text: 'Print the distance (within 2 cm of the real value)',
        check: (c, m) => {
          const n = lastNumber(c.serial);
          const d = c.part('ultrasonic')?.state.distance;
          return seen(m, 'x', n != null && d != null && Math.abs(n - d) <= 2);
        },
      },
      {
        text: 'Drag the car closer than 10 cm to the sensor',
        check: (c, m) => {
          const n = lastNumber(c.serial);
          return seen(m, 'x', (c.part('ultrasonic')?.state.distance ?? 99) < 10 && n != null && n < 10);
        },
      },
    ],
  },
  {
    id: 'servo',
    title: 'Sweep a Servo',
    icon: 'servo',
    level: 'Motion',
    intro: `
<p>A <strong>servo</strong> is a motor that turns to an exact angle between 0° and 180°, which makes it great for robot arms, steering and pointers.</p>
<p>Servos use a <em>library</em>, which is code someone else wrote that you can reuse:</p>
<pre>#include &lt;Servo.h&gt;
Servo myServo;        // create a servo object
myServo.attach(9);    // its signal wire is on pin 9
myServo.write(90);    // turn to 90°</pre>
<p><strong>Challenge:</strong> there's a potentiometer on A0. Make the servo follow the knob with <code>map(value, 0, 1023, 0, 180)</code>.</p>`,
    parts: [BOARD, { type: 'servo', x: 12, z: -2, pins: { sig: 9 } }, { type: 'pot', x: 11, z: 6, pins: { sig: 14 } }],
    code: `#include <Servo.h>

Servo myServo;

void setup() {
  myServo.attach(9);
}

void loop() {
  for (int angle = 0; angle <= 180; angle += 2) {
    myServo.write(angle);
    delay(15);
  }
  for (int angle = 180; angle >= 0; angle -= 2) {
    myServo.write(angle);
    delay(15);
  }
}
`,
    solution: `#include <Servo.h>

Servo myServo;

void setup() {
  myServo.attach(9);
}

void loop() {
  int value = analogRead(A0);
  int angle = map(value, 0, 1023, 0, 180);
  myServo.write(angle);
  delay(15);
}
`,
    goals: [
      { text: 'Sweep the servo all the way to 0° and 180°', check: c => c.board.servoSeen.has(0) && c.board.servoSeen.has(180) },
      {
        text: 'Challenge: make the servo follow the knob',
        check: (c, m) => {
          const pot = c.part('pot');
          const a = c.board.servoAngles.get(9);
          if (pot && a != null && Math.abs(a - (pot.props.value * 180) / 1023) < 6) (m.ok ??= new Set()).add(Math.round(pot.props.value / 200));
          return (m.ok?.size ?? 0) >= 3;
        },
      },
    ],
  },
  {
    id: 'motor',
    title: 'Control a Motor',
    icon: 'motor',
    level: 'Motion',
    intro: `
<p>Motors need more current than a board pin can give, so they're switched through a <strong>transistor</strong> (the small black part on the breadboard). The pin just tells the transistor how much power to let through.</p>
<p>Since it's on a ~ pin, <code>analogWrite()</code> sets the speed: 0 is stopped, 255 is full speed.</p>
<p><strong>Challenge:</strong> use the potentiometer as a speed dial.</p>`,
    parts: [BOARD, { type: 'motor', x: 12, z: -3, pins: { pin: 5 } }, { type: 'pot', x: 11, z: 5, pins: { sig: 14 } }],
    code: `const int MOTOR = 5;

void setup() {
  pinMode(MOTOR, OUTPUT);
}

void loop() {
  analogWrite(MOTOR, 80);    // slow
  delay(2000);
  analogWrite(MOTOR, 255);   // full speed
  delay(2000);
  analogWrite(MOTOR, 0);     // stop
  delay(1500);
}
`,
    solution: `const int MOTOR = 5;

void setup() {
  pinMode(MOTOR, OUTPUT);
}

void loop() {
  int speed = map(analogRead(A0), 0, 1023, 0, 255);
  analogWrite(MOTOR, speed);
  delay(20);
}
`,
    goals: [
      { text: 'Run the motor at 3 different speeds', check: c => (c.board.pwmSeen.get(5)?.size ?? 0) >= 3 },
      {
        text: 'Challenge: control the speed with the knob',
        check: (c, m) => {
          const pot = c.part('pot');
          const pwm = c.board.pins[5]?.pwm;
          if (pot && pwm != null && Math.abs(pwm - pot.props.value / 4) < 12) (m.ok ??= new Set()).add(Math.round(pot.props.value / 200));
          return (m.ok?.size ?? 0) >= 3;
        },
      },
    ],
  },
  {
    id: 'thermo',
    title: 'Project: Heat Alarm',
    icon: 'temp',
    level: 'Projects',
    intro: `
<p><strong>Project time!</strong> Build an alarm that beeps and flashes when it gets too hot.</p>
<p>The TMP36 outputs 0.5 V at 0 °C plus 0.01 V for every degree. To get the temperature:</p>
<pre>float volts = analogRead(A0) * 5.0 / 1023.0;
float tempC = (volts - 0.5) * 100.0;</pre>
<p>Use <code>float</code> for numbers with decimals. Note <code>5.0</code> and not <code>5</code>: dividing two whole numbers throws away the decimals!</p>
<p><strong>Your job:</strong> when <code>tempC</code> is above 30, turn on the red LED and sound the buzzer. Otherwise keep both off. <strong>Drag the sensor</strong> to change the temperature.</p>`,
    parts: [BOARD, { type: 'temp', x: 11, z: 5, pins: { sig: 14 } }, { type: 'buzzer', x: 17, z: 0, pins: { pin: 8 } }, { type: 'led', x: 12, z: -4, pins: { pin: 12 }, props: { color: 'red' } }],
    code: `const int SENSOR = A0;
const int BUZZER = 8;
const int LED = 12;
const float LIMIT = 30.0;

void setup() {
  Serial.begin(9600);
  pinMode(LED, OUTPUT);
}

void loop() {
  float volts = analogRead(SENSOR) * 5.0 / 1023.0;
  float tempC = (volts - 0.5) * 100.0;
  Serial.print(tempC);
  Serial.println(" C");

  // TODO: if tempC > LIMIT -> LED on + tone(BUZZER, 1000)
  //       else             -> LED off + noTone(BUZZER)

  delay(250);
}
`,
    solution: `const int SENSOR = A0;
const int BUZZER = 8;
const int LED = 12;
const float LIMIT = 30.0;

void setup() {
  Serial.begin(9600);
  pinMode(LED, OUTPUT);
}

void loop() {
  float volts = analogRead(SENSOR) * 5.0 / 1023.0;
  float tempC = (volts - 0.5) * 100.0;
  Serial.print(tempC);
  Serial.println(" C");

  if (tempC > LIMIT) {
    digitalWrite(LED, HIGH);
    tone(BUZZER, 1000);
  } else {
    digitalWrite(LED, LOW);
    noTone(BUZZER);
  }
  delay(250);
}
`,
    goals: [
      {
        text: 'Print the temperature (within 1.5 °C)',
        check: (c, m) => {
          const n = lastNumber(c.serial);
          const t = c.part('temp')?.props.temp;
          return seen(m, 'x', n != null && t != null && Math.abs(n - t) <= 1.5);
        },
      },
      { text: 'Above 30 °C: LED on and buzzer sounding', check: (c, m) => seen(m, 'x', (c.part('temp')?.props.temp ?? 0) > 31 && (c.part('led')?.state.level ?? 0) > 0.5 && !!c.part('buzzer')?.state.freq) },
      { text: 'Below 30 °C: alarm off', check: (c, m) => { const hot = (c.part('temp')?.props.temp ?? 0) > 31 && !!c.part('buzzer')?.state.freq; if (hot) m.wasHot = true; return seen(m, 'x', !!m.wasHot && (c.part('temp')?.props.temp ?? 99) < 29 && !c.part('buzzer')?.state.freq && c.part('led')?.state.level === 0); } },
    ],
  },
  {
    id: 'parking',
    title: 'Project: Parking Sensor',
    icon: 'traffic',
    level: 'Projects',
    intro: `
<p><strong>Final project:</strong> a parking assistant! It combines the distance sensor with a traffic light.</p>
<ul>
  <li>More than 30 cm away: <strong style="color:#2e9b4f">green</strong></li>
  <li>From 15 to 30 cm: <strong style="color:#c99700">yellow</strong></li>
  <li>15 cm or closer: <strong style="color:#d93a2b">red</strong></li>
</ul>
<p>A comparison like <code>cm &gt; 30</code> gives <code>true</code> (1) or <code>false</code> (0), so you can pass it straight to <code>digitalWrite()</code>. Combine conditions with <code>&amp;&amp;</code> (and) or <code>||</code> (or).</p>
<p>Green and red already work. <strong>Finish the yellow line</strong>, then drive the car in!</p>`,
    parts: [
      BOARD,
      { type: 'ultrasonic', x: 11, z: 0, rot: 3, pins: { trig: 9, echo: 10 } },
      { type: 'traffic', x: 12, z: -7, pins: { r: 4, y: 3, g: 2 } },
      { type: 'car', x: 50, z: 0, rot: 1 },
    ],
    code: `const int TRIG = 9, ECHO = 10;
const int RED = 4, YLW = 3, GRN = 2;

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  for (int p = 2; p <= 4; p++)
    pinMode(p, OUTPUT);
}

void loop() {
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long cm = pulseIn(ECHO, HIGH) / 58;

  digitalWrite(GRN, cm > 30);
  digitalWrite(YLW, LOW);          // TODO: on between 15 and 30
  digitalWrite(RED, cm <= 15);
  delay(60);
}
`,
    solution: `const int TRIG = 9, ECHO = 10;
const int RED = 4, YLW = 3, GRN = 2;

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  for (int p = 2; p <= 4; p++)
    pinMode(p, OUTPUT);
}

void loop() {
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long cm = pulseIn(ECHO, HIGH) / 58;

  digitalWrite(GRN, cm > 30);
  digitalWrite(YLW, cm > 15 && cm <= 30);
  digitalWrite(RED, cm <= 15);
  delay(60);
}
`,
    goals: [
      { text: 'Car far away (over 30 cm): only green', check: (c, m) => { const d = c.part('ultrasonic')?.state.distance ?? 0; const [r, y, g] = c.part('traffic')?.state.levels ?? [0, 0, 0]; return seen(m, 'x', d > 32 && g > 0.5 && !r && !y); } },
      { text: 'Car at 15–30 cm: only yellow', check: (c, m) => { const d = c.part('ultrasonic')?.state.distance ?? 0; const [r, y, g] = c.part('traffic')?.state.levels ?? [0, 0, 0]; return seen(m, 'x', d > 17 && d < 28 && y > 0.5 && !r && !g); } },
      { text: 'Car closer than 15 cm: only red', check: (c, m) => { const d = c.part('ultrasonic')?.state.distance ?? 99; const [r, y, g] = c.part('traffic')?.state.levels ?? [0, 0, 0]; return seen(m, 'x', d < 13 && r > 0.5 && !y && !g); } },
    ],
  },
];

LESSONS.find(l => l.id === 'distance')!.solution = LESSONS.find(l => l.id === 'distance')!.code;

// ---------- lessons for the display, input and lighting parts ----------
const DIGIT_PATTERNS: Record<string, number> = { abcdef: 0, bc: 1, abdeg: 2, abcdg: 3, bcfg: 4, acdfg: 5, acdefg: 6, abc: 7, abcdefg: 8, abcdfg: 9 };
const shownDigit = (c: GoalCtx): number | undefined => DIGIT_PATTERNS[c.part('seg7')?.state.lit ?? ''];
const lcdLines = (c: GoalCtx): string[] => [...c.board.lcds.values()][0]?.lines ?? [];

const SEG7_TABLE = `// which segments (a b c d e f g) are on for each digit
const byte DIGITS[10][7] = {
  {1,1,1,1,1,1,0},  // 0
  {0,1,1,0,0,0,0},  // 1
  {1,1,0,1,1,0,1},  // 2
  {1,1,1,1,0,0,1},  // 3
  {0,1,1,0,0,1,1},  // 4
  {1,0,1,1,0,1,1},  // 5
  {1,0,1,1,1,1,1},  // 6
  {1,1,1,0,0,0,0},  // 7
  {1,1,1,1,1,1,1},  // 8
  {1,1,1,1,0,1,1}   // 9
};
const int SEG_PINS[7] = {2, 3, 4, 5, 6, 7, 8};   // a..g

void showDigit(int d) {
  for (int s = 0; s < 7; s++) {
    digitalWrite(SEG_PINS[s], DIGITS[d][s]);
  }
}

void setup() {
  for (int s = 0; s < 7; s++) pinMode(SEG_PINS[s], OUTPUT);
}
`;

const seg7Lesson: Lesson = {
  id: 'seg7',
  title: 'Show a Number',
  icon: 'seg7',
  level: 'Displays',
  intro: `
<p>A <strong>7-segment display</strong> is seven LED bars, named <code>a</code> to <code>g</code>, arranged in a figure 8. Light the right bars and you get any digit.</p>
<p>That's a lot of on/off values, so the sketch keeps them in a <strong>2D array</strong>, which is a table with rows and columns:</p>
<pre>DIGITS[3][0]  // row 3 (digit 3), column 0 (segment a)</pre>
<p><code>showDigit()</code> walks along a row and writes each value to its pin. Run it to watch it count up.</p>
<p><strong>Challenge:</strong> make it count <em>down</em> from 9 to 0, like a rocket launch.</p>`,
  parts: [BOARD, { type: 'seg7', x: 12, z: -2, pins: { a: 2, b: 3, c: 4, d: 5, e: 6, f: 7, g: 8 } }],
  code: SEG7_TABLE + `
void loop() {
  for (int d = 0; d <= 9; d++) {
    showDigit(d);
    delay(700);
  }
}
`,
  solution: SEG7_TABLE + `
void loop() {
  for (int d = 9; d >= 0; d--) {
    showDigit(d);
    delay(700);
  }
}
`,
  goals: [
    { text: 'Show the digit 0', check: (c, m) => seen(m, 'x', shownDigit(c) === 0) },
    { text: 'Count through all ten digits', check: (c, m) => { const d = shownDigit(c); if (d !== undefined) (m.s ??= new Set()).add(d); return (m.s?.size ?? 0) >= 10; } },
    { text: 'Challenge: count down (9 then 8 then 7…)', check: (c, m) => { const d = shownDigit(c); if (d === undefined || d === m.last) return !!m.done; if (m.last === 9 && d === 8) m.n98 = true; if (m.last === 8 && d === 7 && m.n98) m.done = true; m.last = d; return !!m.done; } },
  ],
};

const lcdLesson: Lesson = {
  id: 'lcd',
  title: 'Write on a Screen',
  icon: 'lcd',
  level: 'Displays',
  intro: `
<p>This 16×2 LCD shows 2 rows of 16 characters. It has a small "backpack" board that talks <strong>I2C</strong>, a way to send data over just two wires: <strong>SDA</strong> (data, pin A4) and <strong>SCL</strong> (clock, pin A5). Many I2C devices can share those two wires. Each one has its own <em>address</em>, and this one is <code>0x27</code>.</p>
<ul>
  <li><code>lcd.setCursor(col, row)</code> moves to a spot. Counting starts at 0, so row 1 is the <em>second</em> row.</li>
  <li><code>lcd.print(x)</code> writes text or numbers at the cursor.</li>
  <li><code>lcd.clear()</code> wipes the screen.</li>
</ul>
<p>Before <code>lcd.init()</code> runs, the top row shows solid blocks. That's what a real LCD looks like before it's set up.</p>`,
  parts: [BOARD, { type: 'lcd', x: 14, z: -1, pins: { sda: 18, scl: 19 } }],
  code: `#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);   // address, columns, rows

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Hello, world!");
}

void loop() {
  // TODO: show the seconds since start on the second row
  //   lcd.setCursor(0, 1);
  //   lcd.print(millis() / 1000);
}
`,
  solution: `#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.print("Hello, world!");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print("Uptime: ");
  lcd.print(millis() / 1000);
  lcd.print(" s");
  delay(250);
}
`,
  goals: [
    { text: 'Show "Hello" on the screen', check: c => lcdLines(c).some(l => /hello/i.test(l)) },
    { text: 'Show a counting number on the second row', check: (c, m) => { const n = (lcdLines(c)[1] ?? '').match(/\d+/)?.[0]; if (n) (m.s ??= new Set()).add(n); return (m.s?.size ?? 0) >= 3; } },
  ],
};

const joystickLesson: Lesson = {
  id: 'joystick',
  title: 'Game Controller',
  icon: 'joystick',
  level: 'Sensors',
  intro: `
<p>A joystick is two potentiometers at right angles, plus a push button under the stick:</p>
<ul>
  <li><strong>VRx</strong> on A0 gives left/right (0 = left, about 512 = middle, 1023 = right).</li>
  <li><strong>VRy</strong> on A1 gives down/up.</li>
  <li><strong>SW</strong> on pin 2 is the button. It connects to GND, so use <code>INPUT_PULLUP</code>, and pressed reads <code>LOW</code>.</li>
</ul>
<p><strong>Drag the stick</strong> in the scene. Click it without dragging to press the button.</p>
<p>The middle is never exactly 512, so games use a <strong>dead zone</strong>: only count a push past, say, 200 or 800.</p>`,
  parts: [BOARD, { type: 'joystick', x: 12, z: 3, pins: { vrx: 14, vry: 15, sw: 2 } }],
  code: `const int JOY_X = A0, JOY_Y = A1, JOY_BTN = 2;

void setup() {
  Serial.begin(9600);
  pinMode(JOY_BTN, INPUT_PULLUP);
}

void loop() {
  int x = analogRead(JOY_X);
  int y = analogRead(JOY_Y);
  Serial.print("X: ");
  Serial.print(x);
  Serial.print("  Y: ");
  Serial.println(y);

  // TODO: print LEFT / RIGHT / UP / DOWN when pushed past the dead zone
  // TODO: print FIRE! when the button reads LOW

  delay(150);
}
`,
  solution: `const int JOY_X = A0, JOY_Y = A1, JOY_BTN = 2;

void setup() {
  Serial.begin(9600);
  pinMode(JOY_BTN, INPUT_PULLUP);
}

void loop() {
  int x = analogRead(JOY_X);
  int y = analogRead(JOY_Y);

  if (x < 200) Serial.println("LEFT");
  else if (x > 800) Serial.println("RIGHT");
  if (y > 800) Serial.println("UP");
  else if (y < 200) Serial.println("DOWN");

  if (digitalRead(JOY_BTN) == LOW) Serial.println("FIRE!");
  delay(150);
}
`,
  goals: [
    { text: 'Push the stick and watch X and Y change', check: (c, m) => { const j = c.part('joystick'); seen(m, 'l', (j?.state.sx ?? 0) < -0.6); seen(m, 'r', (j?.state.sx ?? 0) > 0.6); return !!(m.l || m.r) && serialLines(c.serial).length >= 5; } },
    { text: 'Print LEFT, RIGHT, UP and DOWN as you push', check: c => ['LEFT', 'RIGHT', 'UP', 'DOWN'].every(w => c.serial.toUpperCase().includes(w)) },
    { text: 'Click the stick to print FIRE!', check: c => /fire/i.test(c.serial) },
  ],
};

const neopixelLesson: Lesson = {
  id: 'neopixel',
  title: 'Light Show',
  icon: 'neopixel',
  level: 'Displays',
  intro: `
<p><strong>NeoPixels</strong> are RGB LEDs with a tiny chip inside each one. They're chained together, so a <em>single</em> data wire controls the whole strip. Each pixel can be any colour.</p>
<ul>
  <li><code>strip.setPixelColor(i, strip.Color(r, g, b))</code> sets pixel <code>i</code>. The first one is 0.</li>
  <li>Nothing changes until you call <code>strip.show()</code>, which sends all the colours at once.</li>
  <li><code>strip.setBrightness(50)</code> dims the whole strip. Real strips get <em>very</em> bright!</li>
</ul>
<p><strong>Challenge:</strong> make a rainbow. <code>strip.ColorHSV(hue)</code> turns a hue from 0 to 65535 into a colour.</p>`,
  parts: [BOARD, { type: 'neopixel', x: 14, z: -1, pins: { din: 6 }, props: { count: '8' } }],
  code: `#include <Adafruit_NeoPixel.h>

const int PIN = 6, COUNT = 8;
Adafruit_NeoPixel strip(COUNT, PIN, NEO_GRB + NEO_KHZ800);

void setup() {
  strip.begin();
  strip.setBrightness(80);
}

void loop() {
  // fill the strip one pixel at a time
  for (int i = 0; i < COUNT; i++) {
    strip.setPixelColor(i, strip.Color(255, 0, 0));
    strip.show();
    delay(150);
  }
  strip.clear();
  strip.show();
  delay(300);
}
`,
  solution: `#include <Adafruit_NeoPixel.h>

const int PIN = 6, COUNT = 8;
Adafruit_NeoPixel strip(COUNT, PIN, NEO_GRB + NEO_KHZ800);
long offset = 0;

void setup() {
  strip.begin();
  strip.setBrightness(80);
}

void loop() {
  for (int i = 0; i < COUNT; i++) {
    long hue = offset + i * 65536L / COUNT;
    strip.setPixelColor(i, strip.ColorHSV(hue % 65536));
  }
  strip.show();
  offset += 1024;
  delay(30);
}
`,
  goals: [
    { text: 'Light up all 8 pixels', check: (c, m) => seen(m, 'x', (c.part('neopixel')?.state.lit ?? 0) >= 8) },
    { text: 'Show 3 different colours at the same time', check: (c, m) => seen(m, 'x', new Set((c.part('neopixel')?.state.colors ?? []).filter((x: number) => x)).size >= 3) },
    { text: 'Challenge: a rainbow with 6+ colours at once', check: (c, m) => seen(m, 'x', new Set((c.part('neopixel')?.state.colors ?? []).filter((x: number) => x)).size >= 6) },
  ],
};

const motionLesson: Lesson = {
  id: 'motion',
  title: 'Project: Motion Alarm',
  icon: 'pir',
  level: 'Projects',
  intro: `
<p><strong>Project:</strong> a burglar alarm! The <strong>PIR sensor</strong> senses the heat of moving bodies. Its OUT pin goes <code>HIGH</code> when it sees motion and stays HIGH for a few seconds.</p>
<p>Make motion by <strong>clicking the white dome</strong>, or by dragging the car past the sensor.</p>
<p><strong>Your job:</strong></p>
<ul>
  <li>When there is motion: show <code>INTRUDER!</code> on the LCD and sound the buzzer.</li>
  <li>When it's quiet: show <code>All clear</code> and keep the buzzer silent.</li>
</ul>
<p>Tip: <code>lcd.clear()</code> before printing a new message, but only when the state <em>changes</em>. Clearing every loop makes the screen flicker!</p>`,
  parts: [
    BOARD,
    { type: 'pir', x: 12, z: 5, pins: { out: 2 } },
    { type: 'buzzer', x: 18, z: 4, pins: { pin: 8 } },
    { type: 'lcd', x: 14, z: -4, pins: { sda: 18, scl: 19 } },
    { type: 'car', x: 30, z: 12, rot: 1 },
  ],
  code: `#include <Wire.h>
#include <LiquidCrystal_I2C.h>

const int PIR = 2, BUZZER = 8;
LiquidCrystal_I2C lcd(0x27, 16, 2);
int lastState = -1;

void setup() {
  pinMode(PIR, INPUT);
  lcd.init();
  lcd.backlight();
}

void loop() {
  int motion = digitalRead(PIR);
  if (motion != lastState) {   // only update when something changes
    lastState = motion;
    lcd.clear();
    // TODO: if motion is HIGH -> print "INTRUDER!" and tone(BUZZER, 880)
    //       otherwise         -> print "All clear" and noTone(BUZZER)
  }
  delay(50);
}
`,
  solution: `#include <Wire.h>
#include <LiquidCrystal_I2C.h>

const int PIR = 2, BUZZER = 8;
LiquidCrystal_I2C lcd(0x27, 16, 2);
int lastState = -1;

void setup() {
  pinMode(PIR, INPUT);
  lcd.init();
  lcd.backlight();
}

void loop() {
  int motion = digitalRead(PIR);
  if (motion != lastState) {
    lastState = motion;
    lcd.clear();
    if (motion == HIGH) {
      lcd.print("INTRUDER!");
      tone(BUZZER, 880);
    } else {
      lcd.print("All clear");
      noTone(BUZZER);
    }
  }
  delay(50);
}
`,
  goals: [
    { text: 'When quiet, the LCD says "All clear"', check: (c, m) => seen(m, 'x', !c.part('pir')?.state.motion && lcdLines(c).some(l => /all clear/i.test(l))) },
    { text: 'On motion: "INTRUDER!" and the buzzer sounds', check: (c, m) => seen(m, 'x', !!c.part('pir')?.state.motion && lcdLines(c).some(l => /intruder/i.test(l)) && !!c.part('buzzer')?.state.freq) },
    { text: 'After the motion stops, it goes quiet again', check: (c, m) => { const mo = !!c.part('pir')?.state.motion; if (mo && c.part('buzzer')?.state.freq) m.alarm = true; return seen(m, 'x', !!m.alarm && !mo && !c.part('buzzer')?.state.freq && lcdLines(c).some(l => /all clear/i.test(l))); } },
  ],
};

function insertAfter(id: string, l: Lesson) {
  LESSONS.splice(LESSONS.findIndex(x => x.id === id) + 1, 0, l);
}
insertAfter('rgb', seg7Lesson);
insertAfter('circuit', {
  id: 'breadboard',
  title: 'Share the Power',
  icon: 'breadboard',
  level: 'Basics',
  intro: `
<p>The board only has 3 GND sockets, but big projects have lots of parts that all need ground. The answer is a <strong>breadboard</strong>.</p>
<ul>
  <li>The long <strong>rails</strong> along the edges are joined from end to end. Plug the board's GND into the blue <strong>−</strong> rail once, and every hole on that rail becomes GND.</li>
  <li>Each short column of 5 holes (a–e or f–j) is joined too. That's how parts connect to each other.</li>
</ul>
<p><strong>Wire it:</strong> zoom in on the breadboard. Drag one wire from the board's <strong>GND</strong> to any hole on the <strong>− rail</strong>. Then drag each LED's GND leg to the same rail.</p>
<p>Hover over a hole to see which other holes it's joined to.</p>`,
  parts: [
    BOARD,
    { type: 'breadboard', x: 15, z: 6 },
    { type: 'led', x: 11, z: -4, pins: { pin: 9 }, props: { color: 'red' }, noPower: true },
    { type: 'led', x: 17, z: -4, pins: { pin: 10 }, props: { color: 'green' }, noPower: true },
  ],
  code: `// Two LEDs taking turns.
const int RED = 9, GREEN = 10;

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(GREEN, OUTPUT);
}

void loop() {
  digitalWrite(RED, HIGH);  digitalWrite(GREEN, LOW);
  delay(500);
  digitalWrite(RED, LOW);   digitalWrite(GREEN, HIGH);
  delay(500);
}
`,
  solution: '',
  goals: [
    { text: 'Connect the board’s GND to the breadboard’s − rail', check: c => c.wires.some(w => [w.a, w.b].some(e => /:GND\d?$/.test(e)) && [w.a, w.b].some(e => /:(tn|bn)\d+$/.test(e))) },
    { text: 'Ground both LEDs through the rail, so both blink', check: (c, m) => { const leds = c.parts.filter(p => p.type === 'led'); leds.forEach((l, i) => seen(m, 'on' + i, (l.state.level ?? 0) > 0.5)); return leds.length === 2 && !!m.on0 && !!m.on1; } },
    { text: 'Use just one GND wire from the board', check: c => c.parts.filter(p => p.type === 'led').every(l => !l.state.missing?.length) && c.wires.filter(w => [w.a, w.b].some(e => /:GND\d?$/.test(e))).length === 1 },
  ],
});
LESSONS.find(l => l.id === 'breadboard')!.solution = LESSONS.find(l => l.id === 'breadboard')!.code;
insertAfter('serial', lcdLesson);
insertAfter('pot', joystickLesson);
insertAfter('motor', neopixelLesson);
insertAfter('thermo', motionLesson);

// ---------- timing, interrupts, relays and a weather station ----------
const MILLIS_SOLUTION = `const int BLINK_LED = 13, BUTTON = 2, BUTTON_LED = 12;

unsigned long lastToggle = 0;   // when the blink LED last changed
bool blinkOn = false;

void setup() {
  pinMode(BLINK_LED, OUTPUT);
  pinMode(BUTTON_LED, OUTPUT);
  pinMode(BUTTON, INPUT);
}

void loop() {
  // check the clock instead of waiting
  if (millis() - lastToggle >= 1000) {
    lastToggle = millis();
    blinkOn = !blinkOn;
    digitalWrite(BLINK_LED, blinkOn);
  }

  // loop() now runs thousands of times a second, so this reacts instantly
  digitalWrite(BUTTON_LED, digitalRead(BUTTON));
}
`;

insertAfter('button', {
  id: 'millis',
  title: 'Do Two Things at Once',
  icon: 'button',
  iconProps: { color: '#3b82c4' },
  level: 'Sensors',
  intro: `
<p><code>delay()</code> is easy, but while it waits the board does <strong>nothing else</strong>. Run this sketch and press the button. The yellow LED takes up to 2 seconds to notice!</p>
<p>The fix is to <strong>check the clock instead of waiting</strong>. <code>millis()</code> tells you how many milliseconds have passed since the board started:</p>
<pre>if (millis() - lastToggle >= 1000) {
  lastToggle = millis();
  // time to blink!
}</pre>
<p>Without delays, <code>loop()</code> runs thousands of times a second, so everything stays responsive. This is how real projects juggle many jobs at once.</p>
<p><strong>Tip:</strong> open the <b>Pins</b> tab under the code to watch both signals over time.</p>`,
  parts: [BOARD, { type: 'button', x: 11, z: 5, pins: { pin: 2 }, props: { color: '#3b82c4' } }, { type: 'led', x: 13, z: -3, pins: { pin: 12 }, props: { color: 'yellow' } }],
  code: `const int BLINK_LED = 13, BUTTON = 2, BUTTON_LED = 12;

void setup() {
  pinMode(BLINK_LED, OUTPUT);
  pinMode(BUTTON_LED, OUTPUT);
  pinMode(BUTTON, INPUT);
}

void loop() {
  digitalWrite(BLINK_LED, HIGH);
  delay(1000);
  digitalWrite(BLINK_LED, LOW);
  delay(1000);

  // only checked once every 2 seconds :(
  digitalWrite(BUTTON_LED, digitalRead(BUTTON));
}
`,
  solution: MILLIS_SOLUTION,
  goals: [
    { text: 'Keep the built-in LED blinking', check: c => highPulses(c.board, 13).length >= 3 },
    {
      text: 'Make the yellow LED light within 0.1 s of a press, while still blinking',
      check: (c, m) => {
        const pressed = !!c.part('button')?.state.pressed;
        if (pressed && !m.was) m.pressT = c.board.time;
        if (!pressed) m.pressT = null;
        m.was = pressed;
        const lit = c.parts.find(p => p.type === 'led')?.state.level > 0.5;
        if (m.pressT != null && lit && c.board.time - m.pressT < 100 && highPulses(c.board, 13).length >= 2) m.done = true;
        return !!m.done;
      },
    },
  ],
});

insertAfter('millis', {
  id: 'interrupts',
  title: 'Never Miss a Press',
  icon: 'button',
  iconProps: { color: '#f1c40f' },
  level: 'Sensors',
  intro: `
<p>Sometimes your code is busy, but an event <em>must not</em> be missed: a coin dropping in, a wheel turning, a doorbell. An <strong>interrupt</strong> makes the board drop what it's doing and run a function the instant a pin changes.</p>
<pre>attachInterrupt(digitalPinToInterrupt(2), onPress, FALLING);</pre>
<ul>
  <li>Only pins <strong>2 and 3</strong> can trigger interrupts on the Builder One.</li>
  <li><code>FALLING</code> fires when the pin goes HIGH → LOW (this button is wired to GND, so a press is a fall).</li>
  <li>Variables changed inside the handler must be <code>volatile</code>, and the handler should be short.</li>
</ul>
<p>The starter checks the button only between long delays, so quick presses get lost. Press it 3 times quickly, then switch to an interrupt.</p>`,
  parts: [BOARD, { type: 'button', x: 11, z: 4, pins: { pin: 2 }, props: { wiring: 'pullup', color: '#f1c40f' } }],
  code: `const int BUTTON = 2;
int presses = 0;

void setup() {
  Serial.begin(9600);
  pinMode(BUTTON, INPUT_PULLUP);
}

void loop() {
  if (digitalRead(BUTTON) == LOW) presses++;   // misses presses during delay()
  Serial.print("Presses: ");
  Serial.println(presses);
  delay(2000);   // pretend we're busy doing something else
}
`,
  solution: `const int BUTTON = 2;
volatile int presses = 0;

void onPress() {
  presses++;
}

void setup() {
  Serial.begin(9600);
  pinMode(BUTTON, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(BUTTON), onPress, FALLING);
}

void loop() {
  Serial.print("Presses: ");
  Serial.println(presses);
  delay(2000);   // busy, but no press is ever missed
}
`,
  goals: [
    {
      text: 'Press the button 3 times and see “Presses: 3” (or more)',
      check: (c, m) => {
        const pressed = !!c.part('button')?.state.pressed;
        if (pressed && !m.was) m.count = (m.count ?? 0) + 1;
        m.was = pressed;
        const n = lastNumber(c.serial);
        return seen(m, 'x', (m.count ?? 0) >= 3 && n != null && n >= m.count);
      },
    },
  ],
});

insertAfter('motor', {
  id: 'relay',
  title: 'Switch a Lamp',
  icon: 'relay',
  level: 'Motion',
  intro: `
<p>A board pin gives only 5 V and a tiny current, which isn't nearly enough for a lamp, a fan or a pump. A <strong>relay</strong> is a switch flipped by an electromagnet. Your pin powers the magnet, and the relay's contacts switch the big separate circuit. The two circuits never touch, which keeps the board safe.</p>
<p>Listen for the <em>click</em> when it switches.</p>
<p>⚠️ Real mains electricity is dangerous. Always use low-voltage lamps or a sealed relay box for real projects.</p>
<p><strong>Challenge:</strong> make it an automatic porch light. Use the light sensor on A0 to turn the lamp on only when it's dark.</p>`,
  parts: [BOARD, { type: 'relay', x: 12, z: -2, pins: { in: 7 } }, { type: 'ldr', x: 11, z: 6, pins: { sig: 14 }, props: { light: 70 } }],
  code: `const int RELAY = 7;

void setup() {
  pinMode(RELAY, OUTPUT);
}

void loop() {
  digitalWrite(RELAY, HIGH);   // click! lamp on
  delay(2000);
  digitalWrite(RELAY, LOW);    // click! lamp off
  delay(2000);
}
`,
  solution: `const int RELAY = 7, SENSOR = A0;

void setup() {
  pinMode(RELAY, OUTPUT);
}

void loop() {
  int light = analogRead(SENSOR);
  digitalWrite(RELAY, light < 300);   // dark? lamp on
  delay(200);
}
`,
  goals: [
    { text: 'Switch the lamp on and off with the relay', check: (c, m) => { const on = !!c.part('relay')?.state.on; seen(m, 'on', on); return seen(m, 'x', !!m.on && !on); } },
    { text: 'Challenge: lamp on when it’s dark (below 25%)', check: (c, m) => seen(m, 'x', (c.part('ldr')?.props.light ?? 100) < 25 && !!c.part('relay')?.state.on) },
    { text: 'Challenge: lamp off when it’s bright (above 60%)', check: (c, m) => { if ((c.part('ldr')?.props.light ?? 100) < 25 && c.part('relay')?.state.on) m.dark = true; return seen(m, 'x', !!m.dark && (c.part('ldr')?.props.light ?? 0) > 60 && !c.part('relay')?.state.on); } },
  ],
});

insertAfter('thermo', {
  id: 'weather',
  title: 'Project: Weather Station',
  icon: 'dht',
  level: 'Projects',
  intro: `
<p><strong>Project:</strong> a desk weather station. The <strong>DHT11</strong> measures temperature and humidity and sends both over a <em>single</em> data wire using its own little protocol. The <code>DHT</code> library decodes it for you:</p>
<pre>DHT dht(4, DHT11);
dht.begin();
float t = dht.readTemperature();   // °C
float h = dht.readHumidity();      // %</pre>
<p>The readings already appear in the Serial Monitor. <strong>Your job:</strong> show them on the LCD as well, temperature on the first row and humidity on the second.</p>
<p><strong>Drag the sensor</strong> up and down to change the temperature, or use its sliders.</p>`,
  parts: [BOARD, { type: 'dht', x: 11, z: 5, pins: { data: 4 } }, { type: 'lcd', x: 14, z: -3, pins: { sda: 18, scl: 19 } }],
  code: `#include <DHT.h>
#include <LiquidCrystal_I2C.h>

DHT dht(4, DHT11);
LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  Serial.begin(9600);
  dht.begin();
  lcd.init();
  lcd.backlight();
}

void loop() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  Serial.print(t);
  Serial.print(" C  ");
  Serial.print(h);
  Serial.println(" %");

  // TODO: row 0 -> "Temp: 24.00 C"   row 1 -> "Humidity: 45.00%"

  delay(1000);
}
`,
  solution: `#include <DHT.h>
#include <LiquidCrystal_I2C.h>

DHT dht(4, DHT11);
LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  Serial.begin(9600);
  dht.begin();
  lcd.init();
  lcd.backlight();
}

void loop() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  Serial.print(t);
  Serial.print(" C  ");
  Serial.print(h);
  Serial.println(" %");

  lcd.setCursor(0, 0);
  lcd.print("Temp: ");
  lcd.print(t, 1);
  lcd.print(" C   ");
  lcd.setCursor(0, 1);
  lcd.print("Humidity: ");
  lcd.print(h, 0);
  lcd.print("%   ");
  delay(1000);
}
`,
  goals: [
    { text: 'Read the temperature (Serial shows it within 1 °C)', check: (c, m) => { const t = c.part('dht')?.props.temp; const n = serialLines(c.serial).slice(-2).map(l => parseFloat(l)).find(x => !Number.isNaN(x)); return seen(m, 'x', t != null && n != null && Math.abs(n - t) <= 1); } },
    {
      text: 'Show the temperature on the LCD’s first row',
      check: (c, m) => { const t = c.part('dht')?.props.temp; const n = parseFloat((lcdLines(c)[0] ?? '').match(/-?\d+(\.\d+)?/)?.[0] ?? 'NaN'); return seen(m, 'x', t != null && Math.abs(n - t) <= 1); },
    },
    {
      text: 'Show the humidity on the second row',
      check: (c, m) => { const h = c.part('dht')?.props.hum; const n = parseFloat((lcdLines(c)[1] ?? '').match(/\d+(\.\d+)?/)?.[0] ?? 'NaN'); return seen(m, 'x', h != null && Math.abs(n - h) <= 1); },
    },
  ],
});

// ---------- arrays, Morse code, OLED, stepper, keypad lock, plant monitor ----------
const litLedIndex = (c: GoalCtx): number => {
  const leds = c.parts.filter(p => p.type === 'led').sort((a, b) => a.x - b.x);
  const on = leds.map((l, i) => ((l.state.level ?? 0) > 0.5 ? i : -1)).filter(i => i >= 0);
  return on.length === 1 ? on[0] : -1;
};

LESSONS.push({
  id: 'chaser',
  title: 'LED Chaser',
  icon: 'led',
  iconProps: { color: 'yellow' },
  level: 'Basics',
  intro: `
<p>Six LEDs means six pin numbers. Instead of six variables, keep them in an <strong>array</strong>, a numbered list:</p>
<pre>const int LEDS[] = {2, 3, 4, 5, 6, 7};
LEDS[0]   // 2, the first one
LEDS[5]   // 7, the last one</pre>
<p>A <code>for</code> loop can then walk through the list, so the same three lines of code handle every LED. Add a seventh LED and you only change the list.</p>
<p><strong>Challenge:</strong> make the light bounce back and forth like a scanner. Add a second loop that counts <em>down</em>.</p>`,
  parts: [BOARD, ...[2, 3, 4, 5, 6, 7].map((pin, i) => ({ type: 'led', x: 9 + i * 2.4, z: -3, pins: { pin }, props: { color: 'red' } }))],
  code: `const int LEDS[] = {2, 3, 4, 5, 6, 7};
const int COUNT = 6;

void setup() {
  for (int i = 0; i < COUNT; i++) {
    pinMode(LEDS[i], OUTPUT);
  }
}

void loop() {
  for (int i = 0; i < COUNT; i++) {
    digitalWrite(LEDS[i], HIGH);
    delay(120);
    digitalWrite(LEDS[i], LOW);
  }
  // TODO: now go back the other way (count down)
}
`,
  solution: `const int LEDS[] = {2, 3, 4, 5, 6, 7};
const int COUNT = 6;

void setup() {
  for (int i = 0; i < COUNT; i++) pinMode(LEDS[i], OUTPUT);
}

void flash(int i) {
  digitalWrite(LEDS[i], HIGH);
  delay(120);
  digitalWrite(LEDS[i], LOW);
}

void loop() {
  for (int i = 0; i < COUNT; i++) flash(i);
  for (int i = COUNT - 2; i > 0; i--) flash(i);
}
`,
  goals: [
    { text: 'Light all six LEDs one after another', check: (c, m) => { const i = litLedIndex(c); if (i >= 0 && i !== m.last) { m.run = i === (m.last ?? -1) + 1 ? (m.run ?? 0) + 1 : i === 0 ? 1 : 0; m.last = i; } return seen(m, 'x', (m.run ?? 0) >= 6); } },
    { text: 'Challenge: bounce back like a scanner (…4, 5, 4, 3…)', check: (c, m) => { const i = litLedIndex(c); if (i >= 0 && i !== m.last) { if (m.last === 5 && i === 4) m.done = true; m.last = i; } return !!m.done; } },
  ],
});

LESSONS.push({
  id: 'morse',
  title: 'Morse Messenger',
  icon: 'buzzer',
  level: 'Sensors',
  intro: `
<p>Morse code turns letters into short and long beeps: <strong>S</strong> is <code>· · ·</code> and <strong>O</strong> is <code>– – –</code>, so SOS is <code>· · · – – – · · ·</code>.</p>
<p>The sketch defines two of its own functions, <code>dot()</code> and <code>dash()</code>. Then <code>loop()</code> reads almost like the message itself. Splitting a job into small named functions is one of the most useful habits in programming.</p>
<p><strong>Your job:</strong> make the buzzer beep along with the light. Add <code>tone()</code> and <code>noTone()</code> inside <code>dot()</code> and <code>dash()</code>. Because both use the same functions, you only change two places!</p>`,
  parts: [BOARD, { type: 'buzzer', x: 12, z: 0, pins: { pin: 8 } }],
  code: `const int LED = 13, BUZZER = 8;
const int UNIT = 150;   // length of one dot, in ms

void dot() {
  digitalWrite(LED, HIGH);
  delay(UNIT);
  digitalWrite(LED, LOW);
  delay(UNIT);
}

void dash() {
  digitalWrite(LED, HIGH);
  delay(UNIT * 3);
  digitalWrite(LED, LOW);
  delay(UNIT);
}

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  dot(); dot(); dot();      // S
  delay(UNIT * 2);
  dash(); dash(); dash();   // O
  delay(UNIT * 2);
  dot(); dot(); dot();      // S
  delay(UNIT * 6);
}
`,
  solution: `const int LED = 13, BUZZER = 8;
const int UNIT = 150;

void dot() {
  digitalWrite(LED, HIGH);
  tone(BUZZER, 700);
  delay(UNIT);
  digitalWrite(LED, LOW);
  noTone(BUZZER);
  delay(UNIT);
}

void dash() {
  digitalWrite(LED, HIGH);
  tone(BUZZER, 700);
  delay(UNIT * 3);
  digitalWrite(LED, LOW);
  noTone(BUZZER);
  delay(UNIT);
}

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  dot(); dot(); dot();
  delay(UNIT * 2);
  dash(); dash(); dash();
  delay(UNIT * 2);
  dot(); dot(); dot();
  delay(UNIT * 6);
}
`,
  goals: [
    { text: 'Flash S O S on the built-in LED', check: c => highPulses(c.board, 13).map(d => (d < 300 ? '.' : '-')).join('').includes('...---...') },
    { text: 'Beep the buzzer along with every dot and dash', check: c => c.board.toneFreqs.size > 0 && (c.board.transitions.get(8)?.length ?? 0) >= 12 },
  ],
});

LESSONS.push({
  id: 'oled',
  title: 'Draw with Pixels',
  icon: 'oled',
  level: 'Displays',
  intro: `
<p>This OLED screen has 128 × 64 tiny pixels that glow by themselves, so it needs no backlight. You can draw text, lines, rectangles and circles anywhere:</p>
<pre>display.clearDisplay();
display.drawCircle(64, 32, 10, SSD1306_WHITE);
display.display();   // nothing shows until this!</pre>
<p>Coordinates start at the <strong>top-left</strong> corner: x grows to the right (0–127) and y grows <em>down</em> (0–63).</p>
<p><strong>Challenge:</strong> animate it. Clear, draw a ball at a new position, show it, and repeat. That's how every video game draws a frame.</p>`,
  parts: [BOARD, { type: 'oled', x: 12, z: -1, pins: { sda: 18, scl: 19 } }],
  code: `#include <Wire.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(10, 8);
  display.print("Builder");
  display.drawRect(0, 0, 128, 64, SSD1306_WHITE);
  display.display();
}

void loop() {
  // TODO: animate a ball bouncing across the screen
}
`,
  solution: `#include <Wire.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);
int x = 10, y = 40, dx = 3, dy = 2;

void setup() {
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.setTextColor(SSD1306_WHITE);
}

void loop() {
  x += dx;
  y += dy;
  if (x < 5 || x > 122) dx = -dx;   // bounce off the walls
  if (y < 5 || y > 58) dy = -dy;

  display.clearDisplay();
  display.drawRect(0, 0, 128, 64, SSD1306_WHITE);
  display.fillCircle(x, y, 4, SSD1306_WHITE);
  display.display();
  delay(30);
}
`,
  goals: [
    { text: 'Show text and a frame on the OLED', check: (c, m) => seen(m, 'x', (c.part('oled')?.state.lit ?? 0) > 200) },
    { text: 'Challenge: animate it (10 different frames)', check: (c, m) => { const s = c.part('oled')?.state.sig; if (s) (m.s ??= new Set()).add(s); return (m.s?.size ?? 0) >= 10; } },
  ],
});

LESSONS.push({
  id: 'stepper',
  title: 'Precise Steps',
  icon: 'stepper',
  level: 'Motion',
  intro: `
<p>A <strong>stepper motor</strong> doesn't just spin. It moves in tiny, exact steps: this one takes <strong>2048 steps</strong> for a full turn. Count the steps and you always know exactly where it's pointing, with no sensor needed. 3D printers and camera sliders work this way.</p>
<p>Watch the four red LEDs on the driver board. They show the coils switching on in turn, which pulls the motor around one step at a time.</p>
<pre>Stepper motor(2048, 8, 10, 9, 11);   // note the pin order!
motor.setSpeed(12);    // rpm
motor.step(512);       // a quarter turn</pre>
<p><strong>Challenge:</strong> make it tick like a clock hand, stopping at 90°, 180° and 270°.</p>`,
  parts: [BOARD, { type: 'stepper', x: 11, z: -2, pins: { in1: 8, in2: 9, in3: 10, in4: 11 } }],
  code: `#include <Stepper.h>

const int STEPS_PER_TURN = 2048;
Stepper motor(STEPS_PER_TURN, 8, 10, 9, 11);

void setup() {
  motor.setSpeed(12);
}

void loop() {
  motor.step(STEPS_PER_TURN);    // one full turn forward
  delay(500);
  motor.step(-STEPS_PER_TURN);   // and back
  delay(500);
}
`,
  solution: `#include <Stepper.h>

const int STEPS_PER_TURN = 2048;
Stepper motor(STEPS_PER_TURN, 8, 10, 9, 11);

void setup() {
  motor.setSpeed(12);
}

void loop() {
  motor.step(STEPS_PER_TURN / 4);   // 90 degrees
  delay(1000);
}
`,
  goals: [
    { text: 'Turn one full revolution', check: (c, m) => seen(m, 'x', Math.abs(c.part('stepper')?.state.steps ?? 0) >= 2048) },
    {
      text: 'Challenge: stop at 90°, 180° and 270°',
      check: (c, m) => {
        const st = c.part('stepper')?.state;
        if (!st) return false;
        // judged in real time: sim time jumps ahead during delay()
        if (st.steps !== m.last) { m.last = st.steps; m.since = c.now; return !!m.done; }
        if (c.now - (m.since ?? 0) > 200) {
          const a = ((Math.round(st.angle) % 360) + 360) % 360;
          for (const target of [90, 180, 270]) if (Math.abs(a - target) <= 3) (m.hit ??= new Set()).add(target);
        }
        if ((m.hit?.size ?? 0) >= 3) m.done = true;
        return !!m.done;
      },
    },
  ],
});

const LOCK_HEADER = `#include <Keypad.h>
#include <Servo.h>

const byte ROWS = 4, COLS = 4;
char keys[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};
byte rowPins[ROWS] = {9, 8, 7, 6};
byte colPins[COLS] = {5, 4, 3, 2};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

Servo lock;
const String SECRET = "1234";
String entered = "";

void setup() {
  Serial.begin(9600);
  lock.attach(10);
  lock.write(0);              // 0 = locked
  Serial.println("Type the code, then #");
}
`;

LESSONS.push({
  id: 'lock',
  title: 'Project: Code Lock',
  icon: 'keypad',
  level: 'Projects',
  intro: `
<p><strong>Project:</strong> a door lock that opens with a secret code! The <strong>keypad</strong> is a grid: pressing a key connects one <em>row</em> wire to one <em>column</em> wire, so 8 pins can read 16 keys. The <code>Keypad</code> library scans the grid for you.</p>
<p>Each key press adds a character to a <code>String</code>:</p>
<pre>entered += key;          // "1" → "12" → "123"…
if (entered == SECRET)   // compare two Strings</pre>
<p><strong>Your job:</strong> when <code>#</code> is pressed, check the code. If it's right, turn the servo to 90° (unlocked) for 3 seconds and print <code>OPEN</code>. If it's wrong, print <code>Wrong code</code>. Either way, clear <code>entered</code>.</p>
<p><strong>Click the keys</strong> on the keypad to type.</p>`,
  parts: [
    BOARD,
    { type: 'keypad', x: 11, z: 4, pins: { r1: 9, r2: 8, r3: 7, r4: 6, c1: 5, c2: 4, c3: 3, c4: 2 } },
    { type: 'servo', x: 17, z: -3, pins: { sig: 10 } },
  ],
  code: LOCK_HEADER + `
void loop() {
  char key = keypad.getKey();
  if (key) {
    Serial.println(key);
    // TODO: if key is '#': check entered against SECRET, then clear it
    //       otherwise:     entered += key;
  }
}
`,
  solution: LOCK_HEADER + `
void loop() {
  char key = keypad.getKey();
  if (!key) return;

  if (key == '#') {
    if (entered == SECRET) {
      Serial.println("OPEN");
      lock.write(90);
      delay(3000);
      lock.write(0);
    } else {
      Serial.println("Wrong code");
    }
    entered = "";
  } else {
    entered += key;
    Serial.print("*");
  }
}
`,
  goals: [
    { text: 'Press a key and see it in the Serial Monitor', check: c => /^[0-9A-D*#*]$/m.test(c.serial) || /\*/.test(c.serial.split('\n').slice(1).join('')) },
    { text: 'Type 1 2 3 4 # and the lock opens', check: (c, m) => seen(m, 'x', /OPEN/.test(c.serial) && (c.board.servoAngles.get(10) ?? 0) >= 85) },
    { text: 'A wrong code prints “Wrong code” and stays locked', check: (c, m) => seen(m, 'x', /wrong/i.test(c.serial) && (c.board.servoAngles.get(10) ?? 0) < 5) },
  ],
});

LESSONS.push({
  id: 'plant',
  title: 'Project: Thirsty Plant',
  icon: 'soil',
  level: 'Projects',
  intro: `
<p><strong>Project:</strong> a plant that tells you when it needs water.</p>
<p>The soil sensor's reading goes <em>down</em> as the soil gets wetter: about 1023 when bone dry and about 323 when soaked. <code>map()</code> can flip and rescale that into a friendly percentage:</p>
<pre>int moisture = map(raw, 1023, 323, 0, 100);</pre>
<p><strong>Your job:</strong> when moisture drops below 30%, blink the blue LED and beep. When the plant has water again, stay quiet.</p>
<p><strong>Drag the pot</strong> up and down to water it or let it dry out, and watch the leaves droop!</p>`,
  parts: [BOARD, { type: 'soil', x: 13, z: 4, pins: { ao: 14 }, props: { moisture: 60 } }, { type: 'led', x: 11, z: -4, pins: { pin: 12 }, props: { color: 'blue' } }, { type: 'buzzer', x: 16, z: -4, pins: { pin: 8 } }],
  code: `const int SENSOR = A0, LED = 12, BUZZER = 8;

void setup() {
  Serial.begin(9600);
  pinMode(LED, OUTPUT);
}

void loop() {
  int raw = analogRead(SENSOR);
  int moisture = map(raw, 1023, 323, 0, 100);
  Serial.print("Moisture: ");
  Serial.print(moisture);
  Serial.println("%");

  // TODO: below 30%? blink the LED and beep. Otherwise LED off, no sound.

  delay(500);
}
`,
  solution: `const int SENSOR = A0, LED = 12, BUZZER = 8;

void setup() {
  Serial.begin(9600);
  pinMode(LED, OUTPUT);
}

void loop() {
  int raw = analogRead(SENSOR);
  int moisture = constrain(map(raw, 1023, 323, 0, 100), 0, 100);
  Serial.print("Moisture: ");
  Serial.print(moisture);
  Serial.println("%");

  if (moisture < 30) {
    digitalWrite(LED, HIGH);
    tone(BUZZER, 1200, 150);
    delay(250);
    digitalWrite(LED, LOW);
    delay(250);
  } else {
    digitalWrite(LED, LOW);
    noTone(BUZZER);
    delay(500);
  }
}
`,
  goals: [
    { text: 'Print the moisture % (within 5%)', check: (c, m) => { const n = lastNumber(c.serial); const v = c.part('soil')?.props.moisture; return seen(m, 'x', n != null && v != null && Math.abs(n - v) <= 5); } },
    { text: 'Dry soil (below 25%): blink and beep', check: (c, m) => { const dry = (c.part('soil')?.props.moisture ?? 100) < 25; if (dry && (c.part('led')?.state.level ?? 0) > 0.5) m.blink = true; if (dry && c.part('buzzer')?.state.freq) m.beep = true; return seen(m, 'x', !!m.blink && !!m.beep); } },
    { text: 'Watered again (above 50%): quiet', check: (c, m) => { const v = c.part('soil')?.props.moisture ?? 0; if (v < 25 && c.part('buzzer')?.state.freq) m.alarm = true; return seen(m, 'x', !!m.alarm && v > 50 && !c.part('buzzer')?.state.freq && c.part('led')?.state.level === 0); } },
  ],
});

// ---------- encoder, LED matrix, clap switch, smoke alarm ----------
const ENC_HEAD = `const int CLK = 2, DT = 3, SW = 4;
int position = 0;
int lastClk;

void setup() {
  Serial.begin(9600);
  pinMode(CLK, INPUT);
  pinMode(DT, INPUT);
  pinMode(SW, INPUT_PULLUP);
  lastClk = digitalRead(CLK);
}
`;

LESSONS.push({
  id: 'encoder',
  title: 'Spin the Dial',
  icon: 'encoder',
  level: 'Sensors',
  intro: `
<p>A potentiometer stops at each end. A <strong>rotary encoder</strong> turns forever, click by click, like a car stereo's volume knob.</p>
<p>It doesn't report an angle. Instead its two pins, <strong>CLK</strong> and <strong>DT</strong>, switch in a pattern as it turns. Each time CLK changes, look at DT:</p>
<ul>
  <li>DT is <em>different</em> from CLK: it turned clockwise, so count up.</li>
  <li>DT is the <em>same</em>: anticlockwise, so count down.</li>
</ul>
<p><strong>Drag the knob</strong> up or down to turn it. Click it to press its built-in switch (<strong>SW</strong> reads LOW when pressed).</p>`,
  parts: [BOARD, { type: 'encoder', x: 12, z: 3, pins: { clk: 2, dt: 3, sw: 4 } }],
  code: ENC_HEAD + `
void loop() {
  int clk = digitalRead(CLK);
  if (clk != lastClk) {                        // the knob moved one click
    if (digitalRead(DT) != clk) position++;    // clockwise
    else position--;                           // anticlockwise
    Serial.println(position);
  }
  lastClk = clk;

  // TODO: when SW reads LOW (pressed), set position back to 0 and print it
}
`,
  solution: ENC_HEAD + `
void loop() {
  int clk = digitalRead(CLK);
  if (clk != lastClk) {
    if (digitalRead(DT) != clk) position++;
    else position--;
    Serial.println(position);
  }
  lastClk = clk;

  if (digitalRead(SW) == LOW) {
    position = 0;
    Serial.println(position);
    delay(250);   // wait for the button to settle
  }
}
`,
  goals: [
    { text: 'Turn it 5 clicks clockwise and see 5 printed', check: (c, m) => seen(m, 'x', (lastNumber(c.serial) ?? 0) >= 5) },
    { text: 'Turn it back the other way and watch it count down', check: (c, m) => { const n = lastNumber(c.serial); if (n != null) { if (m.max != null && n < m.max) m.down = true; m.max = Math.max(m.max ?? n, n); } return !!m.down; } },
    {
      text: 'Challenge: click the knob to reset the count to 0',
      check: (c, m) => {
        const n = lastNumber(c.serial);
        if (n != null && n !== 0) m.counted = true;
        if (m.counted && c.part('encoder')?.state.pressed) m.pressed = true;
        return seen(m, 'x', !!m.pressed && n === 0);
      },
    },
  ],
});

const MATRIX_HEAD = `#include <LedControl.h>

LedControl lc = LedControl(12, 11, 10, 1);   // DIN, CLK, CS, number of displays

// each row is 8 LEDs: 1 = on, read left to right
byte smile[8] = {
  B00111100,
  B01000010,
  B10100101,
  B10000001,
  B10100101,
  B10011001,
  B01000010,
  B00111100
};
`;

LESSONS.push({
  id: 'matrix',
  title: 'Pixel Art',
  icon: 'matrix',
  level: 'Displays',
  intro: `
<p>This matrix has 64 LEDs, but a <strong>MAX7219</strong> chip on the back drives them all, so you only need 3 data wires.</p>
<p>Each row is one <code>byte</code>, 8 bits for 8 LEDs. Write it in binary so you can <em>see</em> the picture in your code:</p>
<pre>B00111100   →  ··████··</pre>
<p><code>lc.setRow(0, row, value)</code> draws a row. The display starts asleep, so <code>lc.shutdown(0, false)</code> wakes it first.</p>
<p><strong>Challenge:</strong> animate it. Draw a second picture, like a wink, and switch between the two in <code>loop()</code>.</p>`,
  parts: [BOARD, { type: 'matrix', x: 13, z: -1, pins: { din: 12, clk: 11, cs: 10 } }],
  code: MATRIX_HEAD + `
void setup() {
  lc.shutdown(0, false);    // wake it up
  lc.setIntensity(0, 8);    // brightness 0-15
  lc.clearDisplay(0);
  for (int r = 0; r < 8; r++) lc.setRow(0, r, smile[r]);
}

void loop() {
  // TODO: animate! e.g. switch between the smile and a wink every half second
}
`,
  solution: MATRIX_HEAD + `
byte wink[8] = {
  B00111100,
  B01000010,
  B10000101,
  B10000001,
  B10100101,
  B10011001,
  B01000010,
  B00111100
};

void draw(byte img[]) {
  for (int r = 0; r < 8; r++) lc.setRow(0, r, img[r]);
}

void setup() {
  lc.shutdown(0, false);
  lc.setIntensity(0, 8);
}

void loop() {
  draw(smile);
  delay(500);
  draw(wink);
  delay(500);
}
`,
  goals: [
    { text: 'Show the smiley face', check: (c, m) => seen(m, 'x', (c.part('matrix')?.state.lit ?? 0) >= 15) },
    { text: 'Challenge: animate between two pictures', check: (c, m) => { const sig = c.part('matrix')?.state.sig; if (sig) (m.s ??= new Set()).add(sig); return (m.s?.size ?? 0) >= 2; } },
  ],
});

LESSONS.push({
  id: 'clap',
  title: 'Clap Switch',
  icon: 'sound',
  level: 'Sensors',
  intro: `
<p>The <strong>sound sensor</strong> measures how loud it is. <strong>AO</strong> gives the loudness on <code>analogRead()</code>, and <strong>DO</strong> flips HIGH whenever it's louder than a threshold you set with the little blue screw.</p>
<p>Open the <b>Plotter</b> tab and <strong>click the microphone</strong> to clap. You'll see a spike!</p>
<p><strong>Your job:</strong> build a clap switch. Each clap toggles the LED on or off. Watch for DO going from LOW to HIGH (an <em>edge</em>), flip a <code>bool</code>, and wait a moment so one clap doesn't count twice.</p>`,
  parts: [BOARD, { type: 'sound', x: 12, z: 4, pins: { ao: 14, do: 2 } }, { type: 'led', x: 13, z: -4, pins: { pin: 13 }, props: { color: 'yellow' } }],
  code: `const int MIC = A0, CLAP = 2, LED = 13;

void setup() {
  Serial.begin(9600);
  pinMode(CLAP, INPUT);
  pinMode(LED, OUTPUT);
}

void loop() {
  Serial.println(analogRead(MIC));   // open the Plotter tab!

  // TODO: when CLAP goes HIGH, toggle the LED (and wait ~300 ms)

  delay(20);
}
`,
  solution: `const int MIC = A0, CLAP = 2, LED = 13;
bool lightOn = false;

void setup() {
  Serial.begin(9600);
  pinMode(CLAP, INPUT);
  pinMode(LED, OUTPUT);
}

void loop() {
  Serial.println(analogRead(MIC));

  if (digitalRead(CLAP) == HIGH) {
    lightOn = !lightOn;
    digitalWrite(LED, lightOn);
    delay(300);   // one clap, one toggle
  }
  delay(20);
}
`,
  goals: [
    { text: 'Clap and see a loud spike (over 600)', check: (c, m) => seen(m, 'x', serialLines(c.serial).slice(-12).some(l => Number(l) > 600)) },
    { text: 'Clap to switch the LED on', check: (c, m) => { if (c.part('sound')?.state.clap) m.clapped = true; return seen(m, 'x', !!m.clapped && (c.part('led')?.state.level ?? 0) > 0.5); } },
    { text: 'Clap again to switch it off', check: (c, m) => { const on = (c.part('led')?.state.level ?? 0) > 0.5; if (on) m.wasOn = true; return seen(m, 'x', !!m.wasOn && !on && !c.part('sound')?.state.clap && (c.board.transitions.get(13)?.length ?? 0) >= 2); } },
  ],
});

LESSONS.push({
  id: 'smoke',
  title: 'Project: Smoke Alarm',
  icon: 'gas',
  level: 'Projects',
  intro: `
<p><strong>Project:</strong> a smoke alarm! The <strong>MQ-2</strong> has a tiny heater inside (see it glow?) that reacts with smoke and gas, so its <strong>AO</strong> reading climbs as the air gets smokier.</p>
<p><strong>Your job:</strong> when the reading goes above <code>400</code>, flash the red LED and sound the buzzer. When the air is clear again, go quiet.</p>
<p><strong>Drag the sensor</strong> up to add smoke, and down to clear it.</p>
<p>Real gas sensors need a few minutes to warm up before their readings are trustworthy, and a real alarm should always be a certified one!</p>`,
  parts: [BOARD, { type: 'gas', x: 12, z: 4, pins: { ao: 14 } }, { type: 'buzzer', x: 18, z: -2, pins: { pin: 8 } }, { type: 'led', x: 12, z: -4, pins: { pin: 12 }, props: { color: 'red' } }],
  code: `const int SENSOR = A0, BUZZER = 8, LED = 12;
const int LIMIT = 400;

void setup() {
  Serial.begin(9600);
  pinMode(LED, OUTPUT);
}

void loop() {
  int smoke = analogRead(SENSOR);
  Serial.println(smoke);

  // TODO: above LIMIT -> LED on + tone(BUZZER, 2000). Otherwise LED off + noTone.

  delay(200);
}
`,
  solution: `const int SENSOR = A0, BUZZER = 8, LED = 12;
const int LIMIT = 400;

void setup() {
  Serial.begin(9600);
  pinMode(LED, OUTPUT);
}

void loop() {
  int smoke = analogRead(SENSOR);
  Serial.println(smoke);

  if (smoke > LIMIT) {
    digitalWrite(LED, HIGH);
    tone(BUZZER, 2000);
    delay(150);
    digitalWrite(LED, LOW);
    noTone(BUZZER);
    delay(100);
  } else {
    digitalWrite(LED, LOW);
    noTone(BUZZER);
    delay(200);
  }
}
`,
  goals: [
    { text: 'Print the smoke level', check: (c, m) => { const n = lastNumber(c.serial); const g = c.part('gas')?.props.gas; return seen(m, 'x', n != null && g != null && Math.abs(n - (90 + g * 8.5)) < 40); } },
    { text: 'Lots of smoke (over 50%): LED and buzzer go off', check: (c, m) => { const g = c.part('gas')?.props.gas ?? 0; if (g > 50 && (c.part('led')?.state.level ?? 0) > 0.5) m.led = true; if (g > 50 && c.part('buzzer')?.state.freq) m.buzz = true; return seen(m, 'x', !!m.led && !!m.buzz); } },
    { text: 'Clear air (under 20%): quiet again', check: (c, m) => { const g = c.part('gas')?.props.gas ?? 0; if (g > 50 && c.part('buzzer')?.state.freq) m.alarm = true; return seen(m, 'x', !!m.alarm && g < 20 && !c.part('buzzer')?.state.freq && c.part('led')?.state.level === 0); } },
  ],
});

// Canonical order: grouped by level, easiest first within each group.
// ---------- bug hunts: broken sketches and circuits to fix ----------
const HUNT_METHOD = `
<p class="hunt-steps"><strong>How bug hunters work:</strong> ① read the bug report ② press <strong>Run</strong> and watch closely ③ guess the cause ④ change <em>one</em> thing and run again.</p>`;

/** How long (ms of sketch time, so it means the same at any speed) a condition has held. */
function heldFor(c: GoalCtx, m: Record<string, any>, key: string, cond: boolean): number {
  if (!cond) { m[key] = null; return 0; }
  m[key] ??= c.board.time;
  return c.board.time - m[key];
}

LESSONS.push(
  {
    id: 'bug-pinmode',
    title: 'Bug Hunt: The Dim LED',
    icon: 'led',
    iconProps: { color: 'yellow' },
    level: 'Debug',
    intro: `
<p class="bug-report">🐞 <strong>Bug report:</strong> “My LED is blinking, but it’s so dim I can barely see it!”</p>
<p>The code turns pin 8 on and off every half second, and the wiring is fine. So why is it so faint?</p>
<p><strong>Clue:</strong> a pin has to be told what job it does before it can power anything.</p>${HUNT_METHOD}`,
    parts: [BOARD, { type: 'led', x: 11, z: -3, pins: { pin: 8 }, props: { color: 'yellow' } }],
    code: `const int LED = 8;

void setup() {
  pinMode(LED, INPUT);
}

void loop() {
  digitalWrite(LED, HIGH);
  delay(500);
  digitalWrite(LED, LOW);
  delay(500);
}
`,
    solution: `const int LED = 8;

void setup() {
  pinMode(LED, OUTPUT);   // OUTPUT can power the LED; INPUT only trickles a weak pull-up
}

void loop() {
  digitalWrite(LED, HIGH);
  delay(500);
  digitalWrite(LED, LOW);
  delay(500);
}
`,
    goals: [
      { text: 'Make the LED blink at full brightness', check: (c, m) => { const l = c.part('led'); return seen(m, 'on', (l?.state.level ?? 0) > 0.5) && seen(m, 'off', !!m.on && l?.state.level === 0); } },
      { text: 'Keep the timing: on for half a second each blink', check: c => highPulses(c.board, 8).filter(d => Math.abs(d - 500) < 60).length >= 2 },
    ],
  },
  {
    id: 'bug-wiring',
    title: 'Bug Hunt: Crossed Wires',
    icon: 'traffic',
    level: 'Debug',
    intro: `
<p class="bug-report">🐞 <strong>Bug report:</strong> “It should be <span style="color:#e2533b">red</span> for 2 seconds, then <span style="color:#3fae5a">green</span> for 1. Mine does it the wrong way round!”</p>
<p>This time the code is fine. Follow each wire from the board to its LED, and compare with the pin numbers in the code.</p>
<p>You can fix it two ways: <strong>move the wires</strong>, or <strong>change the numbers</strong> in the code. Either is a real fix.</p>${HUNT_METHOD}`,
    parts: [BOARD, { type: 'led', x: 11, z: -3, pins: { pin: 10 }, props: { color: 'red' } }, { type: 'led', x: 14, z: -3, pins: { pin: 9 }, props: { color: 'green' } }],
    code: `const int RED = 9, GREEN = 10;

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(GREEN, OUTPUT);
}

void loop() {
  digitalWrite(RED, HIGH);
  delay(2000);
  digitalWrite(RED, LOW);

  digitalWrite(GREEN, HIGH);
  delay(1000);
  digitalWrite(GREEN, LOW);
}
`,
    solution: `const int RED = 10, GREEN = 9;   // match the pins the wires really go to

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(GREEN, OUTPUT);
}

void loop() {
  digitalWrite(RED, HIGH);
  delay(2000);
  digitalWrite(RED, LOW);

  digitalWrite(GREEN, HIGH);
  delay(1000);
  digitalWrite(GREEN, LOW);
}
`,
    goals: [
      { text: 'The red LED stays on for 2 seconds', check: c => { const pin = c.parts.find(p => p.type === 'led' && p.props.color === 'red')?.pins.pin; return pin != null && highPulses(c.board, pin).some(d => Math.abs(d - 2000) < 150); } },
      { text: 'Then the green LED for 1 second', check: c => { const pin = c.parts.find(p => p.type === 'led' && p.props.color === 'green')?.pins.pin; return pin != null && highPulses(c.board, pin).some(d => Math.abs(d - 1000) < 150); } },
    ],
  },
  {
    id: 'bug-button',
    title: 'Bug Hunt: The Ghost Button',
    icon: 'button',
    level: 'Debug',
    intro: `
<p class="bug-report">🐞 <strong>Bug report:</strong> “My LED flickers on <em>by itself</em> when nobody touches anything. And when I do press the button, it’s even weirder!”</p>
<p>Look at how this button is wired: one leg goes to the pin, the other straight to <strong>GND</strong>. There’s no resistor holding the pin steady when the button is up.</p>
<p><strong>Clue:</strong> there are <em>two</em> bugs. One is in <code>setup()</code>; the other is in the <code>if</code>.</p>${HUNT_METHOD}`,
    parts: [BOARD, { type: 'button', x: 11, z: 4, pins: { pin: 2 }, props: { wiring: 'pullup' } }, { type: 'led', x: 11, z: -3, pins: { pin: 12 }, props: { color: 'blue' } }],
    code: `const int BUTTON = 2, LED = 12;

void setup() {
  pinMode(BUTTON, INPUT);
  pinMode(LED, OUTPUT);
}

void loop() {
  if (digitalRead(BUTTON) == HIGH) {
    digitalWrite(LED, HIGH);
  } else {
    digitalWrite(LED, LOW);
  }
}
`,
    solution: `const int BUTTON = 2, LED = 12;

void setup() {
  pinMode(BUTTON, INPUT_PULLUP);   // the built-in resistor holds the pin HIGH when the button is up
  pinMode(LED, OUTPUT);
}

void loop() {
  if (digitalRead(BUTTON) == LOW) {   // pressed connects the pin to GND, so pressed reads LOW
    digitalWrite(LED, HIGH);
  } else {
    digitalWrite(LED, LOW);
  }
}
`,
    goals: [
      { text: 'No ghosts: the LED stays dark for 2 seconds while nobody presses', check: (c, m) => seen(m, 'x', c.board.time > 300 && heldFor(c, m, 'calm', !c.part('button')?.state.pressed && c.part('led')?.state.level === 0) > 2000) },
      { text: 'Hold the button: the LED stays lit', check: (c, m) => seen(m, 'x', heldFor(c, m, 'held', !!c.part('button')?.state.pressed && (c.part('led')?.state.level ?? 0) > 0.5) > 400) },
    ],
  },
  {
    id: 'bug-array',
    title: 'Bug Hunt: Off by One',
    icon: 'led',
    iconProps: { color: 'green' },
    level: 'Debug',
    intro: `
<p class="bug-report">🐞 <strong>Bug report:</strong> “My chaser runs once along the LEDs, then the whole thing crashes!”</p>
<p>Read the error message carefully: it tells you the line, and which index went wrong.</p>
<p><strong>Clue:</strong> an array of 6 items is numbered <code>0</code> to <code>5</code>. Count how many times the loop really runs.</p>${HUNT_METHOD}`,
    parts: [BOARD, ...[2, 3, 4, 5, 6, 7].map((pin, i) => ({ type: 'led', x: 9 + i * 2.4, z: -3, pins: { pin }, props: { color: 'green' } }))],
    code: `const int LEDS[] = {2, 3, 4, 5, 6, 7};
const int COUNT = 6;

void setup() {
  for (int i = 0; i < COUNT; i++) {
    pinMode(LEDS[i], OUTPUT);
  }
}

void loop() {
  for (int i = 0; i <= COUNT; i++) {
    digitalWrite(LEDS[i], HIGH);
    delay(150);
    digitalWrite(LEDS[i], LOW);
  }
}
`,
    solution: `const int LEDS[] = {2, 3, 4, 5, 6, 7};
const int COUNT = 6;

void setup() {
  for (int i = 0; i < COUNT; i++) {
    pinMode(LEDS[i], OUTPUT);
  }
}

void loop() {
  for (int i = 0; i < COUNT; i++) {   // < not <=: the last index is COUNT - 1
    digitalWrite(LEDS[i], HIGH);
    delay(150);
    digitalWrite(LEDS[i], LOW);
  }
}
`,
    goals: [
      { text: 'Chase along all six LEDs twice in a row', check: (c, m) => { const i = litLedIndex(c); if (i >= 0 && i !== m.last) { m.run = i === ((m.last ?? -1) + 1) % 6 ? (m.run ?? 0) + 1 : i === 0 ? 1 : 0; m.last = i; } return seen(m, 'x', (m.run ?? 0) >= 12); } },
      { text: 'Keep it running for 10 seconds without a crash', check: (c, m) => seen(m, 'x', c.board.time >= 10000) },
    ],
  },
  {
    id: 'bug-compare',
    title: 'Bug Hunt: Always On',
    icon: 'ldr',
    level: 'Debug',
    intro: `
<p class="bug-report">🐞 <strong>Bug report:</strong> “My night light is <em>always</em> on, even in bright sunshine. The Serial Monitor shows the sensor working fine!”</p>
<p>Watch the numbers in the Serial Monitor while you drag the light sensor. The readings change, so the sensor isn’t the problem.</p>
<p><strong>Clue:</strong> in C++, <code>=</code> and <code>==</code> mean very different things. One <em>stores</em> a value; the other <em>asks</em> a question.</p>${HUNT_METHOD}`,
    parts: [BOARD, { type: 'ldr', x: 11, z: 4, pins: { sig: 14 }, props: { light: 70 } }, { type: 'led', x: 12, z: -3, pins: { pin: 9 }, props: { color: 'yellow' } }],
    code: `const int SENSOR = A0, LED = 9;
const int DARK = 300;

void setup() {
  Serial.begin(9600);
  pinMode(LED, OUTPUT);
}

void loop() {
  int light = analogRead(SENSOR);
  Serial.println(light);

  if (light = DARK) {   // dark?
    digitalWrite(LED, HIGH);
  } else {
    digitalWrite(LED, LOW);
  }
  delay(200);
}
`,
    solution: `const int SENSOR = A0, LED = 9;
const int DARK = 300;

void setup() {
  Serial.begin(9600);
  pinMode(LED, OUTPUT);
}

void loop() {
  int light = analogRead(SENSOR);
  Serial.println(light);

  if (light < DARK) {   // a comparison, not an assignment
    digitalWrite(LED, HIGH);
  } else {
    digitalWrite(LED, LOW);
  }
  delay(200);
}
`,
    goals: [
      { text: 'Bright (above 60%): the LED is off', check: (c, m) => seen(m, 'x', heldFor(c, m, 'b', (c.part('ldr')?.props.light ?? 0) > 60 && c.part('led')?.state.level === 0) > 500) },
      { text: 'Dark (below 25%): the LED turns on', check: (c, m) => seen(m, 'x', heldFor(c, m, 'd', (c.part('ldr')?.props.light ?? 100) < 25 && (c.part('led')?.state.level ?? 0) > 0.5) > 500) },
    ],
  },
);

// ---------- remote controls, phones, big digits and data logging ----------
const irLabel = (c: GoalCtx) => { const k = c.part('ir')?.state.last; return k != null ? IR_KEYS[k][0] : null; };
const btLog = (c: GoalCtx): { me?: boolean; text?: string }[] => c.part('bluetooth')?.state.log ?? [];

LESSONS.push(
  {
    id: 'remote',
    title: 'TV Remote Control',
    icon: 'ir',
    level: 'Sensors',
    intro: `
<p>A TV remote flashes an <strong>invisible infrared light</strong> in a fast pattern. Each button has its own pattern, a number called its <em>code</em>. The receiver module turns the flashes back into that number.</p>
<pre>IrReceiver.begin(IR_PIN, ENABLE_LED_FEEDBACK);
if (IrReceiver.decode()) {
  int code = IrReceiver.decodedIRData.command;
  IrReceiver.resume();   // ready for the next one
}</pre>
<p>Run the sketch and <strong>click buttons on the remote</strong> in the scene. Each code appears in the Serial Monitor in hex: button <b>1</b> sends <code>0xC</code>, button <b>2</b> sends <code>0x18</code>.</p>`,
    parts: [BOARD, { type: 'ir', x: 13, z: 2, pins: { sig: 11 } }, { type: 'led', x: 11, z: -3, pins: { pin: 9 }, props: { color: 'green' } }],
    code: `#include <IRremote.hpp>

const int IR_PIN = 11, LED = 9;

void setup() {
  Serial.begin(9600);
  IrReceiver.begin(IR_PIN, ENABLE_LED_FEEDBACK);
  pinMode(LED, OUTPUT);
}

void loop() {
  if (IrReceiver.decode()) {
    int code = IrReceiver.decodedIRData.command;
    Serial.print("Button code: 0x");
    Serial.println(code, HEX);

    // TODO: button 1 (0x0C) turns the LED on, button 2 (0x18) turns it off

    IrReceiver.resume();
  }
}
`,
    solution: `#include <IRremote.hpp>

const int IR_PIN = 11, LED = 9;

void setup() {
  Serial.begin(9600);
  IrReceiver.begin(IR_PIN, ENABLE_LED_FEEDBACK);
  pinMode(LED, OUTPUT);
}

void loop() {
  if (IrReceiver.decode()) {
    int code = IrReceiver.decodedIRData.command;
    Serial.print("Button code: 0x");
    Serial.println(code, HEX);

    if (code == 0x0C) digitalWrite(LED, HIGH);   // button 1
    if (code == 0x18) digitalWrite(LED, LOW);    // button 2

    IrReceiver.resume();
  }
}
`,
    goals: [
      { text: 'Click a remote button and see its code in the Serial Monitor', check: (c, m) => seen(m, 'x', irLabel(c) != null && /[0-9A-F]{1,2}\s*$/im.test(c.serial.trim())) },
      { text: 'Button 1 turns the LED on', check: (c, m) => seen(m, 'x', irLabel(c) === '1' && (c.part('led')?.state.level ?? 0) > 0.5) },
      { text: 'Button 2 turns it off again', check: (c, m) => { if ((c.part('led')?.state.level ?? 0) > 0.5) m.wasOn = true; return seen(m, 'x', !!m.wasOn && irLabel(c) === '2' && c.part('led')?.state.level === 0); } },
    ],
  },
  {
    id: 'scoreboard',
    title: 'Scoreboard',
    icon: 'digits',
    level: 'Displays',
    intro: `
<p>The <strong>TM1637</strong> display has four big digits and a colon, but needs just <em>two</em> data wires. Its library does the hard work:</p>
<pre>TM1637Display display(CLK, DIO);
display.setBrightness(7);        // 0–7
display.showNumberDec(42);       // "  42"
display.showNumberDec(42, true); // "0042"</pre>
<p><strong>Your job:</strong> make a scoreboard. Each press of the button adds one point.</p>
<p><strong>Watch out:</strong> <code>loop()</code> runs thousands of times while you hold the button down. Count the moment it goes <em>down</em>, not every loop it stays down.</p>`,
    parts: [BOARD, { type: 'digits', x: 15, z: -3, pins: { clk: 2, dio: 3 } }, { type: 'button', x: 11, z: 4, pins: { pin: 4 }, props: { color: '#3b82c4' } }],
    code: `#include <TM1637Display.h>

const int CLK = 2, DIO = 3, BUTTON = 4;
TM1637Display display(CLK, DIO);
int score = 0;

void setup() {
  pinMode(BUTTON, INPUT);
  display.setBrightness(7);
  display.showNumberDec(1234);
}

void loop() {
  // TODO: when the button goes down, add 1 to score and show it
}
`,
    solution: `#include <TM1637Display.h>

const int CLK = 2, DIO = 3, BUTTON = 4;
TM1637Display display(CLK, DIO);
int score = 0;
bool wasDown = false;

void setup() {
  pinMode(BUTTON, INPUT);
  display.setBrightness(7);
  display.showNumberDec(1234);
}

void loop() {
  bool down = digitalRead(BUTTON) == HIGH;
  if (down && !wasDown) {          // only the moment it goes down
    score++;
    display.showNumberDec(score, true);
  }
  wasDown = down;
  delay(10);
}
`,
    goals: [
      { text: 'See 1234 on the display', check: (c, m) => seen(m, 'x', digitsText(c.part('digits')?.state.segs) === '1234') },
      { text: 'Each press adds exactly one point: reach 5', check: (c, m) => { const b = !!c.part('button')?.state.pressed; if (b && !m.down) m.n = (m.n ?? 0) + 1; m.down = b; return seen(m, 'x', (m.n ?? 0) >= 5 && parseInt(digitsText(c.part('digits')?.state.segs).replace(/\D/g, ''), 10) === m.n); } },
      { text: 'Challenge: show the score with leading zeros, like 0005', check: (c, m) => seen(m, 'x', /^0\d{3}$/.test(digitsText(c.part('digits')?.state.segs)) && digitsText(c.part('digits')?.state.segs) !== '0000') },
    ],
  },
  {
    id: 'phone',
    title: 'Project: Phone Control',
    icon: 'bluetooth',
    level: 'Projects',
    intro: `
<p><strong>Project:</strong> switch a light from your phone. The <strong>HC-05</strong> Bluetooth module is a wireless serial cable: whatever the phone sends arrives like Serial Monitor text.</p>
<p>The board’s real Serial pins (0 and 1) are busy talking to the computer, so <code>SoftwareSerial</code> makes a second serial port on any two pins:</p>
<pre>SoftwareSerial bt(10, 11);   // RX, TX
bt.begin(9600);
if (bt.available()) { char c = bt.read(); }
bt.println("hi phone!");</pre>
<p>Click the module, then <strong>📱 Open phone app</strong> to chat with your board.</p>`,
    parts: [BOARD, { type: 'bluetooth', x: 13, z: 4, pins: { txd: 10, rxd: 11 } }, { type: 'led', x: 11, z: -3, pins: { pin: 8 }, props: { color: 'blue' } }],
    code: `#include <SoftwareSerial.h>

SoftwareSerial bt(10, 11);   // RX, TX: the module's TXD goes to 10, its RXD to 11
const int LED = 8;

void setup() {
  Serial.begin(9600);
  bt.begin(9600);
  pinMode(LED, OUTPUT);
  bt.println("Hello from Builder!");
}

void loop() {
  if (bt.available()) {
    char c = bt.read();
    Serial.print("Phone sent: ");
    Serial.println(c);

    // TODO: '1' turns the LED on and '0' turns it off.
    //       Reply to the phone with bt.println("LED ON") or "LED OFF".
  }
}
`,
    solution: `#include <SoftwareSerial.h>

SoftwareSerial bt(10, 11);   // RX, TX
const int LED = 8;

void setup() {
  Serial.begin(9600);
  bt.begin(9600);
  pinMode(LED, OUTPUT);
  bt.println("Hello from Builder!");
}

void loop() {
  if (bt.available()) {
    char c = bt.read();
    if (c == '1') {
      digitalWrite(LED, HIGH);
      bt.println("LED ON");
    } else if (c == '0') {
      digitalWrite(LED, LOW);
      bt.println("LED OFF");
    }
  }
}
`,
    goals: [
      { text: 'Open the phone app and see the board say hello', check: (c, m) => seen(m, 'x', btLog(c).some(l => !l.me && /hello/i.test(l.text ?? ''))) },
      { text: 'Send 1 to switch the LED on, then 0 to switch it off', check: (c, m) => { const sent = btLog(c).filter(l => l.me).pop()?.text; const lit = (c.part('led')?.state.level ?? 0) > 0.5; if (sent === '1' && lit) m.on = true; return seen(m, 'x', !!m.on && sent === '0' && !lit); } },
      { text: 'Reply to the phone with “LED ON” or “LED OFF”', check: (c, m) => seen(m, 'x', btLog(c).some(l => !l.me && /LED (ON|OFF)/i.test(l.text ?? ''))) },
    ],
  },
  {
    id: 'logger',
    title: 'Project: Data Logger',
    icon: 'sdcard',
    level: 'Projects',
    intro: `
<p><strong>Project:</strong> a weather logger that keeps working with no computer attached. It writes every reading to a file on an <strong>SD card</strong>, so you can open it in a spreadsheet later.</p>
<pre>File f = SD.open("log.txt", FILE_WRITE);   // FILE_WRITE adds to the end
if (f) {
  f.println(tempC);
  f.close();                              // always close!
}</pre>
<p>Click the SD module to see what’s on the card. <strong>Challenge:</strong> write each line as <code>seconds,temperature</code>, like <code>3,24.50</code>. That’s CSV, the format every spreadsheet understands.</p>`,
    parts: [BOARD, { type: 'sdcard', x: 15, z: 4, pins: { cs: 10, mosi: 11, miso: 12, sck: 13 } }, { type: 'temp', x: 11, z: -4, pins: { sig: 14 } }],
    code: `#include <SD.h>

const int CS = 10;

void setup() {
  Serial.begin(9600);
  if (SD.begin(CS)) Serial.println("Card ready");
  else Serial.println("No card!");
}

void loop() {
  float volts = analogRead(A0) * 5.0 / 1023.0;
  float tempC = (volts - 0.5) * 100.0;
  Serial.println(tempC);

  // TODO: open "log.txt" with FILE_WRITE, println the temperature, then close it

  delay(1000);
}
`,
    solution: `#include <SD.h>

const int CS = 10;

void setup() {
  Serial.begin(9600);
  if (SD.begin(CS)) Serial.println("Card ready");
  else Serial.println("No card!");
}

void loop() {
  float volts = analogRead(A0) * 5.0 / 1023.0;
  float tempC = (volts - 0.5) * 100.0;
  Serial.println(tempC);

  File f = SD.open("log.txt", FILE_WRITE);
  if (f) {
    f.print(millis() / 1000);   // seconds since start
    f.print(",");
    f.println(tempC);
    f.close();
  }
  delay(1000);
}
`,
    goals: [
      { text: 'Start the card: “Card ready” in the Serial Monitor', check: c => /card ready/i.test(c.serial) },
      { text: 'Write 5 readings into log.txt', check: c => (c.part('sdcard')?.props.files?.['log.txt'] ?? '').split('\n').filter((l: string) => /-?\d/.test(l)).length >= 5 },
      { text: 'Challenge: write CSV lines like 3,24.50', check: c => (c.part('sdcard')?.props.files?.['log.txt'] ?? '').split('\n').filter((l: string) => /^\s*\d+\s*,\s*-?\d+(\.\d+)?\s*$/.test(l)).length >= 3 },
    ],
  },
);

// ---------- robotics: a robot car and a robot arm ----------
const ROBOT_PINS = { ena: 5, in1: 7, in2: 8, in3: 9, in4: 10, enb: 6 };
/** The board rides on the robot's deck (the robot is part #1 of the lesson). */
const boardOn = (lessonId: string, mdz = 0): PartSpec => ({ type: 'uno', x: 0, z: 0, props: { mount: `${lessonId}-1`, mdx: 0, mdz } });
const robotOf = (c: GoalCtx) => c.part('robot');
/** Total turning (radians, any direction) and the robot's distance from where it started. */
function robotTrack(c: GoalCtx, m: Record<string, any>) {
  const r = robotOf(c);
  const pose = r?.state.pose;
  if (!r || !pose) return { turned: m.turned ?? 0, fromHome: 0, travelled: 0 };
  if (m.lastA != null) m.turned = (m.turned ?? 0) + Math.abs(pose.a - m.lastA);
  m.lastA = pose.a;
  return { turned: m.turned ?? 0, fromHome: Math.hypot(pose.x - r.x, pose.z - r.z), travelled: r.state.travelled ?? 0 };
}
const MOTOR_SETUP = `const int ENA = 5, IN1 = 7, IN2 = 8;   // left motor
const int ENB = 6, IN3 = 9, IN4 = 10;  // right motor

/** Drive each wheel: -255 (full reverse) to 255 (full forward). */
void drive(int left, int right) {
  digitalWrite(IN1, left > 0);
  digitalWrite(IN2, left < 0);
  analogWrite(ENA, abs(left));
  digitalWrite(IN3, right > 0);
  digitalWrite(IN4, right < 0);
  analogWrite(ENB, abs(right));
}
`;
const MOTOR_PINMODES = `  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);`;

LESSONS.push(
  {
    id: 'robot-drive',
    title: 'Robot: First Drive',
    icon: 'robot',
    level: 'Robotics',
    intro: `
<p>Meet your <strong>robot car</strong>. Each wheel has its own motor, and the <strong>L298N motor driver</strong> on the back powers them. The board can’t power a motor directly; it just tells the driver what to do:</p>
<pre>IN1 HIGH, IN2 LOW   → left wheel forward
IN1 LOW,  IN2 HIGH  → left wheel backward
both LOW            → stop
analogWrite(ENA, 0–255) → how fast</pre>
<p>The right wheel works the same with IN3, IN4 and ENB. The board is mounted on the robot’s deck, so it rides along.</p>
<p><strong>Steering:</strong> spin the wheels in opposite directions and the robot turns on the spot. <strong>Challenge:</strong> drive a square and end up back where you started.</p>`,
    parts: [boardOn('robot-drive'), { type: 'robot', x: 0, z: 10, pins: ROBOT_PINS }],
    code: `${MOTOR_SETUP}
void setup() {
${MOTOR_PINMODES}
}

void loop() {
  drive(200, 200);   // forward
  delay(1000);
  drive(0, 0);       // stop
  delay(2000);

  // TODO: turn on the spot with drive(-200, 200), then drive a square
}
`,
    solution: `${MOTOR_SETUP}
void setup() {
${MOTOR_PINMODES}
}

void loop() {
  for (int side = 0; side < 4; side++) {
    drive(200, 200);    // one side of the square
    delay(1000);
    drive(-200, 200);   // a quarter turn to the left
    delay(618);
  }
  drive(0, 0);
  delay(3000);
}
`,
    goals: [
      { text: 'Drive forward at least 15 cm', check: (c, m) => seen(m, 'x', robotTrack(c, m).travelled >= 15) },
      { text: 'Turn the robot at least a quarter turn', check: (c, m) => seen(m, 'x', robotTrack(c, m).turned >= Math.PI / 2 - 0.1) },
      { text: 'Challenge: drive a square and stop near the start', check: (c, m) => { const t = robotTrack(c, m); return seen(m, 'x', t.travelled >= 60 && t.turned >= 1.4 * Math.PI && t.fromHome < 8); } },
    ],
  },
  {
    id: 'line-follow',
    title: 'Robot: Line Follower',
    icon: 'linesensor',
    level: 'Robotics',
    intro: `
<p>A <strong>line follower</strong> is the classic first robot. Two infrared eyes at the front look down at the mat: each reads <code>HIGH</code> over the black line and <code>LOW</code> over white.</p>
<pre>both eyes on the line → go straight
only the LEFT eye     → the line curves left: turn left
only the RIGHT eye    → turn right
neither               → lost! keep turning the way you last turned</pre>
<p>The starter drives straight and prints what the eyes see. Run it and watch it leave the track at the first bend. Then teach it to steer.</p>`,
    parts: [
      boardOn('line-follow'),
      { type: 'robot', x: -4, z: 29, rot: 1, pins: ROBOT_PINS },
      { type: 'track', x: 0, z: 18 },
      { type: 'linesensor', x: 0, z: 0, pins: { l: 2, r: 3 }, props: { mount: 'line-follow-1', mdx: 0, mdz: -8 } },
    ],
    code: `${MOTOR_SETUP}
const int LEFT_EYE = 2, RIGHT_EYE = 3;

void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
  pinMode(LEFT_EYE, INPUT);
  pinMode(RIGHT_EYE, INPUT);
}

void loop() {
  bool left = digitalRead(LEFT_EYE);
  bool right = digitalRead(RIGHT_EYE);
  Serial.print(left ? "LINE " : "white ");
  Serial.println(right ? "LINE" : "white");

  drive(150, 150);   // TODO: steer using left and right
  delay(20);
}
`,
    solution: `${MOTOR_SETUP}
const int LEFT_EYE = 2, RIGHT_EYE = 3;
int lastTurn = 1;   // 1 = left, -1 = right

void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
  pinMode(LEFT_EYE, INPUT);
  pinMode(RIGHT_EYE, INPUT);
}

void loop() {
  bool left = digitalRead(LEFT_EYE);
  bool right = digitalRead(RIGHT_EYE);
  Serial.print(left ? "LINE " : "white ");
  Serial.println(right ? "LINE" : "white");

  if (left && right) {
    drive(150, 150);          // on the line: straight on
  } else if (left) {
    drive(0, 150);            // line is to the left
    lastTurn = 1;
  } else if (right) {
    drive(150, 0);            // line is to the right
    lastTurn = -1;
  } else if (lastTurn == 1) {
    drive(-60, 140);          // lost it: search the way we last turned
  } else {
    drive(140, -60);
  }
  delay(5);
}
`,
    goals: [
      { text: 'Read both eyes: LINE / white in the Serial Monitor', check: c => /(LINE|white)\s+(LINE|white)/.test(c.serial) },
      { text: 'Follow the line for 10 seconds without losing it', check: (c, m) => { const eyes = c.part('linesensor')?.state.eyes; const r = robotOf(c); if (!r?.state.pose) return !!m.x; const lost = !eyes?.[0] && !eyes?.[1]; if (lost) m.lostAt ??= c.board.time; else m.lostAt = null; if (m.lostAt != null && c.board.time - m.lostAt > 1500) m.failedAt = c.board.time; return seen(m, 'x', c.board.time - (m.failedAt ?? 0) >= 10000 && (r.state.travelled ?? 0) > 40); } },
      { text: 'Challenge: drive a whole lap', check: (c, m) => { const r = robotOf(c), t = c.part('track'); const pose = r?.state.pose; if (!pose || !t) return !!m.x; const ang = Math.atan2(pose.z - t.z, pose.x - t.x); if (m.last != null) { let d = ang - m.last; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; m.sum = (m.sum ?? 0) + d; } m.last = ang; return seen(m, 'x', Math.abs(m.sum ?? 0) >= 2 * Math.PI); } },
    ],
  },
  {
    id: 'avoider',
    title: 'Robot: Obstacle Avoider',
    icon: 'ultrasonic',
    level: 'Robotics',
    intro: `
<p>Give your robot eyes that measure distance. The <strong>ultrasonic sensor</strong> on the front pings and times the echo (you met it in <em>Measure Distance</em>).</p>
<p>The plan: drive forward, and whenever a wall is closer than about 15 cm, back up a little and turn away. That simple rule lets a robot wander a room without crashing.</p>
<p><strong>Build it yourself:</strong> the walls are blocks on the snap grid. Drag them around (or add more from the tray in Sandbox) to make a maze.</p>`,
    parts: [
      boardOn('avoider'),
      { type: 'robot', x: 0, z: 8, pins: ROBOT_PINS },
      { type: 'ultrasonic', x: 0, z: 0, rot: 2, pins: { trig: 11, echo: 12 }, props: { mount: 'avoider-1', mdx: 0, mdz: -7.6 } },
      ...[-20, 0, 20].flatMap(x => [{ type: 'wall', x, z: -23, props: { len: '20' } }, { type: 'wall', x, z: 39, props: { len: '20' } }]),
      ...[-12, 8, 28].flatMap(z => [{ type: 'wall', x: -31, z, rot: 1, props: { len: '20', color: '#3b82c4' } }, { type: 'wall', x: 31, z, rot: 1, props: { len: '20', color: '#3b82c4' } }]),
    ],
    code: `${MOTOR_SETUP}
const int TRIG = 11, ECHO = 12;

long distanceCm() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 30000);
  return us / 58;
}

void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
}

void loop() {
  long d = distanceCm();
  Serial.println(d);
  drive(170, 170);   // TODO: if d is under 15 cm, back up and turn away
  delay(30);
}
`,
    solution: `${MOTOR_SETUP}
const int TRIG = 11, ECHO = 12;

long distanceCm() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 30000);
  return us / 58;
}

void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
}

void loop() {
  long d = distanceCm();
  Serial.println(d);
  if (d > 0 && d < 15) {
    drive(-150, -150);   // back up a little
    delay(300);
    drive(150, -150);    // turn right, about 90°
    delay(800);
  } else {
    drive(170, 170);
  }
  delay(30);
}
`,
    goals: [
      { text: 'See the distance ahead in the Serial Monitor', check: c => serialLines(c.serial).filter(l => /^\d+$/.test(l)).length >= 3 },
      { text: 'Drive for 20 seconds without touching a wall', check: (c, m) => { const r = robotOf(c); return seen(m, 'x', !!r?.state.pose && c.board.time >= 20000 && (r.state.bumps ?? 0) === 0 && (r.state.travelled ?? 0) >= 40); } },
      { text: 'Turn away from 3 walls', check: (c, m) => { const d = c.part('ultrasonic')?.state.distance ?? 999; const r = robotOf(c); if (!r?.state.pose) return !!m.x; if (d < 15 && !m.near) { m.near = true; m.n = (m.n ?? 0) + 1; } if (d > 25) m.near = false; return seen(m, 'x', (m.n ?? 0) >= 3 && (r.state.bumps ?? 0) === 0); } },
    ],
  },
  {
    id: 'arm-pick',
    title: 'Robot Arm: Pick and Place',
    icon: 'arm',
    level: 'Robotics',
    intro: `
<p>Factories use <strong>robot arms</strong> to move things. This one has four servos, each a joint you control with <code>write(angle)</code>:</p>
<pre>base      turns the whole arm   (90 = facing forward)
shoulder  leans the arm         (90 = straight up)
elbow     bends the forearm     (90 = straight)
claw      under 40 grips, over 70 opens</pre>
<p><strong>Your job:</strong> pick up the red cube and drop it on the pad. Reaching the cube takes <code>shoulder 30</code> and <code>elbow 10</code>; the pad is at <code>base 180</code>.</p>
<p>Move one joint at a time with a <code>delay()</code> between, so the arm has time to get there.</p>`,
    parts: [
      { type: 'uno', x: 0, z: 0 },
      { type: 'arm', x: 14, z: 4, pins: { base: 3, shoulder: 5, elbow: 6, claw: 9 } },
      { type: 'cube', x: 14, z: 16.75 },
      { type: 'pad', x: 26.4, z: 4.3 },
    ],
    code: `#include <Servo.h>

Servo base, shoulder, elbow, claw;

void setup() {
  base.attach(3);
  shoulder.attach(5);
  elbow.attach(6);
  claw.attach(9);

  claw.write(90);       // open the claw
  delay(500);
  shoulder.write(30);   // reach down to the cube
  elbow.write(10);
  delay(1000);

  // TODO: close the claw, lift, turn to the pad (base 180), lower, open
}

void loop() {}
`,
    solution: `#include <Servo.h>

Servo base, shoulder, elbow, claw;

void moveArm(int b, int s, int e) {
  base.write(b);
  shoulder.write(s);
  elbow.write(e);
  delay(900);
}

void setup() {
  base.attach(3);
  shoulder.attach(5);
  elbow.attach(6);
  claw.attach(9);

  claw.write(90);          // open
  moveArm(90, 30, 10);     // reach down to the cube
  claw.write(20);          // grip
  delay(500);
  moveArm(90, 90, 90);     // lift
  moveArm(180, 90, 90);    // turn to the pad
  moveArm(180, 30, 10);    // lower
  claw.write(90);          // let go
  delay(500);
  moveArm(90, 90, 90);     // home
}

void loop() {}
`,
    goals: [
      { text: 'Move every joint', check: (c, m) => { const st = c.part('arm')?.state ?? {}; for (const k of ['base', 'shoulder', 'elbow', 'claw']) if (Math.abs((st[k] ?? 90) - 90) > 20) m[k] = true; return seen(m, 'x', ['base', 'shoulder', 'elbow', 'claw'].every(k => m[k])); } },
      { text: 'Pick up the cube', check: (c, m) => seen(m, 'x', !!c.part('arm')?.state.holding) },
      { text: 'Place the cube on the pad', check: (c, m) => { const cb = c.part('cube'), pd = c.part('pad'); return seen(m, 'x', !!cb && !!pd && !cb.state.heldBy && Math.abs(cb.x - pd.x) < 3 && Math.abs(cb.z - pd.z) < 3 && (cb.group?.position.y ?? 1) < 0.05); } },
    ],
  },
);

// ---------- more robot programs: bumpers, phone control, encoders, light seeking, patrolling ----------
const ARENA: PartSpec[] = [
  ...[-20, 0, 20].flatMap(x => [{ type: 'wall', x, z: -23, props: { len: '20' } }, { type: 'wall', x, z: 39, props: { len: '20' } }]),
  ...[-12, 8, 28].flatMap(z => [{ type: 'wall', x: -31, z, rot: 1, props: { len: '20', color: '#3b82c4' } }, { type: 'wall', x: 31, z, rot: 1, props: { len: '20', color: '#3b82c4' } }]),
];
const robotStopped = (c: GoalCtx) => { const r = robotOf(c); return !!r && Math.abs(r.state.vl ?? 0) + Math.abs(r.state.vr ?? 0) < 0.5; };
const LINE_FOLLOW_LOOP = `  if (left && right) {
    drive(150, 150);
  } else if (left) {
    drive(0, 150);
    lastTurn = 1;
  } else if (right) {
    drive(150, 0);
    lastTurn = -1;
  } else if (lastTurn == 1) {
    drive(-60, 140);
  } else {
    drive(140, -60);
  }`;

LESSONS.push(
  {
    id: 'bumper-bot',
    title: 'Robot: Bump and Turn',
    icon: 'bumper',
    level: 'Robotics',
    intro: `
<p>The simplest way for a robot to know it hit something: a <strong>bumper switch</strong>. Its long lever sticks out in front, and touching a wall pushes it in.</p>
<p>It’s wired like the button in <em>The Ghost Button</em>: to GND, with <code>INPUT_PULLUP</code>, so it reads <code>LOW</code> when pressed.</p>
<pre>if (digitalRead(BUMPER) == LOW) {
  // ouch! back up and turn
}</pre>
<p>Real robot vacuums started out exactly like this.</p>`,
    parts: [boardOn('bumper-bot'), { type: 'robot', x: 0, z: 8, pins: ROBOT_PINS }, { type: 'bumper', x: 0, z: 0, pins: { sig: 2 }, props: { mount: 'bumper-bot-1', mdx: 0, mdz: -8.4 } }, ...ARENA],
    code: `${MOTOR_SETUP}
const int BUMPER = 2;

void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
  pinMode(BUMPER, INPUT_PULLUP);
}

void loop() {
  if (digitalRead(BUMPER) == LOW) {
    Serial.println("BUMP!");
    // TODO: back up a little, then turn away
  }
  drive(170, 170);
  delay(10);
}
`,
    solution: `${MOTOR_SETUP}
const int BUMPER = 2;

void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
  pinMode(BUMPER, INPUT_PULLUP);
}

void loop() {
  if (digitalRead(BUMPER) == LOW) {
    Serial.println("BUMP!");
    drive(-150, -150);   // back off the wall
    delay(400);
    drive(150, -150);    // turn right
    delay(700);
  }
  drive(170, 170);
  delay(10);
}
`,
    goals: [
      { text: 'Feel a bump: “BUMP!” in the Serial Monitor', check: c => /bump/i.test(c.serial) },
      { text: 'Bounce off 3 walls', check: (c, m) => { const t = !!c.part('bumper')?.state.touching; if (t && !m.down && robotOf(c)?.state.pose) m.n = (m.n ?? 0) + 1; m.down = t; return seen(m, 'x', (m.n ?? 0) >= 3 && (robotOf(c)?.state.travelled ?? 0) > 40); } },
      { text: 'Keep exploring for 25 seconds', check: (c, m) => seen(m, 'x', c.board.time >= 25000 && (robotOf(c)?.state.travelled ?? 0) >= 120) },
    ],
  },
  {
    id: 'phone-robot',
    title: 'Robot: Phone Remote Control',
    icon: 'bluetooth',
    level: 'Robotics',
    intro: `
<p>Turn the robot into a remote-control car. The <strong>Bluetooth module</strong> on its deck receives letters from the phone app’s arrow pad:</p>
<pre>▲ F   forward      ▼ B   back
◀ L   turn left    ▶ R   turn right
■ S   stop</pre>
<p>Click the Bluetooth module and choose <strong>📱 Open phone app</strong>. The starter only knows <b>F</b> and <b>S</b>: teach it the rest.</p>`,
    parts: [boardOn('phone-robot'), { type: 'robot', x: 0, z: 8, pins: ROBOT_PINS }, { type: 'bluetooth', x: 0, z: 0, pins: { txd: 11, rxd: 12 }, props: { mount: 'phone-robot-1', mdx: -3.5, mdz: -6 } }],
    code: `#include <SoftwareSerial.h>

SoftwareSerial bt(11, 12);   // RX, TX
${MOTOR_SETUP}
void setup() {
  bt.begin(9600);
${MOTOR_PINMODES}
  bt.println("Robot ready! Use the arrows.");
}

void loop() {
  if (bt.available()) {
    char c = bt.read();
    if (c == 'F') drive(180, 180);
    if (c == 'S') drive(0, 0);
    // TODO: B = back, L = turn left, R = turn right
  }
}
`,
    solution: `#include <SoftwareSerial.h>

SoftwareSerial bt(11, 12);   // RX, TX
${MOTOR_SETUP}
void setup() {
  bt.begin(9600);
${MOTOR_PINMODES}
  bt.println("Robot ready! Use the arrows.");
}

void loop() {
  if (bt.available()) {
    char c = bt.read();
    if (c == 'F') drive(180, 180);
    if (c == 'B') drive(-180, -180);
    if (c == 'L') drive(-140, 140);
    if (c == 'R') drive(140, -140);
    if (c == 'S') drive(0, 0);
  }
}
`,
    goals: [
      { text: 'Drive forward from the phone (▲)', check: (c, m) => seen(m, 'x', btLog(c).filter(l => l.me).pop()?.text === 'F' && (robotOf(c)?.state.travelled ?? 0) >= 10) },
      { text: 'Turn left or right from the phone (◀ ▶)', check: (c, m) => seen(m, 'x', ['L', 'R'].includes(btLog(c).filter(l => l.me).pop()?.text ?? '') && robotTrack(c, m).turned >= 1.4) },
      { text: 'Stop it with ■', check: (c, m) => { if ((robotOf(c)?.state.travelled ?? 0) > 5) m.moved = true; return seen(m, 'x', !!m.moved && btLog(c).filter(l => l.me).pop()?.text === 'S' && robotStopped(c)); } },
    ],
  },
  {
    id: 'odometry',
    title: 'Robot: Measure with Encoders',
    icon: 'encoders',
    level: 'Robotics',
    intro: `
<p>How far has the robot gone? Timing with <code>delay()</code> is only a guess: batteries run down and floors are slippery. <strong>Wheel encoders</strong> measure it properly.</p>
<p>A disc with 20 slots turns with each wheel. A light gate sees each slot pass, giving one pulse per slot: one wheel turn is 20 pulses, about 20 cm, so <strong>one pulse ≈ 1 cm</strong>.</p>
<p>Pulses come fast, so count them with an <strong>interrupt</strong> (you met these in <em>Interrupts</em>). Then drive <em>exactly</em> 50 cm.</p>
<p><strong>Challenge:</strong> drive 50 cm, turn around using pulses too (half a turn is about 21 pulses on each wheel), and come back to the start.</p>`,
    parts: [boardOn('odometry'), { type: 'robot', x: 0, z: 30, pins: ROBOT_PINS }, { type: 'encoders', x: 0, z: 0, pins: { l: 2, r: 3 }, props: { mount: 'odometry-1', mdx: 0, mdz: -6.5 } }],
    code: `${MOTOR_SETUP}
volatile long leftPulses = 0, rightPulses = 0;
const float CM_PER_PULSE = 1.005;   // 20 slots on a 20.1 cm wheel

void countLeft() { leftPulses++; }
void countRight() { rightPulses++; }

void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
  attachInterrupt(digitalPinToInterrupt(2), countLeft, RISING);
  attachInterrupt(digitalPinToInterrupt(3), countRight, RISING);
}

void loop() {
  Serial.println(leftPulses);
  drive(150, 150);   // TODO: stop when leftPulses * CM_PER_PULSE reaches 50
  delay(50);
}
`,
    solution: `${MOTOR_SETUP}
volatile long leftPulses = 0, rightPulses = 0;
const float CM_PER_PULSE = 1.005;   // 20 slots on a 20.1 cm wheel
int stage = 0;          // 0 out, 1 turn, 2 back, 3 done
long markL = 0, markR = 0;

void countLeft() { leftPulses++; }
void countRight() { rightPulses++; }

/** Centimetres the left wheel has rolled since the last mark. */
float rolled() { return (leftPulses - markL) * CM_PER_PULSE; }

void nextStage() {
  drive(0, 0);
  delay(600);
  markL = leftPulses;
  markR = rightPulses;
  stage++;
}

void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
  attachInterrupt(digitalPinToInterrupt(2), countLeft, RISING);
  attachInterrupt(digitalPinToInterrupt(3), countRight, RISING);
}

void loop() {
  Serial.println(leftPulses);
  if (stage == 0) { drive(150, 150); if (rolled() >= 50) nextStage(); }
  else if (stage == 1) { drive(-150, 150); if (rightPulses - markR >= 21) nextStage(); }
  else if (stage == 2) { drive(150, 150); if (rolled() >= 50) nextStage(); }
  else drive(0, 0);
  delay(5);
}
`,
    goals: [
      { text: 'Count pulses: watch the number climb in the Serial Monitor', check: c => serialLines(c.serial).filter(l => /^\d+$/.test(l) && +l > 5).length >= 3 },
      { text: 'Stop after exactly 50 cm (within 3 cm)', check: (c, m) => { const t = robotOf(c)?.state.travelled ?? 0; return seen(m, 'x', robotStopped(c) && t >= 47 && t <= 53); } },
      { text: 'Challenge: go 50 cm, turn around and come back to the start', check: (c, m) => { const t = robotTrack(c, m); return seen(m, 'x', robotStopped(c) && t.travelled >= 90 && t.fromHome < 6); } },
    ],
  },
  {
    id: 'light-seeker',
    title: 'Robot: Light Seeker',
    icon: 'lighteyes',
    level: 'Robotics',
    intro: `
<p>Some robots (and moths!) follow light. This robot has <strong>two light sensors angled apart</strong>, like eyes: the one facing the beacon reads higher.</p>
<pre>right eye brighter → the light is to the right: turn right
left eye brighter  → turn left
about the same     → it's straight ahead: go!</pre>
<p>When both readings are high, the robot has arrived: stop. <strong>Drag the beacon</strong> somewhere new and run it again.</p>`,
    parts: [boardOn('light-seeker'), { type: 'robot', x: -22, z: 22, pins: ROBOT_PINS }, { type: 'lighteyes', x: 0, z: 0, pins: { l: 14, r: 15 }, props: { mount: 'light-seeker-1', mdx: 0, mdz: -7.6 } }, { type: 'beacon', x: 18, z: -18 }],
    code: `${MOTOR_SETUP}
const int LEFT_EYE = A0, RIGHT_EYE = A1;

void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
}

void loop() {
  int left = analogRead(LEFT_EYE);
  int right = analogRead(RIGHT_EYE);
  Serial.print(left);
  Serial.print(" ");
  Serial.println(right);

  drive(160, 160);   // TODO: steer toward the brighter side, stop when both are bright
  delay(20);
}
`,
    solution: `${MOTOR_SETUP}
const int LEFT_EYE = A0, RIGHT_EYE = A1;

void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
}

void loop() {
  int left = analogRead(LEFT_EYE);
  int right = analogRead(RIGHT_EYE);
  Serial.print(left);
  Serial.print(" ");
  Serial.println(right);

  if ((left + right) / 2 > 650) drive(0, 0);   // bright on both sides: we're there
  else if (right > left + 40) drive(150, 40);  // light is to the right
  else if (left > right + 40) drive(40, 150);  // light is to the left
  else drive(160, 160);                        // straight ahead
  delay(20);
}
`,
    goals: [
      { text: 'Read both eyes in the Serial Monitor', check: c => serialLines(c.serial).some(l => /^\d+\s+\d+$/.test(l)) },
      { text: 'Steer to the beacon: get within 35 cm', check: (c, m) => { const r = robotOf(c), b = c.part('beacon'); return seen(m, 'x', !!r?.state.pose && !!b && Math.hypot(r.state.pose.x - b.x, r.state.pose.z - b.z) < 35); } },
      { text: 'Stop at the beacon without touching it', check: (c, m) => { const r = robotOf(c), b = c.part('beacon'); const close = !!r?.state.pose && !!b && Math.hypot(r.state.pose.x - b.x, r.state.pose.z - b.z) < 35; return seen(m, 'x', close && robotStopped(c) && (r!.state.bumps ?? 0) === 0 && heldFor(c, m, 'still', true) > 800); } },
    ],
  },
  {
    id: 'patrol',
    title: 'Robot: Line Patrol',
    icon: 'irprox',
    level: 'Robotics',
    intro: `
<p>Combine two senses. The robot follows the line like in <em>Line Follower</em>, but a block sits on the track. An <strong>IR obstacle sensor</strong> at the front reads <code>LOW</code> when something is within about 10 cm.</p>
<p>A real delivery robot works like this: follow the route, and <strong>stop and wait</strong> when something is in the way.</p>
<p><strong>Challenge:</strong> once it has stopped, drag the block off the track. The robot should carry on by itself.</p>`,
    parts: [
      boardOn('patrol'),
      { type: 'robot', x: -4, z: 29, rot: 1, pins: ROBOT_PINS },
      { type: 'track', x: 0, z: 18 },
      { type: 'linesensor', x: 0, z: 0, pins: { l: 2, r: 3 }, props: { mount: 'patrol-1', mdx: 0, mdz: -8 } },
      { type: 'irprox', x: 0, z: 0, pins: { out: 4 }, props: { mount: 'patrol-1', mdx: 3.5, mdz: -6.5 } },
      { type: 'wall', x: -2, z: 7, rot: 1, props: { len: '10', color: '#e2533b' } },
    ],
    code: `${MOTOR_SETUP}
const int LEFT_EYE = 2, RIGHT_EYE = 3, OBSTACLE = 4;
int lastTurn = 1;

void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
  pinMode(LEFT_EYE, INPUT);
  pinMode(RIGHT_EYE, INPUT);
  pinMode(OBSTACLE, INPUT);
}

void loop() {
  bool blocked = digitalRead(OBSTACLE) == LOW;
  Serial.println(blocked ? "BLOCKED" : "CLEAR");
  // TODO: if blocked, stop and wait (drive(0, 0) and return)

  bool left = digitalRead(LEFT_EYE);
  bool right = digitalRead(RIGHT_EYE);
${LINE_FOLLOW_LOOP}
  delay(5);
}
`,
    solution: `${MOTOR_SETUP}
const int LEFT_EYE = 2, RIGHT_EYE = 3, OBSTACLE = 4;
int lastTurn = 1;

void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
  pinMode(LEFT_EYE, INPUT);
  pinMode(RIGHT_EYE, INPUT);
  pinMode(OBSTACLE, INPUT);
}

void loop() {
  bool blocked = digitalRead(OBSTACLE) == LOW;
  Serial.println(blocked ? "BLOCKED" : "CLEAR");
  if (blocked) {
    drive(0, 0);   // something in the way: wait here
    delay(50);
    return;
  }

  bool left = digitalRead(LEFT_EYE);
  bool right = digitalRead(RIGHT_EYE);
${LINE_FOLLOW_LOOP}
  delay(5);
}
`,
    goals: [
      { text: 'See CLEAR / BLOCKED in the Serial Monitor', check: c => /CLEAR|BLOCKED/.test(c.serial) },
      { text: 'Follow the line and stop before the block, without touching it', check: (c, m) => { const r = robotOf(c); const ok = !!r?.state.pose && !!c.part('irprox')?.state.near && robotStopped(c) && (r.state.bumps ?? 0) === 0 && (r.state.travelled ?? 0) > 30; if (ok && heldFor(c, m, 'wait', true) > 1200) m.stopped = r!.state.travelled; else if (!ok) heldFor(c, m, 'wait', false); return seen(m, 'x', m.stopped != null); } },
      { text: 'Challenge: drag the block away and the robot carries on', check: (c, m) => { const r = robotOf(c); if (r?.state.pose && c.part('irprox')?.state.near && robotStopped(c)) m.at = r.state.travelled; return seen(m, 'x', m.at != null && !c.part('wall') && (r?.state.travelled ?? 0) > m.at + 15); } },
    ],
  },
);

// ---------- Bolt: a complete little robot ----------
const BOLT_PINS = { ena: 5, in1: 7, in2: 8, in3: 9, in4: 10, enb: 6, head: 3, trig: 11, echo: 12, din: 2, clk: 4, cs: 13, buzz: 14 };
const boltParts = (id: string, x = 0, z = 20): PartSpec[] => [boardOn(id, 2.9), { type: 'bolt', x, z, pins: BOLT_PINS }];
const boltOf = (c: GoalCtx) => c.part('bolt');
const faceLit = (c: GoalCtx) => (boltOf(c)?.state.faceRows ?? []).reduce((n: number, r: number) => { let v = r, k = n; while (v) { k += v & 1; v >>= 1; } return k; }, 0);
const boltTravelled = (c: GoalCtx) => boltOf(c)?.state.travelled ?? 0;

const BOLT_HEADER = `#include <Servo.h>
#include <LedControl.h>

Servo head;
LedControl face = LedControl(2, 4, 13, 1);   // DIN, CLK, CS
const int VOICE = A0, TRIG = 11, ECHO = 12;
${MOTOR_SETUP}
byte SMILE[8] = {
  0b00000000,
  0b01100110,
  0b01100110,
  0b00000000,
  0b10000001,
  0b01000010,
  0b00111100,
  0b00000000
};

void showFace(byte picture[]) {
  for (int row = 0; row < 8; row++) face.setRow(0, row, picture[row]);
}

/** Centimetres to whatever the eyes see, or 999 when they see nothing. */
long distanceCm() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 30000);
  return us == 0 ? 999 : us / 58;
}
`;
const BOLT_START = `  head.attach(3);
  head.write(90);
  face.shutdown(0, false);   // wake the face up
  face.setIntensity(0, 8);
  face.clearDisplay(0);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
${MOTOR_PINMODES}`;
const SURPRISED = `byte SURPRISED[8] = {
  0b00000000,
  0b01100110,
  0b01100110,
  0b00000000,
  0b00011000,
  0b00100100,
  0b00011000,
  0b00000000
};
`;

LESSONS.push(
  {
    id: 'bolt-hello',
    title: 'Meet Bolt',
    icon: 'bolt',
    level: 'Robotics',
    intro: `
<p>Meet <strong>Bolt</strong>, a complete little robot. Everything you’ve learned is inside one body:</p>
<ul>
  <li><strong>Face:</strong> an 8×8 LED matrix (<code>face.setRow()</code>)</li>
  <li><strong>Head:</strong> a servo: 90 looks ahead, 180 left, 0 right (<code>head.write()</code>)</li>
  <li><strong>Eyes:</strong> an ultrasonic sensor that turns with the head</li>
  <li><strong>Voice:</strong> a buzzer (<code>tone(VOICE, 880, 150)</code>)</li>
  <li><strong>Wheels:</strong> the same <code>drive(left, right)</code> as the robot car</li>
</ul>
<p>Bolt can already smile. <strong>Say hello:</strong> make it beep, then look left and right.</p>`,
    parts: boltParts('bolt-hello'),
    code: `${BOLT_HEADER}
void setup() {
${BOLT_START}
  showFace(SMILE);
}

void loop() {
  // TODO: beep with tone(VOICE, 880, 150), then look left (180) and right (0)
}
`,
    solution: `${BOLT_HEADER}
void setup() {
${BOLT_START}
  showFace(SMILE);
}

void loop() {
  tone(VOICE, 880, 150);
  delay(300);
  head.write(180);   // look left
  delay(800);
  head.write(0);     // look right
  delay(1000);
  head.write(90);    // straight ahead
  delay(1500);
}
`,
    goals: [
      { text: 'Show a face', check: (c, m) => seen(m, 'x', faceLit(c) >= 8) },
      { text: 'Say something with its voice', check: (c, m) => seen(m, 'x', !!boltOf(c)?.state.freq) },
      { text: 'Look left and right', check: (c, m) => { const a = boltOf(c)?.state.headAngle ?? 90; if (a > 150) m.l = true; if (a < 30) m.r = true; return seen(m, 'x', !!m.l && !!m.r); } },
    ],
  },
  {
    id: 'bolt-follow',
    title: 'Bolt: Follow Me',
    icon: 'bolt',
    level: 'Robotics',
    intro: `
<p>Teach Bolt to keep you company. It should stay about <strong>15 cm</strong> from the block in front of it, like a puppy on a lead:</p>
<pre>too far  (over 20 cm) → drive forward
too close (under 12)  → back away
in between            → stop and smile</pre>
<p>That gap between 12 and 20 is called a <strong>dead band</strong>. Without it, Bolt would twitch back and forth for ever around one exact distance.</p>
<p><strong>Then play:</strong> drag the block closer and further away while it runs.</p>`,
    parts: [...boltParts('bolt-follow'), { type: 'wall', x: 0, z: -18, props: { len: '10', color: '#f2b705' } }],
    code: `${BOLT_HEADER}
void setup() {
  Serial.begin(9600);
${BOLT_START}
  showFace(SMILE);
}

void loop() {
  long d = distanceCm();
  Serial.println(d);
  drive(130, 130);   // TODO: forward over 20 cm, back under 12, otherwise stop
  delay(40);
}
`,
    solution: `${BOLT_HEADER}
void setup() {
  Serial.begin(9600);
${BOLT_START}
  showFace(SMILE);
}

void loop() {
  long d = distanceCm();
  Serial.println(d);
  if (d > 20) drive(130, 130);        // too far: catch up
  else if (d < 12) drive(-130, -130); // too close: back away
  else drive(0, 0);                   // just right
  delay(40);
}
`,
    goals: [
      { text: 'Drive toward the block when it’s far away', check: (c, m) => seen(m, 'x', boltTravelled(c) >= 5) },
      { text: 'Stop about 15 cm away and stay there', check: (c, m) => { const r = boltOf(c), d = r?.state.distance ?? 999; const ok = !!r?.state.pose && d >= 11 && d <= 21 && Math.abs(r.state.vl ?? 0) + Math.abs(r.state.vr ?? 0) < 0.5 && (r.state.bumps ?? 0) === 0; if (ok) m.since ??= c.board.time; else m.since = null; return seen(m, 'x', m.since != null && c.board.time - m.since > 1500); } },
      { text: 'Challenge: drag the block close and Bolt backs away', check: (c, m) => { const r = boltOf(c); return seen(m, 'x', (r?.state.distance ?? 999) < 12 && (r?.state.vl ?? 0) < 0 && (r?.state.vr ?? 0) < 0); } },
    ],
  },
  {
    id: 'bolt-scan',
    title: 'Bolt: Look Around',
    icon: 'bolt',
    level: 'Robotics',
    intro: `
<p>A robot that can turn its head doesn’t have to guess. When something blocks the way, Bolt can <strong>stop, look both ways, and pick the clearer side</strong>, just like you crossing a road.</p>
<pre>long look(int angle) {
  head.write(angle);
  delay(600);          // give the servo time to get there
  return distanceCm();
}</pre>
<p>Measure left (<code>170</code>) and right (<code>10</code>), then turn toward whichever number is bigger. Don’t forget to look ahead again!</p>`,
    parts: [...boltParts('bolt-scan', 0, 8), ...ARENA],
    code: `${BOLT_HEADER}
long look(int angle) {
  head.write(angle);
  delay(600);          // give the servo time to get there
  return distanceCm();
}

void setup() {
${BOLT_START}
  showFace(SMILE);
}

void loop() {
  long ahead = look(90);
  if (ahead < 20) {
    drive(0, 0);
    // TODO: look(170) and look(10), then turn toward the bigger one
  } else {
    drive(140, 140);
  }
}
`,
    solution: `${BOLT_HEADER}
long look(int angle) {
  head.write(angle);
  delay(600);          // give the servo time to get there
  return distanceCm();
}

void setup() {
${BOLT_START}
  showFace(SMILE);
}

void loop() {
  head.write(90);
  long ahead = distanceCm();
  if (ahead < 20) {
    drive(0, 0);
    tone(VOICE, 660, 120);
    long left = look(170);
    long right = look(10);
    head.write(90);
    if (left > right) drive(-140, 140);   // more room on the left
    else drive(140, -140);
    delay(650);
    drive(0, 0);
    delay(300);
  } else {
    drive(140, 140);
  }
  delay(30);
}
`,
    goals: [
      { text: 'Look left and right when something’s in the way', check: (c, m) => { const a = boltOf(c)?.state.headAngle ?? 90; if (a > 150) m.l = true; if (a < 30) m.r = true; return seen(m, 'x', !!m.l && !!m.r); } },
      { text: 'Stop, look and turn away 3 times', check: (c, m) => { const r = boltOf(c), a = r?.state.headAngle ?? 90; if (a > 150 && !m.up) { m.up = true; m.n = (m.n ?? 0) + 1; } if (a < 110) m.up = false; return seen(m, 'x', (m.n ?? 0) >= 3 && (r?.state.travelled ?? 0) > 30); } },
      { text: 'Explore for 30 seconds without touching a wall', check: (c, m) => { const r = boltOf(c); return seen(m, 'x', !!r?.state.pose && c.board.time >= 30000 && (r.state.bumps ?? 0) === 0 && (r.state.travelled ?? 0) >= 60); } },
    ],
  },
  {
    id: 'bolt-moods',
    title: 'Bolt: Moods',
    icon: 'bolt',
    level: 'Robotics',
    intro: `
<p>Robots feel friendlier when they react. Give Bolt <strong>moods</strong>: it smiles when it has space, and looks <strong>surprised</strong> with a little squeak when something comes close.</p>
<p>Don’t squeak on every pass of <code>loop()</code>, or Bolt will never stop! Remember the current mood, and only act when it <em>changes</em>:</p>
<pre>bool scared = d < 15;
if (scared != wasScared) { … }   // the mood just changed
wasScared = scared;</pre>
<p><strong>Try it:</strong> run the sketch, then drag the yellow block right up to Bolt’s face.</p>`,
    parts: [...boltParts('bolt-moods'), { type: 'wall', x: 0, z: -14, props: { len: '10', color: '#f2b705' } }],
    code: `${BOLT_HEADER}
${SURPRISED}
void setup() {
  Serial.begin(9600);
${BOLT_START}
  showFace(SMILE);
}

void loop() {
  long d = distanceCm();
  Serial.println(d);
  // TODO: under 15 cm show SURPRISED and squeak once; otherwise show SMILE
  delay(50);
}
`,
    solution: `${BOLT_HEADER}
${SURPRISED}
bool wasScared = false;

void setup() {
  Serial.begin(9600);
${BOLT_START}
  showFace(SMILE);
}

void loop() {
  long d = distanceCm();
  Serial.println(d);
  bool scared = d < 15;
  if (scared != wasScared) {        // only when the mood changes
    if (scared) {
      showFace(SURPRISED);
      tone(VOICE, 1500, 120);
    } else {
      showFace(SMILE);
    }
  }
  wasScared = scared;
  delay(50);
}
`,
    goals: [
      { text: 'Smile while there’s plenty of room', check: (c, m) => { const r = boltOf(c); if ((r?.state.distance ?? 0) > 20 && faceLit(c) >= 8) m.calm = r!.state.faceRows.join(); return seen(m, 'x', !!m.calm); } },
      { text: 'Bring the block close: the face changes', check: (c, m) => { const r = boltOf(c); if ((r?.state.distance ?? 0) > 20 && faceLit(c) >= 8) m.calm = r!.state.faceRows.join(); return seen(m, 'x', !!m.calm && (r?.state.distance ?? 99) < 15 && faceLit(c) >= 4 && r!.state.faceRows.join() !== m.calm); } },
      { text: 'Squeak when it’s surprised', check: (c, m) => seen(m, 'x', (boltOf(c)?.state.distance ?? 99) < 15 && !!boltOf(c)?.state.freq) },
    ],
  },
);

// ---------- robot add-ons: gripper, compass and colour sensor ----------
const gripperOf = (c: GoalCtx) => c.part('gripper');

LESSONS.push(
  {
    id: 'robot-deliver',
    title: 'Robot: Delivery',
    icon: 'gripper',
    level: 'Robotics',
    intro: `
<p>Real warehouse robots fetch and carry. Yours has a <strong>servo gripper</strong> on the front: <code>grip.write(90)</code> opens the jaws, <code>grip.write(20)</code> closes them around whatever is between them.</p>
<pre>open → drive to the cube → close → turn around → drive back → open</pre>
<p>Robots without wheel encoders measure distance with <strong>time</strong>: at speed 150 this robot covers about 13 cm a second, and spinning on the spot for about 1.65 s turns it right round.</p>
<p><strong>Your job:</strong> bring the red cube home and drop it on the pad behind the robot.</p>`,
    parts: [
      boardOn('robot-deliver'),
      { type: 'robot', x: 0, z: 20, pins: ROBOT_PINS },
      { type: 'gripper', x: 0, z: 0, pins: { sig: 3 }, props: { mount: 'robot-deliver-1', mdx: 0, mdz: -8.5 } },
      { type: 'cube', x: 0, z: -7.2 },
      { type: 'pad', x: 0, z: 32 },
    ],
    code: `#include <Servo.h>

Servo grip;
${MOTOR_SETUP}
void setup() {
${MOTOR_PINMODES}
  grip.attach(3);
  grip.write(90);         // jaws open
  delay(500);

  drive(150, 150);        // to the cube
  delay(1160);
  drive(0, 0);

  // TODO: close the jaws, turn around, drive back and let go
}

void loop() {}
`,
    solution: `#include <Servo.h>

Servo grip;
${MOTOR_SETUP}
void setup() {
${MOTOR_PINMODES}
  grip.attach(3);
  grip.write(90);         // jaws open
  delay(500);

  drive(150, 150);        // to the cube
  delay(1160);
  drive(0, 0);
  grip.write(20);         // grab it
  delay(500);

  drive(-150, 150);       // turn right round
  delay(1650);
  drive(150, 150);        // and back home
  delay(1160);
  drive(0, 0);
  grip.write(90);         // let go
}

void loop() {}
`,
    goals: [
      { text: 'Grab the cube', check: (c, m) => seen(m, 'x', !!gripperOf(c)?.state.holding) },
      { text: 'Carry it at least 20 cm', check: (c, m) => { const cb = c.part('cube'); if (!cb) return !!m.x; m.from ??= [cb.x, cb.z]; return seen(m, 'x', !!cb.state.heldBy && Math.hypot(cb.x - m.from[0], cb.z - m.from[1]) >= 20); } },
      { text: 'Drop it on the pad', check: (c, m) => { const cb = c.part('cube'), pd = c.part('pad'); return seen(m, 'x', !!cb && !!pd && !cb.state.heldBy && Math.abs(cb.x - pd.x) < 3 && Math.abs(cb.z - pd.z) < 3 && (cb.group?.position.y ?? 1) < 0.05); } },
    ],
  },
  {
    id: 'robot-compass',
    title: 'Robot: Steer by Compass',
    icon: 'compass',
    level: 'Robotics',
    intro: `
<p>Timing a turn is a guess. A <strong>compass</strong> knows: it reads the robot’s heading in degrees.</p>
<pre>  0 = north      90 = east
180 = south     270 = west</pre>
<p>To face a heading, keep turning until the difference is tiny. The difference has to wrap around: from 350° to 10° is only 20°, not 340°:</p>
<pre>int diff = (target - now + 540) % 360 - 180;   // -180 … 180</pre>
<p>Positive means turn right, negative means turn left. <strong>Challenge:</strong> drive a perfect square with turns to 0°, 90°, 180° and 270°.</p>`,
    parts: [
      boardOn('robot-compass'),
      { type: 'robot', x: 0, z: 10, pins: ROBOT_PINS },
      { type: 'compass', x: 0, z: 0, pins: { sda: 18, scl: 19 }, props: { mount: 'robot-compass-1', mdx: 3.2, mdz: -6 } },
    ],
    code: `#include <QMC5883LCompass.h>

QMC5883LCompass compass;
${MOTOR_SETUP}
int heading() {
  compass.read();
  return compass.getAzimuth();
}

void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
  compass.init();
}

void loop() {
  Serial.println(heading());
  drive(110, -110);   // spinning right... TODO: stop when facing east (90)
  delay(20);
}
`,
    solution: `#include <QMC5883LCompass.h>

QMC5883LCompass compass;
${MOTOR_SETUP}
int heading() {
  compass.read();
  return compass.getAzimuth();
}

/** Turn on the spot until the robot faces the target heading. */
void turnTo(int target) {
  while (true) {
    int now = heading();
    Serial.println(now);
    int diff = (target - now + 540) % 360 - 180;
    if (diff > 3) drive(110, -110);        // turn right
    else if (diff < -3) drive(-110, 110);  // turn left
    else break;
    delay(20);
  }
  drive(0, 0);
  delay(300);
}

void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
  compass.init();
  turnTo(90);           // face east first
  delay(1500);
  for (int side = 0; side < 4; side++) {
    drive(160, 160);
    delay(1000);
    drive(0, 0);
    turnTo((180 + side * 90) % 360);
  }
}

void loop() {}
`,
    goals: [
      { text: 'Read the heading in the Serial Monitor', check: c => serialLines(c.serial).filter(l => /^\d+$/.test(l)).length >= 3 },
      { text: 'Face east (90°) and stop there', check: (c, m) => { const h = c.part('compass')?.state.heading ?? 0; const r = robotOf(c); const ok = !!r?.state.pose && Math.abs(h - 90) <= 4 && Math.abs(r.state.vl ?? 0) + Math.abs(r.state.vr ?? 0) < 0.5; return seen(m, 'x', heldFor(c, m, 'still', ok) > 600); } },
      { text: 'Challenge: drive a square using the compass', check: (c, m) => { const t = robotTrack(c, m); return seen(m, 'x', t.travelled >= 45 && t.turned >= 1.8 * Math.PI && t.fromHome < 8); } },
    ],
  },
  {
    id: 'robot-colors',
    title: 'Robot: Find the Colour',
    icon: 'colorsensor',
    level: 'Robotics',
    intro: `
<p>A <strong>colour sensor</strong> under the robot shines white light at the floor and measures how much <em>red</em>, <em>green</em> and <em>blue</em> bounces back. Each reads 0–1023 with <code>analogRead()</code>.</p>
<pre>red pad:    R high, G low,  B low
yellow pad: R high, G high, B low
blue pad:   R low,  G low,  B high</pre>
<p>Drive along the row of pads, say each colour you cross, and <strong>stop on the red one</strong>. This is how sorting machines and line-following competitions read markers on the floor.</p>`,
    parts: [
      boardOn('robot-colors'),
      { type: 'robot', x: -34, z: 8, rot: 1, pins: ROBOT_PINS },
      { type: 'colorsensor', x: 0, z: 0, pins: { r: 14, g: 15, b: 16 }, props: { mount: 'robot-colors-1', mdx: 0, mdz: -7.8 } },
      { type: 'pad', x: -10, z: 8, props: { color: 'blue' } },
      { type: 'pad', x: 4, z: 8, props: { color: 'yellow' } },
      { type: 'pad', x: 18, z: 8, props: { color: 'red' } },
    ],
    code: `${MOTOR_SETUP}
void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
}

void loop() {
  int r = analogRead(A0), g = analogRead(A1), b = analogRead(A2);
  Serial.print(r); Serial.print(" "); Serial.print(g); Serial.print(" "); Serial.println(b);

  drive(120, 120);   // TODO: print the colour's name, and stop on red
  delay(50);
}
`,
    solution: `${MOTOR_SETUP}
String lastSeen = "";

String colourName(int r, int g, int b) {
  if (r > 600 && g < 400 && b < 400) return "RED";
  if (r > 600 && g > 600 && b < 400) return "YELLOW";
  if (b > 600 && r < 400) return "BLUE";
  return "MAT";
}

void setup() {
  Serial.begin(9600);
${MOTOR_PINMODES}
}

void loop() {
  int r = analogRead(A0), g = analogRead(A1), b = analogRead(A2);
  Serial.print(r); Serial.print(" "); Serial.print(g); Serial.print(" "); Serial.println(b);
  String name = colourName(r, g, b);
  if (name != lastSeen) {   // say each colour once, as we reach it
    Serial.println(name);
    lastSeen = name;
  }
  if (name == "RED") drive(0, 0);
  else drive(120, 120);
  delay(20);
}
`,
    goals: [
      { text: 'Read R, G and B in the Serial Monitor', check: c => serialLines(c.serial).some(l => /^\d+ \d+ \d+$/.test(l)) },
      { text: 'Name the colours it crosses: BLUE and YELLOW', check: c => /BLUE/.test(c.serial) && /YELLOW/.test(c.serial) },
      { text: 'Stop on the red pad', check: (c, m) => { const rgb = c.part('colorsensor')?.state.rgb ?? [0, 0, 0]; const r = robotOf(c); const ok = !!r?.state.pose && rgb[0] > 600 && rgb[1] < 400 && Math.abs(r.state.vl ?? 0) + Math.abs(r.state.vr ?? 0) < 0.5; return seen(m, 'x', heldFor(c, m, 'still', ok) > 800); } },
    ],
  },
);

// ---------- spider, drone and robotic hand ----------
const SPIDER_PINMAP = { fl_hip: 2, fl_knee: 3, fr_hip: 4, fr_knee: 5, bl_hip: 6, bl_knee: 7, br_hip: 8, br_knee: 9 };
const SPIDER_HEADER = `#include <Servo.h>

// pair A: front-left + back-right    pair B: front-right + back-left
Servo flHip, flKnee, frHip, frKnee, blHip, blKnee, brHip, brKnee;
const int UP = 150, DOWN = 90;          // knees: foot lifted, foot on the floor
const int FRONT = 120, BACK = 60;       // hips: leg swung forward, swung back

void kneesA(int a) { flKnee.write(a); brKnee.write(a); }
void kneesB(int a) { frKnee.write(a); blKnee.write(a); }
void hipsA(int fl, int br) { flHip.write(fl); brHip.write(br); }
void hipsB(int fr, int bl) { frHip.write(fr); blHip.write(bl); }

void standUp() {
  flHip.attach(2); flKnee.attach(3); frHip.attach(4); frKnee.attach(5);
  blHip.attach(6); blKnee.attach(7); brHip.attach(8); brKnee.attach(9);
  hipsA(90, 90); hipsB(90, 90);
  kneesA(DOWN); kneesB(DOWN);
  delay(500);
}
`;
const spiderOf = (c: GoalCtx) => c.part('spider');
const droneOf = (c: GoalCtx) => c.part('drone');
const handOf = (c: GoalCtx) => c.part('hand');
const fingersAre = (c: GoalCtx, want: Record<string, 'open' | 'closed'>) => {
  const h = handOf(c);
  if (!h) return false;
  return Object.entries(want).every(([f, s]) => (s === 'open' ? (h.state[f] ?? 90) < 40 : (h.state[f] ?? 90) > 140));
};

LESSONS.push(
  {
    id: 'spider-walk',
    title: 'Spider: First Steps',
    icon: 'spider',
    level: 'Robotics',
    intro: `
<p>Legs are harder than wheels: the robot has to <strong>lift</strong>, <strong>swing</strong> and <strong>plant</strong> each foot in the right order, or it just shuffles on the spot.</p>
<p>This spider uses a <strong>trot</strong>: diagonal legs move together. While pair A is up in the air swinging forward, pair B is on the floor pushing back, and that push moves the body.</p>
<pre>lift A → swing A forward, push B back → put A down
lift B → swing B forward, push A back → put B down</pre>
<p><strong>Challenge:</strong> turn on the spot. The left legs on the floor push back while the right legs push forward.</p>`,
    parts: [boardOn('spider-walk', 0.2), { type: 'spider', x: 0, z: 14, pins: SPIDER_PINMAP }],
    code: `${SPIDER_HEADER}
void stepForward() {
  kneesA(UP);                  // lift pair A
  delay(150);
  // TODO: swing A forward (hipsA(FRONT, FRONT)) while B pushes back (hipsB(BACK, BACK)),
  //       wait, put A down, then do the same with the pairs swapped
}

void setup() {
  standUp();
}

void loop() {
  stepForward();
}
`,
    solution: `${SPIDER_HEADER}
void stepForward() {
  kneesA(UP);                       // lift pair A
  delay(150);
  hipsA(FRONT, FRONT);              // A swings forward in the air...
  hipsB(BACK, BACK);                // ...while B pushes back on the floor
  delay(250);
  kneesA(DOWN);                     // plant A
  delay(150);
  kneesB(UP);                       // now the other pair
  delay(150);
  hipsB(FRONT, FRONT);
  hipsA(BACK, BACK);
  delay(250);
  kneesB(DOWN);
  delay(150);
}

// to turn right, the left side has to move forward and the right side back:
// so on the floor, left legs sweep backwards and right legs sweep forwards
void turnRight() {
  kneesA(UP);
  delay(150);
  hipsA(FRONT, BACK);               // A gets ready in the air
  hipsB(FRONT, BACK);               // B on the floor: right leg (FR) forward, left leg (BL) back
  delay(250);
  kneesA(DOWN);
  delay(150);
  kneesB(UP);
  delay(150);
  hipsB(BACK, FRONT);               // B gets ready in the air
  hipsA(BACK, FRONT);               // A on the floor: left leg (FL) back, right leg (BR) forward
  delay(250);
  kneesB(DOWN);
  delay(150);
}

void setup() {
  standUp();
  for (int i = 0; i < 4; i++) stepForward();
  for (int i = 0; i < 2; i++) turnRight();
}

void loop() {}
`,
    goals: [
      { text: 'Lift a leg off the floor', check: (c, m) => seen(m, 'x', SPIDER_LEGS_UP(c) > 0) },
      { text: 'Walk forward 20 cm', check: (c, m) => seen(m, 'x', (spiderOf(c)?.state.travelled ?? 0) >= 20) },
      { text: 'Challenge: turn at least 90° on the spot', check: (c, m) => { const sp = spiderOf(c), pose = sp?.state.pose; return seen(m, 'x', !!pose && Math.abs(pose.a + (sp!.rot * Math.PI) / 2) >= Math.PI / 2 - 0.1); } },
    ],
  },
  {
    id: 'drone-hover',
    title: 'Drone: Take Off and Hover',
    icon: 'drone',
    level: 'Robotics',
    intro: `
<p>A drone can’t just “go to 30 cm”: it only knows how hard to spin its propellers. To hover, it has to <strong>keep measuring and correcting</strong>, which is called a <em>feedback loop</em>.</p>
<pre>error = target − height
throttle = HOVER + error × GAIN</pre>
<p>Too low? The error is positive, so throttle goes up. Too high? It goes down. Close to the target, it barely changes. That’s a <strong>proportional controller</strong>, the heart of every autopilot.</p>
<p>Then <strong>land gently</strong>: ease the throttle down, and only cut the motors once you’re on the desk.</p>`,
    parts: [boardOn('drone-hover', 0), { type: 'drone', x: 0, z: 12, pins: { thr: 3, pitch: 5, roll: 6, yaw: 9, alt: 14 } }],
    code: `const THR = 3, PITCH = 5, ROLL = 6, YAW = 9;
const int HOVER = 140;   // throttle that roughly holds height

float height() { return analogRead(A0) / 10.0; }   // cm

void setup() {
  Serial.begin(9600);
  pinMode(THR, OUTPUT); pinMode(PITCH, OUTPUT); pinMode(ROLL, OUTPUT); pinMode(YAW, OUTPUT);
  analogWrite(PITCH, 128); analogWrite(ROLL, 128); analogWrite(YAW, 128);   // fly level
}

void loop() {
  Serial.println(height());
  analogWrite(THR, 170);   // TODO: hold 30 cm with throttle = HOVER + (30 - height) * 3
  delay(20);
}
`,
    solution: `const THR = 3, PITCH = 5, ROLL = 6, YAW = 9;
const int HOVER = 140;   // throttle that roughly holds height
const float GAIN = 3.0;

float height() { return analogRead(A0) / 10.0; }   // cm

/** Hold a height for a while, correcting all the time. */
void holdAt(float target, long ms) {
  long until = millis() + ms;
  while (millis() < until) {
    float error = target - height();
    int throttle = constrain(HOVER + error * GAIN, 60, 230);
    analogWrite(THR, throttle);
    Serial.println(height());
    delay(20);
  }
}

void setup() {
  Serial.begin(9600);
  pinMode(THR, OUTPUT); pinMode(PITCH, OUTPUT); pinMode(ROLL, OUTPUT); pinMode(YAW, OUTPUT);
  analogWrite(PITCH, 128); analogWrite(ROLL, 128); analogWrite(YAW, 128);   // fly level

  holdAt(30, 7000);        // take off and hover
  holdAt(3, 4000);         // come down slowly to just above the desk
  while (height() > 0.2) { analogWrite(THR, 115); delay(20); }   // settle gently
  analogWrite(THR, 0);     // motors off
}

void loop() {}
`,
    goals: [
      { text: 'Take off: climb above 10 cm', check: (c, m) => seen(m, 'x', (droneOf(c)?.state.alt ?? 0) > 10) },
      { text: 'Hover at 30 cm (within 3 cm) for 3 seconds', check: (c, m) => { const a = droneOf(c)?.state.alt ?? 0; if (heldFor(c, m, 'h', Math.abs(a - 30) <= 3) > 3000) m.done = true; return !!m.done; } },
      { text: 'Land gently back on the desk', check: (c, m) => { const d = droneOf(c); if ((d?.state.alt ?? 0) > 20) m.flew = true; return seen(m, 'x', !!m.flew && !!d?.state.landed && (d.state.touchSpeed ?? 99) < 12 && (d.state.thr ?? 0) <= 25); } },
    ],
  },
  {
    id: 'hand-gestures',
    title: 'Robot Hand: Gestures',
    icon: 'hand',
    level: 'Robotics',
    intro: `
<p>Each finger of this hand has its own servo: <code>0</code> is straight and <code>180</code> curls it tight. Real prosthetic hands work the same way, with motors pulling on cords like tendons.</p>
<p>A gesture is just five angles. Write a helper so each one is a single line:</p>
<pre>void pose(int t, int i, int m, int r, int p)
pose(0, 0, 0, 0, 0);            // open hand
pose(180, 180, 180, 180, 180);  // fist</pre>
<p><strong>Your job:</strong> make a fist, a peace sign ✌️ and a thumbs up 👍. Then wave hello with the wrist!</p>`,
    parts: [{ type: 'uno', x: 0, z: 0 }, { type: 'hand', x: 14, z: 4, pins: { thumb: 3, index: 5, middle: 6, ring: 9, pinky: 10, wrist: 11 } }],
    code: `#include <Servo.h>

Servo thumb, index, middle, ring, pinky, wrist;

void pose(int t, int i, int m, int r, int p) {
  thumb.write(t); index.write(i); middle.write(m); ring.write(r); pinky.write(p);
  delay(800);
}

void setup() {
  thumb.attach(3); index.attach(5); middle.attach(6); ring.attach(9); pinky.attach(10); wrist.attach(11);
  wrist.write(90);
  pose(0, 0, 0, 0, 0);            // open hand
}

void loop() {
  pose(180, 180, 180, 180, 180);  // fist
  pose(0, 0, 0, 0, 0);            // open
  // TODO: peace sign, thumbs up, and a wave with the wrist
}
`,
    solution: `#include <Servo.h>

Servo thumb, index, middle, ring, pinky, wrist;

void pose(int t, int i, int m, int r, int p) {
  thumb.write(t); index.write(i); middle.write(m); ring.write(r); pinky.write(p);
  delay(800);
}

void wave() {
  for (int i = 0; i < 2; i++) {
    wrist.write(60); delay(300);
    wrist.write(120); delay(300);
  }
  wrist.write(90);
}

void setup() {
  thumb.attach(3); index.attach(5); middle.attach(6); ring.attach(9); pinky.attach(10); wrist.attach(11);
  wrist.write(90);
  pose(0, 0, 0, 0, 0);            // open hand
}

void loop() {
  pose(180, 180, 180, 180, 180);  // fist
  pose(180, 0, 0, 180, 180);      // peace sign
  pose(0, 180, 180, 180, 180);    // thumbs up
  pose(0, 0, 0, 0, 0);            // open
  wave();
}
`,
    goals: [
      { text: 'Make a fist', check: (c, m) => seen(m, 'x', fingersAre(c, { thumb: 'closed', index: 'closed', middle: 'closed', ring: 'closed', pinky: 'closed' })) },
      { text: 'Peace sign ✌️: index and middle up, the rest curled', check: (c, m) => seen(m, 'x', fingersAre(c, { thumb: 'closed', index: 'open', middle: 'open', ring: 'closed', pinky: 'closed' })) },
      { text: 'Thumbs up 👍', check: (c, m) => seen(m, 'x', fingersAre(c, { thumb: 'open', index: 'closed', middle: 'closed', ring: 'closed', pinky: 'closed' })) },
      { text: 'Challenge: wave hello with the wrist', check: (c, m) => { const w = handOf(c)?.state.wrist ?? 90; if (w < 70) m.l = true; if (w > 110) m.r = true; return seen(m, 'x', !!m.l && !!m.r); } },
    ],
  },
);

/** How many of the spider's feet are off the floor. */
function SPIDER_LEGS_UP(c: GoalCtx) {
  const sp = spiderOf(c);
  return sp ? ['fl', 'fr', 'bl', 'br'].filter(n => (sp.state[`${n}_knee`] ?? 90) >= 110).length : 0;
}

const ORDER = [
  'blink', 'circuit', 'breadboard', 'fade', 'chaser', 'rgb', 'serial',
  'seg7', 'scoreboard', 'lcd', 'oled', 'matrix', 'neopixel',
  'button', 'millis', 'interrupts', 'pot', 'encoder', 'joystick', 'remote', 'nightlight', 'sound', 'morse', 'clap', 'distance',
  'servo', 'stepper', 'motor', 'relay',
  'bug-pinmode', 'bug-wiring', 'bug-button', 'bug-array', 'bug-compare',
  'bolt-hello', 'bolt-moods', 'bolt-follow', 'bolt-scan', 'hand-gestures', 'spider-walk', 'drone-hover',
  'robot-drive', 'bumper-bot', 'phone-robot', 'odometry', 'robot-compass', 'robot-deliver', 'robot-colors', 'line-follow', 'patrol', 'avoider', 'light-seeker', 'arm-pick',
  'thermo', 'weather', 'plant', 'smoke', 'motion', 'lock', 'parking', 'phone', 'logger',
];
LESSONS.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

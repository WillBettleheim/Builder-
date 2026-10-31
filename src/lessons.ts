// Lesson content: scene setup, starter code, explanations and checkable goals.
import type { Board } from './sim/board';
import type { Part } from './sim/parts';
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
  level: 'Basics' | 'Displays' | 'Sensors' | 'Motion' | 'Projects';
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
        if (c.now - (m.since ?? 0) > 300) {
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
const ORDER = [
  'blink', 'circuit', 'breadboard', 'fade', 'chaser', 'rgb', 'serial',
  'seg7', 'lcd', 'oled', 'matrix', 'neopixel',
  'button', 'millis', 'interrupts', 'pot', 'encoder', 'joystick', 'nightlight', 'sound', 'morse', 'clap', 'distance',
  'servo', 'stepper', 'motor', 'relay',
  'thermo', 'weather', 'plant', 'smoke', 'motion', 'lock', 'parking',
];
LESSONS.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

// What Nova knows: short explanations of concepts, plus friendly readings of errors.
// Answers are matched by keywords, so no network or AI service is needed.

export interface Topic { keys: string[]; title: string; answer: string }

export const TOPICS: Topic[] = [
  { keys: ['setup', 'loop', 'sketch', 'structure', 'start'], title: 'setup() and loop()', answer: 'Every sketch has two parts. <code>setup()</code> runs <b>once</b> when the board powers on, so put <code>pinMode()</code> and <code>begin()</code> calls there. <code>loop()</code> then runs <b>over and over</b> forever. That\'s where your project lives.' },
  { keys: ['pinmode', 'output', 'input', 'mode'], title: 'pinMode()', answer: 'A pin can send power out or read a signal in, but you choose which. <code>pinMode(9, OUTPUT)</code> lets pin 9 drive an LED; <code>pinMode(2, INPUT)</code> lets pin 2 read a button. Forget it and an output only glows faintly!' },
  { keys: ['digitalwrite', 'high', 'low', 'on', 'off'], title: 'HIGH and LOW', answer: '<code>digitalWrite(pin, HIGH)</code> puts 5 volts on the pin (on); <code>LOW</code> puts 0 volts (off). Digital pins are like light switches: only fully on or fully off.' },
  { keys: ['pwm', 'analogwrite', 'fade', 'brightness', 'dim', 'speed', '~'], title: 'PWM: fading and speed', answer: 'Pins marked <b>~</b> (3, 5, 6, 9, 10, 11) can switch on and off thousands of times a second. <code>analogWrite(pin, 0–255)</code> sets how much of the time it\'s on: 127 is on half the time, so an LED looks half as bright or a motor runs at half speed.' },
  { keys: ['analogread', 'analog', '1023', 'a0', 'voltage', 'sensor'], title: 'analogRead()', answer: 'The A0–A5 pins measure voltage: 0 V reads <b>0</b> and 5 V reads <b>1023</b>. Knobs, light sensors and temperature sensors all give you a number in that range.' },
  { keys: ['map', 'scale', 'convert', 'range'], title: 'map()', answer: '<code>map(value, fromLow, fromHigh, toLow, toHigh)</code> rescales a number. For example <code>map(knob, 0, 1023, 0, 255)</code> turns a knob reading into LED brightness. Swap the last two to flip the direction.' },
  { keys: ['delay', 'wait', 'pause', 'milliseconds', 'ms'], title: 'delay()', answer: '<code>delay(1000)</code> waits 1000 milliseconds, which is one second. It\'s easy, but the board does <b>nothing else</b> while it waits. For projects that must react quickly, use <code>millis()</code> instead.' },
  { keys: ['millis', 'timer', 'multitask', 'blink without delay', 'at once'], title: 'millis(): doing two things at once', answer: '<code>millis()</code> tells you how long the board has been running. Save the time when something happens, and later check <code>if (millis() - lastTime >= 1000)</code>. No waiting needed, so <code>loop()</code> stays free to check buttons and sensors.' },
  { keys: ['ground', 'gnd', 'circuit', 'complete', 'power', '5v', 'vcc'], title: 'Power and ground', answer: 'Electricity needs a full loop: out of the board (a pin or <b>5V</b>), through your part, and back to <b>GND</b> (ground). Every part needs its GND wired, or it won\'t work, just like on a real desk.' },
  { keys: ['short', 'short circuit'], title: 'Short circuits', answer: 'A short circuit is a wire straight from 5V to GND, with nothing in between to use the power. Lots of current rushes through, which can overheat and reset a real board. Always put a part between power and ground.' },
  { keys: ['resistor', 'ohm', '220', 'current'], title: 'Resistors', answer: 'A resistor limits how much current flows. LEDs need one (about 220 Ω) or they draw too much and burn out. Sensors like the light sensor use one to turn resistance into a voltage the board can read.' },
  { keys: ['led', 'light', 'diode', 'legs', 'polarity'], title: 'LEDs', answer: 'An LED only lets current flow one way: the long leg (+) goes toward the pin, the short leg (−) toward GND, with a resistor in the path. In Builder, wire the LED\'s <b>Signal</b> leg to a pin and its <b>GND</b> leg to ground.' },
  { keys: ['breadboard', 'rail', 'holes', 'strip'], title: 'Breadboards', answer: 'Inside a breadboard, each column of 5 holes (a–e or f–j) is joined, and each long <b>+</b>/<b>−</b> rail runs the whole length. Wire GND to the − rail once and every part can share it.' },
  { keys: ['button', 'pull', 'pulldown', 'pullup', 'input_pullup', 'floating'], title: 'Buttons and pull-up resistors', answer: 'An input with nothing connected "floats" and reads random values. A pull-down resistor holds it LOW until pressed, or use <code>pinMode(pin, INPUT_PULLUP)</code> to hold it HIGH, so pressed reads <b>LOW</b>.' },
  { keys: ['serial', 'print', 'println', 'monitor', 'debug', 'begin'], title: 'The Serial Monitor', answer: 'Call <code>Serial.begin(9600)</code> in <code>setup()</code>, then <code>Serial.println(x)</code> to show values in the Serial Monitor. It\'s the best way to see what your code is thinking. The <b>Plotter</b> tab graphs the numbers too.' },
  { keys: ['variable', 'int', 'float', 'type', 'long', 'bool', 'byte'], title: 'Variables and types', answer: 'A variable is a named box for a value. <code>int</code> holds whole numbers up to 32767, <code>long</code> bigger ones, <code>float</code> decimals, <code>bool</code> true/false, and <code>String</code> text. Variables made outside any function keep their value between loops.' },
  { keys: ['array', 'list', 'index', '[]'], title: 'Arrays', answer: 'An array is a numbered list: <code>int pins[] = {2, 3, 4};</code>. Counting starts at <b>0</b>, so <code>pins[0]</code> is 2. A <code>for</code> loop can walk through every item.' },
  { keys: ['for', 'while', 'loop', 'repeat', 'count'], title: 'for and while loops', answer: '<code>for (int i = 0; i < 5; i++) { … }</code> repeats the block 5 times with <code>i</code> counting 0 to 4. <code>while (condition) { … }</code> repeats as long as the condition is true.' },
  { keys: ['if', 'else', 'condition', 'compare', '==', 'and', 'or', '&&'], title: 'if / else', answer: '<code>if (light < 300) { … } else { … }</code> runs one block or the other. Compare with <code>==</code> (not <code>=</code>!), <code>&lt;</code>, <code>&gt;</code>, and combine with <code>&&</code> (and) or <code>||</code> (or).' },
  { keys: ['function', 'void', 'return', 'parameter'], title: 'Your own functions', answer: 'Wrap steps you repeat in a function: <code>void blink(int pin) { … }</code>, then call <code>blink(13);</code>. It keeps <code>loop()</code> short and means fixing a bug in one place.' },
  { keys: ['library', 'include', '#include'], title: 'Libraries', answer: '<code>#include &lt;Servo.h&gt;</code> pulls in code someone else wrote, so you can just say <code>myServo.write(90)</code>. Builder supports Servo, LiquidCrystal_I2C, Adafruit_NeoPixel, Adafruit_SSD1306, DHT, Stepper and Keypad.' },
  { keys: ['i2c', 'sda', 'scl', 'address', 'a4', 'a5'], title: 'I2C', answer: 'I2C lets many devices share two wires: <b>SDA</b> (data, A4) and <b>SCL</b> (clock, A5). Each device has an address like <code>0x27</code> so the board can talk to the right one. The LCD and OLED both use it.' },
  { keys: ['interrupt', 'attachinterrupt', 'volatile', 'isr'], title: 'Interrupts', answer: 'An interrupt runs a function the instant a pin changes, even in the middle of <code>delay()</code>. Use <code>attachInterrupt(digitalPinToInterrupt(2), handler, FALLING)</code>. Only pins 2 and 3, keep the handler short, and mark shared variables <code>volatile</code>.' },
  { keys: ['servo', 'angle', 'degrees'], title: 'Servos', answer: 'A servo turns to an exact angle from 0° to 180°. <code>#include &lt;Servo.h&gt;</code>, create <code>Servo s;</code>, then <code>s.attach(9)</code> in setup and <code>s.write(90)</code> to move.' },
  { keys: ['tone', 'buzzer', 'sound', 'note', 'frequency', 'beep'], title: 'Making sound', answer: '<code>tone(pin, 440)</code> plays the note A on a piezo buzzer; <code>noTone(pin)</code> stops it. Add a duration like <code>tone(pin, 440, 200)</code> for a short beep.' },
  { keys: ['ultrasonic', 'distance', 'pulsein', 'echo', 'trig'], title: 'Measuring distance', answer: 'Send a 10 µs pulse on TRIG, then <code>pulseIn(ECHO, HIGH)</code> returns how long the echo took in microseconds. Divide by 58 to get centimetres.' },
  { keys: ['string', 'text', 'word'], title: 'Strings (text)', answer: 'A <code>String</code> holds text. Join pieces with <code>+</code> (<code>"cm: " + String(dist)</code>), compare with <code>==</code>, and add a character with <code>text += key;</code>.' },
  { keys: ['wire', 'wiring', 'connect', 'drag'], title: 'Wiring in Builder', answer: 'Hover over a part\'s leg until it glows, then drag to a socket on the board (or a breadboard hole). You can also click a part and choose a pin from its panel. Click a wire to recolour or delete it.' },
  { keys: ['step', 'pause', 'variables', 'debugger', 'pins tab', 'timeline'], title: 'Debugging tools', answer: 'Press <b>Pause</b>, then <b>Step</b> to run one line at a time. Watch the <b>Variables</b> tab change and the <b>Pins</b> tab draw every signal over time. Bugs have nowhere to hide!' },
  { keys: ['semicolon', ';'], title: 'Semicolons', answer: 'Every statement in C++ ends with <code>;</code>, like a full stop at the end of a sentence. Lines that open a block with <code>{</code> (like <code>if</code> or <code>void loop()</code>) don\'t need one.' },
];

/** A friendly explanation of an error message, if we recognise it. */
export function explainError(msg: string): string {
  const m = (re: RegExp) => msg.match(re);
  if (m(/Expected ";"/)) return 'It looks like a <b>semicolon</b> is missing. Each statement ends with <code>;</code>. Check the end of the highlighted line.';
  if (m(/Missing "}"|Expected "}"/)) return 'A <code>{</code> was opened but never closed. Count your curly brackets: every <code>{</code> needs a matching <code>}</code>.';
  if (m(/Expected "\)"/)) return 'A bracket <code>(</code> wasn\'t closed. Every <code>(</code> needs a matching <code>)</code>.';
  const nd = m(/"(\w+)" was not declared/);
  if (nd) return `Your code uses <code>${nd[1]}</code>, but it hasn't been created yet. Check the spelling (capitals matter!), or declare it first, like <code>int ${nd[1]} = 0;</code>.`;
  const uf = m(/Unknown function "(\w+)\(\)"/);
  if (uf) return `I don't know a function called <code>${uf[1]}()</code>. Capital letters matter: it's <code>digitalWrite</code>, not <code>digitalwrite</code>. If it's your own function, make sure you wrote it.`;
  if (m(/outside array/)) return 'The code reached past the end of an array. Remember counting starts at <b>0</b>, so an array of 5 items goes from <code>[0]</code> to <code>[4]</code>.';
  if (m(/Division by zero/)) return 'Something was divided by zero, which has no answer. Check what the bottom number can be. A sensor reading of 0, maybe?';
  if (m(/needs a "void setup\(\)"|needs a "void loop\(\)"/)) return 'Every sketch needs both <code>void setup()</code> and <code>void loop()</code>, even if one of them is empty.';
  if (m(/not a valid pin/)) return 'That pin number doesn\'t exist. The Builder One has pins 0–13 and A0–A5.';
  if (m(/Cannot store text/)) return 'You tried to put text into a number variable. Use a <code>String</code> variable for text.';
  if (m(/Unexpected character/)) return 'There\'s a character C++ doesn\'t understand. Maybe a smart quote (“ ”) pasted from somewhere? Use plain quotes <code>"</code>.';
  if (m(/Expected a variable or function declaration/)) return 'Code outside a function can only create variables. Move this line inside <code>setup()</code> or <code>loop()</code>.';
  return 'Read the message closely and look at the highlighted line. The mistake is usually there or just above it.';
}

/** Find the best topics for a question by counting keyword matches. */
export function searchTopics(question: string): Topic[] {
  const q = ` ${question.toLowerCase().replace(/[?!.,]/g, ' ')} `;
  return TOPICS.map(t => ({
    t,
    score: t.keys.reduce((s, k) => s + (q.includes(` ${k} `) ? 3 : k.length > 4 && new RegExp(`\\b${k.replace(/[^\\w ]/g, '')}`).test(q) ? 1 : 0), 0) + (q.includes(t.title.toLowerCase()) ? 3 : 0),
  }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.t);
}

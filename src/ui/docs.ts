// Short reference for built-in functions, used by autocomplete and hover help.
// Member functions are keyed by object kind: "Serial.print", "Servo.write", ...

export interface Doc { sig: string; doc: string; kind?: 'fn' | 'const' | 'type' | 'kw' }

export const DOCS: Record<string, Doc> = {
  setup: { sig: 'void setup()', doc: 'Runs once when the board starts. Put pinMode() and begin() calls here.' },
  loop: { sig: 'void loop()', doc: 'Runs over and over, forever, after setup() finishes.' },
  pinMode: { sig: 'pinMode(pin, mode)', doc: 'Set a pin to INPUT, OUTPUT or INPUT_PULLUP. Call it in setup().' },
  digitalWrite: { sig: 'digitalWrite(pin, value)', doc: 'Set an OUTPUT pin HIGH (5 V) or LOW (0 V).' },
  digitalRead: { sig: 'digitalRead(pin) → HIGH / LOW', doc: 'Read whether an input pin is HIGH or LOW.' },
  analogWrite: { sig: 'analogWrite(pin, 0–255)', doc: 'PWM output: 0 is always off, 255 is always on. Only on ~ pins (3, 5, 6, 9, 10, 11).' },
  analogRead: { sig: 'analogRead(A0–A5) → 0–1023', doc: 'Measure the voltage on an analog pin: 0 V reads 0, 5 V reads 1023.' },
  delay: { sig: 'delay(ms)', doc: 'Pause for a number of milliseconds (1000 ms = 1 second). Nothing else runs meanwhile.' },
  delayMicroseconds: { sig: 'delayMicroseconds(µs)', doc: 'Pause for a number of microseconds (1000 µs = 1 ms).' },
  millis: { sig: 'millis() → unsigned long', doc: 'Milliseconds since the board started. Great for timing without delay().' },
  micros: { sig: 'micros() → unsigned long', doc: 'Microseconds since the board started.' },
  tone: { sig: 'tone(pin, frequency [, duration])', doc: 'Play a square-wave note on a buzzer. 440 Hz is the note A.' },
  noTone: { sig: 'noTone(pin)', doc: 'Stop the tone playing on a pin.' },
  pulseIn: { sig: 'pulseIn(pin, HIGH [, timeout]) → µs', doc: 'Measure how long a pin stays HIGH (or LOW), in microseconds. Returns 0 on timeout.' },
  map: { sig: 'map(value, fromLow, fromHigh, toLow, toHigh)', doc: 'Re-scale a number from one range to another, e.g. 0–1023 to 0–255.' },
  constrain: { sig: 'constrain(x, low, high)', doc: 'Clamp a number so it stays between low and high.' },
  min: { sig: 'min(a, b)', doc: 'The smaller of two numbers.' },
  max: { sig: 'max(a, b)', doc: 'The larger of two numbers.' },
  abs: { sig: 'abs(x)', doc: 'Distance from zero: abs(-5) is 5.' },
  random: { sig: 'random(max) / random(min, max)', doc: 'A random whole number from min up to (but not including) max.' },
  randomSeed: { sig: 'randomSeed(seed)', doc: 'Start the random sequence somewhere different. Often randomSeed(analogRead(A0)).' },
  sqrt: { sig: 'sqrt(x) → float', doc: 'Square root.' },
  pow: { sig: 'pow(base, exponent) → float', doc: 'base raised to a power: pow(2, 3) is 8.' },
  sin: { sig: 'sin(radians) → float', doc: 'Sine of an angle in radians.' },
  cos: { sig: 'cos(radians) → float', doc: 'Cosine of an angle in radians.' },
  sizeof: { sig: 'sizeof(x)', doc: 'Size in bytes. Number of array items: sizeof(arr) / sizeof(arr[0]).', kind: 'kw' },
  String: { sig: 'String(value)', doc: 'Turn a number into text, e.g. "cm: " + String(dist).', kind: 'type' },

  'Serial.begin': { sig: 'Serial.begin(9600)', doc: 'Start the Serial Monitor connection at a speed (baud rate).' },
  'Serial.print': { sig: 'Serial.print(value [, digits/base])', doc: 'Send text or a number to the Serial Monitor, without a new line.' },
  'Serial.println': { sig: 'Serial.println(value)', doc: 'Like print(), then start a new line.' },
  'Serial.available': { sig: 'Serial.available() → count', doc: 'How many characters are waiting to be read.' },
  'Serial.read': { sig: 'Serial.read() → char or -1', doc: 'Read one waiting character.' },
  'Serial.readString': { sig: 'Serial.readString() → String', doc: 'Read all waiting characters as text.' },
  'Serial.parseInt': { sig: 'Serial.parseInt() → long', doc: 'Read a whole number from the waiting text.' },

  'Servo.attach': { sig: 'myServo.attach(pin)', doc: 'Tell the servo which pin its signal wire is on.' },
  'Servo.write': { sig: 'myServo.write(angle)', doc: 'Turn the servo to an angle from 0 to 180 degrees.' },
  'Servo.read': { sig: 'myServo.read() → angle', doc: 'The last angle you wrote.' },
  'Servo.detach': { sig: 'myServo.detach()', doc: 'Stop sending pulses; the servo goes limp.' },

  'LCD.init': { sig: 'lcd.init()', doc: 'Start the display. Call once in setup().' },
  'LCD.backlight': { sig: 'lcd.backlight()', doc: 'Turn the backlight on.' },
  'LCD.noBacklight': { sig: 'lcd.noBacklight()', doc: 'Turn the backlight off.' },
  'LCD.clear': { sig: 'lcd.clear()', doc: 'Erase everything and move the cursor to 0, 0.' },
  'LCD.setCursor': { sig: 'lcd.setCursor(column, row)', doc: 'Move to a position. Both count from 0: (0, 1) is the start of row 2.' },
  'LCD.print': { sig: 'lcd.print(value)', doc: 'Write text or a number at the cursor.' },
  'LCD.scrollDisplayLeft': { sig: 'lcd.scrollDisplayLeft()', doc: 'Shift everything one character to the left.' },

  'NeoPixel.begin': { sig: 'strip.begin()', doc: 'Get the strip ready. Call once in setup().' },
  'NeoPixel.show': { sig: 'strip.show()', doc: 'Send all the colours to the strip. Nothing changes until you call this!' },
  'NeoPixel.setPixelColor': { sig: 'strip.setPixelColor(i, color)', doc: 'Set pixel i (from 0) to a colour made with strip.Color(r, g, b).' },
  'NeoPixel.Color': { sig: 'strip.Color(r, g, b) → color', doc: 'Pack red, green and blue (0–255 each) into one colour number.' },
  'NeoPixel.ColorHSV': { sig: 'strip.ColorHSV(hue [, sat, val])', doc: 'Colour from a hue of 0–65535 around the rainbow.' },
  'NeoPixel.fill': { sig: 'strip.fill(color [, first, count])', doc: 'Set many pixels to one colour.' },
  'NeoPixel.clear': { sig: 'strip.clear()', doc: 'Set every pixel to off (call show() to see it).' },
  'NeoPixel.setBrightness': { sig: 'strip.setBrightness(0–255)', doc: 'Dim the whole strip.' },
  'NeoPixel.numPixels': { sig: 'strip.numPixels() → count', doc: 'How many pixels the strip has.' },

  'DHT.begin': { sig: 'dht.begin()', doc: 'Start the sensor. Call once in setup().' },
  'DHT.readTemperature': { sig: 'dht.readTemperature([fahrenheit]) → float', doc: 'Temperature in °C (or °F if you pass true). Takes about 250 ms; gives nan if the sensor isn’t wired.' },
  'DHT.readHumidity': { sig: 'dht.readHumidity() → float', doc: 'Relative humidity in percent.' },
  attachInterrupt: { sig: 'attachInterrupt(digitalPinToInterrupt(pin), handler, mode)', doc: 'Run handler() the instant a pin changes, even in the middle of delay(). Mode: RISING, FALLING or CHANGE. Only pins 2 and 3.' },
  digitalPinToInterrupt: { sig: 'digitalPinToInterrupt(pin)', doc: 'Turn pin 2 or 3 into the interrupt number attachInterrupt() wants.' },
  'OLED.begin': { sig: 'display.begin(SSD1306_SWITCHCAPVCC, 0x3C)', doc: 'Start the screen at its I2C address. Call once in setup().' },
  'OLED.clearDisplay': { sig: 'display.clearDisplay()', doc: 'Erase the drawing (call display() to show it).' },
  'OLED.display': { sig: 'display.display()', doc: 'Send everything you drew to the screen. Nothing appears until you call this!' },
  'OLED.setTextSize': { sig: 'display.setTextSize(1–8)', doc: 'Text scale: 1 is 6×8 pixels per letter, 2 is double.' },
  'OLED.setTextColor': { sig: 'display.setTextColor(SSD1306_WHITE)', doc: 'Colour for text: WHITE (on) or BLACK (off).' },
  'OLED.setCursor': { sig: 'display.setCursor(x, y)', doc: 'Where the next text starts, in pixels from the top-left corner.' },
  'OLED.print': { sig: 'display.print(value)', doc: 'Draw text or a number at the cursor.' },
  'OLED.println': { sig: 'display.println(value)', doc: 'Draw text, then move to the next line.' },
  'OLED.drawPixel': { sig: 'display.drawPixel(x, y, color)', doc: 'Light a single pixel (0–127 across, 0–63 down).' },
  'OLED.drawLine': { sig: 'display.drawLine(x0, y0, x1, y1, color)', doc: 'Draw a straight line.' },
  'OLED.drawRect': { sig: 'display.drawRect(x, y, w, h, color)', doc: 'Outline a rectangle.' },
  'OLED.fillRect': { sig: 'display.fillRect(x, y, w, h, color)', doc: 'Fill a rectangle: handy for bars and erasing areas.' },
  'OLED.drawCircle': { sig: 'display.drawCircle(x, y, r, color)', doc: 'Outline a circle.' },
  'OLED.fillCircle': { sig: 'display.fillCircle(x, y, r, color)', doc: 'Fill a circle.' },
  'Stepper.setSpeed': { sig: 'motor.setSpeed(rpm)', doc: 'How fast to turn, in revolutions per minute. Set it before step().' },
  'Stepper.step': { sig: 'motor.step(steps)', doc: 'Turn a number of steps (negative turns backwards). Waits until finished. 2048 steps is one full turn.' },
  'Keypad.getKey': { sig: 'keypad.getKey() → char', doc: 'The key just pressed, or 0 (NO_KEY) if none. Each press is reported once.' },
  'Matrix.shutdown': { sig: 'lc.shutdown(0, false)', doc: 'Wake the display (true puts it to sleep). It starts asleep, so call this in setup().' },
  'Matrix.setIntensity': { sig: 'lc.setIntensity(0, 0–15)', doc: 'Brightness of the whole matrix.' },
  'Matrix.clearDisplay': { sig: 'lc.clearDisplay(0)', doc: 'Turn every LED off.' },
  'Matrix.setLed': { sig: 'lc.setLed(0, row, col, true/false)', doc: 'Switch one LED. Rows and columns go 0–7 from the top-left.' },
  'Matrix.setRow': { sig: 'lc.setRow(0, row, B01100110)', doc: 'Set a whole row at once: each 1 bit is a lit LED, left to right.' },
  'Matrix.setColumn': { sig: 'lc.setColumn(0, col, B00111100)', doc: 'Set a whole column at once, top to bottom.' },
  makeKeymap: { sig: 'makeKeymap(keys)', doc: 'Turns your 2D array of key labels into a keymap for Keypad().' },
  'String.length': { sig: 'text.length()', doc: 'Number of characters.' },
  'String.toInt': { sig: 'text.toInt()', doc: 'Convert "42" to the number 42.' },
  'String.indexOf': { sig: 'text.indexOf(x)', doc: 'Position of x in the text, or -1.' },
  'String.substring': { sig: 'text.substring(from [, to])', doc: 'Part of the text.' },
  'String.trim': { sig: 'text.trim()', doc: 'Remove spaces and new lines from both ends.' },

  'IrReceiver.begin': { sig: 'IrReceiver.begin(pin, ENABLE_LED_FEEDBACK)', doc: 'Start listening for remote-control codes on a pin. Call once in setup().' },
  'IrReceiver.decode': { sig: 'IrReceiver.decode() → true / false', doc: 'True when a button code has arrived. Read it from IrReceiver.decodedIRData.command.' },
  'IrReceiver.resume': { sig: 'IrReceiver.resume()', doc: 'Get ready for the next code. Call it after handling each one.' },
  'SoftSerial.begin': { sig: 'bt.begin(9600)', doc: 'Start the Bluetooth link. HC-05 modules talk at 9600 baud.' },
  'SoftSerial.available': { sig: 'bt.available() → count', doc: 'How many characters from the phone are waiting.' },
  'SoftSerial.read': { sig: 'bt.read() → char or -1', doc: 'Read one character sent from the phone.' },
  'SoftSerial.readString': { sig: 'bt.readString() → String', doc: 'Read everything the phone sent as text.' },
  'SoftSerial.print': { sig: 'bt.print(value)', doc: 'Send text or a number to the phone.' },
  'SoftSerial.println': { sig: 'bt.println(value)', doc: 'Send text to the phone, then a new line.' },
  'SD.begin': { sig: 'SD.begin(csPin) → true / false', doc: 'Start the SD card. False means no card answered: check the wiring.' },
  'SD.open': { sig: 'SD.open("name.txt" [, FILE_WRITE]) → File', doc: 'Open a file. FILE_WRITE adds to the end (and creates it); without it the file is read.' },
  'SD.exists': { sig: 'SD.exists("name.txt") → true / false', doc: 'Is there a file with this name?' },
  'SD.remove': { sig: 'SD.remove("name.txt")', doc: 'Delete a file from the card.' },
  'File.println': { sig: 'file.println(value)', doc: 'Write text to the file, then a new line.' },
  'File.print': { sig: 'file.print(value)', doc: 'Write text or a number to the file.' },
  'File.available': { sig: 'file.available() → count', doc: 'How many characters are left to read.' },
  'File.read': { sig: 'file.read() → char or -1', doc: 'Read the next character of the file.' },
  'File.close': { sig: 'file.close()', doc: 'Finish with the file. Always close it, or the last writes can be lost on real cards.' },
  'Digits.setBrightness': { sig: 'display.setBrightness(0–7)', doc: 'How bright the digits glow. 7 is brightest.' },
  'Digits.showNumberDec': { sig: 'display.showNumberDec(number [, leadingZeros])', doc: 'Show a number from -999 to 9999. showNumberDec(7, true) shows 0007.' },
  'Digits.showNumberDecEx': { sig: 'display.showNumberDecEx(number, 0b01000000, leadingZeros)', doc: 'Like showNumberDec, with dots: 0b01000000 lights the colon, great for clocks.' },
  'Compass.init': { sig: 'compass.init()', doc: 'Start the compass. Call once in setup().' },
  'Compass.read': { sig: 'compass.read()', doc: 'Take a fresh measurement. Call it before getAzimuth().' },
  'Compass.getAzimuth': { sig: 'compass.getAzimuth() → 0–359', doc: 'Which way it points, in degrees: 0 north, 90 east, 180 south, 270 west.' },
  'Digits.clear': { sig: 'display.clear()', doc: 'Blank all four digits.' },
  'Digits.setSegments': { sig: 'display.setSegments(data [, length, position])', doc: 'Light exact segments: each byte is SEG_A … SEG_G added together.' },
};

const CONST_DOCS: Record<string, string> = {
  HIGH: '1: 5 volts, on', LOW: '0: 0 volts, off', INPUT: 'pin mode: read a signal', OUTPUT: 'pin mode: send power out',
  INPUT_PULLUP: 'input with a built-in resistor to 5 V: unpressed reads HIGH', LED_BUILTIN: 'pin 13, the on-board "L" LED',
  A0: 'analog pin 0', A1: 'analog pin 1', A2: 'analog pin 2', A3: 'analog pin 3', A4: 'analog pin 4 (I2C SDA)', A5: 'analog pin 5 (I2C SCL)',
  true: '1', false: '0', RISING: 'interrupt when a pin goes LOW → HIGH', FALLING: 'interrupt when a pin goes HIGH → LOW', CHANGE: 'interrupt on any change', DHT11: 'the blue DHT11 sensor', DHT22: 'the more precise white DHT22 sensor', SSD1306_WHITE: 'pixel on', SSD1306_BLACK: 'pixel off', NO_KEY: '0: no key pressed', PI: '3.14159…', NEO_GRB: 'pixel colour order for most strips', NEO_KHZ800: '800 kHz data speed', FILE_WRITE: 'open a file to add to it', FILE_READ: 'open a file to read it', ENABLE_LED_FEEDBACK: 'flash the receiver’s LED when a code arrives',
};
for (const [k, v] of Object.entries(CONST_DOCS)) DOCS[k] = { sig: k, doc: v, kind: 'const' };

const TYPES = ['int', 'long', 'unsigned long', 'float', 'bool', 'byte', 'char', 'String', 'void', 'const', 'volatile', 'Servo', 'LiquidCrystal_I2C', 'Adafruit_NeoPixel', 'DHT', 'Adafruit_SSD1306', 'Stepper', 'Keypad', 'LedControl', 'SoftwareSerial', 'File', 'TM1637Display', 'QMC5883LCompass'];
const KEYWORDS = ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return', 'default'];
export const PLAIN_WORDS = [...TYPES, ...KEYWORDS];

/** Object kind for a variable, found by scanning its declaration. */
export function objectKind(code: string, name: string): string | null {
  if (name === 'Serial' || name === 'SD' || name === 'IrReceiver') return name;
  const m = code.match(new RegExp(`\\b(Servo|LiquidCrystal_I2C|Adafruit_NeoPixel|DHT|Adafruit_SSD1306|Stepper|Keypad|LedControl|SoftwareSerial|File|TM1637Display|QMC5883LCompass|String)\\s+${name}\\b`));
  if (!m) return null;
  return { Servo: 'Servo', LiquidCrystal_I2C: 'LCD', Adafruit_NeoPixel: 'NeoPixel', DHT: 'DHT', Adafruit_SSD1306: 'OLED', Stepper: 'Stepper', Keypad: 'Keypad', LedControl: 'Matrix', SoftwareSerial: 'SoftSerial', File: 'File', TM1637Display: 'Digits', QMC5883LCompass: 'Compass', String: 'String' }[m[1]] ?? null;
}

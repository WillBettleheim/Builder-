// "Check your understanding" questions, two per lesson.

export interface Question { q: string; a: string[]; correct: number; why: string }

export const QUIZZES: Record<string, Question[]> = {
  'bug-pinmode': [
    { q: 'Why was the LED dim with pinMode(LED, INPUT)?', a: ['An INPUT pin only turns on a weak pull-up, not real power', 'INPUT pins blink slower', 'The LED was broken'], correct: 0, why: 'Writing HIGH to an INPUT pin just switches on its tiny internal pull-up resistor: enough to glow faintly, nowhere near enough to light an LED.' },
    { q: 'What is the first step of fixing a bug?', a: ['Run it and watch exactly what happens', 'Rewrite all the code', 'Buy a new board'], correct: 0, why: 'Good bug hunters observe first. The symptoms usually point straight at the cause.' },
  ],
  'bug-wiring': [
    { q: 'The code and the wires disagree. Which is “right”?', a: ['Either: they just have to match each other', 'Always the code', 'Always the wires'], correct: 0, why: 'The board only knows pin numbers. Swap the wires or swap the numbers; both make code and circuit agree.' },
    { q: 'How can you check which pin an LED is really on?', a: ['Follow its wire back to the board', 'Look at its colour', 'Guess from the code'], correct: 0, why: 'Tracing each wire from end to end is how real builders check a circuit.' },
  ],
  'bug-button': [
    { q: 'Why did the LED flicker with nothing pressed?', a: ['The input pin was floating and picked up noise', 'The LED was loose', 'loop() ran too slowly'], correct: 0, why: 'With no resistor holding it HIGH or LOW, an input pin “floats” and reads random values.' },
    { q: 'With INPUT_PULLUP, what does a pressed button read?', a: ['LOW', 'HIGH', 'A random value'], correct: 0, why: 'The pull-up holds the pin HIGH; pressing connects it to GND, so it reads LOW.' },
  ],
  'bug-array': [
    { q: 'An array has 6 items. What is the last valid index?', a: ['5', '6', '7'], correct: 0, why: 'Arrays count from 0, so 6 items are numbered 0 to 5.' },
    { q: 'Which loop visits each of COUNT items exactly once?', a: ['for (i = 0; i < COUNT; i++)', 'for (i = 0; i <= COUNT; i++)', 'for (i = 1; i <= COUNT + 1; i++)'], correct: 0, why: 'Starting at 0 and stopping before COUNT gives exactly COUNT steps: 0 … COUNT−1.' },
  ],
  'bug-compare': [
    { q: 'What does if (light = 300) actually do?', a: ['Stores 300 in light, which counts as true', 'Checks whether light equals 300', 'Causes a compile error'], correct: 0, why: 'A single = assigns. The result, 300, isn’t zero, so the if is always true.' },
    { q: 'Which line checks whether light is below 300?', a: ['if (light < 300)', 'if (light = 300)', 'if (light =< 300)'], correct: 0, why: '< compares. == checks equality. A single = is assignment, never a question.' },
  ],
  blink: [
    { q: 'How many times does setup() run?', a: ['Once, when the board starts', 'Over and over', 'Once per second'], correct: 0, why: 'setup() runs once at power-on; loop() is the part that repeats forever.' },
    { q: 'What does delay(500) do?', a: ['Waits half a second', 'Waits 500 seconds', 'Blinks 500 times'], correct: 0, why: 'delay() counts in milliseconds, and 1000 ms is one second.' },
  ],
  circuit: [
    { q: 'Why does the LED need a resistor?', a: ['To limit the current so it doesn’t burn out', 'To make it blink', 'To change its colour'], correct: 0, why: 'Without a resistor too much current flows and the LED (or the pin) can be damaged.' },
    { q: 'Your code uses pin 9 but the wire goes to pin 7. What happens?', a: ['Nothing lights up', 'Pin 7 lights anyway', 'The board fixes it'], correct: 0, why: 'Code and wiring must agree. The board only does exactly what the code says.' },
  ],
  breadboard: [
    { q: 'Which breadboard holes are connected to each other?', a: ['Each 5-hole column, and each whole rail', 'Every hole on the board', 'None, they’re all separate'], correct: 0, why: 'Columns a–e (and f–j) are joined in groups of 5; the long + and − rails run the full length.' },
    { q: 'Why wire GND to the − rail?', a: ['So many parts can share one ground wire', 'It makes things faster', 'Rails only work with GND'], correct: 0, why: 'One wire to the rail turns every hole on that rail into GND.' },
  ],
  fade: [
    { q: 'What range does analogWrite() take?', a: ['0 to 255', '0 to 1023', '0 to 100'], correct: 0, why: '0 is always off, 255 is always on; values in between are PWM.' },
    { q: 'Which pins can fade with PWM?', a: ['Pins marked ~ (3, 5, 6, 9, 10, 11)', 'All pins', 'Only A0–A5'], correct: 0, why: 'Only the ~ pins have hardware PWM.' },
  ],
  chaser: [
    { q: 'For const int LEDS[] = {2, 3, 4}; what is LEDS[1]?', a: ['3', '2', '4'], correct: 0, why: 'Arrays count from 0, so LEDS[0] is 2 and LEDS[1] is 3.' },
    { q: 'Why store the pins in an array?', a: ['One loop can handle every LED', 'Arrays make LEDs brighter', 'The board needs arrays'], correct: 0, why: 'A for loop walks through the list, so adding an LED means editing one line.' },
  ],
  rgb: [
    { q: 'Red and green light together make…', a: ['Yellow', 'Purple', 'Cyan'], correct: 0, why: 'Mixing light adds colours: red + green = yellow, red + blue = purple.' },
    { q: 'What’s the benefit of writing setColor(r, g, b)?', a: ['Reusable, readable code', 'It runs faster than analogWrite', 'It’s required by the board'], correct: 0, why: 'Your own functions turn repeated steps into one named, reusable command.' },
  ],
  serial: [
    { q: 'What must you call before Serial.println() works?', a: ['Serial.begin(9600)', 'pinMode(0, OUTPUT)', 'Nothing'], correct: 0, why: 'Serial.begin() starts the connection at a speed (baud rate).' },
    { q: 'Why make counter a global variable?', a: ['It keeps its value between loops', 'Globals are faster', 'Local variables can’t hold numbers'], correct: 0, why: 'A variable declared inside loop() starts fresh every time loop() runs.' },
  ],
  seg7: [
    { q: 'DIGITS[3][0] means…', a: ['Row 3 (digit 3), column 0 (segment a)', 'Row 0, column 3', 'The number 30'], correct: 0, why: 'The first index picks the row, the second picks the column.' },
    { q: 'How many segments make the digit 8?', a: ['All 7', '8', '4'], correct: 0, why: 'An 8 lights every segment a through g.' },
  ],
  lcd: [
    { q: 'lcd.setCursor(0, 1) moves to…', a: ['Column 0 of the second row', 'Row 0, column 1', 'The first character'], correct: 0, why: 'setCursor(column, row), and rows count from 0.' },
    { q: 'Which pins does an I2C device use?', a: ['SDA (A4) and SCL (A5)', 'Pins 0 and 1', 'Any two pins'], correct: 0, why: 'On the Builder One, I2C data is on A4 and the clock is on A5.' },
  ],
  oled: [
    { q: 'You drew a circle but the screen is blank. What’s missing?', a: ['display.display()', 'display.clearDisplay()', 'delay()'], correct: 0, why: 'Drawing happens in memory; display() sends it to the screen.' },
    { q: 'Where is pixel (0, 0)?', a: ['Top-left corner', 'Bottom-left corner', 'The centre'], correct: 0, why: 'x grows to the right and y grows downward from the top-left.' },
  ],
  neopixel: [
    { q: 'How many data wires does a NeoPixel strip need?', a: ['One', 'One per pixel', 'Three (red, green, blue)'], correct: 0, why: 'Each pixel passes the data along the chain to the next.' },
    { q: 'You set pixel colours but nothing changes. Why?', a: ['strip.show() wasn’t called', 'The colours are too dark', 'Pixels start at 1'], correct: 0, why: 'setPixelColor() only stores the colour; show() sends them all.' },
  ],
  button: [
    { q: 'What does a pull-down resistor do?', a: ['Holds the pin LOW when the button isn’t pressed', 'Makes the button harder to press', 'Powers the LED'], correct: 0, why: 'Without it the input "floats" and reads random values.' },
    { q: 'Edge detection means reacting when…', a: ['The state changes, e.g. LOW → HIGH', 'The button is held down', 'The board starts'], correct: 0, why: 'Compare with the previous reading to catch the moment of the press.' },
  ],
  millis: [
    { q: 'Why is delay() a problem for responsive projects?', a: ['Nothing else runs while it waits', 'It uses too much power', 'It’s inaccurate'], correct: 0, why: 'During delay() the board can’t check buttons or sensors.' },
    { q: 'What does millis() return?', a: ['Milliseconds since the board started', 'The current time of day', 'How long delay() lasted'], correct: 0, why: 'Compare millis() with a saved time to see if enough time has passed.' },
  ],
  interrupts: [
    { q: 'Why mark presses as volatile?', a: ['It changes inside an interrupt handler', 'It makes it bigger', 'It’s required for all ints'], correct: 0, why: 'volatile tells the compiler the value can change at any moment.' },
    { q: 'Which pins can trigger interrupts on the Builder One?', a: ['2 and 3', 'All digital pins', 'A0–A5'], correct: 0, why: 'Only pins 2 and 3 have hardware interrupts here.' },
  ],
  pot: [
    { q: 'What range does analogRead() return?', a: ['0 to 1023', '0 to 255', '0 to 5'], correct: 0, why: '0 V reads 0 and 5 V reads 1023.' },
    { q: 'map(512, 0, 1023, 0, 255) gives about…', a: ['127', '512', '255'], correct: 0, why: '512 is halfway through 0–1023, so it maps to halfway through 0–255.' },
  ],
  joystick: [
    { q: 'Where does a joystick rest?', a: ['About 512 on both axes', '0 on both axes', '1023 on both axes'], correct: 0, why: 'The centre is halfway through the 0–1023 range.' },
    { q: 'What is a dead zone for?', a: ['Ignoring tiny wobbles near the centre', 'Making it faster', 'Saving power'], correct: 0, why: 'The centre is never exactly 512, so small values are ignored.' },
  ],
  nightlight: [
    { q: 'In this circuit, darkness gives…', a: ['Low analogRead() values', 'High analogRead() values', 'No reading at all'], correct: 0, why: 'With the LDR wired to 5V, more light means a higher voltage on A0.' },
    { q: 'What’s a threshold?', a: ['A cut-off value that decides on or off', 'The brightest light', 'A type of resistor'], correct: 0, why: 'Below the threshold counts as dark, above it as bright.' },
  ],
  sound: [
    { q: 'tone(8, 440) plays…', a: ['The note A on pin 8', '440 beeps', 'Volume 440'], correct: 0, why: 'The second number is the frequency in hertz.' },
    { q: 'How do you stop a tone?', a: ['noTone(pin)', 'tone(pin, 0)', 'delay(0)'], correct: 0, why: 'noTone() stops the sound on that pin.' },
  ],
  morse: [
    { q: 'Why write dot() and dash() functions?', a: ['Change the beep once and it applies everywhere', 'Functions run faster', 'Morse needs functions'], correct: 0, why: 'Small named functions avoid repeating code and make changes easy.' },
    { q: 'A dash is how many times longer than a dot?', a: ['3', '2', '10'], correct: 0, why: 'In Morse code a dash lasts three dot-units.' },
  ],
  distance: [
    { q: 'Why divide the echo time by 58?', a: ['Sound covers 1 cm in 29 µs, there and back', 'It’s the sensor’s model number', 'To convert to inches'], correct: 0, why: 'The pulse measures the round trip: 29 µs out plus 29 µs back per cm.' },
    { q: 'Why use long for the duration?', a: ['Echo times can be bigger than an int can hold', 'long is more precise', 'pulseIn needs it'], correct: 0, why: 'An int on this board tops out at 32767.' },
  ],
  servo: [
    { q: 'What range does myServo.write() take?', a: ['0 to 180 degrees', '0 to 360 degrees', '0 to 255'], correct: 0, why: 'A standard servo turns through half a circle.' },
    { q: 'What is a library?', a: ['Code someone else wrote that you can reuse', 'A list of parts', 'A type of board'], correct: 0, why: '#include <Servo.h> gives you the Servo class for free.' },
  ],
  stepper: [
    { q: 'How many steps is a quarter turn on this motor?', a: ['512', '90', '2048'], correct: 0, why: '2048 steps per turn ÷ 4 = 512.' },
    { q: 'Why can a stepper point precisely without a sensor?', a: ['It moves in exact, countable steps', 'It has a built-in camera', 'It always stops at 0°'], correct: 0, why: 'Count the steps and you know exactly where it is.' },
  ],
  motor: [
    { q: 'Why does the motor need a transistor?', a: ['A pin can’t supply enough current', 'To make it spin backwards', 'To measure speed'], correct: 0, why: 'The transistor switches the motor’s bigger current; the pin only controls it.' },
    { q: 'analogWrite(MOTOR, 128) runs the motor at about…', a: ['Half speed', 'Full speed', 'Stopped'], correct: 0, why: '128 is about half of 255.' },
  ],
  relay: [
    { q: 'What does a relay do?', a: ['Lets a small signal switch a separate big circuit', 'Makes LEDs brighter', 'Measures current'], correct: 0, why: 'An electromagnet flips a switch, keeping the two circuits apart.' },
    { q: 'What makes the clicking sound?', a: ['The switch contacts moving', 'The lamp warming up', 'The board’s speaker'], correct: 0, why: 'Relays are mechanical: you hear the contacts snap.' },
  ],
  thermo: [
    { q: 'Why write 5.0 instead of 5 in the formula?', a: ['So the division keeps decimals', 'It’s more accurate', 'The sensor needs it'], correct: 0, why: 'Dividing two whole numbers throws away the fraction.' },
    { q: 'The TMP36 outputs 0.5 V at…', a: ['0 °C', '50 °C', '100 °C'], correct: 0, why: '0.5 V at 0 °C, plus 10 mV for every degree.' },
  ],
  weather: [
    { q: 'How many data wires does the DHT11 use?', a: ['One', 'Two', 'Four'], correct: 0, why: 'It sends both readings over a single wire with its own protocol.' },
    { q: 'What does readTemperature() return if the sensor isn’t wired?', a: ['nan (not a number)', '0', 'An error that stops the sketch'], correct: 0, why: 'Check the wiring if you ever see nan.' },
  ],
  plant: [
    { q: 'Wetter soil gives…', a: ['Lower readings', 'Higher readings', 'No change'], correct: 0, why: 'Water conducts, so this sensor’s output voltage drops.' },
    { q: 'map(raw, 1023, 323, 0, 100) does what?', a: ['Flips and rescales the reading to 0–100 %', 'Adds 100', 'Reads two pins'], correct: 0, why: 'map() can run "backwards" when the from-range is reversed.' },
  ],
  motion: [
    { q: 'Why only update the LCD when the state changes?', a: ['Clearing every loop makes it flicker', 'The LCD wears out', 'It’s required by the PIR'], correct: 0, why: 'Redrawing constantly causes visible flicker.' },
    { q: 'What does a PIR sensor detect?', a: ['Movement of warm bodies', 'Distance', 'Sound'], correct: 0, why: 'Passive InfraRed: it sees changes in heat.' },
  ],
  lock: [
    { q: 'How do 8 wires read 16 keys?', a: ['Each key joins one row to one column', 'Each wire reads two keys', 'The keypad has a chip'], correct: 0, why: 'The library scans rows and columns to find the crossing point.' },
    { q: 'entered += key does what?', a: ['Adds the key to the end of the text', 'Adds the key’s number value', 'Replaces the text'], correct: 0, why: 'For Strings, + joins text together.' },
  ],
  encoder: [
    { q: 'How is a rotary encoder different from a potentiometer?', a: ['It turns forever and reports clicks, not an angle', 'It reads temperature', 'It can only turn one way'], correct: 0, why: 'Encoders count steps in either direction with no end stop.' },
    { q: 'CLK just changed and DT is different from CLK. Which way did it turn?', a: ['Clockwise', 'Anticlockwise', 'It didn’t move'], correct: 0, why: 'The order the two pins change in reveals the direction.' },
  ],
  matrix: [
    { q: 'What does B00011000 draw on one row?', a: ['The two middle LEDs lit', 'The two outer LEDs lit', 'All eight LEDs'], correct: 0, why: 'Each 1 is a lit LED, read left to right.' },
    { q: 'Why does the matrix stay dark until lc.shutdown(0, false)?', a: ['The MAX7219 starts asleep to save power', 'The LEDs need to warm up', 'It needs a reset button'], correct: 0, why: 'Waking the chip is always the first step.' },
  ],
  clap: [
    { q: 'What does the DO pin tell you?', a: ['Whether it’s louder than the threshold', 'The exact loudness', 'The pitch of the sound'], correct: 0, why: 'DO is digital: HIGH above the threshold, LOW below.' },
    { q: 'Why wait about 300 ms after toggling?', a: ['So one clap isn’t counted several times', 'To save power', 'The microphone needs to cool down'], correct: 0, why: 'A clap stays loud for a moment; the pause makes it one toggle.' },
  ],
  smoke: [
    { q: 'What happens to the MQ-2’s AO reading as smoke increases?', a: ['It goes up', 'It goes down', 'It stays the same'], correct: 0, why: 'More gas changes the sensor’s resistance, raising the voltage on AO.' },
    { q: 'Why does the MQ-2 get warm?', a: ['It has a small heater that helps it react with gas', 'The board is overheating', 'It’s broken'], correct: 0, why: 'The heater is how this kind of sensor works; it needs a few minutes to stabilise.' },
  ],
  parking: [
    { q: 'digitalWrite(GRN, cm > 30) works because…', a: ['A comparison is 1 (true) or 0 (false)', 'digitalWrite accepts distances', 'It only works for green'], correct: 0, why: 'true is HIGH and false is LOW.' },
    { q: 'What does && mean?', a: ['Both conditions must be true', 'Either condition', 'Add the numbers'], correct: 0, why: 'cm > 15 && cm <= 30 is only true between 15 and 30.' },
  ],
};

/** Shuffle answers per question, but the same way every time for a lesson. */
export function answerOrder(lessonId: string, qi: number, n: number): number[] {
  let seed = [...`${lessonId}${qi}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const j = seed % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

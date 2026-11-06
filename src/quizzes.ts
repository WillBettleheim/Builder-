// "Check your understanding" questions, two per lesson.

export interface Question { q: string; a: string[]; correct: number; why: string }

export const QUIZZES: Record<string, Question[]> = {
  'robot-deliver': [
    { q: 'How does this robot know how far it has driven?', a: ['By timing: speed × time', 'The gripper measures it', 'It can’t move a set distance'], correct: 0, why: 'Without encoders, a robot estimates distance from how fast it goes and for how long.' },
    { q: 'What does grip.write(20) do?', a: ['Closes the jaws', 'Opens the jaws', 'Drives 20 cm'], correct: 0, why: 'Below 40° the jaws close around the cube; above 70° they open.' },
  ],
  'robot-compass': [
    { q: 'The robot faces 350° and wants 10°. Which way, and how far?', a: ['Right, 20°', 'Left, 340°', 'Right, 340°'], correct: 0, why: 'Headings wrap around at 360, so the short way from 350 to 10 is 20° to the right.' },
    { q: 'Which heading is west?', a: ['270°', '90°', '180°'], correct: 0, why: 'Going clockwise from north: 90 east, 180 south, 270 west.' },
  ],
  'robot-colors': [
    { q: 'A pad reads R 890, G 780, B 150. What colour is it?', a: ['Yellow', 'Red', 'Blue'], correct: 0, why: 'Red and green light together look yellow; blue is low.' },
    { q: 'Why print a colour only when it changes?', a: ['So each pad is named once, not hundreds of times', 'The sensor needs a rest', 'Serial can only print once'], correct: 0, why: 'loop() runs many times while the robot crosses a pad. Remembering the last colour avoids repeats.' },
  ],
  'bolt-hello': [
    { q: 'What does head.write(180) do to Bolt?', a: ['Turns its head to look left', 'Drives it forward', 'Lights its face'], correct: 0, why: 'The head sits on a servo: 90 is straight ahead, 180 is left and 0 is right.' },
    { q: 'Why call face.shutdown(0, false) first?', a: ['The LED matrix chip starts asleep', 'It turns the robot off', 'It clears the servo'], correct: 0, why: 'The MAX7219 chip powers up asleep, so nothing shows until you wake it.' },
  ],
  'bolt-follow': [
    { q: 'What is the dead band for?', a: ['So the robot rests instead of twitching around one exact distance', 'To save the wheels from wearing out', 'To make the sensor more accurate'], correct: 0, why: 'With a range where it does nothing, Bolt settles down. With one exact target, it would hunt back and forth for ever.' },
    { q: 'The block is 8 cm away. What should Bolt do?', a: ['Back away', 'Drive forward', 'Turn its head'], correct: 0, why: 'Under 12 cm is too close, so it reverses until it’s back in the dead band.' },
  ],
  'bolt-scan': [
    { q: 'Why delay() after head.write()?', a: ['The servo needs time to turn before you measure', 'The sensor only works after a pause', 'To make Bolt look thoughtful'], correct: 0, why: 'write() only sets the target. Measure too soon and you’re still reading the old direction.' },
    { q: 'left is 40 and right is 12. Which way should Bolt turn?', a: ['Left', 'Right', 'Neither'], correct: 0, why: 'The bigger number means more open space.' },
  ],
  'bolt-moods': [
    { q: 'Why compare scared with wasScared?', a: ['To act only at the moment the mood changes', 'To measure distance twice', 'To slow down loop()'], correct: 0, why: 'loop() runs many times a second. Acting only on the change gives one squeak, not hundreds.' },
    { q: 'How is each row of the face stored?', a: ['As one byte: each bit is one LED', 'As a colour', 'As a word of text'], correct: 0, why: '0b01100110 lights the LEDs where the 1s are, so 8 bytes draw a whole picture.' },
  ],
  'bumper-bot': [
    { q: 'With INPUT_PULLUP, what does the bumper read when it hits a wall?', a: ['LOW', 'HIGH', '1023'], correct: 0, why: 'Pressing the lever connects the pin to GND, pulling it LOW.' },
    { q: 'What does a bumper tell you that an ultrasonic sensor doesn’t?', a: ['That the robot has actually touched something', 'How far away the wall is', 'The colour of the wall'], correct: 0, why: 'A bumper is a last line of defence: it only knows about a real touch, not distance.' },
  ],
  'phone-robot': [
    { q: 'What travels from the phone to the robot when you press ▲?', a: ['The letter F', 'A picture of an arrow', 'A voltage on pin 5'], correct: 0, why: 'The app sends a character over Bluetooth; the sketch decides what each character means.' },
    { q: 'Why does the robot keep going after you let go of ▲?', a: ['drive() keeps the motors running until another command changes them', 'The phone keeps sending F', 'Motors can’t stop'], correct: 0, why: 'The sketch only changes the motors when a new letter arrives, so ■ (S) is needed to stop.' },
  ],
  odometry: [
    { q: 'Why count pulses with an interrupt?', a: ['Pulses are fast and short; an interrupt never misses one', 'Interrupts make the robot faster', 'digitalRead() doesn’t work on pin 2'], correct: 0, why: 'loop() might be busy in delay() when a pulse happens. The interrupt counts it anyway.' },
    { q: 'One wheel turn is 20 pulses and the wheel is 20 cm around. How far is 50 pulses?', a: ['About 50 cm', 'About 20 cm', 'About 1000 cm'], correct: 0, why: 'Each pulse is 1/20 of a turn, about 1 cm, so 50 pulses is about 50 cm.' },
  ],
  'light-seeker': [
    { q: 'The right eye reads 600 and the left 200. Where is the light?', a: ['To the right', 'To the left', 'Behind'], correct: 0, why: 'The eye facing the light sees the most, so steer toward the brighter side.' },
    { q: 'How does the robot know it has arrived?', a: ['Both eyes read very bright', 'The beacon sends a message', 'It counts to ten'], correct: 0, why: 'Light gets stronger as you get closer, so high readings on both eyes mean it’s right there.' },
  ],
  patrol: [
    { q: 'Why return right after drive(0, 0) when blocked?', a: ['To skip the line-following code so the robot stays stopped', 'return switches the board off', 'It resets the sensor'], correct: 0, why: 'return ends this pass of loop(); next time round it checks the obstacle again.' },
    { q: 'What does the IR obstacle sensor’s OUT read when something is close?', a: ['LOW', 'HIGH', 'A distance in cm'], correct: 0, why: 'It’s active-low: OUT drops LOW (and its light comes on) when it sees something.' },
  ],
  'robot-drive': [
    { q: 'Why does the robot need a motor driver?', a: ['A board pin can’t supply enough current for a motor', 'Motors only understand Bluetooth', 'It makes the code shorter'], correct: 0, why: 'Pins give a few milliamps; motors need far more. The driver switches the battery power on the board’s command.' },
    { q: 'How does a 2-wheel robot turn on the spot?', a: ['One wheel forward, the other backward', 'Both wheels forward faster', 'It can’t turn'], correct: 0, why: 'Spinning the wheels in opposite directions rotates it around its middle.' },
  ],
  'line-follow': [
    { q: 'Only the left eye sees the line. Which way should the robot turn?', a: ['Left', 'Right', 'Stop'], correct: 0, why: 'The line has curved under the left eye, so steer left to get back over it.' },
    { q: 'Why remember which way the robot last turned?', a: ['So it can search the right way when it loses the line', 'To save battery', 'The sensor needs it'], correct: 0, why: 'If both eyes lose the line on a bend, it almost certainly went off the side you were turning toward.' },
  ],
  avoider: [
    { q: 'What does pulseIn() measure for the ultrasonic sensor?', a: ['How long the echo takes to come back', 'The colour of the wall', 'The robot’s speed'], correct: 0, why: 'Sound travels about 1 cm every 29 µs, there and back: microseconds ÷ 58 gives centimetres.' },
    { q: 'Why back up before turning away from a wall?', a: ['To make room so the robot doesn’t clip the wall while turning', 'Backing up is faster', 'The sensor only works in reverse'], correct: 0, why: 'A turning robot sweeps a circle; a little space first keeps its corners clear.' },
  ],
  'arm-pick': [
    { q: 'Why put delay() between arm moves?', a: ['Servos take time to reach a new angle', 'The board would reset', 'Servos only work every second'], correct: 0, why: 'write() only sets the target. The servo needs a moment to swing there before the next step.' },
    { q: 'What does the base servo do?', a: ['Turns the whole arm left and right', 'Opens the claw', 'Bends the elbow'], correct: 0, why: 'The base rotates the arm around, so base 180 points it somewhere else entirely.' },
  ],
  remote: [
    { q: 'How does a TV remote send a button press?', a: ['A fast pattern of invisible infrared flashes', 'Radio waves like Wi-Fi', 'A tiny sound'], correct: 0, why: 'Each button blinks its own pattern of infrared light; the receiver turns it back into a code number.' },
    { q: 'Why call IrReceiver.resume() after reading a code?', a: ['So the receiver is ready for the next button', 'To turn the LED off', 'It sends the code back'], correct: 0, why: 'decode() holds on to one code until you resume(); then it can catch the next one.' },
  ],
  scoreboard: [
    { q: 'Why does score++ in loop() jump by hundreds while the button is held?', a: ['loop() runs thousands of times a second while it stays down', 'The button bounces 100 times', 'The display adds extra'], correct: 0, why: 'Count the change from up to down (an edge), not every loop the button is down.' },
    { q: 'What does display.showNumberDec(7, true) show?', a: ['0007', '   7', '7000'], correct: 0, why: 'The second argument asks for leading zeros.' },
  ],
  phone: [
    { q: 'Why use SoftwareSerial for the Bluetooth module?', a: ['Pins 0 and 1 are busy talking to the computer', 'Bluetooth needs analog pins', 'It makes the LED brighter'], correct: 0, why: 'SoftwareSerial creates an extra serial port on any two pins, leaving the USB serial free.' },
    { q: 'The module’s TXD pin connects to the board’s…', a: ['RX pin', 'TX pin', '5V pin'], correct: 0, why: 'Transmit goes to receive: what the module sends, the board receives.' },
  ],
  logger: [
    { q: 'What does FILE_WRITE do in SD.open("log.txt", FILE_WRITE)?', a: ['Adds new text to the end of the file (and creates it if needed)', 'Deletes the file', 'Only reads it'], correct: 0, why: 'Opening for writing appends, so every reading is kept.' },
    { q: 'Why is “3,24.50” a useful line format?', a: ['It’s CSV: spreadsheets split it into columns', 'It uses less battery', 'SD cards need commas'], correct: 0, why: 'Comma-separated values open straight into a spreadsheet as a table.' },
  ],
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

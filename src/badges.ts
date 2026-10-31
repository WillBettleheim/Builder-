// Achievement badges: small rewards for trying things.

export interface Badge { id: string; icon: string; name: string; how: string }

export const BADGES: Badge[] = [
  { id: 'first-run', icon: '⚡', name: 'First Spark', how: 'Run your first sketch' },
  { id: 'first-wire', icon: '🔌', name: 'Wired Up', how: 'Connect a wire yourself' },
  { id: 'wire-25', icon: '🧶', name: 'Wire Wizard', how: 'Connect 25 wires' },
  { id: 'short', icon: '💥', name: 'Oops, Short!', how: 'Wire 5V straight to GND (then learn why not to)' },
  { id: 'fixed', icon: '🔁', name: 'Never Give Up', how: 'Fix an error and run again' },
  { id: 'first-lesson', icon: '🎓', name: 'Graduate', how: 'Finish a lesson' },
  { id: 'five-lessons', icon: '🚀', name: 'On a Roll', how: 'Finish 5 lessons' },
  { id: 'basics', icon: '🧱', name: 'Solid Basics', how: 'Finish every Basics lesson' },
  { id: 'projects', icon: '🛠️', name: 'Project Pro', how: 'Finish 3 projects' },
  { id: 'all-lessons', icon: '🏆', name: 'Master Builder', how: 'Finish every lesson' },
  { id: 'quiz-10', icon: '🧠', name: 'Quiz Whiz', how: 'Get 10 quiz answers right first try' },
  { id: 'debugger', icon: '🐞', name: 'Bug Hunter', how: 'Step through code one line at a time' },
  { id: 'plotter', icon: '📈', name: 'Data Scientist', how: 'Graph live data in the Plotter' },
  { id: 'inventor', icon: '💡', name: 'Inventor', how: 'Build a sandbox project with 6 or more parts' },
  { id: 'curious', icon: '🙋', name: 'Curious Mind', how: 'Ask Nova a question' },
  { id: 'sharer', icon: '🔗', name: 'Show & Tell', how: 'Share a project link' },
  { id: 'meter', icon: '🔎', name: 'Meter Reader', how: 'Measure a voltage with the multimeter' },
  { id: 'schematic', icon: '📐', name: 'Diagram Reader', how: 'Open the schematic view' },
  { id: 'maker', icon: '📋', name: 'Maker', how: 'Open the "Build it for real" sheet' },
];

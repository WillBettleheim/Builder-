// Nova, Builder's instructor: an original full-body field-engineer character drawn in SVG.
// Expressions are swapped by setting data-mood on the <svg>; CSS shows the right mouth/brows.

export type Mood = 'happy' | 'talk' | 'think' | 'concern' | 'wow' | 'cheer';

const OUT = '#141218'; // line colour
const SKIN = '#f3d4c0';
const SKIN_SHADE = '#e2b39a';
const HAIR = '#1c1a21';
const HAIR_LIGHT = '#3c3846';
const STREAK = '#22b3ab';
const JACKET = '#2d3139';
const JACKET_DARK = '#22252b';
const PIPING = '#1fb5ad';
const TROUSERS = '#1e2229';
const BOOT = '#121317';
const GLOVE = '#1a1b20';
const BELT = '#3b3029';

export function instructorSvg(): string {
  return `
<svg class="ins-art" viewBox="0 0 220 450" data-mood="happy" aria-hidden="true">
  <defs>
    <linearGradient id="nova-hair" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${HAIR_LIGHT}"/><stop offset="0.4" stop-color="${HAIR}"/><stop offset="1" stop-color="#0f0e12"/>
    </linearGradient>
    <radialGradient id="nova-iris" cx="0.5" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#f3c46a"/><stop offset="0.6" stop-color="#b9772a"/><stop offset="1" stop-color="#5a3510"/>
    </radialGradient>
    <linearGradient id="nova-jacket" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${JACKET_DARK}"/><stop offset="0.45" stop-color="${JACKET}"/><stop offset="1" stop-color="${JACKET_DARK}"/>
    </linearGradient>
    <linearGradient id="nova-boot" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${BOOT}"/><stop offset="0.5" stop-color="#2c2e35"/><stop offset="1" stop-color="${BOOT}"/>
    </linearGradient>
    <linearGradient id="nova-screen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f4a47"/><stop offset="1" stop-color="#082725"/>
    </linearGradient>
  </defs>

  <g class="ins-body">
    <!-- short asymmetric bob, behind the head -->
    <path d="M78 70 C74 38 96 24 115 24 C138 24 156 40 152 72 C154 92 154 106 148 118 L118 122 L82 132 C74 116 74 92 78 70 Z" fill="url(#nova-hair)" stroke="${OUT}" stroke-width="1.5"/>

    <!-- trousers and knee boots -->
    <path d="M86 244 C84 290 88 330 92 360 L111 360 C111 330 112 290 113 262 L113 244 Z" fill="${TROUSERS}" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M113 244 L113 262 C114 290 115 330 115 360 L134 360 C138 330 142 290 140 244 Z" fill="${TROUSERS}" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M97 300 q5 3 10 0 M119 300 q5 3 10 0" stroke="#353a44" stroke-width="1.4" fill="none"/>
    <path d="M90 348 L112 348 L111 420 C111 429 106 433 98 433 L88 433 C83 433 83 426 88 420 Z" fill="url(#nova-boot)" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M114 348 L136 348 L137 420 C142 426 141 433 135 433 L124 433 C118 433 116 429 116 420 Z" fill="url(#nova-boot)" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M90 355 L112 355 M114 355 L136 355" stroke="${PIPING}" stroke-width="2.2"/>
    <path d="M96 368 L96 420 M130 368 L130 420" stroke="#3a3c44" stroke-width="1.2"/>

    <!-- tech jacket with a high collar -->
    <path d="M77 140 C69 160 71 190 79 214 C83 226 87 236 87 246 L139 246 C139 236 143 226 147 214 C155 190 157 160 149 140 C139 132 127 130 113 130 C99 130 87 132 77 140 Z" fill="url(#nova-jacket)" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M99 110 L127 110 L131 138 L95 138 Z" fill="${JACKET}" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M99 118 L127 118" stroke="${PIPING}" stroke-width="1.6"/>
    <!-- diagonal zip and piping -->
    <path d="M122 138 C118 170 110 206 104 246" stroke="${PIPING}" stroke-width="2.2" fill="none"/>
    <path d="M120 138 C116 170 108 206 102 246" stroke="#14161a" stroke-width="1.2" fill="none"/>
    <path d="M84 146 C92 152 98 166 100 182 M142 146 C136 154 132 166 132 180" stroke="${PIPING}" stroke-width="1.4" fill="none" opacity="0.8"/>
    <rect x="128" y="166" width="12" height="9" rx="2" fill="${JACKET_DARK}" stroke="${OUT}" stroke-width="1"/>
    <rect x="131" y="164" width="6" height="3" rx="1" fill="${PIPING}"/>

    <!-- utility belt: screwdriver, pouch and multimeter -->
    <rect x="85" y="236" width="56" height="9" rx="2" fill="${BELT}" stroke="${OUT}" stroke-width="1.2"/>
    <rect x="108" y="235" width="11" height="11" rx="2" fill="${PIPING}" stroke="${OUT}" stroke-width="1"/>
    <rect x="111" y="238" width="5" height="5" rx="1" fill="#0b4f4b"/>
    <rect x="88" y="242" width="13" height="15" rx="2" fill="#4a3c32" stroke="${OUT}" stroke-width="1"/>
    <path d="M88 247 L101 247" stroke="${OUT}" stroke-width="0.8"/>
    <g transform="rotate(18 84 248)">
      <rect x="81" y="238" width="6" height="14" rx="2" fill="#f2b632" stroke="${OUT}" stroke-width="0.9"/>
      <rect x="83.2" y="252" width="1.8" height="16" fill="#c9ccd2" stroke="${OUT}" stroke-width="0.5"/>
    </g>
    <g transform="rotate(-6 138 254)">
      <rect x="131" y="244" width="14" height="20" rx="3" fill="#f2b632" stroke="${OUT}" stroke-width="1"/>
      <rect x="133.5" y="247" width="9" height="5" rx="1" fill="#1d2b2a"/>
      <text x="138" y="251" font-size="3.6" text-anchor="middle" fill="#7ef0e6" font-family="monospace">5.00</text>
      <circle cx="138" cy="258" r="2.6" fill="#2a2a2e"/>
    </g>

    <!-- neck -->
    <path d="M105 100 L105 112 L121 112 L121 100 Z" fill="${SKIN_SHADE}"/>

    <!-- tablet arm -->
    <path d="M147 140 C159 152 163 178 161 204 L150 206 C150 186 146 166 140 152 Z" fill="${JACKET}" stroke="${OUT}" stroke-width="1.4"/>
    <g transform="rotate(-9 134 222)">
      <rect x="110" y="192" width="44" height="60" rx="5" fill="#1b1d22" stroke="${OUT}" stroke-width="1.4"/>
      <rect x="114" y="196" width="36" height="52" rx="2.5" fill="url(#nova-screen)"/>
      <path d="M118 206 h10 v8 h12 M118 222 h6 v-6 h14 v14 M122 238 h22" stroke="${PIPING}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <circle cx="140" cy="214" r="2" fill="#7ef0e6"/><circle cx="138" cy="230" r="2" fill="#7ef0e6"/><circle cx="144" cy="238" r="2" fill="#f2b632"/>
    </g>
    <path d="M161 200 C157 212 149 220 137 223 L135 213 C143 211 149 205 151 196 Z" fill="${JACKET}" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M150 196 L161 200 L160 206 L149 203 Z" fill="${PIPING}" stroke="${OUT}" stroke-width="0.9"/>
    <path d="M137 213 C129 211 125 218 128 224 C131 229 139 228 140 222 Z" fill="${GLOVE}" stroke="${OUT}" stroke-width="1.2"/>

    <!-- face -->
    <path d="M81 72 C81 49 96 38 113 38 C131 38 145 49 145 72 C145 95 133 113 114 120 C95 113 81 95 81 72 Z" fill="${SKIN}" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M86 96 C92 108 102 116 114 120 C102 112 94 104 90 94 Z" fill="${SKIN_SHADE}" opacity="0.5"/>
    <ellipse cx="95" cy="98" rx="6" ry="2.6" fill="#ff8a8a" opacity="0.28" class="ins-blush"/>
    <ellipse cx="131" cy="98" rx="6" ry="2.6" fill="#ff8a8a" opacity="0.28" class="ins-blush"/>

    <g class="ins-eyes">${eye(99, -1)}${eye(127, 1)}</g>
    <g class="ins-brows ins-brows-normal" stroke="${HAIR}" stroke-width="1.8" stroke-linecap="round" fill="none">
      <path d="M90 70 Q99 64.5 107 67.5"/><path d="M119 67.5 Q128 64.5 136 69"/>
    </g>
    <g class="ins-brows ins-brows-worried" stroke="${HAIR}" stroke-width="1.8" stroke-linecap="round" fill="none">
      <path d="M89 70 Q99 70 108 74"/><path d="M118 74 Q128 70 137 70"/>
    </g>

    <path d="M113 96 l-1.2 3.4" stroke="${SKIN_SHADE}" stroke-width="1.8" stroke-linecap="round"/>
    <g class="ins-mouth" stroke="#7e2f3b" stroke-width="1.7" stroke-linecap="round" fill="none">
      <path class="m-happy" d="M105 106 Q113 112.5 122 104.5"/>
      <path class="m-talk" d="M106 106 Q114 116 122 105 Z" fill="#a8414f"/>
      <path class="m-think" d="M108 108.5 Q114 107 120 107.5"/>
      <path class="m-concern" d="M107 110 Q114 105.5 121 110"/>
      <ellipse class="m-wow" cx="114" cy="108" rx="3.2" ry="4" fill="#a8414f"/>
      <path class="m-cheer" d="M104 104 Q114 118 124 103 Z" fill="#a8414f"/>
    </g>

    <!-- side-swept bangs with a teal streak -->
    <path d="M80 80 C74 44 96 28 116 28 C138 28 156 42 150 74 C146 64 140 56 132 52 C128 60 120 66 108 70 C100 73 92 77 86 86 C88 78 88 72 92 66 C86 70 82 74 80 80 Z" fill="url(#nova-hair)" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M80 76 C74 96 76 116 84 134 C88 116 88 96 87 84 Z" fill="${HAIR}" stroke="${OUT}" stroke-width="1.3"/>
    <path d="M146 70 C152 88 152 104 146 118 C142 104 140 90 141 78 Z" fill="${HAIR}" stroke="${OUT}" stroke-width="1.3"/>
    <path d="M138 34 C146 44 150 56 148 72" stroke="${STREAK}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M147 82 C150 94 150 104 147 114" stroke="${STREAK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M98 36 Q114 30 130 36" stroke="#5a5566" stroke-width="2.2" fill="none" opacity="0.7" stroke-linecap="round"/>

    <!-- headset with mic -->
    <path d="M80 70 C78 30 148 28 148 70" stroke="${GLOVE}" stroke-width="3.6" fill="none" stroke-linecap="round"/>
    <rect x="143" y="72" width="11" height="17" rx="4" fill="${GLOVE}" stroke="${OUT}" stroke-width="1.2"/>
    <circle cx="148.5" cy="80.5" r="2" fill="${PIPING}"/>
    <path d="M146 88 C142 102 134 108 124 109" stroke="${GLOVE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <circle cx="123" cy="109" r="2.4" fill="${GLOVE}"/>
  </g>

  <!-- pointing arm (moves while she talks) -->
  <g class="ins-arm">
    <path d="M80 140 C70 150 64 170 64 192 L76 194 C76 176 80 162 88 150 Z" fill="${JACKET}" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M64 190 C58 174 56 156 58 142 L70 141 C70 156 72 172 77 186 Z" fill="${JACKET}" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M57 146 L71 144 L71 150 L57 152 Z" fill="${PIPING}" stroke="${OUT}" stroke-width="0.9"/>
    <path d="M57 140 C54 130 60 124 67 127 L72 138 C70 145 61 147 57 140 Z" fill="${GLOVE}" stroke="${OUT}" stroke-width="1.2"/>
    <path d="M63 128 L60 110 C59.5 106 64.5 105 65 109 L68 128" fill="${SKIN}" stroke="${OUT}" stroke-width="1.2"/>
    <path d="M59.8 112 L64.8 111" stroke="${GLOVE}" stroke-width="2.4"/>
  </g>
</svg>`;
}

/** Large almond-shaped eye; dx nudges the gaze sideways. */
function eye(cx: number, dx: number): string {
  return `
    <g class="ins-eye">
      <path d="M${cx - 10} 86 Q${cx - 1} 73 ${cx + 10} 82 Q${cx + 2} 95 ${cx - 10} 86 Z" fill="#ffffff"/>
      <ellipse cx="${cx + dx}" cy="85" rx="6.2" ry="7" fill="url(#nova-iris)"/>
      <ellipse cx="${cx + dx}" cy="85.6" rx="2.7" ry="3.4" fill="#1c0f05"/>
      <circle cx="${cx + dx + 2}" cy="82.4" r="2" fill="#ffffff"/>
      <circle cx="${cx + dx - 2.2}" cy="88.6" r="0.9" fill="#ffffff" opacity="0.8"/>
      <path d="M${cx - 11} 85 Q${cx - 1} 72 ${cx + 11} 81 L${cx + 14} 78" stroke="${OUT}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M${cx - 7} 90.5 Q${cx} 93.5 ${cx + 8} 89" stroke="${OUT}" stroke-width="0.8" fill="none" opacity="0.6"/>
    </g>`;
}

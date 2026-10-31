// Nova, Builder's instructor: an original field-engineer character, drawn in SVG
// in a semi-realistic painted style (soft light from the upper left, teal rim light).
// Expressions are swapped by setting data-mood on the <svg>; CSS shows the right mouth/brows.

export type Mood = 'happy' | 'talk' | 'think' | 'concern' | 'wow' | 'cheer';

const LINE = '#1b1418'; // soft dark line
const LIP = '#b85f68';
const LIP_DARK = '#8e3f4a';
const MOUTH = '#4a1a22';
const TEAL = '#1fb5ad';

export function instructorSvg(): string {
  return `
<svg class="ins-art" viewBox="0 0 220 480" data-mood="happy" aria-hidden="true">
  <defs>
    <filter id="nv-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6"/></filter>
    <filter id="nv-softer" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>
    <radialGradient id="nv-skin" cx="0.38" cy="0.36" r="0.75">
      <stop offset="0" stop-color="#fbe4d6"/><stop offset="0.55" stop-color="#efc9b3"/><stop offset="1" stop-color="#d6a389"/>
    </radialGradient>
    <linearGradient id="nv-neck" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c98f75"/><stop offset="1" stop-color="#e3b49c"/>
    </linearGradient>
    <linearGradient id="nv-hair" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#3a3240"/><stop offset="0.35" stop-color="#1d1820"/><stop offset="1" stop-color="#0c0a0e"/>
    </linearGradient>
    <radialGradient id="nv-iris" cx="0.45" cy="0.4" r="0.6">
      <stop offset="0" stop-color="#e2b25e"/><stop offset="0.55" stop-color="#9a6227"/><stop offset="1" stop-color="#3d2410"/>
    </radialGradient>
    <linearGradient id="nv-jacket" x1="0" y1="0" x2="1" y2="0.25">
      <stop offset="0" stop-color="#40454f"/><stop offset="0.35" stop-color="#2e323a"/><stop offset="0.8" stop-color="#1f2228"/><stop offset="1" stop-color="#2a3a3c"/>
    </linearGradient>
    <linearGradient id="nv-sleeve" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#454a55"/><stop offset="0.6" stop-color="#2b2f36"/><stop offset="1" stop-color="#1c1f24"/>
    </linearGradient>
    <linearGradient id="nv-trousers" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2a2f38"/><stop offset="0.4" stop-color="#1d2128"/><stop offset="1" stop-color="#14171c"/>
    </linearGradient>
    <linearGradient id="nv-leather" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0d0e11"/><stop offset="0.28" stop-color="#3b3e46"/><stop offset="0.42" stop-color="#16171b"/><stop offset="1" stop-color="#0a0b0d"/>
    </linearGradient>
    <linearGradient id="nv-belt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5a4638"/><stop offset="1" stop-color="#2f241d"/>
    </linearGradient>
    <linearGradient id="nv-screen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#13605b"/><stop offset="1" stop-color="#062321"/>
    </linearGradient>
    <linearGradient id="nv-metal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e9ecef"/><stop offset="0.5" stop-color="#8d939c"/><stop offset="1" stop-color="#d4d8dd"/>
    </linearGradient>
    <clipPath id="nv-face-clip">
      <path d="M93 52 C93 37 101 29 112 29 C124 29 132 37 132 52 C132 66 128 77 120 84 C117 87 114.5 88.5 112 88.5 C109.5 88.5 107 87 104 84 C96 77 93 66 93 52 Z"/>
    </clipPath>
  </defs>

  <!-- soft ground shadow -->
  <ellipse cx="112" cy="463" rx="40" ry="6" fill="#000" opacity="0.28" filter="url(#nv-softer)"/>

  <g class="ins-body">
    <!-- hair, back layer: a sleek asymmetric bob -->
    <path d="M90 50 C86 26 102 16 114 16 C130 16 142 28 137 52 C139 66 140 78 136 90 C130 94 124 92 120 88 L104 88 C100 96 92 100 86 98 C84 82 86 64 90 50 Z" fill="url(#nv-hair)"/>

    <!-- legs: tapered trousers into knee boots -->
    <path d="M90 224 C88 270 92 320 95 346 L111 346 C111 318 112 276 113 244 L113 224 Z" fill="url(#nv-trousers)"/>
    <path d="M113 224 L113 244 C114 276 115 318 115 346 L131 346 C134 320 137 270 135 224 Z" fill="url(#nv-trousers)"/>
    <path d="M100 236 C99 270 100 300 102 330" stroke="#3a404b" stroke-width="2" fill="none" opacity="0.6" filter="url(#nv-soft)"/>
    <path d="M123 236 C124 270 124 300 123 330" stroke="#3a404b" stroke-width="1.6" fill="none" opacity="0.4" filter="url(#nv-soft)"/>
    <path d="M94 330 L112 330 L111 438 C111 448 107 452 99 452 L91 452 C86 452 85 446 89 440 L93 420 Z" fill="url(#nv-leather)"/>
    <path d="M114 330 L132 330 L133 420 L137 440 C141 446 140 452 135 452 L126 452 C119 452 116 448 116 438 Z" fill="url(#nv-leather)"/>
    <path d="M97 345 C96 380 97 410 98 436 M118 345 C118 380 119 410 120 436" stroke="#6b707a" stroke-width="1.2" fill="none" opacity="0.55"/>
    <path d="M94 334 L112 334 M114 334 L132 334" stroke="${TEAL}" stroke-width="1.6" opacity="0.9"/>
    <path d="M89 446 L111 446 M116 446 L139 446" stroke="#000" stroke-width="2"/>

    <!-- jacket body -->
    <path d="M80 112 C72 130 72 160 80 186 C84 198 88 208 88 226 L136 226 C136 208 140 198 144 186 C152 160 152 130 144 112 C134 104 124 102 112 102 C100 102 90 104 80 112 Z" fill="url(#nv-jacket)"/>
    <!-- fabric folds and form shading -->
    <path d="M86 150 C96 160 106 162 112 160" stroke="#1a1d22" stroke-width="3" fill="none" opacity="0.55" filter="url(#nv-soft)"/>
    <path d="M90 196 C100 204 122 204 134 196" stroke="#16181d" stroke-width="3" fill="none" opacity="0.6" filter="url(#nv-soft)"/>
    <path d="M84 122 C88 140 92 156 98 166" stroke="#5c626e" stroke-width="2.4" fill="none" opacity="0.5" filter="url(#nv-soft)"/>
    <path d="M144 118 C148 146 146 170 140 192" stroke="${TEAL}" stroke-width="2" fill="none" opacity="0.35" filter="url(#nv-soft)"/>
    <!-- asymmetric zip with teeth, and teal piping -->
    <path d="M121 108 C117 140 110 182 106 226" stroke="#0f1114" stroke-width="2.6" fill="none"/>
    <path d="M121 108 C117 140 110 182 106 226" stroke="#9aa0a8" stroke-width="1.4" fill="none" stroke-dasharray="1 1.4"/>
    <path d="M124 108 C120 140 113 182 109 226" stroke="${TEAL}" stroke-width="1.2" fill="none" opacity="0.9"/>
    <path d="M86 118 C94 126 100 140 102 154 M140 118 C134 128 131 140 131 152" stroke="${TEAL}" stroke-width="1" fill="none" opacity="0.7"/>
    <rect x="127" y="140" width="12" height="9" rx="1.5" fill="#1d2025" stroke="#0e1013" stroke-width="0.8"/>
    <rect x="130" y="138.5" width="6" height="2.4" rx="1" fill="${TEAL}"/>

    <!-- belt: leather, brushed buckle, pouch, screwdriver and multimeter -->
    <rect x="88" y="212" width="48" height="9" rx="1.5" fill="url(#nv-belt)"/>
    <path d="M88 213.5 L136 213.5" stroke="#7a6252" stroke-width="0.6" opacity="0.8"/>
    <rect x="107" y="211" width="11" height="11" rx="1.5" fill="url(#nv-metal)" stroke="#5b6068" stroke-width="0.6"/>
    <rect x="110" y="214" width="5" height="5" rx="0.8" fill="#2a2f35"/>
    <rect x="90" y="218" width="12" height="14" rx="2" fill="#3d2f26"/>
    <path d="M90 222.5 L102 222.5" stroke="#1c1511" stroke-width="0.8"/>
    <g transform="rotate(16 88 224)">
      <rect x="85" y="214" width="5.5" height="13" rx="2" fill="#e0a52c"/>
      <rect x="85" y="214" width="2" height="13" rx="1" fill="#f6cf6c" opacity="0.8"/>
      <rect x="87" y="227" width="1.6" height="14" fill="url(#nv-metal)"/>
    </g>
    <g transform="rotate(-5 134 230)">
      <rect x="128" y="221" width="13" height="19" rx="2.5" fill="#e0a52c"/>
      <rect x="128" y="221" width="13" height="4" rx="2" fill="#f2c35a"/>
      <rect x="130.3" y="224" width="8.4" height="5" rx="0.8" fill="#14211f"/>
      <text x="134.5" y="228" font-size="3.4" text-anchor="middle" fill="#8ff3e9" font-family="monospace">5.00</text>
      <circle cx="134.5" cy="234.5" r="2.4" fill="#26262a"/>
    </g>

    <!-- tablet arm: sleeve, tablet against her hip, gloved hand -->
    <path d="M142 112 C154 124 158 150 156 176 L145 178 C145 158 141 138 136 124 Z" fill="url(#nv-sleeve)"/>
    <g transform="rotate(-8 132 196)">
      <rect x="110" y="168" width="42" height="56" rx="5" fill="#16181c"/>
      <rect x="110" y="168" width="42" height="56" rx="5" fill="none" stroke="#3b3f47" stroke-width="0.8"/>
      <rect x="113.5" y="171.5" width="35" height="49" rx="2.5" fill="url(#nv-screen)"/>
      <path d="M117 181 h9 v7 h12 M117 196 h6 v-6 h13 v13 M121 211 h21" stroke="${TEAL}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.95"/>
      <circle cx="138" cy="188" r="1.8" fill="#8ff3e9"/><circle cx="136" cy="203" r="1.8" fill="#8ff3e9"/><circle cx="142" cy="211" r="1.8" fill="#f2c35a"/>
      <path d="M115 173 L130 173 L120 190 Z" fill="#ffffff" opacity="0.07"/>
    </g>
    <path d="M156 172 C152 184 144 192 132 195 L130 186 C138 184 144 178 146 170 Z" fill="url(#nv-sleeve)"/>
    <path d="M145 169 L156 172 L155 177 L144 175 Z" fill="${TEAL}" opacity="0.85"/>
    <path d="M131 185 C124 184 120 190 123 196 C126 201 134 200 135 194 Z" fill="#17181c"/>
    <path d="M125 188 C127 186 130 186 132 188" stroke="#4a4d56" stroke-width="0.9" fill="none"/>

    <!-- neck and high collar -->
    <path d="M105 80 L105 98 Q112 102 119 98 L119 80 Z" fill="url(#nv-neck)"/>
    <path d="M100 92 L124 92 L127 110 L97 110 Z" fill="#2c3037"/>
    <path d="M100 92 L124 92" stroke="#4d535e" stroke-width="1"/>
    <path d="M98.5 100 L125.5 100" stroke="${TEAL}" stroke-width="1"/>

    <!-- face, with painted shading -->
    <path d="M93 52 C93 37 101 29 112 29 C124 29 132 37 132 52 C132 66 128 77 120 84 C117 87 114.5 88.5 112 88.5 C109.5 88.5 107 87 104 84 C96 77 93 66 93 52 Z" fill="url(#nv-skin)"/>
    <g clip-path="url(#nv-face-clip)">
      <ellipse cx="128" cy="62" rx="7" ry="20" fill="#b9806a" opacity="0.45" filter="url(#nv-softer)"/>
      <path d="M96 70 C100 80 106 86 112 88" stroke="#c48a73" stroke-width="5" fill="none" opacity="0.35" filter="url(#nv-softer)"/>
      <ellipse cx="112" cy="36" rx="22" ry="6" fill="#7a5040" opacity="0.4" filter="url(#nv-softer)"/>
      <ellipse class="ins-blush" cx="102" cy="66" rx="5" ry="3" fill="#e88f8a" opacity="0.32" filter="url(#nv-soft)"/>
      <ellipse class="ins-blush" cx="123" cy="66" rx="4.5" ry="3" fill="#e88f8a" opacity="0.26" filter="url(#nv-soft)"/>
      <ellipse cx="104" cy="62.5" rx="3" ry="1.5" fill="#ffffff" opacity="0.35" filter="url(#nv-soft)"/>
      <!-- contour: under the cheekbones, along the nose bridge, chin and temple light -->
      <path d="M97 68 Q101 72 105 73" stroke="#b77d68" stroke-width="2.4" fill="none" opacity="0.35" filter="url(#nv-soft)"/>
      <path d="M127 68 Q123 72 119 73" stroke="#a46a56" stroke-width="2.6" fill="none" opacity="0.45" filter="url(#nv-soft)"/>
      <path d="M111.6 55 L111.8 64" stroke="#ffffff" stroke-width="1.2" opacity="0.35" filter="url(#nv-soft)"/>
      <ellipse cx="112" cy="84.4" rx="3.4" ry="1.6" fill="#ffffff" opacity="0.25" filter="url(#nv-soft)"/>
      <ellipse cx="99" cy="44" rx="4" ry="3" fill="#ffffff" opacity="0.18" filter="url(#nv-soft)"/>
    </g>

    <g class="ins-eyes">${eye(104, -0.5)}${eye(120, 0.5)}</g>

    <g class="ins-brows ins-brows-normal" fill="#2b2026" opacity="0.92">
      <path d="M97.6 50.2 Q102.6 47.4 108.6 48.6 L108.5 49.4 Q103 48.8 98 50.8 Z"/>
      <path d="M126.4 50.2 Q121.4 47.4 115.4 48.6 L115.5 49.4 Q121 48.8 126 50.8 Z"/>
    </g>
    <g class="ins-brows ins-brows-worried" fill="#2b2026" opacity="0.92">
      <path d="M97.6 49.8 Q103 49 108.8 47 L109 47.9 Q103.2 50 98 50.6 Z"/>
      <path d="M126.4 49.8 Q121 49 115.2 47 L115 47.9 Q120.8 50 126 50.6 Z"/>
    </g>

    <!-- nose: soft shadow side and nostrils -->
    <path d="M113.6 57 C114.4 62 115.4 66 115.6 68.4" stroke="#b9806a" stroke-width="1.6" fill="none" opacity="0.55" filter="url(#nv-soft)"/>
    <path d="M109.6 69.4 Q111.6 70.6 113.4 69.8 Q115.4 70.6 116.6 69.2" stroke="#9e6652" stroke-width="0.9" fill="none" stroke-linecap="round"/>
    <ellipse cx="112.4" cy="66.4" rx="1.4" ry="0.8" fill="#ffffff" opacity="0.5" filter="url(#nv-soft)"/>

    <!-- lips, one per mood -->
    <g class="ins-mouth">
      <g class="m-happy">
        <path d="M105.6 76 Q109 74.4 112 75.2 Q115 74.4 118.6 75.6 Q115.4 79.8 112 79.9 Q108.6 79.8 105.6 76 Z" fill="${LIP}"/>
        <path d="M105.4 75.8 Q112 78.1 118.8 75.4" stroke="${LIP_DARK}" stroke-width="0.9" fill="none" stroke-linecap="round"/>
        <ellipse cx="112.6" cy="78.2" rx="2" ry="0.5" fill="#ffffff" opacity="0.18"/>
      </g>
      <g class="m-talk">
        <path d="M106.2 75.6 Q112 73.8 117.8 75.6 Q115.6 81.6 112 81.8 Q108.4 81.6 106.2 75.6 Z" fill="${LIP}"/>
        <path d="M107.6 76.4 Q112 75.6 116.4 76.4 Q114.8 79.8 112 80 Q109.2 79.8 107.6 76.4 Z" fill="${MOUTH}"/>
        <path d="M108.4 76.5 Q112 76 115.6 76.5 L115.3 77.5 Q112 77.1 108.7 77.5 Z" fill="#f4f1ec"/>
      </g>
      <g class="m-think">
        <path d="M107 76.6 Q112 75.4 117 76 Q114.6 78.6 112 78.7 Q109.4 78.6 107 76.6 Z" fill="${LIP}"/>
        <path d="M107 76.6 Q112 77.2 117 76" stroke="${LIP_DARK}" stroke-width="0.9" fill="none" stroke-linecap="round"/>
      </g>
      <g class="m-concern">
        <path d="M106.4 77.2 Q112 75 117.6 77.2 Q115 79.6 112 79.6 Q109 79.6 106.4 77.2 Z" fill="${LIP}"/>
        <path d="M106.4 77.6 Q112 76 117.6 77.6" stroke="${LIP_DARK}" stroke-width="0.9" fill="none" stroke-linecap="round"/>
      </g>
      <g class="m-wow">
        <ellipse cx="112" cy="77.6" rx="3.2" ry="3.8" fill="${LIP}"/>
        <ellipse cx="112" cy="77.8" rx="2" ry="2.6" fill="${MOUTH}"/>
      </g>
      <g class="m-cheer">
        <path d="M105 75.2 Q112 73.6 119 75.2 Q116.4 83 112 83.2 Q107.6 83 105 75.2 Z" fill="${LIP}"/>
        <path d="M106.6 75.9 Q112 75 117.4 75.9 Q115.4 81.2 112 81.4 Q108.6 81.2 106.6 75.9 Z" fill="${MOUTH}"/>
        <path d="M107.4 76 Q112 75.4 116.6 76 L116.2 77.6 Q112 77 107.8 77.6 Z" fill="#f6f3ee"/>
      </g>
    </g>

    <!-- hair, front layer: a side-swept fringe that leaves the forehead open -->
    <path d="M92 62 C87 36 100 21 116 20.5 C127 20.5 135 26 137.5 35 C131 30.5 125 30.5 120.5 33.5 C113 39.5 105 45 97.5 52 C95 55 93.5 58 92 62 Z" fill="url(#nv-hair)"/>
    <path d="M123 23 C133 26.5 139.5 38 137.5 55 C135.6 46.5 132.6 40 128 35.6 Z" fill="url(#nv-hair)"/>
    <path d="M92 54 C87.5 70 87.5 86 92.5 99 C95.2 87 96.2 73 95.6 61 Z" fill="#120e14"/>
    <path d="M136.5 50 C140.5 64 140.5 79 136.5 90 C133.6 80 132.8 68 133.6 57 Z" fill="#120e14"/>
    <!-- strand detail and gloss -->
    <g fill="none" stroke-linecap="round">
      <path d="M118 25 C110 32 102 40 95.5 53" stroke="#4e4554" stroke-width="0.8" opacity="0.8"/>
      <path d="M122 28 C114 34 106 42 99 50" stroke="#3a3240" stroke-width="0.7" opacity="0.8"/>
      <path d="M126 31 C118 36 110 43 103 48" stroke="#5a5060" stroke-width="0.6" opacity="0.6"/>
      <path d="M93.5 64 C92.6 76 93.4 87 95.4 95" stroke="#3e3644" stroke-width="0.7" opacity="0.8"/>
      <path d="M134.6 60 C135.8 70 135.6 80 134.6 87" stroke="#3e3644" stroke-width="0.7" opacity="0.8"/>
      <path d="M102 26 Q114 20.5 127 25" stroke="#8a7d92" stroke-width="2.4" opacity="0.5" filter="url(#nv-soft)"/>
      <path d="M97 40 Q104 34 112 32" stroke="#7d7086" stroke-width="1.6" opacity="0.45" filter="url(#nv-soft)"/>
    </g>
    <!-- teal streak woven through the right side -->
    <path d="M127 26 C133.5 32 137 42 136.4 55 C138.4 66 138.2 78 136 88" stroke="${TEAL}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.85"/>
    <path d="M127 26 C133.5 32 137 42 136.4 55" stroke="#9af5ec" stroke-width="0.7" fill="none" stroke-linecap="round" opacity="0.7"/>
    <path d="M127 26 C133.5 32 137 42 136.4 55" stroke="${TEAL}" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.25" filter="url(#nv-soft)"/>

    <!-- headset: band, ear cup with status light, mic boom -->
    <path d="M91 50 C88 18 138 16 137 50" stroke="#16171b" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <rect x="133.5" y="50" width="8" height="13" rx="3.2" fill="#16171b"/>
    <rect x="134.5" y="51" width="2" height="11" rx="1" fill="#3a3d45" opacity="0.8"/>
    <circle cx="138" cy="56.5" r="1.3" fill="${TEAL}"/>
    <path d="M136 62 C133 72 126 76 119 76.5" stroke="#16171b" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="118.4" cy="76.6" rx="1.8" ry="1.5" fill="#16171b"/>
  </g>

  <!-- pointing arm (moves while she talks) -->
  <g class="ins-arm">
    <path d="M84 112 C74 122 70 144 70 166 L81 168 C81 150 84 136 90 124 Z" fill="url(#nv-sleeve)"/>
    <path d="M70 164 C64 150 62 134 64 120 L75 119 C75 132 77 148 81 160 Z" fill="url(#nv-sleeve)"/>
    <path d="M63.5 124 L75.5 122.5 L75.5 127.5 L63.5 129 Z" fill="${TEAL}" opacity="0.85"/>
    <!-- gloved hand, index finger raised -->
    <path d="M63 119 C60 111 64 105 70 107 L75.5 116 C74.5 123 67 125 63 119 Z" fill="#17181c"/>
    <path d="M68 108 L66 92 C65.6 89 69.6 88.6 70 91.6 L72.6 108" fill="#17181c"/>
    <path d="M66.8 94 C67.4 92 69 92 69.6 93.6" stroke="#4a4d56" stroke-width="0.8" fill="none"/>
    <path d="M64.6 113 C66 110 69 109.6 71 111" stroke="#4a4d56" stroke-width="0.8" fill="none"/>
  </g>
</svg>`;
}

/** A natural almond eye with lid shadow, crease, fine lashes and a catch light; dx nudges the gaze. */
function eye(cx: number, dx: number): string {
  const L = cx - 6, R = cx + 6;
  const outer = cx < 112 ? L : R;
  const flick = cx < 112 ? -1.4 : 1.4;
  return `
    <g class="ins-eye">
      <ellipse cx="${cx}" cy="54" rx="6.4" ry="2.6" fill="#a86a58" opacity="0.32" filter="url(#nv-soft)"/>
      <path d="M${L} 57 Q${cx - 0.6} 52.4 ${R} 56.4 Q${cx + 0.6} 60 ${L} 57 Z" fill="#f6f1ee"/>
      <circle cx="${cx + dx}" cy="56.6" r="3.15" fill="url(#nv-iris)"/>
      <circle cx="${cx + dx}" cy="56.6" r="3.15" fill="none" stroke="#2a180c" stroke-width="0.45"/>
      <circle cx="${cx + dx}" cy="56.6" r="1.35" fill="#120a05"/>
      <circle cx="${cx + dx + 1.1}" cy="55.5" r="0.75" fill="#ffffff"/>
      <path d="M${L} 57 Q${cx - 0.6} 53.6 ${R} 56.4" stroke="#000" stroke-width="0.6" fill="none" opacity="0.18"/>
      <path d="M${L - 0.3} 57 Q${cx - 0.6} 52.1 ${R + 0.3} 56.2" stroke="#2a1c20" stroke-width="0.95" fill="none" stroke-linecap="round"/>
      <path d="M${outer} ${cx < 112 ? 57 : 56.2} l${flick} -0.9" stroke="${LINE}" stroke-width="0.8" stroke-linecap="round"/>
      <path d="M${L + 0.8} 54 Q${cx - 0.4} 50.4 ${R - 0.4} 53.4" stroke="#9e6652" stroke-width="0.55" fill="none" opacity="0.65"/>
      <path d="M${L + 1.2} 58 Q${cx} 59.6 ${R - 1} 57.2" stroke="#9e6652" stroke-width="0.45" fill="none" opacity="0.55"/>
    </g>`;
}

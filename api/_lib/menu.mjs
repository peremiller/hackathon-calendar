// Inline-keyboard menus for the HackCal bot.
//
// The bot has no datastore, so the current scope/region can't be remembered
// server-side between taps. Instead every button carries the full state in its
// callback_data and hands it back on the next tap — the keyboard *is* the
// session. Telegram caps callback_data at 64 bytes; the longest combination
// here ("h|r_global|hack|global") is 23, so there is ample headroom.

import { SCOPES, REGIONS } from './digest.mjs';

const V = 'h';                      // version tag, so old buttons can be spotted
const SEP = '|';

export const encode = (act, scope, region) => [V, act, scope, region].join(SEP);

export function decode(data) {
  const [v, act, scope, region] = String(data || '').split(SEP);
  if (v !== V || !act) return null;
  return {
    act,
    scope: SCOPES.includes(scope) ? scope : 'hack',
    region: REGIONS.includes(region) ? region : 'ph'
  };
}

// Human labels — the raw enum values are fine in a URL but poor in a button.
export const SCOPE_LABEL = {
  hack: 'Hackathons only',
  tech: 'Hackathons + tech',
  all: 'Everything'
};
export const REGION_LABEL = {
  ph: 'PH + Online',
  online: 'Online only',
  global: 'Global'
};

const tick = (on, label) => (on ? '✅ ' : '') + label;
const btn = (text, act, scope, region) => ({ text, callback_data: encode(act, scope, region) });

export function mainMenu(scope, region) {
  return [
    [btn('📆 Today', 'd0', scope, region), btn('🔜 Tomorrow', 'd1', scope, region)],
    [btn('🚀 Today + Tomorrow', 'feed', scope, region)],
    [
      btn(`🎚 Scope: ${SCOPE_LABEL[scope]}`, 'pick_s', scope, region),
      btn(`🌏 Region: ${REGION_LABEL[region]}`, 'pick_r', scope, region)
    ],
    [btn('❓ Help', 'help', scope, region)]
  ];
}

export function scopeMenu(scope, region) {
  return [
    ...SCOPES.map(s => [btn(tick(s === scope, SCOPE_LABEL[s]), 's_' + s, scope, region)]),
    [btn('◀ Back', 'menu', scope, region)]
  ];
}

export function regionMenu(scope, region) {
  return [
    ...REGIONS.map(r => [btn(tick(r === region, REGION_LABEL[r]), 'r_' + r, scope, region)]),
    [btn('◀ Back', 'menu', scope, region)]
  ];
}

// Sits under a rendered digest so the reader can re-cut it without typing.
export function digestMenu(scope, region) {
  return [
    [
      btn('🔄 Refresh', 'feed', scope, region),
      btn('📆 Today', 'd0', scope, region),
      btn('🔜 Tomorrow', 'd1', scope, region)
    ],
    [btn('⚙️ Options', 'menu', scope, region)]
  ];
}

export const menuHeader = (scope, region) => [
  '<b>🚀 HackCal</b>',
  `<i>Scope: ${SCOPE_LABEL[scope]} · Region: ${REGION_LABEL[region]}</i>`,
  '',
  'Pick a view, or change what the feed covers.'
].join('\n');

// The native "/" command list shown by Telegram's Menu button.
export const COMMANDS = [
  { command: 'menu', description: 'Open the menu' },
  { command: 'feed', description: "Today + tomorrow's events" },
  { command: 'today', description: 'Just today' },
  { command: 'tomorrow', description: 'Just tomorrow' },
  { command: 'id', description: "Show this chat's id" },
  { command: 'help', description: 'How this bot works' }
];

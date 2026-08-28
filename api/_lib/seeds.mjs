const pad = value => String(value).padStart(2, '0');

const DEFINITIONS = [
  ['MLH Global Hack Week', 7, 13, 7, 'Online', 'Global / Virtual', ['AI/ML', 'Open Source', 'DevTools'], 'https://ghw.mlh.com/', 'Major League Hacking’s beginner-friendly week-long online event (successor to Local Hack Day).'],
  ['ETHGlobal Hackathon', 6, 12, 3, 'In-person', 'New York, USA', ['Web3', 'Open Source'], 'https://ethglobal.com', 'Flagship Ethereum builder hackathon with major sponsor bounties (ETHGlobal New York).'],
  ['AI Engineer World’s Fair', 6, 29, 4, 'In-person', 'San Francisco, USA', ['AI/ML', 'DevTools', 'Data'], 'https://www.ai.engineer/', 'Build agents, RAG pipelines and LLM apps; hackathon runs alongside the fair.'],
  ['NASA Space Apps Challenge', 11, 14, 2, 'Hybrid', 'Global / 300+ cities', ['Data', 'Open Source', 'Hardware'], 'https://www.spaceappschallenge.org', 'The world’s largest annual civic hackathon, run with NASA open data.'],
  ['Hack the North', 9, 18, 3, 'In-person', 'Waterloo, Canada', ['AI/ML', 'Web3', 'Mobile'], 'https://hackthenorth.com', 'Canada’s biggest hackathon — 1,000+ students, 36 hours.'],
  ['ClimateHack.AI', 4, 5, 2, 'Hybrid', 'Global / Virtual', ['Climate', 'Data', 'AI/ML'], 'https://climatehack.ai/', 'Multi-university machine-learning competition tackling climate problems.'],
  ['Money20/20 Hackathon', 10, 18, 4, 'In-person', 'Las Vegas, USA', ['FinTech', 'Cybersecurity', 'Data'], 'https://www.money2020.com/', 'Payments, open banking and fraud challenges at the Money20/20 fintech festival.'],
  ['MIT Hacking Medicine GrandHack', 3, 13, 3, 'In-person', 'Cambridge, USA', ['HealthTech', 'AI/ML'], 'https://hackingmedicine.mit.edu/', 'Clinicians + engineers building patient-care prototypes; MIT’s flagship health hackathon.'],
  ['Global Game Jam', 1, 29, 3, 'Online', 'Global / Virtual', ['Gaming', 'AR/VR'], 'https://globalgamejam.org', 'The world’s largest game-jam — build a playable game to a shared theme.'],
  ['TreeHacks', 2, 12, 3, 'In-person', 'Stanford, USA', ['AI/ML', 'HealthTech', 'Climate'], 'https://treehacks.com', 'Stanford’s premier hackathon with deep-tech tracks.'],
  ['picoCTF', 3, 9, 11, 'Online', 'Global / Virtual', ['Cybersecurity', 'DevTools'], 'https://picoctf.org/', 'Carnegie Mellon’s free, beginner-friendly capture-the-flag (runs ~11 days in March).'],
  ['MakeMIT', 2, 21, 2, 'In-person', 'Cambridge, USA', ['Robotics', 'Hardware'], 'https://makemit.net/', 'MIT’s 24-hour hardware hackathon with on-site fab-lab access.'],
  ['Junction', 11, 13, 3, 'In-person', 'Espoo, Finland', ['AI/ML', 'Web3', 'Hardware'], 'https://www.hackjunction.com', 'Europe’s leading hackathon, 1,500 hackers.'],
  ['PennApps', 9, 19, 3, 'In-person', 'Philadelphia, USA', ['Mobile', 'DevTools'], 'https://pennapps.com/', 'The original college hackathon — beginner-accessible, ship in 36 hours.'],
  ['Hacktoberfest', 10, 1, 31, 'Online', 'Global / Virtual', ['Open Source', 'DevTools'], 'https://hacktoberfest.com/', 'DigitalOcean’s month-long October open-source contribution event.'],
  ['MIT Reality Hack', 1, 22, 5, 'In-person', 'MIT, Cambridge, USA', ['AR/VR', 'Gaming', 'AI/ML'], 'https://www.realityhackatmit.com', 'XR-focused hackathon with headset hardware loans.'],
];

function shiftDate(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function hackCalSeedEvents(today) {
  const currentYear = Number(String(today).slice(0, 4));
  return DEFINITIONS.map(([name, month, day, length, fmt, loc, tags, url, desc]) => {
    const currentStart = `${currentYear}-${pad(month)}-${pad(day)}`;
    const start = currentStart < today
      ? `${currentYear + 1}-${pad(month)}-${pad(day)}`
      : currentStart;
    return {
      id: `seed-${slug(name)}-${start}`,
      name,
      start,
      end: shiftDate(start, length - 1),
      fmt,
      loc,
      tags,
      url,
      desc,
      src: 'HackCal',
    };
  });
}

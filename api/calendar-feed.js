import { buildCalendar, futureStartingEvents, uniqueEvents } from './_lib/calendar.mjs';
import { collectLiveEvents, manilaDateKey } from './live-events.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = await collectLiveEvents({
      q: 'hackathon,ai,developer,startup',
      sources: 'luma,eventbrite,meetup,maven,substack,lablab,primeqe',
      filter: 'tech',
      limit: '1000',
    });
    const today = manilaDateKey();
    const events = futureStartingEvents(
      uniqueEvents(payload.events.filter(e => !e.needsVerification)),
      today,
    );
    const calendar = buildCalendar(events, {
      name: 'HackCal Tech Events + lablab.ai',
      generatedAt: payload.fetchedAt,
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="hackcal-tech-events.ics"');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    return res.status(200).send(calendar);
  } catch (error) {
    console.error('Calendar feed generation failed.', error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Calendar feed is temporarily unavailable' });
  }
}

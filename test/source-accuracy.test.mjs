import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubstackFeed } from '../api/_lib/substack.mjs';
import { parseMavenCourses, schemaEvent } from '../api/live-events.js';
import { fetchLablabEvents } from '../api/_lib/lablab.mjs';
const rss=body=>`<rss><channel><title>Events 2026</title><item><title>Events for November 2026</title><link>https://example.substack.com/p/week</link><pubDate>Mon, 9 Nov 2026 00:00:00 GMT</pubDate><content:encoded><![CDATA[${body}]]></content:encoded></item></channel></rss>`;
test('Substack never borrows a neighboring event link or clock',()=>{
 const rows=parseSubstackFeed(rss(`<h3><a href="https://luma.com/beyond">Nov 25 - Beyond Borders AI Conference</a></h3><p>November 25, 2026 | 7 PM Online</p><p><a href="https://luma.com/beyond">Registration link</a></p><h3>Nov 26 - Dreamforce To You: AI Governance</h3><p>Location: Milan | November 26, 2026 | 10:00 - 15:00</p><p><a href="https://example.com/dreamforce">Registration link</a></p>`),{eventFocused:true},new Date('2026-11-10'));
 const row=rows.find(x=>x.name.includes('Dreamforce'));
 assert.ok(row);assert.equal(row.url,'https://example.com/dreamforce');assert.equal(row.start,'2026-11-26');assert.equal(row.startAt,null);assert.equal(row.needsVerification,true);
});
test('schema events retain offset instants and flag a missing end without inventing duration',()=>{
 const row=schemaEvent({'@type':'Event',name:'AI evening',url:'https://www.meetup.com/ai/events/123/',startDate:'2026-11-13T23:00:00-08:00'},'Meetup','mu:');
 assert.equal(row.startAt,'2026-11-13T23:00:00-08:00');assert.equal(row.endAt,null);assert.equal(row.needsVerification,true);
 assert.equal(schemaEvent({'@type':'Event',name:'Bad date',url:'https://example.com',startDate:'2026-02-31'},'Meetup','mu:'),null);
});
test('Maven next cohorts have distinct occurrence IDs while preserving course identity',()=>{
 const item={course:{id:123,name:'AI Engineers',slug:'ai'},school:{slug:'school',timezone:'America/New_York'},next_live_cohort:{id:4,slug:'fall',start_date:'2026-11-12T15:00:00Z',end_date:'2026-12-12T16:00:00Z'}};
 const [a]=parseMavenCourses([item]);const [b]=parseMavenCourses([{...item,next_live_cohort:{...item.next_live_cohort,id:5,start_date:'2027-01-12T15:00:00Z',end_date:'2027-02-12T15:00:00Z'}}]);
 assert.notEqual(a.extId,b.extId);assert.equal(a.legacyExtId,'maven:123');assert.equal(a.dateSemantic,'cohort_period');assert.match(a.desc,/session/);
});
test('lablab phases keep the dates attached to their own official URL',async()=>{
 const directory='<a href="/ai-hackathons/ai-hackathon"><h3>AI Hackathon</h3><p>Online Build: September 10-16, 2026</p></a>';
 const calendar='<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"item":{"@type":"Event","name":"AI Hackathon","url":"https://luma.com/onsite","startDate":"2026-09-17T10:00:00Z","endDate":"2026-09-18T17:00:00Z"}}]}</script>';
 const rows=await fetchLablabEvents({now:new Date('2026-08-30'),grab:async url=>({ok:true,text:url.includes('jina')?directory:calendar})});
 assert.equal(rows.length,2);assert.equal(rows.find(x=>x.url.includes('lablab.ai/ai-hackathons')).end,'2026-09-16');assert.equal(rows.find(x=>x.url.includes('luma.com')).start,'2026-09-17');
});

test('unverified source leads cannot become confirmed calendar entries',async()=>{
 const {buildCalendar}=await import('../api/_lib/calendar.mjs');
 const ics=buildCalendar([{name:'Unverified newsletter',start:'2026-11-26',end:'2026-11-26',needsVerification:true}]);
 assert.doesNotMatch(ics,/BEGIN:VEVENT/);
});

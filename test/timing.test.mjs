import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildCalendar, startsTodayOrLater } from '../api/_lib/calendar.mjs';
import { partition, timeLabel } from '../api/_lib/digest.mjs';
import { isCurrentOrFuture } from '../api/live-events.js';

const event = {name:'Full-Stack Agents Hackathon', src:'Luma', extId:'luma:evt-UyGhH1Yfy65fq6q', start:'2026-11-13', end:'2026-11-13', startAt:'2026-11-13T22:00:00.000Z', endAt:'2026-11-14T05:00:00.000Z', tz:'America/Los_Angeles', allDay:false, fmt:'In-person', loc:'San Francisco', tags:[]};
test('timed calendar export preserves the Luma instants and stable source UID',()=>{
 const ics=buildCalendar([event]);
 assert.match(ics,/DTSTART:20261113T220000Z/);
 assert.match(ics,/DTEND:20261114T050000Z/);
 assert.match(ics,/UID:luma-evt-UyGhH1Yfy65fq6q@hackcal/);
 assert.doesNotMatch(ics,/DTSTART;VALUE=DATE/);
});
test('upcoming and live cutoff use the Philippine day for absolute events',()=>{
 assert.equal(startsTodayOrLater(event,'2026-11-14'),true);
 assert.equal(isCurrentOrFuture(event,'2026-11-14'),true);
 assert.equal(isCurrentOrFuture(event,'2026-11-15'),false);
});
test('Telegram buckets a US evening under the next Philippine day and labels dates',()=>{
 const parts=partition([event],'2026-11-13','2026-11-14','global','Asia/Manila');
 assert.equal(parts.today.length,0); assert.equal(parts.tomorrow.length,1);
 assert.match(timeLabel(event,'Asia/Manila'),/Nov 14/);
});
test('web sync retains and refreshes time-only changes in place',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const from=html.slice(html.indexOf('function fromLive('),html.indexOf('let liveBusy='));
 const ctx=vm.createContext({data:[],uid:()=> 'local-id',pickTags:()=>[],pickRegClose:()=>'',pickElig:()=> 'Everyone',evKey:e=>e.name+'|'+e.start,save:()=>{},phtDate:iso=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date(iso)),Date,Map,Set});
 vm.runInContext(from,ctx);
 ctx.records=[event];vm.runInContext('upsertLive(records)',ctx);
 assert.equal(ctx.data[0].startAt,event.startAt);assert.equal(ctx.data[0].start,'2026-11-14');
 ctx.records=[{...event,startAt:'2026-11-13T23:00:00.000Z'}]; vm.runInContext('upsertLive(records)',ctx);
 assert.equal(ctx.data.length,1);assert.equal(ctx.data[0].id,'local-id');assert.equal(ctx.data[0].startAt,ctx.records[0].startAt);
 const exp=html.slice(html.indexOf('function icsDate('),html.indexOf('function icsEsc('));
 vm.runInContext(exp,ctx);ctx.icsEsc=String;ctx.pad=n=>String(n).padStart(2,'0');
 const ics=vm.runInContext('icsForEvents(data)',ctx); assert.match(ics,/DTSTART:20261113T230000Z/);
});

test('a Luma ICS import retains UTC clocks and the Philippine date',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const parse=html.slice(html.indexOf('const icsUnesc='),html.indexOf('async function fetchIcs('));
 const ctx=vm.createContext({Date,Intl,uid:()=> 'local-id',pickTags:()=>[],pickRegClose:()=>'',pickElig:()=> 'Everyone',pad:n=>String(n).padStart(2,'0'),phtDate:iso=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date(iso))});
 vm.runInContext(parse,ctx);
 ctx.ics='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:luma-unique-id\r\nDTSTART:20261113T220000Z\r\nDTEND:20261114T050000Z\r\nSUMMARY:Example AI Hackathon\r\nEND:VEVENT\r\nEND:VCALENDAR';
 const [e]=vm.runInContext("parseICS(ics,'Luma')",ctx);
 assert.equal(e.start,'2026-11-14');assert.equal(e.startAt,'2026-11-13T22:00:00Z');assert.equal(e.extId,'ics:luma-unique-id');assert.equal(e.allDay,false);
});

test('already-ended timed events are excluded even on the current Philippine day',()=>{
 assert.equal(isCurrentOrFuture(event,'2026-11-14',new Date('2026-11-14T06:00:00Z')),false);
 assert.equal(isCurrentOrFuture(event,'2026-11-14',new Date('2026-11-14T04:00:00Z')),true);
});

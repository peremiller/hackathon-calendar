import test from 'node:test';
import assert from 'node:assert/strict';
import {chunk} from '../api/_lib/tg.mjs';
import {founderRecords} from '../api/_lib/founder.mjs';
test('large digests retain all event lines without unclosed HTML tags',()=>{
 const lines=Array.from({length:100},(_,i)=>`<a href="https://example.com/${i}">Event ${i}</a>\n<i>Online</i>`);
 const text='<b>Events</b>\n'+lines.join('\n');const parts=chunk(text);
 assert.equal(parts.join('\n'),text);assert.ok(parts.length>1);
 for(const p of parts){assert.ok(p.length<=3900);assert.equal((p.match(/<a /g)||[]).length,(p.match(/<\/a>/g)||[]).length);assert.equal((p.match(/<i>/g)||[]).length,(p.match(/<\/i>/g)||[]).length)}
});
test('bridge keeps native event IDs and excludes imported HackCal rows',()=>{
 const e={id:'reactor-1',sourceId:'reactor',name:'Event',date:'2026-11-11',endDate:'2026-11-11',location:'Online'};
 const rows=founderRecords({events:[e,{...e,id:'hackcal-1',sourceId:'hackcal'}]});assert.equal(rows.length,1);assert.equal(rows[0].extId,'primeqe:reactor-1');
});

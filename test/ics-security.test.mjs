import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {grab, isPublicAddress, validateFeedURL} from '../api/ics-proxy.js';

test('calendar importer rejects local, internal, metadata, credentials and nonstandard ports', () => {
  for(const url of [
    'http://localhost/private.ics',
    'http://127.0.0.1/admin',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.4/',
    'http://172.19.0.1/',
    'http://192.168.0.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://intranet.local/a.ics',
    'https://user:password@example.com/secret.ics',
    'https://example.org:8443/feed',
    'file:///etc/passwd',
    'ftp://example.com/event.ics'
  ]) assert.throws(() => validateFeedURL(url), undefined, url);
  assert.equal(validateFeedURL('webcal://calendar.google.com/calendar.ics').protocol, 'https:');
  assert.equal(validateFeedURL('https://calendar.example.com/feed.ics').hostname, 'calendar.example.com');
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('10.0.0.1'), false);
  assert.equal(isPublicAddress('2001:db8::1'), false);
});

function fakeTransport(replies, seen) {
  return {
    request(url, options, onResponse){
      const req = new EventEmitter();
      req.setTimeout = () => {};
      req.destroy = error => req.emit('error',error);
      req.end = () => queueMicrotask(() => {
        const reply = replies.shift();
        const response = new EventEmitter();
        response.statusCode = reply.status;
        response.headers = {location:reply.location};
        seen.push({url:url.toString(),options});
        onResponse(response);
        response.emit('data',Buffer.from(reply.text||''));
        response.emit('end');
      });
      return req;
    }
  };
}

test('calendar requests pin only previously validated public DNS results', async () => {
  const seen=[];
  const result=await grab('https://example.org/feed.ics',{
    lookupFn:async () => [{address:'8.8.8.8',family:4}],
    transport:fakeTransport([{status:200,text:'BEGIN:VCALENDAR\nEND:VCALENDAR'}],seen)
  });
  assert.equal(result.ok,true);
  assert.match(result.text,/BEGIN:VCALENDAR/);
  assert.equal(seen.length,1);
  let pinned;
  seen[0].options.lookup('example.org',{},(error,address,family)=>{pinned={error,address,family}});
  assert.deepEqual(pinned,{error:null,address:'8.8.8.8',family:4});
});

test('DNS answers containing private addresses fail closed before any network request', async () => {
  let requests=0;
  await assert.rejects(
    grab('https://example.org/feed.ics',{
      lookupFn:async () => [{address:'1.1.1.1',family:4},{address:'127.0.0.1',family:4}],
      transport:{request(){requests++;throw Error('Unexpected request')}}
    }),
    /public addresses/
  );
  assert.equal(requests,0);
});

test('redirects cannot send calendar fetches to private IPs or non-HTTP protocols', async () => {
  const seen=[];
  await assert.rejects(
    grab('https://example.org/feed.ics',{
      lookupFn:async () => [{address:'8.8.8.8',family:4}],
      transport:fakeTransport([{status:302,location:'http://127.0.0.1/admin',text:''}],seen)
    }),
    /Private or local/
  );
  assert.equal(seen.length,1);
});

test('redirected external host must be independently verified and pinned', async () => {
  const seen=[],hosts=[];
  const result=await grab('https://example.org/feed.ics',{
    lookupFn:async host=>{hosts.push(host);return [{address:host==='example.org'?'8.8.8.8':'1.1.1.1',family:4}]},
    transport:fakeTransport([
      {status:302,location:'https://calendar.example.com/calendar.ics'},
      {status:200,text:'BEGIN:VCALENDAR\nEND:VCALENDAR'}
    ],seen)
  });
  assert.equal(result.ok,true);
  assert.deepEqual(hosts,['example.org','calendar.example.com']);
  assert.equal(seen.length,2);
});

test('large remote feed is rejected instead of buffering unbounded response', async () => {
  await assert.rejects(
    grab('https://example.org/feed.ics',{
      lookupFn:async () => [{address:'8.8.8.8',family:4}],
      transport:fakeTransport([{status:200,text:'A'.repeat(1024*1024+1)}],[])
    }),
    /allowed size/
  );
});

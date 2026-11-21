import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/discord-events.js';

function response() {
  let code = 200;
  let body;
  const headers = {};
  return {
    headers,
    status(value) { code = value; return this; },
    json(value) { body = value; return this; },
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    result() { return { status: code, body, headers }; }
  };
}

test('Discord relay keeps success shape but never exposes upstream or network error contents', async () => {
  const prevToken = process.env.DISCORD_BOT_TOKEN;
  const prevChannel = process.env.DISCORD_CHANNEL_ID;
  const prevFetch = globalThis.fetch;
  try {
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.DISCORD_CHANNEL_ID;
    let res = response();
    await handler({ method: 'GET' }, res);
    assert.deepEqual(res.result().body, { configured: false });
    assert.equal(res.result().headers['cache-control'], 'no-store');

    process.env.DISCORD_BOT_TOKEN = 'test-bot-secret';
    process.env.DISCORD_CHANNEL_ID = '123456';
    let requested;
    globalThis.fetch = async (url, options) => {
      requested = { url, authorization: options.headers.Authorization };
      return {
        ok: true,
        json: async () => [{ content: 'Hackathon event' }, { content: '' }, { content: 'Tech meetup' }]
      };
    };
    res = response();
    await handler({ method: 'GET' }, res);
    assert.equal(requested.url, 'https://discord.com/api/v10/channels/123456/messages?limit=50');
    assert.equal(requested.authorization, 'Bot test-bot-secret');
    assert.equal(res.result().status, 200);
    assert.deepEqual(res.result().body, { messages: ['Hackathon event', 'Tech meetup'], count: 2 });
    assert.equal(res.result().headers['cache-control'], 'no-store');

    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      text: async () => { throw Error('Should not inspect private upstream body'); }
    });
    res = response();
    await handler({ method: 'GET' }, res);
    assert.equal(res.result().status, 403);
    assert.deepEqual(res.result().body, { error: 'Discord events temporarily unavailable' });
    assert.equal(res.result().headers['cache-control'], 'no-store');

    globalThis.fetch = async () => { throw Error('private proxy host and test-bot-secret must never leak'); };
    res = response();
    await handler({ method: 'GET' }, res);
    assert.equal(res.result().status, 500);
    assert.deepEqual(res.result().body, { error: 'Discord events temporarily unavailable' });
    assert.equal(res.result().headers['cache-control'], 'no-store');
    assert.doesNotMatch(JSON.stringify(res.result()), /test-bot-secret|private proxy host/);
  } finally {
    if (prevToken === undefined) delete process.env.DISCORD_BOT_TOKEN;
    else process.env.DISCORD_BOT_TOKEN = prevToken;
    if (prevChannel === undefined) delete process.env.DISCORD_CHANNEL_ID;
    else process.env.DISCORD_CHANNEL_ID = prevChannel;
    globalThis.fetch = prevFetch;
  }
});

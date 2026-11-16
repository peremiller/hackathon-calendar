import test from 'node:test';
import assert from 'node:assert/strict';
import webhook from '../api/telegram-webhook.js';

function response() {
  return {
    code: null, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('webhook rejects requests without Telegram verification before any delivery', async () => {
  const old = process.env.TELEGRAM_WEBHOOK_SECRET;
  process.env.TELEGRAM_WEBHOOK_SECRET = 'isolated-test-secret';
  try {
    const res = response();
    await webhook({method:'POST',headers:{},body:{message:{chat:{id:123},text:'/menu'}}},res);
    assert.equal(res.code,401);
    assert.equal(res.body.ok,false);
  } finally {
    if (old === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = old;
  }
});

test('upstream Telegram failures are not relayed to the caller or the chat', async () => {
  const oldSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const oldToken = process.env.TELEGRAM_BOT_TOKEN;
  const oldFetch = globalThis.fetch;
  process.env.TELEGRAM_WEBHOOK_SECRET = 'isolated-test-secret';
  process.env.TELEGRAM_BOT_TOKEN = 'isolated-test-bot-token';
  const requests = [];
  try {
    globalThis.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      const failed = requests.length === 1;
      return {
        ok: !failed,
        status: failed ? 502 : 200,
        json: async () => failed
          ? {ok:false, description:'PRIVATE_UPSTREAM_CREDENTIAL_DO_NOT_DISCLOSE'}
          : {ok:true, result:{message_id:9}}
      };
    };
    const res = response();
    await webhook({
      method:'POST',
      headers:{'x-telegram-bot-api-secret-token':'isolated-test-secret'},
      body:{message:{chat:{id:123},text:'/menu'}}
    },res);
    assert.equal(res.code,200,'Preserve Telegram retry-avoidance behavior');
    assert.deepEqual(res.body,{ok:false,error:'Unable to process this Telegram update'});
    assert.equal(requests.length,2,'Attempt one generic failure notification after failed send');
    assert.match(requests[1].text,/Unable to process this Telegram update/);
    assert.doesNotMatch(JSON.stringify({response:res.body,requests}),/PRIVATE_UPSTREAM_CREDENTIAL_DO_NOT_DISCLOSE/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = oldSecret;
    if (oldToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = oldToken;
  }
});

test('outer webhook exception handler also redacts details', async () => {
  const old = process.env.TELEGRAM_WEBHOOK_SECRET;
  process.env.TELEGRAM_WEBHOOK_SECRET = 'isolated-test-secret';
  try {
    const res = response();
    await webhook({
      method:'POST',
      headers:{'x-telegram-bot-api-secret-token':'isolated-test-secret'},
      body:{message:{chat:{id:123},get text(){throw Error('PRIVATE_SERVER_DETAILS');}}}
    },res);
    assert.equal(res.code,200);
    assert.deepEqual(res.body,{ok:false,error:'Unable to process this Telegram update'});
  } finally {
    if (old === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = old;
  }
});

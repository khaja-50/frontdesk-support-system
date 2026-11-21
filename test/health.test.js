import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/server.js';

function responseFor() {
  let finish;
  const completed = new Promise((resolve) => { finish = resolve; });
  const headers = {};
  const response = {
    headers,
    writeHead(status, values) { this.status = status; Object.assign(headers, values); },
    end(body) { this.body = body; finish(this); },
  };
  return { response, completed };
}

test('health endpoint reports the active storage mode', async () => {
  const req = { method: 'GET', url: '/health', headers: {} };
  const { response: rawResponse, completed } = responseFor();
  await app(req, rawResponse);
  const response = await completed;
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { status: 'ok', storage: 'sqlite', persistent: false });
});

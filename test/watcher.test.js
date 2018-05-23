'use strict';

const test = require('tape');
const sinon = require('sinon');
const stubber = require('./stubber');
const Watcher = require('../lib/watcher');
const Message = require('../lib/message');
const Messages = require('../lib/messages');
const Worker = require('../lib/worker');
const fs = require('fs');

test('[watcher] constructor', (assert) => {
  const messages = stubber(Messages).setup();

  assert.throws(
    () => new Watcher(),
    /Missing options: workerOptions/,
    'throws for missing workerOptions'
  );

  assert.throws(
    () => new Watcher({ workerOptions: {} }),
    /Missing options: queueUrl/,
    'throws for missing queueUrl option'
  );

  const options = {
    queueUrl: 'https://faker',
    workerOptions: {
      command: 'echo hello world',
      volumes: ['/tmp']
    }
  };
  const watcher = new Watcher(options);

  assert.deepEqual(
    watcher.workerOptions,
    options.workerOptions,
    'sets .workerOptions'
  );
  assert.equal(watcher.queueUrl, options.queueUrl, 'sets .queueUrl');
  assert.ok(watcher.messages instanceof Messages, 'sets .messages');

  messages.teardown();
  assert.end();
});

test('[watcher] listen listens until you stop it', async (assert) => {
  const messages = stubber(Messages).setup();
  messages.waitFor.returns(Promise.resolve([]));

  const watcher = new Watcher({
    queueUrl: 'https://faker',
    workerOptions: {
      command: 'echo hello world',
      volumes: ['/tmp']
    }
  });

  setTimeout(() => (watcher.stop = true), 1000);

  await watcher.listen();

  assert.pass('listened until .stop was set to true');
  assert.ok(
    messages.waitFor.callCount > 2,
    'as evidenced by repeated calls to messages.waitFor'
  );
  messages.teardown();
  assert.end();
});

test('[watcher] listen', async (assert) => {
  const messages = stubber(Messages).setup();
  const worker = stubber(Worker).setup();
  const workerOptions = {
    command: 'echo hello world',
    volumes: ['/tmp','/mnt']
  };

  const watcher = new Watcher({
    queueUrl: 'https://faker',
    workerOptions
  });

  const message1 = sinon.createStubInstance(Message);
  const message2 = sinon.createStubInstance(Message);

  messages.waitFor
    .onCall(0)
    .returns(Promise.resolve([]))
    .onCall(1)
    .returns(Promise.resolve([message1, message2]))
    .onCall(2)
    .callsFake(() => {
      watcher.stop = true;
      return Promise.resolve([]);
    });

  worker.waitFor.returns(Promise.resolve());

  const chmod = sinon.stub(fs, 'chmod').yields(null);

  try {
    await watcher.listen();
  } catch (err) {
    assert.ifError(err, 'failed');
  }

  assert.ok(
    Worker.create.calledWith(message1, workerOptions),
    'creates worker for message1'
  );

  assert.ok(
    Worker.create.calledWith(message2, workerOptions),
    'creates worker for message2'
  );

  assert.equal(worker.waitFor.callCount, 2, 'waits for both workers');

  assert.equal(chmod.callCount, 2, 'calls chmod twice');

  assert.ok(chmod.calledWith('/tmp', 0o777), 'sets open permissions on /tmp');
  assert.ok(chmod.calledWith('/mnt', 0o777), 'sets open permissions on /mnt');

  chmod.restore();
  messages.teardown();
  worker.teardown();
  assert.end();
});

test('[watcher] factory', (assert) => {
  const watcher = Watcher.create({
    queueUrl: 'https://faker',
    workerOptions: {
      command: 'echo hello world',
      volumes: ['/tmp']
    }
  });

  assert.ok(watcher instanceof Watcher, 'creates a Watcher object');
  assert.end();
});

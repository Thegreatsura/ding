import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { springEasing } from './spring.ts';
import { createToaster, TIMING } from './store.ts';
import { injectStyles } from './styles.ts';

test('spring easing starts at 0, ends at 1, finite duration', () => {
  const { easing, duration } = springEasing({ stiffness: 260, damping: 17 });
  const pts = easing.slice(7, -1).split(',').map(Number);
  assert.equal(pts[0], 0);
  assert.equal(pts.at(-1), 1);
  assert.ok(Math.max(...pts) > 1, 'underdamped overshoots');
  assert.ok(duration > 100 && duration < 5000);
});

test('toast phases: enter → open → closing → exit → removed', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  const id = t.success('hi');
  const phase = () => t.getState().toasts[0]?.phase;
  assert.equal(phase(), 'enter');
  mock.timers.tick(TIMING.openDelay);
  assert.equal(phase(), 'open');
  mock.timers.tick(TIMING.duration);
  assert.equal(phase(), 'closing');
  mock.timers.tick(TIMING.closing);
  assert.equal(phase(), 'exit');
  mock.timers.tick(TIMING.exit);
  assert.equal(t.getState().toasts.length, 0);
  assert.ok(id);
  mock.timers.reset();
});

test('pause stops the timer, loading→success updates in place', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  const id = t.loading('wait');
  mock.timers.tick(TIMING.openDelay + 10_000);
  assert.equal(t.getState().toasts[0]?.phase, 'open', 'loading is sticky');
  t.update(id, { type: 'success', title: 'done' });
  assert.equal(t.getState().toasts.length, 1);
  t.pause(id);
  mock.timers.tick(TIMING.duration * 2);
  assert.equal(t.getState().toasts[0]?.phase, 'open', 'paused');
  t.resume(id);
  mock.timers.tick(TIMING.duration);
  assert.equal(t.getState().toasts[0]?.phase, 'closing');
  mock.timers.reset();
});

test('pause()/resume() with no id affect all; immediate dismiss skips closing', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  t.success('b', { action: { label: 'Undo', onClick() {} }, duration: 4000 });
  mock.timers.tick(TIMING.openDelay);
  t.pause();
  mock.timers.tick(TIMING.duration * 2);
  assert.deepEqual(t.getState().toasts.map((x) => x.phase), ['open']);
  t.dismiss(t.getState().toasts[0]!.id, { immediate: true });
  assert.equal(t.getState().toasts[0]?.phase, 'exit');
  mock.timers.tick(TIMING.exit);
  assert.equal(t.getState().toasts.length, 0);
  mock.timers.reset();
});

test('errors and actions stay until dismissed; announcements go to the right region', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  t.error('Payment failed', { description: 'Card declined' });
  mock.timers.tick(TIMING.openDelay + 60_000);
  assert.deepEqual(t.getState().toasts.map((x) => x.phase), ['open']);
  assert.match(t.getState().alert, /^Payment failed\. Card declined/);
  t.success('Deleted', { action: { label: 'Undo', onClick() {} } }); // the error is held, so this one gets its own slot
  mock.timers.tick(60_000);
  assert.deepEqual(t.getState().toasts.map((x) => x.phase), ['open', 'open']);
  assert.match(t.getState().status, /^Deleted/);
  mock.timers.reset();
});

test('act(): a returned patch morphs the toast in place, nothing returned dismisses', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  const a = t.success('Deleted', { action: { label: 'Undo', onClick: () => ({ type: 'info', title: 'Restored' }) } });
  mock.timers.tick(TIMING.openDelay);
  t.act(a);
  const first = t.getState().toasts.find((x) => x.id === a)!;
  assert.equal(first.title, 'Restored');
  assert.equal(first.action, undefined);
  mock.timers.tick(TIMING.duration);
  assert.equal(t.getState().toasts.find((x) => x.id === a)?.phase, 'closing', 'timer starts once the action is gone');
  mock.timers.tick(TIMING.closing + TIMING.exit);
  const c = t.success('Other', { action: { label: 'Close', onClick() {} } });
  mock.timers.tick(TIMING.openDelay);
  t.act(c);
  assert.equal(t.getState().toasts.find((x) => x.id === c)?.phase, 'closing');
  mock.timers.reset();
});

test('async action closes immediately, rather than treating its Promise as a patch', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const t = createToaster();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const id = t.error('Deleted', { action: { label: 'Undo', onClick: () => pending } });
    t.act(id);
    assert.equal(t.getState().toasts[0]?.phase, 'closing');
    finish();
    await pending;
    assert.equal(t.getState().toasts[0]?.phase, 'closing');
  } finally {
    mock.timers.reset();
  }
});

test('an action creating a replacement toast cannot close or patch its successor', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const t = createToaster();
    t.configure({ held: 'replace' });
    const old = t.error('Deleted', { action: { label: 'Undo', onClick: () => { t.info('Restored'); } } });
    t.act(old);
    assert.equal(t.getState().toasts[0]?.title, 'Restored');
    assert.equal(t.getState().toasts[0]?.phase, 'enter');
    t.error('Again', { action: { label: 'Undo', onClick: () => {
      t.info('Restored again');
      return { title: 'Stale patch' };
    } } });
    t.act(t.getState().toasts[0]!.id);
    assert.equal(t.getState().toasts[0]?.title, 'Restored again');
    assert.equal(t.getState().toasts[0]?.phase, 'enter');
  } finally {
    mock.timers.reset();
  }
});

test('identical toasts collapse into one with a count', () => {
  const t = createToaster();
  const id = t.success('Saved');
  assert.equal(t.success('Saved'), id);
  assert.equal(t.getState().toasts.length, 1);
  assert.equal(t.getState().toasts[0]?.count, 2);
});

test('same title with different duration or progress applies the new options instead of only bumping the count', () => {
  const t = createToaster();
  const sticky = t.success('Saved', { duration: 0 });
  const timed = t.success('Saved', { duration: 1000 });
  assert.notEqual(timed, sticky);
  assert.deepEqual(t.getState().toasts.map(({ id, duration }) => ({ id, duration })),
    [{ id: sticky, duration: 0 }, { id: timed, duration: 1000 }]);
  const progress = t.success('Saved', { duration: 1000, progress: 0.5 });
  assert.notEqual(progress, timed);
  assert.equal(t.getState().toasts.at(-1)?.progress, 0.5);
  t.dismiss();
});

test('a new toast morphs the live one instead of stacking; stale callers are ignored', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  const a = t.loading('Uploading');
  mock.timers.tick(TIMING.openDelay);
  const b = t.error('Payment failed', { description: 'Card declined' });
  const s = t.getState();
  assert.equal(s.toasts.length, 1);
  assert.equal(s.toasts[0]?.type, 'error');
  assert.equal(s.toasts[0]?.description, 'Card declined');
  t.update(a, { type: 'success', title: 'Uploaded' }); // stale caller: ignored
  assert.equal(t.getState().toasts[0]?.title, 'Payment failed');
  t.update(b, { title: 'Try another card' });
  assert.equal(t.getState().toasts[0]?.title, 'Try another card');
  mock.timers.reset();
});

test('a stale caller cannot dismiss the newer toast, but its current caller and dismiss-all can', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  t.configure({ held: 'replace' });
  const old = t.loading('Old');
  const current = t.error('New');
  t.dismiss(old);
  assert.equal(t.getState().toasts[0]?.phase, 'enter');
  t.dismiss(current);
  assert.equal(t.getState().toasts[0]?.phase, 'closing');
  mock.timers.tick(TIMING.closing + TIMING.exit);
  const next = t.error('Next');
  t.dismiss();
  assert.equal(t.getState().toasts.find((x) => x.id === next)?.phase, 'closing');
  mock.timers.reset();
});

test('a repeat after takeover returns the owning caller id, which can update and dismiss', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  const old = t.loading('Preparing');
  const current = t.loading('Saving', { description: 'draft' });
  const repeated = t.loading('Saving', { description: 'draft' });
  assert.notEqual(old, current);
  assert.equal(repeated, current);
  assert.equal(t.getState().toasts[0]?.count, 2);
  t.update(repeated, { title: 'Saved' });
  assert.equal(t.getState().toasts[0]?.title, 'Saved');
  t.dismiss(repeated);
  assert.equal(t.getState().toasts[0]?.phase, 'closing');
  mock.timers.reset();
});

test('close() targets a visible toast by its physical id after takeover', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  const physical = t.loading('Preparing');
  t.error('New message');
  t.dismiss(physical);
  assert.equal(t.getState().toasts[0]?.phase, 'enter');
  t.close(physical);
  assert.equal(t.getState().toasts[0]?.phase, 'closing');
  mock.timers.reset();
});

test('auto-close still dismisses a physical slot after its caller has changed', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  const old = t.success('Old', { duration: 1000 });
  mock.timers.tick(TIMING.openDelay);
  t.success('New', { duration: 1000 });
  assert.equal(t.getState().toasts[0]?.id, old);
  mock.timers.tick(1000);
  assert.equal(t.getState().toasts[0]?.phase, 'closing');
  mock.timers.reset();
});

test('sound is off by default; a custom function hears every new status, not progress ticks', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const heard: string[] = [];
  const t = createToaster();
  const id = t.loading('Working', { progress: 0 });
  t.configure({ sound: (type) => void heard.push(type) });
  t.update(id, { progress: 0.5 }); // quiet: no sound
  t.update(id, { type: 'success', title: 'Done' });
  t.error('Failed');
  assert.deepEqual(heard, ['success', 'error']);
  mock.timers.reset();
});

test('progress ticks stay quiet, but completing with a new title announces the result', () => {
  const t = createToaster();
  const id = t.loading('Uploading', { progress: 0 });
  const initial = t.getState().status;
  t.update(id, { title: 'Uploading 50%', progress: 0.5 });
  assert.equal(t.getState().status, initial);
  t.update(id, { title: 'Uploaded', progress: 1 });
  assert.match(t.getState().status, /^Uploaded/);
});

test('a failing custom sound callback does not stop the toast from opening', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  t.configure({ sound: () => { throw new Error('audio failed'); } });
  const id = t.success('Saved');
  mock.timers.tick(TIMING.openDelay);
  assert.equal(t.getState().toasts.find((x) => x.id === id)?.phase, 'open');
  mock.timers.reset();
});

test('nonvisual configure options do not notify renderers', () => {
  const t = createToaster();
  let calls = 0;
  t.subscribe(() => calls++);
  const before = t.getState();
  t.configure({ sound: true, volume: 0.5, held: 'queue' });
  assert.equal(calls, 0);
  assert.equal(t.getState(), before);
  t.configure({ theme: 'dark' });
  assert.equal(calls, 1);
  assert.equal(t.getState().theme, 'dark');
});

test('a synchronously throwing promise producer rejects and changes loading to error', async () => {
  const t = createToaster();
  const p = t.promise(
    () => { throw new Error('failed before returning a promise'); },
    { loading: 'Loading', success: 'Done', error: 'Failed' },
  );
  await assert.rejects(p, /failed before returning/);
  assert.deepEqual(t.getState().toasts.map(({ type, title }) => ({ type, title })), [{ type: 'error', title: 'Failed' }]);
});

test('an explicit id updates its existing held toast instead of creating a duplicate', () => {
  const t = createToaster();
  t.error('First', { id: 'same' });
  t.error('Second', { id: 'same' });
  assert.deepEqual(t.getState().toasts.map(({ id, title }) => ({ id, title })), [{ id: 'same', title: 'Second' }]);
  t.dismiss();
});

test('generated ids skip existing explicit ids', () => {
  const t = createToaster();
  t.error('Custom', { id: 'toast-1' });
  const generated = t.error('Generated');
  assert.notEqual(generated, 'toast-1');
  assert.deepEqual(t.getState().toasts.map((x) => x.id), ['toast-1', generated]);
  t.dismiss();
});

test('a queued explicit id is updated in place and generated ids skip queued ids', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  t.configure({ held: 'queue' });
  const blocker = t.error('Blocker');
  t.info('First version', { id: 'toast-2' });
  t.info('Latest version', { id: 'toast-2' });
  const next = t.info('Another queued toast');
  assert.notEqual(next, 'toast-2');
  t.dismiss(blocker);
  mock.timers.tick(TIMING.closing);
  mock.timers.tick(TIMING.exit);
  assert.deepEqual(t.getState().toasts.map(({ id, title }) => ({ id, title })), [{ id: 'toast-2', title: 'Latest version' }]);
  mock.timers.reset();
});

test('reusing an explicit id during closing revives the same toast', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  t.error('First', { id: 'same' });
  t.dismiss('same');
  t.error('Back again', { id: 'same' });
  assert.deepEqual(t.getState().toasts.map(({ id, title, phase }) => ({ id, title, phase })),
    [{ id: 'same', title: 'Back again', phase: 'open' }]);
  mock.timers.tick(TIMING.closing + TIMING.exit);
  assert.equal(t.getState().toasts.length, 1, 'old closing timer was cancelled');
  mock.timers.reset();
});

test('list mode keeps distinct held rows independent when one id is reused or dismissed', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  const first = t.error('First', { id: 'first' });
  const second = t.error('Second', { id: 'second' });
  const quick = t.success('Quick');
  assert.deepEqual(t.getState().toasts.map((x) => x.id), [first, second, quick]);
  t.error('First changed', { id: first });
  assert.deepEqual(t.getState().toasts.map((x) => x.title), ['First changed', 'Second', 'Quick']);
  t.info('New quick'); // regular quick toasts still morph instead of stacking
  assert.deepEqual(t.getState().toasts.map((x) => x.title), ['First changed', 'Second', 'New quick']);
  t.dismiss(second);
  mock.timers.tick(TIMING.closing);
  mock.timers.tick(TIMING.exit);
  assert.deepEqual(t.getState().toasts.map((x) => x.title), ['First changed', 'New quick']);
  t.update(first, { title: 'Still independent' });
  assert.deepEqual(t.getState().toasts.map((x) => x.title), ['Still independent', 'New quick']);
  mock.timers.reset();
});

test('mixed id and phase operations never put duplicate ids on screen in any held mode', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  for (const held of ['list', 'queue', 'replace'] as const) {
    const t = createToaster();
    t.configure({ held });
    const unique = () => {
      const ids = t.getState().toasts.map((x) => x.id);
      assert.equal(new Set(ids).size, ids.length, `duplicate IDs in ${held}: ${ids}`);
    };
    t.subscribe(unique);
    t.error('First', { id: 'toast-1' });
    t.error('Second', { id: 'other' });
    t.error('First again', { id: 'toast-1' });
    const generated = t.error('Generated');
    assert.notEqual(generated, 'toast-1');
    t.dismiss('other');
    t.error('Second again', { id: 'other' });
    t.success('Quick');
    t.dismiss('toast-1');
    t.error('First revived', { id: 'toast-1' });
    mock.timers.tick(TIMING.openDelay);
    unique();
    t.dismiss();
    mock.timers.tick(TIMING.closing);
    mock.timers.tick(TIMING.exit);
    unique();
  }
  mock.timers.reset();
});

test('labels default to English, configure() overrides them key by key', () => {
  const t = createToaster();
  assert.deepEqual(t.getState().labels, { region: 'Notifications', dismiss: 'Dismiss notification' });
  t.configure({ labels: { dismiss: 'Fermer la notification' } });
  assert.deepEqual(t.getState().labels, { region: 'Notifications', dismiss: 'Fermer la notification' });
  t.configure({ labels: { region: 'Notifications système', dismiss: undefined } });
  assert.deepEqual(t.getState().labels, { region: 'Notifications système', dismiss: 'Fermer la notification' });
  t.configure({ theme: 'dark' });
  assert.equal(t.getState().labels.region, 'Notifications système', 'other options leave labels alone');
});

test('injectStyles sets the CSP nonce on the style element, and only once', () => {
  const added: { nonce?: string; attrs: Record<string, string> }[] = [];
  const doc = {
    querySelector: () => (added.length ? added[0] : null),
    createElement: () => ({ attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; } }),
    head: { prepend: (el: { nonce?: string; attrs: Record<string, string> }) => added.push(el) },
  } as unknown as Document;
  injectStyles(doc, { nonce: 'abc123' });
  injectStyles(doc, { nonce: 'other' });
  assert.equal(added.length, 1);
  assert.equal(added[0]?.nonce, 'abc123');
  assert.equal('data-toast' in (added[0]?.attrs ?? {}), true);
});

test('className rides on the toast and can be changed or removed by update()', () => {
  const t = createToaster();
  const id = t.success('hi', { className: 'mine' });
  assert.equal(t.getState().toasts[0]?.className, 'mine');
  t.update(id, { className: 'other' });
  assert.equal(t.getState().toasts[0]?.className, 'other');
  t.update(id, { className: null });
  assert.equal(t.getState().toasts[0]?.className, undefined);
  t.dismiss();
});

test('configure() accepts custom icons', async () => {
  const { ICONS } = await import('./icons.ts');
  const before = [...ICONS.info];
  const t = createToaster();
  t.configure({ icons: { info: ['M1 1h22', 'M2 2h20'], error: [] } });
  assert.deepEqual(ICONS.info, ['M1 1h22', 'M2 2h20']);
  assert.ok(ICONS.error.length > 0, 'empty list is ignored');
  t.configure({ icons: { info: before } });
});

test('configure() retunes springs', async () => {
  const { getSpringConfigs } = await import('./styles.ts');
  const t = createToaster();
  const was = { ...getSpringConfigs().enter };
  t.configure({ springs: { enter: { stiffness: 500, damping: 30 } } });
  assert.equal(getSpringConfigs().enter.stiffness, 500);
  t.configure({ springs: { enter: was } });
});

test('a held toast keeps its slot: a quick toast opens beside it, the next quick one morphs that one', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  t.error('Could not save', { action: { label: 'Retry', onClick: () => undefined } });
  t.success('Saved');
  assert.deepEqual(t.getState().toasts.map((x) => x.title), ['Could not save', 'Saved'], 'the error is not buried');
  t.info('Synced');
  assert.deepEqual(t.getState().toasts.map((x) => x.title), ['Could not save', 'Synced'], 'quick toasts share one slot');
  t.error('Upload failed', { action: { label: 'Fix', onClick: () => undefined } });
  assert.deepEqual(t.getState().toasts.map((x) => x.title), ['Could not save', 'Upload failed'], 'a second error takes the quick slot, the first error stays');
  t.success('Saved');
  assert.deepEqual(t.getState().toasts.map((x) => x.title), ['Could not save', 'Upload failed', 'Saved'], 'both errors stay, the quick toast opens a third slot');
  mock.timers.tick(TIMING.openDelay);
  mock.timers.tick(TIMING.duration);
  mock.timers.tick(TIMING.closing);
  mock.timers.tick(TIMING.exit);
  assert.deepEqual(t.getState().toasts.map((x) => x.title), ['Could not save', 'Upload failed'], 'the quick toast leaves on its own, the errors stay');
  mock.timers.reset();
});

test('without a held toast one toast still morphs; a loading toast is not held', () => {
  const t = createToaster();
  t.success('a');
  t.error('b');
  assert.equal(t.getState().toasts.length, 1);
  const u = createToaster();
  u.loading('Working');
  u.error('Failed');
  assert.equal(u.getState().toasts.length, 1, 'loading is replaced as before');
});

test("held: 'replace' lets a new toast take over a held one, as before", () => {
  const t = createToaster();
  t.configure({ held: 'replace' });
  t.error('Could not save', { action: { label: 'Retry', onClick: () => undefined } });
  t.success('Saved');
  assert.deepEqual(t.getState().toasts.map((x) => x.title), ['Saved']);
});

test("held: 'queue' makes new toasts wait in line, and shows them one after another", () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  t.configure({ held: 'queue' });
  const err = t.error('Could not save', { action: { label: 'Retry', onClick: () => undefined } });
  t.success('Saved 1');
  t.success('Saved 2');
  t.error('Upload failed');
  assert.deepEqual(t.getState().toasts.map((x) => x.title), ['Could not save'], 'one toast on screen');
  const leave = () => {
    mock.timers.tick(TIMING.openDelay);
    mock.timers.tick(TIMING.duration);
    mock.timers.tick(TIMING.closing);
    mock.timers.tick(TIMING.exit);
  };
  t.dismiss(err);
  mock.timers.tick(TIMING.closing);
  mock.timers.tick(TIMING.exit);
  assert.deepEqual(t.getState().toasts.map((x) => x.title), ['Saved 1'], 'first in line');
  leave();
  assert.deepEqual(t.getState().toasts.map((x) => x.title), ['Saved 2'], 'then the next');
  leave();
  assert.deepEqual(t.getState().toasts.map((x) => x.title), ['Upload failed'], 'then the last, which stays');
  mock.timers.reset();
});

test("held: 'queue' passes updates to a toast that is still waiting", () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const t = createToaster();
  t.configure({ held: 'queue' });
  const err = t.error('Could not save');
  const wait = t.loading('Uploading');
  t.update(wait, { type: 'success', title: 'Uploaded' });
  t.dismiss(err);
  mock.timers.tick(TIMING.closing);
  mock.timers.tick(TIMING.exit);
  assert.equal(t.getState().toasts[0]?.title, 'Uploaded');
  assert.equal(t.getState().toasts[0]?.type, 'success');
  mock.timers.reset();
});

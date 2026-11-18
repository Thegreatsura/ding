import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindToast, createToaster, mountToaster, onToastKey, toast } from '../src/index.ts';

let unmount: (() => void) | undefined;

beforeEach(() => void vi.useFakeTimers());

// The store is a module singleton: remove every toast (they leave on timers) and restore defaults between tests.
afterEach(() => {
  unmount?.();
  unmount = undefined;
  toast.dismiss();
  vi.advanceTimersByTime(1000);
  vi.useRealTimers();
  toast.configure({
    position: 'top-center',
    theme: 'system',
    labels: { region: 'Notifications', dismiss: 'Dismiss notification' },
    held: 'list',
  });
  document.querySelector('style[data-toast]')?.remove();
});

const mount = (opts?: Parameters<typeof mountToaster>[0]) => (unmount = mountToaster(opts));
const viewport = () => document.querySelector<HTMLElement>('.tst-viewport')!;

describe('mountToaster', () => {
  it('renders the viewport as a labelled region with its live regions', () => {
    mount();
    expect(viewport().getAttribute('role')).toBe('region');
    expect(viewport().getAttribute('aria-label')).toBe('Notifications');
    expect(viewport().querySelector('[role="status"]')).not.toBeNull();
    expect(viewport().querySelector('[role="alert"]')).not.toBeNull();
  });

  it('forwards position and theme to the store and the markup', () => {
    mount({ position: 'bottom-right', theme: 'dark' });
    expect(toast.getState().position).toBe('bottom-right');
    expect(viewport().dataset.position).toBe('bottom-right');
    expect(viewport().dataset.tstTheme).toBe('dark');
  });

  it('uses the labels option for the region and the close button', () => {
    mount({ labels: { region: 'Alertes', dismiss: 'Fermer' } });
    toast.error('Boom', { duration: 0 });
    expect(viewport().getAttribute('aria-label')).toBe('Alertes');
    expect(document.querySelector('.tst-close')?.getAttribute('aria-label')).toBe('Fermer');
  });

  it('announces toasts through the live regions', () => {
    mount();
    toast.success('Saved');
    expect(viewport().querySelector('[role="status"]')?.textContent).toContain('Saved');
    toast.error('Payment failed');
    expect(viewport().querySelector('[role="alert"]')?.textContent).toContain('Payment failed');
  });

  it('dismisses a sticky toast from its close button', () => {
    mount();
    const id = toast.error('Boom', { duration: 0 });
    const close = document.querySelector<HTMLButtonElement>('.tst-close');
    expect(close).not.toBeNull();
    close!.click();
    expect(toast.getState().toasts.find((t) => t.id === id)?.phase).toBe('closing');
  });

  it('closes a visible toast after another caller takes over its physical slot', () => {
    mount({ held: 'replace' });
    const old = toast.error('Old');
    toast.error('New');
    toast.dismiss(old);
    expect(toast.getState().toasts[0]?.phase).toBe('enter');
    document.querySelector<HTMLButtonElement>('.tst-close')!.click();
    expect(toast.getState().toasts[0]?.phase).toBe('closing');
  });

  it('pointercancel resets a drag without dismissing or flinging the toast', () => {
    mount();
    const id = toast.error('Drag cancel');
    const slot = document.querySelector<HTMLElement>('.tst-slot')!;
    slot.setPointerCapture = () => {};
    slot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 500, clientY: 300 }));
    slot.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 500, clientY: 230 }));
    slot.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
    expect(toast.getState().toasts.find((t) => t.id === id)?.phase).toBe('enter');
    expect(slot.hasAttribute('data-flung')).toBe(false);
    expect(slot.hasAttribute('data-dragging')).toBe(false);
    expect(slot.style.getPropertyValue('--dy')).toBe('');
  });

  it('still flings and dismisses on an actual pointerup', () => {
    mount();
    const id = toast.error('Drag away');
    const slot = document.querySelector<HTMLElement>('.tst-slot')!;
    slot.setPointerCapture = () => {};
    slot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 500, clientY: 300 }));
    slot.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 500, clientY: 230 }));
    expect(toast.getState().toasts.find((t) => t.id === id)?.phase).toBe('exit');
    expect(slot.hasAttribute('data-flung')).toBe(true);
  });

  it('stops writing to a pill after unbinding its motion', () => {
    const t = createToaster();
    const id = t.success('Cleanup');
    const vp = document.createElement('div');
    vp.className = 'tst-viewport';
    vp.dataset.position = 'top-right';
    vp.innerHTML = '<div class="tst-slot"><div class="tst" data-phase="enter" data-type="success"><div class="tst-body"><div class="tst-copy"><div class="tst-title">Cleanup</div></div></div></div></div>';
    document.body.append(vp);
    const pill = vp.querySelector<HTMLElement>('.tst')!;
    const unbind = bindToast(vp.querySelector<HTMLElement>('.tst-slot')!, id, t);
    try {
      unbind();
      const before = pill.getAttribute('style');
      vi.advanceTimersByTime(100);
      expect(pill.getAttribute('style')).toBe(before);
    } finally {
      vp.remove();
      t.dismiss();
    }
  });

  it('lays out both viewports scheduled in the same frame', () => {
    mount();
    const second = mountToaster({ position: 'bottom-right' });
    try {
      toast.error('Two viewports');
      vi.advanceTimersByTime(32);
      const slots = [...document.querySelectorAll<HTMLElement>('.tst-viewport .tst-slot')];
      expect(slots).toHaveLength(2);
      expect(slots.map((s) => s.style.getPropertyValue('--tst-ey'))).toEqual(['0px', '0px']);
    } finally {
      second();
    }
  });

  it('keeps keyboard shortcuts when one of two mounted toasters unmounts', () => {
    mount();
    const second = mountToaster({ position: 'bottom-right' });
    second();
    const id = toast.error('Still listening');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', altKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement?.closest('.tst-slot')?.querySelector('.tst-title')?.textContent).toBe('Still listening');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(toast.getState().toasts.find((t) => t.id === id)?.phase).toBe('closing');
  });

  it('lists a held toast and a quick one together, each in its own slot', () => {
    mount();
    toast.error('Payment failed', { action: { label: 'Retry', onClick() {} } });
    toast.success('Saved');
    expect(document.querySelectorAll('.tst-slot')).toHaveLength(2);
    expect(document.querySelector('.tst-title')?.textContent).toBe('Payment failed');
  });

  it('Alt+T focuses the newest toast even when keyboard code is unavailable', () => {
    mount();
    toast.error('Older');
    toast.error('Newest');
    const event = new KeyboardEvent('keydown', { key: 'T', altKey: true, bubbles: true, cancelable: true });
    onToastKey(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.closest('.tst-slot')?.querySelector('.tst-title')?.textContent).toBe('Newest');
    expect(document.activeElement?.closest('.tst-slot')?.hasAttribute('data-shortcut-focus')).toBe(true);
  });

  it('Alt+T keeps a timed toast paused until focus leaves the viewport', () => {
    mount();
    const outside = document.createElement('button');
    document.body.append(outside);
    const id = toast.success('Timed', { duration: 1000 });
    vi.advanceTimersByTime(450);
    onToastKey(new KeyboardEvent('keydown', { key: 't', altKey: true, cancelable: true }));
    expect(document.activeElement?.closest('.tst-slot')).not.toBeNull();
    viewport().dispatchEvent(new PointerEvent('pointerleave'));
    vi.advanceTimersByTime(1500);
    expect(toast.getState().toasts.find((t) => t.id === id)?.phase).toBe('open');
    outside.focus();
    vi.advanceTimersByTime(1000);
    expect(toast.getState().toasts.find((t) => t.id === id)?.phase).toBe('closing');
    outside.remove();
  });

  it('Escape closes only the focused toast in list mode, not the other held toast', () => {
    mount();
    const first = toast.error('First');
    const second = toast.error('Second');
    vi.advanceTimersByTime(450);
    document.querySelector<HTMLButtonElement>('.tst-slot .tst-close')!.focus();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(toast.getState().toasts.find((t) => t.id === first)?.phase).toBe('closing');
    expect(toast.getState().toasts.find((t) => t.id === second)?.phase).toBe('open');
  });

  it('Escape outside the viewport clears visible toasts and the queue', () => {
    mount({ held: 'queue' });
    const first = toast.error('First');
    toast.error('Waiting');
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(toast.getState().toasts.find((t) => t.id === first)?.phase).toBe('closing');
    vi.advanceTimersByTime(340 + 220);
    expect(toast.getState().toasts).toHaveLength(0);
    outside.remove();
  });

  it('Escape on a focused queued toast advances the queue, and ignores dialogs or consumed keys', () => {
    mount({ held: 'queue' });
    toast.error('First');
    toast.error('Waiting');
    vi.advanceTimersByTime(450);
    const dialog = document.createElement('dialog');
    const input = document.createElement('input');
    dialog.append(input);
    document.body.append(dialog);
    input.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(toast.getState().toasts[0]?.phase).toBe('open');
    const consumed = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    consumed.preventDefault();
    document.dispatchEvent(consumed);
    expect(toast.getState().toasts[0]?.phase).toBe('open');
    document.querySelector<HTMLButtonElement>('.tst-close')!.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(340 + 220);
    expect(toast.getState().toasts.map((t) => t.title)).toEqual(['Waiting']);
    dialog.remove();
  });

  it('Escape on a focused replace-mode toast closes it only once', () => {
    mount({ held: 'replace' });
    const old = toast.error('Old');
    toast.error('New');
    vi.advanceTimersByTime(450);
    toast.dismiss(old);
    expect(toast.getState().toasts[0]?.phase).toBe('open');
    document.querySelector<HTMLButtonElement>('.tst-close')!.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(toast.getState().toasts.map((t) => [t.title, t.phase])).toEqual([['New', 'closing']]);
  });


  it('reuses a named held slot while separate held toasts remain independently dismissible', () => {
    mount();
    toast.error('First', { id: 'first' });
    toast.error('First revised', { id: 'first' });
    const second = toast.error('Second');
    expect(document.querySelectorAll('.tst-slot')).toHaveLength(2);
    expect([...document.querySelectorAll('.tst-title')].map((x) => x.textContent)).toEqual(['First revised', 'Second']);
    toast.dismiss('first');
    vi.advanceTimersByTime(340);
    vi.advanceTimersByTime(220);
    expect(document.querySelectorAll('.tst-slot')).toHaveLength(1);
    expect(toast.getState().toasts[0]?.id).toBe(second);
  });

  it('keeps the close button last when a sticky toast morphs into one with an action', () => {
    mount({ held: 'replace' }); // a held toast is only morphed in this mode
    toast.error('Payment failed', { description: 'Card declined' }); // sticky: gets a close button first
    toast.success('Message deleted', { action: { label: 'Undo', onClick: () => ({ type: 'info', title: 'Restored' }) } });
    const body = document.querySelector('.tst-body')!;
    const kinds = [...body.querySelectorAll('button')].map((b) => b.className.replace('tst-', ''));
    expect(kinds).toEqual(['action', 'close']);
  });

  it('puts the secondary button before the action, also when morphing from a sticky toast', () => {
    mount({ held: 'replace' });
    toast.error('Boom'); // leaves a close button behind while the new buttons are added
    toast.info('Update ready', { action: { label: 'Reload', onClick() {} }, secondary: { label: 'Later', onClick() {} } });
    const kinds = [...document.querySelectorAll('.tst-body button')].map((b) => b.textContent || 'close');
    expect(kinds).toEqual(['Later', 'Reload']);
  });

  it('sizes its icons itself, so they stay small when the stylesheet is blocked', () => {
    mount();
    toast.error('Boom', { duration: 0 });
    const size = (sel: string) => [document.querySelector(sel)?.getAttribute('width'), document.querySelector(sel)?.getAttribute('height')];
    expect(size('.tst-svg')).toEqual(['22', '22']);
    expect(size('.tst-close svg')).toEqual(['12', '12']);
    toast.info('Photo', { image: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
    expect(size('.tst-media')).toEqual(['28', '28']);
  });

  it('puts the nonce on the injected stylesheet', () => {
    mount({ nonce: 'abc123' });
    const style = document.querySelector<HTMLStyleElement>('style[data-toast]');
    expect(style).not.toBeNull();
    expect(style!.nonce).toBe('abc123');
  });

  it('removes its markup when unmounted', () => {
    mount();
    toast.success('Saved');
    unmount!();
    unmount = undefined;
    expect(document.querySelector('.tst-viewport')).toBeNull();
  });

  it('mounts with a toast without throwing (animations are not asserted)', () => {
    expect(() => {
      mount();
      toast.loading('Uploading', { progress: 0.4 });
    }).not.toThrow();
  });
});

describe('tab visibility', () => {
  const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  const phase = (id: string) => toast.getState().toasts.find((t) => t.id === id)?.phase;

  afterEach(() => setHidden(false));

  it('stops the timer while the tab is hidden and resumes with the time left', () => {
    mount();
    const id = toast.success('Saved', { duration: 1000 });
    vi.advanceTimersByTime(450 + 600);
    setHidden(true);
    vi.advanceTimersByTime(10_000);
    expect(phase(id)).toBe('open');
    setHidden(false);
    vi.advanceTimersByTime(399);
    expect(phase(id)).toBe('open');
    vi.advanceTimersByTime(1);
    expect(phase(id)).toBe('closing');
  });

  it('keeps a toast created while the tab is hidden until the user comes back', () => {
    mount();
    setHidden(true);
    const id = toast.success('Saved', { duration: 1000 });
    vi.advanceTimersByTime(10_000);
    expect(phase(id)).toBe('open');
    setHidden(false);
    vi.advanceTimersByTime(999);
    expect(phase(id)).toBe('open');
    vi.advanceTimersByTime(1);
    expect(phase(id)).toBe('closing');
  });

  it('closes an expired toast if the tab hides before its timer callback runs', () => {
    mount();
    const id = toast.success('Saved', { duration: 1000 });
    vi.advanceTimersByTime(450);
    vi.setSystemTime(Date.now() + 1000);
    setHidden(true);
    vi.advanceTimersByTime(5000);
    expect(phase(id)).toBe('open');
    setHidden(false);
    vi.advanceTimersByTime(1);
    expect(phase(id)).toBe('closing');
  });

  it('stays paused on return while the pointer is over the toaster', () => {
    mount();
    const id = toast.success('Saved', { duration: 1000 });
    vi.advanceTimersByTime(450);
    viewport().dispatchEvent(new PointerEvent('pointerenter'));
    setHidden(true);
    setHidden(false);
    vi.advanceTimersByTime(5000);
    expect(phase(id)).toBe('open');
    viewport().dispatchEvent(new PointerEvent('pointerleave'));
    vi.advanceTimersByTime(1000);
    expect(phase(id)).toBe('closing');
  });

  it('stays paused on return while a toast has keyboard focus', () => {
    mount();
    const outside = document.createElement('button');
    document.body.append(outside);
    const id = toast.success('Saved', { duration: 1000 });
    vi.advanceTimersByTime(450);
    onToastKey(new KeyboardEvent('keydown', { key: 't', altKey: true, cancelable: true }));
    expect(document.activeElement?.closest('.tst-slot')).not.toBeNull();
    setHidden(true);
    setHidden(false);
    vi.advanceTimersByTime(5000);
    expect(phase(id)).toBe('open');
    outside.focus();
    vi.advanceTimersByTime(1000);
    expect(phase(id)).toBe('closing');
    outside.remove();
  });

  it('stays paused on return after toast.pause()', () => {
    mount();
    const id = toast.success('Saved', { duration: 1000 });
    vi.advanceTimersByTime(450);
    toast.pause(id);
    setHidden(true);
    setHidden(false);
    vi.advanceTimersByTime(5000);
    expect(phase(id)).toBe('open');
    toast.resume(id);
    vi.advanceTimersByTime(1000);
    expect(phase(id)).toBe('closing');
  });

  it('toast.resume() while the tab is hidden waits for the tab to come back', () => {
    mount();
    const id = toast.success('Saved', { duration: 1000 });
    vi.advanceTimersByTime(450);
    toast.pause(id);
    setHidden(true);
    toast.resume(id);
    vi.advanceTimersByTime(5000);
    expect(phase(id)).toBe('open');
    setHidden(false);
    vi.advanceTimersByTime(1000);
    expect(phase(id)).toBe('closing');
  });

  const barFraction = () =>
    Number(viewport().querySelector<HTMLElement>('.tst-slot')!.style.getPropertyValue('--tst-time-left'));

  it('draws the countdown from the remaining lifetime before and after switching tabs', () => {
    mount();
    const options = { duration: 1000, action: { label: 'Undo', onClick() {} } };
    const id = toast.success('Deleted', options);
    expect(barFraction()).toBe(1);
    vi.advanceTimersByTime(450 + 600);
    setHidden(true);
    expect(barFraction()).toBeCloseTo(0.4);
    vi.advanceTimersByTime(10_000);
    expect(barFraction()).toBeCloseTo(0.4);
    setHidden(false);
    expect(barFraction()).toBeCloseTo(0.4);
    vi.advanceTimersByTime(200);
    expect(barFraction()).toBeCloseTo(0.2, 1);
    vi.advanceTimersByTime(200);
    expect(phase(id)).toBe('closing');
    expect(barFraction()).toBe(0);
  });

  it('restarts the countdown bar when an open toast gets the same duration again', () => {
    mount();
    const options = { duration: 2000, action: { label: 'Undo', onClick() {} } };
    const id = toast.success('Deleted', options);
    vi.advanceTimersByTime(450 + 1500);
    expect(barFraction()).toBeCloseTo(0.25, 1);
    toast.success('Deleted again', options);
    expect(barFraction()).toBe(1);
    vi.advanceTimersByTime(1999);
    expect(phase(id)).toBe('open');
    vi.advanceTimersByTime(1);
    expect(phase(id)).toBe('closing');
  });

  it('draws a full bar for a toast created or retimed in a hidden tab', () => {
    mount();
    setHidden(true);
    const id = toast.success('Deleted', { duration: 2200, action: { label: 'Undo', onClick() {} } });
    vi.advanceTimersByTime(1000);
    expect(barFraction()).toBe(1);
    toast.update(id, { duration: 3000 });
    vi.advanceTimersByTime(10_000);
    expect(barFraction()).toBe(1);
    setHidden(false);
    vi.advanceTimersByTime(1500);
    expect(barFraction()).toBeCloseTo(0.5, 1);
  });

  it('lets a toast that is already leaving finish while the tab is hidden', () => {
    mount();
    const id = toast.success('Saved', { duration: 1000 });
    vi.advanceTimersByTime(450 + 1000);
    expect(phase(id)).toBe('closing');
    setHidden(true);
    vi.advanceTimersByTime(1000);
    expect(phase(id)).toBeUndefined();
  });
});

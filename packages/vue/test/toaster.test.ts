import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createSSRApp, nextTick, reactive } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { Toaster, toast } from '../src/index.ts';

let wrapper: VueWrapper | undefined;

beforeEach(() => void vi.useFakeTimers());

// The store is a module singleton: remove every toast (they leave on timers) and restore defaults between tests.
afterEach(() => {
  vi.restoreAllMocks();
  wrapper?.unmount();
  wrapper = undefined;
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

const mountToaster = (props: Record<string, unknown> = {}) => (wrapper = mount(Toaster, { props }));
const viewport = () => document.querySelector<HTMLElement>('.tst-viewport')!;

describe('Vue Toaster', () => {
  it('keeps a held toast and shows a quick one in its own slot, in every held mode', async () => {
    mountToaster();
    toast.error('Payment failed', { action: { label: 'Retry', onClick() {} } });
    toast.success('Saved');
    await nextTick();
    expect(document.querySelectorAll('.tst-slot')).toHaveLength(2);
    expect(document.querySelector('.tst-title')?.textContent).toBe('Payment failed');
    toast.configure({ held: 'replace' });
    toast.dismiss();
    vi.advanceTimersByTime(1000);
    toast.error('Payment failed', { action: { label: 'Retry', onClick() {} } });
    toast.success('Saved');
    await nextTick();
    expect(document.querySelectorAll('.tst-slot')).toHaveLength(1);
  });

  it('reuses an explicit id in one DOM slot while a different id remains independent', () => {
    mountToaster();
    toast.error('First', { id: 'first' });
    toast.error('First revised', { id: 'first' });
    toast.error('Second', { id: 'second' });
    expect(document.querySelectorAll('.tst-slot')).toHaveLength(2);
    expect([...document.querySelectorAll('.tst-title')].map((x) => x.textContent)).toEqual(['First revised', 'Second']);
    toast.dismiss('first');
    vi.advanceTimersByTime(340);
    vi.advanceTimersByTime(220);
    expect([...document.querySelectorAll('.tst-title')].map((x) => x.textContent)).toEqual(['Second']);
  });

  it('renders the viewport as a labelled region with its live regions', () => {
    mountToaster();
    expect(viewport().getAttribute('role')).toBe('region');
    expect(viewport().getAttribute('aria-label')).toBe('Notifications');
    expect(viewport().querySelector('[role="status"]')).not.toBeNull();
    expect(viewport().querySelector('[role="alert"]')).not.toBeNull();
  });

  it('forwards position and theme to the store and the markup', () => {
    mountToaster({ position: 'bottom-right', theme: 'dark' });
    expect(toast.getState().position).toBe('bottom-right');
    expect(viewport().dataset.position).toBe('bottom-right');
    expect(viewport().dataset.tstTheme).toBe('dark');
  });

  it('follows prop changes after mount', async () => {
    mountToaster({ position: 'top-center', theme: 'light' });
    await wrapper!.setProps({ position: 'bottom-left', theme: 'dark', labels: { region: 'Alertes' } });
    expect(viewport().dataset.position).toBe('bottom-left');
    expect(viewport().dataset.tstTheme).toBe('dark');
    expect(viewport().getAttribute('aria-label')).toBe('Alertes');
  });

  it('uses the labels prop for the region and the close button', () => {
    mountToaster({ labels: { region: 'Alertes', dismiss: 'Fermer' } });
    toast.error('Boom', { duration: 0 });
    expect(viewport().getAttribute('aria-label')).toBe('Alertes');
    expect(document.querySelector('.tst-close')?.getAttribute('aria-label')).toBe('Fermer');
  });

  it('only reconfigures when individual prop values change', async () => {
    mountToaster({ position: 'top-center', theme: 'light', labels: { region: 'Notifications', dismiss: 'Dismiss' } });
    const configure = vi.spyOn(toast, 'configure');

    await wrapper!.setProps({ labels: { region: 'Notifications', dismiss: 'Dismiss' } });
    expect(configure).not.toHaveBeenCalled();

    await wrapper!.setProps({ position: 'bottom-left' });
    expect(configure).toHaveBeenCalledTimes(1);
    expect(viewport().dataset.position).toBe('bottom-left');

    await wrapper!.setProps({ theme: 'dark' });
    expect(configure).toHaveBeenCalledTimes(2);
    expect(viewport().dataset.tstTheme).toBe('dark');

    await wrapper!.setProps({ labels: { region: 'Alertes', dismiss: 'Dismiss' } });
    expect(configure).toHaveBeenCalledTimes(3);
    expect(viewport().getAttribute('aria-label')).toBe('Alertes');

    toast.error('Boom', { duration: 0 });
    await wrapper!.setProps({ labels: { region: 'Alertes', dismiss: 'Fermer' } });
    expect(configure).toHaveBeenCalledTimes(4);
    expect(document.querySelector('.tst-close')?.getAttribute('aria-label')).toBe('Fermer');
  });

  it('follows nested changes to reactive labels', async () => {
    const labels = reactive({ region: 'Notifications', dismiss: 'Dismiss' });
    mountToaster({ labels });
    toast.error('Boom', { duration: 0 });

    labels.region = 'Alertes';
    labels.dismiss = 'Fermer';
    await nextTick();

    expect(viewport().getAttribute('aria-label')).toBe('Alertes');
    expect(document.querySelector('.tst-close')?.getAttribute('aria-label')).toBe('Fermer');
  });

  it('announces toasts through the live regions', () => {
    mountToaster();
    toast.success('Saved');
    expect(viewport().querySelector('[role="status"]')?.textContent).toContain('Saved');
    toast.error('Payment failed');
    expect(viewport().querySelector('[role="alert"]')?.textContent).toContain('Payment failed');
  });

  it('dismisses a sticky toast from its close button', () => {
    mountToaster();
    const id = toast.error('Boom', { duration: 0 });
    const close = document.querySelector<HTMLButtonElement>('.tst-close');
    expect(close).not.toBeNull();
    close!.click();
    expect(toast.getState().toasts.find((t) => t.id === id)?.phase).toBe('closing');
  });

  it('closes the visible toast after its physical slot is taken over', () => {
    mountToaster();
    toast.configure({ held: 'replace' });
    const old = toast.error('Old');
    toast.error('New');
    toast.dismiss(old);
    expect(toast.getState().toasts[0]?.phase).toBe('enter');
    document.querySelector<HTMLButtonElement>('.tst-close')!.click();
    expect(toast.getState().toasts[0]?.phase).toBe('closing');
  });

  it('puts the nonce on the injected stylesheet', () => {
    mountToaster({ nonce: 'abc123' });
    const style = document.querySelector<HTMLStyleElement>('style[data-toast]');
    expect(style).not.toBeNull();
    expect(style!.nonce).toBe('abc123');
  });

  it('removes its markup when the component unmounts', async () => {
    mountToaster();
    toast.success('Saved');
    wrapper!.unmount();
    wrapper = undefined;
    await nextTick();
    expect(document.querySelector('.tst-viewport')).toBeNull();
  });

  it('renders nothing on the server', async () => {
    expect(await renderToString(createSSRApp(Toaster))).not.toContain('tst-viewport');
    expect(document.querySelector('.tst-viewport')).toBeNull();
  });

  it('mounts with a toast without throwing (animations are not asserted)', () => {
    expect(() => {
      mountToaster();
      toast.loading('Uploading', { progress: 0.4 });
    }).not.toThrow();
  });
});

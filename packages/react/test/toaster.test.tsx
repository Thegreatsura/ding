import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Toaster, toast } from '../src/index.tsx';

beforeEach(() => void vi.useFakeTimers());

// The store is a module singleton: remove every toast (they leave on timers) and restore defaults between tests.
afterEach(() => {
  cleanup();
  act(() => {
    toast.dismiss();
    vi.advanceTimersByTime(1000);
    toast.configure({
      position: 'top-center',
      theme: 'system',
      labels: { region: 'Notifications', dismiss: 'Dismiss notification' },
      held: 'list',
    });
  });
  vi.useRealTimers();
  document.querySelector('style[data-toast]')?.remove();
});

const viewport = (c: HTMLElement) => c.querySelector<HTMLElement>('.tst-viewport')!;

describe('React Toaster', () => {
  it('keeps a held toast and shows a quick one in its own slot, in every held mode', () => {
    const { container } = render(<Toaster />);
    act(() => {
      toast.error('Payment failed', { action: { label: 'Retry', onClick() {} } });
      toast.success('Saved');
    });
    expect(container.querySelectorAll('.tst-slot')).toHaveLength(2);
    expect(container.querySelector('.tst-title')?.textContent).toBe('Payment failed');
    act(() => toast.configure({ held: 'replace' }));
    act(() => {
      toast.dismiss();
      vi.advanceTimersByTime(1000);
      toast.error('Payment failed', { action: { label: 'Retry', onClick() {} } });
      toast.success('Saved');
    });
    expect(container.querySelectorAll('.tst-slot')).toHaveLength(1);
  });

  it('renders a reused explicit id once and distinct held ids in separate rows without key warnings', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { container } = render(<Toaster />);
      act(() => {
        toast.error('First', { id: 'first' });
        toast.error('First revised', { id: 'first' });
        toast.error('Second', { id: 'second' });
      });
      expect(container.querySelectorAll('.tst-slot')).toHaveLength(2);
      expect([...container.querySelectorAll('.tst-title')].map((x) => x.textContent)).toEqual(['First revised', 'Second']);
      expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key|unique key/i);
    } finally {
      error.mockRestore();
    }
  });

  it('Alt+T pauses a timed toast even after the pointer leaves, then resumes on blur', () => {
    const { container } = render(<><button>Outside</button><Toaster /></>);
    let id = '';
    act(() => { id = toast.success('Timed', { duration: 1000 }); vi.advanceTimersByTime(450); });
    act(() => fireEvent.keyDown(document, { key: 'T', altKey: true, code: '' }));
    expect(document.activeElement?.closest('.tst-slot')).not.toBeNull();
    act(() => fireEvent.pointerLeave(viewport(container)));
    act(() => vi.advanceTimersByTime(1500));
    expect(toast.getState().toasts.find((t) => t.id === id)?.phase).toBe('open');
    act(() => container.querySelector<HTMLButtonElement>('button')!.focus());
    act(() => vi.advanceTimersByTime(1000));
    expect(toast.getState().toasts.find((t) => t.id === id)?.phase).toBe('closing');
  });

  it('renders the viewport as a labelled region with its live regions', () => {
    const { container } = render(<Toaster />);
    const vp = viewport(container);
    expect(vp.getAttribute('role')).toBe('region');
    expect(vp.getAttribute('aria-label')).toBe('Notifications');
    expect(vp.querySelector('[role="status"]')).not.toBeNull();
    expect(vp.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('forwards position and theme to the store and the markup', () => {
    const { container } = render(<Toaster position="bottom-right" theme="dark" />);
    expect(toast.getState().position).toBe('bottom-right');
    expect(viewport(container).dataset.position).toBe('bottom-right');
    expect(viewport(container).dataset.tstTheme).toBe('dark');
  });

  it('uses the labels prop for the region and the close button', () => {
    const { container } = render(<Toaster labels={{ region: 'Alertes', dismiss: 'Fermer' }} />);
    act(() => void toast.error('Boom', { duration: 0 }));
    expect(viewport(container).getAttribute('aria-label')).toBe('Alertes');
    expect(container.querySelector('.tst-close')?.getAttribute('aria-label')).toBe('Fermer');
  });

  it('announces toasts through the live regions', () => {
    const { container } = render(<Toaster />);
    act(() => void toast.success('Saved'));
    expect(viewport(container).querySelector('[role="status"]')?.textContent).toContain('Saved');
    act(() => void toast.error('Payment failed'));
    expect(viewport(container).querySelector('[role="alert"]')?.textContent).toContain('Payment failed');
  });

  it('dismisses a sticky toast from its close button', () => {
    const { container } = render(<Toaster />);
    let id = '';
    act(() => void (id = toast.error('Boom', { duration: 0 })));
    const close = container.querySelector<HTMLButtonElement>('.tst-close');
    expect(close).not.toBeNull();
    act(() => fireEvent.click(close!));
    expect(toast.getState().toasts.find((t) => t.id === id)?.phase).toBe('closing');
  });

  it('closes the visible toast after its physical slot is taken over', () => {
    const { container } = render(<Toaster />);
    let old = '';
    act(() => {
      toast.configure({ held: 'replace' });
      old = toast.error('Old');
      toast.error('New');
      toast.dismiss(old);
    });
    expect(toast.getState().toasts[0]?.phase).toBe('enter');
    act(() => fireEvent.click(container.querySelector<HTMLButtonElement>('.tst-close')!));
    expect(toast.getState().toasts[0]?.phase).toBe('closing');
  });

  it('sizes its icons itself, so they stay small when the stylesheet is blocked', () => {
    const { container } = render(<Toaster />);
    act(() => void toast.error('Boom', { duration: 0 }));
    const size = (sel: string) => [container.querySelector(sel)?.getAttribute('width'), container.querySelector(sel)?.getAttribute('height')];
    expect(size('.tst-svg')).toEqual(['22', '22']);
    expect(size('.tst-close svg')).toEqual(['12', '12']);
    act(() => void toast.info('Photo', { image: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }));
    expect(size('.tst-media')).toEqual(['28', '28']);
  });

  it('keeps Escape working after one of two Toasters unmounts', () => {
    const App = ({ second }: { second: boolean }) => (
      <>
        {second && <Toaster position="bottom-right" />}
        <Toaster />
      </>
    );
    const { rerender } = render(<App second />);
    let id = '';
    act(() => void (id = toast.error('Still listening', { duration: 0 })));
    rerender(<App second={false} />);
    act(() => fireEvent.keyDown(document, { key: 'Escape', bubbles: true, cancelable: true }));
    expect(toast.getState().toasts.find((t) => t.id === id)?.phase).toBe('closing');
  });

  it('puts the nonce on the injected stylesheet', () => {
    render(<Toaster nonce="abc123" />);
    const style = document.querySelector<HTMLStyleElement>('style[data-toast]');
    expect(style).not.toBeNull();
    expect(style!.nonce).toBe('abc123');
  });

  it('mounts with a toast without throwing (animations are not asserted)', () => {
    expect(() => {
      render(<Toaster />);
      act(() => void toast.loading('Uploading', { progress: 0.4 }));
    }).not.toThrow();
  });

  it('adds a per-toast className to the toast element', () => {
    const { container } = render(<Toaster />);
    act(() => void toast.success('Saved', { className: 'mine' }));
    expect(container.querySelector('.tst.mine')).not.toBeNull();
  });
});

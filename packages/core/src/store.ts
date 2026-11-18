import type {
  HeldMode, Position, PromiseMessages, SpringSettings, Theme, ToastIcons, ToastItem, ToastLabels, ToasterState, ToastOptions, ToastPatch, ToastType,
} from './types';
import { chime } from './sound.ts';
import { setIcons } from './icons.ts';
import { setSprings } from './styles.ts';

export const TIMING = {
  /** shape arrives, then the pill opens */
  openDelay: 450,
  /** text erase + shrink back to shape */
  closing: 340,
  /** shape leaves the screen */
  exit: 220,
  duration: 5000,
};

/** Errors, toasts with an action, and loading hold until dismissed (WCAG 2.2.2). */
const autoDuration = (type: ToastType, hasAction: boolean) =>
  type === 'loading' || type === 'error' || hasAction ? 0 : TIMING.duration;

interface Entry {
  phaseTimer?: ReturnType<typeof setTimeout>;
  lifeTimer?: ReturnType<typeof setTimeout>;
  startedAt: number;
  /** ms left before auto-close */
  remaining: number;
  /** full duration, restored when the toast is bumped; 0 = sticky */
  base: number;
  paused: boolean;
  countdownSubs?: Set<() => void>;
}

export const countdown = Symbol();

const remainingLife = (e: Entry) =>
  e.lifeTimer === undefined ? e.remaining : Math.max(0, e.remaining - (Date.now() - e.startedAt));

const DEFAULT_LABELS: ToastLabels = { region: 'Notifications', dismiss: 'Dismiss notification' };

const definedOnly = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

export function createToaster() {
  let state: ToasterState = { toasts: [], position: 'top-center', theme: 'system', labels: DEFAULT_LABELS, status: '', alert: '' };
  let flip = false;
  const subs = new Set<() => void>();
  const entries = new Map<string, Entry>();
  let counter = 0;
  // sound: off by default. true = built-in synth, a function = your own (e.g. a sound library)
  let sound: boolean | ((type: ToastType) => void) = false;
  let volume = 0.5;
  // One toast at a time: a new call morphs the live toast instead of stacking. Each caller keeps its own id,
  // but only the newest caller may update the shared toast, so a stale loading->success can't hijack it.
  // What happens when a toast that stays (an error, a button) is on screen and another call comes in:
  // 'list' keeps it and opens the new toast in its own slot, 'queue' makes the new one wait, 'replace' morphs it (old behavior).
  let held: HeldMode = 'list';
  let releasing = false; // flush() is showing a waiting toast: it must not wait again
  const pending: { id: string; type: ToastType; title: string; opts: ToastOptions; holds: boolean }[] = [];
  const live = new Map<string, string>(); // caller id -> toast id
  const owner = new Map<string, string>(); // toast id -> newest caller id
  // Timers also stop while the tab is hidden, so a toast is never closed unseen. This is kept apart from
  // `Entry.paused` (hover, focus, toast.pause()): coming back to the tab must not resume a toast they still hold.
  const doc = typeof document === 'undefined' ? undefined : document;
  let hidden = !!doc?.hidden;

  const emit = () => subs.forEach((fn) => fn());
  const setToasts = (toasts: ToastItem[]) => {
    state = { ...state, toasts };
    emit();
  };
  /** Text goes into stable, always-mounted live regions. The trailing NBSP toggle re-announces identical text. */
  const announce = (type: ToastType, title: string, description?: string) => {
    try {
      if (typeof sound === 'function') sound(type);
      else if (sound) chime(type, volume);
    } catch {
      // Sound is optional; a broken custom player must not prevent the toast from opening.
    }
    flip = !flip;
    const text = (description ? `${title}. ${description}` : title) + (flip ? '\u00a0' : '');
    state = { ...state, [type === 'error' ? 'alert' : 'status']: text };
    emit();
  };
  const find = (id: string) => state.toasts.find((t) => t.id === id);
  const patch = (id: string, p: Partial<ToastItem>) =>
    setToasts(state.toasts.map((t) => (t.id === id ? { ...t, ...p } : t)));

  function startLife(id: string) {
    const e = entries.get(id);
    if (!e) return;
    clearTimeout(e.lifeTimer);
    e.lifeTimer = undefined;
    if (find(id)?.phase === 'open' && !e.paused && !hidden && e.base > 0) {
      e.startedAt = Date.now();
      e.lifeTimer = setTimeout(() => close(id), e.remaining);
    }
    e.countdownSubs?.forEach((fn) => fn());
  }

  function show(type: ToastType, title: string, opts: ToastOptions = {}): string {
    if (opts.id === undefined && !opts.action && !opts.secondary && !opts.image && !opts.meta && !opts.className) {
      // only a repeat of the newest toast collapses; an older identical one stays separate
      const dup = state.toasts.at(-1);
      if (dup && dup.type === type && dup.title === title && dup.description === opts.description &&
          dup.duration === (opts.duration ?? autoDuration(type, false)) && dup.progress === opts.progress &&
          (dup.phase === 'enter' || dup.phase === 'open')) {
        bump(dup.id);
        return owner.get(dup.id) ?? dup.id;
      }
    }
    let id = opts.id ?? `toast-${++counter}`;
    if (opts.id === undefined) {
      while (entries.has(id) || live.has(id) || pending.some((x) => x.id === id)) id = `toast-${++counter}`;
    }
    const open = state.toasts.filter((t) => t.phase === 'enter' || t.phase === 'open');
    const holds = (opts.duration ?? autoDuration(type, !!(opts.action || opts.secondary))) === 0;
    const isHeld = (t: ToastItem) => entries.get(t.id)?.base === 0 && t.type !== 'loading';
    const waiting = opts.id !== undefined ? pending.find((x) => x.id === id) : undefined;
    if (waiting) {
      Object.assign(waiting, { type, title, opts, holds });
      return id;
    }
    const same = opts.id !== undefined ? find(live.get(id) ?? id) : undefined;
    if (held === 'queue' && !releasing && !same && (open.some(isHeld) || pending.length)) {
      // a real queue: everything waits its turn, in order, and is shown once the toast before it is gone
      pending.push({ id, type, title, opts, holds });
      return id;
    }
    let cur = same ?? open.at(-1);
    if (held === 'list' && !same) {
      // a held toast keeps its own slot. A quick toast reuses the newest quick slot, or opens one next to the held ones.
      if (!holds) cur = open.filter((t) => !isHeld(t)).at(-1);
      else if (cur && isHeld(cur)) cur = undefined;
    }
    if (cur) {
      if (same && (same.phase === 'closing' || same.phase === 'exit')) {
        clearTimeout(entries.get(same.id)?.phaseTimer);
        patch(same.id, { phase: 'open' });
      }
      live.set(id, cur.id);
      owner.set(cur.id, id);
      patch(cur.id, { count: 1 });
      apply(cur.id, {
        type, title, description: opts.description ?? '', action: opts.action ?? null, secondary: opts.secondary ?? null, meta: opts.meta ?? null, image: opts.image ?? null, className: opts.className ?? null,
        progress: opts.progress ?? null, ...(opts.duration !== undefined && { duration: opts.duration }),
      });
      return id;
    }
    owner.set(id, id);
    const first = opts.duration ?? autoDuration(type, !!(opts.action || opts.secondary));
    const e: Entry = { startedAt: 0, remaining: first, base: first, paused: false };
    entries.set(id, e);
    setToasts([
      ...state.toasts,
      { id, type, title, description: opts.description, phase: 'enter', duration: e.remaining, action: opts.action, secondary: opts.secondary, meta: opts.meta, image: opts.image, progress: opts.progress, count: 1, className: opts.className },
    ]);
    announce(type, title, opts.description);
    e.phaseTimer = setTimeout(() => {
      if (find(id)?.phase !== 'enter') return;
      patch(id, { phase: 'open' });
      startLife(id);
    }, TIMING.openDelay);
    return id;
  }

  /** queue mode: when the screen is clear, show the next waiting toast. */
  function flush() {
    if (pending.length && !state.toasts.some((t) => t.phase === 'enter' || t.phase === 'open')) {
      const next = pending.shift()!;
      releasing = true;
      show(next.type, next.title, { ...next.opts, id: next.id });
      releasing = false;
    }
  }

  function update(callerId: string, p: ToastPatch) {
    const wait = pending.find((x) => x.id === callerId);
    if (wait) {
      // still waiting (queue mode): the patch goes into the toast that will be shown
      const o = wait.opts as Record<string, unknown>;
      for (const [k, v] of Object.entries(p)) {
        if (v === undefined) continue;
        if (k === 'type') wait.type = v as ToastType;
        else if (k === 'title') wait.title = v as string;
        else o[k] = v ?? undefined;
      }
      wait.holds = (wait.opts.duration ?? autoDuration(wait.type, !!(wait.opts.action || wait.opts.secondary))) === 0;
      return;
    }
    const id = live.get(callerId) ?? callerId;
    if (owner.get(id) === callerId) apply(id, p);
  }

  function apply(id: string, p: ToastPatch) {
    const t = find(id);
    const e = entries.get(id);
    if (!t || !e) return;
    patch(id, {
      ...(p.title !== undefined && { title: p.title }),
      ...(p.description !== undefined && { description: p.description }),
      ...(p.progress !== undefined && { progress: p.progress ?? undefined }),
      ...(p.action !== undefined && { action: p.action ?? undefined }),
      ...(p.secondary !== undefined && { secondary: p.secondary ?? undefined }),
      ...(p.meta !== undefined && { meta: p.meta ?? undefined }),
      ...(p.image !== undefined && { image: p.image ?? undefined }),
      ...(p.className !== undefined && { className: p.className ?? undefined }),
      ...(p.type !== undefined && { type: p.type }),
    });
    if (p.duration !== undefined) e.remaining = p.duration;
    else if (p.type !== undefined || p.action !== undefined || p.secondary !== undefined) {
      const n = find(id)!;
      e.remaining = autoDuration(n.type, !!(n.action || n.secondary));
    }
    if (p.duration !== undefined || p.type !== undefined || p.action !== undefined || p.secondary !== undefined) {
      e.base = e.remaining;
      patch(id, { duration: e.remaining });
    }
    startLife(id);
    // Progress ticks stay silent, but a completed progress bar with new copy is a result worth announcing.
    const quiet = p.progress !== undefined && p.type === undefined &&
      !(p.progress === 1 && ((p.title !== undefined && p.title !== t.title) ||
        (p.description !== undefined && p.description !== t.description)));
    if (!quiet && (p.title !== undefined || p.description !== undefined || p.type !== undefined)) {
      announce(p.type ?? t.type, p.title ?? t.title, p.description ?? t.description);
    }
  }

  /** Run a toast's action. A returned patch morphs the toast in place; otherwise it closes. */
  function act(id: string, which: 'action' | 'secondary' = 'action') {
    const current = find(id);
    const caller = owner.get(id);
    const result = current?.[which]?.onClick();
    // The handler may replace this slot synchronously. Never mutate or close its new owner.
    if (!current || owner.get(id) !== caller || find(id) !== current) return;
    if (result && typeof result === 'object' && !('then' in result)) {
      apply(id, { action: null, secondary: null, ...result });
    } else close(id);
  }

  function bump(id: string) {
    const e = entries.get(id);
    const t = find(id);
    if (!e || !t) return;
    patch(id, { count: t.count + 1 });
    e.remaining = e.base;
    startLife(id);
  }

  /** Dismiss by a call's returned id; an older caller cannot close a newer message. */
  function dismiss(id?: string, opts: { immediate?: boolean } = {}) {
    if (id === undefined) return (pending.length = 0, state.toasts.forEach((t) => close(t.id, opts)));
    const waiting = pending.findIndex((x) => x.id === id);
    if (waiting >= 0) return void pending.splice(waiting, 1);
    const callerId = id;
    id = live.get(callerId) ?? callerId;
    if (owner.get(id) !== callerId) return void live.delete(callerId);
    close(id, opts);
  }

  /** Close a visible toast by ToastItem.id, regardless of its caller. For renderers and drag-away. */
  function close(id: string, opts: { immediate?: boolean } = {}) {
    const t = find(id);
    const e = entries.get(id);
    if (!t || !e || t.phase === 'exit' || (t.phase === 'closing' && !opts.immediate)) return;
    clearTimeout(e.phaseTimer);
    stopLife(e);
    const leave = () => {
      patch(id, { phase: 'exit' });
      e.phaseTimer = setTimeout(() => {
        entries.delete(id);
        owner.delete(id);
        live.forEach((v, k) => v === id && live.delete(k));
        setToasts(state.toasts.filter((x) => x.id !== id));
        flush();
      }, TIMING.exit);
    };
    if (opts.immediate) return leave();
    patch(id, { phase: 'closing' });
    e.phaseTimer = setTimeout(leave, TIMING.closing);
  }

  /** Stop the running auto-close timer and keep the time left. Exit animations already started keep going. */
  function stopLife(e: Entry) {
    if (e.lifeTimer === undefined) return;
    e.remaining = remainingLife(e);
    clearTimeout(e.lifeTimer);
    e.lifeTimer = undefined;
    e.countdownSubs?.forEach((fn) => fn());
  }

  function pause(id?: string) {
    if (id === undefined) return [...entries.keys()].forEach(pause);
    const e = entries.get(id);
    if (!e || e.paused) return;
    e.paused = true;
    stopLife(e);
  }

  function resume(id?: string) {
    if (id === undefined) return [...entries.keys()].forEach(resume);
    const e = entries.get(id);
    if (!e) return;
    e.paused = false;
    startLife(id);
  }

  doc?.addEventListener('visibilitychange', () => {
    if (hidden === doc.hidden) return;
    hidden = doc.hidden;
    if (hidden) entries.forEach(stopLife);
    else entries.forEach((_, id) => startLife(id));
  });

  function promise<T>(p: Promise<T> | (() => Promise<T>), m: PromiseMessages<T>): Promise<T> {
    const id = show('loading', m.loading);
    let pr: Promise<T>;
    try {
      pr = typeof p === 'function' ? p() : p;
    } catch (err) {
      pr = Promise.reject(err);
    }
    pr.then(
      (v) => update(id, { type: 'success', title: typeof m.success === 'function' ? m.success(v) : m.success }),
      (err) => update(id, { type: 'error', title: typeof m.error === 'function' ? m.error(err) : m.error }),
    );
    return pr;
  }

  return {
    [countdown](id: string, onChange: () => void) {
      const e = entries.get(id);
      if (!e) return;
      const listeners = e.countdownSubs ??= new Set();
      listeners.add(onChange);
      return {
        remaining: () => e.base > 0 ? Math.min(1, remainingLife(e) / e.base) : 1,
        running: () => e.lifeTimer !== undefined,
        unsubscribe: () => listeners.delete(onChange),
      };
    },
    show,
    success: (title: string, o?: ToastOptions) => show('success', title, o),
    error: (title: string, o?: ToastOptions) => show('error', title, o),
    warning: (title: string, o?: ToastOptions) => show('warning', title, o),
    info: (title: string, o?: ToastOptions) => show('info', title, o),
    loading: (title: string, o?: ToastOptions) => show('loading', title, o),
    promise,
    update,
    act,
    dismiss,
    close,
    pause,
    resume,
    configure(c: {
      position?: Position;
      theme?: Theme;
      /** Partial: keys you leave out keep their current value. */
      labels?: Partial<ToastLabels>;
      sound?: boolean | ((type: ToastType) => void);
      volume?: number;
      /** Retune the springs. Applies to toasts shown afterwards. */
      springs?: SpringSettings;
      /** Replace status icons. Applies to toasts shown afterwards. */
      icons?: ToastIcons;
      /**
       * A toast that stays until closed (an error, a button, `duration: 0`) is on screen and another toast is shown.
       * `'list'` (default): the held toast keeps its place and the new one opens in its own slot.
       * `'queue'`: new toasts wait in line and are shown one after another once the held toast is gone.
       * `'replace'`: the new toast takes over the held one, which is lost.
       */
      held?: HeldMode;
    }) {
      if (c.springs) setSprings(c.springs);
      if (c.held) held = c.held;
      if (c.icons) setIcons(c.icons);
      if (c.sound !== undefined) sound = c.sound;
      if (c.volume !== undefined) volume = c.volume;
      // undefined keys are skipped so `{ region: undefined }` keeps the current label
      const labels = c.labels ? { ...state.labels, ...definedOnly(c.labels) } : state.labels;
      if ((c.position && c.position !== state.position) ||
          (c.theme && c.theme !== state.theme) ||
          labels.region !== state.labels.region || labels.dismiss !== state.labels.dismiss) {
        state = { ...state, position: c.position ?? state.position, theme: c.theme ?? state.theme, labels };
        emit();
      }
    },
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    getState: () => state,
  };
}

export type Toaster = ReturnType<typeof createToaster>;
export const toast: Toaster = createToaster();

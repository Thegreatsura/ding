
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';

import {
  toast,
  injectStyles,
  bindToast,
  retainToastKeys,
  ICONS,
  type Position,
  type Theme,
  type ToastItem,
  type ToastLabels,
} from '@yusufceng1z/ding';

export { toast };
export type { Position, Theme, ToastLabels };

type ItemProps = {
  toast: ToastItem;
  index: number;
  labels: ToastLabels;
};

function Item({ toast: item, index, labels }: ItemProps) {
  const slotRef = useRef<HTMLDivElement>(null);

  const isSticky =
    item.duration === 0 &&
    item.type !== 'loading' &&
    !item.secondary;

  useEffect(() => {
    if (!slotRef.current) return;

    return bindToast(slotRef.current, item.id);
  }, [item.id]);

  const slotStyle = {
    '--tst-i': index,
  } as CSSProperties;

  const toastStyle = {
    '--tst-life': `${item.duration}ms`,
  } as CSSProperties;

  const progressStyle = {
    '--pg': item.progress,
  } as CSSProperties;

  const handleAction = () => toast.act(item.id);

  const handleSecondaryAction = () =>
    toast.act(item.id, 'secondary');

  const handleDismiss = () => toast.close(item.id);

  return (
    <div
      ref={slotRef}
      className="tst-slot"
      tabIndex={-1}
      style={slotStyle}
    >
      <div
        className={item.className ? `tst ${item.className}` : 'tst'}
        data-phase={item.phase}
        data-type={item.type}
        style={toastStyle}
      >
        {(item.action || item.secondary) && item.duration > 0 && (
          <div className="tst-timer" key={item.duration} />
        )}

        {item.progress !== undefined && (
          <div className="tst-progress" style={progressStyle} />
        )}

        <div className="tst-icon">
          {item.image ? (
            <img
              className="tst-media"
              src={item.image}
              alt=""
              width={28}
              height={28}
            />
          ) : (
            <div className="tst-badge">
              <svg
                className="tst-svg"
                viewBox="0 0 24 24"
                width={22}
                height={22}
                aria-hidden="true"
              >
                {ICONS[item.type].map((path) => (
                  <path key={path} d={path} pathLength={1} />
                ))}
              </svg>
            </div>
          )}
        </div>

        <div className="tst-body">
          <div className="tst-copy">
            <div className="tst-title">
              {item.title}

              {item.count > 1 && (
                <span className="tst-count">×{item.count}</span>
              )}

              {item.meta && (
                <span className="tst-meta">{item.meta}</span>
              )}
            </div>

            {item.description && (
              <div className="tst-desc">{item.description}</div>
            )}
          </div>

          {item.secondary && (
            <button
              type="button"
              className="tst-action tst-secondary"
              tabIndex={item.phase === 'open' ? 0 : -1}
              onClick={handleSecondaryAction}
            >
              {item.secondary.label}
            </button>
          )}

          {item.action && (
            <button
              type="button"
              className="tst-action"
              tabIndex={item.phase === 'open' ? 0 : -1}
              onClick={handleAction}
            >
              {item.action.label}
            </button>
          )}

          {isSticky && (
            <button
              type="button"
              className="tst-close"
              aria-label={labels.dismiss}
              tabIndex={item.phase === 'open' ? 0 : -1}
              onClick={handleDismiss}
            >
              <svg
                viewBox="0 0 24 24"
                width={12}
                height={12}
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type ToasterProps = {
  position?: Position;
  theme?: Theme;
  labels?: Partial<ToastLabels>;
  nonce?: string;
};

export function Toaster({
  position,
  theme,
  labels,
  nonce,
}: ToasterProps) {
  const state = useSyncExternalStore(
    toast.subscribe,
    toast.getState,
    toast.getState,
  );

  const region = labels?.region;
  const dismiss = labels?.dismiss;

  useEffect(() => {
    injectStyles(document, { nonce });
  }, [nonce]);

  useEffect(() => {
    toast.configure({ position, theme });
  }, [position, theme]);

  useEffect(() => {
    toast.configure({ labels: { region, dismiss } });
  }, [region, dismiss]);

  useEffect(() => retainToastKeys(), []);

  const toastCount = state.toasts.length;

  return (
    <div
      className="tst-viewport"
      role="region"
      aria-label={state.labels.region}
      data-position={state.position}
      data-tst-theme={state.theme}
      onPointerEnter={() => toast.pause()}
      onPointerLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) {
          toast.resume();
        }
      }}
      onFocus={(event) => {
        if (event.target.matches(':focus-visible')) {
          toast.pause();
        }
      }}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null) &&
          !event.currentTarget.matches(':hover')
        ) {
          toast.resume();
        }
      }}
    >
      <div className="tst-sr" role="status">
        {state.status}
      </div>

      <div className="tst-sr" role="alert">
        {state.alert}
      </div>

      {state.toasts.map((item, index) => (
        <Item
          key={item.id}
          toast={item}
          index={toastCount - 1 - index}
          labels={state.labels}
        />
      ))}
    </div>
  );
}

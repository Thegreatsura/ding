import { mountToaster, toast } from '@yusufceng1z/ding';

// Live demos for the What's new page. They run the shipped library as it is, so the default is the new 'list' mode.
mountToaster({ position: 'top-center', theme: 'system' });

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const retry = { label: 'Retry', onClick: () => undefined };
const fix = { label: 'Fix', onClick: () => undefined };

$('#tab-demo').addEventListener('click', () => {
  toast.dismiss(undefined, { immediate: true });
  toast.success('Message deleted', {
    duration: 5000,
    action: { label: 'Undo', onClick: () => ({ title: 'Message restored', duration: 2500 }) },
  });
});

let oldId = '';
let currentId = '';
let physicalId = '';
const idResult = $<HTMLElement>('#id-result');
const idReplace = $<HTMLButtonElement>('#id-replace');
const idStale = $<HTMLButtonElement>('#id-stale');
const idClose = $<HTMLButtonElement>('#id-close');
$('#id-start').addEventListener('click', () => {
  toast.dismiss(undefined, { immediate: true });
  toast.configure({ held: 'replace' });
  oldId = toast.loading('Loading');
  physicalId = toast.getState().toasts.at(-1)!.id;
  currentId = '';
  idReplace.disabled = false;
  idStale.disabled = true;
  idClose.disabled = true;
  idResult.textContent = `Old call: ${oldId}. Now replace it.`;
});
idReplace.addEventListener('click', () => {
  currentId = toast.success('Saved', { duration: 0 });
  idReplace.disabled = true;
  idStale.disabled = false;
  idClose.disabled = false;
  idResult.textContent = `Old caller: ${oldId}; new caller: ${currentId}; visible item: ${physicalId}.`;
});
idStale.addEventListener('click', () => {
  toast.dismiss(oldId);
  idResult.textContent = `dismiss(${oldId}) did not close the newer "${toast.getState().toasts.find((t) => t.id === physicalId)?.title ?? 'toast'}".`;
  idStale.disabled = true;
});
idClose.addEventListener('click', () => {
  toast.close(physicalId);
  idResult.textContent = `close(${physicalId}) closes the visible item. New caller ID was ${currentId}.`;
  idStale.disabled = true;
  idClose.disabled = true;
});

$('#err').addEventListener('click', () => void toast.error('Could not save', { description: 'Network failed.', action: retry }));
$('#ok').addEventListener('click', () => void toast.success('Saved'));
$('#err2').addEventListener('click', () => void toast.error('Upload failed', { description: 'File too large.', action: fix }));

// The mode buttons change the mode and clear the screen, so the next run starts clean.
const modes = document.querySelectorAll<HTMLButtonElement>('[data-mode]');
modes.forEach((b) =>
  b.addEventListener('click', () => {
    toast.dismiss();
    toast.configure({ held: b.dataset.mode as 'list' | 'queue' | 'replace' });
    modes.forEach((m) => m.setAttribute('aria-pressed', String(m === b)));
  }),
);

import releases from './data/release-dates.json';

const PACKAGE = '@yusufceng1z/ding';
const KEY = 'ding:core-downloads';
const DAY = 24 * 60 * 60 * 1000;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const first = releases.created.slice(0, 10);

interface Count { downloads: number; end: string; fetchedAt: number }

export async function showCoreDownloads(link: HTMLAnchorElement) {
  const render = ({ downloads, end }: Count) => {
    const exact = new Intl.NumberFormat('en-US').format(downloads);
    link.querySelector('[data-npm-count]')!.textContent = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(downloads);
    link.title = `${exact} total downloads · ${first} to ${end} (UTC)`;
    link.setAttribute('aria-label', `${exact} total npm downloads for ${PACKAGE}`);
  };

  try {
    const cached: Count | null = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (cached && Number.isSafeInteger(cached.downloads) && typeof cached.end === 'string') {
      render(cached);
      if (Date.now() - cached.fetchedAt < 60 * 60 * 1000) return;
    }
  } catch {
    // The npm link works even when storage is unavailable.
  }

  try {
    const latest = Date.parse(day(Date.now())) - DAY;
    let downloads = 0;
    let end = first;
    // npm caps a request at 18 months. Sum non-overlapping years for the lifetime count.
    for (let start = Date.parse(first); start <= latest; start += 365 * DAY) {
      const from = day(start);
      const through = day(Math.min(start + 364 * DAY, latest));
      const response = await fetch(`https://api.npmjs.org/downloads/point/${from}:${through}/${encodeURIComponent(PACKAGE)}`);
      if (!response.ok) return;
      const count = await response.json();
      if (count.package !== PACKAGE || count.start !== from || !Number.isSafeInteger(count.downloads) || count.downloads < 0 || typeof count.end !== 'string') return;
      downloads += count.downloads;
      end = count.end;
    }
    const count = { downloads, end, fetchedAt: Date.now() };
    render(count);
    try { localStorage.setItem(KEY, JSON.stringify(count)); } catch { /* Counts can render without a cache. */ }
  } catch {
    // Keep the package link or the most recent cached count.
  }
}

import { publicHref } from '$lib/kit-public-href';

export function init() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') {
      return originalFetch(publicHref(input), init);
    }
    if (input instanceof URL) {
      if (input.origin === window.location.origin) {
        const next = publicHref(`${input.pathname}${input.search}${input.hash}`);
        return originalFetch(new URL(next, input.origin), init);
      }
      return originalFetch(input, init);
    }
    const url = new URL(input.url);
    if (url.origin === window.location.origin) {
      const current = `${url.pathname}${url.search}${url.hash}`;
      const next = publicHref(current);
      if (next !== current) {
        return originalFetch(new Request(new URL(next, url.origin), input), init);
      }
    }
    return originalFetch(input, init);
  };

  document.addEventListener(
    'click',
    (event) => {
      const a = (event.target as Element | null)?.closest?.('a[href]');
      if (!(a instanceof HTMLAnchorElement)) return;
      if (a.origin !== window.location.origin) return;
      const raw = a.getAttribute('href');
      if (!raw) return;
      const next = publicHref(raw);
      if (next !== raw) a.setAttribute('href', next);
    },
    true,
  );
}

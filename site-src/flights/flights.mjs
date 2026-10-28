/* Short Final: the live-flights panel's loader (served at /assets/site/flights/flights.mjs; every airport page with the panel links it).
   It waits for the panel to come near the screen, then loads the panel's stylesheet and its script (flights-panel.mjs). Until then an
   airport page carries only this small file, so a visitor who never scrolls down to the panel downloads none of the panel's code. */

const NEAR = '900px 0px'; // the panel starts loading about a phone screen before it shows, so it fills in below the reader

function load() {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('./flights.css', import.meta.url).href;
  document.head.append(css);
  import(new URL('./flights-panel.mjs', import.meta.url).href).catch(() => {
    // the panel stays hidden if its script cannot load; the rest of the page is unaffected
  });
}

// The panel is hidden until it has data, and a hidden element never intersects, so the watch is on the empty sentinel just before the
// panel (flightspanel.mjs). Without the watch (or without the sentinel) the panel loads at once.
const sentinel = document.querySelector('[data-flights-sentinel]');
if (sentinel && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        load();
      }
    },
    { rootMargin: NEAR },
  );
  observer.observe(sentinel);
} else {
  load();
}

/* Short Final website: shared script (served at /assets/site/site.js). Small, optional, and every storage call is guarded.
   1. Consent banner, shown only when Google Analytics is configured (body[data-ga]) and no choice is stored yet. The Google
      script loads only after Accept.
   2. Analytics events (see site-src/ANALYTICS.md): data-event="name" on a link or button, plus data-* parameters.
   3. guide_read_75 on pages with an article[data-guide], and outbound_click for links to other hosts.
   4. window.sfTrack(name, params): the same helper for scripts on any page (see site-src/ANALYTICS.md). */
(function () {
  'use strict';

  var KEY = 'sf-consent';
  var body = document.body;

  function stored() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function remember(value) {
    try { window.localStorage.setItem(KEY, value); } catch (e) { /* private window or blocked storage: the banner returns next time */ }
  }
  function gtagSafe() {
    if (typeof window.gtag === 'function') window.gtag.apply(null, arguments);
  }
  function track(name, params) {
    gtagSafe('event', name, params || {});
  }

  /* A global helper for the other pages' scripts: window.sfTrack('play_store_click', { page: 'home' }). Names and parameters are
     listed in site-src/ANALYTICS.md. It does nothing when analytics is not configured or the visitor has not accepted. */
  window.sfTrack = function (name, params) {
    if (typeof name === 'string' && name) track(name, params && typeof params === 'object' ? params : {});
  };

  /* ---------- consent (Consent Mode v2: analytics_storage is denied until Accept) ----------
     The Google script is added only after Accept, so a visitor who has not accepted makes no request to Google. A stored Accept
     loads it on the next visit at once. Decline stores the choice and never loads it. */
  function loadGa() {
    var id = body.getAttribute("data-ga");
    if (!id || window.sfGaLoaded) return;
    window.sfGaLoaded = true;
    var script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(script);
  }
  function setupConsent() {
    if (!body.hasAttribute("data-ga")) return;
    var choice = stored();
    if (choice === "granted") loadGa();
    var banner = document.getElementById("consent");
    if (!banner) return;
    if (choice === "granted" || choice === "denied") {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    var accept = banner.querySelector("[data-consent=\"granted\"]");
    var decline = banner.querySelector("[data-consent=\"denied\"]");
    function answer(value) {
      remember(value);
      gtagSafe("consent", "update", { analytics_storage: value });
      if (value === "granted") loadGa();
      banner.hidden = true;
    }
    if (accept) accept.addEventListener("click", function () { answer("granted"); });
    if (decline) decline.addEventListener("click", function () { answer("denied"); });
  }

  /* ---------- events from markup: <a data-event="play_store_click" data-page="home" data-position="hero"> ---------- */
  function paramsOf(el) {
    var out = {};
    Array.prototype.forEach.call(el.attributes, function (a) {
      if (a.name.indexOf('data-') === 0 && a.name !== 'data-event' && a.name.indexOf('data-ev-') === 0) {
        out[a.name.slice(8).replace(/-/g, '_')] = a.value;
      }
    });
    return out;
  }
  function onClick(event) {
    var el = event.target.closest && event.target.closest('a, button');
    if (!el) return;
    var name = el.getAttribute('data-event');
    if (name) {
      track(name, paramsOf(el));
      return;
    }
    if (el.tagName === 'A' && el.host && el.host !== window.location.host) {
      track('outbound_click', { url_host: el.host });
    }
  }
  document.addEventListener('click', onClick, true);

  /* ---------- guide_read_75: the reader reaches 75% of an article ---------- */
  function setupGuideTracking() {
    var article = document.querySelector('article[data-guide]');
    if (!article || !('IntersectionObserver' in window)) return;
    var slug = article.getAttribute('data-guide');
    var marker = document.createElement('div');
    marker.setAttribute('aria-hidden', 'true');
    marker.style.cssText = 'position:absolute;left:0;width:1px;height:1px;pointer-events:none';
    marker.style.top = '75%';
    article.style.position = article.style.position || 'relative';
    article.appendChild(marker);
    var observer = new IntersectionObserver(function (entries) {
      if (entries[0] && entries[0].isIntersecting) {
        track('guide_read_75', { guide: slug });
        observer.disconnect();
      }
    });
    observer.observe(marker);
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(function () {
    setupConsent();
    setupGuideTracking();
  });
})();

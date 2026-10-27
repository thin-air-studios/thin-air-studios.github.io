// Escaping and a tagged template that escapes every interpolated value unless it is marked raw.
// Pages build their markup with html`...` (values are escaped) and raw(...) (values are trusted markup, e.g. a nested html`` result).
const MARK = Symbol('raw');
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function raw(value) {
  return { [MARK]: true, value: String(value ?? '') };
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

function render(value) {
  if (value == null || value === false) return '';
  if (typeof value === 'object' && value[MARK]) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return raw(out);
}

/** The string form of html``/raw() output, or of a plain string (escaped). */
export function toHtml(value) {
  return render(value);
}

/** JSON for a <script type="application/ld+json">: "<", ">" and "&" are written as escapes so no value can close the tag. */
export function jsonLdScript(obj) {
  const json = JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return raw(`<script type="application/ld+json">${json}</script>`);
}

// src/toaster.js
// Global toaster: no React component, no external CSS.
// Usage: import toast from "./toaster"; toast.success("Saved!");

const STYLES = `
#_toast_zone_ {
  position: fixed; right: 16px; bottom: 16px;
  display: flex; flex-direction: column; gap: 10px;
  z-index: 2147483647; pointer-events: none;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
               Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji",
               "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
}
._toast_ {
  pointer-events: auto; min-width: 260px; max-width: 420px;
  border-radius: 10px; border: 1px solid rgba(255,255,255,0.12);
  background: #101626; color: #e7ecff;
  box-shadow: 0 12px 36px rgba(0,0,0,.45);
  overflow: hidden; animation: _t_in_ 140ms ease-out;
}
@keyframes _t_in_ { from {opacity:0; transform: translateY(8px) scale(.98);} to {opacity:1; transform: none;} }
._toast_row_ { display: grid; grid-template-columns: 28px 1fr 28px; gap: 10px; padding: 10px 12px; align-items: center; }
._toast_icon_ { width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; font-weight: 700; font-size: .85rem; background: rgba(255,255,255,.08); }
._toast_title_ { font-weight: 600; font-size: .9rem; margin-bottom: 2px; }
._toast_msg_ { font-size: .875rem; line-height: 1.25rem; }
._toast_close_ { background: transparent; border: 0; color: #e7ecff; font-size: 18px; line-height: 1; width: 24px; height: 24px; border-radius: 6px; cursor: pointer; }
._toast_close_:hover { background: rgba(255,255,255,.08); }

/* accents */
._toast_.success { box-shadow: inset 3px 0 #16a34a; }
._toast_.error   { box-shadow: inset 3px 0 #dc2626; }
._toast_.warning { box-shadow: inset 3px 0 #d97706; }
._toast_.info    { box-shadow: inset 3px 0 #2563eb; }

._toast_.success ._toast_icon_ { background: rgba(22,163,74,.16); color: #86efac; }
._toast_.error   ._toast_icon_ { background: rgba(220,38,38,.16); color: #fca5a5; }
._toast_.warning ._toast_icon_ { background: rgba(217,119,6,.16); color: #fcd34d; }
._toast_.info    ._toast_icon_ { background: rgba(37,99,235,.16); color: #93c5fd; }
`;

let zone;
let styleTag;

function ensureZone() {
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.textContent = STYLES;
    document.head.appendChild(styleTag);
  }
  if (!zone) {
    zone = document.createElement("div");
    zone.id = "_toast_zone_";
    document.body.appendChild(zone);
  }
}

function iconFor(type) {
  if (type === "success") return "✓";
  if (type === "error") return "✕";
  if (type === "warning") return "!";
  return "i";
}

function show(message, { type = "info", title, timeout = 2500 } = {}) {
  ensureZone();
  const wrap = document.createElement("div");
  wrap.className = `_toast_ ${type}`;
  wrap.setAttribute("role", "status");
  wrap.setAttribute("aria-live", "polite");
  wrap.innerHTML = `
    <div class="_toast_row_">
      <div class="_toast_icon_">${iconFor(type)}</div>
      <div class="_toast_content_">
        ${title ? `<div class="_toast_title_">${title}</div>` : ""}
        <div class="_toast_msg_">${message}</div>
      </div>
      <button class="_toast_close_" aria-label="Close">×</button>
    </div>
  `;
  const closer = wrap.querySelector("._toast_close_");
  const remove = () => wrap.parentNode && wrap.parentNode.removeChild(wrap);
  closer.addEventListener("click", remove);
  zone.appendChild(wrap);
  const handle = setTimeout(remove, timeout);
  // if user manually removes, clear timeout
  const obs = new MutationObserver(() => {
    if (!wrap.parentNode) clearTimeout(handle);
  });
  obs.observe(zone, { childList: true });
  return () => { clearTimeout(handle); remove(); };
}

const toast = {
  show,
  success: (m, o) => show(m, { ...(o || {}), type: "success" }),
  error:   (m, o) => show(m, { ...(o || {}), type: "error" }),
  warning: (m, o) => show(m, { ...(o || {}), type: "warning" }),
  info:    (m, o) => show(m, { ...(o || {}), type: "info" }),
};

export default toast;

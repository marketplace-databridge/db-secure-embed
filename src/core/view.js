import injectStyles from './styles.js';
import { REASON_TEXT, REASONS, MIN_REFRESH_SECONDS } from './constants.js';

// setTimeout/setInterval treat larger delays as ~0 ms (32-bit overflow).
const MAX_DELAY_MS = 2 ** 31 - 1;

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/]+\)|[a-z]{3,20})$/i;

const ICON = {
  reload:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.6 2.4A7.9 7.9 0 0 0 8 0a8 8 0 1 0 7.7 10h-2.1A6 6 0 1 1 8 2a5.9 5.9 0 0 1 4.2 1.8L9 7h7V0z"/></svg>',
  open:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 0v2h3.6L6.3 8.3l1.4 1.4L14 3.4V7h2V0zM14 14H2V2h5V0H2a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V9h-2z"/></svg>',
  globe:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm5.9 7h-2.5a12 12 0 0 0-1-4.9A6 6 0 0 1 13.9 7zM8 2c.6.8 1.3 2.6 1.4 5H6.6C6.7 4.6 7.4 2.8 8 2zM5.6 2.1a12 12 0 0 0-1 4.9H2.1a6 6 0 0 1 3.5-4.9zM2.1 9h2.5c.1 1.9.5 3.6 1 4.9A6 6 0 0 1 2.1 9zM8 14c-.6-.8-1.3-2.6-1.4-5h2.8c-.1 2.4-.8 4.2-1.4 5zm2.4-.1a12 12 0 0 0 1-4.9h2.5a6 6 0 0 1-3.5 4.9z"/></svg>',
  shield:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0 1 3v4.5C1 11.6 4 15.3 8 16c4-.7 7-4.4 7-8.5V3zm-.9 11.4L3.8 8.1l1.4-1.4 1.9 1.9 3.7-3.7 1.4 1.4z"/></svg>',
  block:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM2 8a6 6 0 0 1 9.5-4.9l-8.4 8.4A6 6 0 0 1 2 8zm6 6a6 6 0 0 1-3.5-1.1l8.4-8.4A6 6 0 0 1 8 14z"/></svg>',
};

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach((k) => {
      const v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'className') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'icon') node.insertAdjacentHTML('afterbegin', ICON[v]); // static, trusted markup only
      else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    });
  }
  (children || []).filter(Boolean).forEach((c) => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return node;
}

function openExternal(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function frameKey(m) {
  const d = m.decision;
  return [d.url, d.sandbox.join(' '), d.allow.join(';'), d.referrerPolicy, m.behaviour.lazy].join('|');
}

// Refresh/timeout may be expressions that change with selections: restart timers, never reload the page.
function timerKey(m) {
  return `${m.behaviour.refreshSeconds}|${m.behaviour.loadTimeoutSeconds}`;
}

/**
 * Owns the DOM for one object instance. update() is cheap to call on every
 * layout change; the iframe is only rebuilt when something that affects what
 * is loaded (URL, sandbox, permissions, referrer) actually changes, so
 * selections elsewhere in the app do not reload the embedded page.
 */
export default class FrameController {
  constructor(element) {
    injectStyles(element.ownerDocument);
    this.element = element;
    this.root = el('div', { className: 'dbse' });
    element.innerHTML = '';
    element.appendChild(this.root);
    this.key = null;
    this.layoutKey = null;
    this.timers = [];
    this.active = false;
    this.onLeave = () => {
      if (this.model && this.model.behaviour.interaction === 'click') {
        this.active = false;
        this.syncVeil();
      }
    };
    this.root.addEventListener('mouseleave', this.onLeave);
  }

  clearTimers(includeReload = true) {
    this.timers.forEach((t) => clearTimeout(t) || clearInterval(t));
    this.timers = [];
    if (includeReload) clearTimeout(this.reloadTimer);
  }

  destroy() {
    this.clearTimers();
    this.root.removeEventListener('mouseleave', this.onLeave);
    this.element.innerHTML = '';
  }

  update(model) {
    this.model = model;
    const d = model.decision;
    const showFrame = d.status === 'ok' && model.display.mode === 'embed';
    const key = showFrame ? frameKey(model) : `${d.status}|${d.reason}|${model.display.mode}|${d.url}`;
    const layoutKey = JSON.stringify([key, model.editMode, model.toolbar, model.display, model.appearance, model.behaviour, d.notes, model.title]);
    if (layoutKey === this.layoutKey) return;
    this.layoutKey = layoutKey;
    this.styleRoot();

    if (showFrame && key === this.key && this.iframe) {
      this.styleFrame(); // keep the loaded page, just refresh zoom/title and the surroundings
      if (timerKey(model) !== this.timerKey) {
        this.clearTimers(false); // a reload in flight must still finish
        this.startTimers();
      }
      this.renderChrome();
      return;
    }
    this.key = key;
    this.clearTimers();
    this.iframe = null;
    this.renderAll();
  }

  styleRoot() {
    const m = this.model;
    this.root.className = 'dbse';
    if (m.appearance.border) this.root.classList.add('dbse--border');
    if (m.toolbar.position === 'bottom') this.root.classList.add('dbse--toolbar-bottom');
    const bg = String(m.appearance.background || '').trim();
    // Colours only: a url() here would let editors make the browser call arbitrary hosts.
    this.root.style.setProperty('--dbse-bg', SAFE_COLOR.test(bg) ? bg : 'transparent');
  }

  styleFrame() {
    const m = this.model;
    const iframe = this.iframe;
    const zoom = Math.min(Math.max(Number(m.appearance.zoom) || 100, 25), 200) / 100;
    iframe.title = m.title || `Embedded content from ${new URL(m.decision.url).host}`;
    iframe.style.width = `${100 / zoom}%`;
    iframe.style.height = `${100 / zoom}%`;
    iframe.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
  }

  renderAll() {
    const m = this.model;
    const d = m.decision;
    this.root.textContent = '';

    if (d.status !== 'ok') {
      this.root.appendChild(this.renderMessage());
      return;
    }
    if (m.display.mode === 'link') {
      this.root.appendChild(this.renderCard());
      if (m.editMode) this.root.appendChild(this.renderEditBadge(true));
      return;
    }

    this.toolbarSlot = el('div');
    this.toolbarSlot.style.display = 'contents';
    this.stage = el('div', { className: 'dbse-stage' });
    this.root.appendChild(this.toolbarSlot);
    this.root.appendChild(this.stage);
    this.buildFrame();
    this.renderChrome();
  }

  buildFrame() {
    const m = this.model;
    const d = m.decision;
    const iframe = el('iframe', {
      className: 'dbse-frame',
      referrerpolicy: d.referrerPolicy,
      loading: m.behaviour.lazy ? 'lazy' : 'eager',
    });
    // Always set the attribute, even when empty: an empty sandbox is the most restrictive.
    iframe.setAttribute('sandbox', d.sandbox.join(' '));
    if (d.allow.length) iframe.setAttribute('allow', d.allow.map((f) => `${f} ${d.origin}`).join('; '));

    this.loaded = false;
    const loading = el('div', { className: 'dbse-loading', text: 'Loading…' });
    iframe.addEventListener('load', () => {
      this.loaded = true;
      loading.remove();
      if (this.hint) this.hint.remove();
    });
    iframe.src = d.url;

    this.stage.appendChild(loading);
    this.stage.appendChild(iframe);
    this.iframe = iframe;
    this.styleFrame();
    this.startTimers();
  }

  startTimers() {
    const m = this.model;
    const d = m.decision;
    const { iframe } = this;
    this.timerKey = timerKey(m);
    const timeout = Number(m.behaviour.loadTimeoutSeconds) || 0;
    if (timeout > 0) {
      this.timers.push(
        setTimeout(() => {
          if (this.loaded || this.iframe !== iframe) return;
          if (this.hint) this.hint.remove();
          this.hint = el('div', { className: 'dbse-hint', role: 'status' }, [
            'This page is taking long to load. Some sites refuse to be embedded.',
            this.button('Open in new tab', 'open', () => openExternal(d.url)),
          ]);
          this.stage.appendChild(this.hint);
        }, Math.min(timeout * 1000, MAX_DELAY_MS))
      );
    }

    const refresh = Number(m.behaviour.refreshSeconds) || 0;
    if (refresh > 0) {
      const ms = Math.min(Math.max(refresh, MIN_REFRESH_SECONDS) * 1000, MAX_DELAY_MS);
      this.timers.push(setInterval(() => this.reload(), ms));
    }
  }

  reload() {
    if (!this.iframe || !this.model) return;
    const { url } = this.model.decision;
    const iframe = this.iframe;
    iframe.src = 'about:blank';
    clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      if (this.iframe === iframe) iframe.src = url;
    }, 30);
  }

  button(label, icon, onClick, opts = {}) {
    const b = el('button', {
      type: 'button',
      className: `dbse-btn${opts.primary ? ' dbse-btn--primary' : ''}`,
      title: opts.iconOnly ? label : undefined,
      'aria-label': label,
      icon,
      onClick,
    });
    if (!opts.iconOnly) b.appendChild(document.createTextNode(label));
    return b;
  }

  renderChrome() {
    const m = this.model;
    const d = m.decision;
    // Toolbar
    this.toolbarSlot.textContent = '';
    if (m.toolbar.show) {
      const host = new URL(d.url).host;
      this.toolbarSlot.appendChild(
        el('div', { className: 'dbse-toolbar' }, [
          el('span', { className: 'dbse-title', text: m.toolbar.title || '' }),
          m.toolbar.showHost ? el('span', { className: 'dbse-host', text: host }) : null,
          m.toolbar.showReload ? this.button('Reload', 'reload', () => this.reload(), { iconOnly: true }) : null,
          m.toolbar.showOpen ? this.button('Open in new tab', 'open', () => openExternal(d.url), { iconOnly: true }) : null,
        ])
      );
    }
    // Veils
    this.stage.querySelectorAll('.dbse-veil,.dbse-edit').forEach((n) => n.remove());
    this.syncVeil();
    if (m.editMode) this.stage.appendChild(this.renderEditBadge(false));
  }

  syncVeil() {
    if (!this.stage || !this.model) return;
    const m = this.model;
    const existing = this.stage.querySelector('.dbse-veil');
    let want = null;
    if (!m.editMode) {
      if (m.behaviour.interaction === 'never') want = 'never';
      else if (m.behaviour.interaction === 'click' && !this.active) want = 'click';
    }
    // A veil only blocks the mouse; inert also keeps keyboard focus out of the page.
    if (this.iframe) this.iframe.inert = Boolean(want);
    if (existing && existing.dataset.kind === want) return;
    if (existing) existing.remove();
    if (!want) return;
    const veil =
      want === 'click'
        ? el(
            'div',
            {
              className: 'dbse-veil dbse-veil--click',
              tabindex: 0,
              role: 'button',
              'aria-label': 'Click to interact with the embedded page',
              onClick: () => {
                this.active = true;
                this.syncVeil();
              },
              onKeydown: (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  this.active = true;
                  this.syncVeil();
                }
              },
            },
            [el('span', { text: 'Click to interact' })]
          )
        : el('div', { className: 'dbse-veil' });
    veil.dataset.kind = want;
    this.stage.appendChild(veil);
  }

  renderEditBadge(floating) {
    const d = this.model.decision;
    const badge = el('div', { className: 'dbse-badge' }, [
      el('div', {}, [el('b', { text: 'Allowed by: ' }), d.entry.label]),
      el('div', {}, [el('b', { text: 'URL: ' }), el('code', { text: d.url })]),
      el('div', {}, [el('b', { text: 'Sandbox: ' }), el('code', { text: d.sandbox.join(' ') || '(fully sandboxed)' })]),
      el('div', {}, [el('b', { text: 'Permissions: ' }), el('code', { text: d.allow.join(', ') || 'none' })]),
      el('div', {}, [el('b', { text: 'Referrer: ' }), el('code', { text: d.referrerPolicy })]),
      ...d.notes.map((n) => el('div', { className: 'dbse-warn', text: `⚠ ${n}` })),
    ]);
    const wrap = el('div', { className: 'dbse-edit' }, [badge]);
    if (floating) {
      wrap.style.background = 'transparent';
      wrap.style.pointerEvents = 'none';
    }
    return wrap;
  }

  renderCard() {
    const m = this.model;
    const d = m.decision;
    return el('div', { className: 'dbse-card' }, [
      el('span', { icon: 'globe' }),
      m.display.linkTitle ? el('h3', { text: m.display.linkTitle }) : null,
      m.display.linkDescription ? el('p', { text: m.display.linkDescription }) : null,
      this.button(m.display.linkButton || 'Open website', 'open', () => openExternal(d.url), { primary: true }),
      el('span', { className: 'dbse-host', text: new URL(d.url).host }),
    ]);
  }

  renderMessage() {
    const m = this.model;
    const d = m.decision;
    if (d.status === 'loading') {
      return el('div', { className: 'dbse-msg' }, [el('p', { text: 'Loading…' })]);
    }
    if (d.status === 'empty') {
      return el('div', { className: 'dbse-msg' }, [
        el('span', { icon: 'shield' }),
        el('h3', { text: 'Secure Embed' }),
        el('p', {
          text: m.editMode
            ? 'Add a web address in the property panel. Only sites on the administrator allowlist can be shown.'
            : 'No content configured.',
        }),
      ]);
    }
    const children = [el('span', { icon: 'block' }), el('h3', { text: 'Content blocked' })];
    if (m.editMode) {
      children.push(el('p', { text: REASON_TEXT[d.reason] || 'Blocked.' }));
      if (d.detail) children.push(el('p', {}, [el('code', { text: d.detail })]));
      if (d.reason === REASONS.NOT_ALLOWED)
        children.push(el('p', { text: 'Ask your Qlik administrator to add this site to allowlist.json.' }));
    } else {
      children.push(el('p', { text: 'This content is not approved for display in Qlik Sense.' }));
    }
    return el('div', { className: 'dbse-msg dbse-msg--blocked', role: 'alert' }, children);
  }
}

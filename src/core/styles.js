const CSS = `
.dbse{position:relative;width:100%;height:100%;overflow:hidden;box-sizing:border-box;display:flex;flex-direction:column;
  font-family:inherit;font-size:13px;color:#404040;background:var(--dbse-bg,transparent)}
.dbse *{box-sizing:border-box}
.dbse--border{border:1px solid #d9d9d9;border-radius:4px}
.dbse-toolbar{display:flex;align-items:center;gap:4px;min-height:32px;padding:0 6px;border-bottom:1px solid #e6e6e6;background:#fafafa;flex:0 0 auto}
.dbse--toolbar-bottom .dbse-toolbar{order:2;border-bottom:0;border-top:1px solid #e6e6e6}
.dbse-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.dbse-host{flex:0 1 auto;color:#808080;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbse-btn{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 8px;border:1px solid transparent;border-radius:3px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.dbse-btn:hover{background:#ececec}
.dbse-btn:focus-visible{outline:2px solid #3f8ab3;outline-offset:1px}
.dbse-btn svg{width:16px;height:16px;fill:currentColor}
.dbse-btn--primary{background:#009845;color:#fff;border-color:#009845;height:32px;padding:0 14px}
.dbse-btn--primary:hover{background:#007a37}
.dbse-stage{position:relative;flex:1 1 auto;min-height:0;overflow:hidden}
.dbse-frame{position:absolute;top:0;left:0;border:0;transform-origin:0 0;background:#fff}
.dbse-veil{position:absolute;inset:0;z-index:2}
.dbse-veil--click{display:flex;align-items:flex-end;justify-content:center;padding:10px;cursor:pointer}
.dbse-veil--click span{background:rgba(0,0,0,.65);color:#fff;border-radius:12px;padding:4px 10px;font-size:12px;opacity:0;transition:opacity .15s}
.dbse-veil--click:hover span,.dbse-veil--click:focus span{opacity:1}
.dbse-edit{position:absolute;inset:0;z-index:3;background:rgba(255,255,255,.55);display:flex;align-items:flex-start;justify-content:flex-start;padding:8px}
.dbse-badge{max-width:100%;background:#fff;border:1px solid #d9d9d9;border-radius:4px;padding:6px 8px;font-size:12px;line-height:1.45;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.dbse-badge b{font-weight:600}
.dbse-badge code{font-family:Consolas,monospace;font-size:11px;background:#f2f2f2;padding:0 3px;border-radius:2px;word-break:break-all}
.dbse-badge .dbse-warn{color:#b35c00}
.dbse-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#808080;z-index:1;pointer-events:none}
.dbse-hint{position:absolute;left:8px;right:8px;bottom:8px;z-index:4;display:flex;align-items:center;gap:8px;background:#fff8e6;border:1px solid #f0c36d;border-radius:4px;padding:6px 8px;font-size:12px}
.dbse-hint .dbse-btn{margin-left:auto}
.dbse-msg{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:8px;padding:16px}
.dbse-msg svg{width:28px;height:28px;fill:#a6a6a6}
.dbse-msg--blocked svg{fill:#d0021b}
.dbse-msg h3{margin:0;font-size:14px;font-weight:600}
.dbse-msg p{margin:0;max-width:440px;color:#595959}
.dbse-msg code{font-family:Consolas,monospace;font-size:12px;background:#f2f2f2;padding:1px 4px;border-radius:2px;word-break:break-all}
.dbse-card{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;padding:16px}
.dbse-card > span > svg{width:28px;height:28px;fill:#009845}
.dbse-card h3{margin:0;font-size:16px;font-weight:600}
.dbse-card p{margin:0;color:#595959;max-width:460px}
.dbse-card .dbse-host{font-size:12px}
`;

// Checked per document, so objects rendered into another document (pop-out, iframe) also get styles.
export default function injectStyles(doc = document) {
  if (!doc || doc.getElementById('dbse-styles')) return;
  const s = doc.createElement('style');
  s.id = 'dbse-styles';
  s.textContent = CSS;
  doc.head.appendChild(s);
}

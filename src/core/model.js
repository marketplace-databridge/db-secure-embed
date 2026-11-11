import defaults from '../object-properties.js';
import { resolveTemplate, evaluate } from './policy.js';

const merge = (base, over) => ({ ...base, ...(over || {}) });

/** Turns an engine layout + allowlist into the view model the controller renders. */
export default function buildModel(layout, allowlist, { editMode, selfOrigin } = {}) {
  const p = (layout && layout.props) || {};
  const source = merge(defaults.props.source, p.source);
  const security = merge(defaults.props.security, p.security);

  let rawUrl = source.url;
  let templateError;
  if (source.mode === 'template') {
    const r = resolveTemplate(source.template, source.params);
    rawUrl = r.url;
    templateError = r.error;
  }

  const decision =
    allowlist === null
      ? { status: 'loading', notes: [] }
      : evaluate({ rawUrl, templateError, allowlist, security, selfOrigin });

  return {
    decision,
    editMode: Boolean(editMode),
    title: source.accessibleTitle,
    display: merge(defaults.props.display, p.display),
    toolbar: merge(defaults.props.toolbar, p.toolbar),
    behaviour: merge(defaults.props.behaviour, p.behaviour),
    appearance: merge(defaults.props.appearance, p.appearance),
  };
}

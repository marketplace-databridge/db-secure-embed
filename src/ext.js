/* Property panel for Qlik Sense client-managed. */

const SANDBOX_LABELS = {
  'allow-scripts': 'Run scripts',
  'allow-same-origin': 'Keep site origin (cookies, storage)',
  'allow-forms': 'Submit forms',
  'allow-popups': 'Open pop-ups / new tabs',
  'allow-popups-to-escape-sandbox': 'Pop-ups leave the sandbox',
  'allow-modals': 'Show dialogs (alert/confirm)',
  'allow-downloads': 'Download files',
  'allow-presentation': 'Presentation API',
  'allow-pointer-lock': 'Pointer lock',
  'allow-orientation-lock': 'Screen orientation lock',
};

const FEATURE_LABELS = {
  fullscreen: 'Fullscreen',
  autoplay: 'Autoplay',
  'encrypted-media': 'Encrypted media (DRM)',
  'picture-in-picture': 'Picture-in-picture',
  'clipboard-write': 'Write to clipboard',
  'web-share': 'Web share',
};

const isTemplate = (d) => d.props && d.props.source && d.props.source.mode === 'template';
const isEmbed = (d) => !d.props || !d.props.display || d.props.display.mode !== 'link';
const isLink = (d) => !isEmbed(d);
const isCustom = (d) => d.props && d.props.security && d.props.security.sandboxPreset === 'custom';
const toolbarOn = (d) => isEmbed(d) && d.props && d.props.toolbar && d.props.toolbar.show;

const sw = (ref, label, show) => ({
  ref,
  label,
  type: 'boolean',
  component: 'switch',
  options: [
    { value: true, label: 'On' },
    { value: false, label: 'Off' },
  ],
  ...(show ? { show } : {}),
});

const checkboxes = (base, labels, show) =>
  Object.keys(labels).reduce((acc, key) => {
    acc[key] = { ref: `${base}.${key}`, label: labels[key], type: 'boolean', defaultValue: false, ...(show ? { show } : {}) };
    return acc;
  }, {});

export default function ext() {
  return {
    definition: {
      type: 'items',
      component: 'accordion',
      items: {
        content: {
          label: 'Content',
          type: 'items',
          items: {
            mode: {
              ref: 'props.source.mode',
              label: 'Address type',
              type: 'string',
              component: 'buttongroup',
              options: [
                { value: 'url', label: 'URL' },
                { value: 'template', label: 'Template' },
              ],
            },
            url: {
              ref: 'props.source.url',
              label: 'Web address (https://…)',
              type: 'string',
              expression: 'optional',
              show: (d) => !isTemplate(d),
            },
            template: {
              ref: 'props.source.template',
              label: 'URL template, e.g. https://host/report/{region}?year={year}',
              type: 'string',
              show: isTemplate,
            },
            params: {
              type: 'array',
              ref: 'props.source.params',
              label: 'Template parameters',
              itemTitleRef: 'name',
              allowAdd: true,
              allowRemove: true,
              allowMove: true,
              addTranslation: 'Add parameter',
              show: isTemplate,
              items: {
                name: { ref: 'name', label: 'Name (used as {name})', type: 'string' },
                value: { ref: 'value', label: 'Value', type: 'string', expression: 'optional' },
              },
            },
            templateHelp: {
              component: 'text',
              label: 'Parameter values are URL-encoded and can only change the path or query, never the site.',
              show: isTemplate,
            },
            displayMode: {
              ref: 'props.display.mode',
              label: 'Show as',
              type: 'string',
              component: 'buttongroup',
              options: [
                { value: 'embed', label: 'Embedded page' },
                { value: 'link', label: 'Link card' },
              ],
            },
            linkTitle: { ref: 'props.display.linkTitle', label: 'Card title', type: 'string', expression: 'optional', show: isLink },
            linkDescription: { ref: 'props.display.linkDescription', label: 'Card text', type: 'string', expression: 'optional', show: isLink },
            linkButton: { ref: 'props.display.linkButton', label: 'Button label', type: 'string', show: isLink },
            accessibleTitle: {
              ref: 'props.source.accessibleTitle',
              label: 'Accessible name (screen readers)',
              type: 'string',
              show: isEmbed,
            },
          },
        },
        security: {
          label: 'Security',
          type: 'items',
          items: {
            info: {
              component: 'text',
              label:
                'Only sites on the administrator allowlist can be shown. Settings here can only restrict further, never widen what the allowlist permits.',
            },
            preset: {
              ref: 'props.security.sandboxPreset',
              label: 'Sandbox profile',
              type: 'string',
              component: 'dropdown',
              options: [
                { value: 'locked', label: 'Locked (static pages, no scripts)' },
                { value: 'standard', label: 'Standard (scripts, forms, pop-ups)' },
                { value: 'media', label: 'Media (video players)' },
                { value: 'custom', label: 'Custom' },
              ],
            },
            ...checkboxes('props.security.custom', SANDBOX_LABELS, isCustom),
            featuresHeader: { component: 'text', label: 'Browser features delegated to the page' },
            ...checkboxes('props.security.features', FEATURE_LABELS),
            referrer: {
              ref: 'props.security.referrerPolicy',
              label: 'Referrer sent to the site',
              type: 'string',
              component: 'dropdown',
              options: [
                { value: 'default', label: 'Allowlist default' },
                { value: 'no-referrer', label: 'None' },
                { value: 'origin', label: 'Qlik server name only' },
                { value: 'strict-origin', label: 'Server name only, https only' },
              ],
            },
          },
        },
        behaviour: {
          label: 'Behaviour',
          type: 'items',
          show: isEmbed,
          items: {
            interaction: {
              ref: 'props.behaviour.interaction',
              label: 'Interaction',
              type: 'string',
              component: 'dropdown',
              options: [
                { value: 'always', label: 'Always interactive' },
                { value: 'click', label: 'Click to activate (avoids scroll trapping)' },
                { value: 'never', label: 'View only' },
              ],
            },
            refresh: {
              ref: 'props.behaviour.refreshSeconds',
              label: 'Auto-refresh every N seconds (0 = off, min 15)',
              type: 'number',
              expression: 'optional',
            },
            timeout: {
              ref: 'props.behaviour.loadTimeoutSeconds',
              label: 'Show "open in new tab" hint after N seconds (0 = off)',
              type: 'number',
            },
            lazy: sw('props.behaviour.lazy', 'Lazy loading'),
          },
        },
        toolbar: {
          label: 'Toolbar',
          type: 'items',
          show: isEmbed,
          items: {
            show: sw('props.toolbar.show', 'Show toolbar'),
            position: {
              ref: 'props.toolbar.position',
              label: 'Position',
              type: 'string',
              component: 'buttongroup',
              options: [
                { value: 'top', label: 'Top' },
                { value: 'bottom', label: 'Bottom' },
              ],
              show: toolbarOn,
            },
            title: { ref: 'props.toolbar.title', label: 'Toolbar title', type: 'string', expression: 'optional', show: toolbarOn },
            host: sw('props.toolbar.showHost', 'Show site name', toolbarOn),
            reload: sw('props.toolbar.showReload', 'Reload button', toolbarOn),
            open: sw('props.toolbar.showOpen', 'Open in new tab button', toolbarOn),
          },
        },
        appearance: {
          uses: 'settings',
          items: {
            embed: {
              label: 'Embed',
              type: 'items',
              items: {
                zoom: {
                  ref: 'props.appearance.zoom',
                  label: 'Zoom (%)',
                  type: 'number',
                  component: 'slider',
                  min: 25,
                  max: 200,
                  step: 5,
                  show: isEmbed,
                },
                border: sw('props.appearance.border', 'Border'),
                background: { ref: 'props.appearance.background', label: 'Background colour (CSS)', type: 'string' },
              },
            },
          },
        },
        about: {
          label: 'About',
          type: 'items',
          items: {
            a: { component: 'text', label: 'DataBridge Secure Embed' },
            b: { component: 'text', label: 'Allowlist: extensions/db-secure-embed/allowlist.json (admin-managed).' },
            c: { component: 'link', label: 'DataBridge AG', url: 'https://databridge.ch' },
          },
        },
      },
    },
    support: {
      snapshot: false,
      export: false,
      exportData: false,
      sharing: false,
      viewData: false,
    },
  };
}

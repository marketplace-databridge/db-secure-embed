/**
 * Default properties for a new Secure Embed object. Anything under `props`
 * may be a string expression where the property panel allows it; the engine
 * evaluates it before it reaches the layout.
 */
export default {
  showTitles: false,
  title: '',
  subtitle: '',
  footnote: '',
  props: {
    source: {
      mode: 'url', // 'url' | 'template'
      url: '',
      template: '',
      params: [],
      accessibleTitle: '',
    },
    display: {
      mode: 'embed', // 'embed' | 'link'
      linkTitle: '',
      linkDescription: '',
      linkButton: 'Open website',
    },
    security: {
      sandboxPreset: 'standard', // 'locked' | 'standard' | 'media' | 'custom'
      custom: {},
      features: {},
      referrerPolicy: 'default',
    },
    behaviour: {
      interaction: 'always', // 'always' | 'click' | 'never'
      refreshSeconds: 0,
      lazy: true,
      loadTimeoutSeconds: 10,
    },
    toolbar: {
      show: false,
      position: 'top',
      title: '',
      showHost: true,
      showReload: true,
      showOpen: true,
    },
    appearance: {
      zoom: 100,
      border: false,
      background: '',
    },
  },
};

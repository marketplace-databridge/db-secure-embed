import { useElement, useLayout, useEffect, useState, useMemo, useConstraints } from '@nebula.js/stardust';
import properties from './object-properties.js';
import FrameController from './core/view.js';
import buildModel from './core/model.js';
import { loadAllowlist } from './core/allowlist.js';

const EXTENSION_NAME = 'db-secure-embed';

/**
 * DataBridge Secure Embed — a nebula.js visualization packaged as a
 * Qlik Sense client-managed extension.
 */
export default function supernova() {
  return {
    qae: {
      properties: { initial: properties },
      data: { targets: [] },
    },
    component() {
      const element = useElement();
      const layout = useLayout();
      const constraints = useConstraints();
      const [allowlist, setAllowlist] = useState(null);

      useEffect(() => {
        let alive = true;
        loadAllowlist(EXTENSION_NAME).then((a) => alive && setAllowlist(a));
        return () => {
          alive = false;
        };
      }, []);

      const controller = useMemo(() => new FrameController(element), [element]);
      useEffect(() => () => controller.destroy(), [controller]);

      useEffect(() => {
        // In Sense edit mode interaction is disabled (constraints.active).
        const editMode = Boolean(constraints && constraints.active);
        controller.update(
          buildModel(layout, allowlist, { editMode, selfOrigin: window.location.origin })
        );
      }, [controller, layout, allowlist, constraints && constraints.active]);
    },
  };
}

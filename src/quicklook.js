import * as THREE from 'three';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { buildModel } from './objects.js';

// Apple AR Quick Look: hands the object to iOS's built-in AR viewer, which has
// full world tracking (walk around it, real wall/floor detection).

export function quickLookSupported() {
  const a = document.createElement('a');
  return !!(a.relList && a.relList.supports && a.relList.supports('ar'));
}

const cache = new Map();

/** Build the USDZ file ahead of time so opening it stays inside the tap. */
export function prepareQuickLook(def) {
  if (!cache.has(def.id)) {
    const p = (async () => {
      const scene = new THREE.Scene();
      const model = buildModel(def, { shadow: false });
      scene.add(model);
      scene.updateMatrixWorld(true);
      const data = await new USDZExporter().parseAsync(scene, {
        quickLookCompatible: true,
        ar: {
          anchoring: { type: 'plane' },
          planeAnchoring: { alignment: def.mount === 'wall' ? 'vertical' : 'horizontal' },
        },
      });
      return URL.createObjectURL(new Blob([data], { type: 'model/vnd.usdz+zip' }));
    })();
    p.catch(() => cache.delete(def.id));
    cache.set(def.id, p);
  }
  return cache.get(def.id);
}

export function openQuickLookUrl(url) {
  const a = document.createElement('a');
  a.rel = 'ar';
  a.href = url;
  a.appendChild(document.createElement('img')); // Safari requires an <img> child
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
}

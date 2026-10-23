import { DxfViewer } from 'dxf-viewer';
import { Color } from 'three';

export type MakeDxfViewerInstance = {
  destroy: () => void;
  fit: () => void;
};

/** Shared DXF viewer bootstrap used by the desktop app and the WordPress portal. */
export async function mountMakeDxfViewer(host: HTMLElement, url: string): Promise<MakeDxfViewerInstance> {
  const viewer = new DxfViewer(host, {
    autoResize: true,
    clearColor: new Color(0xffffff),
    clearAlpha: 1,
    antialias: true,
    colorCorrection: true,
    blackWhiteInversion: true,
    sceneOptions: { suppressPaperSpace: false }
  });
  try {
    await viewer.Load({
      url,
      workerFactory: () => new Worker(new URL('./make-dxf.worker.ts', import.meta.url), { type: 'module' })
    });
    const bounds = viewer.GetBounds();
    if (bounds) viewer.FitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, 0.95);
  } catch (error) {
    viewer.Destroy();
    throw error;
  }
  return {
    fit: () => {
      const bounds = viewer.GetBounds();
      if (bounds) viewer.FitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, 0.95);
    },
    destroy: () => viewer.Destroy()
  };
}

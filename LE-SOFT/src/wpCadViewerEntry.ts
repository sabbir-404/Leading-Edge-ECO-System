import { mountMakeDxfViewer } from './components/MakeCadViewer';

declare global {
  interface Window {
    LEMakeCadViewer?: { mount: typeof mountMakeDxfViewer };
  }
}

window.LEMakeCadViewer = { mount: mountMakeDxfViewer };

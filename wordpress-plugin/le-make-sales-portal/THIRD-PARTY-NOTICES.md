# Third-party notices

The WordPress CAD preview bundles `dxf-viewer` 1.0.50 from [vagran/dxf-viewer](https://github.com/vagran/dxf-viewer), licensed under Mozilla Public License 2.0. Its source and license are included under `assets/cad-viewer/third-party/dxf-viewer/` in the plugin package. The LE-SOFT CAD integration code is separate from that library.

The desktop application also uses `dxf-viewer` 1.0.50 under Mozilla Public License 2.0. The source and license are available in the LE-SOFT source repository under `node_modules/dxf-viewer/` after dependency installation.

The bundled drawing preview supports DXF. DWG preview is not bundled because the available open-source DWG parser is GPL-3.0 and the desktop application is proprietary; DWG files remain downloadable for opening in AutoCAD or another licensed viewer.

The portal bundles `pdf-lib` 1.17.1 under the MIT License to apply a light Leading Edge watermark to customer-facing product-drawing PDFs in the browser. The license is included at `assets/js/PDF-LIB-LICENSE.md`.

const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '../node_modules/dxf-viewer');
const target = path.resolve(__dirname, '../../wordpress-plugin/le-make-sales-portal/assets/cad-viewer/third-party/dxf-viewer');
fs.mkdirSync(target, { recursive: true });
fs.cpSync(path.join(source, 'src'), path.join(target, 'src'), { recursive: true });
for (const file of ['LICENSE', 'README.md', 'CONTRIBUTORS']) {
  const from = path.join(source, file);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(target, file));
}
fs.copyFileSync(path.join(source, 'package.json'), path.join(target, 'package.json'));

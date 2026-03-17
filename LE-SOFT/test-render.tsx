import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import App from './src/App.tsx';

try {
  console.log('Rendering...');
  const html = renderToString(
    <StaticRouter location="/">
      <App />
    </StaticRouter>
  );
  console.log('Rendered length:', html.length);
} catch (e) {
  console.error('CRASH:', e.message);
  console.error(e.stack);
}

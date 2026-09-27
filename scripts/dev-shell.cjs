// Render the real full-game markup without an online backend or service worker.
// Only the local DEV launchers use this transform; no dev HTML is published.
function renderDevShell(source) {
  let foundEntry = false;
  let html = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, tag => {
    if (/\bsrc=["']https?:/i.test(tag) || /firebaseConfig|serviceWorker/.test(tag)) return '';
    if (/src\/main\.js/.test(tag)) {
      foundEntry = true;
      return '<script type="module" src="src/dev/main.js"></script>';
    }
    return tag;
  });
  if (!foundEntry) throw new Error('Full-game entry not found');
  html = html.replace(/<link\b[^>]*\bhref=["']https?:[^>]*>/gi, '');
  html = html.replace('<title>Bitwiser</title>', '<title>Bitwiser DEV</title>');
  return html.replace('<head>', `<head>
    <meta name="bitwiser-development" content="local-only">
    <meta http-equiv="Content-Security-Policy" content="connect-src 'self' blob:; form-action 'none'; object-src 'none'">
    <link rel="stylesheet" href="src/dev/panel.css">
    <script>
      const db = null, firestore = null;
    </script>`);
}
module.exports = { renderDevShell };

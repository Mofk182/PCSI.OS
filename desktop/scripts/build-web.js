// Prépare desktop/web/ : copie du site + ressources CDN embarquées pour un fonctionnement hors ligne.
const PHOSPHOR_WEIGHTS = ['regular', 'bold', 'fill', 'light', 'thin', 'duotone'];

const PHOSPHOR_LINKS = PHOSPHOR_WEIGHTS
  .map(w => `<link rel="stylesheet" href="vendor/phosphor/${w}/style.css" />`)
  .join('\n  ');

// [motif de la balise distante, remplacement local]
const RULES = [
  [/<script[^>]*src="https:\/\/cdn\.tailwindcss\.com[^"]*"[^>]*><\/script>/g, '<script src="vendor/tailwind.js"></script>'],
  [/<script[^>]*src="https:\/\/unpkg\.com\/@phosphor-icons\/web[^"]*"[^>]*><\/script>/g, PHOSPHOR_LINKS],
  [/<script[^>]*src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/qrcodejs\/[^"]*"[^>]*><\/script>/g, '<script src="vendor/qrcode.min.js"></script>'],
  [/<script[^>]*src="https:\/\/unpkg\.com\/html5-qrcode[^"]*"[^>]*><\/script>/g, '<script src="vendor/html5-qrcode.min.js"></script>'],
  [/<link[^>]*href="https:\/\/fonts\.googleapis\.com[^"]*"[^>]*>/g, '<link rel="stylesheet" href="vendor/fonts.css" />']
];

// Chromium (donc Electron) charge le woff2 : les trois autres formats pèsent des dizaines de Mo pour rien.
function shouldCopyPhosphorFile(filePath) {
  return /(^|[\\/])style\.css$|\.woff2$/i.test(String(filePath));
}

function rewriteHtml(html) {
  return RULES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), html);
}

const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const REPO = path.resolve(DESKTOP, '..');
const OUT = path.join(DESKTOP, 'web');
const NM = path.join(DESKTOP, 'node_modules');

const FONT_WEIGHTS = {
  'plus-jakarta-sans': [400, 500, 600, 700, 800],
  'jetbrains-mono': [400, 500, 600],
  'caveat': [600, 700],
  'oxanium': [500, 600, 700, 800]
};

// Polices : CSS @font-face des sous-ensembles latin (couvre le français), fichiers copiés dans vendor/fonts/.
function buildFonts(vendor) {
  fs.mkdirSync(path.join(vendor, 'fonts'), { recursive: true });
  let css = '';
  for (const [family, weights] of Object.entries(FONT_WEIGHTS)) {
    const pkg = path.join(NM, '@fontsource', family);
    for (const w of weights) {
      const text = fs.readFileSync(path.join(pkg, `latin-${w}.css`), 'utf8');
      for (const m of text.matchAll(/url\(\.\/files\/([^)]+)\)/g)) {
        fs.copyFileSync(path.join(pkg, 'files', m[1]), path.join(vendor, 'fonts', m[1]));
      }
      css += text.replace(/url\(\.\/files\//g, 'url(./fonts/') + '\n';
    }
  }
  fs.writeFileSync(path.join(vendor, 'fonts.css'), css);
}

async function loadTailwind() {
  if (process.env.TAILWIND_LOCAL) return fs.readFileSync(process.env.TAILWIND_LOCAL);
  try {
    const res = await fetch('https://cdn.tailwindcss.com/3.4.17');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    throw new Error(`Impossible de télécharger Tailwind (${e.message}). Hors ligne ? Définis TAILWIND_LOCAL=/chemin/vers/tailwind.js.`);
  }
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'index.html'), rewriteHtml(html));
  for (const dir of ['css', 'js', 'data']) fs.cpSync(path.join(REPO, dir), path.join(OUT, dir), { recursive: true });
  for (const file of ['icon.png', 'manifest.webmanifest', 'nom-du-site.txt']) {
    if (fs.existsSync(path.join(REPO, file))) fs.copyFileSync(path.join(REPO, file), path.join(OUT, file));
  }

  const vendor = path.join(OUT, 'vendor');
  fs.mkdirSync(vendor, { recursive: true });
  buildFonts(vendor);
  for (const w of PHOSPHOR_WEIGHTS) {
    fs.cpSync(path.join(NM, '@phosphor-icons', 'web', 'src', w), path.join(vendor, 'phosphor', w), {
      recursive: true,
      filter: src => fs.statSync(src).isDirectory() || shouldCopyPhosphorFile(src)
    });
  }
  fs.copyFileSync(path.join(NM, 'qrcodejs', 'qrcode.js'), path.join(vendor, 'qrcode.min.js'));
  fs.copyFileSync(path.join(NM, 'html5-qrcode', 'html5-qrcode.min.js'), path.join(vendor, 'html5-qrcode.min.js'));
  fs.writeFileSync(path.join(vendor, 'tailwind.js'), await loadTailwind());
  // Icône de l'application pour electron-builder (dossier build/ par défaut).
  fs.mkdirSync(path.join(DESKTOP, 'build'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'icon.png'), path.join(DESKTOP, 'build', 'icon.png'));
  console.log(`desktop/web prêt (${OUT})`);
}

if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { rewriteHtml, shouldCopyPhosphorFile, PHOSPHOR_WEIGHTS };

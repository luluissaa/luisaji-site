#!/usr/bin/env node
// scripts/build.js
//
// Reads /data/*.json + /templates/*.html and writes a static site into
// /dist — one real HTML file per published entry, plus a card-index page
// per section, the homepage, and the CV page. Entries marked
// `"published": false` are skipped entirely, so a draft can sit in the
// repo without going live.
//
// Run `npm run validate` first — this script assumes the data already
// passed that check and does not re-validate shapes itself.

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const TEMPLATES = path.join(ROOT, 'templates');
const OUT = path.join(ROOT, 'dist');

function readJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}

function readTemplate(name) {
  return fs.readFileSync(path.join(TEMPLATES, name), 'utf8');
}

// Minimal {{TOKEN}} substitution — intentionally not a templating engine.
function fill(template, values) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => (key in values && values[key] != null ? values[key] : ''));
}

function writeFile(relPath, content) {
  const full = path.join(OUT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  console.log('  wrote', relPath);
}

function copyStatic() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  ['css', 'assets'].forEach((dir) => {
    const src = path.join(ROOT, dir);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(OUT, dir), { recursive: true });
  });
  ['.nojekyll', 'CNAME'].forEach((file) => {
    const src = path.join(ROOT, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, file));
  });
}

const site = readJSON('site.json');
const cv = readJSON('cv.json');

const SECTIONS = [
  { file: 'writing.json', dir: 'writing', label: 'Writing' },
  { file: 'programs.json', dir: 'programs', label: 'Programs' },
  { file: 'strategy.json', dir: 'strategy', label: 'Strategy' },
  { file: 'cultural-production.json', dir: 'cultural-production', label: 'Cultural Production' },
];

const shell = readTemplate('page.html');
const entryTemplate = readTemplate('entry.html');
const indexTemplate = readTemplate('index.html');

function renderShell(title, description, bodyHtml) {
  return fill(shell, {
    TITLE: title,
    DESCRIPTION: description || '',
    NAV: site.nav.map((n) => `<a href="${n.href}">${n.label}</a>`).join('\n      '),
    FOOTER_SOCIAL: site.social.map((s) => `<a href="${s.href}">${s.label}</a>`).join(' · '),
    CONTACT_EMAIL: site.contactEmail || '',
    BODY: bodyHtml,
  });
}

console.log('Building luisaji.com →', OUT);
copyStatic();

SECTIONS.forEach(({ file, dir, label }) => {
  const all = readJSON(file);
  const entries = all.filter((e) => e.published);
  const skipped = all.length - entries.length;
  if (skipped > 0) console.log(`  (${file}: skipping ${skipped} unpublished entr${skipped === 1 ? 'y' : 'ies'})`);

  entries.forEach((entry) => {
    const bodyMd = entry.body || entry.description || '';
    const bodyHtml = marked.parse(bodyMd);
    const entryHtml = fill(entryTemplate, {
      TITLE: entry.title,
      SUBTITLE: entry.subtitle || entry.client || entry.venue || '',
      DATE: entry.date || entry.dates || '',
      TAGS: (entry.tags || []).join(', '),
      BODY: bodyHtml,
    });
    const page = renderShell(entry.title, entry.excerpt || entry.description, entryHtml);
    writeFile(`${dir}/${entry.slug}.html`, page);
  });

  const cards = entries
    .map(
      (e) => `      <article class="card">
        <h3><a href="/${dir}/${e.slug}.html">${e.title}</a></h3>
        <p class="meta">${e.date || e.dates || ''}</p>
        <p>${e.excerpt || e.description || ''}</p>
      </article>`
    )
    .join('\n');
  const indexHtml = fill(indexTemplate, { LABEL: label, CARDS: cards || '<p>Nothing published yet.</p>' });
  const page = renderShell(label, `${label} — Luisa Ji`, indexHtml);
  writeFile(`${dir}/index.html`, page);
});

// CV page
const list = (items) => `<ul>${(items || []).map((i) => `<li>${i}</li>`).join('')}</ul>`;
const cvHtml = `
  <h1>CV</h1>
  <section>${marked.parse(cv.bio || '')}</section>
  <h2>Education</h2>${list(cv.education)}
  <h2>Roles</h2>${list(cv.roles)}
  <h2>Experience</h2>${list(cv.experience)}
  <h2>Residencies</h2>${list(cv.residencies)}
  <h2>Recognition</h2>${list(cv.recognition)}
  <h2>Speaking</h2>${list(cv.speaking)}
  <h2>Publications</h2>${list(cv.publications)}
`;
writeFile('cv.html', renderShell('CV', 'Luisa Ji — CV', cvHtml));

// Homepage
const homeHtml = `
  <h1>${site.home.headline}</h1>
  <div>${marked.parse(site.home.intro || '')}</div>
`;
writeFile('index.html', renderShell('Luisa Ji', site.home.intro, homeHtml));

console.log('\nBuild complete →', OUT);

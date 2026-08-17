const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const bookDir = path.join(__dirname, '../book');
const chaptersDir = path.join(bookDir, 'chapters');
const appendicesDir = path.join(bookDir, 'appendices');
const outMd = path.join(bookDir, 'Specs-as-Code-Completo.md');
const outPdf = path.join(bookDir, 'Specs-as-Code-Completo.pdf');
const cssFile = path.join(bookDir, 'book-style.css');

// 1. Create a professional CSS
const css = `
body {
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  line-height: 1.6;
  color: #333;
  margin: 0;
  padding: 0;
}
h1 {
  font-size: 2.5em;
  color: #1a202c;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 10px;
  page-break-before: always;
  margin-top: 2em;
}
h2 {
  font-size: 1.8em;
  color: #2d3748;
  margin-top: 1.5em;
}
h3 {
  font-size: 1.4em;
  color: #4a5568;
}
blockquote {
  background: #f7fafc;
  border-left: 5px solid #4299e1;
  margin: 1.5em 10px;
  padding: 1em 20px;
  font-style: italic;
  color: #4a5568;
}
code {
  font-family: 'Consolas', 'Monaco', monospace;
  background-color: #f1f5f9;
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 0.9em;
}
pre {
  background-color: #1e293b;
  color: #f8fafc;
  padding: 15px;
  border-radius: 8px;
  overflow-x: auto;
}
pre code {
  background-color: transparent;
  color: inherit;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 20px 0;
}
th, td {
  border: 1px solid #cbd5e1;
  padding: 12px;
  text-align: left;
}
th {
  background-color: #f1f5f9;
  font-weight: bold;
}
.cover {
  text-align: center;
  margin-top: 30vh;
  page-break-after: always;
}
.cover h1 {
  border-bottom: none;
  font-size: 4em;
  page-break-before: auto;
  margin-bottom: 0;
}
.cover h2 {
  font-size: 2em;
  color: #718096;
  font-weight: 300;
}
.cover p {
  margin-top: 5em;
  font-size: 1.2em;
  color: #a0aec0;
}
@page {
  margin: 20mm;
}
`;

fs.writeFileSync(cssFile, css);

// 2. Gather all files
function getFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(dir, f))
    .sort(); // Lexicographical sort works for 01, 02... and A, B...
}

const chapters = getFiles(chaptersDir);
const appendices = getFiles(appendicesDir);
const allFiles = [...chapters, ...appendices];

// 3. Concatenate and clean frontmatter
let finalMarkdown = `
<div class="cover">
  <h1>Specs as Code</h1>
  <h2>The Definitive Guide to Spec-Driven Development</h2>
  <p>Autor: Senior Technical Author<br>Proyecto: Smart Parking</p>
</div>

`;

// Simple frontmatter remover
function stripFrontmatter(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n/);
  if (match) {
    return content.slice(match[0].length);
  }
  return content;
}

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  finalMarkdown += stripFrontmatter(content) + '\\n\\n';
}

fs.writeFileSync(outMd, finalMarkdown);
console.log('Markdown book generated at:', outMd);

// 4. Try to convert to PDF using md-to-pdf
console.log('Attempting to generate PDF via md-to-pdf (this may take a minute to download Chromium on first run)...');
try {
  // execFileSync with an argument array, not execSync with an interpolated
  // string: these paths derive from __dirname, so a checkout under a directory
  // with a space — or anything a shell treats as syntax — would break the
  // command or run something else. No shell, no quoting to get wrong.
  execFileSync('npx', ['-y', 'md-to-pdf', '--stylesheet', cssFile, outMd], {
    stdio: 'inherit',
  });
  console.log('PDF successfully generated at:', outPdf);
} catch (e) {
  console.error('Error generating PDF:', e.message);
  process.exit(1);
}

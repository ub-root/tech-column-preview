import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..");
const defaultOutDir = path.join(publicDir, "wordpress-export");

const args = parseArgs(process.argv.slice(2));
const inputFiles = args._.length
  ? args._.map((file) => path.resolve(publicDir, file))
  : fs
      .readdirSync(publicDir)
      .filter((name) => /^preview_.+\.html$/i.test(name))
      .map((name) => path.join(publicDir, name));

const outDir = path.resolve(publicDir, args.out ?? defaultOutDir);
const imageBase = args["image-base"] ?? "__UPLOAD_BASE_URL__/";
fs.mkdirSync(outDir, { recursive: true });

const results = [];

for (const inputFile of inputFiles) {
  const source = fs.readFileSync(inputFile, "utf8");
  const entryHtml = extractEntryHtml(source, inputFile);
  warnMissingLocalImages(entryHtml, inputFile);
  const body = normalizeBody(entryHtml);
  const blocks = convertToWordPressBlocks(body, { imageBase });
  const outFile = path.join(
    outDir,
    `${path.basename(inputFile, ".html").replace(/^preview_/, "")}_wordpress.txt`,
  );

  fs.writeFileSync(outFile, `${blocks.trim()}\n`, "utf8");
  results.push({ input: path.relative(publicDir, inputFile), output: path.relative(publicDir, outFile) });
}

console.log(`Exported ${results.length} file(s):`);
for (const result of results) {
  console.log(`- ${result.input} -> ${result.output}`);
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) {
      parsed._.push(value);
      continue;
    }

    const eq = value.indexOf("=");
    if (eq !== -1) {
      parsed[value.slice(2, eq)] = value.slice(eq + 1);
      continue;
    }

    const key = value.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      i += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function extractEntryHtml(source, inputFile) {
  const startMatch = source.match(/<div class="c-single__entry entry_content clearfix">\s*/);
  if (!startMatch || startMatch.index === undefined) {
    throw new Error(`Entry start was not found: ${inputFile}`);
  }

  const start = startMatch.index + startMatch[0].length;
  const endMarker = /\n<\/div>\s*\n\s*<div class="c-single__cv">/;
  const endMatch = source.slice(start).match(endMarker);
  if (!endMatch || endMatch.index === undefined) {
    throw new Error(`Entry end was not found: ${inputFile}`);
  }

  return source.slice(start, start + endMatch.index);
}

function normalizeBody(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+target="_blank"/g, ' target="_blank" rel="noopener"')
    .trim();
}

function warnMissingLocalImages(html, inputFile) {
  const imagePattern = /<img\b[^>]*\sdata-local=(?:"([^"]+)"|'([^']+)')[^>]*>/gi;
  let match;
  while ((match = imagePattern.exec(html)) !== null) {
    const localPath = match[1] ?? match[2];
    const imagePath = path.resolve(publicDir, localPath);
    if (!fs.existsSync(imagePath)) {
      console.warn(
        `Warning: local image was referenced but not found: ${path.relative(publicDir, inputFile)} -> ${localPath}`,
      );
    }
  }
}

function convertToWordPressBlocks(html, options) {
  const blocks = [];
  const pattern =
    /<figure[\s\S]*?<\/figure>|<h[2-6][\s\S]*?<\/h[2-6]>|<p[\s\S]*?<\/p>|<hr[^>]*>|<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>|<table[\s\S]*?<\/table>/gi;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const block = match[0].trim();
    if (!block) continue;
    blocks.push(convertBlock(block, options));
  }

  return blocks.filter(Boolean).join("\n\n");
}

function convertBlock(block, options) {
  if (/^<h([2-6])\b/i.test(block)) return convertHeading(block);
  if (/^<p\b/i.test(block)) return convertParagraph(block);
  if (/^<figure\b/i.test(block) && /\bwp-block-image\b/i.test(block)) return convertImage(block, options);
  if (/^<figure\b/i.test(block) && /\bwp-block-table\b/i.test(block)) return convertTable(block);
  if (/^<table\b/i.test(block)) return convertTable(`<figure class="wp-block-table">${block}</figure>`);
  if (/^<hr\b/i.test(block)) return wrap("wp:separator", {}, '<hr class="wp-block-separator has-alpha-channel-opacity"/>');
  if (/^<ul\b/i.test(block) || /^<ol\b/i.test(block)) return convertList(block);
  return wrap("wp:html", null, block);
}

function convertHeading(block) {
  const level = Number(block.match(/^<h([2-6])\b/i)?.[1] ?? 2);
  const attrs = level === 2 ? {} : { level };
  const html = block.replace(/^<h([2-6])([^>]*)>/i, `<h$1 class="wp-block-heading">`);
  return wrap("wp:heading", attrs, html);
}

function convertParagraph(block) {
  if (/\sstyle=/.test(block) || /\sclass=/.test(block)) {
    return wrap("wp:html", null, block);
  }
  return wrap("wp:paragraph", {}, block);
}

function convertImage(block, options) {
  const imgMatch = block.match(/<img\b([^>]*)>/i);
  if (!imgMatch) return wrap("wp:html", null, block);

  const attrs = parseHtmlAttrs(imgMatch[1]);
  const localPath = attrs["data-local"];
  const src = attrs.src || (localPath ? joinUrl(options.imageBase, localPath) : "");
  const alt = attrs.alt ?? "";
  const imageClass = "wp-image-replace-after-upload";
  const figureClass = "wp-block-image size-large";

  const img = `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" class="${imageClass}"/>`;
  const html = `<figure class="${figureClass}">${img}</figure>`;
  return wrap("wp:image", { sizeSlug: "large", linkDestination: "none" }, html);
}

function convertTable(block) {
  const html = block
    .replace(/^<figure\b[^>]*>/i, '<figure class="wp-block-table is-style-regular">')
    .replace(/<table\b[^>]*>/i, "<table>");
  return wrap("wp:table", {}, html);
}

function convertList(block) {
  const ordered = /^<ol\b/i.test(block);
  const html = block.replace(/^(<)(ul|ol)\b[^>]*(>)/i, `$1$2$3`);
  return wrap("wp:list", ordered ? { ordered: true } : {}, html);
}

function wrap(name, attrs, html) {
  const attrText = attrs && Object.keys(attrs).length ? ` ${JSON.stringify(attrs)}` : "";
  return `<!-- ${name}${attrText} -->\n${html}\n<!-- /${name} -->`;
}

function parseHtmlAttrs(input) {
  const attrs = {};
  const attrPattern = /([:\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match;
  while ((match = attrPattern.exec(input)) !== null) {
    attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function joinUrl(base, relativePath) {
  if (!base) return relativePath;
  return `${base.replace(/\/+$/, "")}/${relativePath.replace(/^\/+/, "")}`;
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

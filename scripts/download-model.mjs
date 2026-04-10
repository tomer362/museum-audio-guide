#!/usr/bin/env node
/**
 * Populates the public/ directory with all locally-served AI assets so that
 * the app never makes network requests to HuggingFace or any external CDN:
 *
 *   public/transformers/transformers.web.min.js   ← copied from node_modules
 *   public/ort-wasm/*.{wasm,mjs}                  ← copied from node_modules
 *   public/models/onnx-community/Kokoro-82M-v1.0/ ← downloaded from HuggingFace
 *
 * Run once before building:
 *   npm run setup
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MODEL_ID  = 'onnx-community/Kokoro-82M-v1.0';
const MODEL_DIR = path.join(ROOT, 'public', 'models', MODEL_ID);
const ORT_DIR   = path.join(ROOT, 'public', 'ort-wasm');
const TF_DIR    = path.join(ROOT, 'public', 'transformers');
const HF_BASE   = 'https://huggingface.co';
const HF_API    = `${HF_BASE}/api/models/${MODEL_ID}/tree/main`;

// Files to download from the model repo.
// For dtype:'q8' transformers.js loads the "_quantized" onnx variant.
const REQUIRED_PATTERNS = [
  /^config\.json$/,
  /^generation_config\.json$/,
  /^tokenizer\.json$/,
  /^tokenizer_config\.json$/,
  /^vocab\.json$/,
  /^special_tokens_map\.json$/,
  /^onnx\/model_quantized\.onnx$/,
  /^voices\.bin$/,
];

function shouldDownload(filePath) {
  return REQUIRED_PATTERNS.some(re => re.test(filePath));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} – ${url}`);
  return res.json();
}

async function downloadFile(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) {
    console.log(`  ✓ already exists – ${path.relative(ROOT, dest)}`);
    return;
  }
  console.log(`  ⬇ downloading ${path.relative(ROOT, dest)} …`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} – ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

async function listFiles(tree, prefix = '') {
  const results = [];
  for (const entry of tree) {
    if (entry.type === 'directory') {
      const sub = await fetchJson(`${HF_API}/${entry.path}`);
      results.push(...(await listFiles(sub, entry.path)));
    } else if (entry.type === 'file') {
      results.push(entry.path);
    }
  }
  return results;
}

async function downloadModel() {
  console.log(`\n📦 Fetching file listing for ${MODEL_ID} …`);
  const tree = await fetchJson(HF_API);
  const allFiles = await listFiles(tree);
  const toDownload = allFiles.filter(shouldDownload);

  if (toDownload.length === 0) {
    // Fallback: if the API returns unexpected structure, try known paths
    console.warn('⚠  No matching files found in listing – trying known paths …');
    toDownload.push(
      'config.json', 'tokenizer.json', 'tokenizer_config.json',
      'onnx/model_quantized.onnx',
    );
  }

  console.log(`\n🧠 Downloading ${toDownload.length} model file(s) to public/models/ …`);
  for (const file of toDownload) {
    const url  = `${HF_BASE}/${MODEL_ID}/resolve/main/${file}`;
    const dest = path.join(MODEL_DIR, file);
    await downloadFile(url, dest);
  }
}

function copyTransformers() {
  const src = path.join(
    ROOT, 'node_modules', '@huggingface', 'transformers', 'dist',
    'transformers.web.min.js'
  );
  if (!fs.existsSync(src)) {
    console.warn('⚠  @huggingface/transformers not found – run npm install first');
    return;
  }
  fs.mkdirSync(TF_DIR, { recursive: true });
  const dest = path.join(TF_DIR, 'transformers.web.min.js');
  if (fs.existsSync(dest)) {
    console.log('  ✓ already exists – public/transformers/transformers.web.min.js');
    return;
  }
  fs.copyFileSync(src, dest);
  console.log('  ✓ copied – public/transformers/transformers.web.min.js');
}

function copyWasmFiles() {
  const srcDir = path.join(ROOT, 'node_modules', 'onnxruntime-web', 'dist');
  if (!fs.existsSync(srcDir)) {
    console.warn('⚠  onnxruntime-web not found in node_modules – run npm install first');
    return;
  }
  fs.mkdirSync(ORT_DIR, { recursive: true });

  const wasmFiles = fs.readdirSync(srcDir).filter(
    f => (f.endsWith('.wasm') || f.endsWith('.mjs')) &&
         f.startsWith('ort-wasm-simd-threaded') &&
         !f.includes('jsep') && !f.includes('jspi')
  );

  console.log(`\n⚙  Copying ${wasmFiles.length} WASM/MJS file(s) to public/ort-wasm/ …`);
  for (const file of wasmFiles) {
    const dest = path.join(ORT_DIR, file);
    if (fs.existsSync(dest)) {
      console.log(`  ✓ already exists – ${file}`);
      continue;
    }
    fs.copyFileSync(path.join(srcDir, file), dest);
    console.log(`  ✓ copied – ${file}`);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
console.log('\n🔧 Copying locally-served assets from node_modules …');
copyTransformers();
copyWasmFiles();

try {
  await downloadModel();
  console.log('\n✅ Setup complete – run "npm run build" to produce index.html\n');
} catch (err) {
  console.error('\n❌ Model download failed:', err.message);
  console.error(
    'Make sure you have internet access to huggingface.co.\n' +
    'You can also manually place the model files at:\n' +
    `  ${MODEL_DIR}/\n`
  );
  process.exit(1);
}

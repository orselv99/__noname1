
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(__dirname, '../public/models');

if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

const MODELS = [
  {
    repo: 'Xenova/multilingual-e5-base',
    dir: 'embedding',
    files: [
      'config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'special_tokens_map.json',
      {
        name: 'model_quantized.onnx',
        candidates: ['onnx/model_quantized.onnx', 'model_quantized.onnx', 'model.onnx']
      }
    ]
  },
  {
    repo: 'onnx-community/Qwen2.5-1.5B-Instruct',
    dir: 'generation',
    files: [
      'config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'generation_config.json',
      'special_tokens_map.json',
      {
        name: 'model_quantized.onnx',
        candidates: ['onnx/model_quantized.onnx', 'model_quantized.onnx', 'model.onnx']
      },
    ]
  }
];

async function download() {
  console.log('Starting model download...');

  for (const model of MODELS) {
    const modelDir = path.join(MODELS_DIR, model.dir);
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    console.log(`Downloading ${model.repo} to ${modelDir}...`);

    for (const file of model.files) {
      try {
        const isObject = typeof file === 'object';
        const fileName = isObject ? file.name : file;
        const candidates = isObject ? file.candidates : [file];

        const destPath = path.join(modelDir, fileName);

        if (fs.existsSync(destPath)) {
          console.log(`  - ${fileName} already exists, skipping.`);
          continue;
        }

        let downloaded = false;
        for (const candidate of candidates) {
          const url = `https://huggingface.co/${model.repo}/resolve/main/${candidate}`;
          console.log(`Fetching ${candidate}...`);
          const res = await fetch(url);

          if (res.ok) {
            const buffer = await res.arrayBuffer();
            fs.writeFileSync(destPath, Buffer.from(buffer));
            console.log(`  - Saved ${fileName} (from ${candidate})`);
            downloaded = true;
            break;
          } else {
            console.log(`    > Failed to fetch ${candidate} (${res.status})`);
          }
        }

        if (!downloaded) {
          console.error(`  - Failed to download ${fileName} from any candidate path.`);
        }

      } catch (err) {
        console.error(`Error downloading ${file}:`, err);
      }
    }
  }

  console.log('All downloads finished!');
}

download();

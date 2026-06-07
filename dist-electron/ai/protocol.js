"use strict";
// Shared message protocol + constants between the main process (aiIndex.ts) and
// the AI utilityProcess (aiWorker.ts). Structured-clone friendly (plain objects).
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEMA_VERSION = exports.DEFAULT_AI_MODEL = void 0;
// Chosen by benchmark (scripts/ai-bench.cjs) over the user's real notes: best topical
// relations for mixed ES/EN/code content. The embedding dimension is detected at runtime
// from the model, so swapping modelId in settings just works (triggers a reindex).
exports.DEFAULT_AI_MODEL = 'Xenova/paraphrase-multilingual-mpnet-base-v2';
exports.SCHEMA_VERSION = 2; // bump → triggers a full reindex on next start

#!/usr/bin/env node
/**
 * يشغّل اختبار E2E لمشروع Python المولَّد: fastapi أو django.
 *   node scripts/python-backend-e2e.mjs fastapi
 * يستدعي vitest عبر node مباشرة (بلا shell) ويضبط PY_BACKEND_E2E=1.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tests = {
  fastapi: 'src/tests/generatedFastapiE2E.test.ts',
  django: 'src/tests/generatedDjangoE2E.test.ts',
};

const framework = (process.argv[2] || '').toLowerCase();
const testFile = tests[framework];
if (!testFile) {
  console.error(`Usage: node scripts/python-backend-e2e.mjs <${Object.keys(tests).join('|')}>`);
  process.exit(2);
}

const vitestEntry = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

const result = spawnSync(process.execPath, [vitestEntry, 'run', testFile], {
  stdio: 'inherit',
  env: { ...process.env, PY_BACKEND_E2E: '1' },
});

process.exit(result.status ?? 1);

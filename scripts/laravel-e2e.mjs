#!/usr/bin/env node
/**
 * يشغّل اختبار Laravel E2E (تشغيل حقيقي للمشروع المولَّد).
 * يستدعي vitest عبر node مباشرة بلا shell حتى يعمل على Windows وLinux
 * دون cross-env أو تحذير DEP0190.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vitestEntry = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

const result = spawnSync(
  process.execPath,
  [vitestEntry, 'run', 'src/tests/generatedLaravelE2E.test.ts'],
  { stdio: 'inherit', env: { ...process.env, LARAVEL_E2E: '1' } }
);

process.exit(result.status ?? 1);

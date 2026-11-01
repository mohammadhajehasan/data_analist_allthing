import { mkdirSync, writeFileSync } from 'node:fs';
import { buildLargeErdXml } from '../src/tests/largeErdFixtures';

const target = 'src/tests/fixtures/large-shop-erd.drawio';
mkdirSync('src/tests/fixtures', { recursive: true });
writeFileSync(target, buildLargeErdXml(), 'utf8');
const xml = buildLargeErdXml();
const tables = (xml.match(/shape=table;/g) ?? []).length;
const edges = (xml.match(/edge="1"/g) ?? []).length;
console.log(`written ${target} — size=${xml.length}B, tables=${tables}, edges=${edges}`);

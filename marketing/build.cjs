const pptxgen = require('pptxgenjs');
const path = require('path');
const html2pptx = require('C:/Users/Ahmad/.accio/accounts/1786511762/agents/DID-82AD6B-1382AD6BU1787731-7544-23B9F6/agent-core/skills/pptx/scripts/html2pptx.js');

async function main() {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'AI Analytics Platform';
  pptx.title = 'منصة التحليلات الذكية للبيانات';

  const dir = __dirname;
  const slides = [
    '01-cover.html',
    '02-problem.html',
    '03-solution.html',
    '04-feature-olap.html',
    '05-feature-nl2sql.html',
    '06-feature-modeling.html',
    '07-feature-ai.html',
    '08-feature-dashboards.html',
    '09-feature-security.html',
    '10-business-value.html',
    '11-audience.html',
    '12-journey.html',
    '13-cta.html',
  ].map(f => path.join(dir, 'slides', f));

  const failures = [];
  for (const file of slides) {
    try {
      await html2pptx(file, pptx);
    } catch (err) {
      failures.push(`[${path.basename(file)}] ${err.message}`);
    }
  }

  if (failures.length) {
    throw new Error(`BUILD FAILED — ${failures.length}/${slides.length} slide(s) invalid:\n${failures.join('\n')}`);
  }

  await pptx.writeFile({ fileName: path.join(dir, 'المنصة_عرض_تقديمي.pptx') });
  console.log(`Built ${slides.length} slide(s).`);
}

main()
  .catch(err => { console.error(err.message || err); process.exitCode = 1; })
  .finally(() => html2pptx.close());

import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

const importRegex = /import \{ BackgroundMonitor \} from '\.\/components\/common\/BackgroundMonitor';/;
content = content.replace(importRegex, `import { BackgroundMonitor } from './components/common/BackgroundMonitor';\nimport { CopilotDrawer } from './components/layout/CopilotDrawer';`);

const jsxRegex = /<BackgroundMonitor \/>/;
content = content.replace(jsxRegex, `<BackgroundMonitor />\n      <CopilotDrawer />`);

fs.writeFileSync('src/App.tsx', content);

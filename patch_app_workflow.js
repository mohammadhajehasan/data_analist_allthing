import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Add import
const importRegex = /import \{ UserGuidePage \} from '\.\/features\/help\/UserGuidePage';/;
content = content.replace(importRegex, `import { UserGuidePage } from './features/help/UserGuidePage';\nimport { WorkflowStudio } from './features/workflow/WorkflowStudio';`);

// Add routing
const routerRegex = /case 'guide':\n\s*return <UserGuidePage \/>;/;
content = content.replace(routerRegex, `case 'guide':\n        return <UserGuidePage />;\n      case 'workflow':\n        return <WorkflowStudio />;`);

fs.writeFileSync('src/App.tsx', content);

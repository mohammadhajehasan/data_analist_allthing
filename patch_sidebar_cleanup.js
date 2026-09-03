import fs from 'fs';
let content = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf8');

// Fix duplicate import
content = content.replace(/Bot, Workflow,/, 'Bot,');

// Fix the menu item
content = content.replace(/icon: Bot, Workflow,/, 'icon: Bot,');

fs.writeFileSync('src/components/layout/Sidebar.tsx', content);

import fs from 'fs';
let content = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf8');

// Add to menu items
const itemsRegex = /\{\s*id: 'assistant',\s*label: t\.nav\.assistant,\s*icon: Bot,\s*badge: 'AI'\s*\},\n\s*\{\s*id: 'reports',\s*label: t\.nav\.reports,\s*icon: FileText\s*\},/;

const newItems = `{ id: 'assistant', label: t.nav.assistant, icon: Bot, badge: 'AI' },
    { id: 'workflow', label: language === 'ar' ? 'سير العمل' : 'Workflows', icon: Workflow, badge: 'Agent' },
    { id: 'reports', label: t.nav.reports, icon: FileText },`;

content = content.replace(itemsRegex, newItems);
fs.writeFileSync('src/components/layout/Sidebar.tsx', content);

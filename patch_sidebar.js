const fs = require('fs');
let content = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf8');

// Replace the block of className for the sidebar items
content = content.replace(
  /className=\`w-full flex items-center \$\{[\s\S]*?isActive\s*\?\s*'bg-\[var\(--cds-layer-01\)\] text-\[var\(--cds-text-01\)\] font-bold'\s*:\s*'text-\[var\(--cds-text-02\)\] hover:text-\[var\(--cds-text-01\)\] hover:bg-\[var\(--cds-layer-01\)\]'\s*\}\`/g,
  `className={\`w-full flex items-center \${
                isCollapsed ? 'justify-center mx-auto w-10 h-10' : 'justify-between px-3 py-2 mx-2 w-[calc(100%-1rem)]'
              } text-xs font-sans transition-all relative rounded-lg \${
                isActive
                  ? 'bg-[var(--cds-interactive-01)]/10 text-[var(--cds-interactive-01)] font-bold'
                  : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-01)] font-medium'
              }\`}`
);

// Remove the hard active indicator (the border line)
content = content.replace(
  /\{\/\* IBM Carbon active indicator \*\/\}\s*\{isActive && \(\s*<div\s*className=\`absolute top-0 bottom-0 w-\[4px\] bg-\[var\(--cds-interactive-01\)\] \$\{\s*language === 'ar' \? 'right-0' : 'left-0'\s*\}\`\s*\/>\s*\)\}/g,
  `{/* Modern SaaS active indicator (hidden, using background instead) */}`
);

fs.writeFileSync('src/components/layout/Sidebar.tsx', content);

import fs from 'fs';
let content = fs.readFileSync('src/components/layout/Header.tsx', 'utf8');

// Ensure useApp has setIsCopilotOpen
if (content.includes('const { activeDataset')) {
  content = content.replace(/const \{ activeDataset,/, 'const { activeDataset, isCopilotOpen, setIsCopilotOpen,');
}

// Add BrainCircuit icon
content = content.replace(/LayoutGrid,/, 'LayoutGrid, BrainCircuit,');

// Insert button before Feature Flags
const ffRegex = /\{\/\* Feature Flags Button \*\/\}/;
const newBtn = `{/* Copilot Toggle */}
        <button
          onClick={() => setIsCopilotOpen(!isCopilotOpen)}
          className={\`flex items-center gap-1.5 px-2.5 py-1 border transition-colors \${isCopilotOpen ? 'bg-[var(--cds-interactive-01)] text-white border-[var(--cds-interactive-01)]' : 'bg-[var(--cds-layer-01,#262626)] hover:bg-[var(--cds-layer-02,#393939)] text-[var(--cds-text-01,#f4f4f4)] border-[var(--cds-border-subtle,#393939)] hover:border-[var(--cds-interactive-01)]'}\`}
          title={language === 'ar' ? 'الوكيل الذكي' : 'AI Copilot'}
        >
          <BrainCircuit className="w-3.5 h-3.5" />
          <span className="hidden lg:inline font-semibold">
            {language === 'ar' ? 'الوكيل الذكي' : 'Copilot'}
          </span>
        </button>
        {/* Feature Flags Button */}`;
content = content.replace(ffRegex, newBtn);

fs.writeFileSync('src/components/layout/Header.tsx', content);

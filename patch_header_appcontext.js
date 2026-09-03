import fs from 'fs';
let content = fs.readFileSync('src/components/layout/Header.tsx', 'utf8');

// The replacement was: 'const { activeDataset, isCopilotOpen, setIsCopilotOpen,'
// Let's check if it's there
if (!content.includes('isCopilotOpen')) {
   content = content.replace(/const \{ activeDataset,/, 'const { activeDataset, isCopilotOpen, setIsCopilotOpen,');
}

fs.writeFileSync('src/components/layout/Header.tsx', content);

import fs from 'fs';
let content = fs.readFileSync('src/context/AppContext.tsx', 'utf8');

// Add to interface
content = content.replace(
  /activeTab: string;\n\s*setActiveTab: \(tab: string\) => void;/,
  `activeTab: string;\n  setActiveTab: (tab: string) => void;\n  isCopilotOpen: boolean;\n  setIsCopilotOpen: (open: boolean) => void;`
);

// Add to state
content = content.replace(
  /const \[activeTab, setActiveTab\] = useState<string>\('landing'\);/,
  `const [activeTab, setActiveTab] = useState<string>('landing');\n  const [isCopilotOpen, setIsCopilotOpen] = useState<boolean>(false);`
);

// Export context value
content = content.replace(
  /setActiveTab,\n\s*theme,/,
  `setActiveTab,\n        isCopilotOpen,\n        setIsCopilotOpen,\n        theme,`
);

fs.writeFileSync('src/context/AppContext.tsx', content);

import fs from 'fs';
let content = fs.readFileSync('server.ts', 'utf8');

// Add activeView and activeDashboardContext to req.body
content = content.replace(
  /const \{ message, dataset, datasetContext, history = \[\], language = 'ar', provider = 'gemini', model = 'gemini-3\.7-flash', endpointUrl, apiKey \} = req\.body;/,
  `const { message, dataset, datasetContext, history = [], language = 'ar', provider = 'gemini', model = 'gemini-3.7-flash', endpointUrl, apiKey, activeView, activeDashboardContext } = req.body;`
);

// Add context awareness to the prompt
const oldInstructionLine = `const systemInstruction = \`You are the Autonomous AI Agent of the Analytics platform.`;
const newInstructionLine = `const systemInstruction = \`You are the Autonomous AI Agent of the Analytics platform.
You are fully CONTEXT-AWARE. The user is currently viewing the '\${activeView || 'unknown'}' tab.
\${activeDashboardContext ? \`They are currently looking at the Dashboard: "\${activeDashboardContext.name}". Suggest insights or chart additions based on this.\` : ''}`;

content = content.replace(oldInstructionLine, newInstructionLine);

fs.writeFileSync('server.ts', content);

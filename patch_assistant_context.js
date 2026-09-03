import fs from 'fs';
let content = fs.readFileSync('src/features/assistant/AssistantPage.tsx', 'utf8');

const hookRegex = /const \{\n\s*activeChatSession,\n\s*addChatMessage,\n\s*createNewChatSession,\n\s*activeDataset,\n\s*language,\n\s*t,\n\s*saveDataStory,\n\s*saveDashboard,\n\s*setActiveDashboardId,\n\s*setActiveTab,\n\s*\} = useApp\(\);/;

const newHook = `const {
    activeChatSession,
    addChatMessage,
    createNewChatSession,
    activeDataset,
    language,
    t,
    saveDataStory,
    saveDashboard,
    setActiveDashboardId,
    setActiveTab,
    activeTab,
    activeDashboard
  } = useApp();`;

content = content.replace(hookRegex, newHook);

const reqBodyRegex = /datasetContext: \{\n\s*name: activeDataset\.name,\n\s*rowCount: activeDataset\.rowCount,\n\s*columns: activeDataset\.columns,\n\s*sampleData: activeDataset\.data\.slice\(0, 5\),\n\s*\},/;

const newReqBody = `datasetContext: {
            name: activeDataset.name,
            rowCount: activeDataset.rowCount,
            columns: activeDataset.columns,
            sampleData: activeDataset.data.slice(0, 5),
          },
          activeView: activeTab,
          activeDashboardContext: activeDashboard ? { name: activeDashboard.name, widgets: activeDashboard.widgets.map(w => w.title) } : null,`;

content = content.replace(reqBodyRegex, newReqBody);

fs.writeFileSync('src/features/assistant/AssistantPage.tsx', content);

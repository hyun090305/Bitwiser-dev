import * as levels from '../modules/levels.js';
import { configureFullCostExperience } from '../modules/fullCostExperience.js';
import { createDevProgress } from './progress.js';

if (!document.querySelector('meta[name="bitwiser-development"]')) throw new Error('Developer entry requires the local developer launcher');
let storage;
try { storage = localStorage; } catch { /* panel reports session-only changes */ }
export const devProgress = createDevProgress({ storage, getLevels: levels.getLoadedStageData,
  onFailure: error => console.warn('Developer progress was not saved', error) });
levels.configureLevelModule({ progressProvider: devProgress.cleared, accessProvider: devProgress.access });
configureFullCostExperience({ storeProvider: () => devProgress });
devProgress.subscribe(() => {
  levels.loadClearedLevelsFromDb();
});

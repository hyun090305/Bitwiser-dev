// Static dependency order installs local providers before the full entry runs.
import { devProgress } from './setup.js';
import '../main.js';
import { getStageDataPromise } from '../modules/levels.js';
import { mountProgressPanel } from './panel.js';

document.addEventListener('DOMContentLoaded', async () => {
  for (const button of document.querySelectorAll('#googleLoginBtn, #modalGoogleLoginBtn, #usernameSubmit, #guestSubmitBtn')) {
    button.disabled = true;
    button.title = window.currentLang === 'en' ? 'Offline in DEV mode' : 'DEV 모드에서는 온라인 기능을 사용하지 않습니다';
  }
  await getStageDataPromise();
  mountProgressPanel(devProgress);
}, { once: true });

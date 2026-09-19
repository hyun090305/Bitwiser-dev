const features = [
  { id: 'ranking', title: ['랭킹 시스템', 'Rankings'], body: ['더 간결한 회로를 설계하고, 다른 플레이어의 기록에 도전하세요.', 'Design leaner circuits and challenge other players’ records.'], icon: '<path d="M8 3h8v5a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 12v6m-4 3h8m-6-3h4"/>' },
  { id: 'stages', title: ['전체 스테이지', 'Every stage'], body: ['기초 논리를 넘어 제어와 연산까지. 더 깊어지는 회로 퍼즐을 풀어보세요.', 'Go beyond basic logic into control and arithmetic with deeper circuit puzzles.'], icon: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h8v5M6 9v9h9m-1-10 3 3 3-3"/>' },
  { id: 'sandbox', title: ['회로 샌드박스 제작 및 공유', 'Circuit sandbox & sharing'], body: ['정해진 문제를 벗어나 자유롭게 회로를 실험하고, 만든 회로를 공유하세요.', 'Experiment freely beyond the puzzles, build your own circuits and share them.'], icon: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 3v4m6-4v4M9 17v4m6-4v4M3 9h4m-4 6h4m10-6h4m-4 6h4m-7-3h4"/>' },
  { id: 'problems', title: ['사용자 제작 문제 제작 및 공유', 'Create & share puzzles'], body: ['직접 문제를 설계해 공유하고, 다른 플레이어가 만든 도전도 즐겨보세요.', 'Design puzzles for others to solve and take on challenges made by the community.'], icon: '<path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9M8 16l1-5 9-9 4 4-9 9-5 1Zm8-12 4 4"/>' }
];

export function initializeFullVersion({ lang = 'ko' } = {}) {
  const language = lang === 'ko' ? 0 : 1;
  const dialog = document.getElementById('fullVersionDialog');
  const title = language === 0 ? '더 넓은 회로의 세계로' : 'A bigger world of circuits';
  const back = language === 0 ? '프리뷰로 돌아가기' : 'Back to the preview';
  dialog.innerHTML = `
    <button class="full-version-close" aria-label="${language === 0 ? '닫기' : 'Close'}">×</button>
    <div class="full-version-content">
      <header class="full-version-header">
        <p class="full-version-eyebrow"><span class="full-version-mark" aria-hidden="true">B</span> BITWISER <span>FULL VERSION</span></p>
        <h2 id="fullVersionTitle">${title}</h2>
        <p id="fullVersionContext" class="full-version-context"></p>
      </header>
      <ol class="full-feature-list">
        ${features.map((feature, i) => `<li data-feature="${feature.id}" class="full-feature-card">
          <div class="full-feature-top"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${feature.icon}</svg><span>0${i + 1}</span></div>
          <h3>${feature.title[language]}</h3><p>${feature.body[language]}</p>
        </li>`).join('')}
      </ol>
    </div>
    <footer class="full-version-footer"><p>${language === 0 ? '당신의 다음 아이디어는 어디까지 이어질까요?' : 'Where will your next idea lead?'}</p><button class="full-version-back">${back}<span aria-hidden="true">↗</span></button></footer>`;
  const close = () => dialog.close();
  dialog.querySelector('.full-version-close').addEventListener('click', close);
  dialog.querySelector('.full-version-back').addEventListener('click', close);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  // Keep map shortcuts beneath this modal from consuming its keys.
  document.addEventListener('keydown', event => { if (dialog.open) event.stopImmediatePropagation(); }, true);
  return featureId => {
    const selected = features.find(feature => feature.id === featureId);
    dialog.dataset.feature = selected?.id || '';
    dialog.querySelector('#fullVersionContext').textContent = selected
      ? (language === 0 ? `‘${selected.title[0]}’ 기능은 정식판에서 만나볼 수 있습니다.` : `${selected.title[1]} is part of the full version.`)
      : (language === 0 ? '정식판에서 이어지는 네 가지 경험을 만나보세요.' : 'Discover four ways to keep exploring in the full version.');
    dialog.querySelectorAll('[data-feature]').forEach(card => {
      card.classList.toggle('is-selected', card.dataset.feature === selected?.id);
      if (card.dataset.feature === selected?.id) card.setAttribute('aria-current', 'true'); else card.removeAttribute('aria-current');
    });
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('.full-version-content').scrollTop = 0;
    dialog.querySelector('.full-version-back').focus({ preventScroll: true });
  };
}

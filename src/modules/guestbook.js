let activeSubmitGuestEntry = () => {};

/**
 * Initializes the guestbook feature by wiring Firebase listeners and DOM hooks.
 * @param {Object} options
 * @param {() => string | undefined} options.getUsername - Function returning the current username.
 * @param {string} options.messageInputId - DOM id for the guestbook message input.
 * @param {string} options.listElementId - DOM id for the container listing guestbook entries.
 * @param {string} [options.submitButtonId] - Optional DOM id for a submit button.
 * @returns {{ submitGuestEntry: () => void }}
 */
export function initializeGuestbook({
  getUsername,
  messageInputId,
  listElementId,
  submitButtonId
} = {}) {
  const doc = typeof document !== 'undefined' ? document : null;

  const resolveElement = id => (doc && id ? doc.getElementById(id) : null);
  let messageInput = resolveElement(messageInputId);
  let listElement = resolveElement(listElementId);
  const submitButton = resolveElement(submitButtonId);

  const ensureElements = () => {
    if (!doc) return;
    if (!messageInput && messageInputId) messageInput = resolveElement(messageInputId);
    if (!listElement && listElementId) listElement = resolveElement(listElementId);
  };

  const submitGuestEntryImpl = () => {
    ensureElements();
    if (!messageInput) return;

    const message = messageInput.value.trim();
    if (!message) {
      if (typeof alert === 'function') {
        alert('내용을 입력해주세요!');
      }
      return;
    }

    const nameProvider = typeof getUsername === 'function' ? getUsername : undefined;
    const entry = {
      name: (nameProvider && nameProvider()) || '익명',
      message,
      time: Date.now()
    };

    if (typeof db === 'undefined' || !db || typeof db.ref !== 'function') {
      console.warn('Firebase database instance is unavailable; cannot submit guestbook entry.');
      return;
    }

    db.ref('guestbook').push(entry, err => {
      if (err) {
        if (typeof alert === 'function') {
          alert('전송에 실패했습니다.');
        }
      } else {
        messageInput.value = '';
      }
    });
  };

  activeSubmitGuestEntry = submitGuestEntryImpl;

  if (submitButton && typeof submitButton.addEventListener === 'function') {
    submitButton.addEventListener('click', submitGuestEntry);
  }

  if (typeof window !== 'undefined') {
    window.submitGuestEntry = submitGuestEntry;
  }

  if (typeof db !== 'undefined' && db && typeof db.ref === 'function') {
    db.ref('guestbook').on('value', snapshot => {
      ensureElements();
      if (!listElement) return;

      listElement.innerHTML = '';
      const entries = [];
      snapshot.forEach(child => {
        entries.push(child.val());
        return false;
      });
      entries.sort((a, b) => (b.time || 0) - (a.time || 0));

      const fragment = doc && doc.createDocumentFragment ? doc.createDocumentFragment() : null;
      const container = fragment || listElement;
      entries.forEach(entry => {
        const item = doc ? doc.createElement('div') : null;
        if (!item) return;

        item.style.margin = '10px 0';
        const name = entry && typeof entry.name === 'string' ? entry.name : '익명';
        const safeMessage = entry && typeof entry.message === 'string' ? entry.message : '';
        const time = entry && entry.time ? new Date(entry.time).toLocaleString() : '';
        const displayName = name.length > 20 ? `${name.slice(0, 20)}...` : name;
        item.innerHTML = `<b>${displayName}</b> (${time}):<br>${safeMessage}`;
        container.appendChild(item);
      });

      if (fragment) {
        listElement.appendChild(fragment);
      }
    });
  }

  return { submitGuestEntry };
}

export function submitGuestEntry() {
  return activeSubmitGuestEntry();
}

export function createToastManager(container) {
  const toastContainer = ensureContainer(container);
  const toasts = new Map();

  function show(options = {}) {
    const {
      id = `toast-${Date.now()}`,
      message = '',
      autoHide = false,
      duration = 4000,
      spinner = false,
      progress = null,
      actions = [],
      dismissible = true,
      onClose
    } = options;

    if (toasts.has(id)) {
      remove(id, { silent: true });
    }

    const toastEl = document.createElement('div');
    toastEl.className = 'toast';

    if (dismissible) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'toast-close';
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.innerHTML = '&times;';
      closeBtn.addEventListener('click', () => remove(id));
      toastEl.appendChild(closeBtn);
    }

    const bodyEl = document.createElement('div');
    bodyEl.className = 'toast-body';

    const spinnerEl = document.createElement('div');
    spinnerEl.className = 'toast-spinner';
    if (!spinner) {
      spinnerEl.style.display = 'none';
    }

    const contentEl = document.createElement('div');
    contentEl.className = 'toast-content';

    const messageEl = document.createElement('div');
    messageEl.className = 'toast-message';
    messageEl.textContent = message;

    const progressEl = document.createElement('div');
    progressEl.className = 'toast-progress';
    const progressBarEl = document.createElement('div');
    progressBarEl.className = 'toast-progress-bar';
    progressEl.appendChild(progressBarEl);
    if (progress == null) {
      progressEl.style.display = 'none';
    } else {
      progressBarEl.style.width = `${clampPercent(progress)}%`;
    }

    const actionsEl = document.createElement('div');
    actionsEl.className = 'toast-actions';
    if (!actions || !actions.length) {
      actionsEl.style.display = 'none';
    } else {
      actions.forEach(action => {
        if (!action || typeof action.label === 'undefined') return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = String(action.label);
        btn.addEventListener('click', () => {
          try {
            if (typeof action.onClick === 'function') {
              action.onClick();
            }
          } finally {
            if (action.closeOnClick !== false) {
              remove(id);
            }
          }
        });
        actionsEl.appendChild(btn);
      });
    }

    bodyEl.appendChild(spinnerEl);
    contentEl.appendChild(messageEl);
    contentEl.appendChild(progressEl);
    contentEl.appendChild(actionsEl);
    bodyEl.appendChild(contentEl);

    toastEl.appendChild(bodyEl);
    toastContainer.appendChild(toastEl);

    const toastRecord = {
      element: toastEl,
      messageEl,
      progressEl,
      progressBarEl,
      spinnerEl,
      onClose,
      timeoutId: null
    };

    if (autoHide) {
      const delay = typeof duration === 'number' && duration > 0 ? duration : 4000;
      toastRecord.timeoutId = window.setTimeout(() => remove(id), delay);
    }

    toasts.set(id, toastRecord);
    return id;
  }

  function update(id, updates = {}) {
    const toast = toasts.get(id);
    if (!toast) return;

    if (Object.prototype.hasOwnProperty.call(updates, 'message') && toast.messageEl) {
      toast.messageEl.textContent = String(updates.message ?? '');
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'progress') && toast.progressEl && toast.progressBarEl) {
      const value = updates.progress;
      if (value == null || Number.isNaN(value)) {
        toast.progressEl.style.display = 'none';
      } else {
        toast.progressEl.style.display = '';
        toast.progressBarEl.style.width = `${clampPercent(value)}%`;
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'spinner') && toast.spinnerEl) {
      const showSpinner = Boolean(updates.spinner);
      toast.spinnerEl.style.display = showSpinner ? '' : 'none';
    }
  }

  function remove(id, { silent = false } = {}) {
    const toast = toasts.get(id);
    if (!toast) return false;
    toasts.delete(id);

    if (toast.timeoutId) {
      window.clearTimeout(toast.timeoutId);
    }

    const { element, onClose } = toast;
    element.dataset.state = 'closing';

    let removed = false;
    const cleanup = () => {
      if (removed) return;
      removed = true;
      element.remove();
      if (!silent && typeof onClose === 'function') {
        onClose();
      }
    };

    element.addEventListener('animationend', cleanup, { once: true });
    window.setTimeout(cleanup, 220);

    return true;
  }

  return { show, update, remove };
}

function clampPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(100, Math.max(0, num));
}

function ensureContainer(existingContainer) {
  if (existingContainer && existingContainer instanceof HTMLElement) {
    return existingContainer;
  }
  const container = document.createElement('div');
  container.id = 'toastContainer';
  container.className = 'toast-container';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'true');
  document.body.appendChild(container);
  return container;
}

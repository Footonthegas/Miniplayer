const $ = (id) => document.getElementById(id);
let entitlement = { ok: false, active: false };

async function openWelcome() {
  await chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  window.close();
}

async function getStatus() {
  try {
    return await chrome.runtime.sendMessage({ type: 'premium:status' });
  } catch (error) {
    return { ok: false, active: false, error: error?.message || 'Could not contact the extension service worker.' };
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const toggleBtn = $('toggleBtn');
  const autoPipToggle = $('autoPipToggle');
  const autoNote = $('autoNote');
  const premiumStatus = $('premiumStatus');
  const upgradeBtn = $('upgradeBtn');
  const welcomeBtn = $('welcomeBtn');
  const checkPremiumBtn = $('checkPremiumBtn');

  const renderEnabled = (enabled) => {
    toggleBtn.textContent = enabled ? 'Disable Mini Player' : 'Enable Mini Player';
    toggleBtn.dataset.enabled = String(enabled);
  };

  async function render() {
    const sync = await chrome.storage.sync.get(['enabled', 'autoPipEnabled']);
    entitlement = await getStatus();
    const enabled = sync.enabled ?? true;
    const premium = entitlement.ok && entitlement.active === true;

    renderEnabled(enabled);
    autoPipToggle.checked = premium && sync.autoPipEnabled === true;
    autoPipToggle.disabled = !premium;
    upgradeBtn.textContent = premium ? 'Premium & support' : 'Explore Premium';

    if (!entitlement.ok) {
      premiumStatus.textContent = entitlement.error || 'Premium status could not be verified. Check your internet connection and backend setup.';
    } else {
      premiumStatus.textContent = premium
        ? 'Premium is active. Automatic mode still depends on Chrome support and permission.'
        : 'Automatic mode is a Premium feature. Your regular Mini Player remains available for free.';
    }

    autoNote.textContent = premium
      ? 'When enabled, Chrome may open the floating player when the playing tab becomes hidden.'
      : 'Subscribe to unlock automatic switching. You can still open the Mini Player manually.';
  }

  await render();

  toggleBtn.addEventListener('click', async () => {
    const newState = toggleBtn.dataset.enabled !== 'true';
    await chrome.storage.sync.set({ enabled: newState });
    renderEnabled(newState);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined) {
        await chrome.tabs.sendMessage(tab.id, { action: 'set-enabled', enabled: newState });
      }
    } catch (error) {
      console.debug('Could not message active tab:', error?.message || error);
    }
  });

  autoPipToggle.addEventListener('change', async () => {
    entitlement = await getStatus();
    if (!entitlement.ok || entitlement.active !== true) {
      autoPipToggle.checked = false;
      premiumStatus.textContent = entitlement.error || 'Premium could not be verified. Please check your subscription.';
      autoPipToggle.disabled = true;
      return;
    }
    await chrome.storage.sync.set({ autoPipEnabled: autoPipToggle.checked });
    premiumStatus.textContent = autoPipToggle.checked
      ? 'Automatic mode enabled. Chrome may ask you to allow automatic Picture-in-Picture.'
      : 'Automatic mode disabled.';
  });

  async function checkPremium() {
    checkPremiumBtn.disabled = true;
    const oldLabel = checkPremiumBtn.textContent;
    checkPremiumBtn.textContent = 'Checking…';
    try {
      await render();
    } finally {
      checkPremiumBtn.disabled = false;
      checkPremiumBtn.textContent = oldLabel;
    }
  }

  upgradeBtn.addEventListener('click', openWelcome);
  welcomeBtn.addEventListener('click', openWelcome);
  checkPremiumBtn?.addEventListener('click', checkPremium);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && (changes.enabled || changes.autoPipEnabled)) render();
  });
});

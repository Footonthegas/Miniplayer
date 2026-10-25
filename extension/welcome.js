// Premium checkout is created by the backend so each subscription can be mapped to this installation.
// Razorpay API keys and webhook secrets must never be placed in extension files.
const DONATION_URL = ''; // Optional public donation URL, e.g. a UPI/payment page you operate.
// After deploying Render's static site, paste its origin here (no page path).
const LEGAL_SITE_URL = ''; // Example: https://mini-player-legal-pages.onrender.com

function configureLegalLinks() {
  const base = (LEGAL_SITE_URL || '').trim().replace(/\/$/, '');
  const links = [
    ['privacyLink', '/privacy.html'],
    ['termsLink', '/terms.html'],
    ['supportLink', '/support.html']
  ];
  const nav = document.getElementById('legalLinks');
  if (!nav || !/^https:\/\//i.test(base) || base.includes('YOUR-')) return;
  for (const [id, path] of links) {
    const link = document.getElementById(id);
    if (!link) continue;
    const url = `${base}${path}`;
    link.href = url;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      chrome.tabs.create({ url });
    });
  }
  nav.hidden = false;
}

function configureDonationButton() {
  const button = document.getElementById('donateBtn');
  const supportRow = document.getElementById('supportRow');
  if (!button) return;
  if (!DONATION_URL || !/^https:\/\//i.test(DONATION_URL)) {
    if (supportRow) supportRow.hidden = true;
    return;
  }
  if (supportRow) supportRow.hidden = false;
  button.disabled = false;
  button.textContent = 'Support the project';
  button.addEventListener('click', () => chrome.tabs.create({ url: DONATION_URL }));
}

async function startPremiumCheckout(button, note) {
  button.disabled = true;
  button.textContent = 'Preparing secure checkout…';
  note.textContent = 'Your subscription link is being created securely. Your payment is verified by the server before Premium is activated.';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'premium:checkout' });
    if (result?.active === true) {
      note.textContent = 'Premium already appears to be active for this extension installation. Check the status below.';
      button.textContent = 'Premium already active';
      return;
    }
    if (!result?.ok || !result.url || !/^https:\/\//i.test(result.url)) {
      throw new Error(result?.error || 'The checkout service did not return a valid secure URL.');
    }
    await chrome.tabs.create({ url: result.url });
    button.textContent = 'Checkout opened';
    note.textContent = 'Complete the subscription on Razorpay, then return here and choose “I have paid — check Premium”. Activation waits for Razorpay’s verified webhook; a redirect alone does not unlock features.';
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Try Premium checkout again';
    note.textContent = error?.message || 'Could not start checkout. Check that the backend is deployed and configured.';
  }
}

async function checkPremiumStatus(button, note) {
  const cancelButton = document.getElementById('cancelSubscriptionBtn');
  button.disabled = true;
  button.textContent = 'Checking…';
  try {
    const status = await chrome.runtime.sendMessage({ type: 'premium:refresh' });
    if (status?.ok && status.active === true) {
      if (cancelButton) {
        cancelButton.hidden = false;
        cancelButton.disabled = status.cancelAtCycleEnd === true;
        cancelButton.textContent = status.cancelAtCycleEnd === true ? 'Cancellation scheduled' : 'Cancel renewal';
      }
      note.textContent = status.cancelAtCycleEnd === true
        ? 'Cancellation is scheduled for the end of the current paid billing cycle. Premium remains available until that period ends.'
        : 'Premium is active for this extension installation. Open or reload Netflix to use Automatic Mini Player.';
      button.textContent = 'Premium active ✓';
    } else if (!status?.ok) {
      if (cancelButton) cancelButton.hidden = true;
      note.textContent = status?.error || 'Could not verify Premium. Check the backend setup and your connection.';
      button.disabled = false;
      button.textContent = 'Try checking again';
    } else {
      if (cancelButton) cancelButton.hidden = true;
      note.textContent = 'Premium is not active yet. If you just completed checkout, wait for Razorpay’s webhook delivery and check again.';
      button.disabled = false;
      button.textContent = 'I have paid — check Premium';
    }
  } catch (error) {
    note.textContent = error?.message || 'Could not verify Premium status.';
    button.disabled = false;
    button.textContent = 'Try checking again';
  }
}

async function cancelPremiumRenewal(button, note) {
  const shouldCancel = window.confirm(
    'Schedule cancellation at the end of the current paid billing cycle? This stops future renewals, and Premium remains available until the current period ends.'
  );
  if (!shouldCancel) return;

  button.disabled = true;
  button.textContent = 'Scheduling cancellation…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'premium:cancel' });
    if (!result?.ok || result.cancelAtCycleEnd !== true) {
      throw new Error(result?.error || 'Could not schedule cancellation.');
    }
    note.textContent = 'Cancellation is scheduled at the end of the current paid billing cycle. Premium remains available until then.';
    button.textContent = 'Cancellation scheduled';
    button.disabled = true;
    const checkButton = document.getElementById('checkPremiumBtn');
    if (checkButton) await checkPremiumStatus(checkButton, note);
  } catch (error) {
    note.textContent = error?.message || 'Could not schedule cancellation. Please contact support.';
    button.textContent = 'Try cancellation again';
    button.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const premiumButton = document.getElementById('premiumBtn');
  const premiumNote = document.getElementById('premiumNote');
  const checkPremiumButton = document.getElementById('checkPremiumBtn');
  const cancelButton = document.getElementById('cancelSubscriptionBtn');

  premiumButton.disabled = false;
  premiumButton.textContent = 'Subscribe to Premium';
  premiumButton.addEventListener('click', () => startPremiumCheckout(premiumButton, premiumNote));
  checkPremiumButton?.addEventListener('click', () => checkPremiumStatus(checkPremiumButton, premiumNote));
  cancelButton?.addEventListener('click', () => cancelPremiumRenewal(cancelButton, premiumNote));

  configureDonationButton();
  configureLegalLinks();
  document.getElementById('openNetflix').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.netflix.com/' });
  });
});

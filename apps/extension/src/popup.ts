/**
 * Popup Script
 * 
 * Controls for the extension popup UI
 */

import { getUserSession, isAuthenticated } from './auth';

console.log('[Popup] Loaded');

// Elements
const toggle = document.getElementById('toggle') as HTMLElement;
const statusIndicator = document.getElementById('statusIndicator') as HTMLElement;
const statusText = document.getElementById('statusText') as HTMLElement;
const dashboardBtn = document.getElementById('dashboardBtn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const helpLink = document.getElementById('helpLink') as HTMLAnchorElement;
const eventCount = document.getElementById('eventCount') as HTMLElement;
const domainCount = document.getElementById('domainCount') as HTMLElement;

// Load current status and check authentication
chrome.storage.local.get(['enabled', 'stats'], async (result) => {
  const enabled = result.enabled ?? true;
  updateUI(enabled);
  
  if (result.stats) {
    eventCount.textContent = result.stats.eventCount || '0';
    domainCount.textContent = result.stats.domainCount || '0';
  }

  // Check authentication status
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    // Try to get session from web app
    const session = await getUserSession();
    if (!session) {
      // Show authentication required message
      statusText.textContent = 'Not Authenticated';
      statusIndicator.classList.add('disabled');
      statusIndicator.classList.remove('enabled');
    }
  }
});

// Toggle enable/disable
toggle.addEventListener('click', () => {
  chrome.storage.local.get(['enabled'], (result) => {
    const newState = !(result.enabled ?? true);
    chrome.storage.local.set({ enabled: newState }, () => {
      updateUI(newState);
      
      // Notify background script
      chrome.runtime.sendMessage({
        type: 'SET_STATUS',
        enabled: newState,
      });
    });
  });
});

// Open dashboard
dashboardBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'http://localhost:3000/dashboard',
  });
  window.close();
});

// Open settings
settingsBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'http://localhost:3000/dashboard', // TODO: Create settings page
  });
  window.close();
});

// Help link
helpLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({
    url: 'https://github.com/yourusername/observe-and-create', // TODO: Update URL
  });
  window.close();
});

/**
 * Update UI based on enabled state
 */
function updateUI(enabled: boolean) {
  if (enabled) {
    toggle.classList.add('active');
    statusIndicator.classList.remove('disabled');
    statusText.textContent = 'Active';
  } else {
    toggle.classList.remove('active');
    statusIndicator.classList.add('disabled');
    statusText.textContent = 'Paused';
  }
}

export {};


/**
 * Chrome Extension Configuration
 * 
 * This file stores the extension ID for external messaging between the web dashboard
 * and the Chrome extension.
 * 
 * HOW TO GET YOUR EXTENSION ID:
 * 1. Load your extension in Chrome (chrome://extensions)
 * 2. Enable "Developer mode" toggle in the top right
 * 3. Copy the "ID" shown under your extension
 * 4. Paste it below
 * 
 * NOTE: The extension ID changes when you:
 * - Reload an unpacked extension (during development)
 * - Publish to Chrome Web Store (permanent ID)
 * 
 * For production, you should publish to Chrome Web Store to get a permanent ID.
 */

// TEMPORARY: Replace this with your actual extension ID
// You can find it at chrome://extensions after loading the extension
export const EXTENSION_ID = 'YOUR_EXTENSION_ID_HERE';

/**
 * Check if the extension is installed and reachable
 */
export async function isExtensionInstalled(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    return false; // Not in Chrome browser
  }

  try {
    const response = await chrome.runtime.sendMessage(EXTENSION_ID, { type: 'PING' });
    return response?.status === 'ok';
  } catch (error) {
    console.warn('[Extension] Not installed or unreachable:', error);
    return false;
  }
}

/**
 * Send a message to the extension
 */
export async function sendMessageToExtension(message: any): Promise<any> {
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    throw new Error('Chrome extension APIs not available');
  }

  if (EXTENSION_ID === 'YOUR_EXTENSION_ID_HERE') {
    throw new Error('Please configure EXTENSION_ID in lib/extension-config.ts');
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(EXTENSION_ID, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}


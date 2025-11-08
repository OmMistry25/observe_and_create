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
export const EXTENSION_ID = 'pkcgaajogokeemkaknhnmchkiooophkh';

/**
 * Check if the extension is installed and reachable
 */
export async function isExtensionInstalled(): Promise<boolean> {
  // Check if we're in a browser environment with Chrome extensions API
  if (typeof window === 'undefined') {
    return false; // Not in browser (SSR)
  }
  
  // Use type assertion to access chrome global
  const chromeGlobal = (window as any).chrome;
  if (!chromeGlobal || !chromeGlobal.runtime) {
    console.log('[Extension] Chrome runtime not available');
    return false; // Not in Chrome browser or extensions API not available
  }

  try {
    console.log('[Extension] Sending PING to extension ID:', EXTENSION_ID);
    
    // Add a timeout to prevent infinite hanging
    const pingPromise = new Promise<any>((resolve, reject) => {
      chromeGlobal.runtime.sendMessage(EXTENSION_ID, { type: 'PING' }, (response: any) => {
        if (chromeGlobal.runtime.lastError) {
          reject(new Error(chromeGlobal.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Extension check timeout')), 3000)
    );
    
    const response = await Promise.race([pingPromise, timeoutPromise]);
    console.log('[Extension] PING response:', response);
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
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    throw new Error('Not in browser environment');
  }
  
  // Use type assertion to access chrome global
  const chromeGlobal = (window as any).chrome;
  if (!chromeGlobal || !chromeGlobal.runtime) {
    throw new Error('Chrome extension APIs not available');
  }

  return new Promise((resolve, reject) => {
    chromeGlobal.runtime.sendMessage(EXTENSION_ID, message, (response: any) => {
      if (chromeGlobal.runtime.lastError) {
        reject(new Error(chromeGlobal.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}


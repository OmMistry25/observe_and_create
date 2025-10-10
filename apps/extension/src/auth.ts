/**
 * Authentication utilities for the extension
 */

/**
 * Get user session from the web app
 * This function will be called from the popup to get the current session
 */
export async function getUserSession(): Promise<any> {
  try {
    // Try to get session from the web app's localStorage
    const tabs = await chrome.tabs.query({ url: 'http://localhost:3000/*' });
    
    if (tabs.length === 0) {
      console.log('[Auth] No localhost tabs found');
      return null;
    }

    // Inject script to get session from the web app
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id! },
      func: () => {
        // Get session from localStorage (Supabase stores it there)
        const sessionKey = 'sb-adgopseugeurfoznpxwe-auth-token';
        const sessionData = localStorage.getItem(sessionKey);
        
        if (sessionData) {
          try {
            const parsed = JSON.parse(sessionData);
            return parsed;
          } catch (e) {
            return null;
          }
        }
        return null;
      },
    });

    const session = results[0]?.result;
    
    if (session?.access_token) {
      // Store session in extension storage
      await chrome.storage.local.set({ session });
      console.log('[Auth] Session retrieved and stored');
      return session;
    }

    return null;
  } catch (error) {
    console.error('[Auth] Error getting session:', error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const { session } = await chrome.storage.local.get(['session']);
  return !!(session?.access_token);
}

/**
 * Clear stored session
 */
export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(['session']);
  console.log('[Auth] Session cleared');
}

/**
 * Refresh session if needed
 */
export async function refreshSessionIfNeeded(): Promise<boolean> {
  const { session } = await chrome.storage.local.get(['session']);
  
  if (!session?.access_token) {
    return false;
  }

  // Check if token is expired (basic check)
  const tokenExpiry = session.expires_at * 1000; // Convert to milliseconds
  const now = Date.now();
  
  if (now >= tokenExpiry) {
    console.log('[Auth] Token expired, clearing session');
    await clearSession();
    return false;
  }

  return true;
}

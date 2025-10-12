/**
 * T18.1: Contextual Nudges
 * T18.2: Nudge Timing Strategy
 * 
 * Shows non-intrusive notifications at appropriate times:
 * - Pattern detected: "I noticed you do this often. Want to automate?"
 * - Existing automation: "Run [name]?"
 * - High friction: "I can help with this"
 * 
 * Features:
 * - Waits for idle >2s before showing
 * - Tracks dismissals (24h cooldown per nudge type)
 * - Respects user preferences
 */

export interface Nudge {
  id: string;
  type: 'pattern_detected' | 'automation_available' | 'high_friction';
  title: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
  metadata?: any;
}

interface NudgeDismissal {
  nudgeId: string;
  dismissedAt: number;
}

// Cooldown period in milliseconds (24 hours)
const DISMISSAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Idle time threshold in milliseconds (2 seconds)
const IDLE_THRESHOLD_MS = 2000;

// Track last user activity
let lastActivityTime = Date.now();
let idleCheckInterval: number | null = null;

// Queue of pending nudges
const nudgeQueue: Nudge[] = [];

// Currently showing nudge
let currentNudge: Nudge | null = null;

/**
 * Initialize nudge system
 * Starts tracking user activity and idle state
 */
export function initNudgeSystem() {
  // Track user activity
  trackUserActivity();
  
  // Start checking for idle state
  startIdleCheck();
  
  console.log('[NudgeManager] Nudge system initialized');
}

/**
 * Track user activity to detect idle periods
 */
function trackUserActivity() {
  const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
  
  activityEvents.forEach(eventType => {
    document.addEventListener(eventType, () => {
      lastActivityTime = Date.now();
    }, { passive: true, capture: true });
  });
}

/**
 * Periodically check if user is idle and show queued nudges
 */
function startIdleCheck() {
  if (idleCheckInterval !== null) return;
  
  idleCheckInterval = window.setInterval(() => {
    const now = Date.now();
    const idleTime = now - lastActivityTime;
    
    // If idle for >2s and we have queued nudges, show the next one
    if (idleTime >= IDLE_THRESHOLD_MS && nudgeQueue.length > 0 && !currentNudge) {
      showNextNudge();
    }
  }, 1000); // Check every second
}

/**
 * Show the next nudge from the queue
 */
async function showNextNudge() {
  if (nudgeQueue.length === 0 || currentNudge) return;
  
  const nudge = nudgeQueue.shift()!;
  
  // Check if this nudge was recently dismissed
  const isDismissed = await isNudgeDismissed(nudge.id);
  if (isDismissed) {
    console.log('[NudgeManager] Nudge recently dismissed, skipping:', nudge.id);
    // Try next nudge
    if (nudgeQueue.length > 0) {
      setTimeout(() => showNextNudge(), 500);
    }
    return;
  }
  
  currentNudge = nudge;
  renderNudge(nudge);
  
  console.log('[NudgeManager] Showing nudge:', nudge.type, nudge.title);
}

/**
 * Queue a nudge to be shown when user is idle
 */
export async function queueNudge(nudge: Nudge) {
  // Check if already dismissed
  const isDismissed = await isNudgeDismissed(nudge.id);
  if (isDismissed) {
    console.log('[NudgeManager] Nudge recently dismissed, not queueing:', nudge.id);
    return;
  }
  
  // Check if already in queue
  const existingIndex = nudgeQueue.findIndex(n => n.id === nudge.id);
  if (existingIndex >= 0) {
    console.log('[NudgeManager] Nudge already queued:', nudge.id);
    return;
  }
  
  nudgeQueue.push(nudge);
  console.log('[NudgeManager] Queued nudge:', nudge.type, nudge.title, `(queue size: ${nudgeQueue.length})`);
}

/**
 * Check if a nudge was recently dismissed (within cooldown period)
 */
async function isNudgeDismissed(nudgeId: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['dismissedNudges'], (result) => {
      const dismissals: NudgeDismissal[] = result.dismissedNudges || [];
      const now = Date.now();
      
      // Clean up old dismissals (outside cooldown window)
      const validDismissals = dismissals.filter(d => 
        now - d.dismissedAt < DISMISSAL_COOLDOWN_MS
      );
      
      // Save cleaned list
      if (validDismissals.length !== dismissals.length) {
        chrome.storage.local.set({ dismissedNudges: validDismissals });
      }
      
      // Check if this nudge was dismissed
      const dismissed = validDismissals.some(d => d.nudgeId === nudgeId);
      resolve(dismissed);
    });
  });
}

/**
 * Record a nudge dismissal
 */
function recordDismissal(nudgeId: string) {
  chrome.storage.local.get(['dismissedNudges'], (result) => {
    const dismissals: NudgeDismissal[] = result.dismissedNudges || [];
    dismissals.push({
      nudgeId,
      dismissedAt: Date.now(),
    });
    chrome.storage.local.set({ dismissedNudges: dismissals });
  });
}

/**
 * Render a nudge on the page
 */
function renderNudge(nudge: Nudge) {
  // Remove any existing nudge
  const existing = document.getElementById('observe-create-nudge');
  if (existing) {
    existing.remove();
  }
  
  // Create nudge container
  const container = document.createElement('div');
  container.id = 'observe-create-nudge';
  container.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    max-width: 360px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.25);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: slideInUp 0.3s ease-out;
  `;
  
  // Add animation keyframes
  if (!document.getElementById('nudge-styles')) {
    const style = document.createElement('style');
    style.id = 'nudge-styles';
    style.textContent = `
      @keyframes slideInUp {
        from {
          transform: translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      @keyframes slideOutDown {
        from {
          transform: translateY(0);
          opacity: 1;
        }
        to {
          transform: translateY(100%);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Title
  const title = document.createElement('div');
  title.style.cssText = `
    font-weight: 600;
    font-size: 16px;
    margin-bottom: 8px;
  `;
  title.textContent = nudge.title;
  
  // Message
  const message = document.createElement('div');
  message.style.cssText = `
    font-size: 14px;
    line-height: 1.5;
    margin-bottom: 12px;
    opacity: 0.95;
  `;
  message.textContent = nudge.message;
  
  // Actions container
  const actions = document.createElement('div');
  actions.style.cssText = `
    display: flex;
    gap: 8px;
    margin-top: 12px;
  `;
  
  // Action button (if provided)
  if (nudge.actionLabel) {
    const actionBtn = document.createElement('button');
    actionBtn.style.cssText = `
      background: white;
      color: #667eea;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      flex: 1;
    `;
    actionBtn.textContent = nudge.actionLabel;
    actionBtn.onclick = () => {
      handleNudgeAction(nudge);
      dismissNudge(nudge.id);
    };
    actions.appendChild(actionBtn);
  }
  
  // Dismiss button
  const dismissBtn = document.createElement('button');
  dismissBtn.style.cssText = `
    background: rgba(255,255,255,0.2);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    ${nudge.actionLabel ? 'flex: 0.5;' : 'flex: 1;'}
  `;
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.onclick = () => dismissNudge(nudge.id);
  actions.appendChild(dismissBtn);
  
  // Assemble nudge
  container.appendChild(title);
  container.appendChild(message);
  container.appendChild(actions);
  
  document.body.appendChild(container);
  
  // Auto-dismiss after 15 seconds
  setTimeout(() => {
    if (currentNudge?.id === nudge.id) {
      dismissNudge(nudge.id, false); // Don't record auto-dismissals
    }
  }, 15000);
}

/**
 * Handle nudge action click
 */
function handleNudgeAction(nudge: Nudge) {
  console.log('[NudgeManager] Nudge action clicked:', nudge.type);
  
  if (nudge.actionUrl) {
    window.open(nudge.actionUrl, '_blank');
  }
  
  // Send message to background for tracking
  chrome.runtime.sendMessage({
    type: 'NUDGE_ACTION',
    nudge: nudge,
  });
}

/**
 * Dismiss the current nudge
 */
function dismissNudge(nudgeId: string, recordDismissalFlag = true) {
  const container = document.getElementById('observe-create-nudge');
  if (container) {
    container.style.animation = 'slideOutDown 0.3s ease-in';
    setTimeout(() => {
      container.remove();
    }, 300);
  }
  
  if (currentNudge?.id === nudgeId) {
    currentNudge = null;
  }
  
  if (recordDismissalFlag) {
    recordDismissal(nudgeId);
  }
  
  console.log('[NudgeManager] Dismissed nudge:', nudgeId);
  
  // Show next nudge if available (after a delay)
  if (nudgeQueue.length > 0) {
    setTimeout(() => showNextNudge(), 3000);
  }
}

/**
 * Clean up nudge system
 */
export function cleanupNudgeSystem() {
  if (idleCheckInterval !== null) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
  
  const container = document.getElementById('observe-create-nudge');
  if (container) {
    container.remove();
  }
  
  nudgeQueue.length = 0;
  currentNudge = null;
}


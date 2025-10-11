/**
 * Semantic Analysis Pipeline (T06.1)
 * 
 * Classifies intent and extracts entities from event context
 * Results stored in interaction_quality table
 */

export type Intent = 'research' | 'transaction' | 'comparison' | 'creation' | 'communication' | 'unknown';

interface EventContext {
  type: string;
  url: string;
  title?: string;
  text?: string;
  meta?: Record<string, any>;
}

/**
 * Classify user intent based on event context
 * Uses rule-based classification with URL patterns and event metadata
 */
export function classifyIntent(event: EventContext): Intent {
  const url = event.url.toLowerCase();
  const title = (event.title || '').toLowerCase();
  const text = (event.text || '').toLowerCase();
  const type = event.type;

  // Transaction signals
  if (
    url.includes('/cart') ||
    url.includes('/checkout') ||
    url.includes('/payment') ||
    url.includes('/buy') ||
    url.includes('/purchase') ||
    url.includes('/order') ||
    title.includes('checkout') ||
    title.includes('payment') ||
    text.includes('add to cart') ||
    text.includes('buy now') ||
    text.includes('checkout')
  ) {
    return 'transaction';
  }

  // Comparison signals
  if (
    url.includes('/compare') ||
    url.includes('/vs') ||
    url.includes('comparison') ||
    title.includes('compare') ||
    title.includes(' vs ') ||
    title.includes('comparison') ||
    text.includes('compare') ||
    // Multiple tabs/windows open (tracked via context)
    (event.meta?.tabCount && event.meta.tabCount > 5)
  ) {
    return 'comparison';
  }

  // Creation signals
  if (
    type === 'form' ||
    url.includes('/create') ||
    url.includes('/new') ||
    url.includes('/edit') ||
    url.includes('/compose') ||
    url.includes('/write') ||
    url.includes('/post') ||
    title.includes('create') ||
    title.includes('new ') ||
    title.includes('edit') ||
    title.includes('compose') ||
    text.includes('create') ||
    text.includes('submit') ||
    event.meta?.action === 'submit'
  ) {
    return 'creation';
  }

  // Communication signals
  if (
    url.includes('mail.google.com') ||
    url.includes('outlook') ||
    url.includes('/messages') ||
    url.includes('/chat') ||
    url.includes('/inbox') ||
    url.includes('slack.com') ||
    url.includes('discord.com') ||
    url.includes('teams.microsoft.com') ||
    url.includes('twitter.com') ||
    url.includes('linkedin.com/messaging') ||
    title.includes('inbox') ||
    title.includes('messages') ||
    title.includes('chat')
  ) {
    return 'communication';
  }

  // Research signals (default for most browsing)
  if (
    type === 'search' ||
    url.includes('google.com/search') ||
    url.includes('bing.com/search') ||
    url.includes('/search') ||
    url.includes('wikipedia.org') ||
    url.includes('stackoverflow.com') ||
    url.includes('github.com') ||
    url.includes('reddit.com') ||
    url.includes('youtube.com/watch') ||
    title.includes('how to') ||
    title.includes('what is') ||
    title.includes('tutorial')
  ) {
    return 'research';
  }

  // Default to research for general browsing
  if (type === 'click' || type === 'nav') {
    return 'research';
  }

  return 'unknown';
}

/**
 * Calculate friction score based on event metadata
 * Returns a score between 0 (no friction) and 1 (high friction)
 */
export function calculateFrictionScore(event: EventContext): number {
  let score = 0;
  const meta = event.meta || {};

  // Friction event type
  if (event.type === 'friction') {
    score += 0.5;

    // Specific friction types add more weight
    if (meta.frictionType === 'rapid_scroll') score += 0.2;
    if (meta.frictionType === 'back_button') score += 0.3;
    if (meta.frictionType === 'form_abandon') score += 0.4;
    if (meta.frictionType === 'error_state') score += 0.5;
    if (meta.frictionType === 'slow_load') score += 0.3;
    if (meta.frictionType === 'rage_click') score += 0.4;
  }

  // Error events indicate friction
  if (event.type === 'error') {
    score += 0.6;
  }

  // High scroll velocity
  if (meta.velocity && meta.velocity > 1000) {
    score += 0.2;
  }

  // Slow loading time
  if (meta.loadTime && meta.loadTime > 5000) {
    score += 0.3;
  }

  // Multiple clicks on same element (rage clicks)
  if (meta.clickCount && meta.clickCount > 3) {
    score += 0.3;
  }

  // Cap at 1.0
  return Math.min(score, 1.0);
}

/**
 * Detect struggle signals from event context
 */
export function detectStruggleSignals(event: EventContext): string[] {
  const signals: string[] = [];
  const meta = event.meta || {};

  if (event.type === 'friction') {
    if (meta.frictionType) signals.push(meta.frictionType);
  }

  if (meta.velocity && meta.velocity > 1000) {
    signals.push('rapid_scrolling');
  }

  if (meta.loadTime && meta.loadTime > 5000) {
    signals.push('slow_page_load');
  }

  if (meta.clickCount && meta.clickCount > 3) {
    signals.push('rage_clicks');
  }

  if (event.type === 'error') {
    signals.push('error_encountered');
  }

  return signals;
}

/**
 * Determine if event indicates success
 */
export function detectSuccess(event: EventContext): boolean | null {
  const url = event.url.toLowerCase();
  const title = (event.title || '').toLowerCase();

  // Success indicators
  if (
    url.includes('/success') ||
    url.includes('/confirmation') ||
    url.includes('/thank-you') ||
    url.includes('/complete') ||
    title.includes('success') ||
    title.includes('confirmation') ||
    title.includes('thank you') ||
    title.includes('order confirmed')
  ) {
    return true;
  }

  // Failure indicators
  if (
    url.includes('/error') ||
    url.includes('/failed') ||
    title.includes('error') ||
    title.includes('failed') ||
    event.type === 'error'
  ) {
    return false;
  }

  // Unknown
  return null;
}

/**
 * Analyze event and return complete interaction quality data
 */
export function analyzeEvent(event: EventContext) {
  return {
    inferred_intent: classifyIntent(event),
    friction_score: calculateFrictionScore(event),
    success: detectSuccess(event),
    struggle_signals: detectStruggleSignals(event),
  };
}


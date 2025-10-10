# Loading the Extension in Chrome

Follow these steps to load the Observe & Create extension in Chrome for development:

## Prerequisites

1. **Build the extension**:
   ```bash
   cd apps/extension
   pnpm build
   ```

   This creates a `dist/` folder with all extension files.

## Loading in Chrome

1. **Open Chrome Extensions page**:
   - Go to `chrome://extensions/` in your browser
   - Or: Menu (⋮) → More Tools → Extensions

2. **Enable Developer Mode**:
   - Toggle the "Developer mode" switch in the top-right corner

3. **Load the extension**:
   - Click "Load unpacked"
   - Navigate to: `/Users/ommistry/observe_and_create/apps/extension/dist`
   - Select the `dist` folder
   - Click "Select"

4. **Verify it loaded**:
   - You should see "Observe & Create v0.0.1" in your extensions list
   - The extension icon should appear in your Chrome toolbar
   - Status should show "Active"

## Using the Extension

1. **Click the extension icon** in the toolbar to open the popup
   - Toggle enable/disable
   - View today's activity stats
   - Open dashboard

2. **Browse any website** - the extension will capture:
   - Clicks
   - Form submissions
   - Navigation
   - Search queries
   - Dwell time

3. **Open the Console** (F12 → Console tab) to see:
   - `[Background] Service worker started`
   - `[Content] Script loaded on: <url>`
   - `[Content] Event captured: ...`

## Debugging

### Check Background Service Worker
1. Go to `chrome://extensions/`
2. Find "Observe & Create"
3. Click "service worker" link
4. Opens DevTools for the background script

### Check Content Script
1. Open any website
2. Press F12 to open DevTools
3. Go to Console tab
4. Look for `[Content]` messages

### Check Popup
1. Right-click the extension icon
2. Select "Inspect popup"
3. Opens DevTools for the popup

## Common Issues

### Extension won't load
- Make sure you selected the `dist` folder, not `src`
- Run `pnpm build` first
- Check for errors in `chrome://extensions/`

### No events captured
- Check if extension is enabled (toggle in popup)
- Open DevTools Console to see if content script loaded
- Check Background service worker console

### Changes not showing
- Click the refresh icon (🔄) on the extension card in `chrome://extensions/`
- Or remove and re-add the extension

## Next Steps

After loading:
1. Test event capture by browsing sites
2. Check events appear in dashboard: http://localhost:3000/dashboard
3. View timeline chart updates
4. Test filters and search

## Development Workflow

While developing:
1. Make changes to extension code
2. Run `pnpm build` in `apps/extension`
3. Click refresh (🔄) in `chrome://extensions/`
4. Test changes

Or use watch mode:
```bash
cd apps/extension
pnpm dev  # Rebuilds on file changes
```

Then manually refresh the extension after each rebuild.


# Mini Player and PiP for Netflix — Auto PiP prototype

This folder is a cleaned MV3 package based on the supplied extension files. It removes the missing `netflix_bridge_v1.js` manifest reference, uses one set of consistently named popup files, and opens `welcome.html` only after a fresh install.

## What is implemented

- Existing manual Mini Player and native PiP controls remain in `content.js`.
- The popup includes a Premium-only Automatic Mini Player setting.
- When the Premium entitlement is active and the setting is enabled, the content script registers a Media Session `enterpictureinpicture` handler. Chrome can call this handler for automatic PiP when its media playback Auto-PiP support, conditions, and site permission allow it.
- A first-install welcome page explains free usage and provides configurable Premium/donation links.
- The bridge script is not referenced in the manifest.

## Critical limitations

1. This is a feature prototype, **not a complete paid Premium system**. The checkout and donation URLs in `welcome.js` are empty until you provide your own real URLs. Payment completion and license verification are not implemented. Do not publish a paid Premium claim or take payment until the entitlement flow is securely implemented.
2. `chrome.storage.local.pro` is currently the local entitlement flag. It is not secure proof of purchase and must only be set by a properly verified license flow in a release build. For local testing only, you can temporarily run `chrome.storage.local.set({pro: true})` in the extension service worker's DevTools console, set `autoPipEnabled: true` in `chrome.storage.sync`, and reload the Netflix tab. Remove any manual entitlement/testing shortcut before release.
3. Automatic PiP is controlled by Chrome and is not guaranteed on every tab switch/minimize. The video must satisfy Chrome's media eligibility rules and the user may need to allow automatic Picture-in-Picture for Netflix. Test on recent Chrome desktop; on some builds, automatic PiP flags/site permission may need to be enabled.
4. Registering `enterpictureinpicture` may conflict with Netflix's own Media Session handler for that same action. The web API does not provide a standard way to read back an existing handler and restore it later, so test PiP and media controls carefully on Netflix before release. The extension intentionally avoids calling `setActionHandler(null)` on disable because that could clear a site's handler.
5. The existing content script's seek/replay/history paths post `MP_SEEK` messages. Since the bridge file was removed, test seeking/replay/history specifically. Normal playback can work even if those bridge-dependent actions do not. If they fail, either restore a minimal verified bridge or remove/replace those seek controls.
6. Test this package from `chrome://extensions` using **Load unpacked** before preparing a Web Store ZIP.

## Configure before release

- Put a real HTTPS checkout/upgrade destination into `PREMIUM_CHECKOUT_URL` and a real optional donation destination into `DONATION_URL` in `welcome.js`.
- Implement a server-side purchase/license verification flow before using the `pro` entitlement for paid features. Never trust a client-side `pro: true` value as a paid entitlement.
- Confirm every data disclosure, privacy policy, support URL, and extension description matches the final code.
- Check that Netflix changes have not broken its player selectors or PiP behavior.

// Netflix Mini Player - Content Script (v5)
// - Two buttons in Netflix's control bar: Mini Player (with subtitles) + native PiP
// - Mini Player window: play/pause on the left + simple timeline, subtitles without background
// - Pro: subtitle color/background, replay last line, subtitle history

// =====================================================================
// EDIT HERE: where the buttons go in Netflix's bottom control bar
// =====================================================================
// The buttons are placed next to the FIRST control found in this list.
// To move them: put a different control first (e.g. fullscreen), or change BUTTON_SIDE.
const CONTROL_ANCHORS = [
  '[data-uia="control-next"]',              // next-episode button
  '[data-uia="control-episodes"]',          // episodes button
  '[data-uia="control-audio-subtitle"]',    // subtitles button
  '[data-uia="control-speed"]',             // playback speed button
  '[data-uia="control-fullscreen-enter"]',  // fullscreen (normal)
  '[data-uia="control-fullscreen-exit"]'    // fullscreen (when already fullscreen)
];
// 'before' = left of that control, 'after' = right of it
const BUTTON_SIDE = 'before';
// Icon size multiplier (1 = same size as Netflix's icons, 0.9 = a bit smaller, 1.1 = a bit bigger)

const ICON_SCALE = 1.0;       // Global size: 1 = normal
const CUSTOM_ICON_SIZE = 24;  // Mini Player and PiP SVG size in pixels

// Manual position and size adjustments.
// X: positive = right, negative = left.
// Y: positive = down, negative = up.
// Scale: 1 = normal, 1.1 = 10% larger.
const CONTROL_TUNING = {
  flag: { x: 0, y: 0 },

  buttons: {
    mini: { x: 0, y: 11, scale: 1.88 },
    pip: { x: 0, y: 11, scale: 1.8 },

    'control-play-pause-play': { x: 0, y: 0, scale: 1 },
    'control-play-pause-pause': { x: 0, y: 0, scale: 1 },
    'control-back10': { x: 0, y: 0, scale: 1 },
    'control-forward10': { x: 0, y: 0, scale: 1 },
    'control-volume-high': { x: 0, y: 0, scale: 1 },

    'control-next': { x: 0, y: 0, scale: 1 },
    'control-episodes': { x: 0, y: 0, scale: 1 },
    'control-audio-subtitle': { x: 0, y: 0, scale: 1 },
    'control-speed': { x: 0, y: 0, scale: 1 },
    'control-fullscreen-enter': { x: 0, y: 0, scale: 1 },
    'control-fullscreen-exit': { x: 0, y: 0, scale: 1 }
  }
};

const FULLSCREEN_NUDGE_X = 0; // Move fullscreen left
const FLAG_NUDGE_X = 0;        // Move top-right flag right // Size in pixels; try 28–36

const MINI_MOVE_X = 0;  // Mini Player: left/right in pixels
const PIP_MOVE_X = 0;   // PiP: left/right in pixels

const MINI_MOVE_Y = 0;  // Mini Player: up/down in pixels
const PIP_MOVE_Y = 0;   // PiP: up/down in pixels

// =====================================================================

const DEBUG = false;
const log = (...args) => DEBUG && console.log('NETFLIX MINI PLAYER:', ...args);

const NETFLIX_CONFIG = {
  videoSelectors: [
    'video[data-uia="player-video"]',
    'video.player-video',
    'video[role="presentation"]',
    'video'
  ],
  watchPagePatterns: [/^\/watch\//, /^\/title\/\d+\/watch/],
  subtitleSelector: '.player-timedtext'
};

// Subtitles: no background by default
const DEFAULT_SUB_STYLE = { scale: 100, color: '#ffffff', bg: 0 };

// Mini player icon: window with caption lines

const MINI_ICON = `
  <svg viewBox="0 0 24 24"
       width="100%" height="100%"
       fill="currentColor"
       style="color:#fff;display:block">
    <path d="M21 3H3C1.9 3 1 3.9 1 5v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
    <path d="M6 13.5h5v2H6zm7 0h5v2h-5z"/>
  </svg>`;


// Native Picture-in-Picture icon
const PIP_ICON = `
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" style="color:#fff">
    <path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/>
  </svg>`;

const PLAY_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

// ---- Mini player window styling (edit sizes here) ----
// Subtitle base size is 3.2vw (3.2% of the window width). Lower it for smaller default subtitles.
const PIP_CSS = `
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden;
    font-family: "Netflix Sans", Helvetica, Arial, sans-serif; }
  #wrap { position: relative; width: 100%; height: 100%; background: #000;
    --scale: 1; --color: #fff; --bg: 0; }
  video { position: absolute; inset: 0; width: 100% !important; height: 100% !important;
    object-fit: contain !important; display: block; background: #000; transform: none !important; }
  #sub { position: absolute; left: 4%; right: 4%; bottom: 52px; text-align: center; pointer-events: none; }
  #st { display: inline; white-space: pre-line; font-weight: 700; line-height: 1.35;
    font-size: max(11px, calc(3.2vw * var(--scale)));
    color: var(--color);
background: transparent !important;
padding: 0;
border-radius: 0;
text-shadow: none !important;
    -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  #st:empty { display: none; }
  #bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 40px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: linear-gradient(transparent, rgba(0,0,0,.75));
  z-index: 10;
  opacity: 1;
  transition: opacity .2s ease;
}

/* Hide the timeline and all controls when idle */
#wrap.controls-hidden {
  cursor: none;
}

#wrap.controls-hidden #bar {
  opacity: 0;
  pointer-events: none;
}
  #bar button { background: none; border: 0; color: #fff; cursor: pointer; font-size: 14px;
    padding: 4px 6px; border-radius: 4px; line-height: 1; display: flex; align-items: center; }
  #bar button:hover { background: rgba(255,255,255,.2); }
  #seek { flex: 1; min-width: 0; height: 14px; margin: 0; background: transparent;
    -webkit-appearance: none; appearance: none; cursor: pointer; --pct: 0%; }
  #seek::-webkit-slider-runnable-track { height: 4px; border-radius: 2px;
    background: linear-gradient(to right, #e50914 var(--pct), rgba(255,255,255,.35) var(--pct)); }
  #seek::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px;
    margin-top: -4px; border-radius: 50%; background: #e50914; border: 0; }
  #hist { display: none; position: absolute; inset: 0 0 40px 0; overflow: auto;
    background: rgba(0,0,0,.9); color: #fff; padding: 8px; font-size: 13px; }
  #hist.open { display: block; }
  #hist div { padding: 6px 4px; border-bottom: 1px solid #333; cursor: pointer; }
  #hist div:hover { background: #222; }
  #toast { display: none; position: absolute; top: 8px; left: 8px; right: 8px; text-align: center;
    color: #fff; background: rgba(0,0,0,.8); padding: 6px; border-radius: 4px; font-size: 12px; }
`;

const PIP_HTML = `
  <div id="wrap">
    <div id="sub"><span id="st"></span></div>
    <div id="toast"></div>
    
    <div id="bar">
      <button id="b-play" title="Play / Pause (Space)"></button>
      <input id="seek" type="range" min="0" max="1000" step="1" value="0">
      <button id="b-sm" title="Smaller subtitles">A-</button>
      <button id="b-lg" title="Larger subtitles">A+</button>
      
     
    </div>
  </div>`;

class NetflixMiniPlayer {
  constructor() {
    this.video = null;
    this.observer = null;
    this.debounceTimer = null;
    this.urlTimer = null;
    this.lastUrl = location.href;

    this.controlBtns = [];
    this.refUnit = null;
    this.spacingOk = false;
    this.fixRaf = 0;
    this.pip = null;
    this.opening = false;
    this.lastSubText = '';
    this.subHistory = [];

    this.enabled = true;
    this.pro = false;
    this.autoPipEnabled = false;
    this.autoPipHandlerRegistered = false;

    this.subStyle = { ...DEFAULT_SUB_STYLE };

    ['handleVideoChange', 'handleKeyDown', 'toggleMiniPlayer', 'toggleNativePip', '_onMessage'].forEach((n) => {
      this[n] = this[n].bind(this);
    });

    this.init();
  }

  async init() {
    try {
      if (window !== window.top) return;
      await this.loadSettings();
      await this.loadAutomaticPipSettings();
      // Refresh server-verified Premium status periodically; fail closed if the API cannot be reached.
      this.premiumStatusTimer = setInterval(() => {
        chrome.runtime.sendMessage({ type: 'premium:status' })
          .then((status) => {
            this.pro = status?.ok === true && status.active === true;
            this.syncAutomaticPipHandler();
          })
          .catch(() => {
            this.pro = false;
          });
      }, 60_000);

      chrome.runtime.onMessage.addListener(this._onMessage);
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        if (changes.enabled) {
          this.enabled = !!changes.enabled.newValue;
          this.ensureControlButtons();
        }
        if (changes.subStyle) {
          this.subStyle = { ...DEFAULT_SUB_STYLE, ...(changes.subStyle.newValue || {}) };
          this.applySubStyle();
        }
        if (changes.autoPipEnabled) {
          this.autoPipEnabled = !!changes.autoPipEnabled.newValue;
          this.syncAutomaticPipHandler();
        }
      });
      document.addEventListener('keydown', this.handleKeyDown);

      // Netflix scales its controls with the window, so re-measure spacing on resize / fullscreen
      window.addEventListener('resize', () => { this.spacingOk = false; this.scheduleFix(); });
      document.addEventListener('fullscreenchange', () => {
        setTimeout(() => { this.spacingOk = false; this.scheduleFix(); }, 250);
      });

      // SPA navigation: poll the URL
      this.urlTimer = setInterval(() => {
        if (location.href !== this.lastUrl) {
          this.lastUrl = location.href;
          this.onRouteChange();
        }
      }, 500);

      this.onRouteChange();
    } catch (e) {
      console.error('NETFLIX MINI PLAYER: Error in init:', e);
    }
  }

  async loadSettings() {
    try {
      const sync = await chrome.storage.sync.get(['enabled', 'subStyle']);
      this.enabled = sync.enabled ?? true;
      this.subStyle = { ...DEFAULT_SUB_STYLE, ...(sync.subStyle || {}) };


    } catch (e) {
      console.error('NETFLIX MINI PLAYER: Failed to load settings:', e);
    }
  }

  async loadAutomaticPipSettings() {
    try {
      const [sync, entitlement] = await Promise.all([
        chrome.storage.sync.get(['autoPipEnabled']),
        chrome.runtime.sendMessage({ type: 'premium:status' }).catch(() => null)
      ]);
      // Premium is granted only by a successful server entitlement check, never by a local flag.
      this.pro = entitlement?.ok === true && entitlement.active === true;
      this.autoPipEnabled = sync.autoPipEnabled === true;
      this.syncAutomaticPipHandler();
    } catch (error) {
      this.pro = false;
      console.warn('NETFLIX MINI PLAYER: Could not verify Premium / load automatic PiP settings:', error);
    }
  }

  // Chrome can invoke this Media Session action when its automatic-PiP
  // feature is enabled and the user has allowed the site to enter PiP.
  // Calling requestWindow directly on a visibilitychange event is not reliable:
  // Document PiP normally requires a user gesture. This browser-provided action
  // is the supported automatic-PiP path on compatible Chrome versions.
  syncAutomaticPipHandler() {
    if (!this.pro || !this.autoPipEnabled || this.autoPipHandlerRegistered) return;
    const mediaSession = navigator.mediaSession;
    if (!mediaSession || typeof mediaSession.setActionHandler !== 'function') return;

    try {
      mediaSession.setActionHandler('enterpictureinpicture', (details) => {
        // Chrome 142+ uses contentoccluded when the active content becomes hidden.
        // If an older Chrome build omits the reason, still allow the requested action.
        if (details && details.reason && details.reason !== 'contentoccluded') return;
        if (!this.enabled || !this.pro || !this.autoPipEnabled) return;
        if (!this.isWatchPage() || !this.video || this.video.paused || this.video.ended) return;
        if (this.pip || document.pictureInPictureElement || this.opening) return;
        this.toggleMiniPlayer();
      });
      this.autoPipHandlerRegistered = true;
    } catch (error) {
      console.warn('NETFLIX MINI PLAYER: Automatic PiP is not available in this browser context:', error);
    }
  }

  isWatchPage() {
    return NETFLIX_CONFIG.watchPagePatterns.some((p) => p.test(window.location.pathname));
  }

  onRouteChange() {
    if (this.isWatchPage()) this.setupVideoObserver();
    else this.teardownWatchPage();
  }

  // ---------- Video detection ----------

  findVideoElement() {
    if (!this.isWatchPage()) return null;
    for (const selector of NETFLIX_CONFIG.videoSelectors) {
      const video = document.querySelector(selector);
      if (video && video.tagName === 'VIDEO' && !video.closest('.preview, [data-uia*="preview"]')) {
        return video;
      }
    }
    return null;
  }

  setupVideoObserver() {
    if (this.observer) this.observer.disconnect();

    this.observer = new MutationObserver(() => {
      if (this.debounceTimer) return;

      // Check for recreated Netflix controls almost immediately.
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        this.handleVideoChange();
      }, 30);
    });
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disablepictureinpicture', 'src']
    });

    this.handleVideoChange();
  }

  handleVideoChange() {
    // While the video lives in the PiP window, document.querySelector can't see it
    if (this.pip || !this.isWatchPage()) return;

    const newVideo = this.findVideoElement();
    if (newVideo !== this.video) this.video = newVideo;
    if (this.video) this.enablePictureInPicture();
    this.ensureControlButtons();
  }

  enablePictureInPicture() {
    if (!this.video) return;
    this.video.removeAttribute('disablepictureinpicture');
    this.video.disablePictureInPicture = false;
  }

  teardownWatchPage() {
    this.closePip();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.removeControlButtons();
    this.video = null;
  }

  // ---------- Control-bar buttons ----------

  ensureControlButtons() {
    if (!this.enabled || !this.video) {
      this.removeControlButtons();
      return;
    }
    if (this.controlBtns.length && this.controlBtns.every((b) => b.isConnected)) {
      if (!this.spacingOk) this.scheduleFix();
      return;
    }
    this.removeControlButtons();

    let anchor = null;
    for (const sel of CONTROL_ANCHORS) {
      anchor = document.querySelector(sel);
      if (anchor) break;
    }
    if (!anchor || !anchor.parentElement) return;

    // The Netflix element we position next to (and copy size/spacing from)
    const unit =
      anchor.tagName !== 'BUTTON'
        ? anchor
        : anchor.parentElement.querySelectorAll('button').length === 1
          ? anchor.parentElement
          : anchor;
    if (!unit.parentElement) return;


    const defs = [
      {
        key: 'mini',
        icon: MINI_ICON,
        title: 'Mini Player with subtitles (Alt+M)',
        onClick: () => this.toggleMiniPlayer()
      },
      {
        key: 'pip',
        icon: PIP_ICON,
        title: 'Picture-in-Picture (Alt+P)',
        onClick: () => this.toggleNativePip()
      }
    ];

    const buttons = defs.map((d) => this.makeControlButton(d));

    // Reuse Netflix's native control wrapper for each custom button.
    const nodes = buttons.map((btn) => {
      if (anchor.tagName === 'BUTTON' && unit !== anchor) {
        const wrapper = unit.cloneNode(false);

        wrapper.removeAttribute('id');
        wrapper.removeAttribute('data-uia');
        wrapper.setAttribute(
          'data-miniplayer-slot',
          btn.getAttribute('data-miniplayer') || ''
        );

        wrapper.appendChild(btn);
        return wrapper;
      }

      return btn;
    });


    if (BUTTON_SIDE === 'after') {
      let ref = unit;
      nodes.forEach((n) => {
        ref.after(n);
        ref = n;
      });
    } else {
      nodes.forEach((n) => unit.parentElement.insertBefore(n, unit));
    }

    this.controlBtns = nodes;
    this.refUnit = unit;
    this.spacingOk = false;
    this.scheduleFix();
  }

  makeControlButton({ key, icon, title, onClick }) {
    const btn = document.createElement('button');
    btn.setAttribute('data-miniplayer', key);
    btn.setAttribute('aria-label', title);
    btn.title = title;
    btn.innerHTML = icon;

    const svg = btn.querySelector('svg');

    if (svg) {
      svg.setAttribute('width', String(CUSTOM_ICON_SIZE));
      svg.setAttribute('height', String(CUSTOM_ICON_SIZE));

      svg.style.setProperty(
        'width', `${CUSTOM_ICON_SIZE}px`, 'important'
      );
      svg.style.setProperty(
        'height', `${CUSTOM_ICON_SIZE}px`, 'important'
      );
      svg.style.setProperty('min-width', '0', 'important');
      svg.style.setProperty('min-height', '0', 'important');
      svg.style.setProperty('max-width', 'none', 'important');
      svg.style.setProperty('max-height', 'none', 'important');
      svg.style.setProperty('flex', '0 0 auto', 'important');
      svg.style.setProperty('display', 'block', 'important');
      svg.style.setProperty('transform', 'none', 'important');
    }

    btn.style.cssText =
      'all: unset; box-sizing: border-box; display: flex; align-items: center; ' +
      'justify-content: center; flex: 0 0 auto; cursor: pointer; color: #fff; ' +
      'transition: transform 0.15s ease;';
    btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.15)'; });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  scheduleFix() {
    cancelAnimationFrame(this.fixRaf);
    this.fixRaf = requestAnimationFrame(() => this.fixSpacing());
  }

  // Give our buttons the same size as Netflix's and space them at the same pitch





  fixSpacing() {
    const buttons = [
      ...document.querySelectorAll(
        'button[data-miniplayer], button[data-uia^="control-"]'
      )
    ];

    if (!buttons.length) return;

    const flag = document.querySelector(
      'button[data-uia="control-flag"]'
    );

    // Remove positioning left by previous versions of this function.
    buttons.forEach((btn) => {
      btn.style.removeProperty('translate');

      const parent = btn.parentElement;

      // Older versions translated individual control wrappers.
      if (
        parent &&
        parent.querySelectorAll('button').length === 1
      ) {
        parent.style.removeProperty('translate');
      }
    });

    // IMPORTANT: the flag is a top-row control, not a playback icon.
    // Exclude it from all bottom-row spacing calculations.
    const rowButtons = buttons.filter((btn) => {
      if (btn === flag) return false;

      const r = btn.getBoundingClientRect();
      const s = getComputedStyle(btn);

      return (
        r.width > 0 &&
        r.height > 0 &&
        r.top > window.innerHeight * 0.60 &&
        s.display !== 'none' &&
        s.visibility !== 'hidden' &&
        Number(s.opacity) > 0
      );
    });

    // Equalize the left and right control groups separately.
    // This preserves the open space around the central title.
    const middle = window.innerWidth / 2;

    const groups = [
      rowButtons
        .filter((btn) => {
          const r = btn.getBoundingClientRect();
          return r.left + r.width / 2 <= middle;
        })
        .sort(
          (a, b) =>
            a.getBoundingClientRect().left -
            b.getBoundingClientRect().left
        ),

      rowButtons
        .filter((btn) => {
          const r = btn.getBoundingClientRect();
          return r.left + r.width / 2 > middle;
        })
        .sort(
          (a, b) =>
            a.getBoundingClientRect().left -
            b.getBoundingClientRect().left
        )
    ];

    groups.forEach((group) => {
      if (!group.length) return;

      const centers = group.map((btn) => {
        const r = btn.getBoundingClientRect();
        return r.left + r.width / 2;
      });

      const first = centers[0];
      const last = centers[centers.length - 1];

      const step = group.length > 1
        ? (last - first) / (group.length - 1)
        : 0;

      group.forEach((btn, i) => {
        const key =
          btn.getAttribute('data-miniplayer') ||
          btn.getAttribute('data-uia') ||
          '';

        const tweak = CONTROL_TUNING.buttons[key] || {
          x: 0, y: 0, scale: 1
        };

        // Even spacing plus your manual adjustment.
        const target = first + step * i;
        const dx = target - centers[i] + (tweak.x || 0);
        const dy = tweak.y || 0;

        btn.style.setProperty(
          'translate',
          `${dx.toFixed(2)}px ${dy.toFixed(2)}px`,
          'important'
        );
      });
    });

    // Size every control's SVG independently of its button position.
    buttons.forEach((btn) => {
      const key =
        btn.getAttribute('data-miniplayer') ||
        btn.getAttribute('data-uia') ||
        '';

      const tweak = CONTROL_TUNING.buttons[key] || {
        x: 0, y: 0, scale: 1
      };

      const svg = btn.querySelector('svg');
      if (!svg) return;

      const scale = ICON_SCALE * (tweak.scale || 1);

      svg.style.setProperty(
        'transform',
        `scale(${scale})`,
        'important'
      );

      svg.style.setProperty(
        'transform-origin',
        'center center',
        'important'
      );
    });

    // Handle the flag separately using its exact Netflix selector.
    if (flag) {
      flag.style.setProperty(
        'translate',
        `${CONTROL_TUNING.flag.x}px ${CONTROL_TUNING.flag.y}px`,
        'important'
      );
    }

    this.spacingOk = true;
  }

  removeControlButtons() {
    this.controlBtns.forEach((b) => b.remove());
    this.controlBtns = [];
    this.refUnit = null;
    this.spacingOk = false;
  }

  // ---------- Messaging / input ----------

  _onMessage(message) {
    if (message.action === 'set-enabled') {
      this.enabled = message.enabled;
      this.ensureControlButtons();
    } else if (message.action === 'premium-status-updated') {
      this.pro = message.active === true;
      this.syncAutomaticPipHandler();
    } else if (message.action === 'toggle-pip' && this.enabled) {
      this.toggleNativePip();
    } else if (message.action === 'toggle-miniplayer' && this.enabled) {
      this.toggleMiniPlayer();
    }
  }

  handleKeyDown(event) {
    if (!this.enabled || !this.isWatchPage()) return;
    const t = event.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (event.altKey && event.code === 'KeyP') {
      event.preventDefault();
      this.toggleNativePip(); // Alt+P = original Picture-in-Picture
    } else if (event.altKey && event.code === 'KeyM') {
      event.preventDefault();
      this.toggleMiniPlayer(); // Alt+M = mini player with subtitles
    }
  }

  // ---------- Native Picture-in-Picture (original feature) ----------

  async toggleNativePip() {
    try {
      if (this.pip) {
        this.closePip(); // mini player open: close it first
        return;
      }
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }
      if (!this.video) return;
      this.enablePictureInPicture();
      await this.video.requestPictureInPicture();
    } catch (error) {
      console.error('NETFLIX MINI PLAYER: PiP failed:', error);
      if (error.name === 'NotAllowedError') {
        this.showNotification('Click the PiP button to open it');
      }
    }
  }

  // ---------- Mini player (Document PiP with subtitles) ----------

  async toggleMiniPlayer() {
    if (this.opening) return;
    if (this.pip) {
      this.closePip();
      return;
    }
    if (!this.video) return;

    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      if ('documentPictureInPicture' in window) {
        await this.openDocPip();
      } else {
        // Chrome < 116: native PiP (no subtitles)
        this.enablePictureInPicture();
        await this.video.requestPictureInPicture();
      }
    } catch (error) {
      console.error('NETFLIX MINI PLAYER: Mini player failed:', error);
      if (error.name === 'NotAllowedError') {
        this.showNotification('Click the mini player button to open it');
      }
    } finally {
      this.opening = false;
    }
  }

  async openDocPip() {
    this.opening = true;
    const video = this.video;
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    const width = 480;
    const height = Math.round(width / aspect);

    const win = await window.documentPictureInPicture.requestWindow({ width, height });
    const doc = win.document;

    const style = doc.createElement('style');
    style.textContent = PIP_CSS;
    doc.head.appendChild(style);
    doc.body.innerHTML = PIP_HTML;

    const wrap = doc.getElementById('wrap');
    const parent = video.parentNode;
    const next = video.nextSibling;
    wrap.insertBefore(video, wrap.firstChild); // moves the element into the PiP document

    this.pip = { win, parent, next, pollTimer: null };
    this.lastSubText = '';
    this.subHistory = [];

    const $ = (id) => doc.getElementById(id);
    const playBtn = $('b-play');
    const seek = $('seek');
    let seeking = false;

    // Play / pause
    const setPlayIcon = () => {
      if (playBtn) {
        playBtn.innerHTML = video.paused ? PLAY_SVG : PAUSE_SVG;
      }
    };

    setPlayIcon();

    if (playBtn) {
      playBtn.onclick = () => this.togglePlay();
    } else {
      console.warn('Mini Player: b-play is missing from PIP_HTML');
    }
    video.addEventListener('play', setPlayIcon);
    video.addEventListener('pause', setPlayIcon);

    // Simple timeline
    const updateSeek = () => {
      if (seeking || !video.duration || !isFinite(video.duration)) return;
      const pct = video.currentTime / video.duration;
      seek.value = String(Math.round(pct * 1000));
      seek.style.setProperty('--pct', (pct * 100).toFixed(2) + '%');
    };
    video.addEventListener('timeupdate', updateSeek);
    seek.addEventListener('pointerdown', () => { seeking = true; });
    seek.addEventListener('input', () => {
      seek.style.setProperty('--pct', (Number(seek.value) / 10).toFixed(1) + '%');
    });
    seek.addEventListener('change', () => {
      if (video.duration && isFinite(video.duration)) {
        const target = (Number(seek.value) / 1000) * video.duration;
        this.seekBy((target - video.currentTime) * 1000);
      }
      seeking = false;
    });
    updateSeek();

    // Subtitle size (free) and Pro buttons

    // Subtitle size and history controls (Replay removed)
    const smallerBtn = $('b-sm');
    const largerBtn = $('b-lg');
    // Show controls when the mouse moves.
    // Hide them after 1.8 seconds of inactivity or when the cursor leaves.
    let controlsHideTimer = null;

    const hideControls = () => {
      clearTimeout(controlsHideTimer);
      controlsHideTimer = null;
      wrap.classList.add('controls-hidden');
    };

    const revealControls = () => {
      wrap.classList.remove('controls-hidden');
      clearTimeout(controlsHideTimer);
      controlsHideTimer = setTimeout(hideControls, 1800);
    };

    win.addEventListener('pointermove', revealControls, { passive: true });
    wrap.addEventListener('pointerenter', revealControls, { passive: true });
    wrap.addEventListener('pointerleave', hideControls);
    win.addEventListener('blur', hideControls);

    revealControls();

    if (smallerBtn) {
      smallerBtn.onclick = () => this.adjustScale(-10);
    }

    if (largerBtn) {
      largerBtn.onclick = () => this.adjustScale(10);
    }





    doc.addEventListener('keydown', (e) => {
      revealControls();

      if (e.code === 'Space' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        this.togglePlay();
      }
    });

    win.addEventListener('pagehide', () => {
      video.removeEventListener('play', setPlayIcon);
      video.removeEventListener('pause', setPlayIcon);
      video.removeEventListener('timeupdate', updateSeek);
      clearInterval(this.pip && this.pip.pollTimer);
      const info = this.pip;
      this.pip = null;
      this.lastSubText = '';
      if (info && info.parent && info.parent.isConnected) {
        if (info.next && info.next.parentNode === info.parent) info.parent.insertBefore(video, info.next);
        else info.parent.appendChild(video);
      }
      setTimeout(() => this.handleVideoChange(), 100);
    });

    this.applySubStyle();
    this.startSubtitlePoll();
    this.opening = false;
  }

  closePip() {
    if (this.pip && this.pip.win) this.pip.win.close();
  }

  togglePlay() {
    if (!this.video) return;
    if (this.video.paused) this.video.play().catch(() => { });
    else this.video.pause();
  }

  // Netflix breaks if video.currentTime is set directly, so seek via the MAIN-world bridge
  seekBy(deltaMs) {
    window.postMessage({ type: 'MP_SEEK', deltaMs }, window.location.origin);
  }

  // ---------- Subtitles ----------

  startSubtitlePoll() {
    const doc = this.pip.win.document;
    const st = doc.getElementById('st');

    this.pip.pollTimer = setInterval(() => {
      if (!this.pip || !this.video) return;
      const tt = document.querySelector(NETFLIX_CONFIG.subtitleSelector);
      const text = tt ? tt.innerText.replace(/\n{2,}/g, '\n').trim() : '';
      if (text === this.lastSubText) return;
      this.lastSubText = text;
      st.textContent = text;


    }, 150);
  }

  applySubStyle() {
    if (!this.pip) return;
    const wrap = this.pip.win.document.getElementById('wrap');
    if (!wrap) return;
    const s = this.subStyle;
    const color = s.color || DEFAULT_SUB_STYLE.color;
    const bg = s.bg ?? DEFAULT_SUB_STYLE.bg;
    wrap.style.setProperty('--scale', String((s.scale || 100) / 100));
    wrap.style.setProperty('--color', color);
    wrap.style.setProperty('--bg', String(bg / 100));
  }

  // Subtitle size buttons in the mini player (free for everyone)
  adjustScale(delta) {
    const cur = Number(this.subStyle.scale) || 100;
    const next = Math.min(250, Math.max(40, cur + delta));
    this.subStyle = { ...this.subStyle, scale: next };
    this.applySubStyle();
    chrome.storage.sync.set({ subStyle: this.subStyle });
  }

  // ---------- Pro features ----------










  showNotification(message) {
    const n = document.createElement('div');
    n.textContent = message;
    n.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8); color: white; padding: 10px 20px;
      border-radius: 4px; z-index: 2147483647; font-size: 14px;
    `;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2000);
  }
}

const netflixMiniPlayer = new NetflixMiniPlayer();
window.netflixMiniPlayer = netflixMiniPlayer; // debugging aid

/* ================================================================
   STORY STREAMER — Firebase-Connected Engine
   ================================================================

   ARCHITECTURE OVERVIEW
   ─────────────────────
   This is the same high-performance single-class state machine,
   now connected to Firebase Firestore for live story data.

   KEY CHANGES FROM ORIGINAL:
   1. MASTER_FEED is now dynamic — loaded from Firestore
   2. Uses onSnapshot for REAL-TIME updates (new stories appear)
   3. Reads patientId from URL params
   4. Displays caption and sender name overlays
   5. Shows idle screen when no stories exist
   6. Stories auto-loop continuously
   7. Filters only approved stories (isApproved !== false)

   PRESERVED ARCHITECTURE:
   - Single RAF loop
   - Nuclear Garbage Collector
   - Virtualized Preloading (Sliding Window)
   - GPU-accelerated progress (scaleX)
   - Global audio state machine
   ================================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getFirestore, collection, query, where, orderBy, onSnapshot, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

// ========== Firebase Config ==========
const firebaseConfig = {
    apiKey: "AIzaSyD8l_RlBvhTlBIqIajUxpqIoGOt2jg3ylY",
    authDomain: "usingfirebase-b4c6a.firebaseapp.com",
    projectId: "usingfirebase-b4c6a",
    storageBucket: "usingfirebase-b4c6a.firebasestorage.app",
    messagingSenderId: "678814978439",
    appId: "1:678814978439:web:be0ce0e40925c85fc7c322",
    measurementId: "G-MBNL06FWXS"
};

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);

// ── URL PARAMS ──
const urlParams = new URLSearchParams(window.location.search);
const patientId = urlParams.get('patientId');

// ── CONFIGURATION ───────────────────────────────────────────────
const CONFIG = {
  IMAGE_DURATION_MS: 5000,
  VOLUME_STEP: 0.1,
  BLUR_THROTTLE_MS: 50,
  HOLD_THRESHOLD_MS: 180,
  INDICATOR_SHOW_MS: 150,
  INDICATOR_FADE_MS: 500,
  VOLUME_INDICATOR_MS: 1200,
};


// ================================================================
//  STORY STREAMER CLASS
// ================================================================

class StoryStreamer {

  constructor() {
    this.feed = [];
    this.feedLength = 0;

    // Core State
    this.currentIndex    = 0;
    this.isPaused        = false;
    this.isMuted         = true;
    this.volume          = 1.0;
    this.menuVisible     = false;
    this.isTransitioning = false;
    this.isIdle          = true; // Start in idle state

    // RAF Loop State
    this.rafId              = null;
    this.imageStartTime     = 0;
    this.imageElapsedPaused = 0;

    // Blur Throttle
    this.lastBlurUpdate = 0;

    // Media Element References
    this.activeElement   = null;
    this.preloadElement  = null;
    this.preloadIndex    = -1;

    // Progress Bar Segment References
    this.segmentFills = [];

    // Gesture State
    this.holdTimer    = null;
    this.isHolding    = false;
    this.wasPausedBeforeHold = false;

    // Indicator Timers
    this.pauseIndicatorTimer  = null;
    this.playIndicatorTimer   = null;
    this.volumeIndicatorTimer = null;

    // Visibility State
    this.wasPlayingBeforeHidden = false;

    // DOM References
    this.mediaViewport    = document.getElementById('media-viewport');
    this.progressBar      = document.getElementById('progress-bar');
    this.unmuteBtn        = document.getElementById('unmute-btn');
    this.pauseIndicator   = document.getElementById('pause-indicator');
    this.playIndicator    = document.getElementById('play-indicator');
    this.volumeIndicator  = document.getElementById('volume-indicator');
    this.volumeBarFill    = document.getElementById('volume-bar-fill');
    this.volumeLabel      = document.getElementById('volume-label');
    this.menuOverlay      = document.getElementById('menu-overlay');
    this.storyCounter     = document.getElementById('story-counter');
    this.blurCanvas       = document.getElementById('blur-canvas');
    this.blurCtx          = this.blurCanvas.getContext('2d', { alpha: false });
    this.blurImage        = document.getElementById('blur-image');
    this.navPrev          = document.getElementById('nav-prev');
    this.navNext          = document.getElementById('nav-next');
    this.idleScreen       = document.getElementById('idle-screen');
    this.storyContainer   = document.getElementById('story-container');
    this.captionOverlay   = document.getElementById('caption-overlay');
    this.captionText      = document.getElementById('caption-text');
    this.captionSender    = document.getElementById('caption-sender');

    // Initialize
    this.init();
  }


  // ── INITIALIZATION ──
  init() {
    this.bindKeyboard();
    this.bindPointerEvents();
    this.bindVisibilityChange();
    this.bindUnmuteButton();
    this.loadPatientInfo();
    this.startFirebaseListener();
  }

  /**
   * Load patient info for the idle screen
   */
  async loadPatientInfo() {
    if (!patientId) {
      document.getElementById('idle-patient-name').textContent = 'No patient selected';
      document.getElementById('idle-subtitle').textContent = 'Please use a valid link with a patient ID';
      return;
    }

    try {
      const patientSnap = await getDoc(doc(db, 'patients', patientId));
      if (patientSnap.exists()) {
        const data = patientSnap.data();
        document.getElementById('idle-patient-name').textContent = `Waiting for stories for ${data.name || 'patient'}...`;
      }
    } catch (e) {
      console.warn('[StoryStreamer] Could not load patient info:', e);
    }
  }

  /**
   * Start real-time Firebase listener for stories
   */
  startFirebaseListener() {
    if (!patientId) {
      console.warn('[StoryStreamer] No patientId in URL params');
      return;
    }

    const storiesQuery = query(
      collection(db, 'stories'),
      where('patientId', '==', patientId),
      orderBy('timestamp', 'asc')
    );

    onSnapshot(storiesQuery, (snapshot) => {
      const newFeed = [];

      snapshot.forEach(docSnap => {
        const data = docSnap.data();

        // Only include approved stories
        if (data.isApproved === false) return;

        // Determine type
        let mediaType = 'image';
        if (data.type && data.type.startsWith('video')) {
          mediaType = 'video';
        }

        newFeed.push({
          id: docSnap.id,
          type: mediaType,
          src: data.url,
          duration: mediaType === 'video' ? 0 : CONFIG.IMAGE_DURATION_MS / 1000,
          caption: data.caption || '',
          senderName: data.senderName || '',
          timestamp: data.timestamp,
        });
      });

      console.log(`[StoryStreamer] Feed updated: ${newFeed.length} stories`);
      this.updateFeed(newFeed);
    }, (error) => {
      console.error('[StoryStreamer] Firestore listener error:', error);
    });
  }

  /**
   * Update the feed when Firestore data changes
   */
  updateFeed(newFeed) {
    const hadStories = this.feed.length > 0;
    const wasEmpty = this.feed.length === 0;

    this.feed = newFeed;
    this.feedLength = newFeed.length;

    if (this.feedLength === 0) {
      // No stories — show idle screen
      this.showIdleScreen();
      return;
    }

    if (wasEmpty || this.isIdle) {
      // First stories arrived — start playing
      this.hideIdleScreen();
      this.buildProgressBar();
      this.currentIndex = 0;
      this.loadStory(0);
    } else {
      // Feed updated while playing — rebuild progress bar
      // Keep current position if still valid
      if (this.currentIndex >= this.feedLength) {
        this.currentIndex = 0;
      }
      this.buildProgressBar();
      this.updateProgressBarFull();
      // Preload may need to change
      if (this.preloadElement) {
        this.nuclearGC(this.preloadElement);
        this.preloadElement = null;
        this.preloadIndex = -1;
      }
      this.preloadNext();
    }
  }

  showIdleScreen() {
    this.isIdle = true;
    this.stopLoop();
    if (this.activeElement) {
      this.nuclearGC(this.activeElement);
      this.activeElement = null;
    }
    if (this.preloadElement) {
      this.nuclearGC(this.preloadElement);
      this.preloadElement = null;
      this.preloadIndex = -1;
    }
    this.idleScreen.classList.remove('hidden');
    this.storyContainer.classList.add('hidden-story');
    this.storyCounter.textContent = '';
  }

  hideIdleScreen() {
    this.isIdle = false;
    this.idleScreen.classList.add('hidden');
    this.storyContainer.classList.remove('hidden-story');
  }


  // ── BUILD PROGRESS BAR ──
  buildProgressBar() {
    this.progressBar.innerHTML = '';
    this.segmentFills = [];

    for (let i = 0; i < this.feedLength; i++) {
      const segment = document.createElement('div');
      segment.className = 'progress-segment';
      const fill = document.createElement('div');
      fill.className = 'progress-segment-fill';
      segment.appendChild(fill);
      this.progressBar.appendChild(segment);
      this.segmentFills.push(fill);
    }
  }


  // ── EVENT BINDING ──

  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (this.isIdle) return; // No controls when idle

      switch (e.key) {
        case 'ArrowRight':  e.preventDefault(); this.nextStory(); break;
        case 'ArrowLeft':   e.preventDefault(); this.prevStory(); break;
        case 'ArrowUp':     e.preventDefault(); this.volumeUp(); break;
        case 'ArrowDown':   e.preventDefault(); this.volumeDown(); break;
        case ' ':           e.preventDefault(); this.togglePause(); break;
        case 'm': case 'M': e.preventDefault(); this.toggleMute(); break;
        case '#':           e.preventDefault(); this.toggleMute(); break;
        case 'Enter':       e.preventDefault(); this.toggleMenu(); break;
      }
    });
  }

  bindPointerEvents() {
    const bindZone = (zone, tapAction) => {
      zone.addEventListener('pointerdown', (e) => {
        if (this.isIdle) return;
        e.preventDefault();
        this.isHolding = false;
        this.wasPausedBeforeHold = this.isPaused;
        this.holdTimer = setTimeout(() => {
          this.isHolding = true;
          if (!this.isPaused) this.pause(false);
        }, CONFIG.HOLD_THRESHOLD_MS);
      });

      zone.addEventListener('pointerup', (e) => {
        if (this.isIdle) return;
        e.preventDefault();
        clearTimeout(this.holdTimer);
        if (this.isHolding) {
          if (!this.wasPausedBeforeHold) this.resume(false);
          this.isHolding = false;
        } else {
          tapAction();
        }
      });

      zone.addEventListener('pointerleave', () => {
        clearTimeout(this.holdTimer);
        if (this.isHolding) {
          if (!this.wasPausedBeforeHold) this.resume(false);
          this.isHolding = false;
        }
      });

      zone.addEventListener('pointercancel', () => {
        clearTimeout(this.holdTimer);
        if (this.isHolding) {
          if (!this.wasPausedBeforeHold) this.resume(false);
          this.isHolding = false;
        }
      });
    };

    bindZone(this.navPrev, () => this.prevStory());
    bindZone(this.navNext, () => this.nextStory());
  }

  bindVisibilityChange() {
    document.addEventListener('visibilitychange', () => {
      if (this.isIdle) return;
      if (document.hidden) {
        this.wasPlayingBeforeHidden = !this.isPaused;
        if (!this.isPaused) this.pause(false);
      } else {
        if (this.wasPlayingBeforeHidden) this.resume(false);
      }
    });
  }

  bindUnmuteButton() {
    this.unmuteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isMuted = false;
      if (this.activeElement && this.activeElement.tagName === 'VIDEO') {
        this.activeElement.muted = false;
        this.activeElement.volume = this.volume;
      }
      this.hideUnmuteButton();
    });
  }


  // ── STORY LOADING ──

  loadStory(index) {
    if (this.feedLength === 0) return;

    index = ((index % this.feedLength) + this.feedLength) % this.feedLength;

    this.stopLoop();

    if (this.activeElement) {
      this.nuclearGC(this.activeElement);
      this.activeElement = null;
    }

    const item = this.feed[index];
    let element;

    if (this.preloadElement && this.preloadIndex === index) {
      element = this.preloadElement;
      this.preloadElement = null;
      this.preloadIndex = -1;
    } else {
      if (this.preloadElement) {
        this.nuclearGC(this.preloadElement);
        this.preloadElement = null;
        this.preloadIndex = -1;
      }
      element = this.createElement(item);
      this.mediaViewport.appendChild(element);
    }

    this.currentIndex = index;
    this.activeElement = element;
    this.isPaused = false;
    this.isTransitioning = false;

    element.classList.remove('preloaded');
    element.classList.add('active-media');

    if (item.type === 'video') {
      this.activateVideo(element);
    } else {
      this.activateImage(element, item);
    }

    this.updateBlurBackground(item, element);
    this.preloadNext();
    this.updateStoryCounter();
    this.updateProgressBarFull();
    this.updateCaptionOverlay(item);

    if (item.type === 'image') {
      this.startLoop();
    }
  }

  /**
   * Update the caption and sender overlay for the current story
   */
  updateCaptionOverlay(item) {
    if (item.caption || item.senderName) {
      this.captionOverlay.classList.add('visible');
      this.captionText.textContent = item.caption || '';
      this.captionSender.textContent = item.senderName ? `From ${item.senderName}` : '';
      this.captionText.style.display = item.caption ? 'block' : 'none';
      this.captionSender.style.display = item.senderName ? 'block' : 'none';
    } else {
      this.captionOverlay.classList.remove('visible');
    }
  }


  // ── ELEMENT CREATION ──

  createElement(item) {
    if (item.type === 'video') return this.createVideoElement(item);
    return this.createImageElement(item);
  }

  createVideoElement(item) {
    const video = document.createElement('video');
    video.src = item.src;
    video.preload = 'auto';
    video.playsInline = true;
    video.controls = false;
    video.loop = false;
    video.muted = true;
    video.volume = this.volume;
    // Use crossOrigin for Cloudinary URLs (they support CORS)
    video.crossOrigin = 'anonymous';

    video.addEventListener('error', () => {
      console.warn(`[StoryStreamer] Video failed to load: ${item.src}`);
      this.nextStory();
    }, { once: true });

    return video;
  }

  createImageElement(item) {
    const img = document.createElement('img');
    img.src = item.src;
    img.alt = 'Story media';
    img.draggable = false;
    img.crossOrigin = 'anonymous';

    img.addEventListener('error', () => {
      console.warn(`[StoryStreamer] Image failed to load: ${item.src}`);
      this.nextStory();
    }, { once: true });

    return img;
  }


  // ── ACTIVATE VIDEO ──

  async activateVideo(video) {
    video.volume = this.volume;
    video.muted = this.isMuted;

    if (this.isMuted) {
      video.muted = true;
      try {
        await video.play();
        video.muted = false;
        video.volume = this.volume;
        await new Promise(r => requestAnimationFrame(r));
        if (!video.paused) {
          this.isMuted = false;
          this.hideUnmuteButton();
        } else {
          video.muted = true;
          await video.play();
          this.showUnmuteButton();
        }
      } catch (e) {
        video.muted = true;
        try { await video.play(); } catch (_) {}
        this.showUnmuteButton();
      }
    } else {
      video.muted = false;
      try {
        await video.play();
        this.hideUnmuteButton();
      } catch (playError) {
        video.muted = true;
        this.isMuted = true;
        try { await video.play(); } catch (mutedError) {
          console.error('[StoryStreamer] Autoplay completely blocked:', mutedError);
        }
        this.showUnmuteButton();
      }
    }

    this.startLoop();
  }

  activateImage(element, item) {
    this.imageStartTime = performance.now();
    this.imageElapsedPaused = 0;
  }


  // ── NUCLEAR GARBAGE COLLECTOR ──

  nuclearGC(element) {
    if (!element) return;

    if (element.tagName === 'VIDEO') {
      element.pause();
      element.onplay = null;
      element.onpause = null;
      element.onended = null;
      element.onerror = null;
      element.oncanplay = null;
      element.ontimeupdate = null;
      element.onloadedmetadata = null;
      element.removeAttribute('src');
      element.srcObject = null;
      element.load();
      if (element.parentNode) element.parentNode.removeChild(element);
    } else if (element.tagName === 'IMG') {
      element.removeAttribute('src');
      if (element.parentNode) element.parentNode.removeChild(element);
    }
  }


  // ── PRELOADING ──

  preloadNext() {
    if (this.feedLength <= 1) return; // Nothing to preload

    const nextIndex = (this.currentIndex + 1) % this.feedLength;
    const nextItem = this.feed[nextIndex];

    if (this.preloadElement && this.preloadIndex === nextIndex) return;

    if (this.preloadElement) {
      this.nuclearGC(this.preloadElement);
      this.preloadElement = null;
    }

    const element = this.createElement(nextItem);
    element.classList.add('preloaded');
    this.mediaViewport.appendChild(element);

    this.preloadElement = element;
    this.preloadIndex = nextIndex;
  }


  // ── RAF LOOP ──

  startLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame((t) => this.tick(t));
  }

  stopLoop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  tick(timestamp) {
    if (this.isPaused) {
      this.rafId = null;
      return;
    }

    if (this.feedLength === 0) {
      this.rafId = null;
      return;
    }

    const item = this.feed[this.currentIndex];
    let progress = 0;
    let isComplete = false;

    if (item.type === 'video') {
      const video = this.activeElement;
      if (video && isFinite(video.duration) && video.duration > 0) {
        progress = video.currentTime / video.duration;
        if (video.ended) {
          isComplete = true;
          progress = 1;
        }
      }

      // Update Blur Canvas (Throttled)
      if (video && video.readyState >= 2) {
        const now = performance.now();
        if (now - this.lastBlurUpdate >= CONFIG.BLUR_THROTTLE_MS) {
          this.lastBlurUpdate = now;
          try {
            this.blurCtx.drawImage(video, 0, 0, this.blurCanvas.width, this.blurCanvas.height);
          } catch (e) {}
        }
      }

    } else if (item.type === 'image') {
      const elapsed = (timestamp - this.imageStartTime) + this.imageElapsedPaused;
      const totalDuration = CONFIG.IMAGE_DURATION_MS;
      progress = Math.min(elapsed / totalDuration, 1);
      if (progress >= 1) isComplete = true;
    }

    this.setSegmentProgress(this.currentIndex, progress);

    if (isComplete) {
      this.nextStory();
      return;
    }

    this.rafId = requestAnimationFrame((t) => this.tick(t));
  }


  // ── PROGRESS BAR ──

  setSegmentProgress(index, progress) {
    const fill = this.segmentFills[index];
    if (fill) {
      fill.style.transform = `scaleX(${Math.min(Math.max(progress, 0), 1)})`;
    }
  }

  updateProgressBarFull() {
    for (let i = 0; i < this.feedLength; i++) {
      if (i < this.currentIndex) this.setSegmentProgress(i, 1);
      else if (i === this.currentIndex) this.setSegmentProgress(i, 0);
      else this.setSegmentProgress(i, 0);
    }
  }


  // ── BACKGROUND BLUR ──

  updateBlurBackground(item, element) {
    if (item.type === 'video') {
      this.blurCanvas.classList.add('active');
      this.blurImage.classList.remove('active');
      this.blurImage.style.backgroundImage = '';
      if (element.readyState >= 2) {
        try {
          this.blurCtx.drawImage(element, 0, 0, this.blurCanvas.width, this.blurCanvas.height);
        } catch (e) {}
      }
    } else {
      this.blurImage.style.backgroundImage = `url('${item.src}')`;
      this.blurImage.classList.add('active');
      this.blurCanvas.classList.remove('active');
    }
  }


  // ── NAVIGATION ──

  nextStory() {
    if (this.isTransitioning || this.feedLength === 0) return;
    this.isTransitioning = true;
    const nextIndex = (this.currentIndex + 1) % this.feedLength;
    this.loadStory(nextIndex);
  }

  prevStory() {
    if (this.isTransitioning || this.feedLength === 0) return;
    this.isTransitioning = true;

    const item = this.feed[this.currentIndex];
    let shouldRestart = false;

    if (item.type === 'video' && this.activeElement) {
      shouldRestart = this.activeElement.currentTime > 2;
    } else if (item.type === 'image') {
      const elapsed = (performance.now() - this.imageStartTime) + this.imageElapsedPaused;
      shouldRestart = elapsed > 2000;
    }

    if (shouldRestart) {
      this.loadStory(this.currentIndex);
    } else {
      const prevIndex = (this.currentIndex - 1 + this.feedLength) % this.feedLength;
      this.loadStory(prevIndex);
    }
  }


  // ── PLAYBACK CONTROLS ──

  togglePause() {
    if (this.isPaused) this.resume(true);
    else this.pause(true);
  }

  pause(showIndicator = true) {
    if (this.isPaused) return;
    this.isPaused = true;
    this.stopLoop();

    const item = this.feed[this.currentIndex];
    if (item.type === 'video' && this.activeElement) {
      this.activeElement.pause();
    } else if (item.type === 'image') {
      this.imageElapsedPaused += (performance.now() - this.imageStartTime);
    }

    if (showIndicator) this.showPauseIndicator();
  }

  async resume(showIndicator = true) {
    if (!this.isPaused) return;
    this.isPaused = false;

    const item = this.feed[this.currentIndex];
    if (item.type === 'video' && this.activeElement) {
      try { await this.activeElement.play(); } catch (e) {
        console.warn('[StoryStreamer] Resume play failed:', e);
      }
    } else if (item.type === 'image') {
      this.imageStartTime = performance.now();
    }

    if (showIndicator) this.showPlayIndicator();
    this.startLoop();
  }


  // ── AUDIO CONTROLS ──

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.activeElement && this.activeElement.tagName === 'VIDEO') {
      this.activeElement.muted = this.isMuted;
      if (!this.isMuted) this.activeElement.volume = this.volume;
    }
    if (this.isMuted) this.showUnmuteButton();
    else this.hideUnmuteButton();
    this.showVolumeIndicator();
  }

  volumeUp() {
    this.volume = Math.min(1, +(this.volume + CONFIG.VOLUME_STEP).toFixed(2));
    if (this.volume > 0 && this.isMuted) {
      this.isMuted = false;
      this.hideUnmuteButton();
    }
    this.applyVolume();
    this.showVolumeIndicator();
  }

  volumeDown() {
    this.volume = Math.max(0, +(this.volume - CONFIG.VOLUME_STEP).toFixed(2));
    if (this.volume <= 0) {
      this.isMuted = true;
      this.showUnmuteButton();
    }
    this.applyVolume();
    this.showVolumeIndicator();
  }

  applyVolume() {
    if (this.activeElement && this.activeElement.tagName === 'VIDEO') {
      this.activeElement.volume = this.volume;
      this.activeElement.muted = this.isMuted;
    }
  }


  // ── UI INDICATORS ──

  showUnmuteButton() { this.unmuteBtn.classList.add('visible'); }
  hideUnmuteButton() { this.unmuteBtn.classList.remove('visible'); }

  showPauseIndicator() {
    this.clearIndicatorTimers();
    const el = this.pauseIndicator;
    el.classList.remove('fade-out');
    el.classList.add('show');
    this.pauseIndicatorTimer = setTimeout(() => {}, CONFIG.INDICATOR_SHOW_MS);
  }

  showPlayIndicator() {
    const pauseEl = this.pauseIndicator;
    pauseEl.classList.remove('show');
    pauseEl.classList.add('fade-out');
    setTimeout(() => pauseEl.classList.remove('fade-out'), 400);

    this.clearIndicatorTimers();
    const el = this.playIndicator;
    el.classList.remove('fade-out');
    el.classList.add('show');

    this.playIndicatorTimer = setTimeout(() => {
      el.classList.add('fade-out');
      el.classList.remove('show');
      setTimeout(() => el.classList.remove('fade-out'), CONFIG.INDICATOR_FADE_MS);
    }, CONFIG.INDICATOR_SHOW_MS);
  }

  clearIndicatorTimers() {
    if (this.pauseIndicatorTimer) { clearTimeout(this.pauseIndicatorTimer); this.pauseIndicatorTimer = null; }
    if (this.playIndicatorTimer) { clearTimeout(this.playIndicatorTimer); this.playIndicatorTimer = null; }
  }

  showVolumeIndicator() {
    const el = this.volumeIndicator;
    const displayVol = this.isMuted ? 0 : this.volume;
    this.volumeBarFill.style.width = `${displayVol * 100}%`;
    this.volumeLabel.textContent = `${Math.round(displayVol * 100)}%`;
    el.classList.remove('fade-out');
    el.classList.add('show');
    if (this.volumeIndicatorTimer) clearTimeout(this.volumeIndicatorTimer);
    this.volumeIndicatorTimer = setTimeout(() => {
      el.classList.add('fade-out');
      el.classList.remove('show');
      setTimeout(() => el.classList.remove('fade-out'), 400);
    }, CONFIG.VOLUME_INDICATOR_MS);
  }

  toggleMenu() {
    this.menuVisible = !this.menuVisible;
    if (this.menuVisible) {
      this.menuOverlay.classList.add('visible');
      if (!this.isPaused) { this.pause(false); this._menuCausedPause = true; }
    } else {
      this.menuOverlay.classList.remove('visible');
      if (this._menuCausedPause) { this.resume(false); this._menuCausedPause = false; }
    }
  }

  updateStoryCounter() {
    this.storyCounter.textContent = `${this.currentIndex + 1} / ${this.feedLength}`;
  }
}


// ── BOOTSTRAP ──
document.addEventListener('DOMContentLoaded', () => {
  window.storyStreamer = new StoryStreamer();
});

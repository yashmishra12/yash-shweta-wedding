/* ============================================================
   Yash & Shweta Wedding Gallery — Vanilla JS
   ============================================================ */

(function () {
  'use strict';

  // --- State ---
  let eventsData = [];
  let driveMap = null; // Google Drive file ID mapping
  let currentEvent = null;
  let currentPhotoIndex = -1;
  let lightboxOpen = false;

  // --- DOM refs ---
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

  const dom = {
    loader:        $('#page-loader'),
    eventsNav:     $('#events-nav'),
    eventsSection: $('#events'),
    gallerySection:$('#gallery'),
    galleryGrid:   $('#gallery-grid'),
    galleryLoading:$('#gallery-loading'),
    galleryTitle:  $('#gallery-title'),
    gallerySubtitle:$('#gallery-subtitle'),
    galleryIcon:   $('#gallery-icon'),
    galleryCount:  $('#gallery-count'),
    backBtn:       $('#back-to-events'),
    lightbox:      $('#lightbox'),
    lightboxImg:   $('#lightbox-img'),
    lightboxCounter:$('#lightbox-counter'),
    lightboxClose: $('.lightbox-close'),
    lightboxPrev:  $('.lightbox-prev'),
    lightboxNext:  $('.lightbox-next'),
    lightboxBackdrop: $('.lightbox-backdrop'),
    lightboxDriveLink: $('#lightbox-drive-link'),
  };

  // --- Google Drive config ---
  const DRIVE_FOLDER = 'https://drive.google.com/drive/u/0/folders/14LOV0zsLmYr8rPiG0ejq_0-RF6wycTV3';

  /**
   * Build a Google Drive direct image URL from a file ID.
   * lh3.googleusercontent.com serves images at requested size.
   * w1600 = max 1600px wide — great for lightbox.
   */
  function driveImageUrl(fileId, width) {
    width = width || 1600;
    return `https://lh3.googleusercontent.com/d/${fileId}=w${width}`;
  }

  /**
   * Get the Google Drive file URL for viewing/downloading original.
   */
  function driveFileUrl(fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  /**
   * Look up the Drive file ID for a given photo.
   * Returns null if drive_map.json isn't loaded or file not found.
   */
  function getDriveFileId(eventSlug, safeName) {
    if (!driveMap) return null;
    const eventMap = driveMap[eventSlug];
    if (!eventMap || !eventMap.files) return null;
    return eventMap.files[safeName] || null;
  }

  /**
   * Get the best lightbox URL for a photo.
   * Priority: Google Drive (high-res) → local thumbnail (fallback).
   */
  function getLightboxUrl(photo, eventSlug) {
    const fileId = getDriveFileId(eventSlug, photo.safe_name);
    if (fileId) {
      return driveImageUrl(fileId, 1600);
    }
    // Fallback to thumbnail
    return photo.thumb;
  }

  /**
   * Get the Google Drive link for viewing the original photo.
   * Returns folder link if individual file ID not found.
   */
  function getOriginalDriveLink(photo, eventSlug) {
    const fileId = getDriveFileId(eventSlug, photo.safe_name);
    if (fileId) {
      return driveFileUrl(fileId);
    }
    // Fallback: link to event subfolder or main folder
    if (driveMap && driveMap[eventSlug] && driveMap[eventSlug].folder_id) {
      return `https://drive.google.com/drive/folders/${driveMap[eventSlug].folder_id}`;
    }
    return DRIVE_FOLDER;
  }

  // ============================================================
  //  INIT
  // ============================================================
  async function init() {
    // Dismiss loader
    window.addEventListener('load', () => {
      setTimeout(() => dom.loader.classList.add('hidden'), 400);
    });

    // Load data (events.json + drive_map.json in parallel)
    try {
      const [eventsResp, driveResp] = await Promise.allSettled([
        fetch('data/events.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
        fetch('data/drive_map.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      ]);

      if (eventsResp.status === 'fulfilled') {
        eventsData = eventsResp.value;
      } else {
        console.warn('events.json not found, using fallback');
        showFallbackEvents();
        return;
      }

      if (driveResp.status === 'fulfilled') {
        driveMap = driveResp.value;
        console.log('✅ Google Drive map loaded — lightbox will use high-res images');
      } else {
        console.warn('⚠️ drive_map.json not found — lightbox will use thumbnails as fallback');
        console.warn('   Run export_drive_ids.py to enable high-res lightbox images.');
      }
    } catch (err) {
      console.error('Error loading data:', err);
      showFallbackEvents();
      return;
    }

    renderEventCards();
    bindEvents();
    handleHashRoute();

    // Hero parallax (subtle)
    setupParallax();

    // Scroll reveal
    setupScrollReveal();
  }

  // Fallback event data if events.json is not yet generated
  function showFallbackEvents() {
    eventsData = [
      { slug: 'pre-wedding', title: 'Pre-Wedding Photoshoot', subtitle: 'Where Our Story Began', icon: 'images/icons/pre-wedding.png', color: '#C4926E', photo_count: 157, photos: [] },
      { slug: 'welcome', title: 'Welcome Ceremony', subtitle: 'Atithi Devo Bhava', icon: 'images/icons/welcome.png', color: '#8B1A1A', photo_count: 111, photos: [] },
      { slug: 'engagement-sangeet', title: 'Engagement & Sangeet', subtitle: 'Rings, Rhythms & Revelry', icon: 'images/icons/sangeet.png', color: '#6B3FA0', photo_count: 960, photos: [] },
      { slug: 'haldi', title: 'Haldi Ceremony', subtitle: 'The Golden Blessing', icon: 'images/icons/haldi.png', color: '#D4A017', photo_count: 993, photos: [] },
      { slug: 'myra-mehendi', title: 'Myra & Mehendi', subtitle: 'Patterns of Love', icon: 'images/icons/mehandi.png', color: '#2E7D32', photo_count: 786, photos: [] },
      { slug: 'wedding', title: 'The Wedding', subtitle: 'Two Souls, One Journey', icon: 'images/icons/wedding.png', color: '#B8860B', photo_count: 1342, photos: [] },
    ];
    renderEventCards();
    bindEvents();
    handleHashRoute();
    setupParallax();
    setupScrollReveal();
  }

  // ============================================================
  //  EVENT CARDS
  // ============================================================
  function renderEventCards() {
    dom.eventsNav.innerHTML = '';
    eventsData.forEach((evt, i) => {
      const card = document.createElement('div');
      card.className = 'event-card reveal';
      card.style.setProperty('--card-color', evt.color);
      card.dataset.slug = evt.slug;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.style.transitionDelay = `${i * 0.08}s`;

      // Use <img> if icon is a path, otherwise emoji text
      const iconHtml = evt.icon.includes('/')
        ? `<img class="event-card-icon-img" src="${evt.icon}" alt="${evt.title}" loading="lazy">`
        : `<span class="event-card-icon">${evt.icon}</span>`;

      card.innerHTML = `
        ${iconHtml}
        <h3 class="event-card-title">${evt.title}</h3>
        <p class="event-card-subtitle">${evt.subtitle}</p>
        <p class="event-card-count">${evt.photo_count} photos</p>
      `;

      card.addEventListener('click', () => openEvent(evt.slug));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openEvent(evt.slug);
        }
      });

      dom.eventsNav.appendChild(card);
    });
  }

  // ============================================================
  //  OPEN / CLOSE EVENT
  // ============================================================
  function openEvent(slug) {
    const evt = eventsData.find(e => e.slug === slug);
    if (!evt) return;

    currentEvent = evt;
    window.location.hash = slug;

    // Highlight active card
    $$('.event-card').forEach(c => c.classList.toggle('active', c.dataset.slug === slug));

    // Update gallery header
    if (evt.icon.includes('/')) {
      dom.galleryIcon.innerHTML = `<img src="${evt.icon}" alt="${evt.title}" style="width:40px;height:40px;object-fit:contain;">`;
    } else {
      dom.galleryIcon.textContent = evt.icon;
    }
    dom.galleryTitle.textContent = evt.title;
    dom.gallerySubtitle.textContent = evt.subtitle;
    dom.galleryCount.textContent = `${evt.photo_count} photos`;

    // Show gallery, keep events visible
    dom.gallerySection.style.display = '';

    // Render photos
    renderGallery(evt);

    // Scroll to gallery
    setTimeout(() => {
      dom.gallerySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function closeEvent() {
    currentEvent = null;
    window.location.hash = '';
    dom.gallerySection.style.display = 'none';
    dom.galleryGrid.innerHTML = '';
    $$('.event-card').forEach(c => c.classList.remove('active'));
    dom.eventsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ============================================================
  //  GALLERY RENDERING
  // ============================================================
  function renderGallery(evt) {
    dom.galleryGrid.innerHTML = '';

    if (!evt.photos || evt.photos.length === 0) {
      dom.galleryGrid.innerHTML = `
        <div style="text-align:center; padding:3rem; grid-column:1/-1; font-family:var(--font-subtitle); color:var(--color-gold-deep);">
          <p style="font-size:1.2rem; margin-bottom:0.5rem;">Photos coming soon</p>
          <p style="font-size:0.9rem; opacity:0.6;">Thumbnails are being generated. Check back shortly.</p>
          <a href="${DRIVE_FOLDER}" target="_blank" rel="noopener" style="display:inline-block; margin-top:1rem; color:var(--color-primary); text-decoration:underline;">View on Google Drive</a>
        </div>
      `;
      return;
    }

    // Use DocumentFragment for performance
    const fragment = document.createDocumentFragment();

    evt.photos.forEach((photo, idx) => {
      const card = document.createElement('div');
      card.className = 'photo-card';
      // Estimated aspect ratio placeholder height (random-ish based on index for visual variety)
      const placeholderH = 200 + (idx * 37 % 160);
      card.style.minHeight = placeholderH + 'px';

      const img = document.createElement('img');
      img.dataset.src = photo.thumb;
      img.dataset.index = idx;
      img.alt = `${evt.title} - Photo ${idx + 1}`;
      img.loading = 'lazy';

      const skeleton = document.createElement('div');
      skeleton.className = 'skeleton';

      card.appendChild(img);
      card.appendChild(skeleton);

      card.addEventListener('click', () => openLightbox(idx));

      fragment.appendChild(card);
    });

    dom.galleryGrid.appendChild(fragment);

    // Start lazy loading with IntersectionObserver
    observeImages();
  }

  // ============================================================
  //  LAZY LOADING
  // ============================================================
  let imageObserver = null;

  function observeImages() {
    // Disconnect previous observer
    if (imageObserver) imageObserver.disconnect();

    const images = $$('.photo-card img[data-src]', dom.galleryGrid);

    imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          loadImage(img);
          imageObserver.unobserve(img);
        }
      });
    }, {
      rootMargin: '300px 0px', // Start loading 300px before visible
      threshold: 0.01
    });

    images.forEach(img => imageObserver.observe(img));
  }

  function loadImage(img) {
    const src = img.dataset.src;
    if (!src) return;

    img.onload = function () {
      img.classList.add('loaded');
      // Remove min-height once loaded so masonry reflows properly
      img.closest('.photo-card').style.minHeight = '';
    };

    img.onerror = function () {
      // Hide broken images gracefully
      img.closest('.photo-card').style.display = 'none';
    };

    img.src = src;
    delete img.dataset.src;
  }

  // ============================================================
  //  LIGHTBOX
  // ============================================================
  function openLightbox(index) {
    if (!currentEvent || !currentEvent.photos.length) return;

    currentPhotoIndex = index;
    lightboxOpen = true;
    dom.lightbox.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    showLightboxPhoto(index);

    // Animate in
    requestAnimationFrame(() => {
      dom.lightbox.classList.add('open');
    });
  }

  function closeLightbox() {
    lightboxOpen = false;
    dom.lightbox.style.display = 'none';
    dom.lightbox.classList.remove('open');
    document.body.style.overflow = '';
    currentPhotoIndex = -1;
  }

  function showLightboxPhoto(index) {
    if (!currentEvent) return;

    const photos = currentEvent.photos;
    if (index < 0 || index >= photos.length) return;

    currentPhotoIndex = index;
    const photo = photos[index];
    const eventSlug = currentEvent.slug;

    // Step 1: Immediately show the thumbnail (already cached from grid)
    dom.lightboxImg.src = photo.thumb;
    dom.lightboxImg.classList.add('loading'); // subtle indicator that hi-res is loading

    // Step 2: Load the high-res Drive image in the background
    const driveFileId = getDriveFileId(eventSlug, photo.safe_name);
    if (driveFileId) {
      const hiResUrl = driveImageUrl(driveFileId, 1600);
      const hiRes = new Image();
      hiRes.onload = () => {
        // Only swap if we're still on the same photo (user may have navigated)
        if (currentPhotoIndex === index && currentEvent?.slug === eventSlug) {
          dom.lightboxImg.src = hiResUrl;
          dom.lightboxImg.classList.remove('loading');
        }
      };
      hiRes.onerror = () => {
        // Drive failed — keep showing the thumbnail, just remove the loading indicator
        if (currentPhotoIndex === index) {
          dom.lightboxImg.classList.remove('loading');
        }
      };
      hiRes.src = hiResUrl;
    } else {
      // No Drive mapping — thumbnail is all we have
      dom.lightboxImg.classList.remove('loading');
    }

    dom.lightboxCounter.textContent = `${index + 1} / ${photos.length}`;

    // Update the "View Original" drive link
    if (dom.lightboxDriveLink) {
      const driveLink = getOriginalDriveLink(photo, eventSlug);
      dom.lightboxDriveLink.href = driveLink;
      dom.lightboxDriveLink.style.display = '';
    }

    // Preload adjacent
    preloadAdjacent(index);
  }

  function preloadAdjacent(index) {
    if (!currentEvent) return;
    const photos = currentEvent.photos;
    const eventSlug = currentEvent.slug;

    [-1, 1, 2].forEach(offset => {
      const i = index + offset;
      if (i >= 0 && i < photos.length) {
        const preload = new Image();
        preload.src = getLightboxUrl(photos[i], eventSlug);
      }
    });
  }

  function lightboxPrev() {
    if (!currentEvent) return;
    const newIndex = (currentPhotoIndex - 1 + currentEvent.photos.length) % currentEvent.photos.length;
    showLightboxPhoto(newIndex);
  }

  function lightboxNext() {
    if (!currentEvent) return;
    const newIndex = (currentPhotoIndex + 1) % currentEvent.photos.length;
    showLightboxPhoto(newIndex);
  }

  // ============================================================
  //  TOUCH SWIPE (Lightbox)
  // ============================================================
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  function handleTouchStart(e) {
    if (!lightboxOpen) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }

  function handleTouchEnd(e) {
    if (!lightboxOpen) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;

    // Minimum swipe: 50px horizontal, less than 100px vertical, under 500ms
    if (Math.abs(dx) > 50 && Math.abs(dy) < 100 && dt < 500) {
      if (dx > 0) lightboxPrev();
      else lightboxNext();
    }
  }

  // ============================================================
  //  HASH ROUTING
  // ============================================================
  function handleHashRoute() {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const evt = eventsData.find(e => e.slug === hash);
      if (evt) {
        openEvent(hash);
        return;
      }
    }
  }

  // ============================================================
  //  PARALLAX (hero)
  // ============================================================
  function setupParallax() {
    const heroBg = $('.hero-bg');
    if (!heroBg) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const scrolled = window.scrollY;
        if (scrolled < window.innerHeight) {
          heroBg.style.transform = `translateY(${scrolled * 0.3}px)`;
        }
        ticking = false;
      });
    }, { passive: true });
  }

  // ============================================================
  //  SCROLL REVEAL
  // ============================================================
  function setupScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    // Observe after a short delay to let DOM settle
    setTimeout(() => {
      $$('.reveal').forEach(el => observer.observe(el));
    }, 200);
  }

  // ============================================================
  //  EVENT BINDINGS
  // ============================================================
  function bindEvents() {
    // Back button
    dom.backBtn.addEventListener('click', closeEvent);

    // Lightbox controls
    dom.lightboxClose.addEventListener('click', closeLightbox);
    dom.lightboxPrev.addEventListener('click', lightboxPrev);
    dom.lightboxNext.addEventListener('click', lightboxNext);
    dom.lightboxBackdrop.addEventListener('click', closeLightbox);

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (!lightboxOpen) return;
      switch (e.key) {
        case 'Escape':    closeLightbox(); break;
        case 'ArrowLeft': lightboxPrev(); break;
        case 'ArrowRight':lightboxNext(); break;
      }
    });

    // Touch swipe
    dom.lightbox.addEventListener('touchstart', handleTouchStart, { passive: true });
    dom.lightbox.addEventListener('touchend', handleTouchEnd, { passive: true });

    // Hash changes
    window.addEventListener('hashchange', handleHashRoute);

    // Prevent lightbox img click from closing
    dom.lightboxImg.addEventListener('click', (e) => e.stopPropagation());
  }

  // ============================================================
  //  START
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

/* ============================================================
   Yash & Shweta Wedding Gallery — Refined Hybrid Experience
   ============================================================ */

(function () {
  'use strict';

  let eventsData = [];
  let driveMap = null;
  let currentEvent = null;
  let currentPhotoIndex = -1;
  let lightboxOpen = false;
  let imageObserver = null;
  let zoomScale = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;
  const EVENT_ORDER = [
    'pre-wedding',
    'welcome',
    'myra-mehendi',
    'engagement-sangeet',
    'haldi',
    'wedding'
  ];

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

  const dom = {
    body: document.body,
    loader: $('#page-loader'),
    eventsSection: $('#events'),
    eventsNav: $('#events-nav'),
    gallerySection: $('#gallery'),
    galleryRail: $('#gallery-rail'),
    galleryCoverImage: $('#gallery-cover-image'),
    galleryKicker: $('#gallery-kicker'),
    galleryTitle: $('#gallery-title'),
    gallerySubtitle: $('#gallery-subtitle'),
    galleryMeta: $('#gallery-meta'),
    galleryCount: $('#gallery-count'),
    galleryStatus: $('#gallery-status'),
    galleryGrid: $('#gallery-grid'),
    galleryLoading: $('#gallery-loading'),
    backBtn: $('#back-to-events'),
    lightbox: $('#lightbox'),
    lightboxStage: $('#lightbox-stage'),
    lightboxImg: $('#lightbox-img'),
    lightboxClose: $('.lightbox-close'),
    lightboxZoomIn: $('#lightbox-zoom-in'),
    lightboxZoomOut: $('#lightbox-zoom-out'),
    lightboxZoomReset: $('#lightbox-zoom-reset'),
    lightboxPrev: $('.lightbox-prev'),
    lightboxNext: $('.lightbox-next'),
    lightboxBackdrop: $('.lightbox-backdrop'),
    lightboxCounter: $('#lightbox-counter'),
    lightboxEvent: $('#lightbox-event')
  };

  const DRIVE_FOLDER = 'https://drive.google.com/drive/u/0/folders/14LOV0zsLmYr8rPiG0ejq_0-RF6wycTV3';

  function driveImageUrl(fileId, width) {
    return `https://lh3.googleusercontent.com/d/${fileId}=w${width || 1600}`;
  }

  function driveFileUrl(fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  function getDriveFileId(eventSlug, safeName) {
    if (!driveMap) return null;
    const eventMap = driveMap[eventSlug];
    if (!eventMap || !eventMap.files) return null;
    return eventMap.files[safeName] || null;
  }

  function getLightboxUrl(photo, eventSlug) {
    const fileId = getDriveFileId(eventSlug, photo.safe_name);
    return fileId ? driveImageUrl(fileId, 1600) : photo.thumb;
  }

  function pluralize(count, label) {
    return `${count} ${label}${count === 1 ? '' : 's'}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function sortEvents(list) {
    return [...list].sort((a, b) => {
      const aIndex = EVENT_ORDER.indexOf(a.slug);
      const bIndex = EVENT_ORDER.indexOf(b.slug);
      const normalizedA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
      const normalizedB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
      return normalizedA - normalizedB;
    }).map((evt) => {
      if (evt.slug !== 'myra-mehendi') return evt;
      return {
        ...evt,
        short_label: 'Myra'
      };
    });
  }

  function getZoomBounds(scale) {
    const stageRect = dom.lightboxStage.getBoundingClientRect();
    const naturalWidth = dom.lightboxImg.naturalWidth || stageRect.width;
    const naturalHeight = dom.lightboxImg.naturalHeight || stageRect.height;

    if (!stageRect.width || !stageRect.height || !naturalWidth || !naturalHeight) {
      return { maxX: 0, maxY: 0 };
    }

    const fitRatio = Math.min(stageRect.width / naturalWidth, stageRect.height / naturalHeight);
    const baseWidth = naturalWidth * fitRatio;
    const baseHeight = naturalHeight * fitRatio;

    return {
      maxX: Math.max(0, (baseWidth * scale - baseWidth) / 2),
      maxY: Math.max(0, (baseHeight * scale - baseHeight) / 2)
    };
  }

  function updateZoomUi() {
    const zoomPercent = Math.round(zoomScale * 100);
    dom.lightboxZoomReset.textContent = `${zoomPercent}%`;
    dom.lightboxZoomOut.disabled = zoomScale <= 1;
    dom.lightboxZoomIn.disabled = zoomScale >= 3;
    dom.lightboxZoomReset.disabled = zoomScale === 1 && panX === 0 && panY === 0;
    dom.lightboxStage.classList.toggle('is-zoomed', zoomScale > 1);
  }

  function applyZoom() {
    const bounds = getZoomBounds(zoomScale);
    panX = clamp(panX, -bounds.maxX, bounds.maxX);
    panY = clamp(panY, -bounds.maxY, bounds.maxY);
    dom.lightboxImg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
    updateZoomUi();
  }

  function resetZoom() {
    zoomScale = 1;
    panX = 0;
    panY = 0;
    isPanning = false;
    dom.lightboxStage.classList.remove('is-panning');
    applyZoom();
  }

  function changeZoom(delta) {
    const nextScale = clamp(Number((zoomScale + delta).toFixed(2)), 1, 3);
    if (nextScale === zoomScale) return;
    zoomScale = nextScale;
    if (zoomScale === 1) {
      panX = 0;
      panY = 0;
    }
    applyZoom();
  }

  function startPan(clientX, clientY) {
    if (zoomScale <= 1) return;
    isPanning = true;
    panStartX = clientX;
    panStartY = clientY;
    panOriginX = panX;
    panOriginY = panY;
    dom.lightboxStage.classList.add('is-panning');
  }

  function movePan(clientX, clientY) {
    if (!isPanning) return;
    panX = panOriginX + (clientX - panStartX);
    panY = panOriginY + (clientY - panStartY);
    applyZoom();
  }

  function stopPan() {
    if (!isPanning) return;
    isPanning = false;
    dom.lightboxStage.classList.remove('is-panning');
  }

  function eventCover(evt) {
    if (evt.cover_photo) return evt.cover_photo;
    return evt.photos && evt.photos[0] ? evt.photos[0].thumb : '';
  }

  function eventMeta(evt) {
    return [evt.date_label, evt.location_label].filter(Boolean).join(' • ');
  }

  async function init() {
    window.addEventListener('load', () => {
      setTimeout(() => dom.loader.classList.add('hidden'), 350);
    });

    try {
      const [eventsResp, driveResp] = await Promise.allSettled([
        fetch('data/events.json').then((r) => { if (!r.ok) throw new Error('events'); return r.json(); }),
        fetch('data/drive_map.json').then((r) => { if (!r.ok) throw new Error('drive'); return r.json(); })
      ]);

      if (eventsResp.status === 'fulfilled') {
        eventsData = sortEvents(eventsResp.value);
      } else {
        showFallbackEvents();
        return;
      }

      if (driveResp.status === 'fulfilled') {
        driveMap = driveResp.value;
      }
    } catch (err) {
      showFallbackEvents();
      return;
    }

    renderEventCards();
    renderGalleryRail();
    bindEvents();
    handleHashRoute();
    setupParallax();
    setupScrollReveal();
  }

  function showFallbackEvents() {
    eventsData = sortEvents([
      { slug: 'pre-wedding', title: 'Pre-Wedding Photoshoot', subtitle: 'Where Our Story Began', short_label: 'Pre-Wedding', date_label: 'Before the celebrations', location_label: 'Jaipur', icon: 'images/icons/pre-wedding.png', color: '#C4926E', photo_count: 157, photos: [], highlights: ['Portraits', 'Golden hour'] },
      { slug: 'welcome', title: 'Welcome Ceremony', subtitle: 'Atithi Devo Bhava', short_label: 'Welcome', date_label: 'Day one', location_label: 'Chokhi Dhani', icon: 'images/icons/welcome.png', color: '#8B1A1A', photo_count: 111, photos: [], highlights: ['Arrival', 'Family greetings'] },
      { slug: 'myra-mehendi', title: 'Myra & Mehendi', subtitle: 'Patterns of Love', short_label: 'Mehendi', date_label: 'Family rituals', location_label: 'Chokhi Dhani', icon: 'images/icons/mehandi.png', color: '#2E7D32', photo_count: 786, photos: [], highlights: ['Henna', 'Myra ceremony'] },
      { slug: 'engagement-sangeet', title: 'Engagement & Sangeet', subtitle: 'Rings, Rhythms & Revelry', short_label: 'Sangeet', date_label: 'Evening celebration', location_label: 'Chokhi Dhani', icon: 'images/icons/sangeet.png', color: '#6B3FA0', photo_count: 960, photos: [], highlights: ['Ring exchange', 'Dance floor'] },
      { slug: 'haldi', title: 'Haldi Ceremony', subtitle: 'The Golden Blessing', short_label: 'Haldi', date_label: 'Morning ceremony', location_label: 'Chokhi Dhani', icon: 'images/icons/haldi.png', color: '#D4A017', photo_count: 993, photos: [], highlights: ['Turmeric rituals', 'Laughter'] },
      { slug: 'wedding', title: 'The Wedding', subtitle: 'Two Souls, One Journey', short_label: 'Wedding', date_label: 'Main ceremony', location_label: 'Chokhi Dhani', icon: 'images/icons/wedding.png', color: '#B8860B', photo_count: 1342, photos: [], highlights: ['Vows', 'Baraat', 'Vidaai'] }
    ]);

    renderEventCards();
    renderGalleryRail();
    bindEvents();
    handleHashRoute();
    setupParallax();
    setupScrollReveal();
  }

  function renderEventCards() {
    dom.eventsNav.innerHTML = '';

    eventsData.forEach((evt, index) => {
      const card = document.createElement('button');
      card.className = 'event-card reveal';
      card.dataset.slug = evt.slug;
      card.type = 'button';
      card.style.transitionDelay = `${index * 0.06}s`;

      const cover = eventCover(evt);
      const metaText = eventMeta(evt);

      card.innerHTML = `
        <div class="event-card-cover" style="background-image:url('${cover}')"></div>
        <div class="event-card-body">
          <div class="event-card-meta">
            <span class="event-card-short">${evt.short_label || evt.title}</span>
            <span class="event-card-count">${pluralize(evt.photo_count, 'photo')}</span>
          </div>
          <h3 class="event-card-title">${evt.title}</h3>
          <p class="event-card-subtitle">${evt.subtitle || ''}</p>
          <p class="event-card-footer">${metaText || 'Wedding gallery'}</p>
        </div>
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

  function renderGalleryRail() {
    dom.galleryRail.innerHTML = '';

    eventsData.forEach((evt) => {
      const pill = document.createElement('button');
      pill.className = 'gallery-pill';
      pill.type = 'button';
      pill.dataset.slug = evt.slug;

      pill.innerHTML = `
        <span class="gallery-pill-thumb" style="background-image:url('${eventCover(evt)}')"></span>
        <span class="gallery-pill-copy">
          <span class="gallery-pill-label">${evt.short_label || evt.title}</span>
          <span class="gallery-pill-count">${pluralize(evt.photo_count, 'photo')}</span>
        </span>
      `;

      pill.addEventListener('click', () => openEvent(evt.slug));
      dom.galleryRail.appendChild(pill);
    });
  }

  function openEvent(slug) {
    const evt = eventsData.find((item) => item.slug === slug);
    if (!evt) return;

    currentEvent = evt;
    window.location.hash = slug;
    dom.body.classList.add('gallery-active');
    dom.gallerySection.style.display = '';

    updateActiveEventState(slug);
    renderGalleryHeader(evt);
    renderGallery(evt);
    scrollRailPillIntoView(slug);

    setTimeout(() => {
      dom.gallerySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  function closeEvent() {
    currentEvent = null;
    currentPhotoIndex = -1;
    window.location.hash = '';
    dom.body.classList.remove('gallery-active');
    dom.gallerySection.style.display = 'none';
    dom.galleryGrid.innerHTML = '';
    updateActiveEventState('');
    dom.eventsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateActiveEventState(slug) {
    $$('.event-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.slug === slug);
    });

    $$('.gallery-pill').forEach((pill) => {
      pill.classList.toggle('active', pill.dataset.slug === slug);
    });
  }

  function scrollRailPillIntoView(slug) {
    const pill = $(`.gallery-pill[data-slug="${slug}"]`, dom.galleryRail);
    if (pill) {
      pill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  function renderGalleryHeader(evt) {
    dom.galleryCoverImage.style.backgroundImage = `url('${eventCover(evt)}')`;
    dom.galleryKicker.textContent = evt.short_label ? `${evt.short_label} album` : 'Wedding album';
    dom.galleryTitle.textContent = evt.title;
    dom.gallerySubtitle.textContent = evt.subtitle || '';
    dom.galleryMeta.textContent = eventMeta(evt) || 'Wedding gallery';
    dom.galleryCount.textContent = pluralize(evt.photo_count, 'photo');
    dom.galleryStatus.textContent = evt.photos && evt.photos.length
      ? `${pluralize(evt.photos.length, 'image')} ready to browse`
      : 'Photos coming soon';

  }

  function renderGallery(evt) {
    dom.galleryGrid.innerHTML = '';

    if (!evt.photos || !evt.photos.length) {
      dom.galleryGrid.innerHTML = `
        <div class="gallery-loading">
          <div class="loading-spinner"></div>
          <p>Photos are being prepared for this ceremony. You can still browse the full album on Google Drive.</p>
          <p><a href="${DRIVE_FOLDER}" target="_blank" rel="noopener">Open Google Drive album</a></p>
        </div>
      `;
      return;
    }

    const featuredIndexes = new Set((evt.featured_photos || []).filter((value) => Number.isInteger(value)));
    const fragment = document.createDocumentFragment();

    evt.photos.forEach((photo, idx) => {
      const card = document.createElement('div');
      card.className = `photo-card${featuredIndexes.has(idx) ? ' featured' : ''}`;
      const placeholderHeight = featuredIndexes.has(idx) ? 360 + (idx % 3) * 40 : 220 + (idx * 37 % 150);
      card.style.minHeight = `${placeholderHeight}px`;

      const img = document.createElement('img');
      img.dataset.src = photo.thumb;
      img.dataset.index = idx;
      img.alt = `${evt.title} - Photo ${idx + 1}`;
      img.loading = idx < 10 ? 'eager' : 'lazy';

      const skeleton = document.createElement('div');
      skeleton.className = 'skeleton';

      card.appendChild(img);
      card.appendChild(skeleton);
      card.addEventListener('click', () => openLightbox(idx));

      fragment.appendChild(card);
    });

    dom.galleryGrid.appendChild(fragment);
    observeImages();
  }

  function observeImages() {
    if (imageObserver) imageObserver.disconnect();

    const images = $$('.photo-card img[data-src]', dom.galleryGrid);
    imageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        loadImage(entry.target);
        imageObserver.unobserve(entry.target);
      });
    }, { rootMargin: '280px 0px', threshold: 0.01 });

    images.forEach((img) => imageObserver.observe(img));
  }

  function loadImage(img) {
    const src = img.dataset.src;
    if (!src) return;

    img.onload = function () {
      img.classList.add('loaded');
      img.closest('.photo-card').style.minHeight = '';
    };

    img.onerror = function () {
      img.closest('.photo-card').style.display = 'none';
    };

    img.src = src;
    delete img.dataset.src;
  }

  function openLightbox(index) {
    if (!currentEvent || !currentEvent.photos.length) return;

    currentPhotoIndex = index;
    lightboxOpen = true;
    dom.lightbox.style.display = 'flex';
    dom.body.style.overflow = 'hidden';
    resetZoom();
    showLightboxPhoto(index);
  }

  function closeLightbox() {
    lightboxOpen = false;
    dom.lightbox.style.display = 'none';
    dom.body.style.overflow = '';
    currentPhotoIndex = -1;
    resetZoom();
  }

  function showLightboxPhoto(index) {
    if (!currentEvent || index < 0 || index >= currentEvent.photos.length) return;

    currentPhotoIndex = index;
    const photo = currentEvent.photos[index];
    const eventSlug = currentEvent.slug;
    const hiResId = getDriveFileId(eventSlug, photo.safe_name);

    resetZoom();
    dom.lightboxImg.src = photo.thumb;
    dom.lightboxImg.classList.add('loading');
    dom.lightboxCounter.textContent = `${index + 1} / ${currentEvent.photos.length}`;
    dom.lightboxEvent.textContent = currentEvent.title;

    if (hiResId) {
      const hiResUrl = driveImageUrl(hiResId, 1800);
      const hiRes = new Image();
      hiRes.onload = () => {
        if (currentPhotoIndex === index && currentEvent && currentEvent.slug === eventSlug) {
          dom.lightboxImg.src = hiResUrl;
          dom.lightboxImg.classList.remove('loading');
          requestAnimationFrame(applyZoom);
        }
      };
      hiRes.onerror = () => {
        if (currentPhotoIndex === index) {
          dom.lightboxImg.classList.remove('loading');
          requestAnimationFrame(applyZoom);
        }
      };
      hiRes.src = hiResUrl;
    } else {
      dom.lightboxImg.classList.remove('loading');
      requestAnimationFrame(applyZoom);
    }

    preloadAdjacent(index);
  }

  function preloadAdjacent(index) {
    if (!currentEvent) return;
    [-1, 1, 2].forEach((offset) => {
      const nextIndex = index + offset;
      if (nextIndex < 0 || nextIndex >= currentEvent.photos.length) return;
      const preload = new Image();
      preload.src = getLightboxUrl(currentEvent.photos[nextIndex], currentEvent.slug);
    });
  }

  function lightboxPrev() {
    if (!currentEvent) return;
    const next = (currentPhotoIndex - 1 + currentEvent.photos.length) % currentEvent.photos.length;
    showLightboxPhoto(next);
  }

  function lightboxNext() {
    if (!currentEvent) return;
    const next = (currentPhotoIndex + 1) % currentEvent.photos.length;
    showLightboxPhoto(next);
  }

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  function handleMouseDown(e) {
    if (zoomScale <= 1) return;
    e.preventDefault();
    startPan(e.clientX, e.clientY);
  }

  function handleMouseMove(e) {
    if (!isPanning) return;
    e.preventDefault();
    movePan(e.clientX, e.clientY);
  }

  function preventNativeDrag(e) {
    e.preventDefault();
  }

  function handleTouchStart(e) {
    if (!lightboxOpen) return;
    if (zoomScale > 1) {
      e.preventDefault();
      const touch = e.touches[0];
      startPan(touch.clientX, touch.clientY);
      return;
    }
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }

  function handleTouchMove(e) {
    if (!lightboxOpen || zoomScale <= 1 || !isPanning) return;
    e.preventDefault();
    const touch = e.touches[0];
    movePan(touch.clientX, touch.clientY);
  }

  function handleTouchEnd(e) {
    if (!lightboxOpen) return;
    if (zoomScale > 1) {
      stopPan();
      return;
    }
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;

    if (Math.abs(dx) > 50 && Math.abs(dy) < 100 && dt < 500) {
      if (dx > 0) lightboxPrev();
      else lightboxNext();
    }
  }

  function handleHashRoute() {
    const hash = window.location.hash.replace('#', '');
    if (!hash) {
      if (currentEvent) closeEvent();
      return;
    }

    const evt = eventsData.find((item) => item.slug === hash);
    if (evt) openEvent(hash);
  }

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
          heroBg.style.transform = `translateY(${scrolled * 0.18}px) scale(1.02)`;
        }
        ticking = false;
      });
    }, { passive: true });
  }

  function setupScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });

    setTimeout(() => {
      $$('.reveal').forEach((el) => observer.observe(el));
    }, 180);
  }

  function bindEvents() {
    dom.backBtn.addEventListener('click', closeEvent);
    dom.lightboxClose.addEventListener('click', closeLightbox);
    dom.lightboxZoomIn.addEventListener('click', () => changeZoom(0.25));
    dom.lightboxZoomOut.addEventListener('click', () => changeZoom(-0.25));
    dom.lightboxZoomReset.addEventListener('click', resetZoom);
    dom.lightboxPrev.addEventListener('click', lightboxPrev);
    dom.lightboxNext.addEventListener('click', lightboxNext);
    dom.lightboxBackdrop.addEventListener('click', closeLightbox);
    dom.lightboxStage.addEventListener('mousedown', handleMouseDown);
    dom.lightboxStage.addEventListener('mouseleave', stopPan);
    dom.lightboxStage.addEventListener('dragstart', preventNativeDrag);
    dom.lightboxImg.addEventListener('dragstart', preventNativeDrag);
    dom.lightboxStage.addEventListener('touchstart', handleTouchStart, { passive: false });
    dom.lightboxStage.addEventListener('touchmove', handleTouchMove, { passive: false });
    dom.lightboxStage.addEventListener('touchend', handleTouchEnd, { passive: true });
    dom.lightboxImg.addEventListener('load', applyZoom);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopPan);
    window.addEventListener('blur', stopPan);

    window.addEventListener('hashchange', handleHashRoute);

    document.addEventListener('keydown', (e) => {
      if (!lightboxOpen) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') lightboxPrev();
      if (e.key === 'ArrowRight') lightboxNext();
      if (e.key === '+' || e.key === '=') changeZoom(0.25);
      if (e.key === '-') changeZoom(-0.25);
      if (e.key === '0') resetZoom();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

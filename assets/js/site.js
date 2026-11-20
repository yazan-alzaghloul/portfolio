/* Portfolio interactions. Progressive enhancement: the page is fully usable without this file. */
(() => {
  'use strict';
  const root = document.documentElement;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const systemTheme = matchMedia('(prefers-color-scheme: light)');
  const hasIO = 'IntersectionObserver' in window;
  const trackEvent = (eventName, parameters = {}) => {
    if (typeof window.gtag === 'function') window.gtag('event', eventName, parameters);
  };

  /* ---------- Theme (circular reveal where View Transitions are supported) ---------- */
  const themeButton = $('.theme-toggle');
  const themeColorMeta = $('#theme-color-meta');
  const applyTheme = (theme, persist = false) => {
    const next = theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = next;
    themeButton?.setAttribute('aria-pressed', String(next === 'light'));
    themeButton?.setAttribute('aria-label', `Switch to ${next === 'light' ? 'dark' : 'light'} theme`);
    themeColorMeta?.setAttribute('content', next === 'light' ? '#f5f6f8' : '#090c11');
    if (persist) { try { localStorage.setItem('portfolio-theme', next); } catch { /* storage unavailable */ } }
  };
  applyTheme(root.dataset.theme || 'dark');
  themeButton?.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    trackEvent('theme_change', { theme: next });
    if (!document.startViewTransition || reducedMotion.matches) { applyTheme(next, true); return; }
    const box = themeButton.getBoundingClientRect();
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(() => applyTheme(next, true)).ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 550, easing: 'cubic-bezier(.22, 1, .36, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => {});
  });
  systemTheme.addEventListener?.('change', event => {
    try { if (localStorage.getItem('portfolio-theme')) return; } catch { /* fall through */ }
    applyTheme(event.matches ? 'light' : 'dark');
  });

  /* ---------- Mobile navigation ---------- */
  const menuButton = $('.menu-toggle');
  const navLinks = $('.nav-links');
  const setMenu = open => {
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    navLinks.classList.toggle('is-open', open);
  };
  menuButton?.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
  navLinks?.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') { setMenu(false); menuButton.focus(); }
  });
  document.addEventListener('click', event => {
    if (navLinks?.classList.contains('is-open') && !event.target.closest('.nav')) setMenu(false);
  });

  /* ---------- Header state + scroll progress (one rAF-throttled passive listener) ---------- */
  const header = $('.site-header');
  const progress = $('.scroll-progress');
  let lastY = scrollY, ticking = false;
  const onScroll = () => {
    const y = scrollY;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    progress?.style.setProperty('--progress', Math.min(1, y / max).toFixed(4));
    header?.classList.toggle('is-scrolled', y > 24);
    const menuOpen = navLinks?.classList.contains('is-open');
    const focusInHeader = header?.contains(document.activeElement);
    header?.classList.toggle('is-hidden', !menuOpen && !focusInHeader && y > 480 && y > lastY + 4);
    if (y < lastY - 4 || y < 480) header?.classList.remove('is-hidden');
    lastY = y; ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  header?.addEventListener('focusin', () => header.classList.remove('is-hidden'));
  onScroll();

  /* ---------- Scroll reveal (staggered per row) ---------- */
  const revealItems = $$('.reveal, .career-arc');
  if (hasIO && !reducedMotion.matches) {
    const revealObserver = new IntersectionObserver(entries => {
      const entering = entries.filter(entry => entry.isIntersecting);
      entering.forEach((entry, index) => {
        if (!entry.target.style.getPropertyValue('--d')) entry.target.style.setProperty('--d', `${Math.min(index, 5) * 70}ms`);
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    revealItems.forEach(item => revealObserver.observe(item));
  } else revealItems.forEach(item => item.classList.add('is-visible'));

  /* ---------- Active navigation link ---------- */
  const sections = $$('main section[id]');
  const navigationLinks = $$('.nav-link');
  const setActive = id => navigationLinks.forEach(link => {
    const active = link.getAttribute('href') === `#${id}`;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
  });
  if (hasIO) {
    const sectionObserver = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: '-35% 0px -55% 0px', threshold: [0, .2, .5] });
    sections.forEach(section => sectionObserver.observe(section));
  }

  /* ---------- Hero: role rotator + metric count-up ---------- */
  const rotator = $('.role-rotator');
  if (rotator && !reducedMotion.matches) {
    const roles = $$('span', rotator);
    let current = 0, rotateTimer = 0;
    const rotate = () => {
      const previous = roles[current];
      current = (current + 1) % roles.length;
      previous.classList.remove('is-active'); previous.classList.add('is-leaving');
      roles[current].classList.remove('is-leaving'); roles[current].classList.add('is-active');
      setTimeout(() => previous.classList.remove('is-leaving'), 500);
    };
    const start = () => { clearInterval(rotateTimer); rotateTimer = setInterval(rotate, 2800); };
    start();
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearInterval(rotateTimer); else start(); });
  }

  const counters = $$('[data-count]');
  if (hasIO && counters.length && !reducedMotion.matches) {
    const easeOut = t => 1 - Math.pow(1 - t, 4);
    const countObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target, target = Number(el.dataset.count), suffix = el.dataset.suffix || '';
        const startTime = performance.now(), duration = 1400;
        const step = now => {
          const t = Math.min(1, (now - startTime) / duration);
          el.textContent = `${Math.round(easeOut(t) * target)}${t === 1 ? suffix : ''}`;
          if (t < 1) requestAnimationFrame(step);
        };
        el.textContent = '0';
        requestAnimationFrame(step);
        countObserver.unobserve(el);
      });
    }, { threshold: .6 });
    counters.forEach(counter => countObserver.observe(counter));
  }

  /* ---------- Pointer spotlight on cards + subtle portrait tilt ---------- */
  if (finePointer.matches && !reducedMotion.matches) {
    let pending = null, frame = 0;
    document.addEventListener('pointermove', event => {
      pending = event;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const card = pending.target instanceof Element ? pending.target.closest('.card') : null;
        if (!card) return;
        const box = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${pending.clientX - box.left}px`);
        card.style.setProperty('--my', `${pending.clientY - box.top}px`);
      });
    }, { passive: true });

    const portrait = $('.hero-portrait');
    const frameEl = $('.portrait-frame');
    if (portrait && frameEl) {
      let tiltFrame = 0;
      portrait.addEventListener('pointermove', event => {
        if (tiltFrame) return;
        tiltFrame = requestAnimationFrame(() => {
          tiltFrame = 0;
          const box = portrait.getBoundingClientRect();
          const x = (event.clientX - box.left) / box.width * 2 - 1;
          const y = (event.clientY - box.top) / box.height * 2 - 1;
          frameEl.style.transform = `perspective(1100px) rotateX(${(-y * 3).toFixed(2)}deg) rotateY(${(x * 3).toFixed(2)}deg)`;
        });
      });
      portrait.addEventListener('pointerleave', () => { cancelAnimationFrame(tiltFrame); tiltFrame = 0; frameEl.style.transform = ''; });
    }
  }

  /* ---------- Filters (skills, projects) ---------- */
  $$('[data-filter-target]').forEach(bar => {
    const name = bar.dataset.filterTarget;
    const list = $(`[data-filter-list="${name}"]`);
    const status = $(`[data-filter-status="${name}"]`);
    if (!list) return;
    const items = [...list.children];
    bar.addEventListener('click', event => {
      const button = event.target.closest('.filter-btn');
      if (!button) return;
      const filter = button.dataset.filter;
      $$('.filter-btn', bar).forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      let shown = 0;
      items.forEach(item => {
        const match = filter === 'all' || (item.dataset.tags || '').split(' ').includes(filter);
        item.hidden = !match;
        if (match) {
          shown += 1;
          item.classList.add('is-visible');
          if (!reducedMotion.matches) { item.classList.remove('is-entering'); void item.offsetWidth; item.classList.add('is-entering'); }
        }
      });
      if (status) status.textContent = `Showing ${shown} of ${items.length}`;
      trackEvent('content_filter', { list: name, filter });
    });
  });

  /* ---------- Copy email with toast feedback ---------- */
  const toast = $('.toast');
  let toastTimer = 0;
  const showToast = message => {
    if (!toast) return;
    $('span', toast).textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
  };
  $$('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const value = button.dataset.copy;
    try {
      await navigator.clipboard.writeText(value);
      showToast('Email copied to clipboard');
      trackEvent('contact_click', { contact_method: 'copy_email' });
    } catch {
      location.href = `mailto:${value}`;
    }
  }));

  /* ---------- Privacy-safe analytics (same events as before the redesign) ---------- */
  if (hasIO) {
    const viewedSections = new Set();
    const analyticsSectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const sectionId = entry.target.id;
        if (entry.isIntersecting && !viewedSections.has(sectionId)) {
          viewedSections.add(sectionId);
          trackEvent('section_view', { section_id: sectionId });
          analyticsSectionObserver.unobserve(entry.target);
        }
      });
    }, { threshold: .3 });
    sections.forEach(section => analyticsSectionObserver.observe(section));
  }

  document.addEventListener('click', event => {
    const clicked = event.target instanceof Element ? event.target : event.target.parentElement;
    const availabilityCta = clicked?.closest('[data-availability-cta]');
    if (availabilityCta) trackEvent('availability_cta_click', { placement: availabilityCta.dataset.availabilityCta });

    const link = clicked?.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') || '';

    if (link.matches('.nav-cv, .cv-download')) {
      trackEvent('cv_download', { placement: link.matches('.nav-cv') ? 'navigation' : 'hero' });
      return;
    }
    if (href.startsWith('mailto:')) { trackEvent('contact_click', { contact_method: 'email' }); return; }
    if (href.startsWith('tel:')) { trackEvent('contact_click', { contact_method: 'phone' }); return; }
    if (link.dataset.socialProfile) {
      trackEvent('social_profile_click', { network: link.dataset.socialProfile });
      if (link.closest('.contact-list') && href.includes('linkedin.com')) trackEvent('contact_click', { contact_method: 'linkedin' });
      return;
    }
    if (link.dataset.certificateName) {
      trackEvent('certificate_click', { certificate_name: link.dataset.certificateName, issuer: link.dataset.certificateIssuer || 'unknown' });
      return;
    }
    const projectCard = link.closest('.project-card');
    if (projectCard) {
      trackEvent('project_link_click', {
        project_name: projectCard.querySelector('h3')?.textContent.trim() || 'unknown',
        platform: link.textContent.trim().toLowerCase()
      });
      return;
    }
    if (href.startsWith('#')) {
      const placement = link.matches('.nav-link') ? 'navigation'
        : link.matches('.hero-contact') ? 'hero'
          : link.matches('.back-top') ? 'footer'
            : link.matches('.logo') ? 'logo'
              : 'page';
      trackEvent('navigation_click', { destination: href.slice(1) || 'home', placement });
    }
  });

  /* Scroll depth via viewport observation, without a per-frame scroll handler. */
  if (hasIO) {
    const markers = [25, 50, 75, 100].map(percent => {
      const marker = document.createElement('span');
      marker.setAttribute('aria-hidden', 'true');
      marker.dataset.scrollDepth = String(percent);
      Object.assign(marker.style, { position: 'absolute', left: '0', width: '1px', height: '1px', pointerEvents: 'none', opacity: '0' });
      document.body.appendChild(marker);
      return marker;
    });
    const positionMarkers = () => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      markers.forEach(marker => { marker.style.top = `${maxScroll * Number(marker.dataset.scrollDepth) / 100 + innerHeight / 2}px`; });
    };
    const seen = new Set();
    const depthObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const percent = Number(entry.target.dataset.scrollDepth);
        if (!entry.isIntersecting || seen.has(percent)) return;
        seen.add(percent);
        trackEvent('scroll_depth', { percent_scrolled: percent });
        depthObserver.unobserve(entry.target);
      });
    });
    markers.forEach(marker => depthObserver.observe(marker));
    positionMarkers();
    if ('ResizeObserver' in window) new ResizeObserver(positionMarkers).observe(document.body);
  }
})();

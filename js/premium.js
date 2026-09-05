/* Progressive storefront enhancements. No dependencies, network calls or business-data writes. */
(function () {
  'use strict';
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 951px)');
  let userPaused = false;
  try { userPaused = localStorage.getItem('torque_visual_motion') === 'paused'; } catch (_) { /* Storage may be unavailable. */ }
  const motionAllowed = () => !reduce.matches && !userPaused;
  const buttons = Array.from(document.querySelectorAll('[data-tf-motion]'));
  let tiltTarget = null;
  let tiltFrame = 0;
  let scrollFrame = 0;
  const revealTargets = new WeakSet();
  let revealObserver = null;
  const progress = document.createElement('div');
  progress.className = 'tf-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.prepend(progress);

  function resetTilt() {
    cancelAnimationFrame(tiltFrame);
    if (tiltTarget) { tiltTarget.style.removeProperty('--tf-rx'); tiltTarget.style.removeProperty('--tf-ry'); }
    tiltTarget = null;
  }
  function applyMotion() {
    const paused = !motionAllowed();
    root.classList.toggle('tf-motion-paused', paused);
    buttons.forEach(button => {
      button.setAttribute('aria-pressed', String(paused));
      button.textContent = reduce.matches ? 'Movimento reduzido no dispositivo' : (userPaused ? 'Ativar animações' : 'Pausar animações');
      button.disabled = reduce.matches;
    });
    if (paused) {
      resetTilt();
      document.querySelectorAll('[data-tf-reveal=pending]').forEach(el => { el.dataset.tfReveal = 'shown'; });
    }
    document.dispatchEvent(new CustomEvent('torque:motionchange', { detail: { paused } }));
  }
  buttons.forEach(button => button.addEventListener('click', () => {
    userPaused = !userPaused;
    try { localStorage.setItem('torque_visual_motion', userPaused ? 'paused' : 'active'); } catch (_) { /* Optional preference. */ }
    applyMotion();
  }));
  if (reduce.addEventListener) reduce.addEventListener('change', applyMotion);
  else reduce.addListener(applyMotion);
  if (fine.addEventListener) fine.addEventListener('change', resetTilt);
  applyMotion();

  const nav = document.getElementById('nav');
  function updateScroll() {
    scrollFrame = 0;
    const span = Math.max(1, root.scrollHeight - window.innerHeight);
    root.style.setProperty('--tf-scroll', String(Math.max(0, Math.min(1, window.scrollY / span))));
    if (nav) nav.classList.toggle('tf-scrolled', window.scrollY > 20);
  }
  function queueScroll() { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll); }
  window.addEventListener('scroll', queueScroll, { passive: true });
  window.addEventListener('resize', queueScroll, { passive: true });
  updateScroll();

  if ('IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.dataset.tfReveal = 'shown'; revealObserver.unobserve(entry.target); }
      });
    }, { threshold: 0.04, rootMargin: '0px 0px -25px 0px' });
    root.classList.add('tf-enhanced');
  }
  const revealSelector = '.series,.montar,.tf-story,.about,.cthome,.cta,.tf-campaign,.sobre__sec,.sobre__cta,.ct__sec,.ct__cta,.segcard,.seg__pt,.blogcard,.postcard';
  function enhanceReveals(scope) {
    if (!revealObserver) return;
    const targets = Array.from(scope.querySelectorAll(revealSelector));
    if (scope.matches && scope.matches(revealSelector)) targets.unshift(scope);
    targets.forEach(el => {
      if (revealTargets.has(el)) return;
      revealTargets.add(el);
      // Never hide the first screen, a focused region, or content after motion is disabled.
      if (!motionAllowed() || el.getBoundingClientRect().top < window.innerHeight - 25 || el.contains(document.activeElement)) {
        el.dataset.tfReveal = 'shown';
      } else { el.dataset.tfReveal = 'pending'; revealObserver.observe(el); }
    });
  }
  enhanceReveals(document);
  document.addEventListener('focusin', event => {
    const pending = event.target.closest('[data-tf-reveal=pending]');
    if (pending) { pending.dataset.tfReveal = 'shown'; if (revealObserver) revealObserver.unobserve(pending); }
  });
  // Observe only asynchronous editorial containers, not the entire document or every animation frame.
  ['seg','blog'].forEach(id => {
    const target = document.getElementById(id);
    if (!target || !window.MutationObserver) return;
    new MutationObserver(() => { enhanceReveals(target); queueScroll(); }).observe(target, { childList: true });
  });

  document.addEventListener('pointermove', event => {
    if (!motionAllowed() || !fine.matches || event.pointerType === 'touch') return;
    const candidate = event.target.closest('[data-tf-tilt],.pcard');
    if (!candidate) { if (tiltTarget) resetTilt(); return; }
    if (tiltTarget !== candidate) { resetTilt(); tiltTarget = candidate; }
    const x = event.clientX, y = event.clientY;
    cancelAnimationFrame(tiltFrame);
    tiltFrame = requestAnimationFrame(() => {
      if (!tiltTarget || !tiltTarget.isConnected) return;
      const box = tiltTarget.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const px = Math.max(-.5, Math.min(.5, (x - box.left) / box.width - .5));
      const py = Math.max(-.5, Math.min(.5, (y - box.top) / box.height - .5));
      tiltTarget.style.setProperty('--tf-rx', (-py * 5).toFixed(2) + 'deg');
      tiltTarget.style.setProperty('--tf-ry', (px * 5).toFixed(2) + 'deg');
    });
  }, { passive: true });
  document.addEventListener('pointerout', event => { if (tiltTarget && !tiltTarget.contains(event.relatedTarget)) resetTilt(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetTilt(); });

  // Focus containment and restoration for the existing quote and product dialogs.
  const dialogRoots = ['drawer','prodModal','leadModal','promoModal'].map(id => document.getElementById(id)).filter(Boolean);
  const opened = [];
  const returnFocus = new WeakMap();
  const focusables = dialog => Array.from(dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(el => el.getClientRects().length && !el.closest('[hidden],[inert]'));
  dialogRoots.forEach(container => {
    function onDialogChange() {
      const at = opened.indexOf(container);
      if (!container.hidden && at === -1) {
        returnFocus.set(container, document.activeElement);
        opened.push(container);
        requestAnimationFrame(() => {
          if (container.hidden || opened[opened.length - 1] !== container) return;
          const dialog = container.querySelector('[role=dialog]') || container;
          const first = focusables(dialog)[0];
          if (first) first.focus({ preventScroll: true });
          else { dialog.tabIndex = -1; dialog.focus({ preventScroll: true }); }
        });
      } else if (container.hidden && at !== -1) {
        opened.splice(at, 1);
        const previous = returnFocus.get(container);
        if (previous && previous.isConnected && previous.getClientRects().length) previous.focus({ preventScroll: true });
        else if (!opened.length) { const fallback = document.getElementById('navCart'); if (fallback) fallback.focus({ preventScroll: true }); }
      }
      // Closing a stacked dialog must not unlock scrolling behind the dialog below it.
      document.body.style.overflow = opened.length ? 'hidden' : '';
    }
    if (window.MutationObserver) new MutationObserver(onDialogChange).observe(container, { attributes: true, attributeFilter: ['hidden'] });
    onDialogChange();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (opened.length) {
        const top = opened[opened.length - 1];
        const close = top.querySelector('[data-lclose],[data-pclose],[data-dclose],[data-promo-close]');
        if (close) { event.preventDefault(); close.click(); }
      } else {
        const menu = document.getElementById('mmenu'), burger = document.getElementById('navBurger');
        if (menu && !menu.hidden && burger) { event.preventDefault(); burger.click(); burger.focus(); }
      }
    }
    if (event.key !== 'Tab' || !opened.length) return;
    const container = opened[opened.length - 1];
    const dialog = container.querySelector('[role=dialog]') || container;
    const items = focusables(dialog);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  });
  document.querySelectorAll('.tf-nav-menu').forEach(menu => {
    menu.addEventListener('keydown', event => { if (event.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); } });
    document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; });
  });
  const page = location.pathname.split('/').pop();
  document.querySelectorAll('.tf-subnav a,.tf-nav-menu a').forEach(a => { if (a.getAttribute('href') === page) a.setAttribute('aria-current', 'page'); });
  document.querySelectorAll('[data-tf-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
})();

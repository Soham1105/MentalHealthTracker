/* GoStationery — shared JS */

/* ── NAV SCROLL SHADOW ── */
const navEl = document.getElementById('mainNav');
if (navEl) window.addEventListener('scroll', () =>
  navEl.classList.toggle('scrolled', scrollY > 20), { passive: true });

/* ── SCROLL ANIMATIONS (progressive enhancement) ── */
const io = new IntersectionObserver(entries =>
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
  { threshold: 0 }   /* fire on any intersection */
);
document.querySelectorAll('.fade-up').forEach(el => {
  el.classList.add('will-anim');  /* only hidden when JS is running */
  io.observe(el);
});
/* Hard fallback: make everything visible after 800ms regardless */
setTimeout(() => {
  document.querySelectorAll('.fade-up').forEach(el => el.classList.add('visible'));
}, 800);

/* ── ANIMATED COUNTERS ── */
function animCount(el, target, dur = 1800) {
  let start = null;
  const step = ts => {
    if (!start) start = ts;
    const p = Math.min((ts - start) / dur, 1);
    const ease = p < 0.5 ? 2*p*p : -1+(4-2*p)*p;
    el.textContent = Math.floor(ease * target).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target.toLocaleString();
  };
  requestAnimationFrame(step);
}
const cio = new IntersectionObserver(entries =>
  entries.forEach(e => {
    if (e.isIntersecting) {
      animCount(e.target, +e.target.dataset.count);
      cio.unobserve(e.target);
    }
  }), { threshold: 0.3 }
);
document.querySelectorAll('[data-count]').forEach(el => cio.observe(el));

/* ── DEMO MODAL ── */
const overlay   = document.getElementById('demoModal');
const demoForm  = document.getElementById('demoForm');
const demoSuc   = document.getElementById('modalSuccess');
const prodSel   = document.getElementById('demoProduct');
const submitBtn = document.getElementById('demoSubmitBtn');

function openModal(product) {
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (product && prodSel) prodSel.value = product;
  if (demoForm) demoForm.style.display = '';
  if (demoSuc)  demoSuc.classList.remove('show');
}
function closeModal() {
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}
if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

if (demoForm) demoForm.addEventListener('submit', e => {
  e.preventDefault();
  const name  = document.getElementById('demoName')?.value.trim();
  const phone = document.getElementById('demoPhone')?.value.trim();
  const email = document.getElementById('demoEmail')?.value.trim();
  const prod  = prodSel?.value;
  if (!name || !phone || !email || !prod) return;
  submitBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin .7s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Sending…';
  submitBtn.disabled = true;
  setTimeout(() => {
    demoForm.style.display = 'none';
    demoSuc.classList.add('show');
    submitBtn.innerHTML = 'Send Demo Request';
    submitBtn.disabled = false;
    demoForm.reset();
  }, 1400);
});

/* Expose modal globally (used by some inline onclick buttons outside nav) */
window.openModal  = openModal;
window.closeModal = closeModal;

/* ── MOBILE NAV ── */
(function initMobileNav() {
  const hamburger  = document.getElementById('hamburger');
  const mobileNav  = document.getElementById('mobileNav');
  if (!hamburger || !mobileNav) return;   /* page has no mobile nav */

  /* Create backdrop once */
  const backdrop = document.createElement('div');
  backdrop.className = 'nav-backdrop';
  document.body.appendChild(backdrop);

  /* ── open / close helpers ── */
  function openNav() {
    mobileNav.classList.add('open');
    hamburger.classList.add('active');
    hamburger.setAttribute('aria-expanded', 'true');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeNav() {
    mobileNav.classList.remove('open');
    hamburger.classList.remove('active');
    hamburger.setAttribute('aria-expanded', 'false');
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
    /* collapse all sub-menus */
    mobileNav.querySelectorAll('.mobile-sub.open').forEach(s => {
      s.classList.remove('open');
      const btn = s.previousElementSibling;
      if (btn) { btn.classList.remove('sub-open'); btn.setAttribute('aria-expanded', 'false'); }
    });
  }

  function toggleNav() {
    mobileNav.classList.contains('open') ? closeNav() : openNav();
  }

  /* ── hamburger button ── */
  hamburger.addEventListener('click', toggleNav);

  /* ── backdrop click closes nav ── */
  backdrop.addEventListener('click', closeNav);

  /* ── sub-menu toggles (using data-sub attribute) ── */
  mobileNav.querySelectorAll('[data-sub]').forEach(btn => {
    btn.addEventListener('click', () => {
      const subId = btn.dataset.sub;
      const sub   = document.getElementById(subId);
      if (!sub) return;
      const isOpen = sub.classList.toggle('open');
      btn.classList.toggle('sub-open', isOpen);
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  });

  /* ── regular links close nav ── */
  mobileNav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', closeNav);
  });

  /* ── CTA button ── */
  const ctaBtn = mobileNav.querySelector('.mobile-nav-cta');
  if (ctaBtn) ctaBtn.addEventListener('click', () => { closeNav(); openModal(); });

  /* ── close on resize to desktop ── */
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) closeNav();
  }, { passive: true });

  /* ── close on Escape ── */
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNav(); });
})();

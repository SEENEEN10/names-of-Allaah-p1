(() => {

  /* ── Config ── */
  const MANIFEST = 'content/manifest.json';
  const LS_PREFIX = 'basmaihi_';
  const SAVE_DELAY_MS = 300;

  /* ── State ── */
  let chapters = [];
  let currentChapterId = null;
  let saveTimer = null;

  /* ── DOM ── */
  const $ = id => document.getElementById(id);
  const coverPage = $('cover-page');
  const contentEl = $('content');
  const chaptersList = $('chaptersList');
  const sidebar = $('sidebar');
  const settingsPanel = $('settings-panel');
  const overlay = $('overlay');
  const progressFill = $('progress-fill');
  const continueToast = $('continue-toast');
  const toastChapter = $('toast-chapter');
  const toastGo = $('toast-go');
  const toastDismiss = $('toast-dismiss');
  const toggleNavBtn = $('toggleNav');
  const openSettingsBtn = $('openSettings');
  const continueBtn = $('continueBtn');
  const fontIncBtn = $('fontInc');
  const fontDecBtn = $('fontDec');
  const fontSizeLabel = $('fontSizeLabel');
  const lineHeightInput = $('lineHeight');
  const fontFamilySel = $('fontFamily');
  const fontColorInput = $('fontColor');
  const bgColorInput = $('bgColor');
  const resetBtn = $('resetSettings');
  const closeSettingsBtn = $('closeSettings');

  /* ════════════════════════════════════════
     LocalStorage helpers
  ════════════════════════════════════════ */
  function lsGet(key, fallback = null) {
    try { const v = localStorage.getItem(LS_PREFIX + key); return v != null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch { }
  }
  function lsDel(key) {
    try { localStorage.removeItem(LS_PREFIX + key); } catch { }
  }

  /* ════════════════════════════════════════
     Settings
  ════════════════════════════════════════ */
  const DEFAULT_SETTINGS = {
    theme: 'light',
    fontFamily: 'Amiri, serif',
    fontSize: 18,
    lineHeight: 2.0,
    fontColor: '#1c1007',
    bgColor: '#f8f4ef',
  };

  function applySettings(s = {}) {
    s = { ...DEFAULT_SETTINGS, ...s };
    // Theme body classes
    document.body.className = document.body.className.replace(/theme-\S+/g, '').trim();
    if (s.theme !== 'light') document.body.classList.add(`theme-${s.theme}`);
    // Active swatch
    document.querySelectorAll('.swatch').forEach(sw => {
      sw.classList.toggle('active', sw.dataset.theme === s.theme);
    });
    // CSS variables
    const root = document.documentElement.style;
    root.setProperty('--font-family', s.fontFamily);
    root.setProperty('--font-size', s.fontSize + 'px');
    root.setProperty('--line-height', s.lineHeight);
    if (s.theme === 'sand' || s.theme === 'light') {
      root.setProperty('--custom-bg', s.bgColor);
    }
    // UI mirrors
    if (fontSizeLabel) fontSizeLabel.textContent = s.fontSize + 'px';
    if (lineHeightInput) lineHeightInput.value = s.lineHeight;
    if (fontFamilySel) fontFamilySel.value = s.fontFamily;
    if (fontColorInput) fontColorInput.value = s.fontColor;
    if (bgColorInput) bgColorInput.value = s.bgColor;
  }

  function getCurrentSettings() {
    return {
      theme: getCurrentTheme(),
      fontFamily: fontFamilySel ? fontFamilySel.value : DEFAULT_SETTINGS.fontFamily,
      fontSize: fontSizeLabel ? parseInt(fontSizeLabel.textContent) : DEFAULT_SETTINGS.fontSize,
      lineHeight: lineHeightInput ? parseFloat(lineHeightInput.value) : DEFAULT_SETTINGS.lineHeight,
      fontColor: fontColorInput ? fontColorInput.value : DEFAULT_SETTINGS.fontColor,
      bgColor: bgColorInput ? bgColorInput.value : DEFAULT_SETTINGS.bgColor,
    };
  }

  function getCurrentTheme() {
    const active = document.querySelector('.swatch.active');
    return active ? active.dataset.theme : 'light';
  }

  function saveSettings() {
    lsSet('settings', getCurrentSettings());
    applySettings(getCurrentSettings());
  }

  /* ════════════════════════════════════════
     Manifest + Chapters
  ════════════════════════════════════════ */
  async function loadManifest() {
    try {
      const res = await fetch(MANIFEST);
      const m = await res.json();
      chapters = m.chapters || [];
      renderChapterList();
    } catch {
      console.warn('Could not load manifest');
    }
  }

  function renderChapterList() {
    if (!chaptersList) return;
    chaptersList.innerHTML = '';
    chapters.forEach((ch, i) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      const num = document.createElement('span');
      const txt = document.createElement('span');
      const prog = document.createElement('div');
      const progFill = document.createElement('div');

      num.className = 'ch-num';
      num.textContent = i + 1;
      txt.style.flex = '1';
      txt.textContent = ch.title;
      prog.className = 'ch-progress';
      progFill.className = 'ch-progress-fill';
      const savedPct = lsGet('pct_' + ch.id, 0);
      progFill.style.width = savedPct + '%';
      prog.appendChild(progFill);

      a.appendChild(num);
      a.appendChild(txt);
      a.href = '#' + ch.id;
      a.title = ch.title;
      a.addEventListener('click', e => { e.preventDefault(); loadChapter(ch.id); closeSidebar(); });
      li.appendChild(a);
      li.appendChild(prog);
      chaptersList.appendChild(li);
    });
  }

  function setActiveChapter(id) {
    document.querySelectorAll('#chaptersList li a').forEach((a, i) => {
      const ch = chapters[i];
      a.classList.toggle('active', ch && ch.id === id);
    });
  }

  /* ════════════════════════════════════════
     Paragraph-level Autosave
  ════════════════════════════════════════ */

  // Flatten all meaningful block-level elements inside #content
  function getReadingBlocks() {
    return Array.from(
      contentEl.querySelectorAll('p, h1, h2, h3, h4, h5, li, td, blockquote')
    ).filter(el => el.textContent.trim().length > 4);
  }

  // Assign stable data-block-index attributes
  function indexBlocks() {
    getReadingBlocks().forEach((el, i) => el.setAttribute('data-block', i));
  }

  // Find the block most visible in the viewport (top half priority)
  function findCurrentBlock() {
    const blocks = getReadingBlocks();
    if (!blocks.length) return -1;
    const viewMid = window.innerHeight * 0.35;
    let best = null, bestDist = Infinity;
    for (const el of blocks) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const dist = Math.abs(rect.top - viewMid);
      if (dist < bestDist) { bestDist = dist; best = el; }
    }
    if (!best) {
      // fallback: first visible
      for (const el of blocks) {
        const r = el.getBoundingClientRect();
        if (r.top >= 0 && r.top < window.innerHeight) return parseInt(el.getAttribute('data-block') || '0');
      }
    }
    return best ? parseInt(best.getAttribute('data-block') || '0') : -1;
  }

  // Scroll to block index and pulse-highlight it
  function scrollToBlock(blockIdx) {
    const blocks = getReadingBlocks();
    const el = blocks[blockIdx] || blocks[0];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 100;
    window.scrollTo({ top, behavior: 'smooth' });
    setTimeout(() => {
      el.classList.add('position-highlight');
      el.addEventListener('animationend', () => el.classList.remove('position-highlight'), { once: true });
    }, 500);
  }

  // Save current reading position
  function savePosition() {
    if (!currentChapterId) return;
    const blockIdx = findCurrentBlock();
    if (blockIdx < 0) return;
    const totalBlocks = getReadingBlocks().length;
    const pct = totalBlocks > 0 ? Math.round((blockIdx / totalBlocks) * 100) : 0;
    lsSet('pos_' + currentChapterId, blockIdx);
    lsSet('pct_' + currentChapterId, pct);
    updateReadingProgressUI(pct);
    // Update chapter list mini-progress
    const chapterIndex = chapters.findIndex(c => c.id === currentChapterId);
    if (chapterIndex >= 0) {
      const fill = chaptersList.querySelectorAll('.ch-progress-fill')[chapterIndex];
      if (fill) fill.style.width = pct + '%';
    }
  }

  function onScroll() {
    if (!currentChapterId) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(savePosition, SAVE_DELAY_MS);
    updateProgressBar();
  }

  function updateProgressBar() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.min(100, Math.round((scrollTop / docHeight) * 100)) : 0;
    if (progressFill) progressFill.style.width = pct + '%';
  }

  function updateReadingProgressUI(pct) {
    if (progressFill) progressFill.style.width = pct + '%';
  }

  /* ════════════════════════════════════════
     Chapter Loading
  ════════════════════════════════════════ */
  async function loadChapter(id) {
    const ch = chapters.find(c => c.id === id);
    if (!ch) return;

    // Save position in current chapter before switching
    if (currentChapterId && currentChapterId !== id) savePosition();

    currentChapterId = id;
    lsSet('last_chapter', id);
    document.title = ch.title + ' — بأسمائه نحيا';
    history.replaceState(null, '', '#' + id);

    // Show loading
    hideCover();
    contentEl.classList.remove('visible');
    contentEl.innerHTML = `
      <div class="loading-state" aria-live="polite">
        <div class="spinner" role="status" aria-label="جار التحميل"></div>
        <span>جارٍ تحميل الفصل…</span>
      </div>`;
    contentEl.classList.add('visible');
    window.scrollTo({ top: 0 });

    try {
      const res = await fetch('content/' + ch.file);
      const html = await res.text();
      contentEl.innerHTML = cleanWordHtml(html);
      contentEl.setAttribute('dir', 'rtl');
      indexBlocks();
      setActiveChapter(id);

      // Restore scroll position
      const savedBlock = lsGet('pos_' + id, -1);
      if (savedBlock >= 0) {
        requestAnimationFrame(() => scrollToBlock(savedBlock));
      }
    } catch {
      contentEl.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px">تعذّر تحميل الفصل.</p>';
    }
  }

  /* ════════════════════════════════════════
     Word HTML Cleaner
     Strips MSO inline styles while preserving Arabic text + bold
  ════════════════════════════════════════ */
  function cleanWordHtml(html) {
    // Pre-sanitize: remove Word XML conditional comments and processing instructions
    // that would break DOMParser (e.g. <?if !supportLists?>, <!--[if gte mso 9]>)
    let cleaned = html
      .replace(/<\?xml[^>]*>/gi, '')
      .replace(/<\?if[^>]*>/gi, '')
      .replace(/<\?endif>/gi, '')
      .replace(/<!--\[if[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, '')
      .replace(/<!--\[if[^\]]*\]>/gi, '')
      .replace(/<!\[endif\]-->/gi, '')
      .replace(/<o:p[^>]*>[\s\S]*?<\/o:p>/gi, '')
      .replace(/<\/o:p>/gi, '')
      .replace(/<o:p>/gi, '');

    const parser = new DOMParser();
    const doc = parser.parseFromString(cleaned, 'text/html');
    const body = doc.body;

    // Remove remaining Word/Office namespace elements
    body.querySelectorAll('[class^="Mso"], style, script, link').forEach(el => el.remove());

    // Strip inline styles from all elements, preserve semantic meaning
    body.querySelectorAll('*').forEach(el => {
      const tag = el.tagName.toLowerCase();
      const inlineStyle = el.getAttribute('style') || '';
      const isQuranColor = /color\s*:\s*#?C00000|color\s*:\s*red/i.test(inlineStyle);

      // Remove all non-semantic attributes
      el.removeAttribute('style');
      el.removeAttribute('class');
      el.removeAttribute('lang');
      el.removeAttribute('dir');
      el.removeAttribute('align');
      el.removeAttribute('valign');
      el.removeAttribute('xmlns');

      // Mark Quran-verse colored text
      if (isQuranColor && ['span', 'b', 'strong'].includes(tag)) {
        el.setAttribute('class', 'quran-text');
      }
    });

    // Unwrap empty/passthrough spans (do in a second pass to avoid live-collection issues)
    const spans = Array.from(body.querySelectorAll('span:not(.quran-text)'));
    spans.forEach(el => {
      if (!el.textContent.trim() && !el.children.length) {
        el.remove();
      } else if (el.parentNode) {
        // Unwrap the span, moving its children up
        const parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        el.remove();
      }
    });

    // Remove empty paragraphs
    body.querySelectorAll('p').forEach(p => {
      const text = p.textContent.trim();
      if (!text || text === '\u200b' || text === '\u00a0') p.remove();
    });

    // Remove images from Word clipboard
    body.querySelectorAll('img').forEach(img => img.remove());

    // Ensure all sections are RTL
    body.querySelectorAll('section').forEach(s => s.setAttribute('dir', 'rtl'));

    return body.innerHTML;
  }

  /* ════════════════════════════════════════
     Cover Page
  ════════════════════════════════════════ */
  function showCover() {
    if (coverPage) { coverPage.style.display = 'block'; }
    if (contentEl) { contentEl.classList.remove('visible'); }
    currentChapterId = null;
    history.replaceState(null, '', location.pathname);
    document.title = 'بأسمائه نحيا — قارئ الكتاب';
  }

  function hideCover() {
    if (coverPage) coverPage.style.display = 'none';
  }

  /* ════════════════════════════════════════
     Continue Reading Toast
  ════════════════════════════════════════ */
  let toastTimeout = null;
  function showContinueToast() {
    const lastId = lsGet('last_chapter');
    if (!lastId) return;
    const ch = chapters.find(c => c.id === lastId);
    if (!ch) return;
    if (toastChapter) toastChapter.textContent = ch.title;
    if (continueToast) {
      continueToast.classList.add('show');
      if (toastTimeout) clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => continueToast.classList.remove('show'), 8000);
    }
  }

  function hideContinueToast() {
    if (continueToast) continueToast.classList.remove('show');
  }

  /* ════════════════════════════════════════
     Sidebar
  ════════════════════════════════════════ */
  function toggleSidebar() {
    const isMobile = window.innerWidth <= 900;
    if (isMobile) {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active', sidebar.classList.contains('open'));
    } else {
      sidebar.classList.toggle('collapsed');
    }
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  }

  /* ════════════════════════════════════════
     Settings Panel
  ════════════════════════════════════════ */
  function openSettings() {
    settingsPanel.classList.add('open');
    overlay.classList.add('active');
  }

  function closeSettings() {
    settingsPanel.classList.remove('open');
    overlay.classList.remove('active');
  }

  /* ════════════════════════════════════════
     Bootstrap
  ════════════════════════════════════════ */
  async function init() {
    // Restore settings first (before anything shows)
    const savedSettings = lsGet('settings');
    applySettings(savedSettings || DEFAULT_SETTINGS);

    await loadManifest();

    // Check for hash in URL
    const hash = (location.hash || '').replace('#', '');
    if (hash) {
      await loadChapter(hash);
    } else {
      // Check if there's a saved position
      const lastId = lsGet('last_chapter');
      if (lastId && chapters.find(c => c.id === lastId)) {
        showCover();
        setTimeout(showContinueToast, 600);
      } else {
        showCover();
        // Auto-load first chapter if no history
        if (chapters.length > 0) {
          setTimeout(() => showContinueToast(), 800);
        }
      }
    }
  }

  /* ════════════════════════════════════════
     Event Listeners
  ════════════════════════════════════════ */

  // Nav
  if (toggleNavBtn) toggleNavBtn.addEventListener('click', toggleSidebar);
  if (overlay) overlay.addEventListener('click', () => { closeSettings(); closeSidebar(); });

  // Continue reading
  if (continueBtn) continueBtn.addEventListener('click', () => {
    const lastId = lsGet('last_chapter');
    if (lastId) loadChapter(lastId);
    hideContinueToast();
  });
  if (toastGo) toastGo.addEventListener('click', () => {
    const lastId = lsGet('last_chapter');
    if (lastId) loadChapter(lastId);
    hideContinueToast();
  });
  if (toastDismiss) toastDismiss.addEventListener('click', hideContinueToast);

  // Cover buttons
  const startReadingBtn = $('startReadingBtn');
  if (startReadingBtn) startReadingBtn.addEventListener('click', () => {
    const lastId = lsGet('last_chapter');
    if (lastId) loadChapter(lastId);
    else if (chapters.length) loadChapter(chapters[0].id);
  });

  const fromBeginBtn = $('fromBeginBtn');
  if (fromBeginBtn) fromBeginBtn.addEventListener('click', () => {
    if (chapters.length) {
      lsDel('pos_' + (chapters[0]?.id));
      loadChapter(chapters[0].id);
    }
  });

  // Settings panel open/close
  if (openSettingsBtn) openSettingsBtn.addEventListener('click', openSettings);
  if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettings);

  // Theme swatches
  document.querySelectorAll('.swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      saveSettings();
    });
  });

  // Font size
  if (fontIncBtn) fontIncBtn.addEventListener('click', () => {
    let s = parseInt(fontSizeLabel.textContent) || 18;
    s = Math.min(32, s + 1);
    fontSizeLabel.textContent = s + 'px';
    document.documentElement.style.setProperty('--font-size', s + 'px');
    saveSettings();
  });
  if (fontDecBtn) fontDecBtn.addEventListener('click', () => {
    let s = parseInt(fontSizeLabel.textContent) || 18;
    s = Math.max(13, s - 1);
    fontSizeLabel.textContent = s + 'px';
    document.documentElement.style.setProperty('--font-size', s + 'px');
    saveSettings();
  });

  // Other settings
  if (lineHeightInput) lineHeightInput.addEventListener('input', () => {
    document.documentElement.style.setProperty('--line-height', lineHeightInput.value);
    saveSettings();
  });
  if (fontFamilySel) fontFamilySel.addEventListener('change', saveSettings);
  if (fontColorInput) fontColorInput.addEventListener('input', saveSettings);
  if (bgColorInput) bgColorInput.addEventListener('input', saveSettings);
  if (resetBtn) resetBtn.addEventListener('click', () => {
    lsDel('settings');
    applySettings(DEFAULT_SETTINGS);
  });

  // Scroll tracking
  window.addEventListener('scroll', onScroll, { passive: true });

  // Hash change
  window.addEventListener('hashchange', () => {
    const id = (location.hash || '').replace('#', '');
    if (id) loadChapter(id);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape') { closeSettings(); closeSidebar(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const dir = e.key === 'ArrowLeft' ? 1 : -1; // RTL: left = next
      if (!currentChapterId) return;
      const idx = chapters.findIndex(c => c.id === currentChapterId);
      const nextIdx = idx + dir;
      if (nextIdx >= 0 && nextIdx < chapters.length) loadChapter(chapters[nextIdx].id);
    }
  });

  /* ── Start ── */
  init();

})();

(() => {

  /* ── Config ── */
  const MANIFEST     = 'content/manifest.json';
  const LS_PREFIX    = 'basmaihi_';
  const SAVE_DELAY   = 350;

  /* ── State ── */
  let chapters         = [];
  let currentChapterId = null;
  let saveTimer        = null;
  let lastRestoreSignature = '';

  /* ── DOM helpers ── */
  const $ = id => document.getElementById(id);

  const coverPage       = $('cover-page');
  const contentEl       = $('content');
  const chaptersList    = $('chaptersList');
  const sidebar         = $('sidebar');
  const settingsPanel   = $('settings-panel');
  const overlay         = $('overlay');
  const progressFill    = $('progress-fill');
  const continueToast   = $('continue-toast');
  const toastChapter    = $('toast-chapter');
  const toastGo         = $('toast-go');
  const toastDismiss    = $('toast-dismiss');
  const toggleNavBtn    = $('toggleNav');
  const openSettingsBtn = $('openSettings');
  const continueBtn     = $('continueBtn');
  const fontIncBtn      = $('fontInc');
  const fontDecBtn      = $('fontDec');
  const fontSizeLabel   = $('fontSizeLabel');
  const lineHeightInput = $('lineHeight');
  const fontFamilySel   = $('fontFamily');
  const fontColorInput  = $('fontColor');
  const bgColorInput    = $('bgColor');
  const resetBtn        = $('resetSettings');
  const closeSettingsBtn = $('closeSettings');

  /* ════════════════════════════════════════
     LocalStorage helpers
  ════════════════════════════════════════ */
  function lsGet(key, fallback = null) {
    try {
      const v = localStorage.getItem(LS_PREFIX + key);
      return v != null ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch {}
  }
  function lsDel(key) {
    try { localStorage.removeItem(LS_PREFIX + key); } catch {}
  }

  /* ════════════════════════════════════════
     Settings
  ════════════════════════════════════════ */
  const DEFAULT_SETTINGS = {
    theme:      'light',
    fontFamily: 'Amiri, serif',
    fontSize:   18,
    lineHeight: 2.0,
    fontColor:  '#1c1007',
    bgColor:    '#f8f4ef',
  };

  function applySettings(s = {}) {
    s = { ...DEFAULT_SETTINGS, ...s };
    // Theme
    document.body.className = document.body.className.replace(/theme-\S+/g, '').trim();
    if (s.theme !== 'light') document.body.classList.add('theme-' + s.theme);
    document.querySelectorAll('.swatch').forEach(sw =>
      sw.classList.toggle('active', sw.dataset.theme === s.theme)
    );
    // CSS vars
    const root = document.documentElement.style;
    root.setProperty('--font-family', s.fontFamily);
    root.setProperty('--font-size',   s.fontSize + 'px');
    root.setProperty('--line-height', s.lineHeight);
    // UI mirrors
    if (fontSizeLabel)   fontSizeLabel.textContent = s.fontSize + 'px';
    if (lineHeightInput) lineHeightInput.value      = s.lineHeight;
    if (fontFamilySel)   fontFamilySel.value        = s.fontFamily;
    if (fontColorInput)  fontColorInput.value       = s.fontColor;
    if (bgColorInput)    bgColorInput.value         = s.bgColor;
  }

  function saveSettings() {
    const s = {
      theme:      (document.querySelector('.swatch.active') || {dataset:{}}).dataset.theme || 'light',
      fontFamily: fontFamilySel   ? fontFamilySel.value                           : DEFAULT_SETTINGS.fontFamily,
      fontSize:   fontSizeLabel   ? parseInt(fontSizeLabel.textContent)           : DEFAULT_SETTINGS.fontSize,
      lineHeight: lineHeightInput ? parseFloat(lineHeightInput.value)             : DEFAULT_SETTINGS.lineHeight,
      fontColor:  fontColorInput  ? fontColorInput.value                          : DEFAULT_SETTINGS.fontColor,
      bgColor:    bgColorInput    ? bgColorInput.value                            : DEFAULT_SETTINGS.bgColor,
    };
    lsSet('settings', s);
    applySettings(s);
  }

  /* ════════════════════════════════════════
     Manifest + Chapter List
  ════════════════════════════════════════ */
  async function loadManifest() {
    try {
      const res = await fetch(MANIFEST);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const m  = await res.json();
      chapters = m.chapters || [];
      renderChapterList();
    } catch (e) {
      console.error('Manifest load failed:', e);
    }
  }

  function renderChapterList() {
    if (!chaptersList) return;
    chaptersList.innerHTML = '';

    // Group by part if present
    const groups = {};
    chapters.forEach(ch => {
      const part = ch.part || 'default';
      if (!groups[part]) groups[part] = { label: ch.partLabel || '', items: [] };
      groups[part].items.push(ch);
    });

    chapters.forEach((ch, i) => {
      const li       = document.createElement('li');
      const a        = document.createElement('a');
      const num      = document.createElement('span');
      const title    = document.createElement('span');
      const progWrap = document.createElement('div');
      const progFill = document.createElement('div');

      num.className    = 'ch-num';
      num.textContent  = i + 1;
      title.style.flex = '1';
      title.textContent = ch.title;

      progWrap.className = 'ch-progress';
      progFill.className = 'ch-progress-fill';
      const savedPct = lsGet('pct_' + ch.id, 0);
      progFill.style.width = savedPct + '%';
      progWrap.appendChild(progFill);

      a.href  = '#' + ch.id;
      a.title = ch.title;
      a.appendChild(num);
      a.appendChild(title);
      a.addEventListener('click', e => {
        e.preventDefault();
        loadChapter(ch.id);
        closeSidebar();
      });

      li.appendChild(a);
      li.appendChild(progWrap);
      chaptersList.appendChild(li);
    });
  }

  function setActiveChapter(id) {
    document.querySelectorAll('#chaptersList li a').forEach((a, i) => {
      const ch = chapters[i];
      a.classList.toggle('active', !!(ch && ch.id === id));
    });
  }

  /* ════════════════════════════════════════
     Word HTML Cleaner
     Pure regex pre-pass + safe two-pass DOM walk
  ════════════════════════════════════════ */
  function cleanWordHtml(raw) {
    // ── Phase 1: Regex pre-clean (before DOMParser)
    let html = raw
      // Remove XML declaration
      .replace(/<\?xml[\s\S]*?\?>/gi, '')
      // Remove Word conditional comments and their bodies
      .replace(/<!--\[if [\s\S]*?<!\[endif\]-->/gi, '')
      .replace(/<!--\[if [^\]]*\]>/gi, '')
      .replace(/<!\[endif\]-->/gi, '')
      // Remove Word processing instructions
      .replace(/<\?if[\s\S]*?\?>/gi, '')
      .replace(/<\?endif>/gi, '')
      // Remove Office namespace tags: <o:p>, <w:anything>, <v:anything>, <m:anything>
      .replace(/<\/?o:[^>]*>/gi, '')
      .replace(/<\/?w:[^>]*>/gi, '')
      .replace(/<\/?v:[^>]*>/gi, '')
      .replace(/<\/?m:[^>]*>/gi, '')
      // Remove <style> blocks completely
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      // Remove <script> blocks completely
      .replace(/<script[\s\S]*?<\/script>/gi, '');

    // ── Phase 2: DOM parse and clean
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, 'text/html');
    const body   = doc.body;

    // Remove remaining junk elements
    body.querySelectorAll('style, script, link, meta, xml').forEach(el => el.remove());

    // ── Phase 3: Walk all elements and strip attributes
    // Collect into a static array first to avoid live-collection bugs
    const allEls = Array.from(body.querySelectorAll('*'));
    const QURAN_COLOR = /color\s*:\s*(#C00000|#c00000|red)/i;

    allEls.forEach(el => {
      const tag          = el.tagName.toLowerCase();
      const style        = el.getAttribute('style') || '';
      const isQuranColor = QURAN_COLOR.test(style);

      // Strip every attribute
      const attrsToRemove = [];
      for (const attr of el.attributes) {
        attrsToRemove.push(attr.name);
      }
      attrsToRemove.forEach(attr => el.removeAttribute(attr));

      // Restore dir=rtl on elements that need it (sections)
      if (tag === 'section') el.setAttribute('dir', 'rtl');

      // Re-add quran class
      if (isQuranColor && ['span', 'b', 'strong', 'i'].includes(tag)) {
        el.className = 'quran-text';
      }
    });

    // ── Phase 4: Unwrap passthrough spans (static array, post-attribute-strip)
    // Must re-query after attribute stripping since classes changed
    const spans = Array.from(body.querySelectorAll('span:not(.quran-text)'));
    spans.forEach(span => {
      if (!span.parentNode) return; // already removed
      const text = span.textContent.trim();
      if (!text) {
        span.remove();
        return;
      }
      // Unwrap: move children before the span, then remove span
      const parent = span.parentNode;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      span.remove();
    });

    // ── Phase 5: Remove empty blocks
    Array.from(body.querySelectorAll('p, li')).forEach(el => {
      const t = el.textContent.trim();
      if (!t || t === '\u00a0' || t === '\u200b') el.remove();
    });

    // ── Phase 6: Remove images (Word clipboard artifacts)
    body.querySelectorAll('img').forEach(img => img.remove());

    return body.innerHTML;
  }

  /* ════════════════════════════════════════
     Paragraph-level Autosave
  ════════════════════════════════════════ */
  function getReadingBlocks() {
    return Array.from(
      contentEl.querySelectorAll('p, h1, h2, h3, h4, h5, li, blockquote, td')
    ).filter(el => el.textContent.trim().length > 3);
  }

  function indexBlocks() {
    getReadingBlocks().forEach((el, i) => el.setAttribute('data-block', i));
  }

  function findCurrentBlock() {
    const blocks  = getReadingBlocks();
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
      for (const el of blocks) {
        const r = el.getBoundingClientRect();
        if (r.top >= 0 && r.top < window.innerHeight) {
          return parseInt(el.getAttribute('data-block') || '0');
        }
      }
    }
    return best ? parseInt(best.getAttribute('data-block') || '0') : -1;
  }

  function getSavedProgress(chapterId) {
    return lsGet('progress_' + chapterId, null);
  }

  function scrollToBlock(blockIdx) {
    const blocks = getReadingBlocks();
    const el     = blocks[blockIdx] || blocks[0];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 100;
    window.scrollTo({ top, behavior: 'smooth' });
    setTimeout(() => {
      el.classList.add('position-highlight');
      el.addEventListener('animationend', () => el.classList.remove('position-highlight'), { once: true });
    }, 450);
  }

  function savePosition() {
    if (!currentChapterId) return;
    const blockIdx    = findCurrentBlock();
    const y = window.scrollY || window.pageYOffset || 0;
    if (blockIdx < 0 && !y) return;
    const totalBlocks = getReadingBlocks().length;
    const pct         = totalBlocks > 0 ? Math.round((blockIdx / totalBlocks) * 100) : 0;
    lsSet('pos_' + currentChapterId, blockIdx);
    lsSet('progress_' + currentChapterId, {
      block: blockIdx,
      y,
      ts: Date.now()
    });
    lsSet('pct_' + currentChapterId, pct);
    if (progressFill) progressFill.style.width = pct + '%';
    // Update sidebar mini-progress bar
    const chIdx = chapters.findIndex(c => c.id === currentChapterId);
    if (chIdx >= 0 && chaptersList) {
      const fill = chaptersList.querySelectorAll('.ch-progress-fill')[chIdx];
      if (fill) fill.style.width = pct + '%';
    }
  }

  function restorePosition(chapterId, force = false) {
    if (!chapterId) return;
    const saved = getSavedProgress(chapterId);
    const signature = saved ? `${saved.block ?? ''}:${saved.y ?? 0}` : `legacy:${lsGet('pos_' + chapterId, -1)}`;
    if (!force && signature === lastRestoreSignature) return;

    const legacyBlock = lsGet('pos_' + chapterId, -1);
    const block = saved && typeof saved.block === 'number' ? saved.block : legacyBlock;
    const y = saved && typeof saved.y === 'number' ? saved.y : 0;

    if (block >= 0) {
      lastRestoreSignature = signature;
      scrollToBlock(block);
      return;
    }

    if (y > 0) {
      lastRestoreSignature = signature;
      window.scrollTo({ top: y, behavior: 'auto' });
    }
  }

  function restorePositionRepeatedly(chapterId) {
    const delays = [0, 100, 300, 700, 1200, 2000, 3500];
    delays.forEach(delay => {
      window.setTimeout(() => restorePosition(chapterId, delay === 0), delay);
    });
    if (window.requestAnimationFrame) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => restorePosition(chapterId, true));
      });
    }
  }

  function onScroll() {
    if (!currentChapterId) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePosition, SAVE_DELAY);
    updateProgressBar();
  }

  function updateProgressBar() {
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    const pct  = docH > 0 ? Math.min(100, Math.round((window.scrollY / docH) * 100)) : 0;
    if (progressFill) progressFill.style.width = pct + '%';
  }

  /* ════════════════════════════════════════
     Chapter Loading
  ════════════════════════════════════════ */
  async function loadChapter(id) {
    const ch = chapters.find(c => c.id === id);
    if (!ch) {
      console.warn('Chapter not found:', id, '  Available:', chapters.map(c => c.id));
      return;
    }

    // Save position in leaving chapter
    if (currentChapterId && currentChapterId !== id) savePosition();

    currentChapterId = id;
    lsSet('last_chapter', id);
    document.title = ch.title + ' — بأسمائه نحيا';
    history.replaceState(null, '', '#' + id);

    // Show spinner
    hideCover();
    contentEl.classList.remove('visible');
    contentEl.innerHTML = `
      <div class="loading-state" aria-live="polite">
        <div class="spinner" role="status" aria-label="جار التحميل"></div>
        <span>جارٍ تحميل الفصل…</span>
      </div>`;
    contentEl.classList.add('visible');
    window.scrollTo({ top: 0, behavior: 'instant' });

    try {
      const res  = await fetch('content/' + ch.file);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw  = await res.text();
      const html = cleanWordHtml(raw);
      contentEl.innerHTML = html;
      contentEl.setAttribute('dir', 'rtl');
      indexBlocks();
      setActiveChapter(id);

      // Update continue button in header
      if (continueBtn) continueBtn.style.display = 'none';

      restorePositionRepeatedly(id);
    } catch (e) {
      console.error('Chapter load error:', e);
      contentEl.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
          <p style="font-size:1.2em">تعذّر تحميل الفصل</p>
          <p style="font-size:0.85em;opacity:0.6">${e.message}</p>
        </div>`;
    }
  }

  /* ════════════════════════════════════════
     Cover Page
  ════════════════════════════════════════ */
  function showCover() {
    if (coverPage)  coverPage.style.display  = '';
    if (contentEl)  contentEl.classList.remove('visible');
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
  let toastTimer = null;
  function showContinueToast() {
    const lastId = lsGet('last_chapter');
    if (!lastId) return;
    const ch = chapters.find(c => c.id === lastId);
    if (!ch) return;
    if (toastChapter) toastChapter.textContent = ch.title;
    if (continueToast) {
      continueToast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => continueToast.classList.remove('show'), 8000);
    }
  }

  function hideContinueToast() {
    if (continueToast) continueToast.classList.remove('show');
    clearTimeout(toastTimer);
  }

  /* ════════════════════════════════════════
     Sidebar
  ════════════════════════════════════════ */
  function toggleSidebar() {
    if (!sidebar) return;
    const isMobile = window.innerWidth <= 900;
    if (isMobile) {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('active', sidebar.classList.contains('open'));
    } else {
      sidebar.classList.toggle('collapsed');
    }
  }

  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }

  /* ════════════════════════════════════════
     Settings Panel
  ════════════════════════════════════════ */
  function openSettings() {
    if (settingsPanel) settingsPanel.classList.add('open');
    if (overlay) overlay.classList.add('active');
  }

  function closeSettings() {
    if (settingsPanel) settingsPanel.classList.remove('open');
    // Only remove overlay if sidebar is also closed
    if (overlay && !sidebar?.classList.contains('open')) {
      overlay.classList.remove('active');
    }
  }

  /* ════════════════════════════════════════
     Bootstrap
  ════════════════════════════════════════ */
  async function init() {
    // Apply saved settings immediately
    applySettings(lsGet('settings') || DEFAULT_SETTINGS);

    // Load chapters list
    await loadManifest();

    // Determine what to show
    const hash   = (location.hash || '').replace('#', '');
    const lastId = lsGet('last_chapter');

    if (hash && chapters.find(c => c.id === hash)) {
      // Deep link — go straight to chapter
      await loadChapter(hash);
    } else {
      // Show cover
      showCover();

      // Show continue button + toast if there's reading history
      if (lastId && chapters.find(c => c.id === lastId)) {
        if (continueBtn) continueBtn.style.display = '';
        setTimeout(showContinueToast, 700);
      }
    }
  }

  /* ════════════════════════════════════════
     Event Listeners
  ════════════════════════════════════════ */

  // Sidebar toggle
  if (toggleNavBtn) toggleNavBtn.addEventListener('click', toggleSidebar);

  // Overlay click — close panels
  if (overlay) overlay.addEventListener('click', () => {
    closeSettings();
    closeSidebar();
  });

  // Header "Continue" button
  if (continueBtn) continueBtn.addEventListener('click', () => {
    const lastId = lsGet('last_chapter');
    if (lastId) loadChapter(lastId);
    hideContinueToast();
  });

  // Toast buttons
  if (toastGo)     toastGo.addEventListener('click',     () => { const id = lsGet('last_chapter'); if (id) loadChapter(id); hideContinueToast(); });
  if (toastDismiss) toastDismiss.addEventListener('click', hideContinueToast);

  // Cover page buttons
  const startReadingBtn = $('startReadingBtn');
  if (startReadingBtn) startReadingBtn.addEventListener('click', () => {
    const lastId = lsGet('last_chapter');
    if (lastId && chapters.find(c => c.id === lastId)) loadChapter(lastId);
    else if (chapters.length) loadChapter(chapters[0].id);
  });

  const fromBeginBtn = $('fromBeginBtn');
  if (fromBeginBtn) fromBeginBtn.addEventListener('click', () => {
    if (chapters.length) {
      // Clear position for first chapter so we start fresh
      lsDel('pos_' + chapters[0].id);
      loadChapter(chapters[0].id);
    }
  });

  // Back to cover (sidebar button)
  const backToCoverBtn = $('backToCover');
  if (backToCoverBtn) backToCoverBtn.addEventListener('click', () => {
    showCover();
    closeSidebar();
  });

  // Settings panel
  if (openSettingsBtn)  openSettingsBtn.addEventListener('click',  openSettings);
  if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettings);

  // Theme swatches
  document.querySelectorAll('.swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      saveSettings();
    });
  });

  // Font size +/-
  if (fontIncBtn) fontIncBtn.addEventListener('click', () => {
    const current = parseInt(fontSizeLabel?.textContent) || 18;
    const next    = Math.min(32, current + 1);
    if (fontSizeLabel) fontSizeLabel.textContent = next + 'px';
    document.documentElement.style.setProperty('--font-size', next + 'px');
    saveSettings();
  });
  if (fontDecBtn) fontDecBtn.addEventListener('click', () => {
    const current = parseInt(fontSizeLabel?.textContent) || 18;
    const next    = Math.max(13, current - 1);
    if (fontSizeLabel) fontSizeLabel.textContent = next + 'px';
    document.documentElement.style.setProperty('--font-size', next + 'px');
    saveSettings();
  });

  // Other setting inputs
  if (lineHeightInput) lineHeightInput.addEventListener('input', () => {
    document.documentElement.style.setProperty('--line-height', lineHeightInput.value);
    saveSettings();
  });
  if (fontFamilySel)  fontFamilySel.addEventListener('change', saveSettings);
  if (fontColorInput) fontColorInput.addEventListener('input',  saveSettings);
  if (bgColorInput)   bgColorInput.addEventListener('input',   saveSettings);
  if (resetBtn) resetBtn.addEventListener('click', () => {
    lsDel('settings');
    applySettings(DEFAULT_SETTINGS);
  });

  // Scroll tracking
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('beforeunload', savePosition);
  window.addEventListener('pagehide', savePosition);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') savePosition();
  });

  // Hash change (browser back/forward)
  window.addEventListener('hashchange', () => {
    const id = (location.hash || '').replace('#', '');
    if (id && chapters.find(c => c.id === id)) loadChapter(id);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === 'Escape') { closeSettings(); closeSidebar(); }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && currentChapterId) {
      const dir  = e.key === 'ArrowLeft' ? 1 : -1; // RTL: left = next
      const idx  = chapters.findIndex(c => c.id === currentChapterId);
      const next = idx + dir;
      if (next >= 0 && next < chapters.length) loadChapter(chapters[next].id);
    }
  });

  /* ── Start ── */
  init();

})();

/* ============================================================
 * 二维码选择器 · 应用逻辑
 * 结构：配置 → 数据校验 → 记忆状态 → 二维码绘制 → 渲染 → 选择行为
 *       → 键盘导航 → 启动
 * 依赖：js/vendor/qrcode-generator.js（全局 qrcode）、js/data.js（全局 QRSEL_DB）
 * ============================================================ */
(() => {
  'use strict';

  /* ---------- 配置 ---------- */
  const PERSIST_SELECTION = true;   // 选中记忆是否跨刷新持久化（localStorage）
  const MEMORY_KEY = 'qrsel:memory:v1';
  const QR_ECC = 'M';               // 纠错级别：M（与扫码容错平衡）
  const QR_QUIET = 4;               // 四周静区（模块数，QR 规范建议值）
  const QR_DARK = '#101418';        // 码点固定深色，任何主题下都保证可扫
  const QR_LIGHT = '#FFFFFF';
  const TITLE_MIN_SIZE = 12;        // 标题自适应缩小的下限字号

  /* ---------- DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const els = {
    catList: $('catList'),
    itemGrid: $('itemGrid'),
    canvas: $('qrCanvas'),
    code: $('codeLabel'),
    title: $('qrTitle'),
    frame: $('qrCanvas').closest('.qr-frame'),
  };
  const ctx = els.canvas.getContext('2d');

  /* ---------- 数据校验：剔除缺 code 的条目与空分类，避免脏数据渲染异常 ---------- */
  const DB = (window.QRSEL_DB || [])
    .map((cat) => {
      if (!cat || typeof cat.category !== 'string' || !Array.isArray(cat.items)) return null;
      const items = cat.items.filter((it) => it && typeof it.code === 'string' && it.code.length > 0);
      return items.length > 0 ? { category: cat.category, items } : null;
    })
    .filter(Boolean);

  if (DB.length === 0) {
    els.code.textContent = '未找到数据';
    els.title.textContent = '请检查 js/data.js';
    return;
  }

  if (!window.qrcode || typeof window.qrcode !== 'function') {
    els.code.textContent = '二维码组件加载失败';
    els.title.textContent = '请检查 js/vendor/qrcode-generator.js';
    return;
  }

  /* ---------- 记忆状态：分类名 -> 编码下标 ---------- */
  const memory = { cat: 0, byCat: new Map() };

  function clamp(i, len) { return Math.max(0, Math.min(i, len - 1)); }

  function loadMemory() {
    if (!PERSIST_SELECTION) return;
    try {
      const saved = JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}');
      if (Number.isInteger(saved.cat)) memory.cat = saved.cat;
      if (saved.byCat && typeof saved.byCat === 'object') {
        for (const [name, idx] of Object.entries(saved.byCat)) {
          if (Number.isInteger(idx) && idx >= 0) memory.byCat.set(name, idx);
        }
      }
    } catch { /* 隐私模式或数据损坏：忽略，从默认状态开始 */ }
  }

  function saveMemory() {
    if (!PERSIST_SELECTION) return;
    try {
      localStorage.setItem(
        MEMORY_KEY,
        JSON.stringify({ cat: memory.cat, byCat: Object.fromEntries(memory.byCat) })
      );
    } catch { /* 存储不可用时静默降级为会话内记忆 */ }
  }

  const currentCat = () => DB[memory.cat];
  const currentItemIndex = () => {
    const len = currentCat().items.length;
    const idx = memory.byCat.get(currentCat().category);
    return idx == null || idx >= len ? 0 : idx;
  };
  const currentItem = () => currentCat().items[currentItemIndex()];

  /* ---------- 二维码绘制：内容严格等于所选编码 ---------- */
  // qrcode-generator 默认按单字节取 charCode，非 ASCII 内容会乱码；
  // 显式切到库自带的 UTF-8 转换器（对纯 ASCII 编码无任何影响）。
  if (window.qrcode.stringToBytesFuncs && window.qrcode.stringToBytesFuncs['UTF-8']) {
    window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
  }

  /* 返回 false 表示编码失败（如内容超出容量），调用方据此显示错误提示 */
  function drawQr(text) {
    let qr;
    try {
      qr = window.qrcode(0, QR_ECC);  // 0 = 自动选择最小可用版本
      qr.addData(text);
      qr.make();
    } catch {
      const side = Math.round(480 * (window.devicePixelRatio || 1));
      els.canvas.width = side;
      els.canvas.height = side;
      ctx.fillStyle = QR_LIGHT;
      ctx.fillRect(0, 0, side, side);
      return false;
    }
    const count = qr.getModuleCount();
    const total = count + QR_QUIET * 2;
    const scale = Math.max(2, Math.round((480 * (window.devicePixelRatio || 1)) / total));
    const size = total * scale;
    els.canvas.width = size;
    els.canvas.height = size;
    ctx.fillStyle = QR_LIGHT;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = QR_DARK;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect((c + QR_QUIET) * scale, (r + QR_QUIET) * scale, scale, scale);
        }
      }
    }
    return true;
  }

  /* ---------- 渲染 ---------- */
  function makeChip(role) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip ' + role;
    btn.setAttribute('role', 'radio');
    // 点击不抢焦点：避免浏览器把按钮滚动到视口中央造成页面跳动
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    return btn;
  }

  function renderCategories() {
    els.catList.textContent = '';
    DB.forEach((cat, i) => {
      const btn = makeChip('cat-chip');
      btn.textContent = cat.category;
      btn.addEventListener('click', () => selectCategory(i));
      els.catList.appendChild(btn);
    });
    // 超过 4 个分类时按钮定高为列表的 1/4（CSS 依 data-multi 切换规则）
    els.catList.dataset.multi = String(DB.length > 4);
    syncCategoryButtons();
  }

  function renderItems() {
    els.itemGrid.textContent = '';
    currentCat().items.forEach((it, i) => {
      const btn = makeChip('item-chip');
      btn.textContent = it.label || it.code;  // label 只影响按钮显示，不影响扫码内容
      btn.addEventListener('click', () => selectItem(i));
      els.itemGrid.appendChild(btn);
    });
    syncItemButtons();
    els.itemGrid.children[currentItemIndex()]?.scrollIntoView({ block: 'nearest' });
  }

  function syncCategoryButtons() {
    [...els.catList.children].forEach((btn, i) => {
      const active = i === memory.cat;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', String(active));
      btn.tabIndex = active ? 0 : -1;   // roving tabindex：键盘 Tab 只落在选中项
    });
  }

  function syncItemButtons() {
    const current = currentItemIndex();
    [...els.itemGrid.children].forEach((btn, i) => {
      const active = i === current;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', String(active));
      btn.tabIndex = active ? 0 : -1;
    });
  }

  function renderCard() {
    const it = currentItem();
    els.code.textContent = it.code;
    if (!drawQr(it.code)) {
      // 生成失败时保留编码显示，错误提示占据标题位（不被后续逻辑覆盖）
      els.title.textContent = '⚠ 编码过长，无法生成二维码';
      fitTitle();
      return;
    }
    // 标题：自定义 title 优先；否则「分类名 + 序号」（从 1 起，按数组顺序）
    els.title.textContent = it.title || (currentCat().category + (currentItemIndex() + 1));
    els.canvas.setAttribute('aria-label', '二维码，扫码内容：' + it.code);
    fitTitle();
  }

  /* 标题超宽时逐级缩小字号，保证单行完整显示 */
  function fitTitle() {
    const el = els.title;
    el.style.fontSize = '';
    let size = parseFloat(getComputedStyle(el).fontSize) || 30;
    el.style.fontSize = size + 'px';
    let guard = 0;
    while (el.scrollWidth > el.clientWidth + 1 && size > TITLE_MIN_SIZE && guard < 60) {
      size -= 1;
      el.style.fontSize = size + 'px';
      guard++;
    }
  }

  /* ---------- 选择行为 ---------- */
  function selectCategory(i) {
    if (i === memory.cat) return;
    memory.byCat.set(currentCat().category, currentItemIndex());  // 记住离开前的选中项
    memory.cat = i;
    syncCategoryButtons();
    renderItems();
    renderCard();
    saveMemory();
  }

  function selectItem(i) {
    if (i === currentItemIndex()) return;
    memory.byCat.set(currentCat().category, i);
    syncItemButtons();
    renderCard();
    saveMemory();
  }

  /* ---------- 键盘导航（radiogroup 惯例：方向键移动、Home/End 首尾） ---------- */
  function onRadioKeydown(e, count, current, move) {
    let target = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') target = current + 1;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') target = current - 1;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = count - 1;
    else return;
    e.preventDefault();
    if (target < 0 || target > count - 1) return;
    move(target);
  }

  els.catList.addEventListener('keydown', (e) =>
    onRadioKeydown(e, DB.length, memory.cat, (t) => {
      selectCategory(t);
      els.catList.children[t].focus();
    })
  );
  els.itemGrid.addEventListener('keydown', (e) =>
    onRadioKeydown(e, currentCat().items.length, currentItemIndex(), (t) => {
      selectItem(t);
      els.itemGrid.children[t].focus();
    })
  );

  /* ---------- 自适应：卡片尺寸变化时重算标题字号 ---------- */
  new ResizeObserver(() => fitTitle()).observe(els.frame);

  /* ---------- 启动 ---------- */
  loadMemory();
  memory.cat = clamp(memory.cat, DB.length);
  renderCategories();
  renderItems();
  renderCard();
  els.catList.children[memory.cat]?.scrollIntoView({ block: 'nearest' });
})();

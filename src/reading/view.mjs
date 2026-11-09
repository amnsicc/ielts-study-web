function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

const displayModes = [
  ['english', '仅英文'], ['chinese', '仅中文'], ['both', '中英都显示'], ['none', '全部遮挡'],
];
function modeSelect(id, label) {
  const select = node('select', 'display-select');
  select.setAttribute('aria-label', label);
  select.dataset.displayFor = id;
  for (const [value, title] of displayModes) select.append(new Option(title, value));
  return select;
}
const modeName = visibility => visibility.english ? (visibility.chinese ? 'both' : 'english') : (visibility.chinese ? 'chinese' : 'none');

export function readingView(session, materials) {
  const layout = node('main', 'reading-layout');
  let ratio = 0.46;
  const wordSection = node('section', 'study-panel word-panel');
  wordSection.setAttribute('aria-labelledby', 'words-heading');
  const wordToolbar = node('div', 'panel-toolbar word-toolbar');
  const wordTitle = node('h1', '', '单词');
  wordTitle.id = 'words-heading';
  const range = node('span', 'panel-detail');
  const displayLabel = node('label', 'control-label', '整体显示');
  const globalSelect = modeSelect('all', '整体显示');
  globalSelect.id = 'global-display';
  displayLabel.htmlFor = globalSelect.id;
  const mixed = new Option('逐词设置', 'custom');
  mixed.disabled = true;
  globalSelect.append(mixed);
  const reset = node('button', 'quiet-button reset-view', '重置阅读界面');
  reset.type = 'button';
  wordToolbar.append(wordTitle, range, displayLabel, globalSelect, reset);
  const wordScroll = node('div', 'word-scroll');
  wordScroll.id = 'word-scroll';
  wordScroll.tabIndex = 0;
  wordScroll.setAttribute('aria-label', '阅读词表，可上下滚动');
  wordSection.append(wordToolbar, wordScroll);

  const separator = node('div', 'splitter');
  separator.id = 'reading-divider';
  separator.tabIndex = 0;
  separator.setAttribute('role', 'separator');
  separator.setAttribute('aria-label', '调整词表与文章的高度');
  separator.setAttribute('aria-orientation', 'horizontal');
  separator.setAttribute('aria-controls', 'word-scroll article-scroll');
  separator.setAttribute('aria-valuemin', '25');
  separator.setAttribute('aria-valuemax', '72');
  separator.append(node('span', 'splitter-grip'));
  separator.title = '上下拖动调整区域；也可聚焦后按上下方向键';

  const articleSection = node('section', 'study-panel article-panel');
  articleSection.setAttribute('aria-labelledby', 'article-heading');
  const articleToolbar = node('div', 'panel-toolbar article-toolbar');
  const articleTitle = node('h2', '', '文章');
  articleTitle.id = 'article-heading';
  const highlightLabel = node('label', 'highlight-label');
  const highlight = node('input');
  highlight.type = 'checkbox';
  highlight.id = 'target-highlight';
  highlightLabel.append(highlight, document.createTextNode('目标高亮'));
  const label = node('label', 'material-label', '选择文章');
  label.htmlFor = 'material-select';
  const select = node('select', 'material-select');
  select.id = 'material-select';
  for (const material of materials) {
    select.append(new Option(`${material.label} · ${String(material.start).padStart(3, '0')}—${String(material.end).padStart(3, '0')} · ${material.title}`, material.id));
  }
  const articleScroll = node('div', 'article-scroll');
  articleScroll.id = 'article-scroll';
  articleScroll.tabIndex = 0;
  articleScroll.setAttribute('aria-label', '阅读文章，可上下滚动');
  articleToolbar.append(articleTitle, highlightLabel, label, select);
  articleSection.append(articleToolbar, articleScroll);

  const dialog = node('dialog', 'meaning-dialog');
  dialog.setAttribute('aria-labelledby', 'meaning-title');
  const dialogClose = node('button', 'quiet-button', '关闭');
  dialogClose.type = 'button';
  dialogClose.autofocus = true;
  const dialogTop = node('div', 'meaning-top');
  dialogTop.append(node('p', '', '本篇用义'), dialogClose);
  const meaningTitle = node('h2', 'meaning-title');
  meaningTitle.id = 'meaning-title';
  meaningTitle.lang = 'en';
  const meaningText = node('p', 'meaning-text');
  const meaningNote = node('p', 'meaning-note');
  dialog.append(dialogTop, meaningTitle, meaningText, meaningNote);
  let lastTarget;
  dialogClose.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => { if (lastTarget?.isConnected) lastTarget.focus({ preventScroll: true }); });
  layout.append(wordSection, separator, articleSection, dialog);

  function syncWords() {
    const view = session.getView();
    const modes = Object.values(view.visibility).map(modeName);
    globalSelect.value = modes.every(mode => mode === view.globalMode) ? view.globalMode : 'custom';
    for (const row of wordScroll.querySelectorAll('[data-entry-id]')) {
      const visibility = view.visibility[row.dataset.entryId];
      row.querySelector('[data-display-for]').value = modeName(visibility);
      for (const [language, visible] of Object.entries(visibility)) {
        const span = row.querySelector(`[data-language="${language}"]`);
        span.classList.toggle('masked', !visible);
        if (visible) span.removeAttribute('aria-hidden');
        else span.setAttribute('aria-hidden', 'true');
      }
      if (row.dataset.extraParent) row.hidden = !view.expandedIds.includes(row.dataset.extraParent);
    }
    for (const button of wordScroll.querySelectorAll('[data-expand]')) {
      const open = view.expandedIds.includes(button.dataset.expand);
      button.setAttribute('aria-expanded', String(open));
      button.textContent = open ? '▴' : '▾';
    }
  }

  function entryRow(entry, parentId) {
    const row = node('tr', parentId ? 'extra-row' : 'main-row');
    row.dataset.entryId = entry.id;
    if (parentId) row.dataset.extraParent = parentId;
    else { row.dataset.number = entry.number; row.dataset.groupId = entry.id; }
    const number = String(entry.number).padStart(3, '0');
    row.append(node('td', 'word-number', number));
    const english = node('th', 'word-english');
    english.scope = 'row';
    const content = node('span', 'entry-word', entry.word);
    content.lang = 'en';
    content.dataset.language = 'english';
    english.append(content);
    if (entry.extras?.length) {
      const expand = node('button', 'extras-toggle', '▾');
      expand.type = 'button';
      expand.dataset.expand = entry.id;
      expand.setAttribute('aria-label', `原编号${number}的拓展项（${entry.extras.length}项）`);
      expand.setAttribute('aria-controls', `extras-${entry.number}`);
      expand.addEventListener('click', () => { session.toggleExtras(entry.id); syncWords(); });
      english.append(expand);
    }
    row.append(english);
    const meanings = node('td', 'word-meanings');
    const meaningContent = node('span', 'meaning-content');
    meaningContent.dataset.language = 'chinese';
    for (const sense of entry.senses) {
      const gloss = node('span', 'gloss');
      gloss.append(node('span', 'sense-grade', `P${sense.grade}`), node('span', 'sense-pos', sense.pos),
        node('span', sense.primary ? 'sense-text primary-sense' : 'sense-text', sense.text));
      meaningContent.append(gloss);
    }
    meanings.append(meaningContent);
    const controls = node('td', 'entry-controls');
    const mode = modeSelect(entry.id, `编号${number}的显示方式`);
    mode.addEventListener('change', () => { session.setVisibility(entry.id, mode.value); syncWords(); });
    controls.append(mode);
    row.append(meanings, controls);
    return row;
  }

  function paintWords() {
    const view = session.getView();
    range.textContent = `本篇 ${view.groups.length} 词`;
    const table = node('table', 'word-table');
    const head = node('thead');
    const header = node('tr');
    for (const text of ['原编号', '英文', '阅读释义', '单条显示']) {
      const cell = node('th', '', text);
      cell.scope = 'col';
      header.append(cell);
    }
    head.append(header);
    table.append(head);
    for (const group of view.groups) {
      const body = node('tbody', 'word-group');
      body.append(entryRow(group));
      table.append(body);
      if (group.extras?.length) {
        const extras = node('tbody', 'extras-group');
        extras.id = `extras-${group.number}`;
        for (const extra of group.extras) extras.append(entryRow(extra, group.id));
        table.append(extras);
      }
    }
    wordScroll.replaceChildren(table);
    syncWords();
  }

  function showMeaning(occurrenceId, target) {
    const occurrence = session.getOccurrenceMeaning(occurrenceId);
    if (!occurrence) return;
    lastTarget = target;
    meaningTitle.textContent = occurrence.text;
    meaningText.textContent = `${occurrence.pos} ${occurrence.meaning}`;
    meaningNote.textContent = occurrence.note || '按本篇原有选义表显示。其他阅读义项可在上方词表查看。';
    dialog.showModal();
  }

  function syncHighlight() {
    const { highlightTargets } = session.getView();
    highlight.checked = highlightTargets;
    articleScroll.classList.toggle('show-targets', highlightTargets);
  }

  function paintArticle() {
    const { material, groups } = session.getView();
    const article = node('article', 'article-body');
    const heading = node('h3', 'article-title', material.title);
    heading.lang = 'en';
    const numbers = groups.map(group => String(group.number).padStart(3, '0')).join('、');
    article.append(heading, node('p', 'article-coverage', `目标原编号 ${numbers}`),
      node('p', 'article-extra', '本篇未额外选入派生词、特殊形式或词块。'));
    material.paragraphs.forEach((paragraph, index) => {
      const plain = paragraph.replaceAll('`', '');
      const p = node('p', 'article-paragraph');
      p.lang = 'en';
      let offset = 0;
      const occurrences = (material.occurrences || []).filter(item => item.paragraphIndex === index);
      for (const occurrence of occurrences) {
        p.append(document.createTextNode(plain.slice(offset, occurrence.start)));
        const target = node('button', 'article-target', plain.slice(occurrence.start, occurrence.end));
        target.type = 'button';
        target.dataset.occurrenceId = occurrence.id;
        target.setAttribute('aria-haspopup', 'dialog');
        target.addEventListener('click', () => showMeaning(occurrence.id, target));
        p.append(target);
        offset = occurrence.end;
      }
      p.append(document.createTextNode(plain.slice(offset)));
      article.append(p);
    });
    article.append(node('p', 'article-end', '本篇结束'));
    articleScroll.replaceChildren(article);
    syncHighlight();
  }

  function paintMaterial() {
    if (dialog.open) dialog.close();
    select.value = session.getView().material.id;
    paintWords();
    paintArticle();
    wordScroll.scrollTop = 0;
    articleScroll.scrollTop = 0;
  }
  select.addEventListener('change', () => { session.selectMaterial(select.value); paintMaterial(); });
  globalSelect.addEventListener('change', () => { session.setVisibility('all', globalSelect.value); syncWords(); });
  highlight.addEventListener('change', () => { session.setTargetHighlight(highlight.checked); syncHighlight(); });
  reset.addEventListener('click', () => { session.resetView(); resize(0.46); paintMaterial(); });

  function resize(value) {
    ratio = Math.max(0.25, Math.min(0.72, value));
    layout.style.setProperty('--word-ratio', String(ratio));
    separator.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    separator.setAttribute('aria-valuetext', `词表占可用高度的 ${Math.round(ratio * 100)}%`);
  }
  separator.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    separator.setPointerCapture(event.pointerId);
    separator.classList.add('dragging');
    event.preventDefault();
  });
  separator.addEventListener('pointermove', event => {
    if (!separator.hasPointerCapture(event.pointerId)) return;
    const bounds = layout.getBoundingClientRect();
    const style = getComputedStyle(layout);
    const top = parseFloat(style.paddingTop), bottom = parseFloat(style.paddingBottom);
    resize((event.clientY - bounds.top - top) / (layout.clientHeight - top - bottom - separator.offsetHeight));
  });
  separator.addEventListener('lostpointercapture', () => separator.classList.remove('dragging'));
  separator.addEventListener('pointerup', event => {
    if (separator.hasPointerCapture(event.pointerId)) separator.releasePointerCapture(event.pointerId);
  });
  separator.addEventListener('keydown', event => {
    const changes = { ArrowDown: 0.04, ArrowUp: -0.04 };
    if (event.key in changes) resize(ratio + changes[event.key]);
    else if (event.key === 'Home') resize(0.25);
    else if (event.key === 'End') resize(0.72);
    else return;
    event.preventDefault();
  });
  resize(ratio);
  paintMaterial();
  return layout;
}

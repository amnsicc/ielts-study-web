function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function readingView(session, materials) {
  const layout = node('main', 'reading-layout');
  let ratio = 0.46;
  const wordSection = node('section', 'study-panel word-panel');
  wordSection.setAttribute('aria-labelledby', 'words-heading');
  const wordToolbar = node('div', 'panel-toolbar');
  const wordTitle = node('h1', '', '单词');
  wordTitle.id = 'words-heading';
  const range = node('span', 'panel-detail');
  wordToolbar.append(wordTitle, range);
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
  articleToolbar.append(articleTitle, label, select);
  articleSection.append(articleToolbar, articleScroll);
  layout.append(wordSection, separator, articleSection);

  function paintMaterial() {
    const view = session.getView();
    select.value = view.material.id;
    range.textContent = `本篇 ${view.groups.length} 词 · 按原编号排列`;
    const table = node('table', 'word-table');
    const head = node('thead');
    const header = node('tr');
    for (const text of ['原编号', '英文', '阅读释义']) {
      const cell = node('th', '', text);
      cell.scope = 'col';
      header.append(cell);
    }
    head.append(header);
    const body = node('tbody');
    for (const group of view.groups) {
      const row = node('tr');
      row.dataset.number = group.number;
      row.dataset.groupId = group.id;
      row.append(node('td', 'word-number', String(group.number).padStart(3, '0')));
      const english = node('th', 'word-english', group.word);
      english.scope = 'row';
      english.lang = 'en';
      row.append(english);
      const meanings = node('td', 'word-meanings');
      for (const sense of group.senses) {
        const gloss = node('span', 'gloss');
        gloss.append(node('span', 'sense-grade', `P${sense.grade}`),
          node('span', 'sense-pos', sense.pos),
          node('span', sense.primary ? 'sense-text primary-sense' : 'sense-text', sense.text));
        meanings.append(gloss);
      }
      row.append(meanings);
      body.append(row);
    }
    table.append(head, body);
    wordScroll.replaceChildren(table);
    const article = node('article', 'article-body');
    const heading = node('h3', 'article-title', view.material.title);
    heading.lang = 'en';
    const numbers = view.groups.map(group => String(group.number).padStart(3, '0')).join('、');
    const coverage = node('p', 'article-coverage', `目标原编号 ${numbers}`);
    const extras = node('p', 'article-extra', '本篇未额外选入派生词、特殊形式或词块。');
    article.append(heading, coverage, extras);
    for (const paragraph of view.material.paragraphs) {
      const p = node('p', 'article-paragraph', paragraph.replaceAll('`', ''));
      p.lang = 'en';
      article.append(p);
    }
    article.append(node('p', 'article-end', '本篇结束'));
    articleScroll.replaceChildren(article);
    wordScroll.scrollTop = 0;
    articleScroll.scrollTop = 0;
  }
  select.addEventListener('change', () => {
    session.selectMaterial(select.value);
    paintMaterial();
  });

  function resize(value) {
    ratio = Math.max(0.25, Math.min(0.72, value));
    layout.style.setProperty('--word-ratio', String(ratio));
    separator.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    separator.setAttribute('aria-valuetext', `词表占可用高度的 ${Math.round(ratio * 100)}%`);
  }
  function move(event) {
    if (!separator.hasPointerCapture(event.pointerId)) return;
    const bounds = layout.getBoundingClientRect();
    const style = getComputedStyle(layout);
    const top = parseFloat(style.paddingTop);
    const bottom = parseFloat(style.paddingBottom);
    resize((event.clientY - bounds.top - top) / (layout.clientHeight - top - bottom - separator.offsetHeight));
  }
  separator.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    separator.setPointerCapture(event.pointerId);
    separator.classList.add('dragging');
    event.preventDefault();
  });
  separator.addEventListener('pointermove', move);
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

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

export function readingView(session, materials, records) {
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
  const filters = node('div', 'filter-toolbar');
  const scope = node('select', 'display-select');
  scope.id = 'word-scope'; scope.setAttribute('aria-label', '词表范围');
  scope.append(new Option('当前文章', 'current'), new Option('全部阅读词（001—040）', 'all'));
  const grade = node('select', 'display-select');
  grade.id = 'word-grade'; grade.setAttribute('aria-label', '词表P档');
  for (const [value,title] of [['all','全部P档'],['0','P0'],['1','P1'],['2','P2']]) grade.append(new Option(title,value));
  const wordQuery = node('input', 'search-input');
  wordQuery.type = 'search'; wordQuery.id = 'word-query'; wordQuery.placeholder = '搜词：英文、中文、编号';
  wordQuery.setAttribute('aria-label', '搜索词表');
  const clearWord = node('button', 'quiet-button', '清除词表搜索');
  clearWord.type = 'button'; clearWord.id = 'clear-word-query';
  const wordResultsToggle = node('button', 'quiet-button');
  wordResultsToggle.type = 'button'; wordResultsToggle.id = 'word-results-toggle';
  filters.append(scope, grade, wordQuery, clearWord, wordResultsToggle);
  const countOperator=node('select','display-select');countOperator.id='count-operator';
  countOperator.setAttribute('aria-label','没记住次数条件');
  for(const [value,title] of [['off','不限次数'],['>','次数 >'],['>=','次数 ≥'],['=','次数 ='],['<=','次数 ≤'],['<','次数 <']])countOperator.append(new Option(title,value));
  const countThreshold=node('input','count-threshold');countThreshold.id='count-threshold';countThreshold.type='number';countThreshold.min='0';countThreshold.step='1';countThreshold.value='0';countThreshold.setAttribute('aria-label','次数阈值');
  filters.append(countOperator,countThreshold);
  wordSection.insertBefore(filters, wordScroll);
  let wordResultsOpen = true;
  let lastLocatedEntry;
  const recordBar=node('div','record-bar');
  const recordStatus=node('span','record-status','正在读取记录…');recordStatus.id='record-status';recordStatus.setAttribute('role','status');
  const retryRecords=node('button','quiet-button','重试未完成操作');retryRecords.id='retry-records';retryRecords.type='button';retryRecords.hidden=true;
  const refreshRecords=node('button','quiet-button','刷新记录');refreshRecords.id='refresh-records';refreshRecords.type='button';
  const exportRecords=node('button','quiet-button','导出记录');exportRecords.id='export-records';exportRecords.type='button';
  recordBar.append(recordStatus,retryRecords,refreshRecords,exportRecords);
  let recordState={view:null,busy:true,error:'',pending:0};
  const history=node('p','reading-history');history.id='reading-history';

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
  const articleSearch = node('div', 'filter-toolbar');
  const articleQuery = node('input', 'search-input');
  articleQuery.id = 'article-query'; articleQuery.type = 'search';
  articleQuery.placeholder = '搜索文章库'; articleQuery.setAttribute('aria-label', '搜索文章库');
  const clearArticle = node('button', 'quiet-button', '清除文章搜索');
  clearArticle.id = 'clear-article-query'; clearArticle.type = 'button';
  const articleResultsToggle = node('button', 'quiet-button');
  articleResultsToggle.id = 'article-results-toggle'; articleResultsToggle.type = 'button';
  articleSearch.append(articleQuery, clearArticle, articleResultsToggle);
  articleSection.insertBefore(articleSearch, articleScroll);
  articleSection.insertBefore(history, articleScroll);
  const articleResults = node('div', 'search-results article-results');
  articleResults.id = 'article-results';
  let articleResultsOpen = true;

  const flashTimers = new WeakMap();
  function locate(element, container) {
    if (!element) return;
    const bounds = container.getBoundingClientRect();
    container.scrollTop += element.getBoundingClientRect().top - bounds.top - 40;
    element.tabIndex = -1;
    element.focus({preventScroll:true});
    clearTimeout(flashTimers.get(element));
    element.classList.remove('locate-fading');
    element.classList.add('locate-hit');
    flashTimers.set(element, setTimeout(() => {
      element.classList.add('locate-fading');
      flashTimers.set(element, setTimeout(() => element.classList.remove('locate-hit','locate-fading'),250));
    }, 850));
  }

  function locateEntry(match) {
    const view = session.getView();
    if (match.entryId !== match.groupId && !view.expandedIds.includes(match.groupId)) session.toggleExtras(match.groupId);
    syncWords();
    wordResultsOpen = false;
    wordScroll.querySelector('.word-results')?.setAttribute('hidden','');
    wordResultsToggle.textContent = `显示${view.matches.length}个定位结果`;
    lastLocatedEntry = match.entryId;
    locate([...wordScroll.querySelectorAll('[data-entry-id]')].find(row=>row.dataset.entryId===match.entryId),wordScroll);
  }

  function updateArticleResults() {
    const hits = session.searchMaterials(articleQuery.value);
    articleResults.replaceChildren();
    articleResults.hidden = !articleQuery.value.trim() || !articleResultsOpen;
    articleResultsToggle.hidden = !articleQuery.value.trim();
    articleResultsToggle.textContent = `${articleResultsOpen ? '收起' : '显示'}${hits.length}个结果`;
    if (!hits.length) articleResults.append(node('p','search-empty','没有匹配文章，请修改或清除关键词。'));
    for (const hit of hits) {
      const button = node('button','search-result article-search-result');
      button.type = 'button'; button.dataset.searchHit = hit.id; button.dataset.materialId = hit.materialId;
      button.append(node('strong','',hit.title),node('span','',hit.snippet));
      button.addEventListener('click',()=>{
        if (session.getView().material.id !== hit.materialId) {
          session.selectMaterial(hit.materialId); paintMaterial();
          records.mutate({type:'open',materialId:hit.materialId});
        }
        articleResultsOpen = false; updateArticleResults();
        const target = hit.kind === 'title' ? articleScroll.querySelector('.article-title') :
          hit.kind === 'target' ? [...articleScroll.querySelectorAll('[data-occurrence-id]')].find(b=>b.dataset.occurrenceId===hit.occurrenceId) :
          articleScroll.querySelector(`[data-paragraph-index="${hit.paragraphIndex}"]`);
        locate(target, articleScroll);
      });
      articleResults.append(button);
    }
  }
  function searchArticle() { articleResultsOpen = true; updateArticleResults(); articleScroll.scrollTop = 0; }
  articleQuery.addEventListener('input',event=>{if (!event.isComposing) searchArticle();});
  articleQuery.addEventListener('compositionend',searchArticle);
  clearArticle.addEventListener('click',()=>{articleQuery.value='';updateArticleResults();articleQuery.focus({preventScroll:true});});
  articleResultsToggle.addEventListener('click',()=>{articleResultsOpen=!articleResultsOpen;updateArticleResults();if(articleResultsOpen)articleScroll.scrollTop=0;});

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
  const editDialog=node('dialog','meaning-dialog count-edit-dialog');editDialog.id='count-edit-dialog';
  editDialog.setAttribute('aria-labelledby','count-edit-title');
  const editForm=node('form');
  const editTitle=node('h2','','编辑次数');editTitle.id='count-edit-title';
  const editLabel=node('label','control-label','没记住总次数');editLabel.htmlFor='count-edit-value';
  const editValue=node('input','search-input');editValue.id='count-edit-value';editValue.type='number';editValue.min='0';editValue.max=String(Number.MAX_SAFE_INTEGER);editValue.step='1';editValue.required=true;
  const editStatus=node('p','meaning-note');editStatus.id='count-edit-status';editStatus.setAttribute('role','status');
  const editActions=node('div','edit-actions');
  const editSave=node('button','quiet-button','保存次数');editSave.type='submit';editSave.id='save-count-edit';
  const editCancel=node('button','quiet-button','取消');editCancel.type='button';editCancel.id='cancel-count-edit';
  const editRetry=node('button','quiet-button','重试保存');editRetry.type='button';editRetry.id='retry-count-edit';editRetry.hidden=true;
  const editRefresh=node('button','quiet-button','刷新当前次数');editRefresh.type='button';editRefresh.id='refresh-count-edit';editRefresh.hidden=true;
  editActions.append(editSave,editCancel,editRetry,editRefresh);editForm.append(editTitle,editLabel,editValue,editStatus,editActions);editDialog.append(editForm);layout.append(editDialog);
  let editEntry,editTarget,editBaseline=null,editOriginal=0,editOperationId=null,refreshEdit=false;
  function loadEditValue(){
    editOriginal=session.getView().counts[editEntry]||0;editValue.value=String(editOriginal);
    editBaseline=recordState.view.entryVersions?.reading?.[editEntry]||null;
    editOperationId=null;editStatus.textContent='';editRetry.hidden=true;editRefresh.hidden=true;editCancel.textContent='取消';
  }
  function openCountEdit(entry,target){
    editEntry=entry.id;editTarget=target;editTitle.textContent=`编辑编号 ${String(entry.number).padStart(3,'0')} 的次数`;
    loadEditValue();editSave.disabled=false;editValue.disabled=false;editCancel.disabled=false;editDialog.showModal();editValue.focus();editValue.select();
  }
  editCancel.addEventListener('click',()=>editDialog.close());
  editDialog.addEventListener('cancel',event=>{if(recordState.busy && editOperationId)event.preventDefault();});
  editDialog.addEventListener('close',()=>{
    for(const target of [editTarget,retryRecords,wordQuery]){
      if(!target?.isConnected || target.disabled || !target.getClientRects().length || getComputedStyle(target).visibility!=='visible')continue;
      target.focus({preventScroll:true});
      if(document.activeElement!==target)continue;
      if(wordScroll.contains(target)){
        const bounds=wordScroll.getBoundingClientRect(),rect=target.getBoundingClientRect();
        if(rect.top<bounds.top)wordScroll.scrollTop+=rect.top-bounds.top;
        else if(rect.bottom>bounds.bottom)wordScroll.scrollTop+=rect.bottom-bounds.bottom;
      }
      break;
    }
  });
  editForm.addEventListener('submit',event=>{
    event.preventDefault();
    const count=Number(editValue.value);
    if(!editForm.reportValidity() || !Number.isSafeInteger(count)||count<0)return;
    if(count===editOriginal){editDialog.close();return;}
    editSave.disabled=true;editValue.disabled=true;editCancel.disabled=true;
    editOperationId=records.mutate({type:'set_count',entryId:editEntry,count,expectedLastOperationId:editBaseline});
  });
  editRetry.addEventListener('click',()=>records.retry());
  editRefresh.addEventListener('click',()=>{refreshEdit=true;void records.refresh();});

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
    countOperator.disabled=!view.recordsReady || !!recordState.error;
    countThreshold.disabled=countOperator.disabled;
    for(const row of wordScroll.querySelectorAll('[data-entry-id]')) {
      const count=row.querySelector('.forget-count');const value=view.counts?.[row.dataset.entryId]||0;
      count.textContent=value?`${value}次`:'';count.hidden=!value;
      const unavailable=!view.recordsReady||recordState.busy||!!recordState.error||recordState.pending>0;
      row.querySelector('[data-forget]').disabled=unavailable;
      row.querySelector('[data-undo]').disabled=unavailable||!view.undoable?.[row.dataset.entryId];
      row.querySelector('[data-edit-count]').disabled=unavailable;
    }
    const used=view.history?.[view.material.id];
    history.textContent=!view.recordsReady?'学习记录尚未读取':used?`打开 ${used.opens} 次 · 最近 ${new Date(used.lastOpened).toLocaleString('zh-CN',{hour12:false})}`:'这篇尚无主动打开记录';
  }

  function entryRow(entry, parentId) {
    const row = node('tr', parentId ? 'extra-row' : 'main-row');
    row.dataset.entryId = entry.id;
    if (parentId) row.dataset.extraParent = parentId;
    else { row.dataset.number = entry.number; row.dataset.groupId = entry.id; }
    const number = String(entry.number).padStart(3, '0');
    const numberCell=node('td','word-number',number);
    const count=node('span','forget-count');count.setAttribute('aria-label',`编号${number}没记住次数`);numberCell.append(count);
    row.append(numberCell);
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
    const memory=node('div','memory-controls');
    const add=node('button','quiet-button','没记住+1');add.type='button';add.dataset.forget=entry.id;add.setAttribute('aria-label',`编号${number}没记住加一`);
    add.addEventListener('click',()=>records.mutate({type:'forget',entryId:entry.id}));
    const undo=node('button','quiet-button','撤销');undo.type='button';undo.dataset.undo=entry.id;undo.setAttribute('aria-label',`撤销编号${number}最近一次增加`);
    undo.addEventListener('click',()=>records.mutate({type:'undo',entryId:entry.id,targetOperationId:session.getView().undoable[entry.id]}));
    const edit=node('button','quiet-button','编辑次数');edit.type='button';edit.dataset.editCount=entry.id;edit.setAttribute('aria-label',`编辑编号${number}的次数`);
    edit.addEventListener('click',()=>openCountEdit(entry,edit));
    memory.append(add,undo,edit);controls.append(memory);
    row.append(meanings, controls);
    return row;
  }

  function paintWords() {
    const view = session.getView();
    scope.value = view.scope; grade.value = view.filters.grade;
    countOperator.value=view.countFilter?.operator||'off';
    if(view.countFilter)countThreshold.value=String(view.countFilter.threshold);
    if (wordQuery.value !== view.filters.query) wordQuery.value = view.filters.query;
    range.textContent = `${view.scope === 'current' ? '本篇' : '样本'} ${view.groups.length} 组`;
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
    const results = node('div','search-results word-results');
    results.hidden = !view.filters.query.trim() || !wordResultsOpen;
    for (const match of view.matches) {
      const button = node('button','quiet-button word-search-result',`定位 ${String(match.number).padStart(3,'0')}`);
      button.type='button'; button.dataset.locateEntry=match.entryId;
      button.addEventListener('click',()=>locateEntry(match)); results.append(button);
    }
    wordResultsToggle.hidden = !view.filters.query.trim();
    wordResultsToggle.textContent = `${wordResultsOpen ? '收起' : '显示'}${view.matches.length}个定位结果`;
    const empty = node('div','search-empty');
    empty.hidden = view.groups.length !== 0;
    empty.append(node('p','','没有匹配词组。可清除关键词或P档条件。'));
    const clearFilters = node('button','quiet-button','清除词表筛选'); clearFilters.type='button';
    clearFilters.addEventListener('click',()=>{session.setFilters({grade:'all',query:''});session.setCountFilter(null);countThreshold.value='0';paintWords();});
    empty.append(clearFilters);
    wordScroll.replaceChildren(recordBar, results, empty, table);
    syncWords();
  }

  function searchWords() {
    if (!wordQuery.value.trim()) { clearWordSearch(); return; }
    session.setFilters({query:wordQuery.value}); wordResultsOpen=true; lastLocatedEntry=undefined;
    paintWords(); wordScroll.scrollTop=0;
  }
  wordQuery.addEventListener('input',event=>{if (!event.isComposing) searchWords();});
  wordQuery.addEventListener('compositionend',searchWords);
  scope.addEventListener('change',()=>{session.setScope(scope.value);paintWords();wordScroll.scrollTop=0;});
  grade.addEventListener('change',()=>{session.setFilters({grade:grade.value});paintWords();wordScroll.scrollTop=0;});
  function filterCounts(){
    if(countOperator.value!=='off' && (!countThreshold.validity.valid || countThreshold.value===''))return;
    session.setCountFilter(countOperator.value==='off'?null:{operator:countOperator.value,threshold:Number(countThreshold.value)});
    paintWords();wordScroll.scrollTop=0;
  }
  countOperator.addEventListener('change',filterCounts);countThreshold.addEventListener('input',filterCounts);
  function clearWordSearch() {
    const old = [...wordScroll.querySelectorAll('[data-entry-id]')].find(r=>r.dataset.entryId===lastLocatedEntry);
    const top = old?.getBoundingClientRect().top;
    session.setFilters({query:''});paintWords();
    const row = [...wordScroll.querySelectorAll('[data-entry-id]')].find(r=>r.dataset.entryId===lastLocatedEntry);
    if (row && top !== undefined) wordScroll.scrollTop += row.getBoundingClientRect().top-top;
  }
  clearWord.addEventListener('click',()=>{ clearWordSearch(); wordQuery.focus({preventScroll:true}); });
  wordResultsToggle.addEventListener('click',()=>{
    wordResultsOpen=!wordResultsOpen;
    wordScroll.querySelector('.word-results').hidden=!wordResultsOpen;
    wordResultsToggle.textContent=`${wordResultsOpen?'收起':'显示'}${session.getView().matches.length}个定位结果`;
    if(wordResultsOpen)wordScroll.scrollTop=0;
  });

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
    const { material } = session.getView();
    const article = node('article', 'article-body');
    const heading = node('h3', 'article-title', material.title);
    heading.lang = 'en';
    const numbers = material.targetGroupIds.map(id=>String(id.split(':')[1]).padStart(3,'0')).join('、');
    article.append(heading, node('p', 'article-coverage', `目标原编号 ${numbers}`),
      node('p', 'article-extra', '本篇未额外选入派生词、特殊形式或词块。'));
    material.paragraphs.forEach((paragraph, index) => {
      const plain = paragraph.replaceAll('`', '');
      const p = node('p', 'article-paragraph');
      p.dataset.paragraphIndex = index;
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
    articleScroll.replaceChildren(articleResults, article);
    updateArticleResults();
    syncHighlight();
  }

  function paintMaterial() {
    if (dialog.open) dialog.close();
    if(editDialog.open)editDialog.close();
    countThreshold.value='0';
    select.value = session.getView().material.id;
    lastLocatedEntry=undefined; wordResultsOpen=true;
    paintWords();
    paintArticle();
    wordScroll.scrollTop = 0;
    articleScroll.scrollTop = 0;
  }
  select.addEventListener('change', () => { session.selectMaterial(select.value); paintMaterial();records.mutate({type:'open',materialId:select.value}); });
  globalSelect.addEventListener('change', () => { session.setVisibility('all', globalSelect.value); syncWords(); });
  highlight.addEventListener('change', () => { session.setTargetHighlight(highlight.checked); syncHighlight(); });
  reset.addEventListener('click', () => { session.resetView(); articleQuery.value=''; articleResultsOpen=true; resize(0.46); paintMaterial(); });

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
  records.subscribe(state=>{
    recordState=state;
    const oldGroups=session.getView().groups.map(g=>g.id).join(',');
    if(state.view)session.setRecords(state.view);
    const newGroups=session.getView().groups.map(g=>g.id).join(',');
    const position=wordScroll.scrollTop;
    if(oldGroups!==newGroups)paintWords();else syncWords();
    wordScroll.scrollTop=position;
    recordStatus.textContent=state.error?`未完成：${state.error}`:state.busy?(state.pending?'正在保存…':'正在读取记录…'):state.view?'记录已保存（本机）':'记录不可用';
    if(editDialog.open){
      if(editOperationId && state.completedOperationId===editOperationId){editDialog.close();}
      else if(refreshEdit && !state.busy && !state.error){refreshEdit=false;loadEditValue();editValue.disabled=false;editSave.disabled=false;editValue.focus();}
      else if(editOperationId){
        editStatus.textContent=state.error||'正在保存次数…';
        const conflict=state.failedOperationId===editOperationId&&state.failureCode==='COUNT_CONFLICT';
        editRefresh.hidden=!conflict;editRefresh.disabled=state.busy;
        editRetry.hidden=!state.error||conflict;editRetry.disabled=state.busy;
        editCancel.disabled=state.busy;editCancel.textContent=state.error?'关闭窗口':'取消';
      }
    }
    retryRecords.hidden=!state.error;retryRecords.disabled=state.busy;
    refreshRecords.disabled=state.busy||state.pending>0;
    exportRecords.disabled=state.busy||state.pending>0||!!state.error||!state.view;
  });
  retryRecords.addEventListener('click',()=>records.retry());
  refreshRecords.addEventListener('click',()=>void records.refresh());
  exportRecords.addEventListener('click',()=>void records.download().catch(error=>{recordStatus.textContent=`导出失败：${error.message}`;}));
  window.addEventListener('focus',()=>void records.refresh());
  return layout;
}

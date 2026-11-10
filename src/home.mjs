export function homeView(onNavigate) {
  const main = document.createElement('main');
  main.className = 'home';
  const intro = document.createElement('div');
  intro.className = 'home-intro';
  const heading = document.createElement('h1');
  heading.textContent = '今天，从哪里开始？';
  const sub = document.createElement('p');
  sub.textContent = '选一个模块，开始学习。';
  intro.append(heading, sub);
  const grid = document.createElement('div');
  grid.className = 'module-grid';
  const modules = [
    ['reading', '阅读', '在文章与词表之间，理解每一个意思。', 'Read'],
    ['listening', '听力', '听原音，记录目标词的出现顺序。', 'Listen'],
    ['writing', '写作', '从中文提示，回忆准确的英文表达。', 'Write'],
    ['speaking', '口语', '听示范、跟读，留下自己的声音。', 'Speak'],
  ];
  for (const [id, title, description, english] of modules) {
    const button = document.createElement('button');
    button.className = `module module-${id}`;
    button.type = 'button';
    button.setAttribute('aria-label', title);
    const name = document.createElement('span');
    name.className = 'module-name';
    name.textContent = title;
    const word = document.createElement('span');
    word.className = 'module-english';
    word.lang = 'en';
    word.textContent = english;
    const caption = document.createElement('span');
    caption.className = 'module-caption';
    caption.textContent = description;
    button.append(name, word, caption);
    button.addEventListener('click', () => onNavigate(id));
    grid.append(button);
  }
  const note = document.createElement('p');
  note.className = 'home-note';
  note.textContent = '当前可体验阅读 · 原编号 001—200 · 10篇文章';
  main.append(intro, grid, note);
  return main;
}

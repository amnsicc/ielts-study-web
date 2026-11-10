import { homeView } from './home.mjs';
import { readingView } from './reading/view.mjs';
import { createReadingSession } from './reading/session.mjs';
import { createRecordsClient } from './records/client.mjs';

const app = document.querySelector('#app');
try {
  const [catalog, materials] = await Promise.all(['catalog', 'materials'].map(async name => {
    const response = await fetch(`/data/${name}.json`);
    if (!response.ok) throw new Error(`无法读取${name}资料（${response.status}）`);
    return response.json();
  }));
  const session = createReadingSession(catalog, materials);
  const records = createRecordsClient();
  void records.refresh();
  const header = document.createElement('header');
  header.className = 'app-header';
  const brand = document.createElement('a');
  brand.href = '#/';
  brand.className = 'brand';
  brand.textContent = '雅思学习区';
  const breadcrumb = document.createElement('span');
  breadcrumb.className = 'breadcrumb';
  const back = document.createElement('a');
  back.href = '#/';
  back.className = 'back-link';
  back.textContent = '返回首页';
  const sample = document.createElement('span');
  sample.className = 'sample-label';
  sample.textContent = '原编号 001—200';
  header.append(brand, breadcrumb, sample, back);
  const content = document.createElement('div');
  content.className = 'app-content';
  app.replaceChildren(header, content);
  let reading;
  let readingScroll = [0, 0];
  function route() {
    const name = location.hash.replace(/^#\/?/, '') || 'home';
    if (reading?.isConnected && name !== 'reading') {
      reading.querySelector('dialog[open]')?.close();
      readingScroll = [...reading.querySelectorAll('#word-scroll, #article-scroll')].map(element => element.scrollTop);
    }
    back.hidden = name === 'home';
    breadcrumb.textContent = name === 'reading' ? '/ 阅读' : '';
    if (name === 'home') {
      content.replaceChildren(homeView(id => {
        if(id==='reading')records.mutate({type:'open',materialId:session.getView().material.id});
        location.hash = `/${id}`;
      }));
    } else if (name === 'reading') {
      reading ??= readingView(session, materials, records);
      content.replaceChildren(reading);
      [...reading.querySelectorAll('#word-scroll, #article-scroll')].forEach((element, index) => { element.scrollTop = readingScroll[index]; });
    } else {
      const panel = document.createElement('main');
      panel.className = 'unavailable';
      const title = document.createElement('h1');
      title.textContent = { listening: '听力', writing: '写作', speaking: '口语' }[name] || '页面未找到';
      const explanation = document.createElement('p');
      explanation.textContent = '这个模块尚未开放，请先体验阅读。';
      const link = document.createElement('a');
      link.href = '#/';
      link.className = 'return-button';
      link.textContent = '返回首页';
      panel.append(title, explanation, link);
      content.replaceChildren(panel);
    }
    document.title = name === 'reading' ? '阅读 · 雅思学习区' : '雅思学习区';
  }
  window.addEventListener('hashchange', route);
  route();
} catch (error) {
  const main = document.createElement('main');
  main.className = 'unavailable';
  const title = document.createElement('h1');
  title.textContent = '学习资料未能打开';
  const message = document.createElement('p');
  message.textContent = `${error.message}。请确认从 start.cmd 启动的本机地址打开，再刷新页面。`;
  main.append(title, message);
  app.replaceChildren(main);
  console.error(error);
}

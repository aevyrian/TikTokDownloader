import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const view = require('../app/static/task-view.js');
const webSource = readFileSync(new URL('../app/static/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../app/static/index.html', import.meta.url), 'utf8');
const { taskTitle } = require('../app/static/app.js');
const tasks = [
  { id: 'running', kind: 'author', status: 'downloading', total: 20, completed: 6, preview: [{ nickname: '山野慢镜头' }] },
  { id: 'failed', kind: 'author', status: 'failed', total: 10, completed: 2, preview: [{ nickname: '城市漫游' }] },
  { id: 'confirm', kind: 'detail', status: 'awaiting_confirmation', total: 1, completed: 0, preview: [{ desc: '海边' }] },
  { id: 'done', kind: 'author', status: 'completed', total: 2, completed: 2, preview: [{ nickname: '摄影笔记' }] },
  { id: 'paused', kind: 'detail', status: 'paused', total: 2, completed: 1, preview: [{ desc: '稍后继续' }] }
];
assert.deepEqual(view.filterTasks(tasks, 'attention', '', taskTitle).map(t => t.id), ['failed', 'confirm']);
assert.deepEqual(view.filterTasks(tasks, 'active', '稍后', taskTitle).map(t => t.id), ['paused']);
assert.equal(view.selectedTask(view.filterTasks(tasks, 'all', '山野', taskTitle), 'failed').id, 'running');
assert.equal(view.selectedTask([], 'failed'), undefined);

class Element {
  constructor(tag = 'div', text = '') { this.tagName = tag; this.textContent = text; this.className = ''; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.events = {}; this.value = ''; this.hidden = false; this.open = false; this.classList = { add: name => { this.className += ` ${name}`; } }; }
  append(...items) { this.children.push(...items); }
  prepend(...items) { this.children.unshift(...items); }
  replaceChildren(...items) { this.children = [...items]; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
  get lastElementChild() { return this.children.at(-1); }
  querySelector(selector) { return this.children.find(n => selector.startsWith('.') ? n.className.split(' ').includes(selector.slice(1)) : n.tagName === selector) || this.children.map(n => n.querySelector?.(selector)).find(Boolean); }
  click() { this.events.click?.({ target: this }); }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function fixture({ saved = null, readError = false, writeError = false } = {}) {
  const ids = Object.fromEntries(['task-list', 'task-detail', 'task-detail-dialog', 'task-dialog-body', 'task-query', 'task-filters', 'task-summary', 'task-layout-note', 'task-dialog-close', 'task-result-count', 'task-table-heading', 'open-submit'].map(id => [id, new Element()]));
  const choices = ['a', 'b'].map(value => { const button = new Element('button'); button.dataset.taskLayoutChoice = value; return button; });
  const writes = [];
  globalThis.document = { getElementById: id => ids[id], createElement: tag => new Element(tag) };
  globalThis.localStorage = { getItem() { if (readError) throw Error('Storage unavailable'); return saved; }, setItem(key, value) { if (writeError) throw Error('Storage unavailable'); saved = value; writes.push([key, value]); } };
  globalThis.matchMedia = () => ({ matches: false });
  let requests = 0;
  globalThis.fetch = () => { requests++; throw Error('A layout change must not call the network'); };
  const application = new Element();
  const makeTaskCard = task => { const card = new Element('article'); card.task = task; const actions = new Element('div'); actions.className = 'record-actions'; card.append(actions); return card; };
  const controller = view.create({ root: { querySelectorAll: () => choices }, application, makeTaskCard, title: taskTitle, statusNames: {}, formatDate: () => '刚刚' });
  return { ids, choices, application, controller, writes, requests: () => requests };
}

try {
  const normal = fixture();
  assert.equal(normal.application.dataset.taskLayout, 'a');
  normal.controller.update(tasks);
  assert.deepEqual(normal.writes, []);
  normal.ids['task-list'].children[0].querySelector('.record-actions').children.at(-1).click();
  assert.equal(normal.requests(), 0);
  normal.ids['task-query'].value = '山野';
  normal.ids['task-query'].events.input();
  assert.equal(normal.ids['task-detail'].children[1].task.id, 'running', '详情必须跟随可见搜索结果');
  normal.ids['task-query'].value = '';
  normal.ids['task-filters'].children.find(button => button.dataset.filter === 'completed').click();
  assert.equal(normal.ids['task-detail'].children[1].task.id, 'done', '筛选后不能继续显示已隐藏任务');
  const row = normal.ids['task-list'].children[0];
  normal.controller.update(structuredClone(tasks));
  assert.equal(normal.ids['task-list'].children[0], row, '重复轮询保留当前渲染与选择');
  normal.ids['task-query'].value = '不存在'; normal.ids['task-query'].events.input();
  assert.equal(normal.ids['task-detail'].hidden, true);
  assert.equal(fixture({ saved: 'b' }).application.dataset.taskLayout, 'a', '旧B偏好必须回到A');
  assert.equal(fixture({ saved: 'invalid' }).application.dataset.taskLayout, 'a');
  const unavailable = fixture({ readError: true, writeError: true });
  assert.equal(unavailable.application.dataset.taskLayout, 'a');
  assert.equal(unavailable.requests(), 0);
} finally {
  delete globalThis.document; delete globalThis.localStorage; delete globalThis.matchMedia; delete globalThis.fetch;
}

// Exercise the existing action callbacks rather than duplicating their routing rules.
const calls = [];
const cardContext = vm.createContext({
  element: (tag, className, text) => { const node = new Element(tag, text); node.className = className; return node; },
  taskTitle, statusNames: {}, formatDate: () => '刚刚',
  action: (label, callback) => { const node = new Element('button', label); node.invoke = callback; return node; },
  api: async (url, method) => { calls.push({ url, method }); }, loadTasks: async () => {}
});
const cardFunction = webSource.slice(webSource.indexOf('  function taskCard(task)'), webSource.indexOf('  const taskView ='));
assert.ok(cardFunction.startsWith('  function taskCard(task)'));
vm.runInContext(`${cardFunction}\nglobalThis.makeCard = taskCard;`, cardContext);
for (const [status, label, suffix] of [['failed', '重试', 'retry'], ['queued', '取消任务', 'cancel'], ['awaiting_confirmation', '接受此任务原项目优选', 'confirm'], ['awaiting_confirmation', '取消此任务', 'cancel']]) {
  const card = cardContext.makeCard({ id: 'task/a', status, kind: 'detail', link: 'https://www.douyin.com/video/123', preview: [] });
  await card.querySelector('.record-actions').children.find(node => node.textContent === label).invoke();
  assert.deepEqual(calls.at(-1), { url: `/api/tasks/task%2Fa/${suffix}`, method: 'POST' });
}
const taskScript = html.indexOf('src="/static/task-view.js?'), appScript = html.indexOf('src="app.js?');
assert.ok(taskScript >= 0 && appScript > taskScript, '任务模块必须走静态目录并先于app初始化');
console.log('Task view checks passed: fixed A, legacy B preference, dialog selection, polling, and shared API actions.');

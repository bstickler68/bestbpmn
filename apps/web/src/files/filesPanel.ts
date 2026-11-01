import type { TFunction } from '@bestbpmn/i18n';
import type { FilesController } from './controller';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function button(text: string, onClick: () => unknown, className = '') {
  const node = el('button', { type: 'button', textContent: text, className });
  node.addEventListener('click', () => void onClick());
  return node;
}

/** Reiter „Dateien“: Name, Arbeitsordner und die Modelldateien darin mit ihren Sperren. */
export function renderFilesPanel(container: HTMLElement, files: FilesController, t: TFunction): void {
  container.innerHTML = '';
  container.append(el('h2', { textContent: t('files.title') }));

  if (!files.supported) {
    container.append(el('p', { className: 'settings-hint', textContent: t('files.unsupported') }));
    return;
  }

  // Name für die Sperrdatei
  const user = el('input', { id: 'user-name', type: 'text', value: files.user, placeholder: t('files.userPlaceholder') });
  user.addEventListener('change', () => files.setUser(user.value));
  container.append(el('label', { className: 'settings-row' }, `${t('files.user')} `, user));

  // Ordner
  const folder = el('div', { className: 'files-folder' });
  if (!files.folder) {
    folder.append(
      el('p', { className: 'settings-hint', textContent: t('files.noFolder') }),
      el('div', { className: 'settings-actions' }, button(t('files.pick'), () => files.pickFolder(), 'primary pick')),
    );
  } else if (files.permission !== 'granted') {
    folder.append(
      el('p', { className: 'settings-hint', textContent: t('files.permission', { folder: files.folder.name }) }),
      el(
        'div',
        { className: 'settings-actions' },
        button(t('files.allow', { folder: files.folder.name }), () => files.allowFolder(), 'primary allow'),
        button(t('files.pickOther'), () => files.pickFolder(), 'pick'),
      ),
    );
  } else {
    folder.append(
      el('p', { className: 'files-current' }, `${t('files.folder')}: `, el('strong', { textContent: files.folder.name })),
      el(
        'div',
        { className: 'settings-actions' },
        button(t('files.refresh'), () => files.refresh(), 'refresh'),
        button(t('files.saveAs'), () => files.saveAs(), 'save-as'),
        button(t('files.pickOther'), () => files.pickFolder(), 'pick'),
        button(t('files.forget'), () => files.forgetFolder(), 'forget'),
      ),
    );
  }
  container.append(folder);

  if (files.error) {
    container.append(el('p', { className: 'files-error', textContent: t('files.listError', { message: files.error }) }));
  }
  if (!files.workspace) {
    return;
  }
  if (files.files.length === 0) {
    container.append(el('p', { className: 'settings-hint', textContent: t('files.empty') }));
    return;
  }

  const list = el('ul', { className: 'files-list' });
  for (const file of files.files) {
    const open = button(file.name, () => files.openFile(file.name), 'file');
    open.dataset.file = file.name;
    const item = el('li', {}, open);
    if (file.name === files.fileName) {
      item.classList.add('current');
      open.setAttribute('aria-current', 'true');
    }
    const lock = file.lock;
    if (lock) {
      const own = lock.session === files.sessionId;
      const text = own
        ? t('files.ownLock')
        : files.isStale(lock)
          ? t('files.staleLock', { user: lock.user })
          : t('files.lock', { user: lock.user, since: files.time(Date.parse(lock.since)) });
      item.append(el('span', { className: `files-lock${own ? ' own' : ''}`, textContent: text }));
    }
    item.append(el('span', { className: 'files-time', textContent: files.time(file.lastModified) }));
    list.append(item);
  }
  container.append(list);
}

/** Hinweis über dem Diagramm, wenn die offene Datei nicht (mehr) gespeichert werden darf. */
export function renderBanner(container: HTMLElement, files: FilesController, t: TFunction): void {
  container.innerHTML = '';
  const session = files.session;
  if (!session?.file || !session.access || session.access === 'edit') {
    container.hidden = true;
    return;
  }
  const name = session.file;
  const lock = session.lock ?? { user: '?', session: '?', since: '', heartbeat: '' };
  let text: string;
  const actions: HTMLButtonElement[] = [];
  switch (session.access) {
    case 'locked':
      text = t('files.banner.locked', { name, user: lock.user, since: files.time(Date.parse(lock.since)) });
      actions.push(button(t('files.banner.retry'), () => files.retry(), 'retry'));
      break;
    case 'stale':
      text = t('files.banner.stale', { name, user: lock.user, heartbeat: files.time(Date.parse(lock.heartbeat)) });
      actions.push(button(t('files.banner.takeOver'), () => files.retry(true), 'take-over'));
      break;
    default:
      text = t('files.banner.lost', { name, user: lock.user });
      break;
  }
  actions.push(button(t('files.saveAs'), () => files.saveAs(), 'save-as'));
  container.append(el('span', { textContent: text }), ...actions);
  container.hidden = false;
}

import { REPO, BRANCH, BASE, validateSlug, validateURL, redirectHTML, titleFor, encodeContent, decodeContent } from './core.mjs';

const $ = id => document.getElementById(id);
let token = '';
let links = [];
let editing = null;
let publishing = null;
let toastTimer;
let loading = false;
let saving = false;
let connectedLogin = '';

function notify(message) {
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 3500);
}
function errorAt(id, message) {
  $(id).textContent = message;
  $(id).classList.toggle('hidden', !message);
}
function openConnection() {
  if (!$('connection-dialog').open) $('connection-dialog').showModal();
}
async function api(path, { method = 'GET', body, credential = token, allow404 = false } = {}) {
  // Fixed GitHub origin and repository paths: credentials never go to visitor-provided destinations.
  if (!(path === '/user' || path === `/repos/${REPO}` || path.startsWith(`/repos/${REPO}/`))) throw new Error('Unsupported repository request.');
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' };
  if (credential) headers.Authorization = `Bearer ${credential}`;
  if (body) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(method === 'GET' ? 20000 : 45000)
    });
  } catch {
    throw new Error(method === 'GET' ? 'Could not reach GitHub. Check your connection and try again.' : 'GitHub did not confirm the save. Refresh the library and check the repository before trying again.');
  }
  if (allow404 && response.status === 404) return null;
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) throw new Error('GitHub rejected the token. Reconnect with a valid token.');
    if (response.status === 403) throw new Error('GitHub denied this request. Check token permissions, repository access, branch rules, or the API rate limit.');
    if ([409, 422].includes(response.status)) throw new Error('This link changed or the name is already in use. Refresh the library before trying again.');
    throw new Error(`GitHub could not complete the request (${response.status}). ${result.message || ''}`);
  }
  return result;
}
function destinationFrom(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const meta = [...doc.querySelectorAll('meta[http-equiv]')].find(m => m.getAttribute('http-equiv').toLowerCase() === 'refresh');
  const content = meta?.getAttribute('content') || '';
  const raw = content.match(/;\s*url\s*=\s*(.*)$/i)?.[1] || doc.querySelector('a[href]')?.getAttribute('href');
  if (!raw) return null;
  try { return validateURL(raw.replace(/^["']|["']$/g, '')); } catch { return null; }
}
async function readLink(entry) {
  const file = await api(`/repos/${REPO}/contents/${entry.path}?ref=${encodeURIComponent(BRANCH)}`);
  const url = destinationFrom(decodeContent(file.content));
  if (!url) return null;
  const slug = entry.path.split('/')[0];
  return { slug, title: titleFor(slug), url, sha: file.sha };
}
async function refresh() {
  if (loading || saving) return;
  loading = true;
  $('refresh').disabled = true;
  $('links').setAttribute('aria-busy', 'true');
  $('source-status').textContent = 'Syncing with GitHub…';
  try {
    const tree = await api(`/repos/${REPO}/git/trees/${BRANCH}?recursive=1`);
    if (tree.truncated) throw new Error('The repository listing was incomplete.');
    const files = tree.tree.filter(e => e.type === 'blob' && /^[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html$/.test(e.path) && !e.path.startsWith('manage/'));
    const result = await Promise.all(files.map(readLink));
    links = result.filter(Boolean).sort((a,b) => a.slug.localeCompare(b.slug));
    $('source-status').classList.remove('warning');
    $('source-status').textContent = `Synced with GitHub · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch (error) {
    if (!links.length) {
      try {
        const res = await fetch('./links.json', { cache: 'no-store' });
        if (!res.ok) throw new Error();
        links = await res.json();
      } catch { /* Keep the visible error if even the bundled snapshot is unavailable. */ }
    }
    $('source-status').classList.add('warning');
    $('source-status').textContent = `${error.message} Showing the last available library; it may be out of date.`;
  } finally {
    loading = false;
    $('refresh').disabled = false;
    $('links').setAttribute('aria-busy', 'false');
    render();
  }
}
function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function render() {
  const query = $('search').value.trim().toLowerCase();
  const filtered = links.filter(l => `${l.slug} ${l.title} ${l.url}`.toLowerCase().includes(query));
  $('links').replaceChildren();
  $('total').textContent = links.length;
  $('nav-count').textContent = links.length;
  $('list-count').textContent = links.length;
  $('empty').classList.toggle('hidden', filtered.length > 0);
  for (const [i, link] of filtered.entries()) {
    const row = make('article', 'link-row');
    const body = make('div', 'link-body');
    const heading = make('h3', '', link.title);
    const short = make('a', 'short-link', `${BASE.replace('https://','')}${link.slug}/`);
    short.href = `${BASE}${link.slug}/`;
    short.target = '_blank'; short.rel = 'noopener noreferrer';
    const dest = make('a', 'destination', `→ ${link.url}`);
    dest.href = link.url; dest.target = '_blank'; dest.rel = 'noopener noreferrer'; dest.title = link.url;
    body.append(heading, short, dest);
    const actions = make('div', 'row-actions');
    const copy = make('button', '', 'Copy');
    copy.setAttribute('aria-label', `Copy ${link.title} short link`);
    copy.addEventListener('click', () => copyText(`${BASE}${link.slug}/`));
    const edit = make('button', 'edit-button', 'Edit');
    edit.setAttribute('aria-label', `Edit ${link.title} destination`);
    edit.addEventListener('click', () => editLink(link));
    actions.append(copy, edit);
    row.append(make('span', 'link-index', String(i+1).padStart(2,'0')), body, actions);
    $('links').append(row);
  }
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); notify('Short link copied.'); }
  catch { notify('Copy is unavailable here. Select and copy the displayed link.'); }
}
function updatePreview() {
  $('preview').replaceChildren(document.createTextNode(BASE.replace('https://','')),
    make('strong', '', `${$('slug').value || 'your-name'}/`));
}
function editLink(link) {
  if (saving) return;
  editing = { ...link };
  $('slug').value = link.slug;
  $('slug').disabled = true;
  $('destination').value = link.url;
  $('form-heading').textContent = 'A new destination.';
  $('form-description').textContent = 'Keep your short link. Update where it leads.';
  $('submit').replaceChildren(document.createTextNode('Save destination'), make('span', '', '↗'));
  $('cancel-edit').classList.remove('hidden');
  $('form-note').textContent = 'The short link and existing QR codes stay the same.';
  errorAt('form-error', '');
  updatePreview();
  $('link-form').scrollIntoView({ block: 'center', behavior: 'auto' });
  $('destination').focus();
}
function resetForm() {
  if (saving) return;
  editing = null;
  $('link-form').reset();
  $('slug').disabled = false;
  $('form-heading').textContent = 'Make it a short link.';
  $('form-description').textContent = 'Paste a destination. Give it a name. We’ll take care of the rest.';
  $('submit').replaceChildren(document.createTextNode('Create short link'), make('span', '', '↗'));
  $('cancel-edit').classList.add('hidden');
  $('form-note').textContent = token ? 'Your change will be saved to GitHub, then published by Pages.' : 'Connect GitHub to publish. Browsing is open to everyone.';
  errorAt('form-error', '');
  updatePreview();
}
function connectionUI() {
  $('connection-label').textContent = token ? 'GitHub connected' : 'Connect GitHub';
  $('connect').classList.toggle('connected', !!token);
  $('connect-form').classList.toggle('hidden', !!token);
  $('connected-state').classList.toggle('hidden', !token);
  $('connected-as').textContent = token ? `Connected as ${connectedLogin}. Access is limited by your account and token permissions.` : '';
  if (!editing) $('form-note').textContent = token ? 'Your change will be saved to GitHub, then published by Pages.' : 'Connect GitHub to publish. Browsing is open to everyone.';
}
$('connect-form').addEventListener('submit', async event => {
  event.preventDefault();
  const candidate = $('token').value.trim();
  $('token').value = '';
  if (!candidate) return;
  $('connect-submit').disabled = true;
  errorAt('connect-error', '');
  try {
    const user = await api('/user', { credential: candidate });
    const repo = await api(`/repos/${REPO}`, { credential: candidate });
    if (!repo.permissions?.push) throw new Error('This account does not have write access to ksrtlink/atk.');
    token = candidate;
    connectedLogin = user.login;
    connectionUI();
    $('connection-dialog').close();
    notify(`Connected as ${connectedLogin}. You can now save links.`);
    await refresh();
  } catch (error) { errorAt('connect-error', error.message); }
  finally { $('connect-submit').disabled = false; }
});
$('link-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (saving) return;
  errorAt('form-error', '');
  let slug, url;
  try {
    slug = validateSlug($('slug').value);
    url = validateURL($('destination').value);
    if (!editing && links.some(l => l.slug === slug)) throw new Error('That short link already exists. Choose a different name, or edit it in the library.');
  } catch (error) { errorAt('form-error', error.message); return; }
  if (!token) { openConnection(); return; }
  if (editing && !confirm(`Update ${BASE}${slug}/?\n\nNew destination:\n${url}\n\nExisting QR codes will open this destination after publishing.`)) return;
  saving = true;
  const action = editing ? 'Update' : 'Create';
  const wasEditing = !!editing;
  $('submit').disabled = true;
  $('destination').disabled = true;
  $('slug').disabled = true;
  $('cancel-edit').disabled = true;
  $('submit').textContent = 'Saving to GitHub…';
  try {
    const path = `/repos/${REPO}/contents/${slug}/index.html`;
    // Check the entire name, including non-redirect folders and root files, before any write.
    const occupied = await api(`/repos/${REPO}/contents/${slug}?ref=${BRANCH}`, { allow404: true });
    if (!wasEditing && occupied) throw new Error('That name is already used in the repository. Choose another.');
    let current = null;
    if (wasEditing) {
      current = await api(`${path}?ref=${BRANCH}`, { allow404: true });
      if (!current || !editing.sha || current.sha !== editing.sha)
        throw new Error('This link changed since the library loaded. Refresh the library, then reopen Edit.');
      if (destinationFrom(decodeContent(current.content)) === url) throw new Error('The destination has not changed.');
    }
    const result = await api(path, { method: 'PUT', body: {
      message: `${action} short link: ${slug}`, branch: BRANCH,
      content: encodeContent(redirectHTML(url)), ...(current ? { sha: current.sha } : {})
    }});
    if (!result.commit?.sha || !result.content?.sha) throw new Error('GitHub returned an unexpected response. Check the repository before retrying.');
    const next = { slug, title: titleFor(slug), url, sha: result.content.sha };
    links = [...links.filter(l => l.slug !== slug), next].sort((a,b) => a.slug.localeCompare(b.slug));
    publishing = { slug, url };
    $('result-link').textContent = `${BASE}${slug}/`;
    $('result-link').href = `${BASE}${slug}/`;
    $('commit-link').href = `https://github.com/${REPO}/commit/${result.commit.sha}`;
    $('result-heading').textContent = wasEditing ? 'Your update is on its way.' : 'Your link is on its way.';
    $('publish-status').textContent = 'Saved successfully. GitHub Pages may take a few minutes to publish. Check before printing a QR code.';
    $('result').classList.remove('hidden');
    $('source-status').textContent = 'Change confirmed by GitHub · publishing not yet checked';
    $('source-status').classList.remove('warning');
    render();
    saving = false;
    resetForm();
    notify(wasEditing ? 'Destination saved to GitHub.' : 'Short link saved to GitHub.');
    await checkPublishing();
  } catch (error) { errorAt('form-error', error.message); }
  finally {
    saving = false;
    $('submit').disabled = false;
    $('destination').disabled = false;
    $('slug').disabled = !!editing;
    $('cancel-edit').disabled = false;
    $('submit').replaceChildren(document.createTextNode(editing ? 'Save destination' : 'Create short link'), make('span', '', '↗'));
  }
});
async function checkPublishing() {
  if (!publishing) return;
  $('check-publish').disabled = true;
  $('publish-status').textContent = 'Checking the published redirect…';
  const expected = { ...publishing };
  try {
    const response = await fetch(`${BASE}${expected.slug}/?publish-check=${Date.now()}`, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000) });
    const html = await response.text();
    if (response.ok && destinationFrom(html) === expected.url) {
      $('publish-status').textContent = 'Published. The live redirect matches your saved destination. Your link is ready to share.';
      $('result-heading').textContent = 'Ready for the world.';
    } else {
      $('publish-status').textContent = 'Saved to GitHub; the matching redirect is not live yet. Check again in a minute. If it stays pending, check the repository’s Pages deployment.';
    }
  } catch {
    $('publish-status').textContent = 'Saved to GitHub. Publishing could not be verified from this browser. Check the link and Pages deployment before printing.';
  } finally { $('check-publish').disabled = false; }
}
$('export').addEventListener('click', () => {
  const cell = value => `"${value.replace(/"/g, '""')}"`;
  const csv = ['Name,Short link,Destination', ...links.map(l => [l.title, `${BASE}${l.slug}/`, l.url].map(cell).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff',csv], { type: 'text/csv;charset=utf-8' }));
  const a = make('a'); a.href = url; a.download = 'atk-short-links.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('connect').addEventListener('click', openConnection);
$('close-connect').addEventListener('click', () => { $('connection-dialog').close(); $('token').value = ''; });
$('connection-dialog').addEventListener('close', () => { $('token').value = ''; errorAt('connect-error',''); });
$('disconnect').addEventListener('click', () => {
  token = ''; connectedLogin = ''; connectionUI(); $('connection-dialog').close(); notify('Disconnected. The token has been cleared.');
});
$('search').addEventListener('input', render);
$('refresh').addEventListener('click', refresh);
$('slug').addEventListener('input', updatePreview);
$('cancel-edit').addEventListener('click', resetForm);
$('nav-create').addEventListener('click', () => { resetForm(); $('destination').focus(); $('link-form').scrollIntoView({block:'center'}); });
$('clear-search').addEventListener('click', () => { $('search').value = ''; render(); $('search').focus(); });
$('copy-result').addEventListener('click', () => publishing && copyText(`${BASE}${publishing.slug}/`));
$('check-publish').addEventListener('click', checkPublishing);
// A back/forward cached tab must not retain a connection after leaving the manager.
window.addEventListener('pagehide', () => { token = ''; connectedLogin = ''; });
window.addEventListener('pageshow', connectionUI);
await refresh();

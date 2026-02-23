/* ════════════════════════════════════════
   BOARD.JS — Kanban board logic
   v3.1 — Multi-assignee support
   ════════════════════════════════════════ */

// ── STATE ─────────────────────────────────────────────────────────────────────
let allTasks        = [];
let draggedId       = null;
let activeChip      = 'all';
let smartSortActive = false;
let currentUser     = '';

// ── DARK MODE ─────────────────────────────────────────────────────────────────
(function initTheme() {
  if (localStorage.getItem('tm-theme') === 'dark') document.body.classList.add('dark');
  document.addEventListener('DOMContentLoaded', updateThemeIcon);
})();

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('tm-theme', isDark ? 'dark' : 'light');
  updateThemeIcon();
}

function updateThemeIcon() {
  const btn = document.getElementById('themeBtn');
  if (!btn) return;
  btn.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
  btn.title       = document.body.classList.contains('dark') ? 'Modo claro' : 'Modo oscuro';
}

// ── AVATAR UTILS ──────────────────────────────────────────────────────────────
function nameToColor(name) {
  const palette = [
    '#6366f1','#8b5cf6','#ec4899','#14b8a6',
    '#f59e0b','#10b981','#3b82f6','#ef4444',
    '#f97316','#06b6d4','#84cc16','#a855f7',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function buildAvatar(name) {
  if (!name) return '';
  return `<span class="avatar" style="background:${nameToColor(name)}" title="${escHtml(name)}">${getInitials(name)}</span>`;
}

/** Render a row of avatars (up to 3 + overflow badge) for a participants array. */
function buildAvatarRow(participants) {
  if (!participants || participants.length === 0) return '';
  const MAX = 3;
  const shown   = participants.slice(0, MAX);
  const overflow = participants.length - MAX;
  let html = shown.map(n => buildAvatar(n)).join('');
  if (overflow > 0) {
    html += `<span class="avatar avatar-overflow" title="${escHtml(participants.slice(MAX).join(', '))}">+${overflow}</span>`;
  }
  return `<span class="avatar-row">${html}</span>`;
}

// ── PARTICIPANT TAG INPUT ─────────────────────────────────────────────────────
// A lightweight "tags" widget built directly into the existing form-input style.
// Uses a hidden input + visible tag chips + text field.

let _participantTags = []; // current tags in the modal

function initParticipantInput(initialTags = []) {
  _participantTags = [...initialTags];
  renderParticipantTags();
}

function renderParticipantTags() {
  const container = document.getElementById('participantTags');
  if (!container) return;
  container.innerHTML =
    _participantTags.map((name, i) => `
      <span class="ptag">
        <span class="ptag-av" style="background:${nameToColor(name)}">${getInitials(name)}</span>
        ${escHtml(name)}
        <button type="button" class="ptag-rm" onclick="removeParticipant(${i})" title="Quitar">×</button>
      </span>
    `).join('') +
    `<input type="text" id="participantInput" class="ptag-input"
       placeholder="${_participantTags.length === 0 ? 'Nombre y Enter...' : ''}"
       onkeydown="onParticipantKey(event)"
       onblur="commitParticipantInput()" />`;

  // Focus the text input
  const inp = document.getElementById('participantInput');
  if (inp) inp.focus();
}

function onParticipantKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    commitParticipantInput();
  } else if (e.key === 'Backspace' && e.target.value === '' && _participantTags.length > 0) {
    removeParticipant(_participantTags.length - 1);
  }
}

function commitParticipantInput() {
  const inp = document.getElementById('participantInput');
  if (!inp) return;
  const val = inp.value.trim();
  if (val && !_participantTags.includes(val)) {
    _participantTags.push(val);
    renderParticipantTags();
  } else if (val) {
    inp.value = '';
  }
}

function removeParticipant(index) {
  _participantTags.splice(index, 1);
  renderParticipantTags();
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadTasks();
  setupFilters();
  setupSmartSortToggle();
  updateThemeIcon();
});

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.href = '/pages/index.html'; return; }
    const data = await res.json();
    currentUser = data.userName || '';
    localStorage.setItem('tm-user', currentUser);
    document.getElementById('userChip').textContent  = currentUser;
    document.getElementById('teamLabel').textContent = data.teamName || 'Task Manager';
  } catch {
    window.location.href = '/pages/index.html';
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  localStorage.removeItem('tm-user');
  window.location.href = '/pages/index.html';
}

// ── LOAD & RENDER ─────────────────────────────────────────────────────────────
async function loadTasks() {
  try {
    const params = buildFilterParams();
    const res    = await fetch('/api/tasks?' + params.toString());
    if (res.status === 401) { window.location.href = '/pages/index.html'; return; }
    const data   = await res.json();
    allTasks     = data.tasks || [];
    applyChipAndRender();
    updateAssigneeFilter(allTasks);
    renderDailySummary(allTasks);
  } catch (err) {
    console.error('Error loading tasks:', err);
  }
}

function buildFilterParams() {
  const params   = new URLSearchParams();
  const search   = document.getElementById('searchInput').value.trim();
  const area     = document.getElementById('filterArea').value;
  const assigned = document.getElementById('filterAssigned').value;
  if (search)   params.set('search', search);
  if (area)     params.set('area', area);
  if (assigned) params.set('participant', assigned);
  return params;
}

// ── DAILY SUMMARY ─────────────────────────────────────────────────────────────
function renderDailySummary(tasks) {
  const panel = document.getElementById('dailySummary');
  if (!panel) return;

  const today = todayStr();
  const name  = currentUser || localStorage.getItem('tm-user') || 'vos';

  // "mine" = tasks where current user is a participant
  const myActive  = tasks.filter(t => t.status !== 'DONE' && isParticipant(t, currentUser));
  const myOverdue = myActive.filter(t => t.due_date && t.due_date < today);
  const myToday   = myActive.filter(t => t.due_date === today);
  const myUrgent  = myActive.filter(t => t.due_date && t.due_date <= today);

  const stats = [
    { label: 'Activas',  value: myActive.length,  icon: '📋', color: 'var(--text)' },
    { label: 'Vencidas', value: myOverdue.length,  icon: '🔴', color: '#dc2626' },
    { label: 'Hoy',      value: myToday.length,    icon: '📅', color: '#d97706' },
    { label: 'Urgentes', value: myUrgent.length,   icon: '⚡', color: '#7c3aed' },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  panel.innerHTML = `
    <div class="summary-inner">
      <div class="summary-greeting">
        <span class="summary-wave">👋</span>
        <div>
          <div class="summary-hello">${greeting}, <strong>${escHtml(name)}</strong>.</div>
          <div class="summary-sub">Hoy tenés:</div>
        </div>
      </div>
      <div class="summary-stats">
        ${stats.map(s => `
          <div class="summary-stat">
            <span class="summary-stat-icon">${s.icon}</span>
            <span class="summary-stat-value" style="color:${s.color}">${s.value}</span>
            <span class="summary-stat-label">${s.label}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ── QUICK FILTER CHIPS ────────────────────────────────────────────────────────
function setChip(chip) {
  activeChip = chip;
  document.querySelectorAll('.chip').forEach(el => {
    el.classList.toggle('chip-active', el.dataset.chip === chip);
  });
  applyChipAndRender();
}

function applyChipAndRender() {
  const today    = todayStr();
  const userName = currentUser || localStorage.getItem('tm-user') || '';
  let filtered   = [...allTasks];

  switch (activeChip) {
    case 'mine':
      filtered = allTasks.filter(t => isParticipant(t, userName));
      break;
    case 'urgent':
      filtered = allTasks.filter(t => t.status !== 'DONE' && t.due_date && t.due_date <= today);
      break;
    case 'overdue':
      filtered = allTasks.filter(t => t.status !== 'DONE' && t.due_date && t.due_date < today);
      break;
    case 'today':
      filtered = allTasks.filter(t => t.due_date === today);
      break;
    case 'unassigned':
      filtered = allTasks.filter(t => !t.participants || t.participants.length === 0);
      break;
    case 'all':
    default:
      filtered = [...allTasks];
      break;
  }

  renderBoard(filtered);
}

/** Returns true if `userName` appears in task.participants (case-insensitive). */
function isParticipant(task, userName) {
  if (!userName) return false;
  const norm = normalizeStr(userName);
  return (task.participants || []).some(p => normalizeStr(p) === norm);
}

// ── SMART SORT ────────────────────────────────────────────────────────────────
function setupSmartSortToggle() {
  const btn = document.getElementById('smartSortBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    smartSortActive = !smartSortActive;
    btn.classList.toggle('smart-sort-active', smartSortActive);
    btn.title = smartSortActive ? 'Desactivar orden inteligente' : 'Activar orden inteligente';
    applyChipAndRender();
  });
}

function smartSort(tasks) {
  const today = todayStr();
  return [...tasks].sort((a, b) => {
    const scoreA = getSortScore(a, today);
    const scoreB = getSortScore(b, today);
    if (scoreA !== scoreB) return scoreA - scoreB;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });
}

function getSortScore(task, today) {
  if (!task.due_date)        return 4;
  if (task.due_date < today) return 1;
  if (task.due_date === today) return 2;
  return 3;
}

// ── RENDER BOARD ──────────────────────────────────────────────────────────────
function renderBoard(tasks) {
  const cols = { TODO: [], DOING: [], DONE: [] };
  for (const t of tasks) {
    if (cols[t.status]) cols[t.status].push(t);
  }

  for (const [status, list] of Object.entries(cols)) {
    const container = document.getElementById(`cards-${status}`);
    const countEl   = document.getElementById(`count-${status}`);
    countEl.textContent = list.length;

    const sorted = smartSortActive ? smartSort(list) : list;

    if (sorted.length === 0) {
      container.innerHTML = `<div class="empty-col">Sin tareas</div>`;
      continue;
    }

    container.innerHTML = sorted.map(t => renderCard(t)).join('');

    container.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('dragstart', onDragStart);
      card.addEventListener('dragend',   onDragEnd);
    });
  }
}

function renderCard(task) {
  const isDone      = task.status === 'DONE';
  const today       = todayStr();
  const overdue     = task.due_date && !isDone && task.due_date < today;
  const isToday     = task.due_date === today && !isDone;
  const areaLabel   = { PRODUCCION: 'Producción', CONTENIDO: 'Contenido', DISENO: 'Diseño', ADMIN: 'Admin' };
  const avatarHtml  = buildAvatarRow(task.participants);
  const isMine      = isParticipant(task, currentUser);

  return `
    <div class="task-card ${isDone ? 'done' : ''} ${isMine ? 'my-task' : ''}"
         draggable="true"
         data-id="${task.id}"
         data-status="${task.status}"
         data-priority="${task.priority}">
      <div class="task-card-top">
        <div class="task-title">${escHtml(task.title)}</div>
        <div class="task-actions">
          ${!isDone ? `
          <button class="action-btn done-btn" title="Marcar como completada" onclick="markDone('${task.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>` : ''}
          <button class="action-btn" title="Editar" onclick="openModal('${task.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="action-btn delete-btn" title="Eliminar" onclick="openDelete('${task.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      ${task.description ? `<div class="task-desc">${escHtml(task.description)}</div>` : ''}
      <div class="task-meta">
        <span class="area-chip area-${task.area}">${areaLabel[task.area] || task.area}</span>
        ${avatarHtml}
        ${task.due_date ? `
        <span class="due-tag ${overdue ? 'overdue' : ''} ${isToday ? 'due-today' : ''}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${overdue ? '⚠ ' : ''}${isToday ? 'Hoy' : formatDate(task.due_date)}
        </span>` : ''}
      </div>
    </div>`;
}

function updateAssigneeFilter(tasks) {
  const select  = document.getElementById('filterAssigned');
  const current = select.value;
  // Collect all participant names across all tasks
  const names = [...new Set(
    tasks.flatMap(t => t.participants || [])
  )].sort();
  select.innerHTML = '<option value="">Todos los asignados</option>' +
    names.map(n => `<option value="${escHtml(n)}" ${n === current ? 'selected' : ''}>${escHtml(n)}</option>`).join('');
}

// ── FILTERS ───────────────────────────────────────────────────────────────────
function setupFilters() {
  let searchTimeout;
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadTasks, 300);
  });
  document.getElementById('filterArea').addEventListener('change', loadTasks);
  document.getElementById('filterAssigned').addEventListener('change', loadTasks);
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
function openModal(taskId = null) {
  const overlay = document.getElementById('modalOverlay');
  const modal   = overlay.querySelector('.modal');
  clearModalError();

  if (taskId) {
    const t = allTasks.find(x => x.id === taskId);
    if (!t) return;
    document.getElementById('modalTitle').textContent    = 'Editar tarea';
    document.getElementById('taskId').value              = t.id;
    document.getElementById('taskTitle').value           = t.title;
    document.getElementById('taskDescription').value     = t.description || '';
    document.getElementById('taskArea').value            = t.area;
    document.getElementById('taskStatus').value          = t.status;
    document.getElementById('taskDueDate').value         = t.due_date || '';
    document.getElementById('saveBtn').textContent       = 'Guardar cambios';
    initParticipantInput(t.participants || []);
  } else {
    document.getElementById('modalTitle').textContent    = 'Nueva tarea';
    document.getElementById('taskId').value              = '';
    document.getElementById('taskTitle').value           = '';
    document.getElementById('taskDescription').value     = '';
    document.getElementById('taskArea').value            = 'ADMIN';
    document.getElementById('taskStatus').value          = 'TODO';
    document.getElementById('taskDueDate').value         = '';
    document.getElementById('saveBtn').textContent       = 'Guardar tarea';
    // Pre-fill current user as first participant
    initParticipantInput(currentUser ? [currentUser] : []);
  }

  overlay.classList.remove('closing');
  modal.classList.remove('closing');
  overlay.classList.add('open');
  setTimeout(() => document.getElementById('taskTitle').focus(), 120);
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  const modal   = overlay.querySelector('.modal');
  overlay.classList.add('closing');
  modal.classList.add('closing');
  setTimeout(() => {
    overlay.classList.remove('open', 'closing');
    modal.classList.remove('closing');
  }, 150);
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

function clearModalError() {
  const el = document.getElementById('modalError');
  el.textContent = '';
  el.classList.remove('visible');
}

function showModalError(msg) {
  const el = document.getElementById('modalError');
  el.textContent = msg;
  el.classList.remove('visible');
  void el.offsetWidth;
  el.classList.add('visible');
}

async function saveTask() {
  // Commit any pending text in the participant input
  commitParticipantInput();

  clearModalError();
  const id      = document.getElementById('taskId').value;
  const title   = document.getElementById('taskTitle').value.trim();
  const saveBtn = document.getElementById('saveBtn');

  if (!title) { showModalError('El título es obligatorio.'); return; }

  const body = {
    title,
    description:    document.getElementById('taskDescription').value.trim(),
    area:           document.getElementById('taskArea').value,
    status:         document.getElementById('taskStatus').value,
    participantIds: _participantTags,
    due_date:       document.getElementById('taskDueDate').value || null,
  };

  saveBtn.disabled    = true;
  saveBtn.textContent = 'Guardando...';

  try {
    const res = id
      ? await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/tasks',        { method: 'POST',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    const data = await res.json();
    if (!res.ok) { showModalError(data.error || 'Error al guardar.'); return; }
    closeModal();
    await loadTasks();
  } catch {
    showModalError('Error de conexión.');
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = id ? 'Guardar cambios' : 'Guardar tarea';
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────
let deleteTargetId = null;

function openDelete(id) {
  deleteTargetId = id;
  const overlay = document.getElementById('deleteOverlay');
  const modal   = overlay.querySelector('.modal');
  overlay.classList.remove('closing');
  modal.classList.remove('closing');
  overlay.classList.add('open');
  document.getElementById('confirmDeleteBtn').onclick = confirmDelete;
}

function closeDelete() {
  const overlay = document.getElementById('deleteOverlay');
  const modal   = overlay.querySelector('.modal');
  overlay.classList.add('closing');
  modal.classList.add('closing');
  setTimeout(() => {
    overlay.classList.remove('open', 'closing');
    modal.classList.remove('closing');
    deleteTargetId = null;
  }, 150);
}

function closeDeleteOutside(e) {
  if (e.target === document.getElementById('deleteOverlay')) closeDelete();
}

async function confirmDelete() {
  if (!deleteTargetId) return;
  try {
    await fetch(`/api/tasks/${deleteTargetId}`, { method: 'DELETE' });
    closeDelete();
    await loadTasks();
  } catch (err) {
    console.error('Delete error:', err);
  }
}

// ── MARK DONE ─────────────────────────────────────────────────────────────────
async function markDone(id) {
  try {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DONE' }),
    });
    await loadTasks();
  } catch (err) {
    console.error('markDone error:', err);
  }
}

// ── DRAG & DROP ───────────────────────────────────────────────────────────────
function onDragStart(e) {
  if (smartSortActive) { e.preventDefault(); return; }
  draggedId = e.currentTarget.dataset.id;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.col-body').forEach(c => c.classList.remove('drag-over'));
}

function onDragOver(e) {
  if (smartSortActive) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.col-body').forEach(c => c.classList.remove('drag-over'));
  e.currentTarget.classList.add('drag-over');
}

async function onDrop(e, newStatus) {
  if (smartSortActive) return;
  e.preventDefault();
  document.querySelectorAll('.col-body').forEach(c => c.classList.remove('drag-over'));
  if (!draggedId) return;

  const colBody       = document.getElementById(`cards-${newStatus}`);
  const cards         = [...colBody.querySelectorAll('.task-card')].filter(c => c.dataset.id !== draggedId);
  const dropY         = e.clientY;
  let insertIndex     = cards.length;

  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    if (dropY < rect.top + rect.height / 2) { insertIndex = i; break; }
  }

  const otherColTasks = allTasks.filter(t => t.status === newStatus && t.id !== draggedId);
  otherColTasks.splice(insertIndex, 0, allTasks.find(t => t.id === draggedId));
  const reorderPayload = otherColTasks.map((t, i) => ({ id: t.id, status: newStatus, priority: i }));

  try {
    await fetch('/api/tasks/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: reorderPayload }),
    });
    await loadTasks();
  } catch (err) {
    console.error('Reorder error:', err);
  }
  draggedId = null;
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function normalizeStr(s) {
  return (s || '').trim().toLowerCase();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeDelete(); }
});

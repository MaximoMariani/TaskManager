/* app.js — TaskBoard Frontend */
'use strict';

// ============================================================
// STATE
// ============================================================
const state = {
  tasks: [],
  currentView: 'board',
  editingTaskId: null,
  deleteTaskId: null,
  // Polling
  pollInterval: null,
  isDragging: false,
  isEditing: false,
  lastHash: '',
  // Charts
  chartArea: null,
  chartStatus: null,
};

// ============================================================
// UTILITIES
// ============================================================
const $ = id => document.getElementById(id);
const qs = (sel, ctx = document) => ctx.querySelector(sel);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h.toString(36);
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function isOverdue(dueDate) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function loadBadge(score) {
  if (score <= 2) return ['load-0', 'Muy disponible'];
  if (score <= 5) return ['load-1', 'Disponible'];
  if (score <= 8) return ['load-2', 'Cargado'];
  return ['load-3', 'Saturado'];
}

// ============================================================
// API
// ============================================================
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  if (res.status === 401) { showLogin(); return null; }
  return res.json();
}

// ============================================================
// AUTH
// ============================================================
function showLogin() {
  $('login-screen').classList.remove('hidden');
  $('app-shell').classList.add('hidden');
  stopPolling();
}

function showApp() {
  $('login-screen').classList.add('hidden');
  $('app-shell').classList.remove('hidden');
  loadTasks();
  startPolling();
}

async function checkAuth() {
  const data = await api('GET', '/auth/check');
  if (data && data.authenticated) showApp();
  else showLogin();
}

on($('login-form'), 'submit', async e => {
  e.preventDefault();
  const password = $('login-password').value;
  const btn = $('login-btn');
  btn.disabled = true; btn.textContent = 'Ingresando…';
  const data = await api('POST', '/auth/login', { password });
  btn.disabled = false; btn.textContent = 'Ingresar';
  if (data && data.success) {
    $('login-error').classList.add('hidden');
    showApp();
  } else {
    $('login-error').classList.remove('hidden');
  }
});

on($('btn-logout'), 'click', async () => {
  await api('POST', '/auth/logout');
  showLogin();
});

// ============================================================
// NAVIGATION
// ============================================================
document.querySelectorAll('.nav-link').forEach(link => {
  on(link, 'click', e => {
    e.preventDefault();
    const view = link.dataset.view;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    $('view-' + view).classList.remove('hidden');
    state.currentView = view;
    if (view === 'dashboard') loadDashboard();
  });
});

// ============================================================
// TASKS LOADING
// ============================================================
async function loadTasks(silent = false) {
  if (!silent) setSyncStatus('loading');
  const params = buildFilterParams();
  const tasks = await api('GET', `/tasks${params}`);
  if (!tasks) return;

  const hash = simpleHash(JSON.stringify(tasks));

  if (!silent) {
    // First load
    state.tasks = tasks;
    state.lastHash = hash;
    renderBoard(tasks);
    setSyncStatus('ok');
    return;
  }

  // Silent poll — detect changes
  if (hash === state.lastHash) {
    setSyncStatus('ok');
    return;
  }

  // Find new task ids
  const oldIds = new Set(state.tasks.map(t => t.id));
  const newIds = tasks.filter(t => !oldIds.has(t.id)).map(t => t.id);

  state.tasks = tasks;
  state.lastHash = hash;
  renderBoard(tasks, newIds);
  setSyncStatus('new');
  setTimeout(() => setSyncStatus('ok'), 2500);
}

function buildFilterParams() {
  const search = $('search-input').value.trim();
  const area = $('filter-area').value;
  const assignee = $('filter-assignee').value.trim();
  const parts = [];
  if (search) parts.push('search=' + encodeURIComponent(search));
  if (area) parts.push('area=' + encodeURIComponent(area));
  if (assignee) parts.push('assignedTo=' + encodeURIComponent(assignee));
  return parts.length ? '?' + parts.join('&') : '';
}

// ============================================================
// SYNC STATUS INDICATOR
// ============================================================
function setSyncStatus(type) {
  const el = $('sync-indicator');
  el.className = 'sync-indicator';
  if (type === 'ok') { el.classList.add('sync-ok'); el.textContent = '● Sincronizado'; }
  else if (type === 'loading') { el.classList.add('sync-loading'); el.textContent = '● Actualizando…'; }
  else if (type === 'new') { el.classList.add('sync-new'); el.textContent = '● Cambios recibidos'; }
}

// ============================================================
// POLLING
// ============================================================
function startPolling() {
  stopPolling();
  state.pollInterval = setInterval(() => {
    if (state.isDragging || state.isEditing) return;
    setSyncStatus('loading');
    loadTasks(true);
  }, 5000);
}

function stopPolling() {
  if (state.pollInterval) clearInterval(state.pollInterval);
  state.pollInterval = null;
}

// Detect editing in inputs
document.addEventListener('focusin', e => {
  if (e.target.matches('input, textarea, select')) state.isEditing = true;
});
document.addEventListener('focusout', () => {
  setTimeout(() => { state.isEditing = false; }, 200);
});

// ============================================================
// BOARD RENDERING
// ============================================================
const STATUSES = ['TODO', 'DOING', 'DONE'];

function renderBoard(tasks, newIds = []) {
  const newIdSet = new Set(newIds);

  STATUSES.forEach(status => {
    const col = tasks.filter(t => t.status === status)
                     .sort((a, b) => a.priority - b.priority);
    const area = $('cards-' + status);
    const count = $('count-' + status);

    // Remove cards no longer in this status
    Array.from(area.children).forEach(card => {
      const id = card.dataset.id;
      if (!col.find(t => t.id === id)) card.remove();
    });

    // Add/update cards
    col.forEach((task, idx) => {
      let card = area.querySelector(`[data-id="${task.id}"]`);
      const html = buildCardHTML(task);
      if (!card) {
        card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.id = task.id;
        card.innerHTML = html;
        makeDraggable(card);
        bindCardButtons(card);
        area.appendChild(card);
        if (newIdSet.has(task.id)) {
          card.classList.add('card-new', 'card-highlight');
          card.addEventListener('animationend', () => {
            card.classList.remove('card-new', 'card-highlight');
          }, { once: true });
        }
      } else {
        card.innerHTML = html;
        bindCardButtons(card);
      }
    });

    count.textContent = col.length;
  });
}

function buildCardHTML(task) {
  const due = task.dueDate ? formatDate(task.dueDate) : null;
  const over = task.dueDate && isOverdue(task.dueDate) && task.status !== 'DONE';
  return `
    <div class="card-top">
      <div class="card-title">${escHtml(task.title)}</div>
      <div class="card-actions">
        ${task.status !== 'DONE' ? `<button class="card-btn done-btn" title="Marcar como Done">✓</button>` : `<span class="card-done-check">✓ Done</span>`}
        <button class="card-btn edit-btn" title="Editar">✎</button>
        <button class="card-btn del-btn" title="Eliminar">✕</button>
      </div>
    </div>
    ${task.description ? `<div class="card-desc">${escHtml(task.description).substring(0, 120)}${task.description.length > 120 ? '…' : ''}</div>` : ''}
    <div class="card-meta">
      <span class="chip chip-${task.area}">${task.area}</span>
      ${task.assignedTo ? `<span class="card-assignee">👤 ${escHtml(task.assignedTo)}</span>` : ''}
      ${due ? `<span class="card-due ${over ? 'overdue' : 'ok'}">${over ? '⚠' : '📅'} ${due}</span>` : ''}
    </div>
  `;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function bindCardButtons(card) {
  const id = card.dataset.id;
  const doneBtn = card.querySelector('.done-btn');
  const editBtn = card.querySelector('.edit-btn');
  const delBtn  = card.querySelector('.del-btn');
  if (doneBtn) on(doneBtn, 'click', () => quickDone(id));
  if (editBtn) on(editBtn, 'click', () => openEditModal(id));
  if (delBtn)  on(delBtn,  'click', () => confirmDelete(id));
}

async function quickDone(id) {
  await api('PATCH', `/tasks/${id}/status`, { status: 'DONE' });
  await loadTasks(true);
  state.lastHash = simpleHash(JSON.stringify(state.tasks));
}

// ============================================================
// DRAG & DROP
// ============================================================
let draggedCard = null;

function makeDraggable(card) {
  card.setAttribute('draggable', 'true');
  card.addEventListener('dragstart', e => {
    draggedCard = card;
    state.isDragging = true;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedCard = null;
    setTimeout(() => { state.isDragging = false; }, 300);
    saveOrder();
    document.querySelectorAll('.cards-area').forEach(a => a.classList.remove('drag-over'));
  });
}

document.querySelectorAll('.cards-area').forEach(area => {
  area.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    area.classList.add('drag-over');
    const afterEl = getDragAfterElement(area, e.clientY);
    if (afterEl) area.insertBefore(draggedCard, afterEl);
    else area.appendChild(draggedCard);
  });
  area.addEventListener('dragleave', e => {
    if (!area.contains(e.relatedTarget)) area.classList.remove('drag-over');
  });
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('drag-over');
  });
});

function getDragAfterElement(container, y) {
  const draggableEls = [...container.querySelectorAll('.task-card:not(.dragging)')];
  return draggableEls.reduce((closest, el) => {
    const box = el.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: el };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveOrder() {
  const items = [];
  STATUSES.forEach(status => {
    const area = $('cards-' + status);
    Array.from(area.children).forEach((card, idx) => {
      items.push({ id: card.dataset.id, status, priority: idx });
    });
  });
  await api('PATCH', '/tasks/reorder', { tasks: items });
  // Refresh hash
  const tasks = await api('GET', '/tasks');
  if (tasks) { state.tasks = tasks; state.lastHash = simpleHash(JSON.stringify(tasks)); }
}

// ============================================================
// FILTERS
// ============================================================
let filterDebounce;
['search-input', 'filter-area', 'filter-assignee'].forEach(id => {
  const el = $(id);
  if (el) on(el, 'input', () => {
    clearTimeout(filterDebounce);
    filterDebounce = setTimeout(() => loadTasks(), 250);
  });
});

// ============================================================
// MODAL — TASK FORM
// ============================================================
on($('btn-new-task'), 'click', () => openCreateModal());
on($('modal-close'), 'click', closeModal);
on($('modal-cancel'), 'click', closeModal);
on($('task-modal'), 'click', e => { if (e.target === $('task-modal')) closeModal(); });

function openCreateModal() {
  state.editingTaskId = null;
  $('modal-title').textContent = 'Nueva tarea';
  $('task-form').reset();
  $('task-id').value = '';
  $('task-modal').classList.remove('hidden');
  $('task-title').focus();
}

function openEditModal(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  state.editingTaskId = id;
  $('modal-title').textContent = 'Editar tarea';
  $('task-id').value = task.id;
  $('task-title').value = task.title;
  $('task-desc').value = task.description || '';
  $('task-area').value = task.area;
  $('task-status').value = task.status;
  $('task-assigned').value = task.assignedTo || '';
  $('task-created-by').value = task.createdBy || '';
  $('task-due').value = task.dueDate ? task.dueDate.substring(0, 10) : '';
  $('task-modal').classList.remove('hidden');
  $('task-title').focus();
}

function closeModal() {
  $('task-modal').classList.add('hidden');
  state.editingTaskId = null;
}

on($('task-form'), 'submit', async e => {
  e.preventDefault();
  const body = {
    title: $('task-title').value.trim(),
    description: $('task-desc').value.trim(),
    area: $('task-area').value,
    status: $('task-status').value,
    assignedTo: $('task-assigned').value.trim(),
    createdBy: $('task-created-by').value.trim(),
    dueDate: $('task-due').value || null,
  };
  const btn = $('task-submit');
  btn.disabled = true; btn.textContent = 'Guardando…';

  if (state.editingTaskId) {
    await api('PUT', `/tasks/${state.editingTaskId}`, body);
  } else {
    await api('POST', '/tasks', body);
  }
  btn.disabled = false; btn.textContent = 'Guardar tarea';
  closeModal();
  await loadTasks(true);
  state.lastHash = simpleHash(JSON.stringify(state.tasks));
  setSyncStatus('ok');
});

// ============================================================
// DELETE CONFIRM
// ============================================================
on($('confirm-cancel'), 'click', () => $('confirm-modal').classList.add('hidden'));
on($('confirm-modal'), 'click', e => { if (e.target === $('confirm-modal')) $('confirm-modal').classList.add('hidden'); });
on($('confirm-ok'), 'click', async () => {
  if (!state.deleteTaskId) return;
  await api('DELETE', `/tasks/${state.deleteTaskId}`);
  $('confirm-modal').classList.add('hidden');
  state.deleteTaskId = null;
  await loadTasks(true);
  state.lastHash = simpleHash(JSON.stringify(state.tasks));
});

function confirmDelete(id) {
  state.deleteTaskId = id;
  $('confirm-modal').classList.remove('hidden');
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  const data = await api('GET', '/stats');
  if (!data) return;

  // Summary cards
  $('d-total').textContent   = data.summary.total;
  $('d-todo').textContent    = data.summary.todo;
  $('d-doing').textContent   = data.summary.doing;
  $('d-done').textContent    = data.summary.done;
  $('d-overdue').textContent = data.summary.overdue;

  // Chart — by area
  const areaLabels = data.byArea.map(r => r.area);
  const areaData   = data.byArea.map(r => r.count);
  if (state.chartArea) state.chartArea.destroy();
  state.chartArea = new Chart($('chart-area'), {
    type: 'bar',
    data: {
      labels: areaLabels,
      datasets: [{ label: 'Tareas', data: areaData,
        backgroundColor: ['#f9a8d4','#93c5fd','#c4b5fd','#86efac'],
        borderRadius: 6, borderSkipped: false }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });

  // Chart — by status (doughnut)
  if (state.chartStatus) state.chartStatus.destroy();
  state.chartStatus = new Chart($('chart-status'), {
    type: 'doughnut',
    data: {
      labels: ['TODO','DOING','DONE'],
      datasets: [{ data: [data.summary.todo, data.summary.doing, data.summary.done],
        backgroundColor: ['#d1d5db','#fbbf24','#34d399'], borderWidth: 2, borderColor: '#fff' }]
    },
    options: { plugins: { legend: { position: 'bottom' } }, cutout: '65%' }
  });

  // Lists
  const listPrio = $('list-priority');
  listPrio.innerHTML = data.topPriority.length
    ? data.topPriority.map(t => `<li><strong>${escHtml(t.title)}</strong><br><span>${t.assignedTo || '—'} · ${t.area}</span></li>`).join('')
    : '<li><span>Sin tareas activas</span></li>';

  const listAssign = $('list-assignees');
  listAssign.innerHTML = data.topAssignees.length
    ? data.topAssignees.map(a => `<li><strong>${escHtml(a.assignedTo)}</strong> <span>— ${a.count} tareas activas</span></li>`).join('')
    : '<li><span>Sin asignaciones</span></li>';

  const listRecent = $('list-recent');
  listRecent.innerHTML = data.recentTasks.length
    ? data.recentTasks.map(t => `<li><strong>${escHtml(t.title)}</strong><br><span>${t.area} · ${formatDate(t.createdAt)}</span></li>`).join('')
    : '<li><span>Sin tareas recientes</span></li>';

  // Availability
  renderAvailability(data.availability);
}

function renderAvailability(list) {
  // Top 3
  const top3 = list.slice(0, 3);
  const rankLabels = ['1er lugar', '2do lugar', '3er lugar'];
  const rankColors = ['#d1fae5','#dbeafe','#f3e8ff'];
  $('assign-top3').innerHTML = top3.length
    ? top3.map((u, i) => {
        const [cls, label] = loadBadge(u.availabilityScore);
        return `<div class="assign-card" style="background:${rankColors[i]}">
          <div class="assign-rank">${rankLabels[i]}</div>
          <div class="assign-name">👤 ${escHtml(u.name)}</div>
          <span class="assign-load load-badge ${cls}">${label}</span>
        </div>`;
      }).join('')
    : '<p style="color:var(--text-muted);font-size:.85rem">Sin datos de asignación aún.</p>';

  // Full table
  const tbody = $('avail-tbody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted);padding:16px">Sin datos</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(u => {
    const [cls, label] = loadBadge(u.availabilityScore);
    return `<tr>
      <td><strong>${escHtml(u.name)}</strong></td>
      <td><span class="load-badge ${cls}">${label}</span></td>
      <td>${u.activeTasks}</td>
      <td>${u.completedLast7Days}</td>
    </tr>`;
  }).join('');
}

// ============================================================
// INIT
// ============================================================
checkAuth();

/* ════════════════════════════════════════
   DASHBOARD.JS — Metrics & charts
   v3.0 — + Completion Time metrics
   ════════════════════════════════════════ */

// ── DARK MODE ──────────────────────────────────────────────────────────────────
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
  const palette = ['#6366f1','#8b5cf6','#ec4899','#14b8a6','#f59e0b',
                   '#10b981','#3b82f6','#ef4444','#f97316','#06b6d4','#84cc16','#a855f7'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
}

function buildAvatar(name) {
  if (!name) return '';
  return `<span class="avatar" style="background:${nameToColor(name)}" data-name="${escHtml(name)}">${getInitials(name)}</span>`;
}

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
let chartStatus = null;
let chartArea   = null;

const AREA_COLORS = {
  PRODUCCION: '#3b82f6', CONTENIDO: '#22c55e', DISENO: '#eab308', ADMIN: '#a855f7',
};
const AREA_LABELS = {
  PRODUCCION: 'Producción', CONTENIDO: 'Contenido', DISENO: 'Diseño', ADMIN: 'Admin',
};

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadStats();
});

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.href = '/pages/index.html'; return; }
    const data = await res.json();
    document.getElementById('userChip').textContent  = data.userName;
    document.getElementById('teamLabel').textContent = data.teamName || 'Task Manager';
  } catch {
    window.location.href = '/pages/index.html';
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/pages/index.html';
}

async function loadStats() {
  const btn = document.querySelector('.btn-refresh');
  if (btn) btn.classList.add('spinning');

  try {
    const res = await fetch('/api/stats');
    if (res.status === 401) { window.location.href = '/pages/index.html'; return; }
    const data = await res.json();
    if (!data.ok) return;

    renderSummary(data.summary);
    renderChartStatus(data.charts.byStatus);
    renderChartArea(data.charts.byArea);
    renderListPriority(data.lists.topPriorityTasks);
    renderListAssignees(data.lists.topAssignees);
    renderListRecent(data.lists.recentTasks);

    // Completion time (new in v3)
    if (data.completionTime) {
      renderCompletionTimeSummary(data.completionTime);
      renderCTByAssignee(data.completionTime.avgCompletionTimeByAssignee);
      renderCTByArea(data.completionTime.avgCompletionTimeByArea);
      renderCTRanked('ctSlowest', data.completionTime.slowestCompletedTasks, 'slow');
      renderCTRanked('ctFastest', data.completionTime.fastestCompletedTasks, 'fast');
    }
  } catch (err) {
    console.error('Stats error:', err);
  } finally {
    if (btn) setTimeout(() => btn.classList.remove('spinning'), 650);
  }
}

// ── SUMMARY CARDS ─────────────────────────────────────────────────────────────
function renderSummary(s) {
  document.getElementById('s-total').textContent   = s.total;
  document.getElementById('s-todo').textContent    = s.todo;
  document.getElementById('s-doing').textContent   = s.doing;
  document.getElementById('s-done').textContent    = s.done;
  document.getElementById('s-overdue').textContent = s.overdue;
}

// ── COMPLETION TIME: TOP SUMMARY ──────────────────────────────────────────────
function renderCompletionTimeSummary(ct) {
  const avgEl    = document.getElementById('ct-avg');
  const subEl    = document.getElementById('ct-avg-sub');
  const medEl    = document.getElementById('ct-median');
  const countEl  = document.getElementById('ct-count');

  if (ct.avgCompletionTimeMs !== null) {
    avgEl.textContent = formatDuration(ct.avgCompletionTimeMs);
    subEl.textContent = `basado en ${ct.totalWithData} tarea${ct.totalWithData !== 1 ? 's' : ''} completada${ct.totalWithData !== 1 ? 's' : ''}`;
  } else {
    avgEl.textContent = 'Sin datos';
    subEl.textContent = 'marcá tareas como DONE para ver métricas';
  }

  medEl.textContent   = ct.medianCompletionTimeMs !== null ? formatDuration(ct.medianCompletionTimeMs) : '—';
  countEl.textContent = ct.totalWithData;
}

// ── COMPLETION TIME: BY ASSIGNEE TABLE ───────────────────────────────────────
function renderCTByAssignee(rows) {
  const el = document.getElementById('ctByAssignee');
  if (!rows.length) {
    el.innerHTML = '<div class="ct-empty">Sin datos suficientes</div>';
    return;
  }

  const maxMs = rows.reduce((m, r) => Math.max(m, r.avgMs), 0);

  el.innerHTML = `
    <div class="ct-table-header">
      <span>Persona</span><span>Promedio</span><span># completadas</span>
    </div>
    ${rows.map((r, i) => {
      const pct   = maxMs > 0 ? Math.round((r.avgMs / maxMs) * 100) : 0;
      const color = durationColor(r.avgMs);
      return `
      <div class="ct-table-row">
        <div class="ct-table-cell ct-name-cell">
          ${buildAvatar(r.name)}
          <span class="ct-name">${escHtml(r.name)}</span>
        </div>
        <div class="ct-table-cell">
          <div class="ct-bar-wrap">
            <div class="ct-bar" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="ct-dur" style="color:${color}">${formatDuration(r.avgMs)}</span>
        </div>
        <div class="ct-table-cell ct-count-cell">${r.count}</div>
      </div>`;
    }).join('')}
  `;
}

// ── COMPLETION TIME: BY AREA TABLE ────────────────────────────────────────────
function renderCTByArea(rows) {
  const el = document.getElementById('ctByArea');
  if (!rows.length) {
    el.innerHTML = '<div class="ct-empty">Sin datos suficientes</div>';
    return;
  }

  const maxMs = rows.reduce((m, r) => Math.max(m, r.avgMs), 0);

  el.innerHTML = `
    <div class="ct-table-header">
      <span>Área</span><span>Promedio</span><span># completadas</span>
    </div>
    ${rows.map(r => {
      const pct   = maxMs > 0 ? Math.round((r.avgMs / maxMs) * 100) : 0;
      const color = durationColor(r.avgMs);
      return `
      <div class="ct-table-row">
        <div class="ct-table-cell">
          <span class="area-chip area-${r.area}" style="font-size:10px">${AREA_LABELS[r.area] || r.area}</span>
        </div>
        <div class="ct-table-cell">
          <div class="ct-bar-wrap">
            <div class="ct-bar" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="ct-dur" style="color:${color}">${formatDuration(r.avgMs)}</span>
        </div>
        <div class="ct-table-cell ct-count-cell">${r.count}</div>
      </div>`;
    }).join('')}
  `;
}

// ── COMPLETION TIME: SLOWEST / FASTEST ───────────────────────────────────────
function renderCTRanked(elId, tasks, type) {
  const el = document.getElementById(elId);
  if (!tasks.length) {
    el.innerHTML = '<div class="ct-empty">Sin datos suficientes</div>';
    return;
  }

  el.innerHTML = tasks.map((t, i) => {
    const color = type === 'slow' ? durationColor(t.durationMs) : '#10b981';
    const medal = i === 0 ? (type === 'slow' ? '🐢' : '⚡') : `${i + 1}`;
    return `
    <div class="ct-ranked-row">
      <span class="ct-rank-badge">${medal}</span>
      <div class="ct-ranked-main">
        <div class="ct-ranked-title" title="${escHtml(t.title)}">${escHtml(t.title)}</div>
        <div class="ct-ranked-meta">
          <span class="area-chip area-${t.area}" style="font-size:9px;padding:1px 6px">${AREA_LABELS[t.area] || t.area}</span>
          ${t.assigned_to ? `<span class="ct-ranked-person">${escHtml(t.assigned_to)}</span>` : ''}
        </div>
      </div>
      <span class="ct-ranked-dur" style="color:${color}">${formatDuration(t.durationMs)}</span>
    </div>`;
  }).join('');
}

// ── CHART: STATUS ─────────────────────────────────────────────────────────────
function renderChartStatus(data) {
  const ctx = document.getElementById('chartStatus').getContext('2d');
  if (chartStatus) chartStatus.destroy();
  chartStatus = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        data: data.map(d => d.value),
        backgroundColor: ['#e4e4e7', '#fbbf24', '#4ade80'],
        borderWidth: 2,
        borderColor: document.body.classList.contains('dark') ? '#1c1c1f' : '#fff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'right',
          labels: { font: { family: 'Inter', size: 12 }, padding: 14, boxWidth: 12, usePointStyle: true },
        },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}` } },
      },
    },
  });
}

// ── CHART: AREA ───────────────────────────────────────────────────────────────
function renderChartArea(data) {
  const ctx = document.getElementById('chartArea').getContext('2d');
  if (chartArea) chartArea.destroy();
  const labels = data.map(d => AREA_LABELS[d.area] || d.area);
  const values = data.map(d => d.count);
  const colors = data.map(d => AREA_COLORS[d.area] || '#a1a1aa');
  chartArea = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tareas',
        data: values,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor: colors,
        borderWidth: 1.5,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { family: 'Inter', size: 11 } },
          grid: { color: document.body.classList.contains('dark') ? '#2e2e32' : '#f4f4f5' },
        },
        x: {
          ticks: { font: { family: 'Inter', size: 11 } },
          grid: { display: false },
        },
      },
    },
  });
}

// ── EXISTING LISTS ────────────────────────────────────────────────────────────
function renderListPriority(tasks) {
  const el = document.getElementById('listPriority');
  if (!tasks.length) { el.innerHTML = '<div class="list-empty">Sin tareas activas</div>'; return; }
  el.innerHTML = tasks.map(t => {
    const overdue = t.due_date && new Date(t.due_date) < new Date();
    return `
    <div class="list-item">
      <span class="area-chip area-${t.area}" style="font-size:10px">${AREA_LABELS[t.area] || t.area}</span>
      <div class="list-item-main">
        <div class="list-item-title">${escHtml(t.title)}</div>
        ${t.assigned_to ? `<div class="list-item-sub">${escHtml(t.assigned_to)}</div>` : ''}
      </div>
      ${t.due_date ? `<span style="font-size:11px;color:${overdue ? '#dc2626' : 'var(--text-sub)'}">${formatDate(t.due_date)}</span>` : ''}
    </div>`;
  }).join('');
}

function renderListAssignees(assignees) {
  const el = document.getElementById('listAssignees');
  if (!assignees.length) { el.innerHTML = '<div class="list-empty">Sin asignaciones activas</div>'; return; }
  const max = assignees[0]?.count || 1;
  el.innerHTML = assignees.map(a => `
    <div class="list-item" style="flex-direction:column;align-items:flex-start;gap:4px;">
      <div style="display:flex;width:100%;align-items:center;gap:8px;">
        <div class="list-item-main"><div class="list-item-title">${escHtml(a.assigned_to)}</div></div>
        <span class="list-item-count">${a.count}</span>
      </div>
      <div style="width:100%;height:4px;background:var(--border);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${Math.round((a.count/max)*100)}%;background:var(--accent);border-radius:4px;transition:width .4s ease;"></div>
      </div>
    </div>`).join('');
}

function renderListRecent(tasks) {
  const el = document.getElementById('listRecent');
  if (!tasks.length) { el.innerHTML = '<div class="list-empty">Sin tareas esta semana</div>'; return; }
  el.innerHTML = tasks.map(t => `
    <div class="list-item">
      <span class="area-chip area-${t.area}" style="font-size:10px">${AREA_LABELS[t.area] || t.area}</span>
      <div class="list-item-main">
        <div class="list-item-title">${escHtml(t.title)}</div>
        ${t.assigned_to ? `<div class="list-item-sub">${escHtml(t.assigned_to)}</div>` : ''}
      </div>
      <span style="font-size:11px;color:var(--text-sub);flex-shrink:0">${formatDate(t.created_at)}</span>
    </div>`).join('');
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

/**
 * Format milliseconds into human-readable duration.
 * Examples: "45m", "3h 12m", "2d 5h", "12d"
 */
function formatDuration(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) return '—';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1)   return '< 1m';
  if (totalMin < 60)  return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins  = totalMin % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days  = Math.floor(hours / 24);
  const remH  = hours % 24;
  if (days < 30) return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
  const months = Math.floor(days / 30);
  const remD   = days % 30;
  return remD > 0 ? `${months}mo ${remD}d` : `${months}mo`;
}

/**
 * Color scale for durations:
 *   green  < 1 day
 *   amber  1–3 days
 *   orange 3–7 days
 *   red    > 7 days
 */
function durationColor(ms) {
  const days = ms / 86400000;
  if (days < 1)  return '#10b981'; // green
  if (days < 3)  return '#f59e0b'; // amber
  if (days < 7)  return '#f97316'; // orange
  return '#ef4444';                // red
}

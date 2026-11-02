// HG-Sync Frontend App
let currentDocs = [];
let activePreviewDoc = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  checkSessionStatus();
  loadWorkerStatus();
  loadAliases();
  loadLogs();
  loadMidweekSchedule();

  // Eventos de botões
  document.getElementById('btnScanDownloads')?.addEventListener('click', scanDownloads);
  document.getElementById('btnLogin')?.addEventListener('click', triggerLogin);
  document.getElementById('btnSyncMidweekNow')?.addEventListener('click', syncMidweekNow);
  document.getElementById('autoSyncToggle')?.addEventListener('change', toggleAutoSync);
  document.getElementById('btnClosePreview')?.addEventListener('click', closePreviewModal);
  document.getElementById('btnRefreshLogs')?.addEventListener('click', loadLogs);
  document.getElementById('btnSyncDoc')?.addEventListener('click', syncActiveDoc);

  // Auto-refresh a cada 10 segundos
  setInterval(() => {
    checkSessionStatus();
    loadWorkerStatus();
  }, 10000);
});

// Toast Helper
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.innerText = message;
  toast.style.borderColor = isError ? 'var(--danger)' : 'var(--primary)';
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

// Navegação por Abas
function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

// 1. Status da Sessão Hourglass
async function checkSessionStatus() {
  try {
    const res = await fetch('/api/status/session');
    if (!res.ok) return false;
    const data = await res.json();
    const dot = document.querySelector('.status-dot');
    const text = document.querySelector('.status-text');
    const loginBtn = document.getElementById('btnLogin');

    if (data.authenticated) {
      dot.className = 'status-dot online';
      text.innerText = `Conectado como ${data.user?.firstname || 'Irmão'}`;
      loginBtn.style.display = 'none';
      return true;
    } else {
      dot.className = 'status-dot offline';
      text.innerText = 'Desconectado';
      loginBtn.style.display = 'inline-block';
      return false;
    }
  } catch (e) {
    console.warn('Erro ao checar sessão:', e);
    return false;
  }
}

async function triggerLogin() {
  try {
    showToast('Abrindo janela do Google Chrome para login...');
    const res = await fetch('/api/session/login', { method: 'POST' });
    if (!res.ok) {
      showToast('Erro ao solicitar abertura do navegador.', true);
      return;
    }
    
    // Monitora o status a cada 3 segundos nos próximos 45 segundos
    let checks = 0;
    const interval = setInterval(async () => {
      checks++;
      const isAuth = await checkSessionStatus();
      if (isAuth) {
        clearInterval(interval);
        showToast('Login detectado com sucesso!');
        loadMidweekSchedule();
      } else if (checks >= 15) {
        clearInterval(interval);
      }
    }, 3000);
  } catch (err) {
    showToast(`Erro de conexão com o servidor: ${err.message}`, true);
    console.warn('Erro ao acionar login:', err);
  }
}

// 2. Downloads Scanner
async function scanDownloads() {
  const list = document.getElementById('downloadsList');
  list.innerHTML = '<div class="loading-box">Escanear arquivos em Downloads...</div>';

  try {
    const res = await fetch('/api/downloads/scan');
    const docs = await res.json();
    currentDocs = docs;

    if (docs.length === 0) {
      list.innerHTML = '<div class="loading-box">Nenhum arquivo de escala encontrado em Downloads.</div>';
      return;
    }

    list.innerHTML = '';
    docs.forEach((doc, idx) => {
      const card = document.createElement('div');
      card.className = 'doc-card';
      const hasUnresolved = doc.unresolvedCount > 0;

      card.innerHTML = `
        <div class="doc-card-title">${doc.fileName}</div>
        <div><strong>Tipo:</strong> ${doc.detectedType.name}</div>
        <div><strong>Semanas detectadas:</strong> ${doc.rows.length}</div>
        <div>
          <span class="badge ${hasUnresolved ? 'badge-warning' : 'badge-success'}">
            ${hasUnresolved ? `${doc.unresolvedCount} pendências de nome` : '100% resolvido'}
          </span>
        </div>
        <div style="display: flex; gap: 0.5rem; margin-top: auto;">
          <button class="btn btn-outline btn-sm" onclick="openPreview(${idx})">Ver Prévia</button>
          <button class="btn btn-primary btn-sm" onclick="syncDocByIndex(${idx})">Sincronizar</button>
        </div>
      `;
      list.appendChild(card);
    });
  } catch (err) {
    list.innerHTML = `<div class="loading-box" style="color: var(--danger)">Erro ao escanear: ${err.message}</div>`;
  }
}

// Prévia de Documento
window.openPreview = function(docIndex) {
  const doc = currentDocs[docIndex];
  if (!doc) return;
  activePreviewDoc = doc;

  document.getElementById('modalDocTitle').innerText = `${doc.fileName} (${doc.detectedType.name})`;
  document.getElementById('modalSummary').innerText = `${doc.rows.length} datas extraídas · ${doc.unresolvedCount} irmãos com necessidade de confirmação`;

  const thead = document.querySelector('#modalTable thead');
  const tbody = document.querySelector('#modalTable tbody');

  // Cabeçalhos
  const cols = doc.detectedType.columns;
  thead.innerHTML = `<tr>${cols.map(c => `<th>${c.label || c.name}</th>`).join('')}</tr>`;

  // Linhas
  tbody.innerHTML = doc.rows.map(row => {
    return `<tr>
      <td><strong>${row.date}</strong> <span style="font-size:0.75rem; color:var(--text-muted)">(${row.rawDate})</span></td>
      ${cols.filter(c => c.field !== 'date').map(c => {
        const cell = row.values[c.field];
        if (!cell) return '<td>—</td>';
        const res = cell.resolved;
        if (!res) return `<td>${cell.raw}</td>`;

        if (res.confidence === 'unresolved') {
          return `<td style="color: var(--warning)">
            ⚠️ <strong>${cell.raw}</strong>
            <button class="btn btn-sm btn-outline" onclick="promptSaveAlias('${cell.raw}', '${c.field}')">Resolver</button>
          </td>`;
        }

        return `<td>${res.canonicalName} <span style="font-size:0.7rem; color:var(--text-muted)">(HG: ${res.hg_id})</span></td>`;
      }).join('')}
    </tr>`;
  }).join('');

  document.getElementById('previewModal').style.display = 'flex';
};

function closePreviewModal() {
  document.getElementById('previewModal').style.display = 'none';
  activePreviewDoc = null;
}

window.promptSaveAlias = async function(rawName, role) {
  const canonical = prompt(`Informe o Nome Completo ou ID do Hourglass para "${rawName}":`);
  if (!canonical) return;

  const hgIdStr = prompt(`Informe o ID numérico do Hourglass (ex: 3296262):`);
  const hgId = parseInt(hgIdStr || '0');
  if (!hgId) return;

  await fetch('/api/aliases/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawName, canonicalName: canonical, hg_id: hgId, role })
  });

  showToast(`Apelido salvo para ${rawName}!`);
  scanDownloads(); // Re-escaneia para atualizar
  closePreviewModal();
};

window.syncDocByIndex = async function(docIndex) {
  const doc = currentDocs[docIndex];
  if (!doc) return;
  activePreviewDoc = doc;
  syncActiveDoc();
};

async function syncActiveDoc() {
  if (!activePreviewDoc) return;
  if (!confirm(`Confirma sincronizar as ${activePreviewDoc.rows.length} semanas de "${activePreviewDoc.fileName}" no Hourglass?`)) return;

  showToast(`Sincronizando ${activePreviewDoc.fileName}...`);
  try {
    const res = await fetch('/api/sync/document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc: activePreviewDoc })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Sincronização concluída com sucesso!');
      closePreviewModal();
      loadLogs();
    } else {
      showToast(`Erro na sincronização: ${result.error}`, true);
    }
  } catch (err) {
    showToast(`Erro de rede: ${err.message}`, true);
  }
}

// 3. Meio de Semana
async function loadMidweekSchedule() {
  const container = document.getElementById('midweekList');
  try {
    const res = await fetch('/api/midweek/weeks');
    const weeks = await res.json();
    if (weeks.length === 0) {
      container.innerHTML = '<div class="loading-box">Nenhuma semana publicada encontrada no RVM a partir da semana em curso.</div>';
      return;
    }

    container.innerHTML = weeks.map(w => `
      <div class="doc-card">
        <div class="doc-card-title">${w.weekDisplay}</div>
        <div><strong>Status no RVM:</strong> <span class="badge ${w.isPublished ? 'badge-success' : 'badge-warning'}">${w.isPublished ? 'Publicada' : 'Rascunho'}</span></div>
        <div><strong>Partes com responsável:</strong> ${Object.values(w.slots).filter(Boolean).length}</div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<div class="loading-box" style="color:var(--danger)">Erro: ${e.message}</div>`;
  }
}

async function syncMidweekNow() {
  showToast('Iniciando reconciliação Meio de Semana RVM ➡️ Hourglass...');
  try {
    const res = await fetch('/api/midweek/sync', { method: 'POST' });
    const result = await res.json();
    showToast(result.summary, !result.success);
    loadWorkerStatus();
    loadLogs();
  } catch (err) {
    showToast(`Erro: ${err.message}`, true);
  }
}

async function loadWorkerStatus() {
  try {
    const res = await fetch('/api/status/worker');
    const status = await res.json();
    document.getElementById('workerStatusText').innerText = status.isRunning ? 'Sincronizando...' : (status.enabled ? 'Ativo (Vigiando RVM)' : 'Pausado');
    document.getElementById('workerLastRun').innerText = status.lastRunTime ? new Date(status.lastRunTime).toLocaleTimeString('pt-BR') + ' — ' + status.lastResultSummary : 'Aguardando';
    document.getElementById('autoSyncToggle').checked = status.enabled;
  } catch {}
}

async function toggleAutoSync(e) {
  const enabled = e.target.checked;
  await fetch('/api/worker/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  });
  showToast(`Vigia automático ${enabled ? 'ativado' : 'pausado'}.`);
  loadWorkerStatus();
}

// 4. Apelidos & Logs
async function loadAliases() {
  const tbody = document.querySelector('#aliasesTable tbody');
  try {
    const res = await fetch('/api/aliases');
    const aliases = await res.json();
    tbody.innerHTML = Object.entries(aliases).map(([raw, rec]) => `
      <tr>
        <td><strong>${raw}</strong></td>
        <td>${rec.canonicalName}</td>
        <td>${rec.hg_id}</td>
        <td>${rec.byRole ? Object.keys(rec.byRole).join(', ') : 'Geral'}</td>
        <td><button class="btn btn-sm btn-outline" onclick="promptSaveAlias('${raw}')">Editar</button></td>
      </tr>
    `).join('');
  } catch {}
}

async function loadLogs() {
  const tbody = document.querySelector('#logsTable tbody');
  try {
    const res = await fetch('/api/logs');
    const logs = await res.json();
    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Nenhuma sincronização registrada ainda.</td></tr>';
      return;
    }
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td>${new Date(l.timestamp).toLocaleString('pt-BR')}</td>
        <td><span class="badge badge-success">${l.module.toUpperCase()}</span></td>
        <td>${l.trigger}</td>
        <td>${l.summary}</td>
        <td>${l.changesCount}</td>
        <td>${l.status}</td>
      </tr>
    `).join('');
  } catch {}
}


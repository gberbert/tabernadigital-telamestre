// D&D 2024 RAG Web Chat Frontend Logic
let chatHistory = [];
let isSending = false;

// DOM Elements
const messagesContainer = document.getElementById('messagesContainer');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const welcomeCard = document.getElementById('welcomeCard');
const docsCountBadge = document.getElementById('docsCountBadge');
const diceResultBox = document.getElementById('diceResultBox');

// Load system stats on startup
let imageCatalog = {};

// Load system stats and image catalog on startup
window.addEventListener('DOMContentLoaded', () => {
  fetchStats();
  fetchImageCatalog();
  autoResizeTextarea();
  initDiceEngine();
});

async function fetchImageCatalog() {
  try {
    const res = await fetch('/api/image_catalog');
    if (res.ok) {
      imageCatalog = await res.json();
      console.log(`[IMAGES] Loaded ${Object.keys(imageCatalog).length} artwork mappings.`);
    }
  } catch (e) {
    console.warn('Could not load image catalog:', e);
  }
}

function lookupImage(term1, term2) {
  function clean(s) {
    return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  for (const t of [term1, term2]) {
    const c = clean(t);
    if (c && imageCatalog[c]) return imageCatalog[c];
  }
  for (const t of [term1, term2]) {
    const c = clean(t);
    if (!c || c.length < 3) continue;
    for (const [k, v] of Object.entries(imageCatalog)) {
      if (c.includes(k) || k.includes(c)) return v;
    }
  }
  return null;
}

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    if (res.ok) {
      const data = await res.json();
      if (data.model) {
        const modelDisplay = data.model.replace('gemini-', 'Gemini ').replace('3.5-flash-lite', '3.5 Flash-Lite');
        const statusText = document.querySelector('.status-text');
        if (statusText) statusText.textContent = modelDisplay;
        const geminiBadge = document.querySelector('.badge-gemini');
        if (geminiBadge) geminiBadge.textContent = '⚡ ' + modelDisplay;
      }
      if (data.catalogs) {
        docsCountBadge.innerHTML = `📚 <strong>${data.total_docs}</strong> Docs <span style="opacity:0.8; font-size:11px;">(${data.catalogs.monstros} 🐉 | ${data.catalogs.magias} 🔮)</span>`;
      } else {
        docsCountBadge.textContent = `📚 ${data.total_docs} Documentos Mapeados`;
      }
    }
  } catch (e) {
    docsCountBadge.textContent = `📚 RAG Conectado`;
  }
}

function autoResizeTextarea() {
  userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 140) + 'px';
  });
}

function handleKeyDown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSend(event);
  }
}

async function handleSend(event) {
  if (event) event.preventDefault();
  const text = userInput.value.trim();
  if (!text || isSending) return;

  if (welcomeCard) {
    welcomeCard.style.display = 'none';
  }

  // 1. Append User Message
  appendMessage('user', text);
  userInput.value = '';
  userInput.style.height = 'auto';
  isSending = true;
  sendBtn.disabled = true;

  // 2. Append Loading Indicator
  const loadingRow = appendLoadingIndicator();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonBody({ message: text, history: chatHistory })
    });

    loadingRow.remove();

    if (!response.ok) {
      throw new Error(`Erro na API (${response.status})`);
    }

    const data = await response.json();
    
    // Save to history
    chatHistory.push({ role: 'user', content: text });
    chatHistory.push({ role: 'model', content: data.reply });

    // Append Assistant Message with Sources
    appendMessage('assistant', data.reply, data.sources);

  } catch (error) {
    if (loadingRow) loadingRow.remove();
    appendMessage('assistant', `⚠️ **Erro ao consultar o Oráculo:** ${error.message}\n\nVerifique se o servidor local está ativo.`);
  } finally {
    isSending = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

function jsonBody(obj) {
  return JSON.stringify(obj);
}

function sendQuickPrompt(promptText) {
  userInput.value = promptText;
  handleSend();
}

function appendMessage(role, content, sources = []) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? '🧙' : '📜';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  const markdownDiv = document.createElement('div');
  markdownDiv.className = 'markdown-body';
  // Use marked.parse to render Markdown safely
  markdownDiv.innerHTML = marked.parse(content);

  // Transform all tables in assistant messages into Rich Dynamic Interactive Tables!
  if (role === 'assistant') {
    enhanceDynamicTables(markdownDiv);
  }

  bubble.appendChild(markdownDiv);

  // If there are retrieved RAG sources, append Sources Card
  if (sources && sources.length > 0) {
    const sourcesCard = document.createElement('div');
    sourcesCard.className = 'sources-card';

    const header = document.createElement('div');
    header.className = 'sources-header';
    header.innerHTML = `<span>🔍 Fontes Oficiais Recuperadas (${sources.length})</span>`;
    sourcesCard.appendChild(header);

    const chipsRow = document.createElement('div');
    chipsRow.className = 'source-chips-row';

    sources.forEach(src => {
      const chip = document.createElement('button');
      chip.className = 'source-badge';
      chip.innerHTML = `📄 <strong>${src.title}</strong> <em>(${src.category})</em>`;
      chip.onclick = () => openSourceModal(src.path, src.title);
      chipsRow.appendChild(chip);
    });

    sourcesCard.appendChild(chipsRow);
    bubble.appendChild(sourcesCard);
  }

  row.appendChild(avatar);
  row.appendChild(bubble);

  messagesContainer.appendChild(row);
  scrollToBottom();
  return row;
}

function appendLoadingIndicator() {
  const row = document.createElement('div');
  row.className = 'message-row assistant';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = '📜';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.innerHTML = `
    <div style="font-size: 13px; color: var(--gold-primary); margin-bottom: 6px;">
      Consultando acervo de regras oficiais com Gemini...
    </div>
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesContainer.appendChild(row);
  scrollToBottom();
  return row;
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ----------------------------------------------------
// 3D Realistic Dice Arena Controller
// ----------------------------------------------------
let trayDice = [20];
let trayModifier = 0;
let lastRollSummary = null;

function initDiceEngine() {
  const canvas = document.getElementById('diceCanvas');
  if (canvas && window.DicePhysicsEngine) {
    try {
      window.diceEngine = new window.DicePhysicsEngine(canvas);
      console.log('DicePhysicsEngine initialized successfully.');
    } catch (e) {
      console.warn('Could not initialize DicePhysicsEngine:', e);
    }
  }
}

function openDiceModal(presetExpr = null) {
  const modal = document.getElementById('diceModal');
  modal.style.display = 'flex';

  // Resize canvas when modal becomes visible
  setTimeout(() => {
    if (window.diceEngine) {
      window.diceEngine.handleResize();
    }
  }, 50);

  if (presetExpr) {
    parseDiceExpression(presetExpr);
  } else if (trayDice.length === 0) {
    trayDice = [20];
    trayModifier = 0;
    document.getElementById('trayModInput').value = '0';
  }

  updateTrayDisplay();

  // If a preset was requested (e.g. clicking d20 or typing 2d6+3), trigger roll right away
  if (presetExpr) {
    setTimeout(() => triggerPhysicsRoll(), 150);
  }
}

function closeDiceModal(event) {
  if (event && event.target && event.target.id !== 'diceModal') {
    return;
  }
  document.getElementById('diceModal').style.display = 'none';
  document.getElementById('diceCritBanner').style.display = 'none';
}

function addDieToTray(sides) {
  if (trayDice.length >= 12) {
    alert('Limite máximo de 12 dados por rolagem atingido.');
    return;
  }
  trayDice.push(sides);
  updateTrayDisplay();
}

function clearDiceTray() {
  trayDice = [];
  trayModifier = 0;
  document.getElementById('trayModInput').value = '0';
  document.getElementById('diceResultPanel').style.display = 'none';
  document.getElementById('diceCritBanner').style.display = 'none';
  updateTrayDisplay();
}

function updateTrayModifier() {
  const val = parseInt(document.getElementById('trayModInput').value, 10);
  trayModifier = isNaN(val) ? 0 : val;
  updateTrayDisplay();
}

function updateTrayDisplay() {
  const exprDisplay = document.getElementById('trayExprDisplay');
  if (trayDice.length === 0) {
    exprDisplay.textContent = 'Vazio';
    return;
  }

  // Count occurrences of each die side
  const counts = {};
  trayDice.forEach(s => {
    counts[s] = (counts[s] || 0) + 1;
  });

  // Sort descending by sides
  const parts = Object.keys(counts)
    .map(Number)
    .sort((a, b) => b - a)
    .map(sides => `${counts[sides]}d${sides}`);

  let formula = parts.join(' + ');
  if (trayModifier > 0) {
    formula += ` + ${trayModifier}`;
  } else if (trayModifier < 0) {
    formula += ` - ${Math.abs(trayModifier)}`;
  }

  exprDisplay.textContent = formula;
}

function parseDiceExpression(expr) {
  // Clear existing
  trayDice = [];
  trayModifier = 0;

  const cleaned = expr.trim().toLowerCase().replace(/\s+/g, '');
  // Matches e.g. 2d6, 1d20, d20, +5, -3
  const regex = /([+-]?\d*d\d+|[+-]?\d+)/g;
  const matches = cleaned.match(regex);

  if (!matches) {
    trayDice = [20];
    trayModifier = 0;
    document.getElementById('trayModInput').value = '0';
    return;
  }

  matches.forEach(token => {
    if (token.includes('d')) {
      const parts = token.split('d');
      const count = parts[0] === '' || parts[0] === '+' ? 1 : parseInt(parts[0], 10);
      const sides = parseInt(parts[1], 10);
      if (!isNaN(count) && !isNaN(sides) && sides > 0) {
        for (let i = 0; i < Math.min(Math.abs(count), 10); i++) {
          if (trayDice.length < 12) trayDice.push(sides);
        }
      }
    } else {
      const mod = parseInt(token, 10);
      if (!isNaN(mod)) {
        trayModifier += mod;
      }
    }
  });

  if (trayDice.length === 0) trayDice = [20];
  document.getElementById('trayModInput').value = String(trayModifier);
}

function triggerPhysicsRoll() {
  if (!window.diceEngine) return;
  if (trayDice.length === 0) {
    trayDice = [20];
    updateTrayDisplay();
  }

  const rollBtn = document.getElementById('btnRollPhysics');
  rollBtn.disabled = true;

  const critBanner = document.getElementById('diceCritBanner');
  const critBannerText = document.getElementById('critBannerText');
  critBanner.style.display = 'none';
  critBanner.className = 'dice-crit-banner';

  const resultPanel = document.getElementById('diceResultPanel');
  resultPanel.style.display = 'none';

  // Prepare target values
  const dicePlan = trayDice.map(sides => {
    return {
      sides: sides,
      value: Math.floor(Math.random() * sides) + 1
    };
  });

  window.diceEngine.roll(dicePlan, (settledDice) => {
    rollBtn.disabled = false;

    // Calculate totals and details
    let sumDice = 0;
    let hasNat20 = false;
    let hasNat1 = false;

    settledDice.forEach(d => {
      sumDice += d.targetVal;
      if (d.sides === 20) {
        if (d.targetVal === 20) hasNat20 = true;
        if (d.targetVal === 1) hasNat1 = true;
      }
    });

    const total = sumDice + trayModifier;

    // Show Crit / Fumble Banner
    if (hasNat20) {
      critBanner.className = 'dice-crit-banner crit-success';
      critBannerText.textContent = '🌟 ACERTO CRÍTICO! (Nat 20)';
      critBanner.style.display = 'block';
    } else if (hasNat1 && !hasNat20) {
      critBanner.className = 'dice-crit-banner crit-fail';
      critBannerText.textContent = '💀 FALHA CRÍTICA! (Nat 1)';
      critBanner.style.display = 'block';
    }

    // Populate Results Panel
    const rollsList = document.getElementById('resultRollsList');
    rollsList.innerHTML = '';

    settledDice.forEach(d => {
      const chip = document.createElement('span');
      chip.className = 'die-chip';
      if (d.sides === 20 && d.targetVal === 20) chip.classList.add('chip-crit');
      if (d.sides === 20 && d.targetVal === 1) chip.classList.add('chip-fumble');
      chip.innerHTML = `<strong>d${d.sides}:</strong> ${d.targetVal}`;
      rollsList.appendChild(chip);
    });

    if (trayModifier !== 0) {
      const modChip = document.createElement('span');
      modChip.className = 'die-chip';
      modChip.style.borderColor = 'var(--gold-primary)';
      modChip.style.color = 'var(--gold-light)';
      modChip.textContent = `Mod: ${trayModifier >= 0 ? '+' : ''}${trayModifier}`;
      rollsList.appendChild(modChip);
    }

    const totalBadge = document.getElementById('resultTotalBadge');
    totalBadge.textContent = `Total: ${total}`;

    resultPanel.style.display = 'flex';

    // Update sidebar result indicator too
    const diceResultBox = document.getElementById('diceResultBox');
    if (diceResultBox) {
      diceResultBox.style.display = 'block';
      let extra = '';
      if (hasNat20) extra = ' 💥 <strong>CRÍTICO!</strong>';
      if (hasNat1) extra = ' 💀 <strong>FALHA!</strong>';
      diceResultBox.innerHTML = `🎲 <strong>${document.getElementById('trayExprDisplay').textContent}</strong> ➔ <span style="font-size:16px; font-weight:800; color:#fff;">${total}</span>${extra}`;
    }

    // Save summary for sending to chat
    lastRollSummary = {
      formula: document.getElementById('trayExprDisplay').textContent,
      rolls: settledDice.map(d => ({ sides: d.sides, value: d.targetVal })),
      modifier: trayModifier,
      total: total,
      hasNat20: hasNat20,
      hasNat1: hasNat1
    };
  });
}

function sendDiceResultToChat() {
  if (!lastRollSummary) return;

  const formula = lastRollSummary.formula;
  const rollsStr = lastRollSummary.rolls.map(r => `d${r.sides}: **${r.value}**`).join(', ');
  const modStr = lastRollSummary.modifier !== 0 ? ` (Mod: ${lastRollSummary.modifier >= 0 ? '+' : ''}${lastRollSummary.modifier})` : '';
  let critStr = '';
  if (lastRollSummary.hasNat20) critStr = ' — 🌟 **ACERTO CRÍTICO!**';
  if (lastRollSummary.hasNat1) critStr = ' — 💀 **FALHA CRÍTICA!**';

  const messageText = `🎲 **Rolagem de Dados:** \`${formula}\`\n- **Dados:** [ ${rollsStr} ]${modStr}\n- **Total Final:** 🏆 **${lastRollSummary.total}**${critStr}`;

  closeDiceModal();

  // Send message directly
  userInput.value = messageText;
  handleSend();
}

function rollDie(sides) {
  openDiceModal(`1d${sides}`);
}

function rollCustomDice() {
  const input = document.getElementById('customDiceInput');
  const expr = input.value.trim();
  openDiceModal(expr || '1d20');
  input.value = '';
}

// ----------------------------------------------------
// Source Document Modal
// ----------------------------------------------------
async function openSourceModal(docPath, title) {
  const modal = document.getElementById('sourceModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalPath = document.getElementById('modalPath');
  const modalBody = document.getElementById('modalBody');

  modalTitle.textContent = title;
  modalPath.textContent = docPath;
  modalBody.innerHTML = '<p>Carregando documento oficial...</p>';
  modal.style.display = 'flex';

  try {
    const res = await fetch(`/api/document?path=${encodeURIComponent(docPath)}`);
    if (res.ok) {
      const data = await res.json();
      modalBody.innerHTML = marked.parse(data.content);
    } else {
      modalBody.innerHTML = '<p style="color:#ef4444;">Erro ao carregar o conteúdo do documento.</p>';
    }
  } catch (e) {
    modalBody.innerHTML = `<p style="color:#ef4444;">Erro de conexão: ${e.message}</p>`;
  }
}

function closeSourceModal(event) {
  document.getElementById('sourceModal').style.display = 'none';
}

// ----------------------------------------------------
// Utility Actions
// ----------------------------------------------------
async function reindexRAG() {
  docsCountBadge.textContent = '🔄 Re-indexando...';
  try {
    const res = await fetch('/api/reindex', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      docsCountBadge.textContent = `📚 ${data.total_docs} Documentos Mapeados`;
      alert(`Índice RAG atualizado! ${data.total_docs} documentos prontos para busca.`);
    }
  } catch (e) {
    alert('Erro ao atualizar o índice.');
  }
}

function clearChat() {
  if (confirm('Deseja limpar o histórico da conversa?')) {
    chatHistory = [];
    messagesContainer.innerHTML = '';
    if (welcomeCard) {
      messagesContainer.appendChild(welcomeCard);
      welcomeCard.style.display = 'block';
    }
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('open');
}

// ----------------------------------------------------
// Dynamic Interactive Tables with Search & Inline Detail View
// ----------------------------------------------------
function enhanceDynamicTables(container) {
  if (!container) return;
  const tables = container.querySelectorAll('table');
  if (!tables.length) return;

  tables.forEach((table, tableIndex) => {
    if (table.closest('.dynamic-table-widget') || table.dataset.dynamicEnhanced === 'true') {
      return;
    }
    table.dataset.dynamicEnhanced = 'true';

    // 1. Extract Headers
    const theadThs = table.querySelectorAll('thead th, thead td');
    let headerTexts = [];
    if (theadThs.length > 0) {
      headerTexts = Array.from(theadThs).map(th => th.textContent.trim());
    } else {
      const firstRowTds = table.querySelectorAll('tr:first-child th, tr:first-child td');
      headerTexts = Array.from(firstRowTds).map(td => td.textContent.trim());
    }

    if (!headerTexts.length) return;

    // 2. Extract Data Rows
    let rowNodes = Array.from(table.querySelectorAll('tbody tr'));
    if (!rowNodes.length) {
      const allTrs = Array.from(table.querySelectorAll('tr'));
      if (allTrs.length > 1) {
        rowNodes = allTrs.slice(1);
      }
    }
    if (!rowNodes.length) return;

    const rowData = rowNodes.map((tr, rIdx) => {
      const cells = Array.from(tr.querySelectorAll('td, th')).map(c => ({
        html: c.innerHTML,
        text: c.textContent.trim()
      }));
      const primaryName = cells[0]?.text || `Item ${rIdx + 1}`;
      const secondaryName = cells[1]?.text || '';
      return {
        index: rIdx,
        primaryName,
        secondaryName,
        cells,
        originalTr: tr
      };
    });

    // 3. Create the Widget Container
    const widget = document.createElement('div');
    widget.className = 'dynamic-table-widget';
    widget.id = `dt-widget-${Date.now()}-${tableIndex}`;

    // --- VIEW 1: Table View ---
    const tableView = document.createElement('div');
    tableView.className = 'dt-table-view';

    // Toolbar (Search + Counter + Hint)
    const toolbar = document.createElement('div');
    toolbar.className = 'dt-toolbar';

    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'dt-search-wrapper';
    searchWrapper.innerHTML = `
      <span class="dt-search-icon">🔍</span>
      <input type="text" class="dt-search-input" placeholder="Pesquisar nesta lista (nome, tipo, atributos)..." spellcheck="false" />
      <button type="button" class="dt-search-clear" style="display: none;" title="Limpar pesquisa">✕</button>
    `;

    const metaRow = document.createElement('div');
    metaRow.className = 'dt-meta-row';
    metaRow.innerHTML = `
      <span class="dt-count-badge">📊 Mostrando <strong class="dt-count-num">${rowData.length}</strong> de ${rowData.length} itens</span>
      <span class="dt-hint-badge">💡 Clique em qualquer item para ver detalhes completos</span>
    `;

    toolbar.appendChild(searchWrapper);
    toolbar.appendChild(metaRow);
    tableView.appendChild(toolbar);

    // Scrollable Table
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'dt-scroll-container';

    const newTable = document.createElement('table');
    newTable.className = 'dt-interactive-table';

    // Table Header
    const newThead = document.createElement('thead');
    const headerTr = document.createElement('tr');
    headerTexts.forEach((hText, colIdx) => {
      const th = document.createElement('th');
      th.className = 'dt-sortable-th';
      th.setAttribute('data-col', colIdx);
      th.innerHTML = `<span>${hText}</span> <span class="dt-sort-arrow">↕</span>`;
      th.title = `Clique para ordenar por "${hText}"`;
      th.onclick = () => sortTableByColumn(newTable, colIdx);
      headerTr.appendChild(th);
    });
    const actionTh = document.createElement('th');
    actionTh.className = 'dt-action-th';
    actionTh.textContent = 'Ação';
    headerTr.appendChild(actionTh);
    newThead.appendChild(headerTr);
    newTable.appendChild(newThead);

    // Table Body
    const newTbody = document.createElement('tbody');
    rowData.forEach(item => {
      const tr = document.createElement('tr');
      tr.className = 'dt-row';
      tr.setAttribute('data-item-index', item.index);
      tr.title = `Clique para abrir o detalhamento de "${item.primaryName}"`;

      item.cells.forEach((cell, cellIdx) => {
        const td = document.createElement('td');
        if (cellIdx === 0) {
          td.classList.add('dt-primary-cell');
          const rowImg = lookupImage(item.primaryName, item.secondaryName);
          if (rowImg) {
            td.innerHTML = `
              <div class="dt-row-name-group">
                <img src="${rowImg}" alt="${item.primaryName}" class="dt-row-avatar" loading="lazy" />
                <span>${cell.html}</span>
              </div>
            `;
          } else {
            td.innerHTML = cell.html;
          }
        } else {
          td.innerHTML = cell.html;
        }
        tr.appendChild(td);
      });

      // Action Cell
      const actionTd = document.createElement('td');
      actionTd.className = 'dt-action-cell';
      actionTd.innerHTML = `<button type="button" class="dt-btn-view-item">👁️ Abrir</button>`;
      tr.appendChild(actionTd);

      // Click on row opens detail view
      tr.onclick = () => {
        openItemDetail(item, headerTexts, widget);
      };

      newTbody.appendChild(tr);
    });
    newTable.appendChild(newTbody);
    scrollContainer.appendChild(newTable);
    tableView.appendChild(scrollContainer);

    // Empty state
    const emptyState = document.createElement('div');
    emptyState.className = 'dt-empty-state';
    emptyState.style.display = 'none';
    emptyState.innerHTML = `
      <div class="dt-empty-icon">🔍</div>
      <p class="dt-empty-text">Nenhum item encontrado para "<strong class="dt-empty-term"></strong>".</p>
      <button type="button" class="dt-btn-clear-filter">Limpar Filtro</button>
    `;
    tableView.appendChild(emptyState);

    // --- VIEW 2: Detail View (Inside Chat Bubble) ---
    const detailView = document.createElement('div');
    detailView.className = 'dt-detail-view';
    detailView.style.display = 'none';

    // Detail Topbar with Back button
    const detailTopbar = document.createElement('div');
    detailTopbar.className = 'dt-detail-topbar';
    detailTopbar.innerHTML = `
      <button type="button" class="dt-btn-back">
        <span class="dt-back-arrow">⬅️</span> <strong>Voltar à lista</strong>
      </button>
      <span class="dt-detail-badge">📜 Detalhamento do Item</span>
    `;
    const backBtn = detailTopbar.querySelector('.dt-btn-back');
    backBtn.onclick = () => {
      detailView.style.display = 'none';
      tableView.style.display = 'block';
      widget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    const detailBody = document.createElement('div');
    detailBody.className = 'dt-detail-body';

    detailView.appendChild(detailTopbar);
    detailView.appendChild(detailBody);

    widget.appendChild(tableView);
    widget.appendChild(detailView);

    // Replace old static table with new interactive widget
    table.parentNode.replaceChild(widget, table);

    // --- Wire Up Search Functionality ---
    const searchInput = searchWrapper.querySelector('.dt-search-input');
    const clearBtn = searchWrapper.querySelector('.dt-search-clear');
    const countNum = metaRow.querySelector('.dt-count-num');
    const emptyTerm = emptyState.querySelector('.dt-empty-term');
    const clearFilterBtn = emptyState.querySelector('.dt-btn-clear-filter');

    function applySearch() {
      const term = searchInput.value.trim().toLowerCase();
      const normTerm = normalizeSearchText(term);

      if (term.length > 0) {
        clearBtn.style.display = 'block';
      } else {
        clearBtn.style.display = 'none';
      }

      let visibleCount = 0;
      const allRows = newTbody.querySelectorAll('tr.dt-row');
      allRows.forEach(tr => {
        const textContent = normalizeSearchText(tr.textContent);
        if (!normTerm || textContent.includes(normTerm)) {
          tr.style.display = '';
          visibleCount++;
        } else {
          tr.style.display = 'none';
        }
      });

      countNum.textContent = visibleCount;
      if (visibleCount === 0) {
        emptyTerm.textContent = term;
        emptyState.style.display = 'flex';
        scrollContainer.style.display = 'none';
      } else {
        emptyState.style.display = 'none';
        scrollContainer.style.display = 'block';
      }
    }

    searchInput.addEventListener('input', applySearch);

    clearBtn.onclick = (e) => {
      e.stopPropagation();
      searchInput.value = '';
      applySearch();
      searchInput.focus();
    };

    clearFilterBtn.onclick = (e) => {
      e.stopPropagation();
      searchInput.value = '';
      applySearch();
      searchInput.focus();
    };
  });
}

// Open inline item detail inside the chat widget
async function openItemDetail(item, headers, widget) {
  const tableView = widget.querySelector('.dt-table-view');
  const detailView = widget.querySelector('.dt-detail-view');
  const detailBody = widget.querySelector('.dt-detail-body');

  tableView.style.display = 'none';
  detailView.style.display = 'block';

  // Extract properties
  const itemName = item.primaryName;
  const itemSubtitle = item.secondaryName && item.secondaryName !== itemName ? item.secondaryName : '';

  // Build Attribute Cards
  let attrCardsHtml = '';
  headers.forEach((hName, idx) => {
    const val = item.cells[idx]?.text || '';
    if (val && idx !== 0) {
      attrCardsHtml += `
        <div class="dt-attr-card">
          <span class="dt-attr-label">${hName}</span>
          <span class="dt-attr-value">${val}</span>
        </div>
      `;
    }
  });

  // Build Initial Artwork (if already in catalog)
  const initialImg = lookupImage(itemName, itemSubtitle);
  let initialImgHtml = '';
  if (initialImg) {
    initialImgHtml = `
      <div class="dt-detail-image-box" id="dtImageBox_${item.index}">
        <div class="dt-artwork-container">
          <img src="${initialImg}" alt="${itemName}" class="dt-artwork-img" loading="lazy" />
          <div class="dt-artwork-caption">
            <span>🎨 Ilustração Oficial D&D 2024 / SRD</span>
          </div>
        </div>
      </div>
    `;
  } else {
    initialImgHtml = `<div class="dt-detail-image-box" id="dtImageBox_${item.index}" style="display: none;"></div>`;
  }

  // Render detail view layout
  detailBody.innerHTML = `
    <div class="dt-detail-header">
      <div class="dt-detail-title-group">
        <h3 class="dt-detail-title">${itemName}</h3>
        ${itemSubtitle ? `<span class="dt-detail-sub">(${itemSubtitle})</span>` : ''}
      </div>
      <button type="button" class="dt-btn-ask-oracle" id="btnAskOracle_${item.index}">
        🔮 Perguntar ao Oráculo
      </button>
    </div>

    ${initialImgHtml}

    ${attrCardsHtml ? `<div class="dt-attr-grid">${attrCardsHtml}</div>` : ''}

    <div class="dt-detail-content-area" id="dtContentArea_${item.index}">
      <div class="dt-loading-doc">
        <span class="dt-spinner">⏳</span>
        <span>Consultando acervo oficial do D&D 2024 para <strong>${itemName}</strong>...</span>
      </div>
    </div>

    <div class="dt-detail-footer">
      <button type="button" class="dt-btn-back dt-btn-back-footer">
        <span class="dt-back-arrow">⬅️</span> <strong>Voltar à lista</strong>
      </button>
    </div>
  `;

  // Wire buttons
  const askBtn = detailBody.querySelector(`#btnAskOracle_${item.index}`);
  if (askBtn) {
    askBtn.onclick = () => {
      userInput.value = `Quais são todos os detalhes oficiais, estatísticas e regras de "${itemName}" no D&D 2024?`;
      handleSend();
    };
  }

  const footerBackBtn = detailBody.querySelector('.dt-btn-back-footer');
  if (footerBackBtn) {
    footerBackBtn.onclick = () => {
      detailView.style.display = 'none';
      tableView.style.display = 'block';
      widget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
  }

  widget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Fetch full details from /api/item_detail
  const contentArea = detailBody.querySelector(`#dtContentArea_${item.index}`);
  try {
    const res = await fetch(`/api/item_detail?query=${encodeURIComponent(itemName)}`);
    if (res.ok) {
      const data = await res.json();
      
      // If server returned an image, update or reveal artwork box
      if (data.image_url) {
        const imgBox = detailBody.querySelector(`#dtImageBox_${item.index}`);
        if (imgBox) {
          imgBox.innerHTML = `
            <div class="dt-artwork-container">
              <img src="${data.image_url}" alt="${itemName}" class="dt-artwork-img" loading="lazy" />
              <div class="dt-artwork-caption">
                <span>🎨 Ilustração Oficial D&D 2024 / SRD</span>
              </div>
            </div>
          `;
          imgBox.style.display = 'flex';
        }
      }

      if (data.found && data.content) {
        let cleanDoc = data.content.replace(/^---[\s\S]*?---\s*/, '');
        contentArea.innerHTML = `
          <div class="dt-official-badge">
            📜 <strong>Regra Oficial do Livro (SRD 2024)</strong> &bull; <em>${data.category || 'Compêndio'}</em>
          </div>
          <div class="dt-markdown-content markdown-body">
            ${marked.parse(cleanDoc)}
          </div>
        `;
        return;
      }
    }
  } catch (err) {
    console.warn('Erro ao buscar item_detail:', err);
  }

  // Fallback: If no dedicated document exists, display structured attribute summary
  const summaryParts = item.cells.map((c, i) => `**${headers[i]}:** ${c.text}`).join('\n\n');
  contentArea.innerHTML = `
    <div class="dt-custom-summary">
      <div class="dt-official-badge" style="background: rgba(139, 92, 246, 0.15); border-color: rgba(139, 92, 246, 0.4); color: #c4b5fd;">
        ✨ <strong>Ficha Resumida do Item</strong>
      </div>
      <div class="dt-markdown-content markdown-body">
        ${marked.parse(summaryParts)}
      </div>
    </div>
  `;
}

function normalizeSearchText(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Table Column Sorting
function sortTableByColumn(table, colIdx) {
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr.dt-row'));
  const th = table.querySelectorAll('th.dt-sortable-th')[colIdx];
  const isAsc = th.getAttribute('data-sort-dir') !== 'asc';

  table.querySelectorAll('th.dt-sortable-th').forEach(header => {
    header.removeAttribute('data-sort-dir');
    const arrow = header.querySelector('.dt-sort-arrow');
    if (arrow) arrow.textContent = '↕';
  });

  th.setAttribute('data-sort-dir', isAsc ? 'asc' : 'desc');
  const arrow = th.querySelector('.dt-sort-arrow');
  if (arrow) arrow.textContent = isAsc ? '▲' : '▼';

  rows.sort((a, b) => {
    const valA = a.querySelectorAll('td')[colIdx]?.textContent.trim() || '';
    const valB = b.querySelectorAll('td')[colIdx]?.textContent.trim() || '';

    const numA = parseFloat(valA.replace('/', '.'));
    const numB = parseFloat(valB.replace('/', '.'));
    if (!isNaN(numA) && !isNaN(numB)) {
      return isAsc ? numA - numB : numB - numA;
    }
    return isAsc ? valA.localeCompare(valB, 'pt-BR') : valB.localeCompare(valA, 'pt-BR');
  });

  rows.forEach(r => tbody.appendChild(r));
}

'use strict';

const VAULT_KEY = 'stop_gastos_vault_v1';
const APP_VERSION = 1;
const KDF_ITERATIONS = 180000;

let appState = null;
let sessionKey = null;
let sessionSalt = null;
let selectedMonth = currentMonthKey();
let calendarMonth = selectedMonth;
let pendingBackup = null;
let pendingConfirm = null;
let lockTimer = null;
let defaultsCache = null;

const fallbackCategories = [
  {id:'moradia',name:'Moradia',icon:'🏠',color:'#7c5cff'},
  {id:'alimentacao',name:'Alimentação',icon:'🍽️',color:'#17c3b2'},
  {id:'transporte',name:'Transporte',icon:'🚗',color:'#ff9f1c'},
  {id:'saude',name:'Saúde',icon:'❤️',color:'#ff5d8f'},
  {id:'educacao',name:'Educação',icon:'📚',color:'#2d9cdb'},
  {id:'lazer',name:'Lazer',icon:'🎮',color:'#9b51e0'},
  {id:'assinaturas',name:'Assinaturas',icon:'📺',color:'#00b4d8'},
  {id:'compras',name:'Compras',icon:'🛍️',color:'#f15bb5'},
  {id:'dividas',name:'Dívidas',icon:'💳',color:'#ef476f'},
  {id:'investimentos',name:'Investimentos',icon:'📈',color:'#06d6a0'},
  {id:'salario',name:'Salário',icon:'💼',color:'#4caf50'},
  {id:'outros',name:'Outros',icon:'📦',color:'#8d99ae'}
];

const pageMeta = {
  dashboard:['Dashboard','Visão geral das suas finanças'],
  transactions:['Lançamentos','Todas as receitas e despesas'],
  recurring:['Custos fixos','Recorrências mensais automáticas'],
  budgets:['Orçamentos','Planeje seus limites por categoria'],
  goals:['Metas','Acompanhe seus objetivos financeiros'],
  calendar:['Calendário','Movimentações organizadas por dia'],
  reports:['Relatórios','Entenda seus hábitos financeiros'],
  settings:['Configurações','Segurança, aparência e backups']
};

const $ = function(sel, root){ return (root || document).querySelector(sel); };
const $$ = function(sel, root){ return Array.from((root || document).querySelectorAll(sel)); };

document.addEventListener('DOMContentLoaded', init);

async function init(){
  defaultsCache = await loadDefaults();
  selectedMonth = currentMonthKey();
  calendarMonth = selectedMonth;
  $('#globalMonth').value = selectedMonth;
  bindEvents();
  setupPwa();
  const existing = localStorage.getItem(VAULT_KEY);
  if(existing){
    $('#unlockBox').hidden = false;
  }else{
    $('#setupBox').hidden = false;
  }
}

async function loadDefaults(){
  try{
    const response = await fetch('defaults.json', {cache:'no-store'});
    if(!response.ok) throw new Error('defaults');
    return await response.json();
  }catch(err){
    return {currency:'BRL',locale:'pt-BR',monthlyBudget:5000,autoLockMinutes:10,categories:fallbackCategories};
  }
}

function makeInitialState(){
  return {
    version:APP_VERSION,
    createdAt:new Date().toISOString(),
    categories:clone(defaultsCache.categories || fallbackCategories),
    transactions:[],
    recurring:[],
    budgets:[],
    goals:[],
    settings:{
      currency:defaultsCache.currency || 'BRL',
      locale:defaultsCache.locale || 'pt-BR',
      monthlyBudget:Number(defaultsCache.monthlyBudget || 5000),
      autoLockMinutes:Number(defaultsCache.autoLockMinutes || 10),
      theme:'system'
    }
  };
}

function normalizeState(data){
  const base = makeInitialState();
  if(!data || typeof data !== 'object') return base;
  return {
    version:APP_VERSION,
    createdAt:data.createdAt || base.createdAt,
    categories:Array.isArray(data.categories) && data.categories.length ? data.categories : base.categories,
    transactions:Array.isArray(data.transactions) ? data.transactions : [],
    recurring:Array.isArray(data.recurring) ? data.recurring : [],
    budgets:Array.isArray(data.budgets) ? data.budgets : [],
    goals:Array.isArray(data.goals) ? data.goals : [],
    settings:Object.assign({}, base.settings, data.settings || {})
  };
}

function bindEvents(){
  $('#setupForm').addEventListener('submit', setupVault);
  $('#unlockForm').addEventListener('submit', unlockVault);
  $('#menuBtn').addEventListener('click', function(){ $('#sidebar').classList.toggle('open'); });
  $('#themeBtn').addEventListener('click', quickToggleTheme);
  $('#quickAddBtn').addEventListener('click', function(){ openModal('transaction'); });
  $('#globalMonth').addEventListener('change', async function(e){
    selectedMonth = e.target.value || currentMonthKey();
    calendarMonth = selectedMonth;
    ensureRecurringForMonth(selectedMonth);
    await saveVault();
    renderAll();
  });

  $$('[data-nav]').forEach(function(el){
    el.addEventListener('click', function(){
      navigate(el.getAttribute('data-nav'));
    });
  });
  $$('[data-open]').forEach(function(el){
    el.addEventListener('click', function(){
      openModal(el.getAttribute('data-open'));
    });
  });

  $('#modalClose').addEventListener('click', closeModal);
  $$('.modal-cancel').forEach(function(btn){ btn.addEventListener('click', closeModal); });
  $('#modalBackdrop').addEventListener('click', function(e){ if(e.target === e.currentTarget) closeModal(); });

  $('#transactionForm').addEventListener('submit', saveTransactionForm);
  $('#recurringForm').addEventListener('submit', saveRecurringForm);
  $('#budgetForm').addEventListener('submit', saveBudgetForm);
  $('#goalForm').addEventListener('submit', saveGoalForm);
  $('#backupPinForm').addEventListener('submit', restoreBackupWithPin);

  $('#transactionSearch').addEventListener('input', renderTransactions);
  $('#transactionTypeFilter').addEventListener('change', renderTransactions);
  $('#transactionCategoryFilter').addEventListener('change', renderTransactions);

  $('#prevCalendar').addEventListener('click', function(){ calendarMonth = shiftMonth(calendarMonth,-1); renderCalendar(); });
  $('#nextCalendar').addEventListener('click', function(){ calendarMonth = shiftMonth(calendarMonth,1); renderCalendar(); });

  $('#themeSelect').addEventListener('change', async function(e){
    appState.settings.theme = e.target.value;
    applyTheme();
    await saveVault();
  });
  $('#monthlyBudgetInput').addEventListener('change', async function(e){
    appState.settings.monthlyBudget = Math.max(0, Number(e.target.value || 0));
    await saveVault();
    renderAll();
    toast('Limite mensal atualizado.','success');
  });
  $('#autoLockSelect').addEventListener('change', async function(e){
    appState.settings.autoLockMinutes = Number(e.target.value);
    await saveVault();
    resetAutoLock();
  });
  $('#backupBtn').addEventListener('click', exportEncryptedBackup);
  $('#restoreInput').addEventListener('change', readBackupFile);
  $('#lockBtn').addEventListener('click', lockVault);
  $('#demoBtn').addEventListener('click', loadDemoData);
  $('#wipeBtn').addEventListener('click', wipeVault);
  $('#exportCsvBtn').addEventListener('click', exportCsv);

  $('#confirmCancel').addEventListener('click', function(){ resolveConfirm(false); });
  $('#confirmOk').addEventListener('click', function(){ resolveConfirm(true); });
  $('#confirmBackdrop').addEventListener('click', function(e){ if(e.target === e.currentTarget) resolveConfirm(false); });

  ['pointerdown','keydown','touchstart'].forEach(function(evt){
    document.addEventListener(evt, function(){ if(appState) resetAutoLock(); }, {passive:true});
  });

  window.addEventListener('storage', function(e){
    if(e.key === VAULT_KEY && appState) toast('O cofre foi alterado em outra aba. Bloqueie e reabra para sincronizar.','info');
  });
}

async function setupVault(e){
  e.preventDefault();
  const pin = $('#setupPin').value;
  const confirm = $('#setupPinConfirm').value;
  if(pin.length < 4) return toast('Use um PIN com pelo menos 4 caracteres.','error');
  if(pin !== confirm) return toast('Os PINs não conferem.','error');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  sessionKey = await deriveKey(pin, salt);
  sessionSalt = salt;
  appState = makeInitialState();
  await saveVault();
  $('#setupForm').reset();
  openApp();
  toast('Cofre criado e criptografado com sucesso.','success');
}

async function unlockVault(e){
  e.preventDefault();
  const pin = $('#unlockPin').value;
  try{
    const vault = JSON.parse(localStorage.getItem(VAULT_KEY));
    const result = await decryptVault(vault,pin);
    appState = normalizeState(result.data);
    sessionKey = result.key;
    sessionSalt = fromB64(vault.salt);
    $('#unlockForm').reset();
    ensureRecurringForMonth(selectedMonth);
    await saveVault();
    openApp();
    toast('Cofre desbloqueado.','success');
  }catch(err){
    toast('PIN incorreto ou cofre inválido.','error');
  }
}

function openApp(){
  $('#lockScreen').hidden = true;
  $('#appShell').hidden = false;
  populateCategorySelects();
  applyTheme();
  syncSettingsFields();
  renderAll();
  resetAutoLock();
}

function lockVault(){
  appState = null;
  sessionKey = null;
  sessionSalt = null;
  clearTimeout(lockTimer);
  $('#appShell').hidden = true;
  $('#lockScreen').hidden = false;
  $('#setupBox').hidden = true;
  $('#unlockBox').hidden = false;
  $('#unlockPin').value = '';
  setTimeout(function(){ $('#unlockPin').focus(); },80);
}

async function wipeVault(){
  const ok = await confirmDialog('Apagar todos os dados?','Esta ação remove o cofre deste dispositivo e não pode ser desfeita. Exporte um backup antes se quiser preservar seus dados.');
  if(!ok) return;
  localStorage.removeItem(VAULT_KEY);
  appState = null;
  sessionKey = null;
  sessionSalt = null;
  clearTimeout(lockTimer);
  $('#appShell').hidden = true;
  $('#lockScreen').hidden = false;
  $('#unlockBox').hidden = true;
  $('#setupBox').hidden = false;
  $('#setupForm').reset();
  toast('Dados locais removidos.','success');
}

async function deriveKey(pin,salt){
  const material = await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2',salt:salt,iterations:KDF_ITERATIONS,hash:'SHA-256'},
    material,
    {name:'AES-GCM',length:256},
    false,
    ['encrypt','decrypt']
  );
}

async function saveVault(){
  if(!appState || !sessionKey || !sessionSalt) return;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify(appState));
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv:iv},sessionKey,bytes);
  const vault = {
    app:'stop-gastos',
    version:APP_VERSION,
    kdf:'PBKDF2-SHA256',
    iterations:KDF_ITERATIONS,
    algorithm:'AES-GCM-256',
    salt:toB64(sessionSalt),
    iv:toB64(iv),
    cipher:toB64(new Uint8Array(cipher)),
    updatedAt:new Date().toISOString()
  };
  localStorage.setItem(VAULT_KEY,JSON.stringify(vault));
}

async function decryptVault(vault,pin){
  if(!vault || !vault.salt || !vault.iv || !vault.cipher) throw new Error('invalid vault');
  const salt = fromB64(vault.salt);
  const key = await deriveKey(pin,salt);
  const plain = await crypto.subtle.decrypt(
    {name:'AES-GCM',iv:fromB64(vault.iv)},
    key,
    fromB64(vault.cipher)
  );
  return {data:JSON.parse(new TextDecoder().decode(plain)),key:key};
}

function toB64(bytes){
  let binary = '';
  for(let i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromB64(value){
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function exportEncryptedBackup(){
  await saveVault();
  const vault = localStorage.getItem(VAULT_KEY);
  if(!vault) return;
  downloadBlob(vault,'stop-gastos-backup-' + new Date().toISOString().slice(0,10) + '.json','application/json');
  toast('Backup criptografado exportado.','success');
}

async function readBackupFile(e){
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!file) return;
  try{
    const json = JSON.parse(await file.text());
    if(json.app !== 'stop-gastos' || !json.cipher) throw new Error('format');
    pendingBackup = json;
    openModal('backupPin');
  }catch(err){
    toast('Arquivo de backup inválido.','error');
  }
}

async function restoreBackupWithPin(e){
  e.preventDefault();
  if(!pendingBackup) return;
  try{
    const pin = $('#backupImportPin').value;
    const result = await decryptVault(pendingBackup,pin);
    const imported = normalizeState(result.data);
    const ok = await confirmDialog('Restaurar este backup?','Os dados atuais serão substituídos pelo conteúdo do arquivo importado.');
    if(!ok) return;
    appState = imported;
    pendingBackup = null;
    await saveVault();
    closeModal();
    populateCategorySelects();
    syncSettingsFields();
    applyTheme();
    renderAll();
    toast('Backup restaurado com sucesso.','success');
  }catch(err){
    toast('PIN do backup incorreto ou arquivo corrompido.','error');
  }
}

function navigate(name){
  if(!pageMeta[name]) name = 'dashboard';
  $$('.view').forEach(function(v){ v.classList.remove('active'); });
  const target = $('#view-' + name);
  if(target) target.classList.add('active');
  $$('.nav-item,[data-nav]').forEach(function(n){
    n.classList.toggle('active',n.getAttribute('data-nav') === name);
  });
  $('#pageTitle').textContent = pageMeta[name][0];
  $('#pageSubtitle').textContent = pageMeta[name][1];
  $('#sidebar').classList.remove('open');
  if(name === 'transactions') renderTransactions();
  if(name === 'recurring') renderRecurring();
  if(name === 'budgets') renderBudgets();
  if(name === 'goals') renderGoals();
  if(name === 'calendar') renderCalendar();
  if(name === 'reports') renderReports();
  if(name === 'settings') syncSettingsFields();
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderAll(){
  if(!appState) return;
  populateCategorySelects();
  renderDashboard();
  renderTransactions();
  renderRecurring();
  renderBudgets();
  renderGoals();
  renderCalendar();
  renderReports();
  syncSettingsFields();
}

function renderDashboard(){
  const monthTx = transactionsForMonth(selectedMonth);
  const income = sumByType(monthTx,'income');
  const expense = sumByType(monthTx,'expense');
  const balance = income - expense;
  const previous = transactionsForMonth(shiftMonth(selectedMonth,-1));
  const prevIncome = sumByType(previous,'income');
  const prevExpense = sumByType(previous,'expense');

  $('#kpiIncome').textContent = money(income);
  $('#kpiExpense').textContent = money(expense);
  $('#kpiBalance').textContent = money(balance);
  paintDelta($('#kpiIncomeDelta'),income,prevIncome,true);
  paintDelta($('#kpiExpenseDelta'),expense,prevExpense,false);

  const savingsRate = income > 0 ? ((income-expense)/income)*100 : 0;
  $('#kpiSavingsRate').textContent = 'Taxa de economia ' + formatPct(savingsRate);
  $('#kpiSavingsRate').className = 'delta ' + (savingsRate >= 0 ? 'good' : 'bad');

  const days = daysInMonth(selectedMonth);
  const elapsed = elapsedDaysInSelectedMonth(selectedMonth);
  const daily = expense / Math.max(1,elapsed);
  const projection = daily * days;
  $('#kpiDaily').textContent = money(daily);
  $('#kpiProjection').textContent = 'Projeção: ' + money(projection);

  const label = monthLabel(selectedMonth);
  $('#dashboardGreeting').textContent = 'Resumo de ' + label;
  $('#dashboardHint').textContent = expense ? 'Você gastou ' + money(expense) + ' em ' + monthTx.filter(function(t){return t.type==='expense';}).length + ' despesas neste período.' : 'Registre seus gastos e acompanhe o orçamento em tempo real.';

  const limit = Number(appState.settings.monthlyBudget || 0);
  const pct = limit > 0 ? (expense/limit)*100 : 0;
  const degree = Math.min(100,pct)*3.6;
  $('#budgetRing').style.background = 'conic-gradient(var(--primary) ' + degree + 'deg,var(--panel-soft) 0deg)';
  $('#budgetPct').textContent = formatPct(pct);
  $('#budgetSpent').textContent = money(expense);
  $('#budgetLimit').textContent = money(limit);
  $('#budgetRemaining').textContent = money(Math.max(0,limit-expense));

  renderTrend();
  renderCategoryDonut(monthTx);
  renderUpcoming();

  const recent = monthTx.slice().sort(sortTxDesc).slice(0,6);
  $('#recentTransactions').innerHTML = recent.length ? recent.map(transactionRowSimple).join('') : emptyTableRow(5,'Nenhum lançamento neste mês.');
}

function renderTrend(){
  const months = [];
  for(let i=5;i>=0;i--) months.push(shiftMonth(selectedMonth,-i));
  const values = months.map(function(m){
    const tx = transactionsForMonth(m);
    return {month:m,income:sumByType(tx,'income'),expense:sumByType(tx,'expense')};
  });
  const max = Math.max(1,...values.map(function(v){return Math.max(v.income,v.expense);}));
  $('#trendChart').innerHTML = values.map(function(v){
    const expH = Math.max(2,(v.expense/max)*165);
    const incH = Math.max(2,(v.income/max)*165);
    return '<div class="trend-month"><div class="trend-bars">' +
      '<i class="trend-bar expense" style="height:' + expH + 'px" data-value="' + esc(money(v.expense)) + '"></i>' +
      '<i class="trend-bar income" style="height:' + incH + 'px" data-value="' + esc(money(v.income)) + '"></i>' +
      '</div><small>' + shortMonth(v.month) + '</small></div>';
  }).join('');
}

function renderCategoryDonut(tx){
  const expenses = tx.filter(function(t){return t.type === 'expense';});
  const total = expenses.reduce(function(a,t){return a+Number(t.amount);},0);
  const map = {};
  expenses.forEach(function(t){ map[t.category] = (map[t.category] || 0) + Number(t.amount); });
  const rows = Object.keys(map).map(function(id){ return {id:id,value:map[id],cat:getCategory(id)}; }).sort(function(a,b){return b.value-a.value;});
  const top = rows.slice(0,5);

  $('#donutTotal').textContent = compactMoney(total);
  if(total <= 0){
    $('#categoryDonut').style.background = 'conic-gradient(var(--panel-soft) 0deg 360deg)';
    $('#categoryLegend').innerHTML = '<div class="empty-state">Sem despesas no período.</div>';
    return;
  }
  let acc = 0;
  const segments = [];
  rows.forEach(function(r){
    const start = acc;
    const end = acc + (r.value/total)*360;
    segments.push(r.cat.color + ' ' + start.toFixed(1) + 'deg ' + end.toFixed(1) + 'deg');
    acc = end;
  });
  $('#categoryDonut').style.background = 'conic-gradient(' + segments.join(',') + ')';
  $('#categoryLegend').innerHTML = top.map(function(r){
    return '<div class="category-legend-row"><i style="background:' + r.cat.color + '"></i><span>' + esc(r.cat.name) + '</span><strong>' + formatPct((r.value/total)*100) + '</strong></div>';
  }).join('');
}

function renderUpcoming(){
  const now = new Date();
  const currentMonth = now.getFullYear() + '-' + pad(now.getMonth()+1);
  const items = appState.recurring.filter(function(r){return r.active !== false && r.type === 'expense';}).map(function(r){
    let month = selectedMonth;
    let due = safeMonthDate(month,Number(r.day || 1));
    if(month === currentMonth && due < startOfDay(now)) due = safeMonthDate(shiftMonth(month,1),Number(r.day || 1));
    return {rec:r,due:due};
  }).sort(function(a,b){return a.due-b.due;}).slice(0,5);

  $('#upcomingList').innerHTML = items.length ? items.map(function(item){
    const c = getCategory(item.rec.category);
    return '<div class="compact-item"><span class="compact-icon">' + c.icon + '</span><div class="grow"><b>' + esc(item.rec.description) + '</b><small>Vence ' + dateBR(item.due.toISOString().slice(0,10)) + '</small></div><strong>' + money(item.rec.amount) + '</strong></div>';
  }).join('') : '<div class="empty-state">Nenhum custo fixo cadastrado.</div>';
}

function renderTransactions(){
  if(!appState) return;
  const q = ($('#transactionSearch').value || '').trim().toLowerCase();
  const type = $('#transactionTypeFilter').value;
  const category = $('#transactionCategoryFilter').value;
  let tx = transactionsForMonth(selectedMonth).slice().sort(sortTxDesc);
  if(type && type !== 'all') tx = tx.filter(function(t){return t.type === type;});
  if(category && category !== 'all') tx = tx.filter(function(t){return t.category === category;});
  if(q) tx = tx.filter(function(t){
    const c = getCategory(t.category);
    return (t.description + ' ' + c.name + ' ' + (t.notes || '')).toLowerCase().includes(q);
  });

  const allMonth = transactionsForMonth(selectedMonth);
  const income = sumByType(allMonth,'income');
  const expense = sumByType(allMonth,'expense');
  $('#transIncome').textContent = money(income);
  $('#transExpense').textContent = money(expense);
  $('#transBalance').textContent = money(income-expense);
  $('#transCount').textContent = String(allMonth.length);

  $('#transactionsTable').innerHTML = tx.map(transactionRowFull).join('');
  $('#transactionsEmpty').hidden = tx.length !== 0;
  bindRowActions();
}

function transactionRowSimple(t){
  const c = getCategory(t.category);
  return '<tr><td><div class="tx-desc"><span class="tx-avatar">' + c.icon + '</span><div><b>' + esc(t.description) + '</b><small>' + esc(t.payment || '') + '</small></div></div></td>' +
    '<td>' + esc(c.name) + '</td><td>' + dateBR(t.date) + '</td><td><span class="type-pill ' + t.type + '">' + (t.type==='expense'?'Despesa':'Receita') + '</span></td>' +
    '<td class="right amount ' + t.type + '">' + (t.type==='expense'?'- ':'+ ') + money(t.amount) + '</td></tr>';
}

function transactionRowFull(t){
  const c = getCategory(t.category);
  return '<tr><td><div class="tx-desc"><span class="tx-avatar">' + c.icon + '</span><div><b>' + esc(t.description) + '</b><small>' + esc(t.notes || (t.sourceRecurringId ? 'Gerado automaticamente' : 'Lançamento manual')) + '</small></div></div></td>' +
    '<td>' + esc(c.name) + '</td><td>' + dateBR(t.date) + '</td><td>' + esc(t.payment || '—') + '</td>' +
    '<td><span class="type-pill ' + t.type + '">' + (t.type==='expense'?'Despesa':'Receita') + '</span></td>' +
    '<td class="right amount ' + t.type + '">' + (t.type==='expense'?'- ':'+ ') + money(t.amount) + '</td>' +
    '<td><div class="row-actions"><button class="row-btn edit-tx" data-id="' + t.id + '" title="Editar">✎</button><button class="row-btn delete-tx" data-id="' + t.id + '" title="Excluir">×</button></div></td></tr>';
}

function bindRowActions(){
  $$('.edit-tx').forEach(function(btn){ btn.onclick = function(){ editTransaction(btn.dataset.id); }; });
  $$('.delete-tx').forEach(function(btn){ btn.onclick = function(){ deleteTransaction(btn.dataset.id); }; });
}

function renderRecurring(){
  if(!appState) return;
  const list = appState.recurring.slice().sort(function(a,b){return Number(a.day)-Number(b.day);});
  $('#recurringEmpty').hidden = list.length !== 0;
  $('#recurringGrid').innerHTML = list.map(function(r){
    const c = getCategory(r.category);
    return '<article class="rec-card"><div class="card-top"><span class="category-icon">' + c.icon + '</span><div class="card-menu"><button class="row-btn edit-rec" data-id="' + r.id + '">✎</button><button class="row-btn delete-rec" data-id="' + r.id + '">×</button></div></div>' +
      '<h4>' + esc(r.description) + '</h4><p>' + esc(c.name) + ' · dia ' + Number(r.day) + '</p>' +
      '<div class="rec-value ' + r.type + '">' + (r.type==='expense'?'- ':'+ ') + money(r.amount) + '</div>' +
      '<div class="rec-bottom"><span class="type-pill ' + r.type + '">' + (r.type==='expense'?'Despesa':'Receita') + '</span><input class="toggle rec-toggle" data-id="' + r.id + '" type="checkbox" ' + (r.active!==false?'checked':'') + ' /></div></article>';
  }).join('');

  $$('.edit-rec').forEach(function(btn){ btn.onclick = function(){ editRecurring(btn.dataset.id); }; });
  $$('.delete-rec').forEach(function(btn){ btn.onclick = function(){ deleteRecurring(btn.dataset.id); }; });
  $$('.rec-toggle').forEach(function(input){
    input.onchange = async function(){
      const rec = appState.recurring.find(function(r){return r.id===input.dataset.id;});
      if(rec){ rec.active = input.checked; await saveVault(); toast(input.checked?'Recorrência ativada.':'Recorrência pausada.','success'); }
    };
  });
}

function renderBudgets(){
  if(!appState) return;
  const monthTx = transactionsForMonth(selectedMonth).filter(function(t){return t.type==='expense';});
  const expense = monthTx.reduce(function(a,t){return a+Number(t.amount);},0);
  const general = Number(appState.settings.monthlyBudget || 0);
  const generalPct = general ? (expense/general)*100 : 0;
  $('#budgetOverviewText').textContent = money(expense) + ' de ' + money(general);
  $('#budgetOverviewStatus').textContent = formatPct(generalPct) + ' utilizado';
  $('#budgetOverviewBar').style.width = Math.min(100,generalPct) + '%';

  const list = appState.budgets.slice().sort(function(a,b){return String(a.category).localeCompare(String(b.category));});
  $('#budgetGrid').innerHTML = list.length ? list.map(function(b){
    const c = getCategory(b.category);
    const spent = monthTx.filter(function(t){return t.category===b.category;}).reduce(function(a,t){return a+Number(t.amount);},0);
    const pct = Number(b.amount)>0 ? (spent/Number(b.amount))*100 : 0;
    const remaining = Number(b.amount)-spent;
    return '<article class="budget-card"><div class="card-top"><span class="category-icon">' + c.icon + '</span><div class="card-menu"><button class="row-btn edit-budget" data-id="' + b.id + '">✎</button><button class="row-btn delete-budget" data-id="' + b.id + '">×</button></div></div><h4>' + esc(c.name) + '</h4><p>Limite mensal da categoria</p>' +
      '<div class="budget-values"><strong>' + money(spent) + '</strong><span>de ' + money(b.amount) + '</span></div><div class="progress"><i style="width:' + Math.min(100,pct) + '%"></i></div>' +
      '<div class="budget-status"><span>' + formatPct(pct) + ' usado</span><span>' + (remaining>=0?'restam ':'excedeu ') + money(Math.abs(remaining)) + '</span></div></article>';
  }).join('') : '<div class="empty-block panel"><div>◎</div><h3>Nenhum orçamento por categoria</h3><p>Crie limites específicos para controlar onde você mais gasta.</p></div>';

  $$('.edit-budget').forEach(function(btn){ btn.onclick = function(){ editBudget(btn.dataset.id); }; });
  $$('.delete-budget').forEach(function(btn){ btn.onclick = function(){ deleteBudget(btn.dataset.id); }; });
}

function renderGoals(){
  if(!appState) return;
  const list = appState.goals.slice().sort(function(a,b){return String(a.deadline || '9999').localeCompare(String(b.deadline || '9999'));});
  $('#goalsEmpty').hidden = list.length !== 0;
  $('#goalsGrid').innerHTML = list.map(function(g){
    const pct = Number(g.target)>0 ? (Number(g.current)/Number(g.target))*100 : 0;
    const remaining = Math.max(0,Number(g.target)-Number(g.current));
    return '<article class="goal-card"><div class="card-top"><span class="goal-icon">' + esc(g.icon || '🎯') + '</span><div class="card-menu"><button class="row-btn edit-goal" data-id="' + g.id + '">✎</button><button class="row-btn delete-goal" data-id="' + g.id + '">×</button></div></div><h4>' + esc(g.name) + '</h4><p>' + (g.deadline?'Prazo: '+dateBR(g.deadline):'Sem prazo definido') + '</p>' +
      '<div class="goal-amounts"><strong>' + money(g.current) + '</strong><span>de ' + money(g.target) + '</span></div><div class="progress"><i style="width:' + Math.min(100,pct) + '%"></i></div><div class="goal-meta"><span>' + formatPct(pct) + '</span><span>faltam ' + money(remaining) + '</span></div></article>';
  }).join('');

  $$('.edit-goal').forEach(function(btn){ btn.onclick = function(){ editGoal(btn.dataset.id); }; });
  $$('.delete-goal').forEach(function(btn){ btn.onclick = function(){ deleteGoal(btn.dataset.id); }; });
}

function renderCalendar(){
  if(!appState) return;
  const parts = calendarMonth.split('-').map(Number);
  const year = parts[0], monthIndex = parts[1]-1;
  const first = new Date(year,monthIndex,1);
  const start = new Date(year,monthIndex,1-first.getDay());
  $('#calendarTitle').textContent = monthLabel(calendarMonth);
  const todayKey = localDateKey(new Date());
  const cells = [];

  for(let i=0;i<42;i++){
    const d = new Date(start);
    d.setDate(start.getDate()+i);
    const key = localDateKey(d);
    const inMonth = d.getMonth() === monthIndex;
    const tx = appState.transactions.filter(function(t){return t.date===key;}).sort(sortTxDesc);
    const out = tx.filter(function(t){return t.type==='expense';}).reduce(function(a,t){return a+Number(t.amount);},0);
    const events = tx.slice(0,3).map(function(t){
      return '<span class="calendar-event ' + t.type + '" title="' + esc(t.description) + '">' + esc(t.description) + '</span>';
    }).join('');
    cells.push('<div class="calendar-cell ' + (inMonth?'':'outside ') + (key===todayKey?'today':'') + '"><span class="day-number">' + d.getDate() + '</span>' + (out?'<span class="day-total">-'+compactMoney(out)+'</span>':'') + events + '</div>');
  }
  $('#calendarGrid').innerHTML = cells.join('');
}

function renderReports(){
  if(!appState) return;
  const year = Number(selectedMonth.slice(0,4));
  const yearTx = appState.transactions.filter(function(t){return Number(t.date.slice(0,4))===year;});
  const monthTx = transactionsForMonth(selectedMonth);
  const expenses = monthTx.filter(function(t){return t.type==='expense';});
  const income = sumByType(monthTx,'income');
  const expense = sumByType(monthTx,'expense');

  const catMap = {};
  expenses.forEach(function(t){catMap[t.category]=(catMap[t.category]||0)+Number(t.amount);});
  const catRows = Object.keys(catMap).map(function(id){return {id:id,value:catMap[id],cat:getCategory(id)};}).sort(function(a,b){return b.value-a.value;});
  const topCat = catRows[0];

  const fixed = expenses.filter(function(t){return !!t.sourceRecurringId;}).reduce(function(a,t){return a+Number(t.amount);},0);
  const largest = expenses.slice().sort(function(a,b){return Number(b.amount)-Number(a.amount);})[0];
  const savings = income ? ((income-expense)/income)*100 : 0;

  $('#insightGrid').innerHTML =
    insightCard('Maior categoria',topCat?topCat.cat.icon+' '+topCat.cat.name:'—',topCat?money(topCat.value):'Sem despesas') +
    insightCard('Maior gasto',largest?money(largest.amount):'—',largest?largest.description:'Sem despesas') +
    insightCard('Custos fixos',money(fixed),expense?formatPct((fixed/expense)*100)+' das despesas':'Sem despesas') +
    insightCard('Taxa de economia',formatPct(savings),savings>=20?'Boa margem de economia':(savings>=0?'Há espaço para melhorar':'Despesas acima das receitas'));

  const annualRows = [];
  for(let m=1;m<=12;m++){
    const key = year + '-' + pad(m);
    const tx = appState.transactions.filter(function(t){return t.date.slice(0,7)===key;});
    const inc = sumByType(tx,'income');
    const exp = sumByType(tx,'expense');
    const bal = inc-exp;
    const rate = inc ? (bal/inc)*100 : 0;
    annualRows.push('<tr><td>' + shortMonth(key) + '</td><td class="right amount income">' + money(inc) + '</td><td class="right amount expense">' + money(exp) + '</td><td class="right">' + money(bal) + '</td><td>' + formatPct(rate) + '</td></tr>');
  }
  $('#annualReportTable').innerHTML = annualRows.join('');

  const totalCat = catRows.reduce(function(a,r){return a+r.value;},0);
  $('#rankingList').innerHTML = catRows.slice(0,8).map(function(r,i){
    return '<div class="rank-row"><span>#' + (i+1) + '</span><div class="rank-info"><b>' + r.cat.icon + ' ' + esc(r.cat.name) + '</b><small>' + (totalCat?formatPct((r.value/totalCat)*100):'0%') + ' das despesas</small></div><strong>' + money(r.value) + '</strong></div>';
  }).join('') || '<div class="empty-state">Sem dados para o período.</div>';
}

function insightCard(label,value,caption){
  return '<article class="insight-card"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><p>' + esc(caption) + '</p></article>';
}

function openModal(type,data){
  closeModalForms();
  $('#modalBackdrop').hidden = false;
  document.body.style.overflow = 'hidden';

  if(type === 'transaction'){
    $('#modalTitle').textContent = data ? 'Editar lançamento' : 'Novo lançamento';
    $('#modalEyebrow').textContent = data ? 'EDITAR' : 'NOVO';
    $('#transactionForm').hidden = false;
    $('#transactionForm').reset();
    $('#transactionId').value = data ? data.id : '';
    setRadio('txType',data ? data.type : 'expense');
    $('#txDescription').value = data ? data.description : '';
    $('#txAmount').value = data ? data.amount : '';
    $('#txDate').value = data ? data.date : localDateKey(new Date());
    $('#txCategory').value = data ? data.category : 'alimentacao';
    $('#txPayment').value = data ? (data.payment || 'Pix') : 'Pix';
    $('#txNotes').value = data ? (data.notes || '') : '';
  }
  if(type === 'recurring'){
    $('#modalTitle').textContent = data ? 'Editar recorrência' : 'Novo custo fixo';
    $('#modalEyebrow').textContent = data ? 'EDITAR' : 'RECORRÊNCIA';
    $('#recurringForm').hidden = false;
    $('#recurringForm').reset();
    $('#recurringId').value = data ? data.id : '';
    setRadio('recType',data ? data.type : 'expense');
    $('#recDescription').value = data ? data.description : '';
    $('#recAmount').value = data ? data.amount : '';
    $('#recDay').value = data ? data.day : new Date().getDate();
    $('#recCategory').value = data ? data.category : 'moradia';
    $('#recPayment').value = data ? (data.payment || 'Débito automático') : 'Débito automático';
    $('#recActive').checked = data ? data.active !== false : true;
  }
  if(type === 'budget'){
    $('#modalTitle').textContent = data ? 'Editar orçamento' : 'Novo orçamento';
    $('#modalEyebrow').textContent = data ? 'EDITAR' : 'PLANEJAMENTO';
    $('#budgetForm').hidden = false;
    $('#budgetForm').reset();
    $('#budgetId').value = data ? data.id : '';
    $('#budgetCategory').value = data ? data.category : 'alimentacao';
    $('#budgetAmount').value = data ? data.amount : '';
  }
  if(type === 'goal'){
    $('#modalTitle').textContent = data ? 'Editar meta' : 'Nova meta';
    $('#modalEyebrow').textContent = data ? 'EDITAR' : 'OBJETIVO';
    $('#goalForm').hidden = false;
    $('#goalForm').reset();
    $('#goalId').value = data ? data.id : '';
    $('#goalName').value = data ? data.name : '';
    $('#goalTarget').value = data ? data.target : '';
    $('#goalCurrent').value = data ? data.current : 0;
    $('#goalDeadline').value = data ? (data.deadline || '') : '';
    $('#goalIcon').value = data ? (data.icon || '🎯') : '🎯';
  }
  if(type === 'backupPin'){
    $('#modalTitle').textContent = 'Restaurar backup';
    $('#modalEyebrow').textContent = 'CRIPTOGRAFADO';
    $('#backupPinForm').hidden = false;
    $('#backupPinForm').reset();
  }
}

function closeModalForms(){
  ['transactionForm','recurringForm','budgetForm','goalForm','backupPinForm'].forEach(function(id){ $('#'+id).hidden = true; });
}

function closeModal(){
  $('#modalBackdrop').hidden = true;
  document.body.style.overflow = '';
  pendingBackup = pendingBackup;
}

async function saveTransactionForm(e){
  e.preventDefault();
  const id = $('#transactionId').value;
  const record = {
    id:id || uid('tx'),
    type:getRadio('txType'),
    description:$('#txDescription').value.trim(),
    amount:Number($('#txAmount').value),
    date:$('#txDate').value,
    category:$('#txCategory').value,
    payment:$('#txPayment').value,
    notes:$('#txNotes').value.trim(),
    updatedAt:new Date().toISOString()
  };
  if(!record.description || !record.date || !(record.amount>0)) return toast('Preencha descrição, valor e data.','error');
  const index = appState.transactions.findIndex(function(t){return t.id===id;});
  if(index>=0) record.sourceRecurringId = appState.transactions[index].sourceRecurringId;
  if(index>=0) record.recurrenceKey = appState.transactions[index].recurrenceKey;
  if(index>=0) appState.transactions[index] = Object.assign({},appState.transactions[index],record);
  else appState.transactions.push(record);
  await saveVault();
  closeModal();
  renderAll();
  toast(index>=0?'Lançamento atualizado.':'Lançamento salvo.','success');
}

async function saveRecurringForm(e){
  e.preventDefault();
  const id = $('#recurringId').value;
  const record = {
    id:id || uid('rec'),
    type:getRadio('recType'),
    description:$('#recDescription').value.trim(),
    amount:Number($('#recAmount').value),
    day:Math.max(1,Math.min(31,Number($('#recDay').value))),
    category:$('#recCategory').value,
    payment:$('#recPayment').value,
    active:$('#recActive').checked,
    updatedAt:new Date().toISOString()
  };
  if(!record.description || !(record.amount>0)) return toast('Preencha descrição e valor.','error');
  const index = appState.recurring.findIndex(function(r){return r.id===id;});
  if(index>=0) appState.recurring[index] = Object.assign({},appState.recurring[index],record);
  else appState.recurring.push(record);
  ensureRecurringForMonth(selectedMonth);
  await saveVault();
  closeModal();
  renderAll();
  toast(index>=0?'Recorrência atualizada.':'Recorrência criada.','success');
}

async function saveBudgetForm(e){
  e.preventDefault();
  const id = $('#budgetId').value;
  const category = $('#budgetCategory').value;
  const amount = Number($('#budgetAmount').value);
  if(!(amount>0)) return toast('Informe um limite maior que zero.','error');
  const duplicate = appState.budgets.find(function(b){return b.category===category && b.id!==id;});
  if(duplicate) return toast('Já existe um orçamento para esta categoria. Edite o existente.','error');
  const record = {id:id||uid('bud'),category:category,amount:amount,updatedAt:new Date().toISOString()};
  const index = appState.budgets.findIndex(function(b){return b.id===id;});
  if(index>=0) appState.budgets[index] = record; else appState.budgets.push(record);
  await saveVault();
  closeModal();
  renderAll();
  toast('Orçamento salvo.','success');
}

async function saveGoalForm(e){
  e.preventDefault();
  const id = $('#goalId').value;
  const record = {
    id:id || uid('goal'),
    name:$('#goalName').value.trim(),
    target:Number($('#goalTarget').value),
    current:Number($('#goalCurrent').value || 0),
    deadline:$('#goalDeadline').value,
    icon:$('#goalIcon').value,
    updatedAt:new Date().toISOString()
  };
  if(!record.name || !(record.target>0) || record.current<0) return toast('Revise os dados da meta.','error');
  const index = appState.goals.findIndex(function(g){return g.id===id;});
  if(index>=0) appState.goals[index] = record; else appState.goals.push(record);
  await saveVault();
  closeModal();
  renderAll();
  toast('Meta salva.','success');
}

function editTransaction(id){ const item=appState.transactions.find(function(x){return x.id===id;}); if(item) openModal('transaction',item); }
function editRecurring(id){ const item=appState.recurring.find(function(x){return x.id===id;}); if(item) openModal('recurring',item); }
function editBudget(id){ const item=appState.budgets.find(function(x){return x.id===id;}); if(item) openModal('budget',item); }
function editGoal(id){ const item=appState.goals.find(function(x){return x.id===id;}); if(item) openModal('goal',item); }

async function deleteTransaction(id){
  const item = appState.transactions.find(function(x){return x.id===id;});
  if(!item) return;
  if(!await confirmDialog('Excluir lançamento?','"' + item.description + '" será removido permanentemente.')) return;
  appState.transactions = appState.transactions.filter(function(x){return x.id!==id;});
  await saveVault(); renderAll(); toast('Lançamento excluído.','success');
}
async function deleteRecurring(id){
  const item = appState.recurring.find(function(x){return x.id===id;});
  if(!item) return;
  if(!await confirmDialog('Excluir recorrência?','Os lançamentos já gerados serão mantidos. A recorrência "' + item.description + '" deixará de gerar novos lançamentos.')) return;
  appState.recurring = appState.recurring.filter(function(x){return x.id!==id;});
  await saveVault(); renderAll(); toast('Recorrência excluída.','success');
}
async function deleteBudget(id){
  if(!await confirmDialog('Excluir orçamento?','O limite desta categoria será removido.')) return;
  appState.budgets = appState.budgets.filter(function(x){return x.id!==id;});
  await saveVault(); renderAll(); toast('Orçamento excluído.','success');
}
async function deleteGoal(id){
  if(!await confirmDialog('Excluir meta?','O acompanhamento desta meta será removido.')) return;
  appState.goals = appState.goals.filter(function(x){return x.id!==id;});
  await saveVault(); renderAll(); toast('Meta excluída.','success');
}

function ensureRecurringForMonth(monthKey){
  if(!appState) return;
  appState.recurring.filter(function(r){return r.active!==false;}).forEach(function(r){
    const recurrenceKey = r.id + ':' + monthKey;
    if(appState.transactions.some(function(t){return t.recurrenceKey===recurrenceKey;})) return;
    const date = localDateKey(safeMonthDate(monthKey,Number(r.day || 1)));
    appState.transactions.push({
      id:uid('tx'),
      type:r.type,
      description:r.description,
      amount:Number(r.amount),
      date:date,
      category:r.category,
      payment:r.payment || 'Automático',
      notes:'Gerado automaticamente a partir de custo fixo',
      sourceRecurringId:r.id,
      recurrenceKey:recurrenceKey,
      createdAt:new Date().toISOString()
    });
  });
}

async function loadDemoData(){
  const ok = await confirmDialog('Carregar dados de demonstração?','Serão adicionados exemplos de receitas, despesas, recorrências, orçamentos e metas ao cofre atual.');
  if(!ok) return;
  const m0 = currentMonthKey();
  const m1 = shiftMonth(m0,-1);
  const m2 = shiftMonth(m0,-2);
  const makeTx = function(month,day,type,description,amount,category,payment){
    return {id:uid('tx'),type:type,description:description,amount:amount,date:localDateKey(safeMonthDate(month,day)),category:category,payment:payment||'Pix',notes:'Demonstração',createdAt:new Date().toISOString()};
  };
  appState.transactions.push(
    makeTx(m0,5,'income','Salário',6200,'salario','Transferência'),
    makeTx(m0,6,'expense','Supermercado',684.35,'alimentacao','Cartão de crédito'),
    makeTx(m0,9,'expense','Combustível',240,'transporte','Cartão de crédito'),
    makeTx(m0,12,'expense','Farmácia',89.90,'saude','Pix'),
    makeTx(m0,16,'expense','Restaurante',126.50,'lazer','Cartão de crédito'),
    makeTx(m0,21,'expense','Curso online',159.90,'educacao','Cartão de crédito'),
    makeTx(m0,25,'expense','Compras pessoais',312.70,'compras','Cartão de crédito'),
    makeTx(m1,5,'income','Salário',6200,'salario','Transferência'),
    makeTx(m1,7,'expense','Supermercado',740.20,'alimentacao','Cartão de crédito'),
    makeTx(m1,15,'expense','Transporte',380,'transporte','Cartão de crédito'),
    makeTx(m1,20,'expense','Lazer',290,'lazer','Pix'),
    makeTx(m2,5,'income','Salário',6000,'salario','Transferência'),
    makeTx(m2,9,'expense','Supermercado',710,'alimentacao','Cartão de crédito'),
    makeTx(m2,18,'expense','Compras',460,'compras','Cartão de crédito')
  );
  if(!appState.recurring.length){
    appState.recurring.push(
      {id:uid('rec'),type:'expense',description:'Aluguel',amount:1450,day:8,category:'moradia',payment:'Pix',active:true},
      {id:uid('rec'),type:'expense',description:'Internet',amount:119.90,day:10,category:'assinaturas',payment:'Débito automático',active:true},
      {id:uid('rec'),type:'expense',description:'Streaming',amount:55.90,day:15,category:'assinaturas',payment:'Cartão de crédito',active:true}
    );
  }
  if(!appState.budgets.length){
    appState.budgets.push(
      {id:uid('bud'),category:'alimentacao',amount:1200},
      {id:uid('bud'),category:'transporte',amount:650},
      {id:uid('bud'),category:'lazer',amount:500},
      {id:uid('bud'),category:'compras',amount:600}
    );
  }
  if(!appState.goals.length){
    appState.goals.push(
      {id:uid('goal'),name:'Reserva de emergência',target:15000,current:4600,deadline:addMonthsDate(8),icon:'🛟'},
      {id:uid('goal'),name:'Viagem',target:6000,current:1800,deadline:addMonthsDate(5),icon:'✈️'}
    );
  }
  ensureRecurringForMonth(m0);
  await saveVault();
  renderAll();
  toast('Dados de demonstração carregados.','success');
}

function populateCategorySelects(){
  if(!appState) return;
  const opts = appState.categories.map(function(c){return '<option value="' + esc(c.id) + '">' + c.icon + ' ' + esc(c.name) + '</option>';}).join('');
  ['txCategory','recCategory','budgetCategory'].forEach(function(id){
    const el = $('#'+id);
    if(!el) return;
    const current = el.value;
    el.innerHTML = opts;
    if(current && appState.categories.some(function(c){return c.id===current;})) el.value = current;
  });
  const filter = $('#transactionCategoryFilter');
  const currentFilter = filter.value;
  filter.innerHTML = '<option value="all">Todas as categorias</option>' + opts;
  filter.value = currentFilter || 'all';
}

function syncSettingsFields(){
  if(!appState) return;
  $('#themeSelect').value = appState.settings.theme || 'system';
  $('#monthlyBudgetInput').value = Number(appState.settings.monthlyBudget || 0);
  $('#autoLockSelect').value = String(Number(appState.settings.autoLockMinutes || 0));
}

function quickToggleTheme(){
  if(!appState) return;
  const current = resolvedTheme();
  appState.settings.theme = current === 'dark' ? 'light' : 'dark';
  applyTheme();
  syncSettingsFields();
  saveVault();
}

function applyTheme(){
  if(!appState) return;
  const resolved = resolvedTheme();
  document.documentElement.dataset.theme = resolved;
  $('#themeBtn').textContent = resolved === 'dark' ? '☀' : '☾';
  document.querySelector('meta[name="theme-color"]').setAttribute('content',resolved==='dark'?'#0b1020':'#f3f6fb');
}

function resolvedTheme(){
  const pref = appState && appState.settings ? appState.settings.theme : 'system';
  if(pref === 'dark' || pref === 'light') return pref;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function resetAutoLock(){
  clearTimeout(lockTimer);
  if(!appState) return;
  const minutes = Number(appState.settings.autoLockMinutes || 0);
  if(minutes > 0) lockTimer = setTimeout(lockVault,minutes*60*1000);
}

function exportCsv(){
  if(!appState) return;
  const tx = appState.transactions.slice().sort(sortTxDesc);
  const rows = [['Data','Tipo','Descrição','Categoria','Pagamento','Valor','Observação']];
  tx.forEach(function(t){
    rows.push([t.date,t.type==='expense'?'Despesa':'Receita',t.description,getCategory(t.category).name,t.payment||'',Number(t.amount).toFixed(2).replace('.',','),t.notes||'']);
  });
  const csv = '\uFEFF' + rows.map(function(row){return row.map(csvCell).join(';');}).join('\n');
  downloadBlob(csv,'stop-gastos-lancamentos-' + new Date().toISOString().slice(0,10) + '.csv','text/csv;charset=utf-8');
  toast('CSV exportado.','success');
}

function csvCell(v){ return '"' + String(v == null ? '' : v).replace(/"/g,'""') + '"'; }

function downloadBlob(content,name,type){
  const blob = new Blob([content],{type:type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){URL.revokeObjectURL(url);},1000);
}

function confirmDialog(title,message){
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  $('#confirmBackdrop').hidden = false;
  return new Promise(function(resolve){ pendingConfirm = resolve; });
}

function resolveConfirm(value){
  $('#confirmBackdrop').hidden = true;
  if(pendingConfirm){ const fn=pendingConfirm; pendingConfirm=null; fn(value); }
}

function toast(message,type){
  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'info');
  el.textContent = message;
  $('#toastStack').appendChild(el);
  setTimeout(function(){el.style.opacity='0';el.style.transform='translateY(6px)';},3200);
  setTimeout(function(){el.remove();},3600);
}

function transactionsForMonth(month){ return appState.transactions.filter(function(t){return t.date && t.date.slice(0,7)===month;}); }
function sumByType(list,type){ return list.filter(function(t){return t.type===type;}).reduce(function(a,t){return a+Number(t.amount||0);},0); }
function sortTxDesc(a,b){ return String(b.date).localeCompare(String(a.date)) || String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')); }
function getCategory(id){ return appState.categories.find(function(c){return c.id===id;}) || {id:id,name:'Outros',icon:'📦',color:'#8d99ae'}; }

function paintDelta(el,current,previous,higherIsGood){
  if(previous <= 0){
    el.textContent = 'Sem comparação anterior';
    el.className = 'delta neutral';
    return;
  }
  const pct = ((current-previous)/previous)*100;
  const up = pct >= 0;
  const good = higherIsGood ? up : !up;
  el.textContent = (up?'↑ ':'↓ ') + formatPct(Math.abs(pct)) + ' vs. mês anterior';
  el.className = 'delta ' + (good?'good':'bad');
}

function money(value){
  const cfg = appState && appState.settings ? appState.settings : {locale:'pt-BR',currency:'BRL'};
  return new Intl.NumberFormat(cfg.locale || 'pt-BR',{style:'currency',currency:cfg.currency || 'BRL'}).format(Number(value||0));
}
function compactMoney(value){
  const n = Number(value||0);
  if(Math.abs(n)>=1000000) return 'R$ ' + (n/1000000).toFixed(1).replace('.',',') + ' mi';
  if(Math.abs(n)>=1000) return 'R$ ' + (n/1000).toFixed(1).replace('.',',') + ' mil';
  return 'R$ ' + Math.round(n).toLocaleString('pt-BR');
}
function formatPct(value){
  const n = Number(value||0);
  return (Math.abs(n)>=100 ? Math.round(n) : n.toFixed(1).replace('.',',')) + '%';
}
function currentMonthKey(){ const d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1); }
function localDateKey(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function pad(n){ return String(n).padStart(2,'0'); }
function shiftMonth(key,delta){ const p=key.split('-').map(Number); const d=new Date(p[0],p[1]-1+delta,1); return d.getFullYear()+'-'+pad(d.getMonth()+1); }
function safeMonthDate(key,day){ const p=key.split('-').map(Number); const max=new Date(p[0],p[1],0).getDate(); return new Date(p[0],p[1]-1,Math.min(max,Math.max(1,day))); }
function daysInMonth(key){ const p=key.split('-').map(Number); return new Date(p[0],p[1],0).getDate(); }
function elapsedDaysInSelectedMonth(key){
  const now=new Date();
  if(key===currentMonthKey()) return now.getDate();
  if(key<currentMonthKey()) return daysInMonth(key);
  return 1;
}
function monthLabel(key){
  const p=key.split('-').map(Number);
  const s=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(p[0],p[1]-1,1));
  return s.charAt(0).toUpperCase()+s.slice(1);
}
function shortMonth(key){
  const p=key.split('-').map(Number);
  const s=new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(new Date(p[0],p[1]-1,1)).replace('.','');
  return s.charAt(0).toUpperCase()+s.slice(1);
}
function dateBR(value){
  if(!value) return '—';
  const p=value.slice(0,10).split('-').map(Number);
  return pad(p[2])+'/'+pad(p[1])+'/'+p[0];
}
function startOfDay(d){ return new Date(d.getFullYear(),d.getMonth(),d.getDate()); }
function addMonthsDate(months){ const d=new Date(); d.setMonth(d.getMonth()+months); return localDateKey(d); }
function uid(prefix){ return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8); }
function clone(value){ return JSON.parse(JSON.stringify(value)); }
function emptyTableRow(cols,msg){ return '<tr><td colspan="'+cols+'" class="empty-state">'+esc(msg)+'</td></tr>'; }
function setRadio(name,value){ const el=$('input[name="'+name+'"][value="'+value+'"]'); if(el) el.checked=true; }
function getRadio(name){ const el=$('input[name="'+name+'"]:checked'); return el?el.value:'expense'; }
function esc(value){
  return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch];});
}

function setupPwa(){
  if('serviceWorker' in navigator){
    window.addEventListener('load',function(){
      navigator.serviceWorker.register('./service-worker.js').catch(function(){});
    });
  }
}

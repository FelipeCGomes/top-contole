'use strict';

const VAULT_KEY = 'stop_gastos_vault_v1'; // legado, somente para migração
const STATE_KEY_PREFIX = 'stop_gastos_state_v3_';
const SESSION_KEY_STORAGE = 'stop_gastos_session_key_v1';
const SESSION_EXPIRY_STORAGE = 'stop_gastos_session_expiry_v1';
const REFRESH_KEY_STORAGE = 'stop_gastos_refresh_key_v1';
const REFRESH_EXPIRY_STORAGE = 'stop_gastos_refresh_expiry_v1';
const APP_VERSION = 3;
const KDF_ITERATIONS = 180000;

const CLOUD_SYNC_DELAY_MS = 10000;
const STATE_SECTION_KEYS = [
  'categories',
  'transactions',
  'recurring',
  'incomeSources',
  'shoppingLists',
  'shoppingActiveListId',
  'budgets',
  'goals',
  'accounts',
  'cards',
  'bills',
  'transfers',
  'audit',
  'settings'
];


let appState = null;
let sessionKey = null;
let sessionSalt = null;
let selectedMonth = currentMonthKey();
let calendarMonth = selectedMonth;
let pendingBackup = null;
let pendingConfirm = null;
let lockTimer = null;
let defaultsCache = null;
let cloudUser = null;
let cloudVaultUnsubscribe = null;
let cloudAuthUnsubscribe = null;
let cloudPushTimer = null;
let cloudApplying = false;
let cloudLastSyncedAt = null;
let cloudStorageMode = 'unknown';
let cloudSyncedState = null;
let cloudSyncPending = false;
let cloudSyncDueAt = 0;
let cloudSyncInFlight = false;
let localStateUpdatedAt = '';
let familyContext = null;
let familyStates = {};
let familyStateUnsubs = [];
let familyInvitations = [];
let familyInviteUnsubscribe = null;
let familyMembersUnsubscribe = null;
let familyShoppingLists = [];
let familyShoppingListsUnsubscribe = null;
let familyShoppingItemsUnsubscribe = null;
let familyShoppingItemsListId = '';
let familyShoppingComparisonLists = [];
let familyShoppingComparisonLoading = false;
let familyShoppingComparisonRefreshTimer = null;
let familyLoadError = '';
let notifiedFamilyInvites = new Set();

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

const shoppingCatalogGroups = [
  {label:'Grãos e básicos',items:[
    'Arroz 1 kg','Arroz 2 kg','Arroz 5 kg',
    'Feijão 1 kg','Feijão 2 kg',
    'Açúcar 1 kg','Açúcar 2 kg','Açúcar 5 kg',
    'Café 250 g','Café 500 g',
    'Macarrão 500 g','Macarrão 1 kg',
    'Farinha de trigo 1 kg','Farinha de trigo 5 kg',
    'Fubá 500 g','Fubá 1 kg',
    'Tapioca 500 g','Tapioca 1 kg',
    'Sal 1 kg'
  ]},
  {label:'Óleos e condimentos',items:[
    'Óleo de soja 900 ml','Óleo de soja 1 L',
    'Azeite 250 ml','Azeite 500 ml',
    'Vinagre 750 ml',
    'Molho de tomate 300 g','Molho de tomate sachê 340 g',
    'Extrato de tomate 300 g',
    'Maionese 500 g','Ketchup 400 g','Mostarda 200 g'
  ]},
  {label:'Leites e laticínios',items:[
    'Leite 1 L','Caixa de leite 12 × 1 L',
    'Bandeja de iogurte 6 unid.','Iogurte 170 g','Iogurte 1 L',
    'Manteiga 200 g','Manteiga 500 g','Margarina 500 g',
    'Queijo mussarela 500 g','Queijo mussarela 1 kg',
    'Requeijão 200 g','Creme de leite 200 g','Leite condensado 395 g'
  ]},
  {label:'Carnes e proteínas',items:[
    'Ovos bandeja 12 unid.','Ovos bandeja 20 unid.','Ovos bandeja 30 unid.',
    'Frango inteiro 1 kg','Peito de frango 1 kg','Coxa/sobrecoxa 1 kg',
    'Carne bovina 1 kg','Carne moída 1 kg','Carne suína 1 kg',
    'Linguiça 1 kg','Salsicha 500 g',
    'Atum lata 170 g','Sardinha lata 125 g'
  ]},
  {label:'Hortifruti',items:[
    'Banana 1 kg','Maçã 1 kg','Laranja 1 kg','Mamão 1 unid.','Melancia 1 unid.',
    'Batata 1 kg','Cebola 1 kg','Tomate 1 kg','Cenoura 1 kg','Alho 200 g',
    'Alface 1 unid.','Cheiro-verde 1 maço'
  ]},
  {label:'Padaria e mercearia',items:[
    'Pão de forma 500 g','Pão francês 1 kg',
    'Biscoito 350 g','Bolacha água e sal 350 g',
    'Aveia 500 g','Cereal 300 g','Achocolatado 400 g',
    'Milho verde lata 170 g','Ervilha lata 170 g'
  ]},
  {label:'Bebidas',items:[
    'Água mineral 1,5 L','Água mineral 5 L',
    'Refrigerante 2 L','Suco 1 L','Água de coco 1 L'
  ]},
  {label:'Limpeza',items:[
    'Detergente 500 ml','Sabão em pó 800 g','Sabão em pó 1,6 kg',
    'Sabão líquido 3 L','Amaciante 2 L',
    'Água sanitária 1 L','Água sanitária 2 L',
    'Desinfetante 2 L','Limpador multiuso 500 ml',
    'Esponja pacote 3 unid.','Saco de lixo 30 L · 20 unid.',
    'Saco de lixo 50 L · 20 unid.','Papel-toalha 2 rolos'
  ]},
  {label:'Higiene pessoal',items:[
    'Papel higiênico 4 rolos','Papel higiênico 12 rolos',
    'Sabonete 90 g','Shampoo 350 ml','Condicionador 350 ml',
    'Creme dental 90 g','Desodorante aerosol 150 ml',
    'Absorvente pacote 8 unid.','Fralda pacote'
  ]}
];


const pageMeta = {
  dashboard:['Dashboard','Visão geral das suas finanças'],
  transactions:['Lançamentos','Todas as receitas e despesas'],
  recurring:['Custos fixos','Recorrências mensais automáticas'],
  shopping:['Lista de compras','Planeje produtos, quantidades e acompanhe o custo no mercado'],
  budgets:['Orçamentos','Planeje seus limites por categoria'],
  goals:['Metas','Acompanhe seus objetivos financeiros'],
  calendar:['Calendário','Movimentações organizadas por dia'],
  accounts:['Contas','Saldos por banco e carteira'],
  cards:['Cartões','Faturas, limites e parcelamentos'],
  bills:['Contas a pagar','Compromissos financeiros futuros'],
  reports:['Relatórios','Entenda seus hábitos financeiros'],
  family:['Família','Membros, gastos e visão consolidada'],
  settings:['Configurações','Conta Google, aparência e backups'],
  about:['Sobre','Conheça o Stop Gastos'],
  terms:['Termos de Uso','Condições para utilização do aplicativo'],
  privacy:['Política de Privacidade','Como seus dados são utilizados e protegidos']
};

const $ = function(sel, root){ return (root || document).querySelector(sel); };
const $$ = function(sel, root){ return Array.from((root || document).querySelectorAll(sel)); };

let appBootstrapped=false;

function bootstrapApp(){
  if(appBootstrapped) return;
  appBootstrapped=true;

  Promise.resolve(init()).catch(function(error){
    console.error('Stop Gastos bootstrap:',error);
    appBootstrapped=false;

    const status=document.querySelector('#cloudLockStatus span:last-child');
    if(status) status.textContent='Falha ao iniciar o aplicativo. Atualize a página.';

    const login=document.querySelector('#googleLoginBtn');
    if(login) login.disabled=false;
  });
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',bootstrapApp,{once:true});
}else{
  queueMicrotask(bootstrapApp);
}


let loadingDepth=0;

function showLoading(title,message){
  const overlay=$('#globalLoader');
  if(!overlay) return;
  loadingDepth++;
  const titleEl=$('#loadingTitle');
  const messageEl=$('#loadingMessage');
  if(titleEl) titleEl.textContent=title || 'Processando…';
  if(messageEl) messageEl.textContent=message || 'Aguarde um instante.';
  overlay.hidden=false;
  document.body.classList.add('is-loading');
}

function updateLoading(title,message){
  const titleEl=$('#loadingTitle');
  const messageEl=$('#loadingMessage');
  if(title && titleEl) titleEl.textContent=title;
  if(message && messageEl) messageEl.textContent=message;
}

function hideLoading(){
  loadingDepth=Math.max(0,loadingDepth-1);
  if(loadingDepth>0) return;
  const overlay=$('#globalLoader');
  if(overlay) overlay.hidden=true;
  document.body.classList.remove('is-loading');
}

function waitForCloudReady(timeoutMs=8000){
  const existing=window.StopGastosCloud;
  if(existing && existing.ready) return Promise.resolve(existing);

  return new Promise(function(resolve,reject){
    let done=false;
    const finish=function(value,error){
      if(done) return;
      done=true;
      window.removeEventListener('stopgastos:cloud-ready',onReady);
      clearTimeout(timer);
      if(error) reject(error); else resolve(value);
    };
    const onReady=function(){
      const cloud=window.StopGastosCloud;
      if(cloud && cloud.ready) finish(cloud);
    };
    const timer=setTimeout(function(){
      finish(null,new Error('O módulo Firebase demorou para iniciar. Atualize a página e tente novamente.'));
    },timeoutMs);
    window.addEventListener('stopgastos:cloud-ready',onReady);
    onReady();
  });
}

async function withLoading(title,message,task){
  showLoading(title,message);
  const started=performance.now();

  try{
    return await task();
  }finally{
    const elapsed=performance.now()-started;
    const minimum=320;
    if(elapsed<minimum){
      await new Promise(function(resolve){
        setTimeout(resolve,minimum-elapsed);
      });
    }
    hideLoading();
  }
}

async function openDeleteAccountDialog(){
  if(!cloudUser){
    toast('Entre com Google para excluir sua conta.','info');
    return;
  }

  const cloud=window.StopGastosCloud;
  if(!cloud || !cloud.isSignedIn()){
    toast('Sua sessão Google não está ativa.','error');
    return;
  }

  try{
    const status=await withLoading(
      'Verificando sua conta…',
      'Conferindo vínculos familiares antes da exclusão.',
      function(){ return cloud.getAccountDeletionStatus(); }
    );

    if(status?.blocked){
      const canTransfer=(status.transferCandidates || []).length>0;
      navigate('family');

      await confirmDialog(
        'Antes de excluir sua conta',
        canTransfer
          ? 'Você é o proprietário da família e ainda existem outros vínculos. Remova todos os membros/convites ou use "Tornar administrador" em um membro ativo. Depois disso, tente excluir sua conta novamente.'
          : 'Você é o proprietário da família e ainda existem vínculos pendentes ou recusados. Remova todos esses vínculos antes de excluir sua conta.'
      );
      return;
    }
  }catch(err){
    toast(err.message || 'Não foi possível verificar sua conta.','error');
    return;
  }

  const modal=$('#deleteAccountBackdrop');
  const input=$('#deleteAccountConfirmInput');
  const button=$('#deleteAccountConfirmBtn');
  if(!modal || !input || !button) return;

  input.value='';
  button.disabled=true;
  modal.hidden=false;
  document.body.style.overflow='hidden';
  setTimeout(function(){input.focus();},30);
}

function closeDeleteAccountDialog(){
  const modal=$('#deleteAccountBackdrop');
  if(modal) modal.hidden=true;
  const input=$('#deleteAccountConfirmInput');
  if(input) input.value='';
  const button=$('#deleteAccountConfirmBtn');
  if(button) button.disabled=true;
  document.body.style.overflow='';
}

async function deleteUserAccountFromUi(){
  const input=$('#deleteAccountConfirmInput');
  if(!input || input.value.trim().toUpperCase()!=='EXCLUIR') return;

  const cloud=window.StopGastosCloud;
  if(!cloud || !cloud.isSignedIn()){
    closeDeleteAccountDialog();
    toast('Sua sessão Google não está ativa.','error');
    return;
  }

  const uidToClear=cloudUser?.uid || '';

  const clearLocalAccountData=function(){
    if(uidToClear) localStorage.removeItem(STATE_KEY_PREFIX+uidToClear);
    localStorage.removeItem(VAULT_KEY);
    localStorage.removeItem('stop_gastos_device_id_v1');
    clearSessionCredentials();

    clearFamilyWatchers();
    cloudUser=null;
    appState=null;
    familyContext=null;
    familyStates={};
    familyInvitations=[];
    localStateUpdatedAt='';
  };

  const finishDeletion=async function(){
    await cloud.deleteCurrentAccount();
    updateLoading('Limpando este dispositivo…','Removendo dados locais e encerrando a sessão.');
    clearLocalAccountData();
  };

  try{
    await withLoading(
      'Excluindo sua conta…',
      'Validando vínculos e removendo seus dados do Stop Gastos.',
      finishDeletion
    );

    closeDeleteAccountDialog();
    renderCloudUi();
    showSignedOutScreen();
    toast('Sua conta e seus dados foram excluídos do Stop Gastos.','success');
  }catch(err){
    const code=err && err.code ? err.code : '';

    if(code==='family/owner-has-members'){
      closeDeleteAccountDialog();
      navigate('family');
      toast('Remova os vínculos ou transfira a administração antes de excluir sua conta.','info');
      return;
    }

    if(code==='auth/requires-delete-authorization'){
      closeDeleteAccountDialog();

      const ok=await confirmDialog(
        'Autorizar exclusão da conta?',
        'Sua sessão Google não é recente. Para proteger sua conta, confirme sua identidade antes da exclusão. A confirmação será feita para o mesmo e-mail que já está conectado.'
      );
      if(!ok) return;

      try{
        await withLoading(
          'Autorizando exclusão…',
          'Confirmando sua identidade Google para esta ação.',
          async function(){
            await cloud.authorizeAccountDeletion();
            updateLoading('Excluindo sua conta…','Autorização confirmada. Removendo seus dados do Stop Gastos.');
            await finishDeletion();
          }
        );

        renderCloudUi();
        showSignedOutScreen();
        toast('Sua conta e seus dados foram excluídos do Stop Gastos.','success');
      }catch(authErr){
        const authCode=authErr && authErr.code ? authErr.code : '';
        const message=authCode==='auth/popup-closed-by-user'
          ? 'A autorização foi cancelada. Nenhum dado foi excluído.'
          : (authErr.message || 'Não foi possível autorizar a exclusão.');
        toast(message,'error');
      }
      return;
    }

    toast(err && err.message ? err.message : 'Não foi possível excluir sua conta.','error');
  }
}

async function init(){
  // O login é ligado primeiro para continuar utilizável mesmo se algum
  // recurso secundário falhar durante a inicialização.
  bindCloudEvents();

  defaultsCache = await loadDefaults();
  selectedMonth = currentMonthKey();
  calendarMonth = selectedMonth;

  const monthInput=$('#globalMonth');
  if(monthInput) monthInput.value = selectedMonth;

  try{ bindEvents(); }catch(err){ console.error('Stop Gastos bindEvents:',err); }
  try{ bindV2Events(); }catch(err){ console.error('Stop Gastos bindV2Events:',err); }

  setupPwa();
  handleCloudReady();
  showSignedOutScreen();
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
    incomeSources:[],
    shoppingLists:[],
    shoppingActiveListId:'',
    budgets:[],
    goals:[],
    accounts:[],
    cards:[],
    bills:[],
    transfers:[],
    audit:[],
    settings:{
      currency:defaultsCache.currency || 'BRL',
      locale:defaultsCache.locale || 'pt-BR',
      monthlyBudget:Number(defaultsCache.monthlyBudget || 5000),
      autoLockMinutes:Number(defaultsCache.autoLockMinutes || 10),
      theme:'system',
      privacyMode:false
    }
  };
}

function normalizeIncomeSources(data){
  const current=Array.isArray(data && data.incomeSources) ? data.incomeSources : [];
  const legacy=Array.isArray(data && data.recurring)
    ? data.recurring.filter(function(item){return item && item.type==='income';}).map(function(item){
        return {
          id:item.id || uid('inc'),
          kind:item.incomeKind || 'salary',
          description:item.description || 'Renda recorrente',
          amount:Number(item.amount || 0),
          day:Math.max(1,Math.min(31,Number(item.day || 1))),
          accountId:item.accountId || '',
          active:item.active!==false,
          createdAt:item.createdAt || item.updatedAt || new Date().toISOString(),
          updatedAt:item.updatedAt || new Date().toISOString(),
          migratedFromRecurring:true
        };
      })
    : [];

  const map=new Map();
  current.concat(legacy).forEach(function(item){
    if(item && item.id) map.set(item.id,Object.assign({},item));
  });
  return Array.from(map.values());
}

function normalizeState(data){
  const base = makeInitialState();
  if(!data || typeof data !== 'object') return base;
  return {
    version:APP_VERSION,
    createdAt:data.createdAt || base.createdAt,
    categories:Array.isArray(data.categories) && data.categories.length ? data.categories : base.categories,
    transactions:Array.isArray(data.transactions) ? data.transactions : [],
    recurring:Array.isArray(data.recurring) ? data.recurring.filter(function(item){return item && item.type!=='income';}).map(function(item){return Object.assign({},item,{type:'expense'});}) : [],
    incomeSources:normalizeIncomeSources(data),
    shoppingLists:Array.isArray(data.shoppingLists) ? data.shoppingLists.map(function(list){
      return Object.assign({},list,{
        items:Array.isArray(list && list.items) ? list.items : []
      });
    }) : [],
    shoppingActiveListId:typeof data.shoppingActiveListId==='string' ? data.shoppingActiveListId : '',
    budgets:Array.isArray(data.budgets) ? data.budgets : [],
    goals:Array.isArray(data.goals) ? data.goals : [],
    accounts:Array.isArray(data.accounts) ? data.accounts : [],
    cards:Array.isArray(data.cards) ? data.cards : [],
    bills:Array.isArray(data.bills) ? data.bills : [],
    transfers:Array.isArray(data.transfers) ? data.transfers : [],
    audit:Array.isArray(data.audit) ? data.audit : [],
    settings:Object.assign({}, base.settings, data.settings || {})
  };
}

function bindEvents(){
  $('#menuBtn').addEventListener('click', function(){ $('#sidebar').classList.toggle('open'); });
  document.addEventListener('pointerdown', function(e){
    const sidebar=$('#sidebar');
    const menu=$('#menuBtn');
    if(window.innerWidth<=900 && sidebar.classList.contains('open') && !sidebar.contains(e.target) && !menu.contains(e.target)){
      sidebar.classList.remove('open');
    }
  }, {passive:true});
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape'){
      $('#sidebar').classList.remove('open');
      if($('#deleteAccountBackdrop') && !$('#deleteAccountBackdrop').hidden) closeDeleteAccountDialog();
    }
  });
  $('#themeBtn').addEventListener('click', quickToggleTheme);
  $('#quickAddBtn').addEventListener('click', function(){ openModal('transaction'); });
  $('#globalMonth').addEventListener('change', async function(e){
    selectedMonth = e.target.value || currentMonthKey();
    calendarMonth = selectedMonth;
    ensureRecurringForMonth(selectedMonth);
    await saveVault();
    renderAll();
    if(familyContext) renderFamily();
  });

  $$('[data-nav]').forEach(function(el){
    el.addEventListener('click', function(){ navigate(el.getAttribute('data-nav')); });
  });
  $$('[data-open]').forEach(function(el){
    el.addEventListener('click', function(){ openModal(el.getAttribute('data-open')); });
  });

  $('#modalClose').addEventListener('click', closeModal);
  $$('.modal-cancel').forEach(function(btn){ btn.addEventListener('click', closeModal); });
  $('#modalBackdrop').addEventListener('click', function(e){ if(e.target === e.currentTarget) closeModal(); });

  $('#transactionForm').addEventListener('submit', saveTransactionForm);
  $('#recurringForm').addEventListener('submit', saveRecurringForm);
  $('#incomeSourceForm').addEventListener('submit', saveIncomeSourceForm);
  $('#budgetForm').addEventListener('submit', saveBudgetForm);
  $('#goalForm').addEventListener('submit', saveGoalForm);
  $('#shoppingListForm').addEventListener('submit', saveShoppingListForm);
  $('#shoppingItemForm').addEventListener('submit', addShoppingItem);
  $('#shoppingItemPreset').addEventListener('change', updateShoppingProductFields);
  $('#shoppingListSelect').addEventListener('change', changeShoppingListSelection);
  $('#deleteShoppingListBtn').addEventListener('click', deleteActiveShoppingList);
  $('#shoppingGridBody').addEventListener('input', handleShoppingGridInput);
  $('#shoppingGridBody').addEventListener('click', handleShoppingGridClick);
  $('#refreshShoppingComparisonBtn').addEventListener('click', refreshShoppingComparisonFromUi);

  $('#transactionSearch').addEventListener('input', renderTransactions);
  $('#transactionTypeFilter').addEventListener('change', renderTransactions);
  $('#transactionCategoryFilter').addEventListener('change', renderTransactions);

  $('#prevCalendar').addEventListener('click', function(){ calendarMonth = shiftMonth(calendarMonth,-1); renderCalendar(); });
  $('#nextCalendar').addEventListener('click', function(){ calendarMonth = shiftMonth(calendarMonth,1); renderCalendar(); });

  $('#themeSelect').addEventListener('change', async function(e){
    appState.settings.theme = e.target.value;
    applyTheme();
    await saveVault(false);
    renderSettingsPersistenceStatus();
  });

  $('#monthlyBudgetInput').addEventListener('input', handleMonthlyBudgetInput);
  $('#monthlyBudgetInput').addEventListener('blur', function(){
    renderSettingsPersistenceStatus();
  });

  $('#backupBtn').addEventListener('click', exportEncryptedBackup);
  $('#restoreInput').addEventListener('change', readBackupFile);
  $('#demoBtn').addEventListener('click', loadDemoData);
  $('#wipeBtn').addEventListener('click', wipeVault);
  $('#deleteUserAccountBtn').addEventListener('click', openDeleteAccountDialog);
  $('#deleteAccountCancelBtn').addEventListener('click', closeDeleteAccountDialog);
  $('#deleteAccountBackdrop').addEventListener('click', function(e){ if(e.target===e.currentTarget) closeDeleteAccountDialog(); });
  $('#deleteAccountConfirmInput').addEventListener('input', function(e){
    $('#deleteAccountConfirmBtn').disabled=e.target.value.trim().toUpperCase()!=='EXCLUIR';
  });
  $('#deleteAccountConfirmInput').addEventListener('keydown', function(e){
    if(e.key==='Enter' && !$('#deleteAccountConfirmBtn').disabled){
      e.preventDefault();
      deleteUserAccountFromUi();
    }
  });
  $('#deleteAccountConfirmBtn').addEventListener('click', deleteUserAccountFromUi);
  $('#exportCsvBtn').addEventListener('click', exportCsv);

  $('#confirmCancel').addEventListener('click', function(){ resolveConfirm(false); });
  $('#confirmOk').addEventListener('click', function(){ resolveConfirm(true); });
  $('#confirmBackdrop').addEventListener('click', function(e){ if(e.target === e.currentTarget) resolveConfirm(false); });

  window.addEventListener('storage', function(e){
    const key=currentStateKey();
    if(!cloudUser || e.key!==key || !e.newValue) return;
    try{
      const wrapper=JSON.parse(e.newValue);
      if(wrapper && wrapper.state){
        appState=normalizeState(wrapper.state);
        localStateUpdatedAt=wrapper.clientUpdatedAt || '';
        renderAll();
        renderFamily();
      }
    }catch(err){}
  });
}

async function setupVault(e){
  if(e && e.preventDefault) e.preventDefault();
  await cloudSignIn();
}

async function unlockVault(e){
  if(e && e.preventDefault) e.preventDefault();
  await cloudSignIn();
}

function openApp(){
  if(!cloudUser) return showSignedOutScreen();

  if(appState) appState=normalizeState(appState);

  $('#lockScreen').hidden = true;
  $('#appShell').hidden = false;
  populateCategorySelects();
  applyTheme();
  syncSettingsFields();
  renderAll();
  renderCloudUi();
}

function lockVault(){
  cloudSignOut();
}

async function wipeVault(){
  if(!cloudUser || !appState) return;
  const ok = await confirmDialog('Apagar seus dados financeiros?','Esta ação limpa seus dados neste dispositivo e sincroniza uma base vazia na sua conta Google. Os dados dos outros membros da família não serão apagados.');
  if(!ok) return;
  appState = makeInitialState();
  localStateUpdatedAt = new Date().toISOString();
  await saveVault(false);
  renderAll();
  renderFamily();
  toast('Seus dados financeiros foram apagados.','success');
}

async function deriveKey(pin,salt){
  const material = await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2',salt:salt,iterations:KDF_ITERATIONS,hash:'SHA-256'},
    material,
    {name:'AES-GCM',length:256},
    true,
    ['encrypt','decrypt']
  );
}

function waitForUiPaint(){
  return new Promise(function(resolve){
    requestAnimationFrame(function(){
      requestAnimationFrame(resolve);
    });
  });
}

async function commitStateChange(options={}){
  if(!appState || !cloudUser) return {saved:false};

  appState=normalizeState(appState);

  renderAll();
  if(familyContext) renderFamily();

  if(options.closeModal!==false) closeModal();

  await waitForUiPaint();

  updateLoading(
    options.loadingTitle || 'Salvando informações…',
    navigator.onLine
      ? 'Alteração salva. O Firestore será atualizado após 10 segundos sem novas mudanças.'
      : 'Alteração salva neste dispositivo. O Firestore será atualizado quando a conexão voltar.'
  );

  return saveVault(false);
}

async function saveVault(force=false){
  if(!appState || !cloudUser) return {saved:false};

  appState=normalizeState(appState);

  const changedSections=cloudStorageMode==='modular'
    ? changedStateSections(appState)
    : STATE_SECTION_KEYS.slice();

  if(!changedSections.length){
    writeLocalState();
    return {
      saved:true,
      local:true,
      changed:false,
      cloud:{queued:false,noChanges:true}
    };
  }

  localStateUpdatedAt=new Date().toISOString();
  cloudSyncPending=true;
  cloudSyncDueAt=force ? Date.now() : Date.now()+CLOUD_SYNC_DELAY_MS;
  writeLocalState();

  if(familyContext && familyStates && cloudUser){
    familyStates[cloudUser.uid]={
      state:clone(appState),
      clientUpdatedAt:localStateUpdatedAt
    };
  }

  const cloudResult=await queueCloudPush(clone(appState),{
    force,
    sections:changedSections
  });

  return {
    saved:true,
    local:true,
    changed:true,
    sections:changedSections,
    cloud:cloudResult || null
  };
}

async function decryptVault(vault,pin){
  if(!vault || !vault.salt || !vault.iv || !vault.cipher) throw new Error('invalid vault');
  const salt = fromB64(vault.salt);
  const key = await deriveKey(pin,salt);
  const data = await decryptVaultWithKey(vault,key);
  return {data:data,key:key};
}


async function persistSession(){
  if(!sessionKey) return;
  try{
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw',sessionKey));
    const encoded = toB64(raw);
    const minutes = appState && appState.settings ? Number(appState.settings.autoLockMinutes || 0) : 0;
    const leaseMs = minutes>0 ? minutes*60*1000 : 12*60*60*1000;
    const expiry = Date.now()+leaseMs;

    sessionStorage.setItem(SESSION_KEY_STORAGE,encoded);
    sessionStorage.setItem(SESSION_EXPIRY_STORAGE,String(expiry));

    // Fallback exclusivamente para recarregamento da página.
    // Em uma navegação nova ele não é utilizado.
    localStorage.setItem(REFRESH_KEY_STORAGE,encoded);
    localStorage.setItem(REFRESH_EXPIRY_STORAGE,String(expiry));
  }catch(err){
    clearSessionCredentials();
  }
}

async function restoreSession(vaultText){
  try{
    let encoded = sessionStorage.getItem(SESSION_KEY_STORAGE);
    let expiry = Number(sessionStorage.getItem(SESSION_EXPIRY_STORAGE) || 0);

    if(!encoded){
      const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      const isReload = !!(nav && nav.type === 'reload');
      const refreshExpiry = Number(localStorage.getItem(REFRESH_EXPIRY_STORAGE) || 0);

      if(isReload && refreshExpiry>0 && Date.now()<=refreshExpiry){
        encoded = localStorage.getItem(REFRESH_KEY_STORAGE);
        expiry = refreshExpiry;
      }
    }

    if(!encoded) return false;
    if(expiry>0 && Date.now()>expiry){
      clearSessionCredentials();
      return false;
    }

    const vault = JSON.parse(vaultText);
    const raw = fromB64(encoded);
    const key = await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},true,['encrypt','decrypt']);
    const data = await decryptVaultWithKey(vault,key);

    sessionKey = key;
    sessionSalt = fromB64(vault.salt);
    appState = normalizeState(data);

    // Reconstitui a sessão normal após um refresh.
    await persistSession();
    return true;
  }catch(err){
    sessionKey = null;
    sessionSalt = null;
    appState = null;
    return false;
  }
}

async function decryptVaultWithKey(vault,key){
  if(!vault || !vault.iv || !vault.cipher || !key) throw new Error('invalid vault');
  const plain = await crypto.subtle.decrypt(
    {name:'AES-GCM',iv:fromB64(vault.iv)},
    key,
    fromB64(vault.cipher)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

function clearSessionCredentials(){
  sessionStorage.removeItem(SESSION_KEY_STORAGE);
  sessionStorage.removeItem(SESSION_EXPIRY_STORAGE);
  localStorage.removeItem(REFRESH_KEY_STORAGE);
  localStorage.removeItem(REFRESH_EXPIRY_STORAGE);
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
  if(!appState) return;
  const backup={
    app:'stop-gastos',
    version:APP_VERSION,
    format:'google-auth-json',
    exportedAt:new Date().toISOString(),
    state:appState
  };
  downloadBlob(JSON.stringify(backup,null,2),'stop-gastos-backup-' + new Date().toISOString().slice(0,10) + '.json','application/json');
  toast('Backup JSON exportado.','success');
}

async function readBackupFile(e){
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!file) return;
  try{
    const json = JSON.parse(await file.text());
    if(json.app!=='stop-gastos' || !json.state) throw new Error('format');
    const imported=normalizeState(json.state);
    const ok=await confirmDialog('Restaurar este backup?','Seus dados atuais serão substituídos e a alteração será sincronizada com sua conta Google.');
    if(!ok) return;
    appState=imported;
    await saveVault(false);
    renderAll();
    renderFamily();
    toast('Backup restaurado com sucesso.','success');
  }catch(err){
    toast('Backup inválido. Backups antigos protegidos por PIN precisam ser migrados antes.','error');
  }
}

async function restoreBackupWithPin(e){
  if(e && e.preventDefault) e.preventDefault();
  toast('O Stop Gastos agora usa somente autenticação Google.','info');
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
  if(name === 'accounts') renderAccounts();
  if(name === 'cards') renderCards();
  if(name === 'bills') renderBills();
  if(name === 'recurring') renderRecurring();
  if(name === 'shopping') renderShoppingLists();
  if(name === 'budgets') renderBudgets();
  if(name === 'goals') renderGoals();
  if(name === 'calendar') renderCalendar();
  if(name === 'reports') renderReports();
  if(name === 'family') refreshFamilyData();
  if(name === 'settings'){ syncSettingsFields(); renderCategoryManager(); renderIncomeSources(); }
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderAll(){
  if(!appState) return;

  // Defesa contra dados antigos, incompletos ou sincronizados com campos null.
  // Toda renderização parte de um estado com coleções válidas.
  appState=normalizeState(appState);

  populateCategorySelects();
  populateFinanceSelects();
  renderDashboard();
  renderTransactions();
  renderAccounts();
  renderCards();
  renderBills();
  renderRecurring();
  renderIncomeSources();
  renderShoppingLists();
  renderBudgets();
  renderGoals();
  renderCalendar();
  renderReports();
  renderCategoryManager();
  syncSettingsFields();
  applyPrivacy();
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
  renderSmartFinance();

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
    return (t.description + ' ' + c.name + ' ' + (t.notes || '') + ' ' + (t.tags || '')).toLowerCase().includes(q);
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
  const inst = t.installmentCount>1 ? ' · Parcela ' + t.installmentNo + '/' + t.installmentCount : '';
  const card = t.cardId ? getCard(t.cardId) : null;
  const pay = card ? card.name + inst : (t.payment || '') + inst;
  return '<tr><td><div class="tx-desc"><span class="tx-avatar">' + c.icon + '</span><div><b>' + esc(t.description) + '</b><small>' + esc(pay) + '</small></div></div></td>' +
    '<td>' + esc(c.name) + '</td><td>' + dateBR(t.date) + '</td><td><span class="type-pill ' + t.type + '">' + (t.type==='expense'?'Despesa':'Receita') + '</span></td>' +
    '<td class="right amount ' + t.type + '">' + (t.type==='expense'?'- ':'+ ') + money(t.amount) + '</td></tr>';
}

function transactionRowFull(t){
  const c = getCategory(t.category);
  const installment = t.installmentCount>1 ? 'Parcela ' + t.installmentNo + '/' + t.installmentCount + ' · compra ' + money(t.purchaseTotal || (Number(t.amount)*Number(t.installmentCount))) : '';
  const tags = t.tags ? ' · #' + String(t.tags).split(',').map(function(x){return x.trim();}).filter(Boolean).join(' #') : '';
  const info = installment || t.notes || (t.sourceRecurringId ? 'Gerado automaticamente' : 'Lançamento manual');
  const card = t.cardId ? getCard(t.cardId) : null;
  const account = t.accountId ? getAccount(t.accountId) : null;
  const payment = card ? card.name : (account ? (t.payment || '') + ' · ' + account.name : (t.payment || '—'));
  return '<tr><td><div class="tx-desc"><span class="tx-avatar">' + c.icon + '</span><div><b>' + esc(t.description) + '</b><small>' + esc(info + tags) + '</small></div></div></td>' +
    '<td>' + esc(c.name) + '</td><td>' + dateBR(t.date) + '</td><td>' + esc(payment) + '</td>' +
    '<td><span class="type-pill ' + t.type + '">' + (t.type==='expense'?'Despesa':'Receita') + '</span></td>' +
    '<td class="right amount ' + t.type + '">' + (t.type==='expense'?'- ':'+ ') + money(t.amount) + '</td>' +
    '<td><div class="row-actions"><button class="row-btn edit-tx" data-id="' + t.id + '" title="Editar">✎</button><button class="row-btn delete-tx" data-id="' + t.id + '" title="Excluir">×</button></div></td></tr>';
}

function bindRowActions(){
  $$('.edit-tx').forEach(function(btn){ btn.onclick = function(){ editTransaction(btn.dataset.id); }; });
  $$('.delete-tx').forEach(function(btn){ btn.onclick = function(){ deleteTransaction(btn.dataset.id); }; });
}

function incomeKindLabel(kind){
  const labels={
    salary:'Salário',
    extra:'Renda extra',
    freelance:'Freelance',
    rent:'Aluguel recebido',
    commission:'Comissão',
    other:'Outra renda'
  };
  return labels[kind] || 'Outra renda';
}

function incomeKindIcon(kind){
  const icons={
    salary:'💼',
    extra:'✨',
    freelance:'💻',
    rent:'🏠',
    commission:'📈',
    other:'💵'
  };
  return icons[kind] || '💵';
}

function renderIncomeSources(){
  if(!appState || !$('#incomeSourcesGrid')) return;

  const list=(appState.incomeSources || [])
    .slice()
    .sort(function(a,b){
      return Number(a.day || 1)-Number(b.day || 1)
        || String(a.description || '').localeCompare(String(b.description || ''),'pt-BR');
    });

  const total=list
    .filter(function(item){return item.active!==false;})
    .reduce(function(sum,item){return sum+Number(item.amount || 0);},0);

  const summary=$('#incomeSourcesSummary');
  if(summary){
    summary.textContent=list.length
      ? list.length+' fonte'+(list.length===1?'':'s')+' · '+money(total)+' por mês'
      : 'Nenhuma renda recorrente cadastrada.';
  }

  $('#incomeSourcesEmpty').hidden=list.length!==0;

  $('#incomeSourcesGrid').innerHTML=list.map(function(item){
    const account=getAccount(item.accountId);
    return '<article class="income-source-card animated-card '+(item.active===false?'inactive':'')+'">'+
      '<div class="income-source-head">'+
        '<span class="income-source-icon">'+incomeKindIcon(item.kind)+'</span>'+
        '<div class="card-menu"><button class="row-btn edit-income-source" data-id="'+esc(item.id)+'" title="Editar">✎</button><button class="row-btn delete-income-source" data-id="'+esc(item.id)+'" title="Excluir">×</button></div>'+
      '</div>'+
      '<span class="income-source-kind">'+esc(incomeKindLabel(item.kind))+'</span>'+
      '<h4>'+esc(item.description)+'</h4>'+
      '<strong>'+money(item.amount)+'</strong>'+
      '<div class="income-source-meta"><span>Recebe dia '+Number(item.day || 1)+'</span><span>'+(account?'🏦 '+esc(account.name):'Sem conta vinculada')+'</span></div>'+
      '<div class="income-source-bottom"><span class="type-pill income">Renda</span><input class="toggle income-source-toggle" data-id="'+esc(item.id)+'" type="checkbox" '+(item.active!==false?'checked':'')+' /></div>'+
    '</article>';
  }).join('');

  $$('.edit-income-source').forEach(function(btn){
    btn.onclick=function(){
      const item=appState.incomeSources.find(function(x){return x.id===btn.dataset.id;});
      if(item) openModal('incomeSource',item);
    };
  });

  $$('.delete-income-source').forEach(function(btn){
    btn.onclick=function(){deleteIncomeSource(btn.dataset.id);};
  });

  $$('.income-source-toggle').forEach(function(input){
    input.onchange=async function(){
      const item=appState.incomeSources.find(function(x){return x.id===input.dataset.id;});
      if(!item) return;
      item.active=input.checked;
      item.updatedAt=new Date().toISOString();
      logAudit('income-source-toggle',item.description);
      await saveVault(false);
      renderIncomeSources();
      toast(input.checked?'Renda recorrente ativada.':'Renda recorrente pausada.','success');
    };
  });
}

async function saveIncomeSourceForm(e){
  return withLoading('Salvando renda…','Atualizando suas entradas recorrentes.',async function(){
    e.preventDefault();

    const id=$('#incomeSourceId').value;
    const existing=id
      ? appState.incomeSources.find(function(item){return item.id===id;})
      : null;

    const record={
      id:id || uid('inc'),
      kind:$('#incomeSourceKind').value || 'salary',
      description:$('#incomeSourceDescription').value.trim(),
      amount:Number($('#incomeSourceAmount').value),
      day:Math.max(1,Math.min(31,Number($('#incomeSourceDay').value || 1))),
      accountId:$('#incomeSourceAccount').value || '',
      active:$('#incomeSourceActive').checked,
      createdAt:existing?.createdAt || new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };

    if(!record.description || !(record.amount>0)){
      toast('Preencha descrição e valor da renda.','error');
      return;
    }

    const index=appState.incomeSources.findIndex(function(item){return item.id===id;});
    if(index>=0){
      appState.incomeSources[index]=Object.assign({},appState.incomeSources[index],record);
    }else{
      appState.incomeSources.push(record);
    }

    syncRecurringTransactionForMonth({
      id:record.id,
      type:'income',
      description:record.description,
      amount:record.amount,
      day:record.day,
      accountId:record.accountId,
      active:record.active,
      incomeKind:record.kind,
      sourceType:'incomeSource'
    },selectedMonth);

    logAudit(index>=0?'income-source-update':'income-source-create',record.description);
    await commitStateChange();
    toast(index>=0?'Renda recorrente atualizada.':'Renda recorrente criada.','success');
  });
}

async function deleteIncomeSource(id){
  const item=appState.incomeSources.find(function(x){return x.id===id;});
  if(!item) return;

  const ok=await confirmDialog(
    'Excluir renda recorrente?',
    'Os lançamentos já gerados serão mantidos. "'+item.description+'" deixará de gerar novas entradas.'
  );
  if(!ok) return;

  appState.incomeSources=appState.incomeSources.filter(function(x){return x.id!==id;});
  logAudit('income-source-delete',item.description);
  await saveVault(false);
  renderAll();
  toast('Renda recorrente excluída.','success');
}

function renderRecurring(){
  if(!appState) return;

  const list=appState.recurring
    .filter(function(r){return r && r.type!=='income';})
    .slice()
    .sort(function(a,b){return Number(a.day)-Number(b.day);});

  $('#recurringEmpty').hidden=list.length!==0;

  $('#recurringGrid').innerHTML=list.map(function(r){
    const c=getCategory(r.category);
    const isSub=r.kind==='subscription';
    const annual=isSub ? '<small class="annual-cost">Custo anual: '+money(Number(r.amount)*12)+'</small>' : '';
    const linkedCard=r.payment==='Cartão de crédito' && r.cardId ? getCard(r.cardId) : null;
    const paymentLabel=linkedCard ? '💳 '+linkedCard.name : (r.payment || 'Automático');

    return '<article class="rec-card animated-card">'+
      '<div class="card-top"><span class="category-icon">'+c.icon+'</span><div class="card-menu"><button class="row-btn edit-rec" data-id="'+r.id+'">✎</button><button class="row-btn delete-rec" data-id="'+r.id+'">×</button></div></div>'+
      '<h4>'+esc(r.description)+'</h4>'+
      '<p>'+esc(c.name)+' · dia '+Number(r.day)+'</p>'+
      '<div class="rec-payment-line">'+esc(paymentLabel)+'</div>'+
      annual+
      '<div class="rec-value expense">- '+money(r.amount)+'</div>'+
      '<div class="rec-bottom"><span class="type-pill expense">'+(isSub?'Assinatura':'Despesa fixa')+'</span><input class="toggle rec-toggle" data-id="'+r.id+'" type="checkbox" '+(r.active!==false?'checked':'')+' /></div>'+
    '</article>';
  }).join('');

  $$('.edit-rec').forEach(function(btn){btn.onclick=function(){editRecurring(btn.dataset.id);};});
  $$('.delete-rec').forEach(function(btn){btn.onclick=function(){deleteRecurring(btn.dataset.id);};});
  $$('.rec-toggle').forEach(function(input){
    input.onchange=async function(){
      const rec=appState.recurring.find(function(r){return r.id===input.dataset.id;});
      if(rec){
        rec.active=input.checked;
        logAudit('recurring-toggle',rec.description);
        await saveVault(false);
        toast(input.checked?'Custo fixo ativado.':'Custo fixo pausado.','success');
      }
    };
  });
}

function shoppingIsFamilyShared(){
  return !!(familyContext?.family?.id);
}

function shoppingListsSource(){
  return shoppingIsFamilyShared()
    ? familyShoppingLists
    : (appState?.shoppingLists || []);
}

function populateShoppingProductCatalog(){
  const select=$('#shoppingItemPreset');
  if(!select || select.dataset.ready==='1') return;

  let html='<option value="">Selecione um produto</option>';
  shoppingCatalogGroups.forEach(function(group){
    html+='<optgroup label="'+esc(group.label)+'">';
    group.items.forEach(function(item){
      html+='<option value="'+esc(item)+'">'+esc(item)+'</option>';
    });
    html+='</optgroup>';
  });
  html+='<option value="__manual__">Outro / inserir manualmente</option>';

  select.innerHTML=html;
  select.dataset.ready='1';
}

function updateShoppingProductFields(){
  const preset=$('#shoppingItemPreset');
  const wrap=$('#shoppingManualWrap');
  const manual=$('#shoppingItemProduct');
  if(!preset || !wrap || !manual) return;

  const isManual=preset.value==='__manual__';
  wrap.hidden=!isManual;

  if(!isManual){
    manual.value='';
  }else{
    setTimeout(function(){manual.focus();},20);
  }
}

function clearFamilyShoppingWatchers(){
  if(familyShoppingListsUnsubscribe){
    try{familyShoppingListsUnsubscribe();}catch(err){}
    familyShoppingListsUnsubscribe=null;
  }
  if(familyShoppingItemsUnsubscribe){
    try{familyShoppingItemsUnsubscribe();}catch(err){}
    familyShoppingItemsUnsubscribe=null;
  }
  familyShoppingItemsListId='';
  familyShoppingLists=[];
  familyShoppingComparisonLists=[];
  familyShoppingComparisonLoading=false;
  if(familyShoppingComparisonRefreshTimer){
    clearTimeout(familyShoppingComparisonRefreshTimer);
    familyShoppingComparisonRefreshTimer=null;
  }
  renderShoppingComparison();
}

function setupFamilyShoppingWatchers(cloud){
  if(!cloud || !cloudUser || !familyContext?.family?.id){
    clearFamilyShoppingWatchers();
    renderShoppingLists();
    return;
  }

  const familyId=familyContext.family.id;

  familyShoppingListsUnsubscribe=cloud.watchFamilyShoppingLists(familyId,function(lists){
    const previous=new Map(familyShoppingLists.map(function(list){
      return [list.id,list];
    }));

    familyShoppingLists=(lists || []).map(function(list){
      const old=previous.get(list.id);
      return Object.assign({},list,{
        items:old && Array.isArray(old.items) ? old.items : []
      });
    });

    const activeId=appState?.shoppingActiveListId || '';
    if(!familyShoppingLists.some(function(list){return list.id===activeId;})){
      if(appState) appState.shoppingActiveListId=familyShoppingLists[0]?.id || '';
    }

    setupFamilyShoppingItemsWatcher(cloud);
    renderShoppingLists();
    scheduleFamilyShoppingComparisonRefresh();
  });
}

function setupFamilyShoppingItemsWatcher(cloud){
  if(!cloud || !familyContext?.family?.id) return;

  const list=getActiveShoppingList();
  const nextId=list?.id || '';

  if(nextId===familyShoppingItemsListId && familyShoppingItemsUnsubscribe) return;

  if(familyShoppingItemsUnsubscribe){
    try{familyShoppingItemsUnsubscribe();}catch(err){}
    familyShoppingItemsUnsubscribe=null;
  }

  familyShoppingItemsListId=nextId;
  if(!nextId) return;

  familyShoppingItemsUnsubscribe=cloud.watchFamilyShoppingItems(
    familyContext.family.id,
    nextId,
    function(items){
      const target=familyShoppingLists.find(function(list){return list.id===nextId;});
      if(!target) return;

      const previous=Array.isArray(target.items) ? target.items : [];
      const incoming=(items || []).map(function(item,index){
        return Object.assign({order:index+1},item);
      });

      const changed=previous.length!==incoming.length || incoming.some(function(item){
        const old=previous.find(function(x){return x.id===item.id;});
        return !old
          || String(old.product || '')!==String(item.product || '')
          || Number(old.qty || 0)!==Number(item.qty || 0)
          || Number(old.unitPrice || 0)!==Number(item.unitPrice || 0);
      });

      target.items=incoming;
      updateFamilyShoppingComparisonCache(target);

      if(changed){
        renderShoppingLists();
      }else{
        renderShoppingSummary(target);
        renderShoppingComparison();
      }
    }
  );
}


function shoppingMarketLabel(list){
  const store=String(list?.store || '').trim();
  const name=String(list?.name || '').trim();
  return store || name || 'Mercado';
}

function shoppingProductKey(value){
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/×/g,'x')
    .replace(/([0-9])\s*(kg|ml|g|l|unid)\b/g,'$1 $2')
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
    .replace(/\s+/g,' ');
}

function shoppingComparisonListsSource(){
  if(!shoppingIsFamilyShared()){
    return appState?.shoppingLists || [];
  }
  return familyShoppingComparisonLists || [];
}

function shoppingPricedMap(list){
  const map=new Map();

  (list?.items || []).forEach(function(item){
    const price=Math.max(0,Number(item.unitPrice || 0));
    const key=shoppingProductKey(item.product);
    if(!key || !(price>0)) return;

    const previous=map.get(key);
    if(!previous || price<previous.price){
      map.set(key,{
        key,
        product:String(item.product || '').trim(),
        price,
        qty:Math.max(0,Number(item.qty || 0))
      });
    }
  });

  return map;
}

function shoppingComparisonModel(lists){
  const markets=(lists || [])
    .map(function(list){
      const priced=shoppingPricedMap(list);
      const totals=shoppingListTotals(list);
      return {
        id:list.id,
        label:shoppingMarketLabel(list),
        name:list.name || shoppingMarketLabel(list),
        store:list.store || '',
        list,
        priced,
        total:totals.total,
        pricedProducts:totals.pricedProducts,
        products:totals.products
      };
    })
    .filter(function(market){
      return market.priced.size>0;
    });

  const productBuckets=new Map();
  markets.forEach(function(market){
    market.priced.forEach(function(entry,key){
      if(!productBuckets.has(key)) productBuckets.set(key,[]);
      productBuckets.get(key).push({
        marketId:market.id,
        market:market.label,
        product:entry.product,
        price:entry.price
      });
    });
  });

  const productRows=[...productBuckets.entries()]
    .filter(function(entry){return entry[1].length>=2;})
    .map(function(entry){
      const key=entry[0];
      const prices=entry[1].slice().sort(function(a,b){return a.price-b.price;});
      const best=prices[0];
      const worst=prices[prices.length-1];
      return {
        key,
        product:best.product,
        bestMarket:best.market,
        min:best.price,
        max:worst.price,
        savings:Math.max(0,worst.price-best.price),
        prices
      };
    })
    .sort(function(a,b){
      return b.savings-a.savings || a.product.localeCompare(b.product,'pt-BR');
    });

  let commonKeys=[];
  if(markets.length>=2){
    commonKeys=[...markets[0].priced.keys()].filter(function(key){
      return markets.every(function(market){return market.priced.has(key);});
    });
  }

  const ranking=markets.map(function(market){
    const comparable=commonKeys.reduce(function(sum,key){
      return sum+(market.priced.get(key)?.price || 0);
    },0);
    return {...market,comparable};
  }).sort(function(a,b){
    return a.comparable-b.comparable || a.label.localeCompare(b.label,'pt-BR');
  });

  const validRanking=markets.length>=2 && commonKeys.length>0 ? ranking : [];
  const best=validRanking[0] || null;
  const worst=validRanking.length ? validRanking[validRanking.length-1] : null;
  const savings=best && worst ? Math.max(0,worst.comparable-best.comparable) : 0;

  const idealSplit=commonKeys.reduce(function(sum,key){
    const min=Math.min(...markets.map(function(market){
      return market.priced.get(key)?.price ?? Number.POSITIVE_INFINITY;
    }));
    return sum+(Number.isFinite(min)?min:0);
  },0);

  const splitSavings=best ? Math.max(0,best.comparable-idealSplit) : 0;

  return {
    markets,
    productRows,
    commonKeys,
    ranking:validRanking,
    best,
    worst,
    savings,
    idealSplit,
    splitSavings
  };
}

function updateFamilyShoppingComparisonCache(list){
  if(!shoppingIsFamilyShared() || !list) return;

  const index=familyShoppingComparisonLists.findIndex(function(x){
    return x.id===list.id;
  });
  const copy=Object.assign({},list,{items:clone(list.items || [])});

  if(index>=0){
    familyShoppingComparisonLists[index]=copy;
  }else{
    familyShoppingComparisonLists.push(copy);
  }
}

function scheduleFamilyShoppingComparisonRefresh(){
  if(!shoppingIsFamilyShared()) return;

  clearTimeout(familyShoppingComparisonRefreshTimer);
  familyShoppingComparisonRefreshTimer=setTimeout(function(){
    refreshFamilyShoppingComparison(true);
  },520);
}

async function refreshFamilyShoppingComparison(silent=true){
  if(!shoppingIsFamilyShared()) return;

  const cloud=window.StopGastosCloud;
  const familyId=familyContext?.family?.id;
  if(!cloud || !cloud.ready || !familyId || familyShoppingComparisonLoading) return;

  familyShoppingComparisonLoading=true;
  renderShoppingComparison();

  try{
    familyShoppingComparisonLists=await cloud.getFamilyShoppingComparisonData(familyId);
  }catch(err){
    if(!silent){
      toast(err.message || 'Não foi possível atualizar a comparação dos mercados.','error');
    }
  }finally{
    familyShoppingComparisonLoading=false;
    renderShoppingComparison();
  }
}

async function refreshShoppingComparisonFromUi(){
  if(shoppingIsFamilyShared()){
    await withLoading(
      'Comparando mercados…',
      'Atualizando preços das listas compartilhadas.',
      async function(){await refreshFamilyShoppingComparison(false);}
    );
  }else{
    renderShoppingComparison();
    toast('Comparação atualizada.','success');
  }
}

function renderShoppingComparison(){
  const panel=$('#shoppingComparisonPanel');
  if(!panel) return;

  const source=shoppingComparisonListsSource();
  const visibleLists=(source || []).filter(function(list){
    return Array.isArray(list.items);
  });

  panel.hidden=visibleLists.length<2;
  if(panel.hidden) return;

  const bars=$('#shoppingMarketBars');
  const body=$('#shoppingProductCompareBody');
  const preview=$('#shoppingBestItemsPreview');
  const insight=$('#shoppingSplitInsight');

  if(shoppingIsFamilyShared() && familyShoppingComparisonLoading && !familyShoppingComparisonLists.length){
    $('#shoppingBestMarket').textContent='Atualizando…';
    $('#shoppingBestMarketDetail').textContent='Carregando preços da família';
    $('#shoppingBestBasket').textContent='—';
    $('#shoppingMarketSavings').textContent='—';
    $('#shoppingComparedProducts').textContent='—';
    bars.innerHTML='<div class="shopping-compare-empty">Carregando comparação dos mercados…</div>';
    body.innerHTML='<tr><td colspan="5" class="muted">Carregando preços compartilhados…</td></tr>';
    preview.innerHTML='';
    insight.textContent='Atualizando as listas compartilhadas.';
    return;
  }

  const model=shoppingComparisonModel(visibleLists);

  $('#shoppingBestMarket').textContent=model.best?.label || 'Sem cesta comum';
  $('#shoppingBestMarketDetail').textContent=model.best
    ? model.commonKeys.length+' produto'+(model.commonKeys.length===1?'':'s')+' na cesta equivalente'
    : 'Preencha os mesmos produtos em pelo menos dois mercados';
  $('#shoppingBestBasket').textContent=model.best ? money(model.best.comparable) : 'R$ 0,00';
  $('#shoppingMarketSavings').textContent=money(model.savings);
  $('#shoppingMarketSavingsDetail').textContent=model.best && model.worst
    ? 'Economia de '+formatPct(model.worst.comparable>0 ? (model.savings/model.worst.comparable)*100 : 0)+' vs '+model.worst.label
    : 'Diferença entre melhor e pior mercado';
  $('#shoppingComparedProducts').textContent=String(model.commonKeys.length);
  $('#shoppingComparedCoverage').textContent=model.markets.length>=2
    ? model.markets.length+' mercados com preços informados'
    : 'Cadastre preços em mais de uma lista';

  if(model.ranking.length){
    const max=Math.max(...model.ranking.map(function(m){return m.comparable;}),1);
    bars.innerHTML=model.ranking.map(function(market,index){
      const width=Math.max(8,(market.comparable/max)*100);
      const totalInfo=market.total>0 ? 'Total informado: '+money(market.total) : 'Total da lista ainda incompleto';
      return '<div class="shopping-market-bar '+(index===0?'best':'')+'">'+
        '<div class="shopping-market-bar-head"><div><b>'+esc(market.label)+'</b><small>'+esc(totalInfo)+'</small></div><strong>'+money(market.comparable)+'</strong></div>'+
        '<div class="shopping-market-track"><i style="width:'+width.toFixed(2)+'%"></i></div>'+
        '<div class="shopping-market-bar-foot"><span>'+model.commonKeys.length+' itens comparáveis</span><span>'+market.pricedProducts+'/'+market.products+' preços preenchidos</span></div>'+
      '</div>';
    }).join('');
  }else{
    bars.innerHTML='<div class="shopping-compare-empty">Ainda não existe uma cesta equivalente. Cadastre os mesmos produtos e preços em dois ou mais mercados.</div>';
  }

  body.innerHTML=model.productRows.length
    ? model.productRows.map(function(row){
        return '<tr>'+
          '<td><b>'+esc(row.product)+'</b><small>'+row.prices.length+' mercados comparados</small></td>'+
          '<td><span class="shopping-best-market-pill">'+esc(row.bestMarket)+'</span></td>'+
          '<td class="right income">'+money(row.min)+'</td>'+
          '<td class="right">'+money(row.max)+'</td>'+
          '<td class="right"><strong>'+money(row.savings)+'</strong></td>'+
        '</tr>';
      }).join('')
    : '<tr><td colspan="5" class="muted">Informe o preço do mesmo produto em pelo menos duas listas para comparar.</td></tr>';

  const topSavings=model.productRows.filter(function(row){return row.savings>0;}).slice(0,5);
  preview.innerHTML=topSavings.map(function(row){
    return '<div class="shopping-best-item"><div><b>'+esc(row.product)+'</b><small>'+esc(row.bestMarket)+'</small></div><div><strong>'+money(row.min)+'</strong><small>economiza '+money(row.savings)+'</small></div></div>';
  }).join('');

  if(model.best){
    insight.innerHTML='Comprando cada produto da cesta comum onde ele está mais barato, o total seria <strong>'+money(model.idealSplit)+'</strong>.'+
      (model.splitSavings>0
        ? ' Isso economiza <strong>'+money(model.splitSavings)+'</strong> em relação a fazer toda a cesta no melhor mercado único.'
        : ' O melhor mercado já concentra os menores preços dessa cesta.');
  }else{
    insight.textContent='Informe preços dos mesmos produtos em pelo menos duas listas para calcular a melhor combinação.';
  }
}

function getActiveShoppingList(){
  if(!appState) return null;

  const lists=shoppingListsSource();
  if(!lists.length) return null;

  let list=lists.find(function(x){
    return x.id===appState.shoppingActiveListId;
  });

  if(!list){
    list=lists[0];
    appState.shoppingActiveListId=list.id;
  }

  if(!Array.isArray(list.items)) list.items=[];
  return list;
}

function formatShoppingQty(value){
  const number=Number(value || 0);
  if(!Number.isFinite(number)) return '0';
  return number.toLocaleString(appState?.settings?.locale || 'pt-BR',{
    minimumFractionDigits:0,
    maximumFractionDigits:3
  });
}

function shoppingListTotals(list){
  const items=list && Array.isArray(list.items) ? list.items : [];
  const products=items.length;
  const quantity=items.reduce(function(sum,item){
    return sum+Math.max(0,Number(item.qty || 0));
  },0);
  const total=items.reduce(function(sum,item){
    const qty=Math.max(0,Number(item.qty || 0));
    const unit=Math.max(0,Number(item.unitPrice || 0));
    return sum+(qty*unit);
  },0);
  const pricedQuantity=items.reduce(function(sum,item){
    const unit=Math.max(0,Number(item.unitPrice || 0));
    return unit>0 ? sum+Math.max(0,Number(item.qty || 0)) : sum;
  },0);
  const pricedProducts=items.filter(function(item){
    return Number(item.unitPrice || 0)>0;
  }).length;

  return {
    products,
    quantity,
    total,
    average:pricedQuantity>0 ? total/pricedQuantity : 0,
    pricedProducts
  };
}

function renderShoppingSummary(list){
  const totals=shoppingListTotals(list);
  $('#shoppingProductCount').textContent=String(totals.products);
  $('#shoppingItemCount').textContent=formatShoppingQty(totals.quantity);
  $('#shoppingAverage').textContent=money(totals.average);
  $('#shoppingTotal').textContent=money(totals.total);
  $('#shoppingPriceProgress').textContent=totals.pricedProducts+'/'+totals.products+' com preço';
}

function shoppingListDateLabel(value){
  if(!value) return '';

  if(typeof value==='object' && value.seconds){
    return new Date(value.seconds*1000).toLocaleDateString('pt-BR',{
      day:'2-digit',month:'2-digit',year:'numeric'
    });
  }

  const date=new Date(value);
  if(!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR',{
    day:'2-digit',month:'2-digit',year:'numeric'
  });
}

function renderShoppingLists(){
  if(!appState || !$('#shoppingListSelect')) return;

  populateShoppingProductCatalog();
  updateShoppingProductFields();

  const shared=shoppingIsFamilyShared();
  const lists=shoppingListsSource();
  const select=$('#shoppingListSelect');
  const deleteBtn=$('#deleteShoppingListBtn');
  const addForm=$('#shoppingItemForm');
  const noList=$('#shoppingNoList');
  const gridWrap=$('#shoppingGridWrap');
  const emptyItems=$('#shoppingItemsEmpty');
  const body=$('#shoppingGridBody');
  const badge=$('#shoppingSharingBadge');
  const sharingText=$('#shoppingSharingText');

  if(badge){
    badge.textContent=shared?'Compartilhada com a família':'Pessoal';
    badge.classList.toggle('family-shared',shared);
  }
  if(sharingText){
    sharingText.textContent=shared
      ? 'Todos os membros ativos de '+(familyContext?.family?.name || 'sua família')+' podem incluir produtos e atualizar preços em tempo real.'
      : 'Planeje quantidades antes de sair e informe os preços no mercado para acompanhar o total em tempo real.';
  }

  if(!lists.length){
    if(!shared) appState.shoppingActiveListId='';
    select.innerHTML='<option value="">Nenhuma lista</option>';
    select.disabled=true;
    deleteBtn.hidden=true;
    addForm.hidden=true;
    noList.hidden=false;
    gridWrap.hidden=true;
    $('#shoppingListTitle').textContent='Nenhuma lista selecionada';
    $('#shoppingListMeta').textContent=shared
      ? 'Crie uma lista compartilhada para a família começar.'
      : 'Crie uma lista para começar.';
    $('#shoppingAutosaveStatus').textContent=shared?'Sincronização em tempo real':'Salvamento automático';
    renderShoppingSummary(null);
    body.innerHTML='';
    renderShoppingComparison();
    return;
  }

  const active=getActiveShoppingList();
  select.disabled=false;
  select.innerHTML=lists.map(function(list){
    const suffix=list.store ? ' · '+list.store : '';
    return '<option value="'+esc(list.id)+'">'+esc(list.name+suffix)+'</option>';
  }).join('');
  select.value=active.id;

  const canDelete=!shared
    || familyContext?.profile?.role==='admin'
    || active.createdBy===cloudUser?.uid;

  deleteBtn.hidden=!canDelete;
  addForm.hidden=false;
  noList.hidden=true;
  gridWrap.hidden=false;

  $('#shoppingListTitle').textContent=active.name || 'Lista de compras';

  const meta=[];
  if(active.store) meta.push(active.store);
  if(active.createdByName && shared) meta.push('Criada por '+active.createdByName);
  if(active.createdAt) meta.push('Criada em '+shoppingListDateLabel(active.createdAt));
  $('#shoppingListMeta').textContent=meta.join(' · ')
    || (shared?'Lista compartilhada com os membros ativos.':'Preencha os preços conforme compra os produtos.');

  $('#shoppingAutosaveStatus').textContent=shared
    ? 'Sincronização em tempo real'
    : 'Salvamento automático';

  const items=active.items || [];
  emptyItems.hidden=items.length!==0;

  body.innerHTML=items.map(function(item,index){
    const qty=Math.max(0,Number(item.qty || 0));
    const unit=Math.max(0,Number(item.unitPrice || 0));
    const total=qty*unit;
    const unitValue=unit>0 ? unit.toFixed(2) : '';

    return '<div class="shopping-grid-row" data-shopping-item="'+esc(item.id)+'">'+
      '<div class="shopping-cell shopping-cell-order" data-label="Ord"><span>'+(index+1)+'</span></div>'+
      '<div class="shopping-cell shopping-cell-product" data-label="Produto"><input class="shopping-inline-input" data-shopping-field="product" maxlength="80" value="'+esc(item.product || '')+'" placeholder="Produto" /></div>'+
      '<div class="shopping-cell shopping-cell-qty" data-label="Qtd"><input class="shopping-inline-input shopping-qty-input" data-shopping-field="qty" type="number" min="0.001" step="0.001" value="'+esc(String(qty || 1))+'" /></div>'+
      '<div class="shopping-cell shopping-cell-unit" data-label="Valor Unit."><div class="money-input shopping-row-money"><span>R$</span><input class="shopping-inline-input" data-shopping-field="unitPrice" type="number" min="0" step="0.01" value="'+esc(unitValue)+'" placeholder="0,00" /></div></div>'+
      '<div class="shopping-cell shopping-cell-total" data-label="Valor Total"><strong data-shopping-row-total>'+money(total)+'</strong></div>'+
      '<div class="shopping-cell shopping-cell-actions"><button class="row-btn shopping-delete-item" type="button" data-shopping-delete="'+esc(item.id)+'" title="Remover item">×</button></div>'+
    '</div>';
  }).join('');

  renderShoppingSummary(active);
  renderShoppingComparison();
}

async function changeShoppingListSelection(e){
  if(!appState) return;

  appState.shoppingActiveListId=e.target.value || '';

  if(shoppingIsFamilyShared()){
    setupFamilyShoppingItemsWatcher(window.StopGastosCloud);
  }

  renderShoppingLists();
  await saveVault();
}

async function saveShoppingListForm(e){
  return withLoading('Criando lista…','Preparando sua nova lista de compras.',async function(){
    e.preventDefault();

    const name=$('#shoppingListName').value.trim();
    const store=$('#shoppingListStore').value.trim();

    if(!name){
      toast('Informe um nome para a lista.','error');
      return;
    }

    if(shoppingIsFamilyShared()){
      const cloud=window.StopGastosCloud;
      const created=await cloud.createFamilyShoppingList(name,store);

      familyShoppingLists.unshift(created);
      familyShoppingComparisonLists.unshift(Object.assign({},created,{items:[]}));
      appState.shoppingActiveListId=created.id;

      setupFamilyShoppingItemsWatcher(cloud);
      await commitStateChange();

      toast('Lista criada e compartilhada com a família.','success');
      navigate('shopping');
    }else{
      const now=new Date().toISOString();
      const list={
        id:uid('shop'),
        name,
        store,
        items:[],
        createdAt:now,
        updatedAt:now
      };

      appState.shoppingLists.unshift(list);
      appState.shoppingActiveListId=list.id;
      logAudit('shopping-list-create',name);

      await commitStateChange();
      toast('Lista de compras criada.','success');
      navigate('shopping');
    }

    setTimeout(function(){
      const field=$('#shoppingItemPreset');
      if(field) field.focus();
    },80);
  });
}

function resetShoppingItemForm(){
  $('#shoppingItemPreset').value='';
  $('#shoppingItemProduct').value='';
  $('#shoppingItemQty').value='1';
  $('#shoppingItemUnit').value='';
  updateShoppingProductFields();
}

function selectedShoppingProduct(){
  const preset=$('#shoppingItemPreset').value;
  if(preset==='__manual__'){
    return $('#shoppingItemProduct').value.trim();
  }
  return preset.trim();
}

async function addShoppingItem(e){
  e.preventDefault();

  const list=getActiveShoppingList();
  if(!list){
    toast('Crie uma lista antes de adicionar produtos.','info');
    return;
  }

  const product=selectedShoppingProduct();
  const qty=Math.max(0,Number($('#shoppingItemQty').value || 0));
  const unitPrice=Math.max(0,Number($('#shoppingItemUnit').value || 0));

  if(!product){
    toast('Selecione um produto ou escolha "Outro / inserir manualmente".','error');
    $('#shoppingItemPreset').focus();
    return;
  }
  if(!(qty>0)){
    toast('Informe uma quantidade maior que zero.','error');
    return;
  }

  const now=new Date().toISOString();
  const item={
    id:uid('shopitem'),
    product,
    qty,
    unitPrice,
    order:(list.items?.length || 0)+1,
    createdBy:cloudUser?.uid || '',
    createdByName:cloudUser?.displayName || cloudUser?.email || '',
    createdAt:now,
    updatedAt:now
  };

  list.items.push(item);
  list.updatedAt=now;

  if(shoppingIsFamilyShared()) updateFamilyShoppingComparisonCache(list);
  resetShoppingItemForm();
  renderShoppingLists();

  scheduleShoppingAutosave(item);

  $('#shoppingItemPreset').focus();
}


function scheduleShoppingAutosave(item){
  const status=$('#shoppingAutosaveStatus');
  const shared=shoppingIsFamilyShared();
  const key=item?.id || 'personal';

  if(status){
    status.textContent=shared
      ? 'Alteração pendente · sincroniza em 10s'
      : 'Salvo · sincroniza em 10s';
    status.classList.add('saving');
  }

  if(shoppingAutosaveTimers.has(key)){
    clearTimeout(shoppingAutosaveTimers.get(key));
  }

  if(shared && item){
    const familyId=familyContext?.family?.id || '';
    const listId=getActiveShoppingList()?.id || '';

    const timer=setTimeout(async function(){
      try{
        if(!familyId || !listId) return;

        await window.StopGastosCloud.saveFamilyShoppingItem(
          familyId,
          listId,
          clone(item)
        );

        if(status){
          status.textContent='Sincronizado com a família';
          status.classList.remove('saving');
        }
      }catch(err){
        if(status){
          status.textContent='Falha ao sincronizar';
          status.classList.remove('saving');
        }
        toast(err.message || 'Não foi possível sincronizar a alteração compartilhada.','error');
      }finally{
        shoppingAutosaveTimers.delete(key);
      }
    },CLOUD_SYNC_DELAY_MS);

    shoppingAutosaveTimers.set(key,timer);
    return;
  }

  saveVault(false).catch(function(){
    if(status){
      status.textContent='Salvo neste dispositivo';
      status.classList.remove('saving');
    }
  });

  const timer=setTimeout(function(){
    if(status && cloudSyncPending){
      status.textContent='Sincronização pendente';
    }else if(status){
      status.textContent='Sincronizado';
      status.classList.remove('saving');
    }
    shoppingAutosaveTimers.delete(key);
  },CLOUD_SYNC_DELAY_MS+250);

  shoppingAutosaveTimers.set(key,timer);
}

function scheduleFamilyShoppingDelete(list,item){
  const status=$('#shoppingAutosaveStatus');
  const key='delete:'+(item?.id || uid('del'));
  const familyId=familyContext?.family?.id || '';
  const listId=list?.id || '';

  if(status){
    status.textContent='Exclusão pendente · sincroniza em 10s';
    status.classList.add('saving');
  }

  if(shoppingAutosaveTimers.has(key)){
    clearTimeout(shoppingAutosaveTimers.get(key));
  }

  const timer=setTimeout(async function(){
    try{
      if(!familyId || !listId || !item?.id) return;

      await window.StopGastosCloud.deleteFamilyShoppingItem(
        familyId,
        listId,
        item.id
      );

      if(status){
        status.textContent='Sincronizado com a família';
        status.classList.remove('saving');
      }
    }catch(err){
      if(status){
        status.textContent='Falha ao sincronizar';
        status.classList.remove('saving');
      }
      toast(err.message || 'Não foi possível remover o item compartilhado.','error');
    }finally{
      shoppingAutosaveTimers.delete(key);
    }
  },CLOUD_SYNC_DELAY_MS);

  shoppingAutosaveTimers.set(key,timer);
}

function handleShoppingGridInput(e){
  const input=e.target.closest('[data-shopping-field]');
  if(!input) return;

  const row=input.closest('[data-shopping-item]');
  const list=getActiveShoppingList();
  if(!row || !list) return;

  const item=list.items.find(function(x){
    return x.id===row.getAttribute('data-shopping-item');
  });
  if(!item) return;

  const field=input.getAttribute('data-shopping-field');
  if(field==='product'){
    item.product=input.value;
  }else if(field==='qty'){
    item.qty=Math.max(0,Number(input.value || 0));
  }else if(field==='unitPrice'){
    item.unitPrice=Math.max(0,Number(input.value || 0));
  }

  item.updatedAt=new Date().toISOString();
  list.updatedAt=item.updatedAt;

  const totalNode=row.querySelector('[data-shopping-row-total]');
  if(totalNode){
    totalNode.textContent=money(
      Math.max(0,Number(item.qty || 0))*Math.max(0,Number(item.unitPrice || 0))
    );
  }

  if(shoppingIsFamilyShared()) updateFamilyShoppingComparisonCache(list);
  renderShoppingSummary(list);
  renderShoppingComparison();
  scheduleShoppingAutosave(item);
}

async function handleShoppingGridClick(e){
  const button=e.target.closest('[data-shopping-delete]');
  if(!button) return;

  const list=getActiveShoppingList();
  if(!list) return;

  const id=button.getAttribute('data-shopping-delete');
  const item=list.items.find(function(x){return x.id===id;});
  list.items=list.items.filter(function(x){return x.id!==id;});
  list.updatedAt=new Date().toISOString();

  if(shoppingIsFamilyShared()) updateFamilyShoppingComparisonCache(list);
  renderShoppingLists();

  if(shoppingIsFamilyShared()){
    scheduleFamilyShoppingDelete(list,item);
  }else{
    scheduleShoppingAutosave();
  }

  if(item) toast(item.product+' removido da lista.','info');
}

async function deleteActiveShoppingList(){
  const list=getActiveShoppingList();
  if(!list) return;

  const shared=shoppingIsFamilyShared();
  const canDelete=!shared
    || familyContext?.profile?.role==='admin'
    || list.createdBy===cloudUser?.uid;

  if(!canDelete){
    toast('Somente quem criou a lista ou o administrador pode excluí-la.','info');
    return;
  }

  const ok=await confirmDialog(
    'Excluir lista de compras?',
    'A lista "'+list.name+'" e todos os produtos cadastrados nela serão removidos.'
  );
  if(!ok) return;

  await withLoading('Excluindo lista…','Removendo os produtos desta lista.',async function(){
    if(shared){
      await window.StopGastosCloud.deleteFamilyShoppingList(
        familyContext.family.id,
        list.id
      );

      familyShoppingLists=familyShoppingLists.filter(function(x){
        return x.id!==list.id;
      });
      familyShoppingComparisonLists=familyShoppingComparisonLists.filter(function(x){
        return x.id!==list.id;
      });
      appState.shoppingActiveListId=familyShoppingLists[0]?.id || '';
      setupFamilyShoppingItemsWatcher(window.StopGastosCloud);
      renderShoppingLists();
      await saveVault();
    }else{
      appState.shoppingLists=appState.shoppingLists.filter(function(x){
        return x.id!==list.id;
      });
      appState.shoppingActiveListId=appState.shoppingLists[0]?.id || '';
      logAudit('shopping-list-delete',list.name);
      renderShoppingLists();
      await saveVault(false);
    }
  });

  toast('Lista excluída.','success');
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
    const bills = appState.bills.filter(function(b){return b.dueDate===key && !b.paid;});
    const out = tx.filter(function(t){return t.type==='expense';}).reduce(function(a,t){return a+Number(t.amount);},0);
    const events = tx.slice(0,2).map(function(t){
      return '<span class="calendar-event ' + t.type + '" title="' + esc(t.description) + '">' + esc(t.description) + (t.installmentCount>1?' '+t.installmentNo+'/'+t.installmentCount:'') + '</span>';
    }).concat(bills.slice(0,2).map(function(b){
      return '<span class="calendar-event bill" title="Pendente: '+esc(b.description)+'">⏳ '+esc(b.description)+'</span>';
    })).join('');
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
    $('#txAmount').value = data
      ? Number(data.purchaseTotal || (
          data.installmentGroup
            ? transactionInstallmentMembers(data).reduce(function(sum,item){return sum+Number(item.amount || 0);},0)
            : data.amount
        ))
      : '';
    $('#txDate').value = data ? (data.purchaseDate || data.date) : localDateKey(new Date());
    $('#txCategory').value = data ? data.category : 'alimentacao';
    $('#txPayment').value = data ? (data.payment || 'Pix') : 'Pix';
    $('#txAccount').value = data ? (data.accountId || '') : '';
    $('#txCard').value = data ? (data.cardId || '') : '';
    $('#txInstallments').value = data
      ? String(normalizedInstallmentCount(data.installmentCount || 1))
      : '1';
    $('#txTags').value = data ? (data.tags || '') : '';
    $('#txNotes').value = data ? (data.notes || '') : '';
    updateInstallmentFields(data);
  }
  if(type === 'recurring'){
    $('#modalTitle').textContent = data ? 'Editar recorrência' : 'Novo custo fixo';
    $('#modalEyebrow').textContent = data ? 'EDITAR' : 'RECORRÊNCIA';
    $('#recurringForm').hidden = false;
    $('#recurringForm').reset();
    $('#recurringId').value = data ? data.id : '';
    $('#recDescription').value = data ? data.description : '';
    $('#recKind').value = data ? (data.kind || 'fixed') : 'fixed';
    $('#recAmount').value = data ? data.amount : '';
    $('#recDay').value = data ? data.day : new Date().getDate();
    $('#recCategory').value = data ? data.category : 'moradia';
    $('#recPayment').value = data ? (data.payment || 'Débito automático') : 'Débito automático';
    $('#recCard').value = data ? (data.cardId || '') : '';
    $('#recInstallments').value = data
      ? String(normalizedInstallmentCount(data.installmentCount || 1))
      : '1';
    $('#recActive').checked = data ? data.active !== false : true;
    updateRecurringPaymentFields();
  }
  if(type === 'incomeSource'){
    $('#modalTitle').textContent=data ? 'Editar renda recorrente' : 'Nova renda recorrente';
    $('#modalEyebrow').textContent=data ? 'EDITAR RENDA' : 'RENDA';
    $('#incomeSourceForm').hidden=false;
    $('#incomeSourceForm').reset();
    $('#incomeSourceId').value=data ? data.id : '';
    $('#incomeSourceDescription').value=data ? data.description : '';
    $('#incomeSourceKind').value=data ? (data.kind || 'salary') : 'salary';
    $('#incomeSourceAmount').value=data ? Number(data.amount || 0) : '';
    $('#incomeSourceDay').value=data ? Number(data.day || 5) : 5;
    $('#incomeSourceAccount').value=data ? (data.accountId || '') : '';
    $('#incomeSourceActive').checked=data ? data.active!==false : true;
  }
  if(type === 'shoppingList'){
    $('#modalTitle').textContent='Nova lista de compras';
    $('#modalEyebrow').textContent='COMPRAS';
    $('#shoppingListForm').hidden=false;
    $('#shoppingListForm').reset();
    $('#shoppingListName').value='';
    $('#shoppingListStore').value='';
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
  if(type === 'account'){
    $('#modalTitle').textContent = data ? 'Editar conta' : 'Nova conta';
    $('#modalEyebrow').textContent = 'CARTEIRA';
    $('#accountForm').hidden = false;
    $('#accountForm').reset();
    $('#accountId').value = data ? data.id : '';
    $('#accountName').value = data ? data.name : '';
    $('#accountType').value = data ? (data.type || 'Conta corrente') : 'Conta corrente';
    $('#accountOpening').value = data ? Number(data.openingBalance || 0) : 0;
    $('#accountIcon').value = data ? (data.icon || '🏦') : '🏦';
    $('#accountColor').value = data ? (data.color || '#7c5cff') : '#7c5cff';
  }
  if(type === 'card'){
    $('#modalTitle').textContent = data ? 'Editar cartão' : 'Novo cartão';
    $('#modalEyebrow').textContent = 'CRÉDITO';
    $('#cardForm').hidden = false;
    $('#cardForm').reset();
    $('#cardId').value = data ? data.id : '';
    $('#cardName').value = data ? data.name : '';
    $('#cardType').value = data ? (data.cardType || 'credit') : 'credit';
    $('#cardBrand').value = data ? (data.brand || 'Visa') : 'Visa';
    $('#cardLimit').value = data ? Number(data.limit || 0) : '';
    $('#cardClosingDay').value = data ? Number(data.closingDay || 3) : 3;
    $('#cardDueDay').value = data ? Number(data.dueDay || 10) : 10;
    $('#cardAccount').value = data ? (data.accountId || '') : '';
    $('#cardColor').value = data ? (data.color || '#141b34') : '#141b34';
    updateCardTypeFields();
  }
  if(type === 'bill'){
    $('#modalTitle').textContent = data ? 'Editar conta prevista' : 'Nova conta a pagar/receber';
    $('#modalEyebrow').textContent = 'AGENDA';
    $('#billForm').hidden = false;
    $('#billForm').reset();
    $('#billId').value = data ? data.id : '';
    setRadio('billType',data ? data.type : 'expense');
    $('#billDescription').value = data ? data.description : '';
    $('#billAmount').value = data ? data.amount : '';
    $('#billDueDate').value = data ? data.dueDate : localDateKey(new Date());
    $('#billCategory').value = data ? data.category : 'outros';
    $('#billAccount').value = data ? (data.accountId || '') : '';
    $('#billNotes').value = data ? (data.notes || '') : '';
  }
  if(type === 'transfer'){
    $('#modalTitle').textContent = 'Transferir entre contas';
    $('#modalEyebrow').textContent = 'TRANSFERÊNCIA';
    $('#transferForm').hidden = false;
    $('#transferForm').reset();
    $('#transferDate').value = localDateKey(new Date());
  }
  if(type === 'category'){
    $('#modalTitle').textContent = data ? 'Editar categoria' : 'Nova categoria';
    $('#modalEyebrow').textContent = 'CATEGORIA';
    $('#categoryForm').hidden = false;
    $('#categoryForm').reset();
    $('#categoryId').value = data ? data.id : '';
    $('#categoryName').value = data ? data.name : '';
    $('#categoryIcon').value = data ? (data.icon || '📦') : '📦';
    $('#categoryColor').value = data ? (data.color || '#8d99ae') : '#8d99ae';
    $('#categoryGroup').value = data ? (data.group || inferCategoryGroup(data.id)) : 'essential';
  }
  if(type === 'backupPin'){
    $('#modalTitle').textContent = 'Restaurar backup';
    $('#modalEyebrow').textContent = 'CRIPTOGRAFADO';
  }
}

function closeModalForms(){
  ['transactionForm','recurringForm','incomeSourceForm','shoppingListForm','budgetForm','goalForm','accountForm','cardForm','billForm','transferForm','categoryForm'].forEach(function(id){
    const el=$('#'+id); if(el) el.hidden = true;
  });
}

function closeModal(){
  $('#modalBackdrop').hidden = true;
  document.body.style.overflow = '';
  pendingBackup = pendingBackup;
}


function normalizedInstallmentCount(value){
  return Math.max(1,Math.min(60,Math.floor(Number(value || 1))));
}

function splitInstallmentAmounts(total,count){
  const safeCount=normalizedInstallmentCount(count);
  const cents=Math.max(0,Math.round(Number(total || 0)*100));
  const base=Math.floor(cents/safeCount);
  const remainder=cents-(base*safeCount);

  return Array.from({length:safeCount},function(_,index){
    return (base+(index<remainder ? 1 : 0))/100;
  });
}

function transactionInstallmentMembers(existing){
  if(!existing || !appState) return [];
  if(!existing.installmentGroup) return [existing];

  return appState.transactions
    .filter(function(t){return t.installmentGroup===existing.installmentGroup;})
    .sort(function(a,b){
      return Number(a.installmentNo || 1)-Number(b.installmentNo || 1);
    });
}

function replaceTransactionInstallmentPlan(existing,base,total,count,card){
  const credit=base.type==='expense'
    && base.payment==='Cartão de crédito'
    && card
    && !isBenefitCard(card);

  const effectiveCount=credit ? normalizedInstallmentCount(count) : 1;
  const previous=transactionInstallmentMembers(existing);
  const previousIds=new Set(previous.map(function(t){return t.id;}));
  const group=effectiveCount>1
    ? (existing?.installmentGroup || uid('inst'))
    : '';

  const amounts=splitInstallmentAmounts(total,effectiveCount);
  const firstInvoice=credit ? cardInvoiceMonth(base.purchaseDate,card) : '';
  const recurrenceBase=existing?.recurrenceBaseKey
    || (existing?.sourceRecurringId ? (existing.recurrenceKey || '') : '');

  const records=amounts.map(function(amount,index){
    const no=index+1;
    const previousRecord=previous[index] || (index===0 ? existing : null) || {};
    const invoiceMonth=credit
      ? shiftMonth(firstInvoice,index)
      : (card
          ? (isBenefitCard(card) ? base.purchaseDate.slice(0,7) : cardInvoiceMonth(base.purchaseDate,card))
          : '');

    const date=credit && effectiveCount>1
      ? localDateKey(safeMonthDate(invoiceMonth,Number(card.dueDay || 10)))
      : base.purchaseDate;

    const record=Object.assign({},previousRecord,base,{
      id:previousRecord.id || (index===0 && existing?.id ? existing.id : uid('tx')),
      amount,
      date,
      invoiceMonth,
      purchaseTotal:Number(total),
      installmentGroup:group,
      installmentNo:no,
      installmentCount:effectiveCount,
      installmentAmount:amount,
      updatedAt:new Date().toISOString(),
      createdAt:previousRecord.createdAt || existing?.createdAt || new Date().toISOString()
    });

    if(recurrenceBase){
      record.recurrenceBaseKey=recurrenceBase;
      record.recurrenceKey=effectiveCount>1
        ? recurrenceBase+':inst:'+no
        : recurrenceBase;
    }

    return record;
  });

  if(existing){
    appState.transactions=appState.transactions.filter(function(t){
      return !previousIds.has(t.id);
    });
  }

  appState.transactions.push(...records);
  return records;
}

async function saveTransactionForm(e){
  return withLoading('Salvando lançamento…','Atualizando seus dados financeiros.',async function(){
    e.preventDefault();

    const id=$('#transactionId').value;
    const existing=id ? appState.transactions.find(function(t){return t.id===id;}) : null;
    const type=getRadio('txType');
    const payment=$('#txPayment').value;
    const total=Number($('#txAmount').value);
    const purchaseDate=$('#txDate').value;
    const cardId=$('#txCard').value || '';
    const usesCard=type==='expense' && paymentUsesCard(payment);
    const isCredit=payment==='Cartão de crédito';
    const requestedInstallments=isCredit
      ? normalizedInstallmentCount($('#txInstallments').value)
      : 1;

    let card=null;

    if(usesCard){
      card=getCard(cardId);
      if(!card){
        toast('Selecione o cartão ou benefício usado neste lançamento.','error');
        return;
      }
      if(!cardMatchesPayment(card,payment)){
        toast('O cartão selecionado não corresponde ao meio de pagamento.','error');
        return;
      }
    }

    if(isCredit && card && isBenefitCard(card)){
      toast('Parcelamento está disponível somente para cartão de crédito.','error');
      return;
    }

    const base={
      type,
      description:$('#txDescription').value.trim(),
      date:purchaseDate,
      purchaseDate,
      category:$('#txCategory').value,
      payment,
      accountId:$('#txAccount').value || '',
      cardId:usesCard ? cardId : '',
      tags:$('#txTags').value.trim(),
      notes:$('#txNotes').value.trim(),
      updatedAt:new Date().toISOString()
    };

    if(!base.description || !purchaseDate || !(total>0)){
      toast('Preencha descrição, valor e data.','error');
      return;
    }

    if(existing){
      const previousCount=normalizedInstallmentCount(existing.installmentCount || 1);
      const records=replaceTransactionInstallmentPlan(
        existing,
        base,
        total,
        requestedInstallments,
        card
      );

      logAudit(
        'transaction-update',
        base.description+' · '+requestedInstallments+'x · '+money(total)
      );

      await commitStateChange();

      if(isCredit){
        toast(
          previousCount===requestedInstallments
            ? 'Compra atualizada em '+requestedInstallments+'x.'
            : 'Parcelamento recalculado de '+previousCount+'x para '+requestedInstallments+'x.',
          'success'
        );
      }else{
        toast(
          records.length===1 ? 'Lançamento atualizado.' : 'Lançamento atualizado.',
          'success'
        );
      }
      return;
    }

    if(type==='expense' && usesCard){
      const records=replaceTransactionInstallmentPlan(
        null,
        base,
        total,
        requestedInstallments,
        card
      );

      logAudit(
        requestedInstallments>1 ? 'installment-create' : 'transaction-create',
        base.description+' · '+requestedInstallments+'x · '+money(total)
      );

      await commitStateChange();

      toast(
        requestedInstallments>1
          ? requestedInstallments+'x de aproximadamente '+money(total/requestedInstallments)+' criadas. Total: '+money(total)+'.'
          : 'Lançamento salvo à vista no cartão.',
        'success'
      );
      return;
    }

    const record=Object.assign({},base,{
      id:uid('tx'),
      amount:total,
      invoiceMonth:'',
      purchaseTotal:total,
      installmentGroup:'',
      installmentNo:1,
      installmentCount:1,
      installmentAmount:total,
      createdAt:new Date().toISOString()
    });

    appState.transactions.push(record);
    logAudit('transaction-create',record.description);
    await commitStateChange();
    toast('Lançamento salvo.','success');
  });
}

async function saveRecurringForm(e){
  return withLoading('Salvando custo fixo…','Atualizando sua despesa recorrente.',async function(){
    e.preventDefault();

    const id=$('#recurringId').value;
    const payment=$('#recPayment').value;
    const usesCard=paymentUsesCard(payment);
    const cardId=usesCard ? ($('#recCard').value || '') : '';

    if(usesCard){
      const card=getCard(cardId);
      if(!card){
        toast('Selecione o cartão ou benefício usado neste custo fixo.','error');
        return;
      }
      if(!cardMatchesPayment(card,payment)){
        toast('O cartão selecionado não corresponde ao meio de pagamento.','error');
        return;
      }
    }

    const record={
      id:id || uid('rec'),
      type:'expense',
      kind:$('#recKind').value || 'fixed',
      description:$('#recDescription').value.trim(),
      amount:Number($('#recAmount').value),
      day:Math.max(1,Math.min(31,Number($('#recDay').value))),
      category:$('#recCategory').value,
      payment,
      cardId,
      active:$('#recActive').checked,
      updatedAt:new Date().toISOString()
    };

    if(!record.description || !(record.amount>0)){
      toast('Preencha descrição e valor.','error');
      return;
    }

    const index=appState.recurring.findIndex(function(r){return r.id===id;});
    if(index>=0){
      appState.recurring[index]=Object.assign({},appState.recurring[index],record);
    }else{
      appState.recurring.push(record);
    }

    syncRecurringTransactionForMonth(record,selectedMonth);
    logAudit(index>=0?'recurring-update':'recurring-create',record.description);

    await commitStateChange();
    toast(index>=0?'Custo fixo atualizado.':'Custo fixo criado.','success');
  });
}

async function saveBudgetForm(e){
  return withLoading("Salvando orçamento…","Atualizando o limite mensal.",async function(){
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
  await commitStateChange();
  toast('Orçamento salvo.','success');

  });
}

async function saveGoalForm(e){
  return withLoading("Salvando meta…","Atualizando seu objetivo financeiro.",async function(){
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
  await commitStateChange();
  toast('Meta salva.','success');

  });
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

  appState.recurring
    .filter(function(r){return r && r.active!==false && r.type!=='income';})
    .forEach(function(r){syncRecurringTransactionForMonth(r,monthKey);});

  appState.incomeSources
    .filter(function(source){return source && source.active!==false;})
    .forEach(function(source){
      syncRecurringTransactionForMonth({
        id:source.id,
        type:'income',
        kind:'income',
        description:source.description,
        amount:Number(source.amount || 0),
        day:Number(source.day || 1),
        category:'outros',
        payment:'Crédito em conta',
        accountId:source.accountId || '',
        active:source.active!==false,
        incomeKind:source.kind || 'other',
        sourceType:'incomeSource'
      },monthKey);
    });
}

function recurringTransactionData(recurring,monthKey){
  const chargeDate=localDateKey(safeMonthDate(monthKey,Number(recurring.day || 1)));
  const isIncome=recurring.type==='income';
  const usesCard=!isIncome && paymentUsesCard(recurring.payment) && recurring.cardId;
  const card=usesCard ? getCard(recurring.cardId) : null;

  let date=chargeDate;
  let invoiceMonth='';
  let cardId='';

  if(card){
    cardId=card.id;

    if(isBenefitCard(card)){
      invoiceMonth=chargeDate.slice(0,7);
    }else{
      invoiceMonth=cardInvoiceMonth(chargeDate,card);
      date=localDateKey(safeMonthDate(invoiceMonth,Number(card.dueDay || 10)));
    }
  }

  return {
    type:isIncome?'income':'expense',
    description:recurring.description,
    amount:Number(recurring.amount),
    date,
    purchaseDate:chargeDate,
    invoiceMonth,
    category:isIncome ? 'outros' : recurring.category,
    payment:isIncome ? 'Crédito em conta' : (recurring.payment || 'Automático'),
    accountId:isIncome ? (recurring.accountId || '') : '',
    cardId,
    notes:isIncome
      ? 'Gerado automaticamente a partir de renda recorrente'
      : card
        ? 'Gerado automaticamente a partir de custo fixo · '+card.name
        : 'Gerado automaticamente a partir de custo fixo',
    sourceRecurringId:recurring.id,
    sourceType:isIncome ? 'incomeSource' : 'recurringExpense',
    recurrenceKey:(isIncome?'income:':'expense:')+recurring.id+':'+monthKey,
    updatedAt:new Date().toISOString()
  };
}

function syncRecurringTransactionForMonth(recurring,monthKey){
  if(!appState || !recurring || recurring.active===false) return null;

  const data=recurringTransactionData(recurring,monthKey);

  const existing=appState.transactions.find(function(t){
    if(t.recurrenceKey===data.recurrenceKey) return true;

    // Compatibilidade com lançamentos automáticos criados antes da separação
    // entre custos fixos e rendas recorrentes.
    return t.sourceRecurringId===recurring.id
      && String(t.purchaseDate || t.date || '').slice(0,7)===monthKey;
  });

  if(existing){
    Object.assign(existing,data);
    return existing;
  }

  const created=Object.assign({},data,{
    id:uid('tx'),
    createdAt:new Date().toISOString()
  });

  appState.transactions.push(created);
  return created;
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
  if(!appState.accounts.length){
    const acc1={id:uid('acc'),name:'Conta principal',type:'Conta corrente',openingBalance:1500,icon:'🏦',color:'#7c5cff'};
    const acc2={id:uid('acc'),name:'Carteira',type:'Dinheiro',openingBalance:180,icon:'👛',color:'#17c3b2'};
    appState.accounts.push(acc1,acc2);
  }
  if(!appState.cards.length){
    appState.cards.push({id:uid('card'),name:'Cartão principal',brand:'Mastercard',limit:5000,closingDay:3,dueDay:10,accountId:appState.accounts[0]?appState.accounts[0].id:'',color:'#141b34'});
  }
  if(appState.cards.length){
    appState.recurring.forEach(function(rec){
      if(rec.payment==='Cartão de crédito' && !rec.cardId){
        rec.cardId=appState.cards[0].id;
      }
    });
  }
  if(!appState.shoppingLists.length){
    const shoppingDemo={
      id:uid('shop'),
      name:'Compras do mês',
      store:'Mercado',
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),
      items:[
        {id:uid('shopitem'),product:'Arroz',qty:2,unitPrice:15,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},
        {id:uid('shopitem'),product:'Feijão',qty:2,unitPrice:8.5,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},
        {id:uid('shopitem'),product:'Leite',qty:6,unitPrice:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}
      ]
    };
    appState.shoppingLists.push(shoppingDemo);
    appState.shoppingActiveListId=shoppingDemo.id;
  }
  if(!appState.bills.length){
    appState.bills.push(
      {id:uid('bill'),type:'expense',description:'Energia elétrica',amount:210,dueDate:localDateKey(safeMonthDate(m0,28)),category:'moradia',accountId:appState.accounts[0]?appState.accounts[0].id:'',paid:false,notes:'Demonstração'},
      {id:uid('bill'),type:'expense',description:'Plano de internet móvel',amount:79.90,dueDate:localDateKey(safeMonthDate(shiftMonth(m0,1),8)),category:'assinaturas',accountId:appState.accounts[0]?appState.accounts[0].id:'',paid:false,notes:'Demonstração'}
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
  ['txCategory','recCategory','budgetCategory','billCategory'].forEach(function(id){
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


async function handleMonthlyBudgetInput(e){
  if(!appState) return;

  const value=Math.max(0,Number(e.target.value || 0));
  appState.settings.monthlyBudget=value;

  // Atualiza apenas os visuais dependentes do limite para não recriar o campo
  // enquanto o usuário ainda está digitando.
  renderDashboard();

  const status=$('#monthlyBudgetSaveStatus');
  if(status){
    status.className='settings-save-status pending';
    status.textContent=navigator.onLine
      ? 'Pendente · sincroniza 10s após a última alteração'
      : 'Offline · será enviado ao Firestore quando a conexão voltar';
  }

  await saveVault(false);
  renderSettingsPersistenceStatus();
}

function renderSettingsPersistenceStatus(){
  const status=$('#monthlyBudgetSaveStatus');
  const path=$('#cloudDataPath');
  const mode=$('#cloudDataMode');

  const uidLabel=cloudUser?.uid ? cloudUser.uid : '{uid}';

  if(path){
    path.textContent=cloudStorageMode==='legacy'
      ? 'users/'+uidLabel+'/state/main'
      : 'users/'+uidLabel+'/data/*';
  }

  if(mode){
    mode.textContent=cloudStorageMode==='legacy'
      ? 'Fallback legado ativo · publique as regras atuais para migrar para data/*'
      : cloudStorageMode==='modular'
        ? 'Firestore modular · cache local somente para offline'
        : 'Aguardando confirmação da estrutura no Firestore';
  }

  if(!status) return;

  const settingsPending=!!(
    appState
    && changedStateSections(appState).includes('settings')
    && cloudSyncPending
  );

  if(!cloudUser){
    status.className='settings-save-status';
    status.textContent='Entre com Google para sincronizar configurações';
    return;
  }

  if(settingsPending){
    status.className='settings-save-status pending';
    const seconds=Math.max(0,Math.ceil((cloudSyncDueAt-Date.now())/1000));
    status.textContent=navigator.onLine
      ? 'Pendente · settings será enviado em '+Math.max(1,seconds)+'s'
      : 'Offline · settings pendente';
    return;
  }

  if(cloudStorageMode==='legacy'){
    status.className='settings-save-status legacy';
    status.textContent='Salvo no Firestore legado · state/main';
    return;
  }

  if(cloudStorageMode==='modular'){
    status.className='settings-save-status synced';
    status.textContent='Sincronizado · data/settings → value.monthlyBudget';
    return;
  }

  status.className='settings-save-status';
  status.textContent='Firestore · users/{uid}/data/settings';
}

function syncSettingsFields(){
  if(!appState) return;
  $('#themeSelect').value = appState.settings.theme || 'system';
  const budgetField=$('#monthlyBudgetInput');
  if(budgetField && document.activeElement!==budgetField){
    budgetField.value = Number(appState.settings.monthlyBudget || 0);
  }
  if($('#privacyBtn')) $('#privacyBtn').textContent = appState.settings.privacyMode ? '🙈' : '👁';
  renderSettingsPersistenceStatus();
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
  // A persistência da sessão é controlada pelo Firebase Authentication.
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



function bindCloudEvents(){
  const signInButtons=['googleLoginBtn','googleSettingsBtn'];
  signInButtons.forEach(function(id){
    const el=$('#'+id);
    if(el){
      el.addEventListener('click',function(e){
        e.preventDefault();
        cloudSignIn();
      });
    }
  });

  // Falhas em recursos secundários não podem impedir o login Google.
  try{ bindFamilyEvents(); }catch(err){ console.error('Stop Gastos bindFamilyEvents:',err); }

  const signOutBtn=$('#cloudSignOutBtn');
  if(signOutBtn) signOutBtn.addEventListener('click',cloudSignOut);

  const syncBtn=$('#cloudSyncNowBtn');
  if(syncBtn) syncBtn.addEventListener('click',forceCloudSync);

  const testFirestoreBtn=$('#testFirestoreBtn');
  if(testFirestoreBtn) testFirestoreBtn.addEventListener('click',testFirestoreFromUi);

  const enablePushBtn=$('#enableNotificationsBtn');
  if(enablePushBtn) enablePushBtn.addEventListener('click',enableCloudNotifications);

  const familyBell=$('#notificationsBtn');
  if(familyBell) familyBell.addEventListener('click',function(){
    navigate('family');
    setTimeout(function(){
      const panel=$('#familyNotificationsPanel');
      if(panel && !panel.hidden) panel.scrollIntoView({behavior:'smooth',block:'start'});
    },80);
  });

  const statusBtn=$('#cloudStatusBtn');
  if(statusBtn) statusBtn.addEventListener('click',function(){navigate('settings');});

  window.addEventListener('stopgastos:cloud-ready',handleCloudReady);
  window.addEventListener('stopgastos:cloud-error',function(e){
    setCloudStatus('error',(e.detail && e.detail.message) || 'Falha na sincronização.');
  });
  window.addEventListener('stopgastos:sync-failed',function(e){
    const detail=e.detail || {};
    if(detail.permissionDenied){
      toast('O Firestore está bloqueando a gravação. Publique as regras atualizadas em Firestore Database → Rules.','error');
    }
  });
  window.addEventListener('stopgastos:notification',function(e){
    const payload=e.detail || {};
    const notification=payload.notification || {};
    toast((notification.title ? notification.title+': ' : '')+(notification.body || 'Nova notificação financeira.'),'info');
  });
  window.addEventListener('online',function(){
    if(cloudUser && cloudSyncPending && appState){
      const remainingDelay=cloudSyncDueAt
        ? Math.max(0,cloudSyncDueAt-Date.now())
        : CLOUD_SYNC_DELAY_MS;

      queueCloudPush(clone(appState),{
        force:remainingDelay<=0,
        delayMs:remainingDelay,
        sections:changedStateSections(appState)
      });
    }else if(cloudUser){
      setCloudStatus('synced','Conectado · sem alterações pendentes');
    }
  });
  window.addEventListener('offline',function(){
    if(cloudUser) setCloudStatus('offline','Offline · alterações ficam salvas localmente');
  });
}

function handleCloudReady(){
  const cloud=window.StopGastosCloud;
  if(!cloud){
    renderCloudUi();
    return;
  }

  if(cloudAuthUnsubscribe){
    try{cloudAuthUnsubscribe();}catch(err){}
    cloudAuthUnsubscribe=null;
  }

  if(cloud.configured && cloud.ready){
    cloudAuthUnsubscribe=cloud.onUserChanged(handleCloudUser);
  }
  renderCloudUi();
}

async function handleCloudUser(user){
  return withLoading('Carregando seus dados…','Lendo seus dados do Firestore.',async function(){
    cloudUser=user || null;

    if(cloudPushTimer){
      clearTimeout(cloudPushTimer);
      cloudPushTimer=null;
    }
    if(cloudVaultUnsubscribe){
      try{cloudVaultUnsubscribe();}catch(err){}
      cloudVaultUnsubscribe=null;
    }
    clearFamilyWatchers();

    if(!cloudUser){
      familyContext=null;
      familyStates={};
      familyInvitations=[];
      notifiedFamilyInvites.clear();
      renderFamilyNotifications();
      appState=null;
      cloudSyncedState=null;
      cloudSyncPending=false;
      cloudSyncDueAt=0;
      localStateUpdatedAt='';
      renderCloudUi();
      showSignedOutScreen();
      return;
    }

    renderCloudUi();

    const cloud=window.StopGastosCloud;
    if(!cloud || !cloud.ready) return;

    setCloudStatus('syncing','Conectado · lendo Firestore');

    let local=readLocalState();

    if(!local){
      const migrated=await tryMigrateLegacyState();
      if(migrated){
        appState=migrated;
        localStateUpdatedAt=new Date().toISOString();
        cloudSyncPending=true;
        cloudSyncDueAt=Date.now()+CLOUD_SYNC_DELAY_MS;
        writeLocalState();
        local=readLocalState();
        toast('Dados antigos encontrados. Migração para o Firestore será feita automaticamente.','info');
      }
    }

    try{
      let remote=null;

      if(navigator.onLine){
        try{
          remote=await cloud.pullStateFromServer();
        }catch(serverError){
          console.warn('Stop Gastos server-first read failed, using SDK cache:',serverError);
          remote=await cloud.pullState();
        }
      }else{
        remote=await cloud.pullState();
      }

      cloudStorageMode=remote?.modular ? 'modular' : remote?.legacy ? 'legacy' : cloudStorageMode;

      const legacyIncomeNeedsMigration=!!(
        remote?.state
        && Array.isArray(remote.state.recurring)
        && remote.state.recurring.some(function(item){return item && item.type==='income';})
      );

      const source=applyBestState(local,remote);

      if(legacyIncomeNeedsMigration && cloudSyncedState){
        // Mantém o snapshot do servidor como baseline real para que o diff
        // detecte recurring + incomeSources e grave a separação no Firestore.
        cloudSyncedState.recurring=Array.isArray(remote.state.recurring)
          ? clone(remote.state.recurring)
          : [];
        cloudSyncedState.incomeSources=Array.isArray(remote.state.incomeSources)
          ? clone(remote.state.incomeSources)
          : [];
        cloudSyncPending=true;
        cloudSyncDueAt=Date.now()+CLOUD_SYNC_DELAY_MS;
        writeLocalState();
      }

      if(source==='empty'){
        appState=makeInitialState();
        localStateUpdatedAt=new Date().toISOString();
        cloudSyncedState=null;
        cloudSyncPending=true;
        cloudSyncDueAt=Date.now()+CLOUD_SYNC_DELAY_MS;
        writeLocalState();
      }

      if(remote?.legacy && remote.state){
        try{
          const migratedResult=await cloud.migrateLegacyState(clone(remote.state));
          if(migratedResult?.migrated){
            cloudStorageMode='modular';
            cloudSyncedState=clone(normalizeState(remote.state));
            cloudSyncPending=false;
            cloudSyncDueAt=0;
            localStateUpdatedAt=migratedResult.clientUpdatedAt || localStateUpdatedAt;
            writeLocalState();
          }
        }catch(migrationError){
          console.error('Stop Gastos modular Firestore migration:',migrationError);
          cloudSyncedState=null;
          cloudSyncPending=true;
          cloudSyncDueAt=Date.now()+CLOUD_SYNC_DELAY_MS;
          writeLocalState();
        }
      }

      const beforeRecurring=sectionFingerprint(appState,'transactions');
      ensureRecurringForMonth(selectedMonth);
      const recurringChanged=beforeRecurring!==sectionFingerprint(appState,'transactions');

      if(recurringChanged){
        await saveVault(false);
      }else if(cloudSyncPending || source==='local-pending' || source==='empty'){
        const remainingDelay=local?.syncDueAt
          ? Math.max(0,Number(local.syncDueAt)-Date.now())
          : CLOUD_SYNC_DELAY_MS;

        await queueCloudPush(clone(appState),{
          force:remainingDelay<=0,
          delayMs:remainingDelay,
          sections:changedStateSections(appState)
        });
      }

      openApp();

      cloudVaultUnsubscribe=cloud.watchState(function(incoming){
        reconcileCloudState(incoming);
      });

      await refreshFamilyData();

      if(cloudSyncPending){
        setCloudStatus(
          navigator.onLine?'syncing':'offline',
          navigator.onLine
            ? 'Alterações pendentes · sincronização automática em 10s'
            : 'Offline · alterações pendentes'
        );
      }else if(remote?.fromCache){
        setCloudStatus('offline','Dados carregados do cache do Firestore · aguardando servidor');
      }else{
        cloudLastSyncedAt=new Date();
        setCloudStatus('synced','Dados confirmados pelo Firestore');
      }
    }catch(err){
      console.error('Stop Gastos Firestore load:',err);

      if(local && local.state){
        appState=normalizeState(local.state);
        localStateUpdatedAt=local.clientUpdatedAt || '';
        cloudSyncedState=null;
        cloudSyncPending=true;
        cloudSyncDueAt=Date.now()+CLOUD_SYNC_DELAY_MS;
        writeLocalState();
        openApp();
        setCloudStatus(
          navigator.onLine?'error':'offline',
          navigator.onLine
            ? 'Não foi possível ler o Firestore · usando cache local'
            : 'Offline · usando cache local'
        );
      }else{
        appState=makeInitialState();
        localStateUpdatedAt=new Date().toISOString();
        cloudSyncedState=null;
        cloudSyncPending=true;
        cloudSyncDueAt=Date.now()+CLOUD_SYNC_DELAY_MS;
        writeLocalState();
        openApp();
        setCloudStatus('error','Firestore indisponível · alteração ficará pendente');
      }
    }
  });
}

async function cloudSignIn(){
  const buttons=['googleLoginBtn','googleSettingsBtn']
    .map(id=>$('#'+id))
    .filter(Boolean);

  const cloud=window.StopGastosCloud;

  if(!cloud || !cloud.configured){
    toast('Firebase ainda não está configurado ou não foi carregado. Atualize a página e tente novamente.','error');
    return;
  }

  if(!cloud.ready){
    setCloudStatus('syncing','Firebase ainda está inicializando…');
    toast('O Firebase ainda está inicializando. Aguarde um instante e toque novamente.','info');
    return;
  }

  buttons.forEach(function(btn){
    btn.disabled=true;
    btn.dataset.originalText=btn.dataset.originalText || btn.innerHTML;
    btn.innerHTML='<span class="button-spinner" aria-hidden="true"></span> Abrindo Google…';
  });

  setCloudStatus('syncing','Abrindo autenticação do Google…');

  try{
    // Chamada direta: preserva a ativação do toque/clique necessária ao popup.
    await cloud.signInGoogle();
  }catch(err){
    console.error('Stop Gastos Google login:',err);

    if(err && err.code==='auth/unauthorized-domain'){
      toast('O domínio felipecgomes.github.io precisa estar autorizado no Firebase Authentication.','error');
    }else if(err && err.code==='auth/popup-closed-by-user'){
      toast('O login Google foi cancelado.','info');
    }else if(err && err.code==='auth/popup-blocked'){
      toast('O navegador bloqueou a janela do Google. Permita pop-ups para este site e tente novamente.','error');
    }else{
      toast('Não foi possível entrar com Google: '+(err.message || 'erro desconhecido'),'error');
    }
    renderCloudUi();
  }finally{
    buttons.forEach(function(btn){
      btn.disabled=false;
      if(btn.dataset.originalText){
        btn.innerHTML=btn.dataset.originalText;
      }
    });
  }
}

async function cloudSignOut(){
  return withLoading("Saindo da conta…","Encerrando a sessão neste dispositivo.",async function(){
  const cloud=window.StopGastosCloud;
  if(!cloud) return;
  try{
    clearFamilyWatchers();
    if(cloudVaultUnsubscribe){try{cloudVaultUnsubscribe();}catch(err){} cloudVaultUnsubscribe=null;}
    await cloud.signOutGoogle();

    if(cloudPushTimer){
      clearTimeout(cloudPushTimer);
      cloudPushTimer=null;
    }

    cloudUser=null;
    appState=null;
    cloudStorageMode='unknown';
    cloudSyncedState=null;
    cloudSyncPending=false;
    cloudSyncDueAt=0;
    cloudSyncInFlight=false;
    familyContext=null;
    familyStates={};
    showSignedOutScreen();
    renderCloudUi();
    toast('Conta Google desconectada.','success');
  }catch(err){
    toast('Não foi possível sair da conta Google.','error');
  }

  });
}

function queueCloudPush(state,options={}){
  const force=options===true || options?.force===true;
  const requestedDelay=Number(options?.delayMs);
  const delayMs=force
    ? 0
    : (Number.isFinite(requestedDelay) ? Math.max(0,requestedDelay) : CLOUD_SYNC_DELAY_MS);
  const cloud=window.StopGastosCloud;

  if(cloudPushTimer){
    clearTimeout(cloudPushTimer);
    cloudPushTimer=null;
  }

  const snapshot=clone(state || appState);
  const sections=Array.isArray(options?.sections) && options.sections.length
    ? options.sections
    : changedStateSections(snapshot);

  if(!sections.length){
    if(cloudSyncedState){
      cloudSyncPending=false;
      cloudSyncDueAt=0;
      writeLocalState();
    }
    return Promise.resolve({queued:false,noChanges:true});
  }

  cloudSyncPending=true;

  if(!cloud || !cloud.ready || !cloud.isSignedIn()){
    cloudSyncDueAt=Date.now()+delayMs;
    writeLocalState();
    setCloudStatus('offline','Alterações pendentes · aguardando conexão com Firebase');
    return Promise.resolve({queued:true,localOnly:true,sections});
  }

  if(!navigator.onLine && !force){
    cloudSyncDueAt=Date.now()+delayMs;
    writeLocalState();
    setCloudStatus('offline','Offline · alterações pendentes para o Firestore');
    return Promise.resolve({queued:true,offline:true,sections});
  }

  const run=async function(){
    if(!navigator.onLine){
      cloudSyncPending=true;
      cloudSyncDueAt=Date.now()+CLOUD_SYNC_DELAY_MS;
      writeLocalState();
      setCloudStatus('offline','Offline · alterações pendentes para o Firestore');
      return {queued:true,offline:true};
    }

    if(cloudSyncInFlight){
      cloudSyncDueAt=Date.now()+CLOUD_SYNC_DELAY_MS;
      writeLocalState();
      return {queued:true,inFlight:true};
    }

    const currentSnapshot=clone(appState || snapshot);
    const currentSections=changedStateSections(currentSnapshot);
    if(!currentSections.length){
      cloudSyncPending=false;
      cloudSyncDueAt=0;
      writeLocalState();
      setCloudStatus('synced','Nenhuma alteração pendente');
      return {synced:true,noChanges:true};
    }

    cloudSyncInFlight=true;
    cloudSyncDueAt=0;
    writeLocalState();

    try{
      setCloudStatus('syncing','Enviando '+currentSections.length+' módulo(s) alterado(s) ao Firestore…');

      const result=await cloud.pushState(currentSnapshot,{
        sections:currentSections
      });

      cloudStorageMode=result?.fallbackLegacy ? 'legacy' : 'modular';
      cloudSyncedState=clone(currentSnapshot);
      renderSettingsPersistenceStatus();
      cloudLastSyncedAt=new Date();

      const remaining=changedStateSections(appState,cloudSyncedState);
      if(remaining.length){
        cloudSyncPending=true;
        cloudSyncDueAt=Date.now()+CLOUD_SYNC_DELAY_MS;
        writeLocalState();
        setCloudStatus('syncing','Novas alterações pendentes · sincroniza em 10s');

        cloudPushTimer=setTimeout(function(){
          queueCloudPush(clone(appState),{force:true,sections:remaining}).catch(function(){});
        },CLOUD_SYNC_DELAY_MS);
      }else{
        cloudSyncPending=false;
        cloudSyncDueAt=0;
        localStateUpdatedAt=result?.clientUpdatedAt || localStateUpdatedAt;
        writeLocalState();
        setCloudStatus(
          'synced',
          result?.fallbackLegacy
            ? 'Confirmado no Firestore legado · users/'+cloudUser.uid+'/state/main'
            : 'Confirmado no Firestore · '+currentSections.map(function(section){
                return 'data/'+section;
              }).join(', ')
        );
      }

      return {
        synced:true,
        result,
        sections:currentSections,
        fallbackLegacy:!!result?.fallbackLegacy
      };
    }catch(err){
      const code=String(err?.code || '');
      const message=String(err?.message || err || 'Erro desconhecido');
      const permissionDenied=code.includes('permission-denied')
        || message.toLowerCase().includes('insufficient permissions')
        || message.toLowerCase().includes('missing or insufficient permissions');

      cloudSyncPending=true;
      cloudSyncDueAt=Date.now()+CLOUD_SYNC_DELAY_MS;
      writeLocalState();

      const statusMessage=!navigator.onLine
        ? 'Offline · sincronização pendente'
        : permissionDenied
          ? 'Firestore recusou a gravação · publique as regras atualizadas'
          : 'Falha no Firebase · '+message.slice(0,120);

      console.error('Stop Gastos Firestore push failed:',err);
      setCloudStatus(navigator.onLine?'error':'offline',statusMessage);

      globalThis.dispatchEvent(new CustomEvent('stopgastos:sync-failed',{
        detail:{code,message,permissionDenied}
      }));

      return {synced:false,error:{code,message,permissionDenied}};
    }finally{
      cloudSyncInFlight=false;
    }
  };

  if(force){
    return run();
  }

  cloudSyncDueAt=Date.now()+delayMs;
  writeLocalState();

  if(delayMs<=0){
    return run();
  }

  setCloudStatus(
    'syncing',
    'Alterações pendentes · sincronização automática em '+Math.ceil(delayMs/1000)+'s'
  );

  cloudPushTimer=setTimeout(function(){
    cloudPushTimer=null;
    run().catch(function(){});
  },delayMs);

  return Promise.resolve({
    queued:true,
    delayMs,
    sections
  });
}

async function testFirestoreFromUi(){
  return withLoading(
    'Testando Firestore…',
    'Gravando módulos e relendo diretamente do servidor.',
    async function(){
      const cloud=window.StopGastosCloud;

      if(!cloud || !cloud.configured){
        toast('Firebase não está configurado neste aplicativo.','error');
        return;
      }
      if(!cloud.ready){
        toast('Firebase ainda está inicializando. Tente novamente em alguns segundos.','info');
        return;
      }
      if(!cloud.isSignedIn() || !cloudUser){
        toast('Entre com Google antes de testar o Firestore.','info');
        return;
      }
      if(!appState){
        toast('Nenhum estado carregado para testar.','error');
        return;
      }

      try{
        setCloudStatus('syncing','Testando users/'+cloudUser.uid+'/data/*…');

        const pushed=await cloud.pushState(clone(appState),{
          sections:STATE_SECTION_KEYS
        });

        const remote=await cloud.pullStateFromServer(cloudUser.uid);
        cloudStorageMode=remote?.modular ? 'modular' : remote?.legacy ? 'legacy' : cloudStorageMode;

        if(!pushed?.synced || !remote?.state || !remote?.modular){
          throw new Error('A gravação modular não pôde ser confirmada diretamente no servidor.');
        }

        cloudSyncedState=clone(normalizeState(remote.state));
        cloudSyncPending=false;
        cloudSyncDueAt=0;
        localStateUpdatedAt=remote.clientUpdatedAt || pushed.clientUpdatedAt || localStateUpdatedAt;
        writeLocalState();

        cloudLastSyncedAt=new Date();
        setCloudStatus('synced','Firestore OK · users/'+cloudUser.uid+'/data/*');

        toast('Firestore OK. Todos os módulos foram gravados e confirmados no servidor.','success');
      }catch(err){
        const code=String(err?.code || '');
        const message=String(err?.message || err || 'Erro desconhecido');
        const denied=code.includes('permission-denied')
          || message.toLowerCase().includes('insufficient permissions')
          || message.toLowerCase().includes('missing or insufficient permissions');

        console.error('Stop Gastos Firestore diagnostic:',err);

        if(denied){
          setCloudStatus('error','Firestore bloqueado pelas regras de segurança');
          toast('Firestore recusou a gravação modular. Publique o firestore.rules atualizado no Firebase Console.','error');
        }else{
          setCloudStatus('error','Falha no teste Firestore · '+message.slice(0,120));
          toast('Teste Firestore falhou: '+(code?code+' · ':'')+message,'error');
        }
      }
    }
  );
}

async function forceCloudSync(showToast=true){
  return withLoading('Sincronizando…','Atualizando o Firestore e conferindo o servidor.',async function(){
    const cloud=window.StopGastosCloud;

    if(!cloud || !cloud.configured){
      if(showToast) toast('Firebase ainda não configurado.','info');
      return;
    }
    if(!cloud.isSignedIn()){
      if(showToast) await cloudSignIn();
      return;
    }

    try{
      let usedLegacyFallback=false;

      if(cloudSyncPending && appState){
        const result=await queueCloudPush(clone(appState),{
          force:true,
          sections:changedStateSections(appState)
        });

        usedLegacyFallback=!!result?.fallbackLegacy;

        if(result?.synced===false && result?.error){
          throw new Error(result.error.message || 'Não foi possível enviar as alterações.');
        }
      }

      const remote=await cloud.pullStateFromServer();
      usedLegacyFallback=usedLegacyFallback || !!remote?.legacy;

      if(remote?.state){
        if(!cloudSyncPending){
          await reconcileCloudState(remote);
          cloudSyncedState=clone(normalizeState(remote.state));
          localStateUpdatedAt=remote.clientUpdatedAt || localStateUpdatedAt;
          writeLocalState();
        }
      }else if(appState){
        const result=await cloud.pushState(clone(appState),{
          sections:STATE_SECTION_KEYS
        });
        if(result?.synced){
          markCloudSynced(appState,result.clientUpdatedAt);
        }
      }

      await refreshFamilyData();
      cloudLastSyncedAt=new Date();

      if(usedLegacyFallback && !cloudSyncPending){
        setCloudStatus(
          'synced',
          'Dados no Firestore legado · publique as regras para migrar users/{uid}/data/*'
        );
      }else{
        setCloudStatus(
          cloudSyncPending?'syncing':'synced',
          cloudSyncPending?'Ainda existem alterações pendentes':'Firestore modular sincronizado e confirmado'
        );
      }

      if(showToast){
        if(usedLegacyFallback && !cloudSyncPending){
          toast(
            'Dados salvos no Firestore em state/main. Publique o firestore.rules atualizado para concluir a migração modular.',
            'info'
          );
        }else{
          toast(
            cloudSyncPending
              ? 'Há novas alterações aguardando a próxima sincronização.'
              : 'Dados modulares confirmados no Firestore.',
            cloudSyncPending?'info':'success'
          );
        }
      }
    }catch(err){
      console.error('Stop Gastos manual sync:',err);
      setCloudStatus(
        navigator.onLine?'error':'offline',
        navigator.onLine?'Falha ao sincronizar com Firestore':'Offline · dados salvos neste dispositivo'
      );

      if(showToast){
        toast(
          navigator.onLine
            ? 'Não foi possível sincronizar agora: '+(err.message || err)
            : 'Sem internet. As alterações continuarão pendentes.',
          'error'
        );
      }
    }
  });
}

async function reconcileCloudVault(remote){
  return reconcileCloudState(remote);
}

function vaultTimestamp(value){
  if(typeof value==='string'){
    try{
      const parsed=JSON.parse(value);
      return stateTime(parsed.clientUpdatedAt || parsed.updatedAt || '');
    }catch(err){ return stateTime(value); }
  }
  return 0;
}

async function enableCloudNotifications(){
  return withLoading("Ativando notificações…","Registrando este dispositivo para receber avisos.",async function(){
  const cloud=window.StopGastosCloud;
  if(!cloud || !cloud.configured){
    toast('Configure o Firebase antes de ativar notificações.','info');
    return;
  }
  if(!cloud.isSignedIn()){
    await cloudSignIn();
    return;
  }
  try{
    const result=await cloud.enableNotifications();
    if(result && result.enabled){
      $('#enableNotificationsBtn').textContent='🔔 Notificações ativas';
      toast('Este dispositivo foi registrado para notificações.','success');
    }
  }catch(err){
    toast(err.message || 'Não foi possível ativar notificações.','error');
  }

  });
}

function setCloudStatus(kind,message){
  const ids=['cloudStatusDot','cloudSettingsDot'];
  ids.forEach(function(id){
    const el=$('#'+id);
    if(el) el.className='sync-dot '+(kind || '');
  });
  const top=$('#cloudStatusText');
  if(top){
    top.textContent=kind==='synced'?'Sincronizado':kind==='syncing'?'Sincronizando':kind==='offline'?'Offline':kind==='error'?'Erro':'Local';
  }
  const settings=$('#cloudSettingsStatus');
  if(settings) settings.textContent=message || '';
  const lock=$('#cloudLockStatus');
  if(lock){
    const text=lock.querySelector('span:last-child');
    if(text) text.textContent=message || 'Sincronização em nuvem opcional';
    const dot=lock.querySelector('.sync-dot');
    if(dot) dot.className='sync-dot '+(kind || '');
  }
  renderSettingsPersistenceStatus();
}

function renderCloudUi(){
  const cloud=window.StopGastosCloud;
  const configured=!!(cloud && cloud.configured);
  const ready=!!(cloud && cloud.ready);
  const user=cloudUser || (cloud && cloud.user) || null;

  ['googleLoginBtn','googleSettingsBtn'].forEach(function(id){
    const el=$('#'+id);
    if(el){
      // Nunca deixe o acesso Google silenciosamente desabilitado.
      // O clique aguarda a inicialização do Firebase e exibe erro se necessário.
      el.disabled=false;
      el.hidden=!!user;
      el.setAttribute('aria-disabled','false');
    }
  });

  const signOutBtn=$('#cloudSignOutBtn');
  if(signOutBtn) signOutBtn.hidden=!user;
  const syncBtn=$('#cloudSyncNowBtn');
  if(syncBtn) syncBtn.disabled=!user;
  const notificationsBtn=$('#enableNotificationsBtn');
  if(notificationsBtn) notificationsBtn.disabled=!user || !configured;

  const name=$('#cloudUserName');
  const email=$('#cloudUserEmail');
  const avatar=$('#cloudAvatar');
  if(name) name.textContent=user ? (user.displayName || 'Conta Google') : 'Não conectado';
  if(email) email.textContent=user ? (user.email || 'Conta sincronizada') : (configured?'Entre com Google para acessar seus dados.':'Firebase ainda não configurado.');
  if(avatar){
    avatar.textContent=user ? ((user.displayName || user.email || 'G').trim().charAt(0).toUpperCase()) : 'G';
    avatar.style.backgroundImage=user && user.photoURL ? 'url("'+String(user.photoURL).replace(/"/g,'')+'")' : '';
    avatar.classList.toggle('has-photo',!!(user && user.photoURL));
  }

  if(!configured){
    setCloudStatus('local','Firebase aguardando configuração do projeto');
  }else if(!ready){
    setCloudStatus('syncing','Inicializando Firebase…');
  }else if(!user){
    setCloudStatus('local','Entre com Google para acessar o Stop Gastos');
  }else if(!navigator.onLine){
    setCloudStatus('offline','Offline · dados ficam salvos localmente');
  }else if(cloudLastSyncedAt){
    setCloudStatus('synced','Última sincronização '+cloudLastSyncedAt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}));
  }else{
    setCloudStatus('syncing','Conta conectada · carregando dados');
  }
}



function currentStateKey(){
  return cloudUser ? STATE_KEY_PREFIX + cloudUser.uid : '';
}

function stateTime(value){
  const time=Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
}

function stateSectionValue(state,key){
  return state ? state[key] : undefined;
}

function sectionFingerprint(state,key){
  try{
    return JSON.stringify(stateSectionValue(state,key));
  }catch(err){
    return '';
  }
}

function changedStateSections(state,baseline=cloudSyncedState){
  if(!state) return [];

  if(!baseline){
    return STATE_SECTION_KEYS.filter(function(key){
      return Object.prototype.hasOwnProperty.call(state,key);
    });
  }

  return STATE_SECTION_KEYS.filter(function(key){
    return sectionFingerprint(state,key)!==sectionFingerprint(baseline,key);
  });
}

function readLocalState(){
  const key=currentStateKey();
  if(!key) return null;

  try{
    const wrapper=JSON.parse(localStorage.getItem(key) || 'null');
    if(!wrapper || !wrapper.state) return null;

    return {
      state:normalizeState(wrapper.state),
      clientUpdatedAt:wrapper.clientUpdatedAt || '',
      syncPending:wrapper.syncPending===true,
      syncDueAt:Number(wrapper.syncDueAt || 0)
    };
  }catch(err){
    return null;
  }
}

function writeLocalState(){
  const key=currentStateKey();
  if(!key || !appState) return;

  localStorage.setItem(key,JSON.stringify({
    app:'stop-gastos',
    version:APP_VERSION,
    clientUpdatedAt:localStateUpdatedAt || new Date().toISOString(),
    syncPending:cloudSyncPending===true,
    syncDueAt:cloudSyncDueAt || 0,
    state:appState
  }));
}

function markCloudSynced(state,clientUpdatedAt){
  cloudSyncedState=clone(state || appState || makeInitialState());
  cloudSyncPending=false;
  cloudSyncDueAt=0;
  if(clientUpdatedAt) localStateUpdatedAt=clientUpdatedAt;
  writeLocalState();
}

function markCloudPending(){
  cloudSyncPending=true;
  cloudSyncDueAt=Date.now()+CLOUD_SYNC_DELAY_MS;
  writeLocalState();
}

function applyBestState(local,remote){
  if(remote && remote.state){
    cloudSyncedState=clone(normalizeState(remote.state));

    const keepLocal=!!(
      local?.state
      && local.syncPending
      && stateTime(local.clientUpdatedAt)>stateTime(remote.clientUpdatedAt)
    );

    if(keepLocal){
      appState=normalizeState(local.state);
      localStateUpdatedAt=local.clientUpdatedAt || new Date().toISOString();
      cloudSyncPending=true;
      cloudSyncDueAt=Date.now()+CLOUD_SYNC_DELAY_MS;
      writeLocalState();
      return 'local-pending';
    }

    appState=normalizeState(remote.state);
    localStateUpdatedAt=remote.clientUpdatedAt || new Date().toISOString();
    cloudSyncPending=false;
    cloudSyncDueAt=0;
    writeLocalState();
    return remote.legacy ? 'remote-legacy' : 'remote';
  }

  if(local && local.state){
    appState=normalizeState(local.state);
    localStateUpdatedAt=local.clientUpdatedAt || new Date().toISOString();
    cloudSyncedState=null;
    cloudSyncPending=true;
    cloudSyncDueAt=Date.now()+CLOUD_SYNC_DELAY_MS;
    writeLocalState();
    return 'local-pending';
  }

  cloudSyncedState=null;
  cloudSyncPending=false;
  cloudSyncDueAt=0;
  return 'empty';
}

async function reconcileCloudState(remote){
  if(!remote || !remote.state || !cloudUser) return;

  if(remote.hasPendingWrites) return;

  if(cloudSyncPending){
    // Existe alteração local ainda não enviada. Não sobrescreve o usuário
    // enquanto o debounce de 10 segundos estiver em andamento.
    return;
  }

  const remoteTime=stateTime(remote.clientUpdatedAt);
  const localTime=stateTime(localStateUpdatedAt);
  if(remoteTime<=localTime && cloudSyncedState) return;

  appState=normalizeState(remote.state);
  cloudSyncedState=clone(appState);
  localStateUpdatedAt=remote.clientUpdatedAt || new Date().toISOString();
  cloudSyncPending=false;
  cloudSyncDueAt=0;
  writeLocalState();
  renderAll();

  if(familyStates){
    familyStates[cloudUser.uid]={
      state:clone(appState),
      clientUpdatedAt:localStateUpdatedAt
    };
  }
  renderFamily();

  toast('Alterações de outro dispositivo foram atualizadas.','info');
}

async function tryMigrateLegacyState(){
  const vaultText=localStorage.getItem(VAULT_KEY);
  if(!vaultText) return null;
  try{
    const encoded=sessionStorage.getItem(SESSION_KEY_STORAGE) || localStorage.getItem(REFRESH_KEY_STORAGE);
    if(!encoded) return null;
    const raw=fromB64(encoded);
    const key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},true,['encrypt','decrypt']);
    const vault=JSON.parse(vaultText);
    const data=await decryptVaultWithKey(vault,key);
    return normalizeState(data);
  }catch(err){
    return null;
  }
}

function showSignedOutScreen(){
  $('#appShell').hidden=true;
  $('#lockScreen').hidden=false;
  setCloudStatus('local','Entre com Google para continuar');
}

function clearFamilyWatchers(){
  familyStateUnsubs.forEach(function(unsub){try{unsub();}catch(err){}});
  familyStateUnsubs=[];
  if(familyInviteUnsubscribe){
    try{familyInviteUnsubscribe();}catch(err){}
    familyInviteUnsubscribe=null;
  }
  if(familyMembersUnsubscribe){
    try{familyMembersUnsubscribe();}catch(err){}
    familyMembersUnsubscribe=null;
  }
  clearFamilyShoppingWatchers();
}

function rebuildFamilyStateWatchers(members,cloud){
  familyStateUnsubs.forEach(function(unsub){try{unsub();}catch(err){}});
  familyStateUnsubs=[];

  if(familyContext?.profile?.role!=='admin') return;

  (members || [])
    .filter(member=>(member.status || 'active')==='active')
    .forEach(function(member){
      if(member.uid===cloudUser?.uid) return;
      try{
        const unsub=cloud.watchState(function(remote){
          familyStates[member.uid]=remote;
          renderFamily();
        },member.uid);
        familyStateUnsubs.push(unsub);
      }catch(err){}
    });
}

async function refreshFamilyData(){
  return withLoading("Carregando família…","Atualizando membros, convites e dados compartilhados.",async function(){
  const cloud=window.StopGastosCloud;
  if(!cloudUser || !cloud || !cloud.ready) return;

  familyLoadError='';

  try{
    const result=await cloud.getFamilyStates();
    familyContext=result.context || null;
    familyStates=result.states || {};

    if(result.context?.repaired){
      if(result.context?.orphaned){
        toast('Um vínculo familiar antigo e inválido foi corrigido automaticamente.','info');
      }else if(result.context?.previousStatus){
        toast('Seu perfil familiar foi ajustado para o status atual do convite.','info');
      }
    }

    if(appState) familyStates[cloudUser.uid]={state:clone(appState),clientUpdatedAt:localStateUpdatedAt};

    familyInvitations=await cloud.getFamilyInvitations();

    clearFamilyWatchers();
    setupFamilyShoppingWatchers(cloud);

    familyInviteUnsubscribe=cloud.watchFamilyInvitations(function(items){
      const previous=new Set(familyInvitations.map(i=>i.id));
      familyInvitations=items || [];
      renderFamilyNotifications();
      familyInvitations.forEach(function(invite){
        if(!previous.has(invite.id)) showIncomingFamilyInvite(invite);
      });
    });

    if(familyContext?.profile?.role==='admin' && familyContext?.family?.id){
      rebuildFamilyStateWatchers(familyContext.members || [],cloud);

      familyMembersUnsubscribe=cloud.watchFamilyMembers(familyContext.family.id,function(members){
        const before=new Map((familyContext.members || []).map(m=>[m.uid,m.status || 'active']));
        familyContext={...familyContext,members:members || []};

        const changed=(members || []).find(function(member){
          return before.has(member.uid) && before.get(member.uid)!==(member.status || 'active');
        });

        rebuildFamilyStateWatchers(members,cloud);
        renderFamily();

        if(changed){
          const label=changed.status==='active'?'aceitou o convite':changed.status==='declined'?'recusou o convite':'atualizou o vínculo';
          toast((changed.email || changed.displayName || 'Um membro')+' '+label+'.','info');
        }
      });
    }

    renderFamily();
    renderFamilyNotifications();
    familyInvitations.forEach(showIncomingFamilyInvite);
  }catch(err){
    familyLoadError=String(err?.message || err || 'Não foi possível carregar sua família.');
    familyStates={};
    familyInvitations=[];
    familyShoppingLists=[];
    clearFamilyShoppingWatchers();
    renderShoppingLists();
    renderFamily();
    renderFamilyNotifications();
  }

  });
}

function bindFamilyEvents(){
  $('#createFamilyBtn').addEventListener('click',createFamilyFromUi);
  $('#inviteFamilyByEmailBtn').addEventListener('click',inviteFamilyByEmailFromUi);
  $('#refreshFamilyBtn').addEventListener('click',async function(){
    await refreshFamilyData();
    if(!familyLoadError) toast('Dados da família atualizados.','success');
  });
  $('#retryFamilyBtn').addEventListener('click',async function(){
    const btn=$('#retryFamilyBtn');
    btn.disabled=true;
    try{
      await refreshFamilyData();
      if(!familyLoadError) toast('Vínculo familiar carregado.','success');
    }finally{
      btn.disabled=false;
    }
  });
  $('#leaveFamilyBtn').addEventListener('click',leaveFamilyFromUi);

  $('#familyMembersList').addEventListener('click',async function(e){
    const transferBtn=e.target.closest('[data-transfer-admin]');
    if(transferBtn){
      await transferFamilyAdminFromUi(transferBtn.getAttribute('data-transfer-admin'));
      return;
    }

    const removeBtn=e.target.closest('[data-remove-member]');
    if(removeBtn){
      await removeFamilyMemberFromUi(removeBtn.getAttribute('data-remove-member'));
    }
  });

  $('#familyNotificationsList').addEventListener('click',async function(e){
    const btn=e.target.closest('[data-family-response]');
    if(!btn) return;
    const requestId=btn.getAttribute('data-request-id');
    const accept=btn.getAttribute('data-family-response')==='accept';
    await respondFamilyInvitationFromUi(requestId,accept);
  });

  $('#familyMemberEmailInput').addEventListener('keydown',function(e){
    if(e.key==='Enter'){
      e.preventDefault();
      inviteFamilyByEmailFromUi();
    }
  });
}

async function createFamilyFromUi(){
  return withLoading("Criando família…","Preparando sua conta de administrador.",async function(){
  const cloud=window.StopGastosCloud;
  const name=$('#familyNameInput').value.trim();
  const button=$('#createFamilyBtn');

  button.disabled=true;
  try{
    const context=await cloud.createFamily(name);
    familyLoadError='';
    familyContext=context || null;
    $('#familyNameInput').value='';
    await refreshFamilyData();
    toast('Família criada. Você é o administrador.','success');
  }catch(err){
    const message=String(err?.message || err || 'Não foi possível criar a família.');
    if(message.includes('Firestore') || message.includes('vínculo') || message.includes('família')){
      familyLoadError=message;
      renderFamily();
    }
    toast(message,'error');
  }finally{
    button.disabled=false;
  }

  });
}

async function inviteFamilyByEmailFromUi(){
  return withLoading("Enviando convite…","Localizando a conta e registrando a solicitação.",async function(){
  const cloud=window.StopGastosCloud;
  const input=$('#familyMemberEmailInput');
  const button=$('#inviteFamilyByEmailBtn');
  const feedback=$('#familyInviteFeedback');
  const email=input.value.trim().toLowerCase();

  if(!email || !email.includes('@')){
    feedback.textContent='Informe um e-mail válido.';
    feedback.className='form-hint error';
    input.focus();
    return;
  }

  button.disabled=true;
  feedback.textContent='Localizando a conta Google…';
  feedback.className='form-hint';

  try{
    const result=await cloud.sendFamilyInviteByEmail(email);
    input.value='';
    feedback.textContent='Convite enviado para '+(result.target.displayName || result.target.email || email)+'.';
    feedback.className='form-hint success';
    await refreshFamilyData();
    toast('Convite enviado. O usuário receberá uma notificação no Stop Gastos.','success');
  }catch(err){
    feedback.textContent=err.message || 'Não foi possível enviar o convite.';
    feedback.className='form-hint error';
    toast(feedback.textContent,'error');
  }finally{
    button.disabled=false;
  }

  });
}

async function respondFamilyInvitationFromUi(requestId,accept){
  const cloud=window.StopGastosCloud;
  const invite=familyInvitations.find(i=>i.id===requestId);
  if(!invite) return;

  const action=accept?'Aceitar convite?':'Recusar convite?';
  const message=accept
    ? 'Você passará a fazer parte de '+(invite.familyName || 'esta família')+' e o administrador poderá visualizar seus dados financeiros.'
    : 'Você não entrará em '+(invite.familyName || 'esta família')+'. O administrador verá este e-mail com o status Recusado.';

  const ok=await confirmDialog(action,message);
  if(!ok) return;

  try{
    await cloud.respondFamilyInvitation(requestId,accept);
    notifiedFamilyInvites.delete(requestId);
    await refreshFamilyData();
    toast(
      accept
        ? 'Convite aceito. Você agora é membro da família.'
        : 'Convite recusado. O administrador receberá o retorno como Recusado.',
      'success'
    );
    navigate('family');
  }catch(err){
    toast(err.message || 'Não foi possível responder ao convite.','error');
  }
}

function showIncomingFamilyInvite(invite){
  if(!invite || notifiedFamilyInvites.has(invite.id)) return;
  notifiedFamilyInvites.add(invite.id);

  toast('Convite de '+(invite.createdByName || invite.familyName || 'uma família')+' aguardando sua resposta.','info');

  if('Notification' in window && Notification.permission==='granted'){
    try{
      const n=new Notification('Convite para família · Stop Gastos',{
        body:(invite.createdByName || 'Um administrador')+' convidou você para '+(invite.familyName || 'uma família')+'.',
        icon:'favicon.svg',
        tag:'family-'+invite.id
      });
      n.onclick=function(){window.focus();navigate('family');};
    }catch(err){}
  }
}

function renderFamilyNotifications(){
  const panel=$('#familyNotificationsPanel');
  const list=$('#familyNotificationsList');
  const count=$('#familyNotificationCount');
  const badge=$('#notificationBadge');

  if(!panel || !list || !count || !badge) return;

  const pending=familyInvitations || [];
  panel.hidden=pending.length===0;
  count.textContent=pending.length+' '+(pending.length===1?'pendente':'pendentes');
  badge.hidden=pending.length===0;
  badge.textContent=String(Math.min(99,pending.length));

  list.innerHTML=pending.map(function(invite){
    const inviter=invite.createdByName || 'Administrador';
    const family=invite.familyName || 'Família';
    return '<div class="family-notification-card">'+
      '<div class="family-notification-icon">✦</div>'+
      '<div class="family-notification-copy"><b>'+esc(family)+'</b>'+
      '<span>'+esc(inviter)+' convidou você para fazer parte da família.</span>'+
      '<small>Ao aceitar, o administrador poderá visualizar seus lançamentos financeiros.</small></div>'+
      '<div class="family-notification-actions">'+
        '<button class="btn primary mini" data-family-response="accept" data-request-id="'+esc(invite.id)+'">Aceitar</button>'+
        '<button class="btn soft mini" data-family-response="decline" data-request-id="'+esc(invite.id)+'">Recusar</button>'+
      '</div>'+
    '</div>';
  }).join('');
}


async function transferFamilyAdminFromUi(uid){
  const member=(familyContext?.members || []).find(m=>m.uid===uid);
  if(!member) return;

  const name=member.displayName || member.email || 'este membro';
  const ok=await confirmDialog(
    'Transferir administração?',
    name+' se tornará o proprietário e administrador da família. Você continuará como membro e não poderá mais administrar os demais usuários. Essa alteração permite que você exclua sua conta depois sem apagar a família.'
  );
  if(!ok) return;

  try{
    await withLoading(
      'Transferindo administração…',
      'Atualizando o novo administrador e preservando a família.',
      async function(){
        await window.StopGastosCloud.transferFamilyOwnership(uid);
        await refreshFamilyData();
      }
    );
    toast('Administração transferida para '+name+'.','success');
  }catch(err){
    toast(err.message || 'Não foi possível transferir a administração.','error');
  }
}

async function removeFamilyMemberFromUi(uid){
  const member=(familyContext?.members || []).find(m=>m.uid===uid);
  const ok=await confirmDialog('Remover membro?',(member?.displayName || member?.email || 'Este membro')+' deixará de fazer parte da família.');
  if(!ok) return;
  try{
    await window.StopGastosCloud.removeFamilyMember(uid);
    await refreshFamilyData();
    toast('Membro removido.','success');
  }catch(err){
    toast(err.message || 'Não foi possível remover o membro.','error');
  }
}

async function leaveFamilyFromUi(){
  if(!familyContext?.family) return;
  const isOwner=familyContext.family.ownerUid===cloudUser?.uid;
  if(isOwner) return toast('O proprietário da família não pode sair antes de transferir a administração.','info');
  const ok=await confirmDialog('Sair da família?','Seus dados pessoais continuam na sua conta, mas deixam de aparecer para o administrador da família.');
  if(!ok) return;
  try{
    await window.StopGastosCloud.leaveFamily();
    await refreshFamilyData();
    toast('Você saiu da família.','success');
  }catch(err){
    toast(err.message || 'Não foi possível sair da família.','error');
  }
}

function renderFamily(){
  const onboarding=$('#familyOnboarding');
  const dashboard=$('#familyDashboard');
  const errorPanel=$('#familyLoadErrorPanel');
  const errorText=$('#familyLoadErrorText');
  if(!onboarding || !dashboard || !errorPanel) return;

  if(familyLoadError){
    onboarding.hidden=true;
    dashboard.hidden=true;
    errorPanel.hidden=false;
    if(errorText) errorText.textContent=familyLoadError;
    $('#familyTitle').textContent='Seu vínculo familiar precisa ser validado';
    $('#familySubtitle').textContent='Não vamos criar outra família enquanto existir um vínculo que ainda não foi verificado.';
    $('#familyRoleBadge').textContent='Verificar vínculo';
    renderFamilyNotifications();
    return;
  }

  errorPanel.hidden=true;

  const context=familyContext;
  const hasFamily=!!(context && context.family);
  onboarding.hidden=hasFamily;
  dashboard.hidden=!hasFamily;

  if(!hasFamily){
    $('#familyTitle').textContent='Sua família financeira';
    $('#familySubtitle').textContent=familyInvitations.length
      ? 'Você tem um convite aguardando resposta.'
      : 'Crie uma família ou aguarde um convite enviado ao seu Gmail de acesso.';
    $('#familyRoleBadge').textContent=familyInvitations.length?'Convite pendente':'Sem família';
    renderFamilyNotifications();
    return;
  }

  const isAdmin=context.profile?.role==='admin';
  $('#familyTitle').textContent=context.family.name || 'Família';
  $('#familySubtitle').textContent=isAdmin
    ? 'Administre membros e acompanhe o consolidado financeiro da família.'
    : 'Registre seus gastos normalmente. O administrador acompanha o consolidado familiar.';
  $('#familyRoleBadge').textContent=isAdmin?'Administrador':'Membro';

  const statusOrder={active:0,pending:1,declined:2};
  const allMembers=[...(context.members || [])].sort(function(a,b){
    if(a.uid===context.family.ownerUid) return -1;
    if(b.uid===context.family.ownerUid) return 1;
    const sa=statusOrder[a.status || 'active'] ?? 9;
    const sb=statusOrder[b.status || 'active'] ?? 9;
    return sa-sb || String(a.email || '').localeCompare(String(b.email || ''));
  });
  const activeMembers=allMembers.filter(m=>(m.status || 'active')==='active');
  $('#familyMemberCount').textContent=String(activeMembers.length);
  $('#familyInvitePanel').hidden=!isAdmin;
  $('#familyAdminFinancePanel').hidden=!isAdmin;
  $('#leaveFamilyBtn').hidden=context.family.ownerUid===cloudUser?.uid;

  const month=selectedMonth;
  let totalExpense=0,totalIncome=0;
  const memberTotals=[];
  const recent=[];

  activeMembers.forEach(function(member){
    const entry=familyStates[member.uid];
    const state=entry && entry.state ? entry.state : null;
    const tx=state && Array.isArray(state.transactions)
      ? state.transactions.filter(t=>String(t.date||'').slice(0,7)===month)
      : [];
    const expense=tx.filter(t=>t.type==='expense').reduce((a,t)=>a+Number(t.amount||0),0);
    const income=tx.filter(t=>t.type==='income').reduce((a,t)=>a+Number(t.amount||0),0);
    totalExpense+=expense;
    totalIncome+=income;
    memberTotals.push({member,expense,income});
    tx.forEach(function(t){recent.push({member,t});});
  });

  $('#familyExpenseTotal').textContent=money(totalExpense);
  $('#familyIncomeTotal').textContent=money(totalIncome);
  $('#familyBalanceTotal').textContent=money(totalIncome-totalExpense);

  $('#familyMembersList').innerHTML=allMembers.map(function(member){
    const isSelf=member.uid===cloudUser?.uid;
    const isOwner=member.uid===context.family.ownerUid;
    const status=member.status || 'active';
    const canRemove=isAdmin && !isSelf && !isOwner;
    const canTransfer=context.family.ownerUid===cloudUser?.uid && !isSelf && status==='active';
    const initial=(member.displayName || member.email || '?').trim().charAt(0).toUpperCase();
    const statusLabel=isOwner?'Administrador':status==='pending'?'Pendente':status==='declined'?'Recusado':'Ativo';
    const statusClass=isOwner?'admin':status==='pending'?'pending':status==='declined'?'declined':'active';
    const responseText=status==='declined'
      ? ' · recusado'+familyResponseTime(member.declinedAt)
      : status==='pending'
        ? ' · aguardando resposta'
        : '';
    const actions=(canTransfer || canRemove)
      ? '<div class="family-member-actions">'+
          (canTransfer?'<button class="family-admin-action" data-transfer-admin="'+esc(member.uid)+'" title="Transferir administração para este membro">Tornar admin</button>':'')+
          (canRemove?'<button class="row-btn member-remove" data-remove-member="'+esc(member.uid)+'" title="Remover vínculo">×</button>':'')+
        '</div>'
      : '';

    return '<div class="family-member-row '+statusClass+'">'+
      '<div class="family-mini-avatar">'+esc(initial)+'</div>'+
      '<div class="family-member-info"><b>'+esc(member.displayName || member.email || 'Membro')+'</b>'+
      '<small>'+esc(member.email || '')+(isSelf?' · você':'')+responseText+'</small></div>'+
      '<span class="member-status '+statusClass+'">'+statusLabel+'</span>'+
      actions+
    '</div>';
  }).join('') || '<div class="empty-state">Nenhum membro vinculado.</div>';

  if(isAdmin){
    $('#familyMemberTotals').innerHTML=memberTotals.sort((a,b)=>b.expense-a.expense).map(function(item){
      const pct=totalExpense>0 ? Math.round(item.expense/totalExpense*100) : 0;
      return '<div class="family-total-row"><div><b>'+esc(item.member.displayName || item.member.email || 'Membro')+'</b><small>'+pct+'% dos gastos do mês</small></div><strong>'+money(item.expense)+'</strong></div>';
    }).join('') || '<div class="empty-state">Sem gastos familiares neste mês.</div>';

    recent.sort((a,b)=>String(b.t.date||'').localeCompare(String(a.t.date||'')));
    $('#familyRecentTransactions').innerHTML=recent.slice(0,40).map(function(item){
      return '<tr><td>'+formatDate(item.t.date)+'</td><td>'+esc(item.member.displayName || item.member.email || 'Membro')+'</td><td>'+esc(item.t.description || '')+'</td><td>'+esc(getCategoryFromState(item.t.category,item.member.uid).name)+'</td><td class="right '+(item.t.type==='expense'?'expense-text':'income-text')+'">'+(item.t.type==='expense'?'- ':'+ ')+money(item.t.amount)+'</td></tr>';
    }).join('') || '<tr><td colspan="5" class="empty-cell">Nenhum lançamento da família neste mês.</td></tr>';
  }

  renderFamilyNotifications();
}

function familyResponseTime(value){
  if(!value) return '';
  try{
    const date=typeof value.toDate==='function'
      ? value.toDate()
      : value.seconds
        ? new Date(value.seconds*1000)
        : new Date(value);
    if(!Number.isFinite(date.getTime())) return '';
    return ' em '+date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' às '+date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }catch(err){
    return '';
  }
}

function getCategoryFromState(id,uid){
  const state=familyStates[uid]?.state;
  const categories=state && Array.isArray(state.categories) ? state.categories : [];
  return categories.find(c=>c.id===id) || getCategory(id);
}


function bindV2Events(){
  $('#privacyBtn').addEventListener('click', async function(){
    if(!appState) return;
    appState.settings.privacyMode=!appState.settings.privacyMode;
    applyPrivacy();
    await saveVault();
  });
  $('#accountForm').addEventListener('submit',saveAccountForm);
  $('#cardForm').addEventListener('submit',saveCardForm);
  $('#cardType').addEventListener('change',updateCardTypeFields);
  $('#billForm').addEventListener('submit',saveBillForm);
  $('#transferForm').addEventListener('submit',saveTransferForm);
  $('#categoryForm').addEventListener('submit',saveCategoryForm);
  $('#txPayment').addEventListener('change',function(){updateInstallmentFields();});
  $('#txAmount').addEventListener('input',function(){updateInstallmentFields();});
  $('#txInstallments').addEventListener('input',function(){updateInstallmentFields();});
  $('#txCard').addEventListener('change',function(){updateInstallmentFields();});
  $('#recPayment').addEventListener('change',updateRecurringPaymentFields);
  $('#recCard').addEventListener('change',updateRecurringPaymentFields);
  $('#recAmount').addEventListener('input',updateRecurringPaymentFields);
  $('#recInstallments').addEventListener('input',updateRecurringPaymentFields);
  $('#printReportBtn').addEventListener('click',function(){window.print();});
}

function applyPrivacy(){
  if(!appState) return;
  document.body.classList.toggle('privacy-mode',!!appState.settings.privacyMode);
  if($('#privacyBtn')){
    $('#privacyBtn').textContent=appState.settings.privacyMode?'🙈':'👁';
    $('#privacyBtn').title=appState.settings.privacyMode?'Mostrar valores':'Ocultar valores';
  }
}

function populateFinanceSelects(){
  if(!appState) return;

  const accounts='<option value="">Sem conta vinculada</option>'+appState.accounts.map(function(a){
    return '<option value="'+esc(a.id)+'">'+esc((a.icon||'🏦')+' '+a.name)+'</option>';
  }).join('');

  ['txAccount','cardAccount','billAccount','incomeSourceAccount'].forEach(function(id){
    const el=$('#'+id);
    if(!el) return;
    const current=el.value;
    el.innerHTML=accounts;
    el.value=current||'';
  });

  const transferAccounts=appState.accounts.map(function(a){
    return '<option value="'+esc(a.id)+'">'+esc((a.icon||'🏦')+' '+a.name)+'</option>';
  }).join('');

  ['transferFrom','transferTo'].forEach(function(id){
    const el=$('#'+id);
    if(!el) return;
    const current=el.value;
    el.innerHTML=transferAccounts;
    if(current) el.value=current;
  });

  const cards='<option value="">Selecione um cartão</option>'+appState.cards.map(function(c){
    return '<option value="'+esc(c.id)+'">'+esc(c.name+' · '+c.brand)+'</option>';
  }).join('');

  ['txCard','recCard'].forEach(function(id){
    const el=$('#'+id);
    if(!el) return;
    const current=el.value;
    el.innerHTML=cards;
    el.value=current||'';
  });

  updateRecurringPaymentFields();
}

function cardPaymentType(payment){
  const map={
    'Cartão de crédito':'credit',
    'Vale-refeição':'meal',
    'Vale-alimentação':'food',
    'Vale-combustível':'fuel'
  };
  return map[payment] || '';
}

function paymentUsesCard(payment){
  return !!cardPaymentType(payment);
}

function isBenefitCard(card){
  return !!card && (card.cardType || 'credit')!=='credit';
}

function cardTypeLabel(type){
  const labels={
    credit:'Cartão de crédito',
    meal:'Vale-refeição',
    food:'Vale-alimentação',
    fuel:'Vale-combustível',
    benefit:'Outro benefício'
  };
  return labels[type] || 'Cartão de crédito';
}


function defaultCardColor(type){
  const colors={
    credit:'#141b34',
    meal:'#e97824',
    food:'#16866f',
    fuel:'#2f6fd6',
    benefit:'#7357d8'
  };
  return colors[type] || colors.credit;
}

function normalizeCardHex(value,fallback='#141b34'){
  const text=String(value || '').trim();
  if(/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
  if(/^#[0-9a-f]{3}$/i.test(text)){
    return '#'+text.slice(1).split('').map(function(ch){return ch+ch;}).join('').toLowerCase();
  }
  return fallback;
}

function mixCardColor(hex,target,amount){
  const source=normalizeCardHex(hex);
  const dest=normalizeCardHex(target);
  const ratio=Math.max(0,Math.min(1,Number(amount || 0)));

  const parse=function(value){
    return [
      parseInt(value.slice(1,3),16),
      parseInt(value.slice(3,5),16),
      parseInt(value.slice(5,7),16)
    ];
  };

  const a=parse(source);
  const b=parse(dest);
  const mixed=a.map(function(channel,index){
    return Math.round(channel+(b[index]-channel)*ratio);
  });

  return '#'+mixed.map(function(channel){
    return channel.toString(16).padStart(2,'0');
  }).join('');
}

function cardVisualTheme(card){
  const base=normalizeCardHex(card?.color,defaultCardColor(card?.cardType || 'credit'));
  const r=parseInt(base.slice(1,3),16)/255;
  const g=parseInt(base.slice(3,5),16)/255;
  const b=parseInt(base.slice(5,7),16)/255;

  const linear=function(channel){
    return channel<=0.03928
      ? channel/12.92
      : Math.pow((channel+0.055)/1.055,2.4);
  };

  const luminance=(0.2126*linear(r))+(0.7152*linear(g))+(0.0722*linear(b));
  const light=luminance>0.46;
  const fg=light ? '#101827' : '#ffffff';
  const muted=light ? 'rgba(16,24,39,.66)' : 'rgba(255,255,255,.72)';
  const track=light ? 'rgba(16,24,39,.14)' : 'rgba(255,255,255,.16)';
  const border=light ? 'rgba(16,24,39,.13)' : 'rgba(255,255,255,.13)';
  const second=light
    ? mixCardColor(base,'#ffffff',0.28)
    : mixCardColor(base,'#08101f',0.42);

  return {
    base,
    second,
    fg,
    muted,
    track,
    border,
    light
  };
}

function cardVisualStyle(card){
  const theme=cardVisualTheme(card);
  return [
    '--card-bg:'+theme.base,
    '--card-bg-2:'+theme.second,
    '--card-fg:'+theme.fg,
    '--card-muted:'+theme.muted,
    '--card-track:'+theme.track,
    '--card-border:'+theme.border
  ].join(';');
}

function cardMatchesPayment(card,payment){
  const target=cardPaymentType(payment);
  if(!target) return false;
  const type=card?.cardType || 'credit';
  if(target==='credit') return type==='credit';
  return type===target || type==='benefit';
}

function populateCardSelectForPayment(selectId,payment){
  const el=$('#'+selectId);
  if(!el || !appState) return;

  const current=el.value;
  const eligible=appState.cards.filter(function(card){
    return cardMatchesPayment(card,payment);
  });

  el.innerHTML='<option value="">Selecione um cartão</option>'+eligible.map(function(card){
    return '<option value="'+esc(card.id)+'">'+esc(card.name+' · '+cardTypeLabel(card.cardType || 'credit'))+'</option>';
  }).join('');

  if(current && eligible.some(function(card){return card.id===current;})){
    el.value=current;
  }else{
    el.value='';
  }
}

function updateCardTypeFields(){
  const type=$('#cardType')?.value || 'credit';
  const benefit=type!=='credit';

  const closing=$('#cardClosingWrap');
  const due=$('#cardDueWrap');
  const account=$('#cardAccountWrap');
  const label=$('#cardLimitLabel');
  const closingInput=$('#cardClosingDay');
  const dueInput=$('#cardDueDay');
  const color=$('#cardColor');
  const editing=!!$('#cardId')?.value;

  if(closing) closing.hidden=benefit;
  if(due) due.hidden=benefit;
  if(account) account.hidden=benefit;
  if(label) label.textContent=benefit?'Saldo / crédito disponível':'Limite';

  if(closingInput) closingInput.required=!benefit;
  if(dueInput) dueInput.required=!benefit;

  if(color && !editing){
    const current=normalizeCardHex(color.value,'#141b34');
    const defaults=['#141b34','#e97824','#16866f','#2f6fd6','#7357d8'];
    if(defaults.includes(current)){
      color.value=defaultCardColor(type);
    }
  }
}

function updateRecurringPaymentFields(){
  const payment=$('#recPayment');
  const wrap=$('#recCardWrap');
  const card=$('#recCard');
  if(!payment || !wrap || !card) return;

  const usesCard=paymentUsesCard(payment.value);
  wrap.hidden=!usesCard;
  card.required=usesCard;

  if(!usesCard){
    card.value='';
    return;
  }

  populateCardSelectForPayment('recCard',payment.value);

  if(!appState.cards.some(function(item){return cardMatchesPayment(item,payment.value);})){
    card.innerHTML='<option value="">Cadastre um '+cardTypeLabel(cardPaymentType(payment.value))+' primeiro</option>';
  }
}

function updateInstallmentFields(editing){
  if(!$('#creditFields')) return;

  const payment=$('#txPayment').value;
  const usesCard=paymentUsesCard(payment);
  const isCredit=payment==='Cartão de crédito';

  $('#creditFields').classList.toggle('show',usesCard);
  $('#creditFields').classList.toggle('benefit-mode',usesCard && !isCredit);

  if(!usesCard){
    $('#txCard').value='';
    $('#txInstallments').value='1';
    $('#installmentPreview').textContent='À vista';
    return;
  }

  populateCardSelectForPayment('txCard',payment);

  if(!isCredit){
    $('#txInstallments').value='1';
    const card=getCard($('#txCard').value);
    $('#installmentPreview').textContent=card
      ? cardTypeLabel(card.cardType || 'benefit')+' · débito no saldo do benefício'
      : 'Selecione o cartão de benefício';
    return;
  }

  const total=Number($('#txAmount').value||0);
  const count=normalizedInstallmentCount($('#txInstallments').value);
  $('#txInstallments').value=String(count);

  const each=count ? total/count : 0;
  const card=getCard($('#txCard').value);
  let due='';

  if(card && $('#txDate').value){
    const first=cardInvoiceMonth($('#txDate').value,card);
    due=' · 1ª fatura em '+monthLabel(first);
  }

  const id=$('#transactionId').value;
  const current=id
    ? appState.transactions.find(function(t){return t.id===id;})
    : editing;

  const editNote=current && (current.installmentCount>1 || current.installmentGroup)
    ? ' · ao salvar, todo o parcelamento será recalculado'
    : '';

  $('#installmentPreview').textContent=count===1
    ? 'À vista · '+money(total)+due+editNote
    : count+'x de '+money(each)+' · total '+money(total)+due+editNote;
}

function cardInvoiceMonth(purchaseDate,card){
  const base=purchaseDate.slice(0,7);
  if(isBenefitCard(card)) return base;

  const d=new Date(purchaseDate+'T12:00:00');
  return d.getDate()<=Number(card.closingDay||1) ? base : shiftMonth(base,1);
}

function getAccount(id){
  return appState && appState.accounts.find(function(a){return a.id===id;}) || null;
}
function getCard(id){
  return appState && appState.cards.find(function(c){return c.id===id;}) || null;
}
function accountBalance(account){
  let value=Number(account.openingBalance||0);
  appState.transactions.forEach(function(t){
    if(t.accountId!==account.id) return;
    if(t.type==='income') value+=Number(t.amount||0);
    if(t.type==='expense') value-=Number(t.amount||0);
  });
  appState.transfers.forEach(function(t){
    if(t.fromAccountId===account.id) value-=Number(t.amount||0);
    if(t.toAccountId===account.id) value+=Number(t.amount||0);
  });
  return value;
}

function renderAccounts(){
  if(!appState || !$('#accountsGrid')) return;
  const monthTx=transactionsForMonth(selectedMonth);
  const income=monthTx.filter(function(t){return t.type==='income'&&t.accountId;}).reduce(function(a,t){return a+Number(t.amount);},0);
  const expense=monthTx.filter(function(t){return t.type==='expense'&&t.accountId;}).reduce(function(a,t){return a+Number(t.amount);},0);
  const total=appState.accounts.reduce(function(a,x){return a+accountBalance(x);},0);
  $('#accountsTotal').textContent=money(total);
  $('#accountsCount').textContent=String(appState.accounts.length);
  $('#accountsIncome').textContent=money(income);
  $('#accountsExpense').textContent=money(expense);
  $('#accountsEmpty').hidden=appState.accounts.length!==0;
  $('#accountsGrid').innerHTML=appState.accounts.map(function(a){
    const bal=accountBalance(a);
    const monthIn=monthTx.filter(function(t){return t.accountId===a.id&&t.type==='income';}).reduce(function(x,t){return x+Number(t.amount);},0);
    const monthOut=monthTx.filter(function(t){return t.accountId===a.id&&t.type==='expense';}).reduce(function(x,t){return x+Number(t.amount);},0);
    return '<article class="finance-card account-card" style="--accent:'+esc(a.color||'#7c5cff')+'"><div class="card-top"><span class="finance-icon">'+esc(a.icon||'🏦')+'</span><div class="card-menu"><button class="row-btn edit-account" data-id="'+a.id+'">✎</button><button class="row-btn delete-account" data-id="'+a.id+'">×</button></div></div><span>'+esc(a.type||'Conta')+'</span><h4>'+esc(a.name)+'</h4><strong class="finance-number">'+money(bal)+'</strong><div class="mini-stats"><span>Entradas <b>'+money(monthIn)+'</b></span><span>Saídas <b>'+money(monthOut)+'</b></span></div></article>';
  }).join('');
  $$('.edit-account').forEach(function(b){b.onclick=function(){const x=getAccount(b.dataset.id);if(x)openModal('account',x);};});
  $$('.delete-account').forEach(function(b){b.onclick=function(){deleteAccount(b.dataset.id);};});
}

async function saveAccountForm(e){
  return withLoading("Salvando conta…","Atualizando suas contas e carteiras.",async function(){
  e.preventDefault();
  const id=$('#accountId').value;
  const record={id:id||uid('acc'),name:$('#accountName').value.trim(),type:$('#accountType').value,openingBalance:Number($('#accountOpening').value||0),icon:$('#accountIcon').value,color:$('#accountColor').value,updatedAt:new Date().toISOString()};
  if(!record.name)return toast('Informe o nome da conta.','error');
  const idx=appState.accounts.findIndex(function(a){return a.id===id;});
  if(idx>=0)appState.accounts[idx]=Object.assign({},appState.accounts[idx],record);else appState.accounts.push(record);
  logAudit(idx>=0?'account-update':'account-create',record.name);
  await commitStateChange(); toast('Conta salva.','success');

  });
}
async function deleteAccount(id){
  const a=getAccount(id); if(!a)return;
  if(!await confirmDialog('Excluir conta?','Os lançamentos existentes serão preservados, mas ficarão sem vínculo com "'+a.name+'".'))return;
  appState.accounts=appState.accounts.filter(function(x){return x.id!==id;});
  appState.cards.forEach(function(c){if(c.accountId===id)c.accountId='';});
  logAudit('account-delete',a.name); await saveVault(); renderAll(); toast('Conta excluída.','success');
}

function cardCommitted(card){
  if(isBenefitCard(card)){
    return cardPeriodUsed(card,selectedMonth);
  }

  const today=localDateKey(new Date());
  return appState.transactions
    .filter(function(t){
      return t.cardId===card.id && t.type==='expense' && t.date>=today;
    })
    .reduce(function(sum,t){return sum+Number(t.amount || 0);},0);
}

function cardPeriodUsed(card,month){
  return appState.transactions
    .filter(function(t){
      return t.cardId===card.id
        && t.type==='expense'
        && String(t.purchaseDate || t.date || '').slice(0,7)===month;
    })
    .reduce(function(sum,t){return sum+Number(t.amount || 0);},0);
}

function cardInvoice(card,month){
  if(isBenefitCard(card)) return 0;

  return appState.transactions
    .filter(function(t){
      return t.cardId===card.id
        && t.type==='expense'
        && (t.invoiceMonth || t.date.slice(0,7))===month;
    })
    .reduce(function(sum,t){return sum+Number(t.amount || 0);},0);
}

function renderCards(){
  if(!appState || !$('#cardsGrid')) return;

  const capacity=appState.cards.reduce(function(sum,card){
    return sum+Number(card.limit || 0);
  },0);

  const used=appState.cards.reduce(function(sum,card){
    return sum+cardCommitted(card);
  },0);

  const invoice=appState.cards.reduce(function(sum,card){
    return sum+cardInvoice(card,selectedMonth);
  },0);

  $('#cardsLimit').textContent=money(capacity);
  $('#cardsUsed').textContent=money(used);
  $('#cardsAvailable').textContent=money(Math.max(0,capacity-used));
  $('#cardsInvoice').textContent=money(invoice);
  $('#invoiceMonthLabel').textContent=monthLabel(selectedMonth);

  $('#cardsGrid').innerHTML=appState.cards.map(function(card){
    const benefit=isBenefitCard(card);
    const limit=Number(card.limit || 0);
    const metric=benefit ? cardPeriodUsed(card,selectedMonth) : cardCommitted(card);
    const periodValue=benefit ? metric : cardInvoice(card,selectedMonth);
    const pct=limit>0 ? Math.min(100,(metric/limit)*100) : 0;
    const type=card.cardType || 'credit';

    const footer=benefit
      ? 'Benefício · '+cardTypeLabel(type)
      : 'Fecha dia '+Number(card.closingDay||1)+' · vence dia '+Number(card.dueDay||10);

    const visual=cardVisualTheme(card);

    return '<article class="credit-card animated-card '+(benefit?'benefit-card ':'')+(visual.light?'light-card':'dark-card')+'" style="'+esc(cardVisualStyle(card))+'">'+
      '<div class="credit-top"><span>'+esc(card.brand||'Cartão')+' · '+esc(cardTypeLabel(type))+'</span><div class="card-menu"><button class="row-btn edit-card" data-id="'+card.id+'" aria-label="Editar cartão">✎</button><button class="row-btn delete-card" data-id="'+card.id+'" aria-label="Excluir cartão">×</button></div></div>'+
      '<h4>'+esc(card.name)+'</h4>'+
      '<div class="credit-limit"><span>'+(benefit?'Consumo de '+shortMonth(selectedMonth):'Fatura de '+shortMonth(selectedMonth))+'</span><strong>'+money(periodValue)+'</strong></div>'+
      '<div class="progress"><i style="width:'+pct+'%"></i></div>'+
      '<div class="credit-meta"><span>'+(benefit?'Saldo/crédito ':'Limite ')+money(limit)+'</span><span>Disponível '+money(Math.max(0,limit-metric))+'</span></div>'+
      '<small>'+esc(footer)+'</small>'+
    '</article>';
  }).join('');

  $$('.edit-card').forEach(function(button){
    button.onclick=function(){
      const card=getCard(button.dataset.id);
      if(card) openModal('card',card);
    };
  });

  $$('.delete-card').forEach(function(button){
    button.onclick=function(){deleteCard(button.dataset.id);};
  });

  const rows=appState.transactions
    .filter(function(t){
      const card=getCard(t.cardId);
      return card
        && !isBenefitCard(card)
        && t.type==='expense'
        && (t.invoiceMonth || t.date.slice(0,7))===selectedMonth;
    })
    .sort(sortTxDesc);

  $('#cardInvoiceTable').innerHTML=rows.length
    ? rows.map(function(t){
        const card=getCard(t.cardId);
        const parcel=t.installmentCount ? t.installmentNo+'/'+t.installmentCount : '1/1';
        return '<tr><td>'+esc(t.description)+'</td><td>'+esc(card?card.name:'Cartão removido')+'</td><td><span class="installment-pill">'+parcel+'</span></td><td>'+money(t.purchaseTotal||t.amount)+'</td><td>'+dateBR(t.date)+'</td><td class="right amount expense">'+money(t.amount)+'</td></tr>';
      }).join('')
    : emptyTableRow(6,'Nenhuma compra de crédito nesta fatura.');
}

async function saveCardForm(e){
  return withLoading('Salvando cartão…','Atualizando cartão, benefício e limites.',async function(){
    e.preventDefault();

    const id=$('#cardId').value;
    const cardType=$('#cardType').value || 'credit';
    const benefit=cardType!=='credit';

    const record={
      id:id || uid('card'),
      name:$('#cardName').value.trim(),
      cardType,
      brand:$('#cardBrand').value,
      limit:Number($('#cardLimit').value || 0),
      closingDay:benefit ? 0 : Math.max(1,Math.min(31,Number($('#cardClosingDay').value || 3))),
      dueDay:benefit ? 0 : Math.max(1,Math.min(31,Number($('#cardDueDay').value || 10))),
      accountId:benefit ? '' : ($('#cardAccount').value || ''),
      color:$('#cardColor').value,
      updatedAt:new Date().toISOString()
    };

    if(!record.name){
      toast('Informe o nome do cartão.','error');
      return;
    }

    const index=appState.cards.findIndex(function(card){return card.id===id;});
    if(index>=0){
      appState.cards[index]=Object.assign({},appState.cards[index],record);
    }else{
      appState.cards.push(record);
    }

    logAudit(index>=0?'card-update':'card-create',record.name);
    await commitStateChange();
    toast(benefit?'Cartão de benefício salvo.':'Cartão de crédito salvo.','success');
  });
}

async function deleteCard(id){
  const c=getCard(id);if(!c)return;
  if(!await confirmDialog('Excluir cartão?','As compras e parcelas já registradas serão mantidas no histórico.'))return;
  appState.cards=appState.cards.filter(function(x){return x.id!==id;});
  logAudit('card-delete',c.name); await saveVault(); renderAll(); toast('Cartão excluído.','success');
}

function renderBills(){
  if(!appState || !$('#billsGrid')) return;
  const today=localDateKey(new Date());
  const next7=new Date(); next7.setDate(next7.getDate()+7); const next7Key=localDateKey(next7);
  const month=appState.bills.filter(function(b){return b.dueDate&&b.dueDate.slice(0,7)===selectedMonth;});
  const pending=month.filter(function(b){return !b.paid&&b.type==='expense';}).reduce(function(a,b){return a+Number(b.amount);},0);
  const overdue=appState.bills.filter(function(b){return !b.paid&&b.type==='expense'&&b.dueDate<today;}).reduce(function(a,b){return a+Number(b.amount);},0);
  const paid=month.filter(function(b){return b.paid&&b.type==='expense';}).reduce(function(a,b){return a+Number(b.amount);},0);
  const soon=appState.bills.filter(function(b){return !b.paid&&b.type==='expense'&&b.dueDate>=today&&b.dueDate<=next7Key;}).reduce(function(a,b){return a+Number(b.amount);},0);
  $('#billsPending').textContent=money(pending); $('#billsOverdue').textContent=money(overdue); $('#billsPaid').textContent=money(paid); $('#billsNext7').textContent=money(soon);
  const list=appState.bills.slice().sort(function(a,b){return String(a.dueDate).localeCompare(String(b.dueDate));});
  $('#billsEmpty').hidden=list.length!==0;
  $('#billsGrid').innerHTML=list.map(function(b){
    const cat=getCategory(b.category), overdue=!b.paid&&b.dueDate<today;
    return '<article class="bill-card '+(b.paid?'paid ':'')+(overdue?'overdue':'')+'"><div class="bill-date"><b>'+dateBR(b.dueDate)+'</b><span>'+(b.paid?'Pago':(overdue?'Vencido':'Pendente'))+'</span></div><div class="bill-main"><span>'+cat.icon+' '+esc(cat.name)+'</span><h4>'+esc(b.description)+'</h4><strong class="'+b.type+'">'+(b.type==='expense'?'- ':'+ ')+money(b.amount)+'</strong></div><div class="bill-actions">'+(!b.paid?'<button class="btn mini pay-bill" data-id="'+b.id+'">✓ Marcar pago</button>':'<span class="paid-badge">✓ concluído</span>')+'<button class="row-btn edit-bill" data-id="'+b.id+'">✎</button><button class="row-btn delete-bill" data-id="'+b.id+'">×</button></div></article>';
  }).join('');
  $$('.pay-bill').forEach(function(x){x.onclick=function(){payBill(x.dataset.id);};});
  $$('.edit-bill').forEach(function(x){x.onclick=function(){const b=appState.bills.find(function(y){return y.id===x.dataset.id;});if(b)openModal('bill',b);};});
  $$('.delete-bill').forEach(function(x){x.onclick=function(){deleteBill(x.dataset.id);};});
}
async function saveBillForm(e){
  return withLoading("Salvando compromisso…","Atualizando sua agenda financeira.",async function(){
  e.preventDefault();
  const id=$('#billId').value;
  const old=appState.bills.find(function(b){return b.id===id;});
  const record={id:id||uid('bill'),type:getRadio('billType'),description:$('#billDescription').value.trim(),amount:Number($('#billAmount').value),dueDate:$('#billDueDate').value,category:$('#billCategory').value,accountId:$('#billAccount').value||'',notes:$('#billNotes').value.trim(),paid:old?!!old.paid:false,paidAt:old?old.paidAt:'',transactionId:old?old.transactionId:'',updatedAt:new Date().toISOString()};
  if(!record.description||!record.dueDate||!(record.amount>0))return toast('Revise descrição, valor e vencimento.','error');
  const idx=appState.bills.findIndex(function(b){return b.id===id;});
  if(idx>=0)appState.bills[idx]=record;else appState.bills.push(record);
  logAudit(idx>=0?'bill-update':'bill-create',record.description); await commitStateChange(); toast('Conta prevista salva.','success');

  });
}
async function payBill(id){
  const b=appState.bills.find(function(x){return x.id===id;});if(!b||b.paid)return;
  b.paid=true;b.paidAt=localDateKey(new Date());
  const tx={id:uid('tx'),type:b.type,description:b.description,amount:Number(b.amount),date:b.paidAt,category:b.category,payment:'Conta paga',accountId:b.accountId||'',billId:b.id,notes:b.notes||'Gerado a partir de conta prevista',createdAt:new Date().toISOString()};
  appState.transactions.push(tx);b.transactionId=tx.id;logAudit('bill-paid',b.description);await saveVault();renderAll();toast('Conta marcada como paga e lançada no caixa.','success');
}
async function deleteBill(id){
  const b=appState.bills.find(function(x){return x.id===id;});if(!b)return;
  if(!await confirmDialog('Excluir conta prevista?','O lançamento já realizado, se houver, não será apagado.'))return;
  appState.bills=appState.bills.filter(function(x){return x.id!==id;});logAudit('bill-delete',b.description);await saveVault();renderAll();toast('Conta prevista excluída.','success');
}

async function saveTransferForm(e){
  return withLoading("Registrando transferência…","Movimentando os valores entre suas contas.",async function(){
  e.preventDefault();
  const from=$('#transferFrom').value,to=$('#transferTo').value,amount=Number($('#transferAmount').value),date=$('#transferDate').value;
  if(!from||!to||from===to)return toast('Escolha contas de origem e destino diferentes.','error');
  if(!(amount>0)||!date)return toast('Informe valor e data.','error');
  const record={id:uid('trf'),fromAccountId:from,toAccountId:to,amount:amount,date:date,notes:$('#transferNotes').value.trim(),createdAt:new Date().toISOString()};
  appState.transfers.push(record);logAudit('transfer-create',(getAccount(from)?.name||'')+' → '+(getAccount(to)?.name||''));await commitStateChange();toast('Transferência registrada sem alterar receitas/despesas.','success');

  });
}

function inferCategoryGroup(id){
  if(['moradia','alimentacao','transporte','saude','educacao','dividas'].includes(id))return 'essential';
  if(['lazer','assinaturas','compras'].includes(id))return 'wants';
  if(['investimentos'].includes(id))return 'future';
  if(['salario'].includes(id))return 'income';
  return 'essential';
}
function renderCategoryManager(){
  if(!appState||!$('#categoryManager'))return;
  $('#categoryManager').innerHTML=appState.categories.map(function(c){
    const group=c.group||inferCategoryGroup(c.id);
    const label={essential:'Essencial',wants:'Desejos',future:'Futuro',income:'Receita'}[group]||'Outro';
    return '<div class="category-manage-row"><i style="background:'+esc(c.color)+'"></i><span>'+esc(c.icon+' '+c.name)+'</span><small>'+label+'</small><button class="row-btn edit-category" data-id="'+c.id+'">✎</button><button class="row-btn delete-category" data-id="'+c.id+'">×</button></div>';
  }).join('');
  $$('.edit-category').forEach(function(b){b.onclick=function(){const c=appState.categories.find(function(x){return x.id===b.dataset.id;});if(c)openModal('category',c);};});
  $$('.delete-category').forEach(function(b){b.onclick=function(){deleteCategory(b.dataset.id);};});
}
async function saveCategoryForm(e){
  return withLoading("Salvando categoria…","Atualizando a organização dos seus lançamentos.",async function(){
  e.preventDefault();
  const id=$('#categoryId').value;
  const name=$('#categoryName').value.trim();
  if(!name)return toast('Informe o nome da categoria.','error');
  const record={id:id||uid('cat'),name:name,icon:$('#categoryIcon').value.trim()||'📦',color:$('#categoryColor').value,group:$('#categoryGroup').value};
  const idx=appState.categories.findIndex(function(c){return c.id===id;});
  if(idx>=0)appState.categories[idx]=Object.assign({},appState.categories[idx],record);else appState.categories.push(record);
  logAudit(idx>=0?'category-update':'category-create',record.name);await commitStateChange();toast('Categoria salva.','success');

  });
}
async function deleteCategory(id){
  const c=appState.categories.find(function(x){return x.id===id;});if(!c)return;
  const used=appState.transactions.some(function(t){return t.category===id;})||appState.recurring.some(function(r){return r.category===id;})||appState.budgets.some(function(b){return b.category===id;})||appState.bills.some(function(b){return b.category===id;});
  if(used)return toast('Esta categoria está em uso. Reclassifique os itens antes de excluí-la.','error');
  if(!await confirmDialog('Excluir categoria?','A categoria "'+c.name+'" será removida.'))return;
  appState.categories=appState.categories.filter(function(x){return x.id!==id;});logAudit('category-delete',c.name);await saveVault();renderAll();toast('Categoria excluída.','success');
}

function renderSmartFinance(){
  if(!appState||!$('#smartAlerts'))return;
  const tx=transactionsForMonth(selectedMonth),income=sumByType(tx,'income'),expense=sumByType(tx,'expense'),limit=Number(appState.settings.monthlyBudget||0);
  const savings=income?((income-expense)/income)*100:0;
  const fixed=tx.filter(function(t){return t.type==='expense'&&t.sourceRecurringId;}).reduce(function(a,t){return a+Number(t.amount);},0);
  const fixedPct=income?fixed/income*100:0;
  const today=localDateKey(new Date());
  const overdue=appState.bills.filter(function(b){return !b.paid&&b.type==='expense'&&b.dueDate<today;});
  const alerts=[];
  if(limit&&expense/limit>=1)alerts.push({kind:'danger',icon:'!',text:'Orçamento mensal excedido em '+money(expense-limit)+'.'});
  else if(limit&&expense/limit>=.8)alerts.push({kind:'warn',icon:'⚠',text:'Você já utilizou '+formatPct(expense/limit*100)+' do orçamento mensal.'});
  if(overdue.length)alerts.push({kind:'danger',icon:'⌛',text:overdue.length+' conta(s) vencida(s), totalizando '+money(overdue.reduce(function(a,b){return a+Number(b.amount);},0))+'.'});
  const highCard=appState.cards.find(function(c){return Number(c.limit)>0&&cardCommitted(c)/Number(c.limit)>=.8;});
  if(highCard)alerts.push({kind:'warn',icon:'▣',text:'O cartão '+highCard.name+' está com '+formatPct(cardCommitted(highCard)/Number(highCard.limit)*100)+' do limite comprometido.'});
  if(income>0&&savings>=20)alerts.push({kind:'good',icon:'✓',text:'Boa taxa de economia: '+formatPct(savings)+'.'});
  $('#smartAlerts').innerHTML=alerts.slice(0,3).map(function(a){return '<div class="smart-alert '+a.kind+'"><span>'+a.icon+'</span><p>'+esc(a.text)+'</p></div>';}).join('');

  let score=100,reasons=[];
  if(income<=0){score-=10;reasons.push('Registre sua renda para um score mais preciso.');}
  if(savings<0){score-=30;reasons.push('Despesas acima das receitas.');}
  else if(savings<10){score-=15;reasons.push('Taxa de economia abaixo de 10%.');}
  else if(savings>=20)reasons.push('Boa margem de economia.');
  if(limit&&expense>limit){score-=20;reasons.push('Orçamento mensal excedido.');}
  if(fixedPct>60){score-=15;reasons.push('Custos fixos acima de 60% da renda.');}
  if(overdue.length){score-=20;reasons.push('Existem contas vencidas.');}
  score=Math.max(0,Math.min(100,score));
  $('#healthScore').textContent=String(score);$('#healthScoreBadge').textContent=score+'/100';
  $('#healthLabel').textContent=score>=85?'Excelente':score>=70?'Saudável':score>=50?'Atenção':'Crítico';
  $('#healthReasons').innerHTML=reasons.slice(0,3).map(function(r){return '<p>• '+esc(r)+'</p>';}).join('');
  $('#healthScoreRing').style.background='conic-gradient(var(--success) '+(score*3.6)+'deg,var(--panel-soft) 0deg)';

  const months=[];for(let i=0;i<6;i++)months.push(shiftMonth(selectedMonth,i));
  const forecast=months.map(function(m){
    const existing=transactionsForMonth(m),existingInc=sumByType(existing,'income'),existingExp=sumByType(existing,'expense');
    let inc=existingInc,exp=existingExp;
    appState.recurring.filter(function(r){return r.active!==false;}).forEach(function(r){
      const key='expense:'+r.id+':'+m;
      const already=appState.transactions.some(function(t){
        return t.recurrenceKey===key
          || (t.sourceRecurringId===r.id && String(t.purchaseDate || t.date || '').slice(0,7)===m);
      });
      if(!already) exp+=Number(r.amount || 0);
    });

    appState.incomeSources.filter(function(source){return source.active!==false;}).forEach(function(source){
      const key='income:'+source.id+':'+m;
      const already=appState.transactions.some(function(t){
        return t.recurrenceKey===key
          || (t.sourceRecurringId===source.id && String(t.purchaseDate || t.date || '').slice(0,7)===m);
      });
      if(!already) inc+=Number(source.amount || 0);
    });

    appState.bills.filter(function(b){return !b.paid&&b.dueDate.slice(0,7)===m;}).forEach(function(b){if(b.type==='income')inc+=Number(b.amount);else exp+=Number(b.amount);});
    return {m:m,inc:inc,exp:exp,bal:inc-exp};
  });
  const max=Math.max(1,...forecast.map(function(x){return Math.max(Math.abs(x.bal),x.inc,x.exp);}));
  $('#cashFlowForecast').innerHTML=forecast.map(function(x){
    const h=Math.max(8,Math.abs(x.bal)/max*120);
    return '<div class="forecast-month"><div class="forecast-value '+(x.bal>=0?'positive':'negative')+'" style="height:'+h+'px"><span>'+compactMoney(x.bal)+'</span></div><b>'+shortMonth(x.m)+'</b><small>'+money(x.inc)+' / '+money(x.exp)+'</small></div>';
  }).join('');
}

function logAudit(action,detail){
  if(!appState)return;
  appState.audit=Array.isArray(appState.audit)?appState.audit:[];
  appState.audit.unshift({id:uid('audit'),action:action,detail:String(detail||''),at:new Date().toISOString()});
  if(appState.audit.length>200)appState.audit.length=200;
}


function setupPwa(){
  if(!('serviceWorker' in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange',function(){
    if(refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load',async function(){
    try{
      const registration = await navigator.serviceWorker.register('./service-worker.js',{updateViaCache:'none'});
      await registration.update();

      registration.addEventListener('updatefound',function(){
        const worker = registration.installing;
        if(!worker) return;
        worker.addEventListener('statechange',function(){
          if(worker.state === 'installed' && navigator.serviceWorker.controller){
            toast('Nova versão encontrada. Atualizando automaticamente…','info');
          }
        });
      });

      setInterval(function(){
        registration.update().catch(function(){});
      },60000);

      window.addEventListener('online',function(){
        registration.update().catch(function(){});
      });
    }catch(err){}
  });
}


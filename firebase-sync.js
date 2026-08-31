import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  reauthenticateWithPopup,
  deleteUser,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  collection,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported as messagingSupported
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging.js';

const cfg = globalThis.STOP_GASTOS_FIREBASE_CONFIG || {};
const vapidKey = globalThis.STOP_GASTOS_FIREBASE_VAPID_KEY || '';
const required = ['apiKey','authDomain','projectId','messagingSenderId','appId'];
const configured = required.every(key => String(cfg[key] || '').trim());
const authObservers = new Set();

let app = null;
let auth = null;
let db = null;
let messaging = null;
let currentUser = null;
let foregroundBound = false;

function publicUser(user){
  if(!user) return null;
  return {
    uid:user.uid,
    displayName:user.displayName || '',
    email:user.email || '',
    photoURL:user.photoURL || ''
  };
}

function deviceId(){
  const key='stop_gastos_device_id_v1';
  let id=localStorage.getItem(key);
  if(!id){
    id=crypto.randomUUID ? crypto.randomUUID() : 'device-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    localStorage.setItem(key,id);
  }
  return id;
}

function randomCode(){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes=crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes,b=>alphabet[b%alphabet.length]).join('');
}


function normalizeEmail(value){
  return String(value || '').trim().toLowerCase();
}

async function emailDirectoryKey(email){
  const bytes=new TextEncoder().encode(normalizeEmail(email));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

async function registerDirectoryEntry(){
  requireUser();
  const rawEmail=String(currentUser.email || '').trim();
  const email=normalizeEmail(rawEmail);
  if(!email) return;
  const key=await emailDirectoryKey(email);
  await setDoc(doc(db,'userDirectory',key),{
    uid:currentUser.uid,
    email:rawEmail,
    displayName:currentUser.displayName || '',
    photoURL:currentUser.photoURL || '',
    updatedAt:serverTimestamp()
  },{merge:true});
}

async function findUserByEmail(email){
  requireUser();
  const normalized=normalizeEmail(email);
  if(!normalized) return null;
  const key=await emailDirectoryKey(normalized);
  const snap=await getDoc(doc(db,'userDirectory',key));
  if(!snap.exists()) return null;
  const data=snap.data() || {};
  if(normalizeEmail(data.email)!==normalized) return null;
  return data;
}


async function setup(){
  if(!configured){
    notifyReady();
    return;
  }

  try{
    app=initializeApp(cfg);
    auth=getAuth(app);
    await setPersistence(auth,browserLocalPersistence);

    try{
      db=initializeFirestore(app,{
        localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})
      });
    }catch(err){
      db=getFirestore(app);
    }

    onAuthStateChanged(auth,async user=>{
      currentUser=user || null;
      if(currentUser){
        try{ await ensureOwnProfile(); }catch(err){}
      }
      authObservers.forEach(fn=>{
        try{ fn(publicUser(currentUser)); }catch(err){}
      });
      globalThis.dispatchEvent(new CustomEvent('stopgastos:auth-changed',{detail:{user:publicUser(currentUser)}}));
    });

    try{ await getRedirectResult(auth); }catch(err){}
    notifyReady();
  }catch(error){
    console.error('Stop Gastos Firebase:',error);
    globalThis.dispatchEvent(new CustomEvent('stopgastos:cloud-error',{detail:{message:error.message || String(error)}}));
    notifyReady();
  }
}

function notifyReady(){
  globalThis.dispatchEvent(new CustomEvent('stopgastos:cloud-ready',{detail:{configured,ready:!!app}}));
}

async function signInGoogle(){
  if(!auth) throw new Error('Firebase ainda não está configurado.');
  const provider=new GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  try{
    const result=await signInWithPopup(auth,provider);
    return publicUser(result.user);
  }catch(error){
    if(['auth/popup-blocked','auth/cancelled-popup-request','auth/operation-not-supported-in-this-environment'].includes(error.code)){
      await signInWithRedirect(auth,provider);
      return null;
    }
    throw error;
  }
}

async function signOutGoogle(){
  if(auth) await signOut(auth);
}

function onUserChanged(callback){
  authObservers.add(callback);
  if(auth) callback(publicUser(currentUser));
  return ()=>authObservers.delete(callback);
}

function requireUser(){
  if(!db || !currentUser) throw new Error('Entre com Google para continuar.');
}

function profileRef(uid=currentUser?.uid){
  requireUser();
  return doc(db,'users',uid,'profile','main');
}

function stateRef(uid=currentUser?.uid){
  requireUser();
  return doc(db,'users',uid,'state','main');
}

async function ensureOwnProfile(){
  requireUser();
  const ref=profileRef();
  const snap=await getDoc(ref);
  const existing=snap.exists() ? snap.data() : {};
  await setDoc(ref,{
    uid:currentUser.uid,
    displayName:currentUser.displayName || existing.displayName || '',
    email:normalizeEmail(currentUser.email || existing.email || ''),
    photoURL:currentUser.photoURL || existing.photoURL || '',
    familyId:existing.familyId || '',
    role:existing.role || '',
    updatedAt:serverTimestamp()
  },{merge:true});
  await registerDirectoryEntry();
}

async function getOwnProfile(){
  requireUser();
  await ensureOwnProfile();
  const snap=await getDoc(profileRef());
  return snap.exists() ? snap.data() : null;
}

async function pushState(state){
  requireUser();
  if(!state) return {synced:false};
  const clientUpdatedAt=new Date().toISOString();
  await setDoc(stateRef(),{
    state,
    clientUpdatedAt,
    deviceId:deviceId(),
    updatedAt:serverTimestamp()
  },{merge:true});
  return {synced:true,clientUpdatedAt};
}

function stateResult(snapshot){
  if(!snapshot.exists()) return null;
  const data=snapshot.data() || {};
  return {
    state:data.state || null,
    clientUpdatedAt:data.clientUpdatedAt || '',
    deviceId:data.deviceId || '',
    fromCache:!!snapshot.metadata?.fromCache,
    hasPendingWrites:!!snapshot.metadata?.hasPendingWrites
  };
}

async function pullState(uid=currentUser?.uid){
  requireUser();
  const snapshot=await getDoc(stateRef(uid));
  return stateResult(snapshot);
}

function watchState(callback,uid=currentUser?.uid){
  requireUser();
  return onSnapshot(stateRef(uid),{includeMetadataChanges:true},snapshot=>{
    callback(stateResult(snapshot));
  },error=>{
    globalThis.dispatchEvent(new CustomEvent('stopgastos:cloud-error',{detail:{message:error.message || String(error)}}));
  });
}

async function createFamily(name){
  requireUser();
  const clean=String(name || '').trim();
  if(clean.length<2) throw new Error('Informe um nome para a família.');

  // Antes de bloquear a criação, resolve vínculos antigos ou incompletos.
  const context=await getFamilyContext();
  if(context.family){
    throw new Error('Você já administra ou participa da família "'+(context.family.name || 'Família')+'".');
  }

  const currentProfile=context.profile || await getOwnProfile();
  if(currentProfile?.familyId){
    throw new Error('Seu perfil ainda possui um vínculo familiar que não pôde ser validado. Atualize a página e tente novamente.');
  }

  const familyId=crypto.randomUUID ? crypto.randomUUID() : 'family-'+Date.now()+'-'+Math.random().toString(36).slice(2);

  await setDoc(doc(db,'families',familyId),{
    name:clean,
    ownerUid:currentUser.uid,
    createdAt:serverTimestamp(),
    updatedAt:serverTimestamp()
  });

  await setDoc(doc(db,'families',familyId,'members',currentUser.uid),{
    uid:currentUser.uid,
    displayName:currentUser.displayName || '',
    email:normalizeEmail(currentUser.email),
    photoURL:currentUser.photoURL || '',
    role:'admin',
    status:'active',
    joinedAt:serverTimestamp(),
    updatedAt:serverTimestamp()
  });

  await setDoc(profileRef(),{
    familyId,
    role:'admin',
    updatedAt:serverTimestamp()
  },{merge:true});

  return getFamilyContext();
}

async function createFamilyInvite(){
  throw new Error('Convites por código foram substituídos por convites por e-mail.');
}

async function acceptFamilyInvite(){
  throw new Error('Use a notificação de convite enviada para sua conta.');
}


async function sendFamilyInviteByEmail(email){
  requireUser();

  let context;
  try{
    context=await getFamilyContext();
  }catch(error){
    throw new Error('Não foi possível validar sua permissão de administrador: '+(error.message || error));
  }

  if(!context.family || context.profile?.role!=='admin'){
    throw new Error('Apenas o administrador pode convidar membros.');
  }

  const normalized=normalizeEmail(email);
  if(!normalized) throw new Error('Informe o e-mail Google do membro.');
  if(normalized===normalizeEmail(currentUser.email)) throw new Error('Você já é o administrador desta família.');

  let target;
  try{
    target=await findUserByEmail(normalized);
  }catch(error){
    throw new Error('Não foi possível localizar a conta pelo e-mail: '+(error.message || error));
  }
  if(!target?.uid) throw new Error('Essa conta ainda não entrou no Stop Gastos com esse e-mail.');

  const memberRef=doc(db,'families',context.family.id,'members',target.uid);

  let memberSnap;
  try{
    memberSnap=await getDoc(memberRef);
  }catch(error){
    throw new Error('Não foi possível verificar o vínculo familiar: '+(error.message || error));
  }

  if(memberSnap.exists()){
    const status=memberSnap.data().status || 'active';
    if(status==='active') throw new Error('Essa pessoa já é membro ativo da família.');
    if(status==='pending') throw new Error('Já existe um convite pendente para esse e-mail.');
  }

  const requestId=crypto.randomUUID ? crypto.randomUUID() : 'invite-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const expiresAt=new Date(Date.now()+7*24*60*60*1000);

  try{
    await setDoc(memberRef,{
      uid:target.uid,
      displayName:target.displayName || '',
      email:normalized,
      photoURL:target.photoURL || '',
      role:'member',
      status:'pending',
      invitedBy:currentUser.uid,
      invitedByName:currentUser.displayName || '',
      invitedAt:serverTimestamp(),
      responseAt:null,
      declinedAt:null,
      acceptedAt:null,
      updatedAt:serverTimestamp()
    },{merge:true});
  }catch(error){
    throw new Error('Não foi possível criar o vínculo pendente: '+(error.message || error));
  }

  try{
    await setDoc(doc(db,'familyRequests',requestId),{
      requestId,
      familyId:context.family.id,
      familyName:context.family.name || 'Família',
      targetUid:target.uid,
      targetEmail:normalized,
      targetName:target.displayName || '',
      targetPhotoURL:target.photoURL || '',
      createdBy:currentUser.uid,
      createdByName:currentUser.displayName || '',
      status:'pending',
      expiresAt,
      createdAt:serverTimestamp(),
      respondedAt:null,
      updatedAt:serverTimestamp()
    });
  }catch(error){
    try{
      await setDoc(memberRef,{
        status:'declined',
        responseAt:serverTimestamp(),
        updatedAt:serverTimestamp()
      },{merge:true});
    }catch(rollbackError){}
    throw new Error('Não foi possível registrar a notificação do convite: '+(error.message || error));
  }

  return {requestId,target,status:'pending'};
}

async function getFamilyInvitations(){
  requireUser();
  const q=query(collection(db,'familyRequests'),where('targetUid','==',currentUser.uid));
  const snaps=await getDocs(q);
  return snaps.docs
    .map(d=>({id:d.id,...d.data()}))
    .filter(item=>item.status==='pending')
    .filter(item=>{
      const expiry=item.expiresAt && typeof item.expiresAt.toDate==='function' ? item.expiresAt.toDate() : new Date(item.expiresAt || 0);
      return !expiry || expiry.getTime()>Date.now();
    });
}

function watchFamilyInvitations(callback){
  requireUser();
  const q=query(collection(db,'familyRequests'),where('targetUid','==',currentUser.uid));
  return onSnapshot(q,snapshot=>{
    const items=snapshot.docs
      .map(d=>({id:d.id,...d.data()}))
      .filter(item=>item.status==='pending')
      .filter(item=>{
        const expiry=item.expiresAt && typeof item.expiresAt.toDate==='function' ? item.expiresAt.toDate() : new Date(item.expiresAt || 0);
        return !expiry || expiry.getTime()>Date.now();
      });
    callback(items);
  },error=>{
    globalThis.dispatchEvent(new CustomEvent('stopgastos:cloud-error',{detail:{message:error.message || String(error)}}));
  });
}

async function respondFamilyInvitation(requestId,accept){
  requireUser();
  const requestRef=doc(db,'familyRequests',requestId);
  const snap=await getDoc(requestRef);
  if(!snap.exists()) throw new Error('Convite não encontrado.');

  const invitation=snap.data();
  if(invitation.targetUid!==currentUser.uid) throw new Error('Este convite pertence a outra conta.');
  if(invitation.status!=='pending') throw new Error('Este convite já foi respondido.');

  const expiry=invitation.expiresAt && typeof invitation.expiresAt.toDate==='function'
    ? invitation.expiresAt.toDate()
    : new Date(invitation.expiresAt || 0);
  if(expiry && expiry.getTime()<=Date.now()) throw new Error('Este convite expirou.');

  const memberRef=doc(db,'families',invitation.familyId,'members',currentUser.uid);

  if(accept){
    const profile=await getOwnProfile();
    if(profile?.familyId && profile.familyId!==invitation.familyId) throw new Error('Você já participa de outra família.');

    await setDoc(memberRef,{
      uid:currentUser.uid,
      displayName:currentUser.displayName || '',
      email:normalizeEmail(currentUser.email),
      photoURL:currentUser.photoURL || '',
      role:'member',
      status:'active',
      joinedAt:serverTimestamp(),
      acceptedAt:serverTimestamp(),
      responseAt:serverTimestamp(),
      declinedAt:null,
      updatedAt:serverTimestamp()
    },{merge:true});

    await setDoc(profileRef(),{
      familyId:invitation.familyId,
      role:'member',
      updatedAt:serverTimestamp()
    },{merge:true});

    await setDoc(requestRef,{
      status:'accepted',
      respondedAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    },{merge:true});
  }else{
    await setDoc(memberRef,{
      uid:currentUser.uid,
      displayName:currentUser.displayName || '',
      email:normalizeEmail(currentUser.email),
      photoURL:currentUser.photoURL || '',
      role:'member',
      status:'declined',
      responseAt:serverTimestamp(),
      declinedAt:serverTimestamp(),
      acceptedAt:null,
      updatedAt:serverTimestamp()
    },{merge:true});

    await setDoc(requestRef,{
      status:'declined',
      respondedAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    },{merge:true});
  }

  return {
    accepted:!!accept,
    status:accept?'accepted':'declined',
    familyId:invitation.familyId,
    targetEmail:invitation.targetEmail || normalizeEmail(currentUser.email)
  };
}

async function getFamilyContext(){
  requireUser();
  let profile=await getOwnProfile();

  if(!profile?.familyId){
    return {profile,family:null,members:[],repaired:false};
  }

  const familyId=profile.familyId;
  const ownMemberRef=doc(db,'families',familyId,'members',currentUser.uid);

  let ownMemberSnap;
  try{
    ownMemberSnap=await getDoc(ownMemberRef);
  }catch(error){
    // Não alteramos o perfil quando as regras do Firestore estão bloqueando
    // a leitura. Isso evita apagar um vínculo válido por causa de rules antigas.
    throw new Error('Não foi possível validar seu vínculo familiar. Verifique se as regras atuais do Firestore foram publicadas. Detalhe: '+(error.message || error));
  }

  if(ownMemberSnap.exists()){
    const ownMember=ownMemberSnap.data() || {};
    const status=ownMember.status || 'active';

    // O perfil só deve carregar familyId quando o vínculo está realmente ativo.
    if(status!=='active'){
      await setDoc(profileRef(),{
        familyId:'',
        role:'',
        updatedAt:serverTimestamp()
      },{merge:true});
      profile={...profile,familyId:'',role:''};
      return {profile,family:null,members:[],repaired:true,previousStatus:status};
    }
  }

  let familySnap;
  try{
    familySnap=await getDoc(doc(db,'families',familyId));
  }catch(error){
    // Se existe vínculo ativo, uma negativa aqui representa configuração de
    // segurança/rules, e não ausência de família.
    if(ownMemberSnap.exists()){
      throw new Error('Sua família existe, mas o Firestore não permitiu carregá-la. Publique a versão atual de firestore.rules. Detalhe: '+(error.message || error));
    }

    // Sem documento de membro, tentamos ler a família para descobrir se o
    // usuário é um proprietário antigo cujo member doc ficou incompleto.
    throw new Error('Seu perfil aponta para uma família, mas o acesso ao vínculo foi negado. Publique as regras atuais do Firestore e tente novamente. Detalhe: '+(error.message || error));
  }

  // familyId antigo apontando para documento removido: limpa automaticamente.
  if(!familySnap.exists()){
    await setDoc(profileRef(),{
      familyId:'',
      role:'',
      updatedAt:serverTimestamp()
    },{merge:true});
    profile={...profile,familyId:'',role:''};
    return {profile,family:null,members:[],repaired:true,orphaned:true};
  }

  const family={id:familySnap.id,...familySnap.data()};
  const isOwner=family.ownerUid===currentUser.uid;

  // Corrige famílias criadas em versões antigas nas quais o documento
  // principal foi salvo, mas o vínculo do administrador não foi concluído.
  if(isOwner && !ownMemberSnap.exists()){
    await setDoc(ownMemberRef,{
      uid:currentUser.uid,
      displayName:currentUser.displayName || '',
      email:normalizeEmail(currentUser.email),
      photoURL:currentUser.photoURL || '',
      role:'admin',
      status:'active',
      joinedAt:serverTimestamp(),
      repairedAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    },{merge:true});

    await setDoc(profileRef(),{
      familyId,
      role:'admin',
      updatedAt:serverTimestamp()
    },{merge:true});

    profile={...profile,familyId,role:'admin'};
    ownMemberSnap=await getDoc(ownMemberRef);
  }

  // Se não é proprietário e também não existe vínculo ativo, o familyId do
  // perfil ficou órfão e pode ser removido com segurança.
  if(!isOwner && !ownMemberSnap.exists()){
    await setDoc(profileRef(),{
      familyId:'',
      role:'',
      updatedAt:serverTimestamp()
    },{merge:true});
    profile={...profile,familyId:'',role:''};
    return {profile,family:null,members:[],repaired:true,orphaned:true};
  }

  const ownMember=ownMemberSnap.exists()?ownMemberSnap.data():null;
  if(ownMember && (ownMember.status || 'active')!=='active'){
    await setDoc(profileRef(),{
      familyId:'',
      role:'',
      updatedAt:serverTimestamp()
    },{merge:true});
    profile={...profile,familyId:'',role:''};
    return {profile,family:null,members:[],repaired:true,previousStatus:ownMember.status};
  }

  const expectedRole=isOwner?'admin':(ownMember?.role || 'member');
  if(profile.role!==expectedRole){
    await setDoc(profileRef(),{
      familyId,
      role:expectedRole,
      updatedAt:serverTimestamp()
    },{merge:true});
    profile={...profile,role:expectedRole};
  }

  let memberSnaps;
  if(expectedRole==='admin'){
    memberSnaps=await getDocs(collection(db,'families',familyId,'members'));
  }else{
    memberSnaps=await getDocs(query(
      collection(db,'families',familyId,'members'),
      where('status','==','active')
    ));
  }

  const members=memberSnaps.docs.map(d=>({id:d.id,...d.data()}));
  return {profile,family,members,repaired:false};
}

function watchFamilyMembers(familyId,callback){
  requireUser();
  if(!familyId) return ()=>{};
  return onSnapshot(collection(db,'families',familyId,'members'),snapshot=>{
    callback(snapshot.docs.map(d=>({id:d.id,...d.data()})));
  },error=>{
    globalThis.dispatchEvent(new CustomEvent('stopgastos:cloud-error',{detail:{message:error.message || String(error)}}));
  });
}

async function getFamilyStates(){
  requireUser();
  const context=await getFamilyContext();
  if(!context.family) return {context,states:{}};

  const ownUid=currentUser.uid;
  const isAdmin=context.profile?.role==='admin';
  const activeMembers=context.members.filter(m=>(m.status || 'active')==='active');
  const readable=isAdmin ? activeMembers : activeMembers.filter(m=>m.uid===ownUid);
  const states={};

  await Promise.all(readable.map(async member=>{
    try{
      const snap=await getDoc(stateRef(member.uid));
      states[member.uid]=stateResult(snap);
    }catch(err){
      states[member.uid]=null;
    }
  }));

  return {context,states};
}

async function removeFamilyMember(uid){
  requireUser();
  const context=await getFamilyContext();
  if(!context.family || context.profile?.role!=='admin') throw new Error('Apenas o administrador pode remover membros.');
  if(uid===context.family.ownerUid) throw new Error('O administrador proprietário não pode ser removido.');

  await deleteDoc(doc(db,'families',context.family.id,'members',uid));
  await setDoc(doc(db,'users',uid,'profile','main'),{familyId:'',role:'',updatedAt:serverTimestamp()},{merge:true});
}


async function getAccountDeletionStatus(){
  requireUser();
  const context=await getFamilyContext();
  if(!context.family){
    return {blocked:false,isOwner:false,otherLinks:[],transferCandidates:[]};
  }

  const isOwner=context.family.ownerUid===currentUser.uid;
  const otherLinks=(context.members || []).filter(member=>member.uid!==currentUser.uid);
  const transferCandidates=otherLinks.filter(member=>(member.status || 'active')==='active');

  return {
    blocked:isOwner && otherLinks.length>0,
    isOwner,
    familyId:context.family.id,
    familyName:context.family.name || 'Família',
    otherLinks,
    transferCandidates
  };
}

async function transferFamilyOwnership(targetUid){
  requireUser();
  const context=await getFamilyContext();

  if(!context.family) throw new Error('Você não participa de uma família.');
  if(context.family.ownerUid!==currentUser.uid) throw new Error('Somente o proprietário atual pode transferir a administração.');
  if(targetUid===currentUser.uid) throw new Error('Você já é o administrador da família.');

  const target=(context.members || []).find(member=>member.uid===targetUid);
  if(!target) throw new Error('Membro não encontrado.');
  if((target.status || 'active')!=='active') throw new Error('A administração só pode ser transferida para um membro ativo.');

  const familyId=context.family.id;
  const batch=writeBatch(db);

  batch.set(doc(db,'users',targetUid,'profile','main'),{
    familyId,
    role:'admin',
    updatedAt:serverTimestamp()
  },{merge:true});

  batch.set(doc(db,'families',familyId,'members',targetUid),{
    role:'admin',
    promotedAt:serverTimestamp(),
    updatedAt:serverTimestamp()
  },{merge:true});

  batch.set(profileRef(),{
    familyId,
    role:'member',
    updatedAt:serverTimestamp()
  },{merge:true});

  batch.set(doc(db,'families',familyId,'members',currentUser.uid),{
    role:'member',
    updatedAt:serverTimestamp()
  },{merge:true});

  batch.set(doc(db,'families',familyId),{
    ownerUid:targetUid,
    updatedAt:serverTimestamp()
  },{merge:true});

  await batch.commit();

  return {
    familyId,
    previousOwnerUid:currentUser.uid,
    newOwnerUid:targetUid,
    newOwnerEmail:target.email || '',
    newOwnerName:target.displayName || target.email || 'Novo administrador'
  };
}

async function authenticationIsRecent(maxAgeMs=4*60*1000){
  requireUser();
  try{
    const result=await currentUser.getIdTokenResult();
    const authTime=Date.parse(result.authTime || '');
    return Number.isFinite(authTime) && (Date.now()-authTime)<=maxAgeMs;
  }catch(error){
    return false;
  }
}

async function authorizeAccountDeletion(){
  requireUser();
  const provider=new GoogleAuthProvider();
  if(currentUser.email){
    provider.setCustomParameters({login_hint:currentUser.email});
  }
  await reauthenticateWithPopup(currentUser,provider);
  return {authorized:true};
}

async function leaveFamily(){
  requireUser();
  const context=await getFamilyContext();
  if(!context.family) return;
  if(context.family.ownerUid===currentUser.uid) throw new Error('O proprietário não pode sair da família sem transferir a administração.');
  await deleteDoc(doc(db,'families',context.family.id,'members',currentUser.uid));
  await setDoc(profileRef(),{familyId:'',role:'',updatedAt:serverTimestamp()},{merge:true});
}


async function deleteCurrentAccount(){
  requireUser();

  const user=currentUser;
  const uid=user.uid;
  const email=normalizeEmail(user.email);
  const deletionStatus=await getAccountDeletionStatus();

  if(deletionStatus.blocked){
    const active=deletionStatus.otherLinks.filter(member=>(member.status || 'active')==='active').length;
    const pending=deletionStatus.otherLinks.filter(member=>member.status==='pending').length;
    const declined=deletionStatus.otherLinks.filter(member=>member.status==='declined').length;
    const parts=[];
    if(active) parts.push(active+' ativo'+(active===1?'':'s'));
    if(pending) parts.push(pending+' pendente'+(pending===1?'':'s'));
    if(declined) parts.push(declined+' recusado'+(declined===1?'':'s'));

    const error=new Error(
      'Você é o proprietário da família e ainda existem outros vínculos ('+parts.join(', ')+'). '+
      (deletionStatus.transferCandidates.length
        ? 'Remova todos os vínculos ou transfira a administração para um membro ativo antes de excluir sua conta.'
        : 'Remova todos os vínculos antes de excluir sua conta.')
    );
    error.code='family/owner-has-members';
    error.details=deletionStatus;
    throw error;
  }

  // Verifica a atualidade da autenticação antes de apagar qualquer dado.
  // Se a sessão for antiga, a UI pedirá uma autorização explícita e tentará novamente.
  if(!(await authenticationIsRecent())){
    const error=new Error('Por segurança, confirme sua identidade Google para autorizar a exclusão.');
    error.code='auth/requires-delete-authorization';
    throw error;
  }

  const context=await getFamilyContext();

  // Remove solicitações recebidas pelo usuário.
  const incoming=await getDocs(query(
    collection(db,'familyRequests'),
    where('targetUid','==',uid)
  ));
  for(const requestDoc of incoming.docs){
    await deleteDoc(requestDoc.ref);
  }

  // Se ainda for o único proprietário da família, remove solicitações e a família vazia.
  if(context.family && context.family.ownerUid===uid){
    const outgoing=await getDocs(query(
      collection(db,'familyRequests'),
      where('familyId','==',context.family.id)
    ));
    for(const requestDoc of outgoing.docs){
      await deleteDoc(requestDoc.ref);
    }
  }

  if(context.family){
    await deleteDoc(doc(db,'families',context.family.id,'members',uid));
    if(context.family.ownerUid===uid){
      await deleteDoc(doc(db,'families',context.family.id));
    }
  }

  const devices=await getDocs(collection(db,'users',uid,'devices'));
  for(const device of devices.docs){
    await deleteDoc(device.ref);
  }

  await deleteDoc(stateRef(uid));
  await deleteDoc(profileRef(uid));

  if(email){
    const directoryKey=await emailDirectoryKey(email);
    await deleteDoc(doc(db,'userDirectory',directoryKey));
  }

  await deleteUser(user);
  currentUser=null;

  return {uid,email};
}

async function enableNotifications(){
  requireUser();
  if(!vapidKey) throw new Error('A chave pública VAPID ainda não foi configurada.');
  if(!('Notification' in window)) throw new Error('Este navegador não oferece notificações Web.');
  if(!(await messagingSupported())) throw new Error('Firebase Messaging não é compatível com este navegador.');

  const permission=await Notification.requestPermission();
  if(permission!=='granted') throw new Error('Permissão de notificação não concedida.');

  messaging=messaging || getMessaging(app);
  const registration=await navigator.serviceWorker.ready;
  const token=await getToken(messaging,{vapidKey,serviceWorkerRegistration:registration});
  if(!token) throw new Error('Não foi possível obter o token de notificação.');

  await setDoc(doc(db,'users',currentUser.uid,'devices',deviceId()),{
    token,
    enabled:true,
    platform:navigator.platform || '',
    userAgent:navigator.userAgent || '',
    updatedAt:serverTimestamp()
  },{merge:true});

  if(!foregroundBound){
    foregroundBound=true;
    onMessage(messaging,payload=>{
      globalThis.dispatchEvent(new CustomEvent('stopgastos:notification',{detail:payload}));
    });
  }
  return {enabled:true};
}

globalThis.StopGastosCloud={
  configured,
  vapidConfigured:!!vapidKey,
  get ready(){ return !!app; },
  get user(){ return publicUser(currentUser); },
  isSignedIn(){ return !!currentUser; },
  signInGoogle,
  signOutGoogle,
  onUserChanged,
  getOwnProfile,
  pushState,
  pullState,
  watchState,
  createFamily,
  createFamilyInvite,
  acceptFamilyInvite,
  findUserByEmail,
  sendFamilyInviteByEmail,
  getFamilyInvitations,
  watchFamilyInvitations,
  respondFamilyInvitation,
  getFamilyContext,
  watchFamilyMembers,
  getFamilyStates,
  removeFamilyMember,
  getAccountDeletionStatus,
  transferFamilyOwnership,
  leaveFamily,
  authorizeAccountDeletion,
  deleteCurrentAccount,
  enableNotifications
};

setup();

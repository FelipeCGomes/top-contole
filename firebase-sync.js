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
    email:currentUser.email || existing.email || '',
    photoURL:currentUser.photoURL || existing.photoURL || '',
    familyId:existing.familyId || '',
    role:existing.role || '',
    updatedAt:serverTimestamp()
  },{merge:true});
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

  const currentProfile=await getOwnProfile();
  if(currentProfile?.familyId) throw new Error('Você já participa de uma família.');

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
    email:currentUser.email || '',
    photoURL:currentUser.photoURL || '',
    role:'admin',
    joinedAt:serverTimestamp()
  });
  await setDoc(profileRef(),{familyId,role:'admin',updatedAt:serverTimestamp()},{merge:true});

  return getFamilyContext();
}

async function createFamilyInvite(){
  requireUser();
  const profile=await getOwnProfile();
  if(!profile?.familyId || profile.role!=='admin') throw new Error('Apenas o administrador pode gerar convites.');
  const familySnap=await getDoc(doc(db,'families',profile.familyId));
  if(!familySnap.exists()) throw new Error('Família não encontrada.');

  const code=randomCode();
  await setDoc(doc(db,'familyInvites',code),{
    code,
    familyId:profile.familyId,
    familyName:familySnap.data().name || 'Família',
    createdBy:currentUser.uid,
    createdByName:currentUser.displayName || '',
    active:true,
    createdAt:serverTimestamp()
  });
  return code;
}

async function acceptFamilyInvite(code){
  requireUser();
  const clean=String(code || '').trim().toUpperCase();
  if(!clean) throw new Error('Informe o código do convite.');

  const profile=await getOwnProfile();
  if(profile?.familyId) throw new Error('Você já participa de uma família.');

  const inviteSnap=await getDoc(doc(db,'familyInvites',clean));
  if(!inviteSnap.exists() || inviteSnap.data().active!==true) throw new Error('Convite inválido ou expirado.');
  const invite=inviteSnap.data();

  await setDoc(doc(db,'families',invite.familyId,'members',currentUser.uid),{
    uid:currentUser.uid,
    displayName:currentUser.displayName || '',
    email:currentUser.email || '',
    photoURL:currentUser.photoURL || '',
    role:'member',
    inviteCode:clean,
    joinedAt:serverTimestamp()
  });
  await setDoc(profileRef(),{
    familyId:invite.familyId,
    role:'member',
    updatedAt:serverTimestamp()
  },{merge:true});

  return getFamilyContext();
}

async function getFamilyContext(){
  requireUser();
  const profile=await getOwnProfile();
  if(!profile?.familyId) return {profile,family:null,members:[]};

  const familySnap=await getDoc(doc(db,'families',profile.familyId));
  if(!familySnap.exists()) return {profile:{...profile,familyId:'',role:''},family:null,members:[]};

  const memberSnaps=await getDocs(collection(db,'families',profile.familyId,'members'));
  const members=memberSnaps.docs.map(d=>({id:d.id,...d.data()}));
  return {
    profile,
    family:{id:familySnap.id,...familySnap.data()},
    members
  };
}

async function getFamilyStates(){
  requireUser();
  const context=await getFamilyContext();
  if(!context.family) return {context,states:{}};

  const ownUid=currentUser.uid;
  const isAdmin=context.profile?.role==='admin';
  const readable=isAdmin ? context.members : context.members.filter(m=>m.uid===ownUid);
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

async function leaveFamily(){
  requireUser();
  const context=await getFamilyContext();
  if(!context.family) return;
  if(context.family.ownerUid===currentUser.uid) throw new Error('O proprietário não pode sair da família sem transferir a administração.');
  await deleteDoc(doc(db,'families',context.family.id,'members',currentUser.uid));
  await setDoc(profileRef(),{familyId:'',role:'',updatedAt:serverTimestamp()},{merge:true});
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
  getFamilyContext,
  getFamilyStates,
  removeFamilyMember,
  leaveFamily,
  enableNotifications
};

setup();

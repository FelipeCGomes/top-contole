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
  setDoc,
  getDoc,
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
    id=(crypto.randomUUID ? crypto.randomUUID() : 'device-'+Date.now()+'-'+Math.random().toString(36).slice(2));
    localStorage.setItem(key,id);
  }
  return id;
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

    onAuthStateChanged(auth,user=>{
      currentUser=user || null;
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

function userVaultRef(){
  if(!db || !currentUser) throw new Error('Entre com Google para sincronizar.');
  return doc(db,'users',currentUser.uid,'vault','main');
}

async function pushVault(vaultText){
  if(!currentUser || !db || !vaultText) return {synced:false,reason:'signed-out'};
  const parsed=JSON.parse(vaultText);
  await setDoc(userVaultRef(),{
    vault:vaultText,
    clientUpdatedAt:parsed.updatedAt || new Date().toISOString(),
    appVersion:parsed.version || 1,
    deviceId:deviceId(),
    updatedAt:serverTimestamp()
  },{merge:true});
  return {synced:true,clientUpdatedAt:parsed.updatedAt || ''};
}

function snapshotResult(snapshot){
  if(!snapshot.exists()) return null;
  const data=snapshot.data() || {};
  return {
    vault:data.vault || '',
    clientUpdatedAt:data.clientUpdatedAt || '',
    deviceId:data.deviceId || '',
    fromCache:!!snapshot.metadata?.fromCache,
    hasPendingWrites:!!snapshot.metadata?.hasPendingWrites
  };
}

async function pullVault(){
  if(!currentUser || !db) return null;
  const snapshot=await getDoc(userVaultRef());
  return snapshotResult(snapshot);
}

function watchVault(callback){
  if(!currentUser || !db) return ()=>{};
  return onSnapshot(userVaultRef(),{includeMetadataChanges:true},snapshot=>{
    callback(snapshotResult(snapshot));
  },error=>{
    globalThis.dispatchEvent(new CustomEvent('stopgastos:cloud-error',{detail:{message:error.message || String(error)}}));
  });
}

async function enableNotifications(){
  if(!currentUser) throw new Error('Entre com Google antes de ativar notificações.');
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
  pushVault,
  pullVault,
  watchVault,
  enableNotifications
};

setup();

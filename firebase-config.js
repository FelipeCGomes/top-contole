(function(root){
  'use strict';

  // Configuração pública do app Web do Firebase.
  // Preencha os valores do Firebase Console > Configurações do projeto > Seus apps > Web.
  // Não coloque serviceAccount, private keys ou segredos neste arquivo.
  root.STOP_GASTOS_FIREBASE_CONFIG = {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  };

  // Firebase Console > Cloud Messaging > Web Push certificates.
  root.STOP_GASTOS_FIREBASE_VAPID_KEY = '';
})(globalThis);

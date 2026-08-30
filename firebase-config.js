(function(root){
  'use strict';

  // Configuração pública do app Web do Firebase.
  // Não coloque serviceAccount, private keys ou segredos neste arquivo.
  root.STOP_GASTOS_FIREBASE_CONFIG = {
    apiKey: 'AIzaSyCg9hI4SY9Uo1vrwdLSq-liiuGtgI0nmD8',
    authDomain: 'stopgastos.firebaseapp.com',
    projectId: 'stopgastos',
    storageBucket: 'stopgastos.firebasestorage.app',
    messagingSenderId: '363408500943',
    appId: '1:363408500943:web:aa4d5ec09bb575fc2f2fba',
    measurementId: 'G-474SM3X55N'
  };

  // Firebase Console > Cloud Messaging > Web Push certificates.
  // Preencha apenas com a chave pública VAPID quando ela for gerada.
  root.STOP_GASTOS_FIREBASE_VAPID_KEY = '';
})(globalThis);

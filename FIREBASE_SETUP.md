# Configuração do Firebase — Stop Gastos

O Stop Gastos usa uma estratégia local-first:

1. O cofre é criptografado no navegador com AES-GCM.
2. O JSON criptografado continua salvo localmente para abrir rápido e funcionar offline.
3. Quando o usuário entra com Google, o mesmo cofre criptografado é sincronizado no Cloud Firestore.
4. Em outro computador, o usuário entra com a mesma conta Google, baixa o cofre e informa o mesmo PIN para descriptografá-lo.
5. O Firestore também usa cache persistente no navegador e sincroniza novamente quando a internet volta.

## 1. Criar o projeto

No Firebase Console:

- Crie um projeto para o Stop Gastos.
- Adicione um aplicativo **Web**.
- Copie o objeto `firebaseConfig`.

Edite `firebase-config.js` e preencha:

- apiKey
- authDomain
- projectId
- storageBucket
- messagingSenderId
- appId

A configuração Web do Firebase é informação de identificação do cliente. **Nunca** coloque service accounts, chaves privadas ou credenciais administrativas no repositório.

## 2. Login Google

Firebase Console > Authentication:

- Ative o provedor **Google**.
- Em Authorized domains, adicione:
  - `felipecgomes.github.io`
  - `localhost` para desenvolvimento local, se necessário.

O Google identifica o usuário. O PIN do Stop Gastos continua sendo necessário para descriptografar o cofre financeiro.

## 3. Cloud Firestore

Crie o Cloud Firestore e publique o conteúdo de `firestore.rules`.

Estrutura utilizada:

- `users/{uid}/vault/main`: cofre financeiro criptografado
- `users/{uid}/devices/{deviceId}`: token do dispositivo para notificações

As regras impedem que um usuário leia os documentos de outro usuário.

## 4. Notificações Web

Firebase Console > Project settings > Cloud Messaging > Web Push certificates:

- Gere/importe uma chave Web Push.
- Copie a chave pública VAPID.
- Preencha `STOP_GASTOS_FIREBASE_VAPID_KEY` em `firebase-config.js`.

O GitHub Pages já usa HTTPS, requisito para notificações push e service workers.

Nesta etapa, o app registra o dispositivo no Firebase Cloud Messaging e recebe mensagens em primeiro e segundo plano. O disparo automático por vencimento será implementado com uma função backend separada, para não colocar credenciais administrativas no navegador.

## 5. Segurança

O Firestore recebe o cofre criptografado, e não as despesas/receitas em texto puro.

Mesmo com as regras do Firestore, não remova a criptografia local. Ela funciona como uma segunda camada de proteção caso a base cloud seja acessada indevidamente.

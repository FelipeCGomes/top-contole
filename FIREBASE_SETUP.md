# Configuração do Firebase — Stop Gastos

## Arquitetura atual

O Stop Gastos usa **Google Authentication + Cloud Firestore + cache local**.

O PIN foi removido. A conta Google é a identidade do usuário e o Firestore aplica as permissões por UID e papel familiar.

### Estrutura de dados

- `users/{uid}/profile/main`
  - nome, e-mail, família e papel
- `users/{uid}/state/main`
  - estado financeiro pessoal
- `users/{uid}/devices/{deviceId}`
  - tokens de notificação
- `families/{familyId}`
  - informações da família
- `families/{familyId}/members/{uid}`
  - membros, papel `admin` ou `member`
- `familyInvites/{code}`
  - convite para ingressar na família

## 1. Authentication

Firebase Console > Authentication > Sign-in method:

- habilite **Google**;
- em Authorized domains, inclua `felipecgomes.github.io`.

A persistência usada no frontend é `browserLocalPersistence`, portanto atualizar a página não deve encerrar a sessão Google.

## 2. Cloud Firestore

Firebase Console > Firestore Database > Rules.

Substitua as regras de teste pelo conteúdo do arquivo `firestore.rules` deste repositório e clique em **Publish**.

As regras atuais garantem:

- usuário lê e grava o próprio estado;
- membro comum não lê o estado de outro membro;
- administrador pode ler os estados financeiros dos membros da própria família;
- somente administrador gerencia membros e convites;
- um convite válido permite que o próprio usuário crie sua associação como membro;
- outros caminhos ficam bloqueados.

## 3. Conta Família

Fluxo do administrador:

1. entrar com Google;
2. abrir **Família**;
3. criar uma família;
4. gerar um código de convite;
5. enviar o código ao familiar.

Fluxo do membro:

1. entrar com a própria conta Google;
2. abrir **Família**;
3. informar o código;
4. registrar os próprios gastos normalmente.

O painel do administrador consolida receitas, despesas, saldo, gastos por membro e lançamentos recentes.

## 4. Cloud Messaging

Firebase Console > Project settings > Cloud Messaging > Web Push certificates:

- gere uma chave pública VAPID;
- coloque-a em `STOP_GASTOS_FIREBASE_VAPID_KEY` dentro de `firebase-config.js`.

Nunca coloque service account, private key ou credencial administrativa no frontend.

## 5. Migração do modelo antigo com PIN

O código mantém uma rotina de migração de melhor esforço para o antigo cofre AES-GCM.

Se a chave temporária da versão anterior ainda existir no navegador, a migração para o novo estado Google-only é feita automaticamente. O cofre antigo não é apagado automaticamente.

Backups antigos criptografados por PIN não são restaurados pelo novo fluxo JSON sem uma etapa específica de migração.

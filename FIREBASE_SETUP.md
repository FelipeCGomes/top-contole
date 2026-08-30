# Configuração do Firebase — Stop Gastos

## Arquitetura

O Stop Gastos usa:

- Firebase Authentication com Google
- Cloud Firestore
- cache local por UID
- PWA / Service Worker
- Firebase Cloud Messaging preparado para Web Push

Não há PIN no fluxo atual.

## 1. Authentication

Firebase Console > Authentication > Sign-in method:

1. habilite **Google**;
2. em **Authorized domains**, inclua `felipecgomes.github.io`.

O frontend usa `browserLocalPersistence`, portanto atualizar a página não deve encerrar a sessão Google.

## 2. Firestore Rules

Firebase Console > Firestore Database > Rules.

Substitua as regras atuais pelo conteúdo completo de `firestore.rules` e clique em **Publish**.

Isso é obrigatório para o fluxo familiar por e-mail funcionar.

As regras implementam:
- estado financeiro individual por UID;
- leitura familiar apenas para administrador;
- vínculo familiar com status `pending`, `active` e `inactive`;
- convite direcionado ao UID do destinatário;
- diretório de e-mails sem permissão de listagem;
- bloqueio de todos os caminhos não autorizados.

## 3. Diretório de usuários por e-mail

Quando um usuário entra no Stop Gastos com Google, o aplicativo registra uma entrada em:

`userDirectory/{sha256(email)}`

O administrador informa o e-mail exato usado no login.

O aplicativo:
1. normaliza o e-mail;
2. calcula SHA-256;
3. busca somente aquele documento;
4. confirma que o e-mail retornado é exatamente o solicitado;
5. obtém o UID da conta;
6. envia o convite.

O Firestore não permite listar a coleção inteira do diretório.

Por isso, a pessoa precisa ter acessado o Stop Gastos ao menos uma vez antes de ser localizada pelo administrador.

## 4. Fluxo Família

### Administrador
1. entra com Google;
2. cria uma família;
3. abre **Família**;
4. informa o Gmail do membro;
5. clica em **Enviar convite**;
6. o vínculo é criado como `pending`.

### Membro
1. entra com a própria conta Google;
2. recebe um aviso no sino e na página Família;
3. escolhe **Aceitar** ou **Recusar**.

Aceitar:
- vínculo -> `active`;
- perfil recebe `familyId`;
- administrador passa a visualizar o estado financeiro do membro.

Recusar:
- vínculo -> `inactive`;
- o usuário não entra na família;
- a conta Google permanece normal e ativa.

O admin pode reenviar um convite posteriormente para um vínculo inativo.

## 5. Notificações

O convite familiar é entregue em tempo real via listener do Firestore quando o Stop Gastos está aberto.

Se o navegador já tiver permissão de notificações, o app também cria uma notificação local do navegador.

Para receber push com o aplicativo totalmente fechado, ainda é necessário:
- configurar a chave pública VAPID em `firebase-config.js`;
- usar um backend confiável, como Cloud Functions, para disparar FCM.

Nunca coloque service account, private key ou credencial administrativa no frontend.

## 6. Dados antigos

O aplicativo mantém uma tentativa de migração do antigo cofre AES-GCM caso a chave temporária da versão anterior ainda exista no mesmo navegador.

O cofre antigo não é apagado automaticamente.

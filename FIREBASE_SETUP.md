# Configuração do Firebase — Stop Gastos

## Arquitetura

O Stop Gastos usa:

- Firebase Authentication com Google;
- Cloud Firestore como fonte principal dos dados;
- documentos modulares por usuário em `users/{uid}/data/*`;
- `localStorage` apenas como cache/offline por UID;
- sincronização automática com debounce de 10 segundos após uma alteração;
- PWA / Service Worker;
- Firebase Cloud Messaging preparado para Web Push.

Não há PIN no fluxo atual.

### Política de sincronização

O aplicativo **não grava continuamente** no Firestore.

Fluxo:

1. o usuário altera um dado;
2. a interface e o cache local são atualizados imediatamente;
3. a alteração é marcada como pendente;
4. o app aguarda 10 segundos sem uma nova alteração;
5. somente os módulos que realmente mudaram são enviados ao Firestore;
6. se outra alteração ocorrer antes dos 10 segundos, o contador reinicia;
7. o botão **Sincronizar agora** pode forçar a gravação manualmente;
8. ao abrir o aplicativo sem alterações pendentes, nenhuma gravação é feita.

O documento legado `users/{uid}/state/main` permanece apenas como fallback de migração.

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
- dados modulares individuais em `users/{uid}/data/{sectionId}`;
- compatibilidade temporária com `users/{uid}/state/main`;
- leitura familiar apenas para administrador;
- listas de compras compartilhadas para membros ativos;
- vínculo familiar com status `pending`, `active` e `declined`;
- convite direcionado ao UID do destinatário;
- diretório de e-mails sem permissão de listagem;
- bloqueio de todos os caminhos não autorizados.

## 3. Estrutura de dados do usuário

A fonte principal dos dados financeiros é:

`users/{uid}/data/{sectionId}`

Seções atuais:

- `_meta`
- `categories`
- `transactions`
- `recurring`
- `incomeSources`
- `shoppingLists`
- `shoppingActiveListId`
- `budgets`
- `goals`
- `accounts`
- `cards`
- `bills`
- `transfers`
- `audit`
- `settings`

O aplicativo grava apenas as seções que mudaram.

O caminho `users/{uid}/state/main` é legado. Se as novas regras ainda não estiverem publicadas, o app pode usá-lo temporariamente como fallback para não perder dados. Depois da publicação das regras modulares, a migração acontece automaticamente.

### Separação entre custos, rendas e benefícios

- **Custos fixos** armazena somente despesas recorrentes em `recurring`.
- **Configurações > Rendas** armazena salário, renda extra, freelance, aluguel recebido, comissão e outras rendas recorrentes em `incomeSources`.
- As rendas ativas geram lançamentos mensais de receita em `transactions`.
- **Vale-refeição, vale-alimentação e vale-combustível não são tratados como renda em dinheiro**; são cadastrados em `cards` como cartões/benefícios.
- Dados antigos de renda que estavam em `recurring` são migrados para `incomeSources` automaticamente.

### Diagnóstico

Em **Configurações > Conta e sincronização > Testar Firestore**, o aplicativo grava os módulos e relê diretamente do servidor, sem confiar apenas no cache do navegador.

## 4. Diretório de usuários por e-mail

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

## 5. Fluxo Família

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
- vínculo -> `declined`;
- o usuário não entra na família;
- a conta Google permanece normal e ativa.

O admin pode reenviar um convite posteriormente para um vínculo recusado.

## 6. Notificações

O convite familiar é entregue em tempo real via listener do Firestore quando o Stop Gastos está aberto.

Se o navegador já tiver permissão de notificações, o app também cria uma notificação local do navegador.

Para receber push com o aplicativo totalmente fechado, ainda é necessário:
- configurar a chave pública VAPID em `firebase-config.js`;
- usar um backend confiável, como Cloud Functions, para disparar FCM.

Nunca coloque service account, private key ou credencial administrativa no frontend.

## 7. Dados antigos

O aplicativo mantém uma tentativa de migração do antigo cofre AES-GCM caso a chave temporária da versão anterior ainda exista no mesmo navegador.

O cofre antigo não é apagado automaticamente.


## Mapa das telas para o Firestore

| Tela / recurso | Caminho principal |
| --- | --- |
| Lançamentos | `users/{uid}/data/transactions` |
| Família | `families/{familyId}`, `families/{familyId}/members/{uid}`, `familyRequests/{requestId}` e perfil do usuário |
| Contas | `users/{uid}/data/accounts` |
| Cartões e benefícios | `users/{uid}/data/cards`; inclui crédito, vale-refeição, vale-alimentação, vale-combustível e outros benefícios |
| Contas a pagar/receber | `users/{uid}/data/bills`; ao pagar, também altera `transactions` |
| Custos fixos | `users/{uid}/data/recurring`; somente despesas recorrentes; lançamentos automáticos também entram em `transactions` |
| Rendas recorrentes | `users/{uid}/data/incomeSources`; salário, renda extra, freelance e outras entradas mensais; lançamentos automáticos entram em `transactions` |
| Lista de compras pessoal | `users/{uid}/data/shoppingLists` e `shoppingActiveListId` |
| Lista de compras familiar | `families/{familyId}/shoppingLists/{listId}` e `items/{itemId}` |
| Orçamentos por categoria | `users/{uid}/data/budgets` |
| Limite mensal geral | `users/{uid}/data/settings` → `value.monthlyBudget` |
| Metas | `users/{uid}/data/goals` |
| Categorias personalizadas | `users/{uid}/data/categories` |
| Transferências | `users/{uid}/data/transfers` |
| Auditoria local do app | `users/{uid}/data/audit` |
| Calendário | não possui documento próprio; é calculado a partir de `transactions` e `bills` |
| Relatórios | não possui documento próprio; é calculado a partir dos módulos financeiros |
| Configurações | `users/{uid}/data/settings` |

O documento `users/{uid}/data/_meta` guarda versão do schema, horário e dispositivo da última sincronização.

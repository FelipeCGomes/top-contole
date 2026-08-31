# Stop Gastos

Aplicação web responsiva para gestão financeira pessoal e familiar, construída em HTML, CSS e JavaScript puro, hospedada no GitHub Pages e sincronizada com Firebase.

## Recursos

### Finanças pessoais
- Dashboard mensal com receitas, despesas, saldo, média diária e comparativos
- Score de saúde financeira e projeção de fluxo de caixa
- Receitas e despesas por categoria, conta, tags e forma de pagamento
- Contas e carteiras com saldo individual e consolidado
- Transferências entre contas
- Cartões de crédito, vale-refeição, vale-alimentação, vale-combustível e outros benefícios
- Cartões usam contraste automático conforme a cor escolhida, inclusive benefícios claros
- Compras parceladas com quantidade de parcelas, valor por parcela e projeção futura
- Contas a pagar e receber
- Custos fixos e assinaturas somente para despesas recorrentes
- Rendas recorrentes em Configurações: salário, renda extra, freelance, aluguel recebido, comissão e outras entradas
- Orçamentos mensais por categoria
- Categorias personalizadas
- Metas financeiras
- Calendário financeiro
- Relatórios, CSV e impressão/PDF
- Modo privacidade
- Tema claro/escuro
- PWA com cache offline

### Rendas recorrentes e benefícios
- **Custos fixos** aceita somente despesas recorrentes
- **Configurações > Rendas** centraliza salário, renda extra, freelance, aluguel recebido, comissão e outras entradas mensais
- Rendas ativas geram automaticamente lançamentos de receita no mês
- Rendas antigas cadastradas como recorrência são migradas automaticamente para `incomeSources`
- Vale-refeição, vale-alimentação e vale-combustível ficam em **Cartões**, com saldo/crédito disponível e consumo do mês
- Benefícios não entram como renda em dinheiro

### Conta Google e sincronização
- Login somente com Google pelo Firebase Authentication
- Sessão persistente após atualização da página
- Cloud Firestore como fonte principal dos dados
- Cache local por UID apenas para uso offline e recuperação
- Dados pessoais separados por módulos em `users/{uid}/data/*`
- Sincronização automática somente após alteração, com debounce de 10 segundos
- Apenas módulos alterados são enviados ao Firestore
- Nova alteração dentro dos 10 segundos reinicia o contador
- Reconexão só dispara envio quando existe alteração pendente
- Botão manual para sincronizar e confirmar diretamente no servidor
- Indicador Local / Sincronizando / Sincronizado / Offline

### Política de gravação
- Alterações atualizam a interface e o cache local imediatamente
- O Firestore recebe a alteração somente depois de 10 segundos sem novas mudanças
- Se nada mudou, nenhuma escrita é enviada
- O documento modular reduz escritas desnecessárias e evita concentrar toda a base em um único documento
- A leitura em tempo real recebe mudanças de outros dispositivos, mas não gera escrita automática

### Família
- Um usuário cria a família e assume o papel de **Administrador**
- O familiar precisa acessar o Stop Gastos pelo menos uma vez com a própria conta Google
- O administrador informa o e-mail usado no login Google
- O sistema localiza essa conta e cria um convite direcionado ao UID correto
- O membro recebe uma notificação em tempo real dentro do Stop Gastos
- O membro escolhe **Aceitar** ou **Recusar**
- Aceitando: o vínculo passa para **Ativo**
- Recusando: o vínculo familiar passa para **Recusado**
- O membro registra somente os próprios gastos
- O administrador visualiza o consolidado e os lançamentos dos membros ativos
- Membros comuns não podem ler os dados financeiros de outros membros
- O admin acompanha membros Ativos, Pendentes e Recusados
- Sino de notificações com badge no topo do aplicativo


## Lista de compras

- Múltiplas listas com nome e mercado/local opcional
- Listas pessoais para usuários sem família
- Listas compartilhadas em tempo real quando o usuário participa de uma família
- Todos os membros ativos podem incluir, editar e remover itens da lista compartilhada
- Estrutura colaborativa em `families/{familyId}/shoppingLists/{listId}/items/{itemId}`
- Catálogo suspenso com itens e apresentações comuns de supermercado
- Opção `Outro / inserir manualmente` para produtos fora do catálogo
- Cadastro de produto, quantidade e valor unitário
- Edição direta dos preços durante a compra
- Cálculo automático de valor total por linha
- Cards com produtos, quantidade de itens, valor médio por item precificado e valor total
- Salvamento local imediato nas listas pessoais e sincronização Firebase nas listas familiares
- Layout responsivo otimizado para uso no celular dentro do mercado
- Dashboard de comparação entre mercados/localidades
- Ranking por cesta comparável, usando apenas produtos com preço em todos os mercados comparados
- Comparação produto a produto com menor preço, maior preço e economia potencial
- Indicador de melhor mercado, economia versus o mais caro e quantidade de produtos comparáveis
- Simulação de compra inteligente, combinando o menor preço de cada produto
- Exclusão de lista compartilhada restrita ao criador ou administrador da família

## Experiência e conta

- Loader global com spinner e mensagens contextuais para autenticação, sincronização, Família e salvamentos importantes
- Tela **Sobre** integrada à aplicação
- Tela **Termos de Uso** integrada à aplicação
- Tela **Política de Privacidade** integrada à aplicação
- Exclusão definitiva da conta com confirmação digitando `EXCLUIR`; o Google só pede confirmação adicional quando a sessão não é recente
- Proprietários de família com outros vínculos precisam remover todos ou transferir a administração para um membro ativo, evitando famílias órfãs
- A exclusão procura remover estado financeiro, perfil, dispositivos, diretório de e-mail, vínculos familiares e autenticação Firebase

## Estrutura Firebase

- `userDirectory/{emailHash}`: diretório restrito para localizar uma conta por e-mail exato
- `users/{uid}/profile/main`: perfil e vínculo familiar
- `users/{uid}/data/_meta`: metadados da base individual
- `users/{uid}/data/{sectionId}`: módulos financeiros e configurações
- `users/{uid}/data/incomeSources`: fontes de renda recorrente
- `users/{uid}/state/main`: documento legado, usado somente como fallback/migração
- `users/{uid}/devices/{deviceId}`: dispositivos e notificações
- `families/{familyId}`: família
- `families/{familyId}/members/{uid}`: vínculo, papel e status
- `familyRequests/{requestId}`: convites direcionados

## Mapa de telas e Firestore

| Tela | Fonte persistida | Caminho principal |
| --- | --- | --- |
| Lançamentos | `transactions` | `users/{uid}/data/transactions` |
| Família | família, membros e convites | `families/{familyId}`, `families/{familyId}/members/{uid}`, `familyRequests/{requestId}` |
| Contas | `accounts` | `users/{uid}/data/accounts` |
| Cartões e benefícios | `cards` | `users/{uid}/data/cards` |
| Contas a pagar/receber | `bills` | `users/{uid}/data/bills` |
| Custos fixos | `recurring` e lançamentos gerados | `users/{uid}/data/recurring` e `users/{uid}/data/transactions` |
| Rendas recorrentes | `incomeSources` e receitas geradas | `users/{uid}/data/incomeSources` e `users/{uid}/data/transactions` |
| Lista de compras pessoal | `shoppingLists` | `users/{uid}/data/shoppingLists` |
| Lista de compras familiar | listas/itens compartilhados | `families/{familyId}/shoppingLists/{listId}` e `.../items/{itemId}` |
| Orçamentos | `budgets` | `users/{uid}/data/budgets` |
| Metas | `goals` | `users/{uid}/data/goals` |
| Calendário | visão derivada | usa `transactions` e `bills`; não cria documento próprio |
| Relatórios | visão derivada | calcula sobre os módulos financeiros; não cria documento próprio |
| Configurações | `settings` | `users/{uid}/data/settings` |
| Categorias personalizadas | `categories` | `users/{uid}/data/categories` |
| Transferências | `transfers` | `users/{uid}/data/transfers` |

Nos documentos modulares, o conteúdo do módulo fica no campo `value`. Exemplo: o limite mensal está em `users/{uid}/data/settings -> value.monthlyBudget`.

## Estados do vínculo familiar

- `pending`: convite enviado e aguardando resposta
- `active`: convite aceito
- `declined`: convite recusado ou vínculo desativado

O status recusado é referente ao **vínculo com a família**. Ele não desativa a conta Google/Firebase do usuário.

## Segurança

A autenticação é feita pelo Google/Firebase Authentication.

As regras do Cloud Firestore garantem que:
- cada usuário grava somente o próprio estado financeiro;
- somente o administrador da família pode ler os estados financeiros de outros membros ativos;
- o diretório de e-mails não pode ser listado;
- a busca de usuário é feita por consulta direta ao hash do e-mail informado;
- somente o destinatário pode aceitar ou recusar o próprio convite;
- demais caminhos são bloqueados.

O modelo anterior com PIN/AES-GCM foi removido do fluxo normal. O código mantém apenas uma rotina de migração de melhor esforço para dados antigos que ainda possam existir no navegador.

## Interface

A interface atual possui:
- navegação com ícones SVG consistentes;
- animações e transições com suporte a `prefers-reduced-motion`;
- sidebar desktop e menu móvel;
- barra inferior otimizada para celular com acesso direto à Família;
- cards e grids responsivos;
- painel familiar redesenhado;
- notificações de convite responsivas;
- melhorias em tabelas e rolagem mobile.

## GitHub Pages

O projeto inclui workflow em `.github/workflows/pages.yml` para publicação automática no GitHub Pages.

## Arquivos principais

- `index.html`: interface e ícones SVG
- `styles.css`: layout, temas, animações e responsividade
- `app.js`: lógica financeira, cache, família e interface
- `firebase-config.js`: configuração pública do Firebase
- `firebase-sync.js`: Authentication, Firestore, família e notificações
- `firestore.rules`: regras de segurança
- `FIREBASE_SETUP.md`: configuração do Firebase Console
- `service-worker.js`: PWA, cache e preparação para FCM
- `manifest.webmanifest`: manifesto PWA

### Parcelamento
- Lançamentos em cartão de crédito aceitam compra à vista ou parcelada
- Ao editar uma compra, alterar de 1x para 3x, 5x etc. recria o grupo completo de parcelas
- Reduzir o parcelamento também remove parcelas excedentes
- Cada parcela é posicionada na fatura correta conforme fechamento e vencimento do cartão
- Custos fixos pagos com cartão de crédito também possuem quantidade de parcelas
- Um custo fixo parcelado cria uma **série única** ancorada no mês da compra; ele não cria uma nova série parcelada a cada mês
- Lançamentos antigos vinculados por `sourceRecurringId` continuam atualizando o custo fixo mesmo sem o campo legado `sourceType`
- As parcelas recriadas preservam o vínculo com a recorrência de origem
- Excluir uma compra parcelada remove o grupo completo de parcelas


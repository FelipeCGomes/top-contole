# Stop Gastos

Aplicação web responsiva para gestão financeira pessoal e familiar, construída em HTML, CSS e JavaScript puro, hospedada no GitHub Pages e sincronizada com Firebase.

## Recursos

### Finanças pessoais
- Dashboard mensal com receitas, despesas, saldo, média diária e comparativos
- Score de saúde financeira e projeção de fluxo de caixa
- Receitas e despesas por categoria, conta, tags e forma de pagamento
- Contas e carteiras com saldo individual e consolidado
- Transferências entre contas
- Cartões de crédito, limites, fechamento, vencimento e faturas
- Compras parceladas com quantidade de parcelas, valor por parcela e projeção futura
- Contas a pagar e receber
- Custos fixos, receitas recorrentes e assinaturas
- Orçamentos mensais por categoria
- Categorias personalizadas
- Metas financeiras
- Calendário financeiro
- Relatórios, CSV e impressão/PDF
- Modo privacidade
- Tema claro/escuro
- PWA com cache offline

### Conta Google e sincronização
- Login somente com Google pelo Firebase Authentication
- Sessão persistente após atualização da página
- Cache local separado pelo UID Google
- Cloud Firestore como fonte sincronizada entre computadores
- Sincronização automática quando a conexão retorna
- Indicador Local / Sincronizando / Sincronizado / Offline

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
- Cadastro de produto, quantidade e valor unitário
- Edição direta dos preços durante a compra
- Cálculo automático de valor total por linha
- Cards com produtos, quantidade de itens, valor médio por item precificado e valor total
- Salvamento local imediato e sincronização automática com Firebase
- Layout responsivo otimizado para uso no celular dentro do mercado

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
- `users/{uid}/state/main`: estado financeiro individual
- `users/{uid}/devices/{deviceId}`: dispositivos e notificações
- `families/{familyId}`: família
- `families/{familyId}/members/{uid}`: vínculo, papel e status
- `familyRequests/{requestId}`: convites direcionados

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

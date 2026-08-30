# Stop Gastos

Aplicação web responsiva para gestão financeira pessoal, criada em HTML, CSS e JavaScript puro.

## Recursos

### Stop Gastos 2.0
- Dashboard diário, mensal e anual com alertas inteligentes
- Score de saúde financeira e projeção de fluxo de caixa para 6 meses
- Receitas e despesas por categoria, conta, tags e forma de pagamento
- Contas/carteiras com saldo individual e consolidado
- Transferências entre contas sem duplicar receitas ou despesas
- Cartões de crédito com limite, fechamento e vencimento
- Fatura mensal por cartão
- Compras parceladas com valor total, quantidade de parcelas, valor por parcela e identificação 1/N, 2/N...
- Projeção automática das parcelas futuras
- Contas a pagar e receber com status pendente, vencido e pago
- Ao marcar uma conta como paga, o lançamento financeiro é criado automaticamente
- Custos fixos, receitas recorrentes e assinaturas com custo anual
- Orçamentos mensais por categoria
- Categorias personalizáveis com ícone, cor e grupo financeiro
- Metas financeiras
- Calendário financeiro com lançamentos e vencimentos
- Relatórios, indicadores, CSV e impressão/PDF
- Busca por descrição, categoria, observação e tags
- Modo privacidade para ocultar valores na tela
- Tema claro/escuro
- PWA instalável e cache offline
- Persistência local criptografada com Web Crypto (AES-GCM)
- Exportação e importação de backup JSON criptografado
- Migração automática dos cofres da versão anterior
- Dados de demonstração opcionais
- Layout moderno e responsivo para desktop e celular

## Segurança
O Stop Gastos é uma aplicação estática. Nenhuma credencial do GitHub é incluída no navegador. Os dados financeiros são criptografados localmente antes de serem gravados no armazenamento do navegador.

> Atenção: não esqueça o PIN criado no primeiro acesso. Sem ele, não há como descriptografar o cofre local nem os backups exportados.

## GitHub Pages
O projeto inclui workflow em `.github/workflows/pages.yml` para publicação no GitHub Pages.

## Estrutura
- `index.html`: interface
- `styles.css`: layout, tema, responsividade e animações
- `app.js`: regras financeiras, dashboard, gráficos, cofre criptografado e PWA
- `defaults.json`: categorias e preferências iniciais
- `manifest.webmanifest`: manifesto PWA
- `service-worker.js`: cache offline
- `favicon.svg`: ícone do app

## Privacidade
Os dados permanecem no dispositivo do usuário. O repositório contém apenas o código da aplicação, não os seus lançamentos pessoais.

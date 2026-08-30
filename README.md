# Stop Gastos

Aplicação web responsiva para gestão financeira pessoal, criada em HTML, CSS e JavaScript puro.

## Recursos
- Dashboard com visão diária, mensal e anual
- Receitas e despesas por categoria
- Custos fixos/recorrentes
- Orçamentos mensais por categoria
- Metas financeiras
- Calendário financeiro
- Relatórios e indicadores
- Busca, filtros, edição e exclusão de lançamentos
- Tema claro/escuro
- PWA instalável
- Persistência local criptografada com Web Crypto (AES-GCM)
- Exportação e importação de backup JSON criptografado
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

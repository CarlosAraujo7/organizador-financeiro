# Livro-Caixa — organização financeira com assistente de IA

Controle financeiro pessoal que roda inteiro no navegador (computador ou celular) e tem um **assistente com IA (Gemini)**: você conta o gasto por texto, voz ou foto de comprovante, e ele monta os lançamentos para você só confirmar. Também responde perguntas como "quanto gastei com Uber?" ou "o que vence esta semana?".

Não há servidor: os dados ficam no navegador de quem usa e o assistente fala direto com o Google usando a chave de cada pessoa.

## O que tem

- **Painel**: saldo do mês, vencimentos dos próximos 7 dias, gastos por etiqueta, renda × gastos, extrato.
- **Lançamentos**: gastos avulsos, fixos, assinaturas, renda, cartão parcelado e empréstimos.
- **Casa**: contas divididas entre moradores e quanto cada um já mandou.
- **Assistente**: texto, voz (microfone), foto de comprovante ou print de extrato → cartões com **Salvar / Editar / Descartar**. O assistente nunca grava sozinho, avisa quando um lançamento parece duplicado ou quando a conta já está cadastrada como recorrente, e dá para **Desfazer** depois de salvar.
- Funciona no celular (instala como app, abre sem internet) e tem tema claro/escuro.

## Usar no seu computador

1. Dê dois cliques em **`iniciar.bat`** (precisa do Node.js). O navegador abre em `http://localhost:8766`.
2. Para ativar o assistente: **Assistente** (ou Ajustes) → cole sua chave gratuita de [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Testar e ativar**.

## Trazer os dados do Livro-Caixa antigo

O arquivo `Livro-Caixa.html` (versão antiga) guarda os dados no navegador onde foi aberto, e um endereço novo (`localhost` ou `github.io`) começa vazio. Para levar tudo:

1. Abra o `Livro-Caixa.html` antigo → **Ajustes → Exportar backup (.json)**.
2. Abra o app novo → tela inicial ou **Ajustes → Importar backup** → escolha o `.json`.

O backup do app novo tem o mesmo formato, então vale para ir e voltar. A chave do Gemini **nunca** entra no backup.

## Publicar no GitHub Pages

O app é 100% estático. O que o Pages publica é a pasta **`docs/`**.

1. No GitHub: **New repository**
   - *Repository name*: `organizacao-financeira` (o GitHub não aceita espaços nem acentos no nome).
   - *Description*: `Livro-Caixa — organização financeira com assistente de IA`
   - **Public** (o Pages gratuito só publica repositório público) e **sem** marcar "Add a README".
2. O repositório git e o primeiro commit já estão feitos nesta pasta, no branch `main`. Ligue-o ao GitHub (troque `SEU-USUARIO`):

```bash
git remote add origin https://github.com/SEU-USUARIO/organizacao-financeira.git
git push -u origin main
```

3. No repositório: **Settings → Pages → Build and deployment**. Em *Source* escolha **Deploy from a branch**, *Branch* **main** e pasta **/docs** → **Save**.
4. Em cerca de 1 minuto o site fica em `https://SEU-USUARIO.github.io/organizacao-financeira/`.
5. Para atualizar depois: `git add .`, `git commit`, `git push`. O app abre sempre a versão mais nova quando há internet.

### Usar no celular

1. Abra o link do GitHub Pages no celular.
2. **Android (Chrome)**: menu ⋮ → *Instalar app*. **iPhone (Safari)**: Compartilhar → *Adicionar à Tela de Início*.
3. Em **Ajustes**, cole a chave do Gemini **no celular também** (cada aparelho guarda a sua).
4. No assistente, toque no microfone e fale ("gastei 30 no Uber"), ou no ícone de imagem para mandar a foto de um comprovante.

> **Celular e computador não sincronizam sozinhos.** Os dados de cada aparelho ficam no próprio navegador. Para levar de um para o outro: **Ajustes → Exportar / Compartilhar backup** num, **Importar backup** no outro (importar substitui o que está lá). Se usar mais o celular, trate-o como aparelho principal e exporte um backup de vez em quando.

## Cuidados

- **Nunca coloque a chave no repositório.** O app não tem chave em arquivo nenhum: ela é colada na tela e fica no `localStorage` do navegador, separada dos dados financeiros. O `.gitignore` também deixa de fora `.env`, `*.key` e os backups `.json`.
- O arquivo antigo `Livro-Caixa.html` tem os seus dados de exemplo dentro, por isso está no `.gitignore` e **não vai para o GitHub**. Não o copie para a pasta `docs/`.
- O repositório é público, então o código fica visível, mas **seus lançamentos não estão nele**: ficam só no navegador. Quem abrir o link vê um app vazio.
- O `localStorage` é compartilhado por todo o endereço `SEU-USUARIO.github.io`. Se você hospedar outras páginas no mesmo usuário (como o app de inglês), o código delas conseguiria ler a chave e os dados deste app no mesmo navegador. Só publique ali páginas suas, ou use um usuário/organização só para isso.
- Dá para restringir a chave por site no Google Cloud (referrer `https://SEU-USUARIO.github.io/*`) e para apagar/gerar outra a qualquer momento em aistudio.google.com/apikey.

## Privacidade do assistente

O que você escreve (e as fotos que envia) vai direto do navegador para a API do Gemini. Para responder perguntas, o assistente envia também um resumo dos seus números (totais do mês, lista de lançamentos filtrada) e os nomes que você cadastrou. No plano **gratuito** da API, o Google pode usar esse conteúdo para melhorar os produtos dele; no plano pago, não. Confira os termos da sua chave se isso importa para você. Sem chave, nada sai do aparelho.

## Se der erro

| Mensagem | O que fazer |
|---|---|
| "O Google não aceitou a chave" | Chave errada ou apagada. Gere outra em aistudio.google.com/apikey e cole em Ajustes. |
| "Bati no limite gratuito do Gemini" | A cota por minuto/dia acabou. Espere um pouco; o app já tenta outros modelos sozinho. Também dá para trocar o modelo em Ajustes. |
| "O Gemini está sobrecarregado" | Erro temporário do Google. Toque em *Tentar de novo*. |
| Microfone não funciona | Libere o microfone para o site nas permissões do navegador (cadeado na barra de endereço). A voz usa o reconhecimento do próprio Chrome/Android; no Firefox não existe. |
| "Não consegui salvar neste navegador" | O armazenamento está cheio ou bloqueado (aba anônima). Exporte um backup. |

## Onde mexer

| Arquivo | O que controla |
|---|---|
| `docs/js/assistant.js` | **Assistente**: prompt, ferramentas do Gemini, cartões de confirmação, voz, foto |
| `docs/js/gemini.js` | Chamada à API, modelos disponíveis, erros em português |
| `docs/js/store.js` | Dados, salvamento, backup, cálculos do mês e vencimentos |
| `docs/js/defs.js` | Etiquetas, emojis e campos de cada tipo de lançamento |
| `docs/js/views.js` | Telas: Painel, Lançamentos, Casa, Ajustes |
| `docs/js/modal.js`, `ui.js`, `charts.js` | Formulário, peças de interface, gráficos |
| `docs/js/app.js` | Navegação (`#/painel`, `#/assistente`...) e botões |
| `docs/styles.css` | Cores (tokens no topo), tema escuro, layout de celular e de computador |
| `docs/sw.js`, `docs/manifest.webmanifest` | Instalar como app e abrir sem internet |
| `server.js`, `iniciar.bat` | Servidor local (não são usados no GitHub Pages) |

As cores de Renda (azul) e Gastos (vermelho) e as 8 cores das etiquetas vêm de uma paleta validada para daltonismo; verde × vermelho foi testado e reprovou, por isso renda não é verde.

/* Definições fixas: etiquetas sugeridas, emojis e os formulários de cada tipo de lançamento. */
import { currentMonthStr, todayStr, norm } from './util.js';

export const CATEGORIES = ['Trabalho','Bolsa/Estágio','Extra','Moradia','Aluguel','Internet','Luz','Água','Condomínio','Contas e utilidades','Alimentação','iFood','99 Food','Uber','Transporte','Saúde','Educação','Lazer','Assinaturas','Compras','Cuidado pessoal','Corte de cabelo','Outros'];

export const DEFAULT_QUICK_TAGS = ['Alimentação','Transporte','Compras','Lazer','Saúde','Contas e utilidades','Outros'];

const EMOJI_RULES = [
  [/trabalho|salario|bolsa|estagio|freela/, '💼'],
  [/extra/, '✨'],
  [/aluguel|moradia|condominio|casa/, '🏠'],
  [/internet|wifi/, '📶'],
  [/luz|energia/, '💡'],
  [/agua/, '💧'],
  [/contas|utilidade|boleto/, '🧾'],
  [/ifood|99 ?food|delivery/, '🛵'],
  [/uber|taxi|99/, '🚗'],
  [/transporte|onibus|metro|gasolina|combustivel/, '🚌'],
  [/aliment|mercado|padaria|restaurante|lanche|comida/, '🍽️'],
  [/saude|farmacia|medic|plano/, '🩺'],
  [/educa|curso|escola|livro/, '🎓'],
  [/lazer|cinema|viagem|bar|festa/, '🎉'],
  [/assinatura|streaming|netflix|spotify/, '🔁'],
  [/compra|roupa|perfume|eletron/, '🛍️'],
  [/cabelo|cuidado|beleza/, '✂️'],
  [/emprestimo|financiamento/, '🏦'],
  [/cartao|fatura/, '💳'],
];
export function tagEmoji(tag) {
  const t = norm(tag || 'outros');
  for (const [re, e] of EMOJI_RULES) if (re.test(t)) return e;
  return '🏷️';
}

export const COLLECTIONS = ['income','subscriptions','fixedExpenses','variableExpenses','loans','cardInstallments','sharedExpenses','contributions'];

/** Abas da tela "Lançamentos" (ordem de exibição) */
export const LAUNCH_TABS = [
  { id: 'variaveis', label: 'Gastos', entity: 'variableExpenses' },
  { id: 'fixos', label: 'Fixos', entity: 'fixedExpenses' },
  { id: 'assinaturas', label: 'Assinaturas', entity: 'subscriptions' },
  { id: 'renda', label: 'Renda', entity: 'income' },
  { id: 'cartao', label: 'Cartão', entity: 'cardInstallments' },
  { id: 'emprestimos', label: 'Empréstimos', entity: 'loans' },
];

const END_LABEL = 'Termina em (opcional — esse mês já não conta)';

export const ENTITY_DEFS = {
  income: { title:'Renda', addLabel:'Nova renda', collection:'income',
    empty:{ title:'Nenhuma renda cadastrada', text:'Cadastre salário, bolsa, freelas ou qualquer entrada de dinheiro.' },
    fields:[
      {key:'description', label:'Descrição', type:'text', ph:'Ex.: Salário, freelance, bolsa...'},
      {key:'value', label:'Valor (R$)', type:'money'},
      {key:'category', label:'Etiqueta', type:'tag', def:'Trabalho'},
      {key:'day', label:'Dia do recebimento', type:'day', def:5},
      {key:'startMonth', label:'A partir de', type:'month', def:()=>currentMonthStr()},
      {key:'recurring', label:'Recebo todo mês (repete)', type:'checkbox', def:true},
      {key:'endMonth', label:END_LABEL, type:'month', optional:true},
      {key:'notes', label:'Notas', type:'textarea', optional:true},
    ]},
  subscriptions: { title:'Assinaturas', addLabel:'Nova assinatura', collection:'subscriptions',
    empty:{ title:'Nenhuma assinatura cadastrada', text:'Cadastre streaming, nuvem, apps e outros serviços cobrados todo mês.' },
    fields:[
      {key:'name', label:'Nome do serviço', type:'text', ph:'Ex.: Netflix, Spotify...'},
      {key:'value', label:'Valor mensal (R$)', type:'money'},
      {key:'category', label:'Etiqueta', type:'tag', def:'Assinaturas'},
      {key:'billingDay', label:'Dia da cobrança', type:'day', def:1},
      {key:'startMonth', label:'Assinante desde', type:'month', def:()=>currentMonthStr()},
      {key:'endMonth', label:'Cancelada em (opcional)', type:'month', optional:true},
      {key:'notes', label:'Notas', type:'textarea', optional:true},
    ]},
  fixedExpenses: { title:'Gastos fixos', addLabel:'Novo gasto fixo', collection:'fixedExpenses',
    empty:{ title:'Nenhum gasto fixo cadastrado', text:'Cadastre contas de valor estável: academia, plano de saúde, mensalidades...' },
    fields:[
      {key:'name', label:'Descrição', type:'text', ph:'Ex.: Academia, plano de saúde...'},
      {key:'value', label:'Valor mensal (R$)', type:'money'},
      {key:'category', label:'Etiqueta', type:'tag', def:'Outros'},
      {key:'day', label:'Dia do vencimento', type:'day', def:10},
      {key:'startMonth', label:'A partir de', type:'month', def:()=>currentMonthStr()},
      {key:'endMonth', label:END_LABEL, type:'month', optional:true},
      {key:'notes', label:'Notas', type:'textarea', optional:true},
    ]},
  variableExpenses: { title:'Gastos', addLabel:'Novo gasto', collection:'variableExpenses',
    empty:{ title:'Nenhum gasto neste mês', text:'Registre as compras do dia a dia: mercado, restaurante, farmácia... ou conte pro assistente.' },
    fields:[
      {key:'description', label:'Descrição', type:'text', ph:'Ex.: Mercado, restaurante...'},
      {key:'value', label:'Valor (R$)', type:'money'},
      {key:'category', label:'Etiqueta', type:'tag', def:'Outros'},
      {key:'date', label:'Data', type:'date', def:()=>todayStr()},
      {key:'notes', label:'Notas', type:'textarea', optional:true},
    ]},
  loans: { title:'Empréstimos', addLabel:'Novo empréstimo', collection:'loans',
    empty:{ title:'Nenhum empréstimo cadastrado', text:'Cadastre um empréstimo para acompanhar o progresso das parcelas.' },
    fields:[
      {key:'name', label:'Descrição', type:'text', ph:'Ex.: Empréstimo consignado, financiamento...'},
      {key:'installmentValue', label:'Valor da parcela (R$)', type:'money'},
      {key:'installmentsCount', label:'Total de parcelas', type:'int', def:12},
      {key:'day', label:'Dia do vencimento', type:'day', def:10},
      {key:'startMonth', label:'1ª parcela em', type:'month', def:()=>currentMonthStr()},
      {key:'category', label:'Etiqueta', type:'tag', def:'Outros'},
      {key:'notes', label:'Notas', type:'textarea', optional:true},
    ]},
  cardInstallments: { title:'Cartão de crédito', addLabel:'Nova compra parcelada', collection:'cardInstallments',
    empty:{ title:'Nenhuma parcela cadastrada', text:'Cadastre compras parceladas no cartão para ver quanto falta pagar.' },
    fields:[
      {key:'description', label:'Descrição da compra', type:'text', ph:'Ex.: Notebook, viagem...'},
      {key:'cardName', label:'Cartão', type:'text', ph:'Ex.: Nubank, Inter...', optional:true},
      {key:'installmentValue', label:'Valor da parcela (R$)', type:'money'},
      {key:'installmentsCount', label:'Total de parcelas', type:'int', def:10},
      {key:'day', label:'Dia do vencimento', type:'day', def:10},
      {key:'startMonth', label:'1ª parcela em', type:'month', def:()=>currentMonthStr()},
      {key:'category', label:'Etiqueta', type:'tag', def:'Compras'},
      {key:'notes', label:'Notas', type:'textarea', optional:true},
    ]},
  sharedExpenses: { title:'Contas da casa', addLabel:'Nova conta dividida', collection:'sharedExpenses',
    empty:{ title:'Nenhuma conta dividida cadastrada', text:'Cadastre contas rateadas entre os moradores: aluguel, internet, gás...' },
    fields:[
      {key:'name', label:'Descrição', type:'text', ph:'Ex.: Aluguel, internet, gás...'},
      {key:'value', label:'Valor total (R$)', type:'money'},
      {key:'category', label:'Etiqueta', type:'tag', def:'Moradia'},
      {key:'splitMePct', label:'Sua parte (%)', type:'percent', def:34},
      {key:'split2Pct', label:'Parte de {p2} (%)', type:'percent', def:33},
      {key:'split3Pct', label:'Parte de {p3} (%)', type:'percent', def:33},
      {key:'day', label:'Dia do vencimento', type:'day', def:10},
      {key:'startMonth', label:'A partir de', type:'month', def:()=>currentMonthStr()},
      {key:'recurring', label:'Conta mensal (repete)', type:'checkbox', def:true},
      {key:'endMonth', label:END_LABEL, type:'month', optional:true},
      {key:'notes', label:'Notas', type:'textarea', optional:true},
    ]},
  contributions: { title:'Contribuições recebidas', addLabel:'Registrar valor recebido', collection:'contributions',
    empty:{ title:'Nenhum valor registrado', text:'Registre o que cada morador mandou para cobrir a parte dele nas contas.' },
    fields:[
      {key:'person', label:'Quem enviou', type:'person'},
      {key:'value', label:'Valor (R$)', type:'money'},
      {key:'type', label:'Tipo', type:'select', options:['Mensal','Extra'], def:'Mensal'},
      {key:'date', label:'Data', type:'date', def:()=>todayStr()},
      {key:'note', label:'Nota (opcional)', type:'text', optional:true},
    ]},
};

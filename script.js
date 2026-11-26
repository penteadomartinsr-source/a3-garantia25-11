/* =====================================================================
   script.js — Sistema de Controle de Tarefas
   ---------------------------------------------------------------------
   Organização do arquivo:
     1. Constantes
     2. Funções PURAS de validação (testáveis isoladamente)
     3. Funções de persistência (LocalStorage)
     4. Funções de regra de negócio (CRUD sobre a lista de tarefas)
     5. Funções de interface (DOM)
     6. Inicialização e eventos
     7. Exportação para testes unitários em Node.js (opcional)
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. CONSTANTES
   --------------------------------------------------------------------- */
const CHAVE_STORAGE = 'tarefas_qa';
const STATUS_VALIDOS = ['Pendente', 'Em andamento', 'Concluída'];
const STATUS_PADRAO = 'Pendente';
const TAMANHO_MINIMO_TITULO = 3;

/* ---------------------------------------------------------------------
   2. FUNÇÕES PURAS DE VALIDAÇÃO
   Não acessam DOM nem LocalStorage: recebem dados e devolvem resultado.
   Isso facilita testes unitários e automação.
   --------------------------------------------------------------------- */

/**
 * Verifica se um valor é uma string não vazia (ignorando espaços).
 * @param {*} valor
 * @returns {boolean}
 */
function textoPreenchido(valor) {
  return typeof valor === 'string' && valor.trim().length > 0;
}

/**
 * Valida o título: obrigatório, não pode ser só espaços, mínimo 3 caracteres
 * (contados após remover espaços nas extremidades).
 * @param {*} titulo
 * @returns {string[]} lista de mensagens de erro (vazia se válido)
 */
function validarTitulo(titulo) {
  if (!textoPreenchido(titulo)) {
    return ['O título é obrigatório e não pode conter apenas espaços.'];
  }
  if (titulo.trim().length < TAMANHO_MINIMO_TITULO) {
    return [`O título deve ter no mínimo ${TAMANHO_MINIMO_TITULO} caracteres.`];
  }
  return [];
}

/**
 * Valida o responsável: obrigatório.
 * @param {*} responsavel
 * @returns {string[]}
 */
function validarResponsavel(responsavel) {
  if (!textoPreenchido(responsavel)) {
    return ['O responsável é obrigatório.'];
  }
  return [];
}

/**
 * Verifica se a string está no formato AAAA-MM-DD e representa uma data real
 * (ex.: rejeita 2026-02-30 e 2026-13-01).
 * @param {*} texto
 * @returns {boolean}
 */
function dataValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return false;
  }
  const [ano, mes, dia] = texto.split('-').map(Number);
  if (ano < 1900 || ano > 2100) return false;

  // Usa UTC para evitar problemas de fuso horário
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}

/**
 * Valida a data de vencimento: obrigatória e em formato de data válido.
 * @param {*} vencimento
 * @returns {string[]}
 */
function validarVencimento(vencimento) {
  if (!textoPreenchido(vencimento)) {
    return ['A data de vencimento é obrigatória.'];
  }
  if (!dataValida(vencimento)) {
    return ['A data de vencimento é inválida. Use uma data real (AAAA-MM-DD).'];
  }
  return [];
}

/**
 * Valida o status: deve ser um dos valores permitidos.
 * @param {*} status
 * @returns {string[]}
 */
function validarStatus(status) {
  if (!STATUS_VALIDOS.includes(status)) {
    return ['O status deve ser "Pendente", "Em andamento" ou "Concluída".'];
  }
  return [];
}

/**
 * Função principal de validação de uma tarefa.
 * @param {{titulo:string, descricao?:string, responsavel:string,
 *          vencimento:string, status:string}} dados
 * @returns {{valido:boolean, mensagens:string[]}}
 */
function validarCamposTarefa(dados) {
  // Protege contra entrada nula/indefinida
  const d = dados || {};

  const mensagens = [
    ...validarTitulo(d.titulo),
    ...validarResponsavel(d.responsavel),
    ...validarVencimento(d.vencimento),
    ...validarStatus(d.status)
  ];

  return { valido: mensagens.length === 0, mensagens };
}

/**
 * Indica se uma tarefa está vencida (data anterior à de referência e
 * status diferente de "Concluída"). A data de referência é um parâmetro
 * para manter a função pura e fácil de testar.
 * @param {{vencimento:string, status:string}} tarefa
 * @param {string} hojeISO data de referência no formato AAAA-MM-DD
 * @returns {boolean}
 */
function estaVencida(tarefa, hojeISO) {
  if (!tarefa || tarefa.status === 'Concluída') return false;
  if (!dataValida(tarefa.vencimento) || !dataValida(hojeISO)) return false;
  // Strings ISO (AAAA-MM-DD) podem ser comparadas lexicograficamente
  return tarefa.vencimento < hojeISO;
}

/**
 * Converte AAAA-MM-DD em DD/MM/AAAA sem usar Date (evita erro de fuso).
 * @param {string} iso
 * @returns {string}
 */
function formatarData(iso) {
  if (!dataValida(iso)) return iso || '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Retorna a data local de hoje no formato AAAA-MM-DD. */
function hojeISO() {
  const agora = new Date();
  const mm = String(agora.getMonth() + 1).padStart(2, '0');
  const dd = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mm}-${dd}`;
}

/* ---------------------------------------------------------------------
   3. PERSISTÊNCIA (LocalStorage)
   --------------------------------------------------------------------- */

/**
 * Lê as tarefas do LocalStorage. Se o conteúdo estiver corrompido
 * ou ausente, devolve uma lista vazia.
 * @returns {Array<Object>}
 */
function carregarTarefas() {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    if (!bruto) return [];
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista : [];
  } catch (erro) {
    console.error('Erro ao ler tarefas do LocalStorage:', erro);
    return [];
  }
}

/**
 * Grava a lista completa de tarefas no LocalStorage.
 * @param {Array<Object>} tarefas
 */
function salvarTarefas(tarefas) {
  localStorage.setItem(CHAVE_STORAGE, JSON.stringify(tarefas));
}

/* ---------------------------------------------------------------------
   4. REGRAS DE NEGÓCIO (CRUD)
   Cada função lê, altera e grava; retornam resultado para facilitar testes.
   --------------------------------------------------------------------- */

/** Gera um ID único simples. */
function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Normaliza os dados (remove espaços extras) antes de gravar.
 * @param {Object} dados
 * @returns {Object}
 */
function normalizarDados(dados) {
  return {
    titulo: (dados.titulo || '').trim(),
    descricao: (dados.descricao || '').trim(),
    responsavel: (dados.responsavel || '').trim(),
    vencimento: dados.vencimento,
    status: dados.status || STATUS_PADRAO
  };
}

/**
 * Cria uma nova tarefa (após validar).
 * @returns {{sucesso:boolean, mensagens:string[], tarefa?:Object}}
 */
function criarTarefa(dados) {
  const validacao = validarCamposTarefa(dados);
  if (!validacao.valido) {
    return { sucesso: false, mensagens: validacao.mensagens };
  }
  const tarefas = carregarTarefas();
  const tarefa = { id: gerarId(), ...normalizarDados(dados) };
  tarefas.push(tarefa);
  salvarTarefas(tarefas);
  return { sucesso: true, mensagens: [], tarefa };
}

/**
 * Atualiza uma tarefa existente (após validar).
 * @returns {{sucesso:boolean, mensagens:string[], tarefa?:Object}}
 */
function atualizarTarefa(id, dados) {
  const validacao = validarCamposTarefa(dados);
  if (!validacao.valido) {
    return { sucesso: false, mensagens: validacao.mensagens };
  }
  const tarefas = carregarTarefas();
  const indice = tarefas.findIndex(t => t.id === id);
  if (indice === -1) {
    return { sucesso: false, mensagens: ['Tarefa não encontrada.'] };
  }
  tarefas[indice] = { id, ...normalizarDados(dados) };
  salvarTarefas(tarefas);
  return { sucesso: true, mensagens: [], tarefa: tarefas[indice] };
}

/**
 * Exclui uma tarefa pelo ID.
 * @returns {boolean} true se removeu alguma tarefa
 */
function excluirTarefa(id) {
  const tarefas = carregarTarefas();
  const restantes = tarefas.filter(t => t.id !== id);
  if (restantes.length === tarefas.length) return false;
  salvarTarefas(restantes);
  return true;
}

/**
 * Altera somente o status de uma tarefa.
 * @returns {boolean} true se alterou
 */
function alterarStatusTarefa(id, novoStatus) {
  if (validarStatus(novoStatus).length > 0) return false;
  const tarefas = carregarTarefas();
  const tarefa = tarefas.find(t => t.id === id);
  if (!tarefa) return false;
  tarefa.status = novoStatus;
  salvarTarefas(tarefas);
  return true;
}

/* ---------------------------------------------------------------------
   5. INTERFACE (DOM)
   Todo o código abaixo só roda no navegador.
   --------------------------------------------------------------------- */

// Referências aos elementos (preenchidas na inicialização)
let elForm, elId, elTitulo, elDescricao, elResponsavel, elVencimento, elStatus;
let elMensagens, elBtnSalvar, elBtnCancelar, elTabela, elCorpo, elVazio, elContador;

/** Exibe mensagens de erro (lista, em vermelho). */
function mostrarErros(mensagens) {
  elMensagens.className = 'mensagens erro';
  elMensagens.innerHTML = '';
  const ul = document.createElement('ul');
  mensagens.forEach(msg => {
    const li = document.createElement('li');
    li.textContent = msg; // textContent evita injeção de HTML
    ul.appendChild(li);
  });
  elMensagens.appendChild(ul);
}

/** Exibe mensagem de sucesso (em verde). */
function mostrarSucesso(texto) {
  elMensagens.className = 'mensagens sucesso';
  elMensagens.textContent = texto;
}

/** Limpa a área de mensagens e marcações de campos inválidos. */
function limparMensagens() {
  elMensagens.className = 'mensagens';
  elMensagens.textContent = '';
  [elTitulo, elResponsavel, elVencimento, elStatus].forEach(c => c.classList.remove('invalido'));
}

/** Marca visualmente os campos com problema. */
function marcarCamposInvalidos(dados) {
  if (validarTitulo(dados.titulo).length) elTitulo.classList.add('invalido');
  if (validarResponsavel(dados.responsavel).length) elResponsavel.classList.add('invalido');
  if (validarVencimento(dados.vencimento).length) elVencimento.classList.add('invalido');
  if (validarStatus(dados.status).length) elStatus.classList.add('invalido');
}

/** Lê os valores atuais do formulário. */
function lerFormulario() {
  return {
    titulo: elTitulo.value,
    descricao: elDescricao.value,
    responsavel: elResponsavel.value,
    vencimento: elVencimento.value,
    status: elStatus.value
  };
}

/** Restaura o formulário ao estado de cadastro. */
function resetarFormulario() {
  elForm.reset();
  elId.value = '';
  elStatus.value = STATUS_PADRAO;
  elBtnSalvar.textContent = 'Salvar Tarefa';
  elBtnCancelar.hidden = true;
  document.getElementById('titulo-form').textContent = 'Cadastrar Tarefa';
}

/** Cria uma célula <td> com texto simples. */
function criarCelula(texto, classe) {
  const td = document.createElement('td');
  td.textContent = texto;
  if (classe) td.className = classe;
  return td;
}

/** Cria o <select> de status exibido em cada linha da tabela. */
function criarSelectStatus(tarefa) {
  const select = document.createElement('select');
  select.className = 'select-status';
  select.setAttribute('data-testid', 'status-' + tarefa.id);
  select.setAttribute('aria-label', 'Alterar status da tarefa ' + tarefa.titulo);
  STATUS_VALIDOS.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    if (s === tarefa.status) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    alterarStatusTarefa(tarefa.id, select.value);
    renderizarTabela();
    mostrarSucesso('Status atualizado com sucesso!');
  });
  return select;
}

/** Desenha a tabela com todas as tarefas salvas. */
function renderizarTabela() {
  const tarefas = carregarTarefas();
  const hoje = hojeISO();
  elCorpo.innerHTML = '';
  elContador.textContent = tarefas.length;

  const temTarefas = tarefas.length > 0;
  elTabela.hidden = !temTarefas;
  elVazio.hidden = temTarefas;

  tarefas.forEach(tarefa => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-testid', 'linha-' + tarefa.id);
    if (elId.value === tarefa.id) tr.classList.add('em-edicao');

    tr.appendChild(criarCelula(tarefa.titulo));
    tr.appendChild(criarCelula(tarefa.descricao || '—', 'desc-celula'));
    tr.appendChild(criarCelula(tarefa.responsavel));

    // Vencimento (destacado em vermelho se vencida)
    const classeData = estaVencida(tarefa, hoje) ? 'vencida' : '';
    const textoData = formatarData(tarefa.vencimento) + (classeData ? ' (vencida)' : '');
    tr.appendChild(criarCelula(textoData, classeData));

    // Status editável direto na listagem
    const tdStatus = document.createElement('td');
    tdStatus.appendChild(criarSelectStatus(tarefa));
    tr.appendChild(tdStatus);

    // Botões de ação
    const tdAcoes = document.createElement('td');
    tdAcoes.className = 'acoes-celula';

    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.className = 'btn btn-pequeno btn-editar';
    btnEditar.textContent = 'Editar';
    btnEditar.setAttribute('data-testid', 'btn-editar-' + tarefa.id);
    btnEditar.addEventListener('click', () => iniciarEdicao(tarefa.id));

    const btnExcluir = document.createElement('button');
    btnExcluir.type = 'button';
    btnExcluir.className = 'btn btn-pequeno btn-excluir';
    btnExcluir.textContent = 'Excluir';
    btnExcluir.setAttribute('data-testid', 'btn-excluir-' + tarefa.id);
    btnExcluir.addEventListener('click', () => confirmarExclusao(tarefa.id));

    tdAcoes.appendChild(btnEditar);
    tdAcoes.appendChild(btnExcluir);
    tr.appendChild(tdAcoes);

    elCorpo.appendChild(tr);
  });
}

/** Preenche o formulário com os dados da tarefa para edição. */
function iniciarEdicao(id) {
  const tarefa = carregarTarefas().find(t => t.id === id);
  if (!tarefa) return;

  limparMensagens();
  elId.value = tarefa.id;
  elTitulo.value = tarefa.titulo;
  elDescricao.value = tarefa.descricao;
  elResponsavel.value = tarefa.responsavel;
  elVencimento.value = tarefa.vencimento;
  elStatus.value = tarefa.status;

  elBtnSalvar.textContent = 'Atualizar Tarefa';
  elBtnCancelar.hidden = false;
  document.getElementById('titulo-form').textContent = 'Editar Tarefa';

  renderizarTabela(); // para destacar a linha em edição
  elForm.scrollIntoView({ behavior: 'smooth' });
  elTitulo.focus();
}

/** Pede confirmação ao usuário e, se aceito, exclui a tarefa. */
function confirmarExclusao(id) {
  const tarefa = carregarTarefas().find(t => t.id === id);
  if (!tarefa) return;

  const confirmou = window.confirm(`Deseja realmente excluir a tarefa "${tarefa.titulo}"?`);
  if (!confirmou) return;

  excluirTarefa(id);

  // Se a tarefa excluída estava em edição, volta o formulário ao normal
  if (elId.value === id) resetarFormulario();

  renderizarTabela();
  mostrarSucesso('Tarefa excluída com sucesso!');
}

/* ---------------------------------------------------------------------
   6. INICIALIZAÇÃO E EVENTOS
   --------------------------------------------------------------------- */

/** Trata o envio do formulário (cadastro ou atualização). */
function aoEnviarFormulario(evento) {
  evento.preventDefault();
  limparMensagens();

  const dados = lerFormulario();
  const editando = elId.value !== '';

  const resultado = editando
    ? atualizarTarefa(elId.value, dados)
    : criarTarefa(dados);

  if (!resultado.sucesso) {
    marcarCamposInvalidos(dados);
    mostrarErros(resultado.mensagens);
    return;
  }

  resetarFormulario();
  renderizarTabela();
  mostrarSucesso(editando
    ? 'Tarefa atualizada com sucesso!'
    : 'Tarefa cadastrada com sucesso!');
}

/** Inicializa a aplicação no navegador. */
function iniciarApp() {
  elForm = document.getElementById('form-tarefa');
  elId = document.getElementById('tarefa-id');
  elTitulo = document.getElementById('titulo');
  elDescricao = document.getElementById('descricao');
  elResponsavel = document.getElementById('responsavel');
  elVencimento = document.getElementById('vencimento');
  elStatus = document.getElementById('status');
  elMensagens = document.getElementById('mensagens');
  elBtnSalvar = document.getElementById('btn-salvar');
  elBtnCancelar = document.getElementById('btn-cancelar');
  elTabela = document.getElementById('tabela-tarefas');
  elCorpo = document.getElementById('corpo-tabela');
  elVazio = document.getElementById('lista-vazia');
  elContador = document.getElementById('contador');

  elForm.addEventListener('submit', aoEnviarFormulario);

  elBtnCancelar.addEventListener('click', () => {
    resetarFormulario();
    limparMensagens();
    renderizarTabela();
  });

  renderizarTabela(); // mostra os dados persistidos ao carregar (F5)
}

// Só inicia a interface se houver DOM (permite importar o arquivo no Node)
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', iniciarApp);
}

/* ---------------------------------------------------------------------
   7. EXPORTAÇÃO PARA TESTES UNITÁRIOS (Node.js / Jest)
   No navegador "module" não existe, então este bloco é ignorado.
   Exemplo: const { validarCamposTarefa } = require('./script.js');
   --------------------------------------------------------------------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validarCamposTarefa,
    validarTitulo,
    validarResponsavel,
    validarVencimento,
    validarStatus,
    dataValida,
    estaVencida,
    formatarData,
    STATUS_VALIDOS
  };
}

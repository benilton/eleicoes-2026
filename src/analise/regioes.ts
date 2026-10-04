import type { Apuracao } from '../tse/tipos'
import { UFS } from '../tse/urls'

/**
 * Agregacao da apuracao por grande regiao.
 *
 * FONTE DA DIVISAO REGIONAL: IBGE, Divisao Regional do Brasil em Regioes
 * Geograficas (https://www.ibge.gov.br/geociencias/organizacao-do-territorio/
 * divisao-regional/15778-divisoes-regionais-do-brasil.html). Sao cinco grandes
 * regioes que cobrem as 27 unidades da federacao, com o Distrito Federal no
 * Centro-Oeste. A composicao e estavel: nao muda desde a criacao do Tocantins,
 * alocado no Norte. Por isso a tabela abaixo e constante de codigo, e nao dado
 * lido do TSE.
 *
 * ORDEM: a ordem desta lista e a do enunciado do painel, de Norte a Sul:
 * Norte, Nordeste, Centro-Oeste, Sudeste, Sul. Ela difere da ordem dos codigos
 * numericos do IBGE, que e Norte (1), Nordeste (2), Sudeste (3), Sul (4),
 * Centro-Oeste (5). A funcao devolve sempre na ordem declarada aqui.
 *
 * METODO: todo agregado e soma de valores absolutos, nunca media de
 * percentuais. Media de percentuais ponderaria Roraima como Sao Paulo, o que
 * descreveria uma eleicao que nao existe. O percentual de cada candidatura e
 * calculado uma unica vez, no fim, sobre o total de votos nominais somados da
 * regiao. O percentual de secoes segue a mesma regra: totalizadas sobre totais
 * da regiao inteira.
 *
 * ESCALA: percentuais saem de 0 a 100, como em `Apuracao` e `Candidatura`.
 */

/** Resultado consolidado de uma grande regiao. */
export interface ResultadoRegiao {
  id: string
  nome: string
  ufs: string[]
  /** Quantas das `ufs` estavam presentes no mapa recebido. */
  ufsComDado: number
  /** Numero da candidatura para votos absolutos somados na regiao. */
  votosPorCandidato: Record<string, number>
  /** Numero da candidatura para percentual sobre os nominais da regiao. */
  pctPorCandidato: Record<string, number>
  votosNominais: number
  secoesTotalizadas: number
  secoesTotais: number
  percentualSecoes: number
  eleitoresAptos: number
}

/** Divisao regional do IBGE, em siglas minusculas, como as chaves do mapa de UF. */
export const REGIOES: { id: string; nome: string; ufs: string[] }[] = [
  { id: 'norte', nome: 'Norte', ufs: ['ac', 'ap', 'am', 'pa', 'ro', 'rr', 'to'] },
  {
    id: 'nordeste',
    nome: 'Nordeste',
    ufs: ['al', 'ba', 'ce', 'ma', 'pb', 'pe', 'pi', 'rn', 'se'],
  },
  { id: 'sudeste', nome: 'Sudeste', ufs: ['es', 'mg', 'rj', 'sp'] },
  { id: 'sul', nome: 'Sul', ufs: ['pr', 'rs', 'sc'] },
  { id: 'centro-oeste', nome: 'Centro-Oeste', ufs: ['df', 'go', 'mt', 'ms'] },
]

/** Unidades da federacao esperadas em cada regiao, conforme o IBGE. */
const CONTAGEM_ESPERADA: Record<string, number> = {
  norte: 7,
  nordeste: 9,
  'centro-oeste': 4,
  sudeste: 4,
  sul: 3,
}

const TOTAL_UFS = 27

/**
 * Conferencia da tabela regional em tempo de desenvolvimento.
 *
 * Um erro de digitacao numa sigla nao produz excecao em lugar nenhum: a
 * unidade apenas some do agregado, e o painel exibe um numero menor sem avisar.
 * A verificacao abaixo transforma esse erro silencioso em falha imediata.
 * Ela confere, contra a lista `UFS` de `tse/urls`, que nao ha sigla repetida,
 * desconhecida nem ausente, que o total e 27 e que cada regiao tem a quantidade
 * de unidades que o IBGE declara.
 */
function verificarDivisaoRegional(): void {
  const conhecidas = new Set<string>(UFS)
  const vistas = new Set<string>()
  const repetidas: string[] = []
  const desconhecidas: string[] = []
  const contagemErrada: string[] = []

  for (const regiao of REGIOES) {
    for (const uf of regiao.ufs) {
      if (!conhecidas.has(uf)) desconhecidas.push(`${regiao.id}/${uf}`)
      if (vistas.has(uf)) repetidas.push(uf)
      vistas.add(uf)
    }
    const esperada = CONTAGEM_ESPERADA[regiao.id]
    if (esperada === undefined) {
      contagemErrada.push(`${regiao.id} nao tem contagem esperada declarada`)
    } else if (regiao.ufs.length !== esperada) {
      contagemErrada.push(`${regiao.id} tem ${regiao.ufs.length}, esperadas ${esperada}`)
    }
  }

  const ausentes = UFS.filter((uf) => !vistas.has(uf))
  const problemas: string[] = []
  if (vistas.size !== TOTAL_UFS) {
    problemas.push(`${vistas.size} unidades distintas, esperadas ${TOTAL_UFS}`)
  }
  if (repetidas.length > 0) problemas.push(`repetidas: ${repetidas.join(', ')}`)
  if (desconhecidas.length > 0) problemas.push(`desconhecidas: ${desconhecidas.join(', ')}`)
  if (ausentes.length > 0) problemas.push(`ausentes: ${ausentes.join(', ')}`)
  if (contagemErrada.length > 0) problemas.push(contagemErrada.join('; '))

  if (problemas.length > 0) {
    throw new Error(`Divisao regional invalida. ${problemas.join('. ')}.`)
  }
}

// `import.meta.env` so existe sob o Vite. O typeof evita quebrar o modulo em
// qualquer outro executor, caso de um script de teste rodando sob o Node.
const EM_DESENVOLVIMENTO: boolean =
  typeof import.meta.env !== 'undefined' && import.meta.env.DEV === true

if (EM_DESENVOLVIMENTO) verificarDivisaoRegional()

/** Converte para numero utilizavel. Ausente, NaN ou infinito viram zero. */
const finito = (valor: number | undefined): number =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : 0

/** Razao em percentual, com o denominador zero devolvendo zero em vez de NaN. */
const percentual = (parte: number, total: number): number =>
  total > 0 ? (parte / total) * 100 : 0

/** Indice por sigla minuscula, para nao depender da caixa das chaves recebidas. */
function indexarPorSigla(porUf: Record<string, Apuracao>): Map<string, Apuracao> {
  const indice = new Map<string, Apuracao>()
  for (const chave of Object.keys(porUf)) {
    const apuracao = porUf[chave]
    if (apuracao === undefined || apuracao === null) continue
    indice.set(chave.toLowerCase(), apuracao)
  }
  return indice
}

/**
 * Consolida o mapa de unidades federativas nas cinco grandes regioes.
 *
 * Unidade ausente do mapa simplesmente nao entra na soma, e `ufsComDado`
 * registra quantas entraram. Regiao sem nenhuma unidade presente devolve zeros
 * em todos os campos, nunca NaN.
 */
export function agregarPorRegiao(porUf: Record<string, Apuracao>): ResultadoRegiao[] {
  const indice = indexarPorSigla(porUf)

  return REGIOES.map((regiao) => {
    const votosPorCandidato: Record<string, number> = {}
    let ufsComDado = 0
    let secoesTotalizadas = 0
    let secoesTotais = 0
    let eleitoresAptos = 0

    for (const sigla of regiao.ufs) {
      const apuracao = indice.get(sigla)
      if (apuracao === undefined) continue
      ufsComDado += 1
      secoesTotalizadas += finito(apuracao.secoesTotalizadas)
      secoesTotais += finito(apuracao.secoesTotais)
      eleitoresAptos += finito(apuracao.eleitoresAptos)

      for (const candidatura of apuracao.candidaturas ?? []) {
        const votos = finito(candidatura.votos)
        votosPorCandidato[candidatura.numero] =
          (votosPorCandidato[candidatura.numero] ?? 0) + votos
      }
    }

    // Os nominais da regiao sao a soma dos votos de todas as candidaturas
    // presentes. Brancos e nulos nao entram, nem aqui nem no denominador.
    let votosNominais = 0
    for (const numero of Object.keys(votosPorCandidato)) {
      votosNominais += votosPorCandidato[numero] ?? 0
    }

    const pctPorCandidato: Record<string, number> = {}
    for (const numero of Object.keys(votosPorCandidato)) {
      pctPorCandidato[numero] = percentual(votosPorCandidato[numero] ?? 0, votosNominais)
    }

    return {
      id: regiao.id,
      nome: regiao.nome,
      ufs: [...regiao.ufs],
      ufsComDado,
      votosPorCandidato,
      pctPorCandidato,
      votosNominais,
      secoesTotalizadas,
      secoesTotais,
      percentualSecoes: percentual(secoesTotalizadas, secoesTotais),
      eleitoresAptos,
    }
  })
}

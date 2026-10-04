import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Apuracao, Candidatura } from '../tse/tipos'
import { UFS } from '../tse/urls'
import { corDaCandidatura } from './cores'

export interface TabelaEstadosProps {
  dadosPorUf: Record<string, Apuracao>
  /** Numeros das candidaturas em destaque: definem as colunas e a ordem delas. */
  numerosDestaque: string[]
  /** Candidaturas nacionais, usadas para nome de urna e partido no cabecalho. */
  candidaturas: Candidatura[]
  ufSelecionada: string | null
  aoSelecionar: (uf: string) => void
}

/**
 * Nomes das 27 unidades da federacao.
 *
 * FONTE: IBGE, Divisao Territorial Brasileira, tabela de Unidades da Federacao
 * (https://www.ibge.gov.br/geociencias/organizacao-do-territorio/
 * estrutura-territorial/23701-divisao-territorial-brasileira.html). Sao 26
 * estados mais o Distrito Federal. A composicao nao muda desde a Constituicao
 * de 1988, por isso e constante de codigo e nao dado lido do TSE, cujo arquivo
 * entrega apenas a sigla.
 *
 * CAIXA: as siglas ficam em minusculas, do mesmo jeito que `UFS` de `tse/urls`
 * as declara e que elas chegam nas chaves de `dadosPorUf`. A ordem e a mesma de
 * `UFS`, alfabetica pela sigla.
 */
const UNIDADES: { sigla: string; nome: string }[] = [
  { sigla: 'ac', nome: 'Acre' },
  { sigla: 'al', nome: 'Alagoas' },
  { sigla: 'am', nome: 'Amazonas' },
  { sigla: 'ap', nome: 'Amapá' },
  { sigla: 'ba', nome: 'Bahia' },
  { sigla: 'ce', nome: 'Ceará' },
  { sigla: 'df', nome: 'Distrito Federal' },
  { sigla: 'es', nome: 'Espírito Santo' },
  { sigla: 'go', nome: 'Goiás' },
  { sigla: 'ma', nome: 'Maranhão' },
  { sigla: 'mg', nome: 'Minas Gerais' },
  { sigla: 'ms', nome: 'Mato Grosso do Sul' },
  { sigla: 'mt', nome: 'Mato Grosso' },
  { sigla: 'pa', nome: 'Pará' },
  { sigla: 'pb', nome: 'Paraíba' },
  { sigla: 'pe', nome: 'Pernambuco' },
  { sigla: 'pi', nome: 'Piauí' },
  { sigla: 'pr', nome: 'Paraná' },
  { sigla: 'rj', nome: 'Rio de Janeiro' },
  { sigla: 'rn', nome: 'Rio Grande do Norte' },
  { sigla: 'ro', nome: 'Rondônia' },
  { sigla: 'rr', nome: 'Roraima' },
  { sigla: 'rs', nome: 'Rio Grande do Sul' },
  { sigla: 'sc', nome: 'Santa Catarina' },
  { sigla: 'se', nome: 'Sergipe' },
  { sigla: 'sp', nome: 'São Paulo' },
  { sigla: 'to', nome: 'Tocantins' },
]

const TOTAL_UNIDADES = 27

/**
 * Conferencia da tabela de unidades em tempo de desenvolvimento.
 *
 * Uma sigla digitada errado nao levanta excecao em lugar nenhum: a unidade
 * apenas some da tabela, porque a chave de `dadosPorUf` deixa de casar. A
 * verificacao abaixo transforma esse erro silencioso em falha imediata. Ela
 * confere, contra `UFS` de `tse/urls`, que sao 27, que nao ha sigla repetida,
 * desconhecida nem ausente, e que todo nome esta preenchido.
 */
function verificarUnidades(): void {
  const conhecidas = new Set<string>(UFS)
  const vistas = new Set<string>()
  const problemas: string[] = []
  const repetidas: string[] = []
  const desconhecidas: string[] = []
  const semNome: string[] = []

  for (const unidade of UNIDADES) {
    if (!conhecidas.has(unidade.sigla)) desconhecidas.push(unidade.sigla)
    if (vistas.has(unidade.sigla)) repetidas.push(unidade.sigla)
    vistas.add(unidade.sigla)
    if (unidade.nome.trim() === '') semNome.push(unidade.sigla)
  }

  const ausentes = UFS.filter((sigla) => !vistas.has(sigla))
  if (UNIDADES.length !== TOTAL_UNIDADES) {
    problemas.push(`${UNIDADES.length} unidades declaradas, esperadas ${TOTAL_UNIDADES}`)
  }
  if (repetidas.length > 0) problemas.push(`repetidas: ${repetidas.join(', ')}`)
  if (desconhecidas.length > 0) problemas.push(`desconhecidas: ${desconhecidas.join(', ')}`)
  if (ausentes.length > 0) problemas.push(`ausentes: ${ausentes.join(', ')}`)
  if (semNome.length > 0) problemas.push(`sem nome: ${semNome.join(', ')}`)

  if (problemas.length > 0) {
    throw new Error(`Tabela de unidades federativas invalida. ${problemas.join('. ')}.`)
  }
}

// `import.meta.env` so existe sob o Vite. O typeof evita quebrar o modulo em
// qualquer outro executor, caso de um script de teste rodando sob o Node.
const EM_DESENVOLVIMENTO: boolean =
  typeof import.meta.env !== 'undefined' && import.meta.env.DEV === true

if (EM_DESENVOLVIMENTO) verificarUnidades()

const inteiro = new Intl.NumberFormat('pt-BR')
const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Converte para numero utilizavel. Ausente, NaN ou infinito viram zero. */
const finito = (valor: number | undefined): number =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : 0

/** Razao em percentual, com o denominador zero devolvendo zero em vez de NaN. */
const percentual = (parte: number, total: number): number =>
  total > 0 ? (parte / total) * 100 : 0

/** Votos e percentual de uma candidatura dentro de uma unidade. */
interface Celula {
  votos: number
  pct: number
}

const CELULA_ZERO: Celula = { votos: 0, pct: 0 }

interface LinhaUf {
  sigla: string
  nome: string
  votosValidos: number
  secoesTotalizadas: number
  secoesTotais: number
  percentualSecoes: number
  porNumero: Record<string, Celula>
}

interface Totais {
  votosValidos: number
  secoesTotalizadas: number
  secoesTotais: number
  percentualSecoes: number
  porNumero: Record<string, Celula>
  unidades: number
}

type DirecaoOrdenacao = 'asc' | 'desc'

/**
 * Coluna pela qual a tabela esta ordenada. As colunas de candidatura levam o
 * numero no proprio identificador, que e o unico jeito de distingui-las sem
 * depender da posicao, que muda com `numerosDestaque`.
 */
type ChaveOrdenacao = 'sigla' | 'nome' | 'validos' | 'secoes' | `candidatura:${string}`

interface Ordenacao {
  chave: ChaveOrdenacao
  direcao: DirecaoOrdenacao
}

/**
 * Ordenacao inicial: votos validos em ordem decrescente. Ela poe no topo as
 * unidades de maior peso eleitoral, que e o que decide a eleicao nacional.
 */
const ORDENACAO_PADRAO: Ordenacao = { chave: 'validos', direcao: 'desc' }

const PREFIXO_CANDIDATURA = 'candidatura:'

/**
 * Direcao com que uma coluna comeca quando recebe o primeiro clique. Texto
 * comeca crescente, porque a ordem alfabetica e a leitura esperada; numero
 * comeca decrescente, porque a pergunta e sempre quem esta no topo.
 */
function direcaoInicial(chave: ChaveOrdenacao): DirecaoOrdenacao {
  return chave === 'sigla' || chave === 'nome' ? 'asc' : 'desc'
}

/** Valor numerico que a coluna usa para ordenar. */
function valorNumerico(
  linha: LinhaUf,
  chave: Exclude<ChaveOrdenacao, 'sigla' | 'nome'>,
): number {
  if (chave === 'validos') return linha.votosValidos
  if (chave === 'secoes') return linha.percentualSecoes
  const numero = chave.slice(PREFIXO_CANDIDATURA.length)
  return (linha.porNumero[numero] ?? CELULA_ZERO).pct
}

/**
 * Comparador das linhas.
 *
 * Empate desfaz-se pela sigla em ordem alfabetica, sempre crescente. Sem esse
 * criterio a ordem das unidades empatadas dependeria da ordem de insercao, que
 * muda a cada atualizacao do arquivo do TSE, e a tabela pareceria embaralhar
 * sozinha durante a apuracao.
 */
function compararLinhas(a: LinhaUf, b: LinhaUf, ordenacao: Ordenacao): number {
  const sinal = ordenacao.direcao === 'asc' ? 1 : -1

  // Cada coluna de texto ordena pelo que ela propria mostra. A coluna da
  // sigla pela sigla, a do nome pelo nome: em portugues as duas ordens nao
  // coincidem, porque SE vem depois de SP enquanto Sergipe vem depois de Sao
  // Paulo, ja que o til nao altera a posicao da vogal na colacao pt-BR.
  if (ordenacao.chave === 'sigla') {
    return sinal * a.sigla.localeCompare(b.sigla, 'pt-BR')
  }

  if (ordenacao.chave === 'nome') {
    const ordem = a.nome.localeCompare(b.nome, 'pt-BR')
    if (ordem !== 0) return sinal * ordem
    return a.sigla.localeCompare(b.sigla, 'pt-BR')
  }

  const valorA = valorNumerico(a, ordenacao.chave)
  const valorB = valorNumerico(b, ordenacao.chave)
  if (valorA !== valorB) return sinal * (valorA - valorB)
  return a.sigla.localeCompare(b.sigla, 'pt-BR')
}

/**
 * Monta uma linha por unidade federativa presente em `dadosPorUf`.
 *
 * Unidade ausente do mapa nao gera linha. Chave que nao corresponde a nenhuma
 * das 27 unidades, caso de `br`, tambem fica de fora: esta tabela compara
 * unidades, e o total nacional ja esta no rodape.
 *
 * O percentual de cada candidatura e o que o proprio TSE publica, calculado
 * sobre os votos validos da unidade. Candidatura que nao aparece no arquivo da
 * unidade recebe zero votos e 0,00%, nunca celula vazia.
 */
function montarLinhas(dadosPorUf: Record<string, Apuracao>, numeros: string[]): LinhaUf[] {
  const indice = new Map<string, Apuracao>()
  for (const chave of Object.keys(dadosPorUf)) {
    const apuracao = dadosPorUf[chave]
    if (apuracao === undefined || apuracao === null) continue
    indice.set(chave.toLowerCase(), apuracao)
  }

  const linhas: LinhaUf[] = []
  for (const unidade of UNIDADES) {
    const apuracao = indice.get(unidade.sigla)
    if (apuracao === undefined) continue

    const porNumero: Record<string, Celula> = {}
    for (const numero of numeros) {
      const candidatura = (apuracao.candidaturas ?? []).find((c) => c.numero === numero)
      porNumero[numero] = {
        votos: finito(candidatura?.votos),
        pct: finito(candidatura?.percentual),
      }
    }

    linhas.push({
      sigla: unidade.sigla,
      nome: unidade.nome,
      votosValidos: finito(apuracao.votosValidos),
      secoesTotalizadas: finito(apuracao.secoesTotalizadas),
      secoesTotais: finito(apuracao.secoesTotais),
      percentualSecoes: finito(apuracao.percentualSecoes),
      porNumero,
    })
  }

  return linhas
}

/**
 * Linha de totais.
 *
 * Toda soma e de valor absoluto. O percentual de cada candidatura sai uma unica
 * vez, no fim, dos votos somados sobre os validos somados. O percentual de
 * secoes segue a mesma regra, totalizadas sobre totais. Media de percentuais
 * pesaria Roraima como Sao Paulo, o que descreveria uma eleicao que nao existe.
 */
function somarTotais(linhas: LinhaUf[], numeros: string[]): Totais {
  let votosValidos = 0
  let secoesTotalizadas = 0
  let secoesTotais = 0
  const votosPorNumero: Record<string, number> = {}
  for (const numero of numeros) votosPorNumero[numero] = 0

  for (const linha of linhas) {
    votosValidos += linha.votosValidos
    secoesTotalizadas += linha.secoesTotalizadas
    secoesTotais += linha.secoesTotais
    for (const numero of numeros) {
      votosPorNumero[numero] =
        (votosPorNumero[numero] ?? 0) + (linha.porNumero[numero] ?? CELULA_ZERO).votos
    }
  }

  const porNumero: Record<string, Celula> = {}
  for (const numero of numeros) {
    const votos = votosPorNumero[numero] ?? 0
    porNumero[numero] = { votos, pct: percentual(votos, votosValidos) }
  }

  return {
    votosValidos,
    secoesTotalizadas,
    secoesTotais,
    percentualSecoes: percentual(secoesTotalizadas, secoesTotais),
    porNumero,
    unidades: linhas.length,
  }
}

type EstadoAriaSort = 'none' | 'ascending' | 'descending'

function estadoAriaSort(chave: ChaveOrdenacao, ordenacao: Ordenacao): EstadoAriaSort {
  if (ordenacao.chave !== chave) return 'none'
  return ordenacao.direcao === 'asc' ? 'ascending' : 'descending'
}

/**
 * Indicador de ordenacao em glifo, nao em cor.
 *
 * Sao tres formas distintas: seta para cima, seta para baixo e seta dupla na
 * coluna inativa. Quem nao distingue cor continua lendo o estado, e o leitor de
 * tela recebe a mesma informacao pelo `aria-sort` do cabecalho.
 */
function glifoOrdenacao(estado: EstadoAriaSort): string {
  if (estado === 'ascending') return '▲'
  if (estado === 'descending') return '▼'
  return '⇅'
}

const celula = 'px-3 py-2 align-baseline whitespace-nowrap'
const numerica = `${celula} tabular text-right`
const cabecalho =
  'sticky top-0 z-20 bg-[var(--color-superficie)] px-3 py-2 text-left align-bottom ' +
  'font-medium text-[var(--color-tinta-3)] border-b border-[var(--color-base)]'
const rodape =
  'sticky bottom-0 z-20 bg-[var(--color-superficie)] border-t border-[var(--color-base)]'
const botaoCabecalho =
  'flex w-full items-baseline gap-1.5 text-left hover:text-[var(--color-tinta)] ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-[var(--color-tinta)]'

/**
 * Resultado por unidade da federacao, uma unidade por linha.
 *
 * As colunas de candidatura trazem o percentual sobre os validos da unidade em
 * destaque e os votos absolutos logo abaixo. O percentual e o que permite
 * comparar unidades de tamanho muito diferente: ordenar por ele responde onde a
 * candidatura e mais forte, pergunta que a coluna de votos validos nao responde,
 * porque ela devolve sempre a mesma ordem de peso eleitoral.
 *
 * As colunas de votos validos e de secoes totalizadas nao sao enfeite. Sem a
 * primeira nao se sabe o tamanho da unidade, sem a segunda nao se sabe quanto
 * daquele numero ja foi apurado, e o percentual isolado induz a erro no comeco
 * da noite, quando poucas secoes respondem por toda a diferenca.
 */
export function TabelaEstados({
  dadosPorUf,
  numerosDestaque,
  candidaturas,
  ufSelecionada,
  aoSelecionar,
}: TabelaEstadosProps) {
  const [ordenacao, setOrdenacao] = useState<Ordenacao>(ORDENACAO_PADRAO)

  const linhas = useMemo(
    () => montarLinhas(dadosPorUf, numerosDestaque),
    [dadosPorUf, numerosDestaque],
  )
  const ordenadas = useMemo(
    () => [...linhas].sort((a, b) => compararLinhas(a, b, ordenacao)),
    [linhas, ordenacao],
  )
  const totais = useMemo(() => somarTotais(linhas, numerosDestaque), [linhas, numerosDestaque])

  const colunas = useMemo(
    () =>
      numerosDestaque.map((numero) => {
        const candidatura = candidaturas.find((c) => c.numero === numero)
        return {
          numero,
          nomeUrna: candidatura?.nomeUrna ?? `Número ${numero}`,
          partido: candidatura?.partido ?? '',
          cor: corDaCandidatura(numero),
        }
      }),
    [numerosDestaque, candidaturas],
  )

  const selecionada = ufSelecionada === null ? null : ufSelecionada.toLowerCase()

  const alternarOrdem = (chave: ChaveOrdenacao) => {
    setOrdenacao((atual) =>
      atual.chave === chave
        ? { chave, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' }
        : { chave, direcao: direcaoInicial(chave) },
    )
  }

  const cabecalhoOrdenavel = (
    chave: ChaveOrdenacao,
    rotulo: ReactNode,
    descricao: string,
    classe: string,
  ) => {
    const estado = estadoAriaSort(chave, ordenacao)
    const ativa = estado !== 'none'
    return (
      <th scope="col" aria-sort={estado} className={`${cabecalho} ${classe}`}>
        <button
          type="button"
          onClick={() => alternarOrdem(chave)}
          aria-label={descricao}
          className={`${botaoCabecalho} ${ativa ? 'font-semibold text-[var(--color-tinta)] underline underline-offset-4' : ''}`}
        >
          <span className="min-w-0">{rotulo}</span>
          <span aria-hidden="true" className="shrink-0 text-[10px] leading-none">
            {glifoOrdenacao(estado)}
          </span>
        </button>
      </th>
    )
  }

  if (ordenadas.length === 0) {
    return (
      <p className="rounded-lg border border-white/5 bg-[var(--color-superficie)] p-4 text-sm text-[var(--color-tinta-3)]">
        Nenhuma unidade da federação tem dado de apuração até agora.
      </p>
    )
  }

  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border border-white/5 bg-[var(--color-superficie)]">
      <table className="w-full border-collapse text-sm">
        <caption className="px-3 pt-3 pb-2 text-left text-xs text-[var(--color-tinta-3)]">
          Votação das candidaturas em destaque por unidade da federação, com os votos
          absolutos e o percentual sobre os votos válidos de cada unidade. As colunas de
          votos válidos e de seções totalizadas dizem o tamanho da unidade e quanto dela já
          foi apurado. Clique no cabeçalho para ordenar e na linha para selecionar a unidade.
          A linha de totais soma votos absolutos: o percentual dela sai da soma, nunca da
          média dos percentuais das unidades.
        </caption>

        <thead>
          <tr>
            {cabecalhoOrdenavel('sigla', 'UF', 'Ordenar por sigla da unidade', 'sticky left-0 z-30 w-16')}
            {cabecalhoOrdenavel(
              'nome',
              'Unidade federativa',
              'Ordenar por nome da unidade',
              'min-w-[11rem]',
            )}
            {colunas.map((coluna) =>
              cabecalhoOrdenavel(
                `${PREFIXO_CANDIDATURA}${coluna.numero}`,
                <span className="inline-flex items-baseline gap-1.5">
                  <span
                    className="size-2 shrink-0 translate-y-px rounded-full"
                    style={{ backgroundColor: coluna.cor }}
                    aria-hidden="true"
                  />
                  <span>
                    {coluna.nomeUrna}
                    <span className="ml-1 tabular font-normal">{coluna.numero}</span>
                    {coluna.partido !== '' && (
                      <span className="ml-1 font-normal">{coluna.partido}</span>
                    )}
                  </span>
                </span>,
                `Ordenar por percentual de ${coluna.nomeUrna}`,
                'min-w-[9rem] [&>button]:justify-end [&>button]:text-right',
              ),
            )}
            {cabecalhoOrdenavel(
              'validos',
              'Votos válidos',
              'Ordenar por votos válidos da unidade',
              'min-w-[8rem] [&>button]:justify-end [&>button]:text-right',
            )}
            {cabecalhoOrdenavel(
              'secoes',
              '% seções',
              'Ordenar por percentual de seções totalizadas',
              'min-w-[7rem] [&>button]:justify-end [&>button]:text-right',
            )}
          </tr>
        </thead>

        <tbody>
          {ordenadas.map((linha) => {
            const estaSelecionada = linha.sigla === selecionada
            const fundo = estaSelecionada
              ? 'bg-[var(--color-base)]'
              : 'bg-[var(--color-superficie)]'
            return (
              <tr
                key={linha.sigla}
                onClick={() => aoSelecionar(linha.sigla)}
                aria-current={estaSelecionada ? 'true' : undefined}
                className={`group cursor-pointer border-b border-[var(--color-grade)] ${fundo} hover:bg-[var(--color-grade)]`}
              >
                <th
                  scope="row"
                  className={`${celula} sticky left-0 z-10 text-left font-normal ${fundo} group-hover:bg-[var(--color-grade)]`}
                >
                  {/* A barra a esquerda marca a selecao por forma, nao por cor.
                      Ela ocupa lugar fixo mesmo quando invisivel, para que o
                      texto das linhas nao se desloque ao trocar a selecao. */}
                  <span className="flex items-baseline gap-2">
                    <span
                      aria-hidden="true"
                      className={`-my-2 h-7 w-0.5 shrink-0 self-center ${estaSelecionada ? 'bg-[var(--color-tinta)]' : 'bg-transparent'}`}
                    />
                    <span
                      className={`tabular uppercase ${estaSelecionada ? 'font-semibold' : ''}`}
                    >
                      {linha.sigla}
                    </span>
                    <span className="sr-only">
                      {` ${linha.nome}${estaSelecionada ? ', selecionada' : ''}`}
                    </span>
                  </span>
                </th>

                {/* O botao e o caminho de teclado para a selecao: `tr` nao
                    recebe foco, e transformar a linha inteira em `button` nao
                    cabe dentro de uma tabela. O clique na linha, que o mouse
                    usa, chama o mesmo manipulador. */}
                <td className={`${celula} text-[var(--color-tinta-2)]`}>
                  <button
                    type="button"
                    aria-label={`Selecionar ${linha.nome}`}
                    onClick={(evento) => {
                      evento.stopPropagation()
                      aoSelecionar(linha.sigla)
                    }}
                    className="text-left hover:text-[var(--color-tinta)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-tinta)]"
                  >
                    {linha.nome}
                  </button>
                </td>

                {colunas.map((coluna) => {
                  const valor = linha.porNumero[coluna.numero] ?? CELULA_ZERO
                  return (
                    <td key={coluna.numero} className={numerica}>
                      <span className="block font-medium">
                        {doisDecimais.format(valor.pct)}%
                      </span>
                      <span className="block text-xs text-[var(--color-tinta-3)]">
                        {inteiro.format(valor.votos)}
                      </span>
                    </td>
                  )
                })}

                <td className={numerica}>{inteiro.format(linha.votosValidos)}</td>
                <td className={numerica}>{doisDecimais.format(linha.percentualSecoes)}%</td>
              </tr>
            )
          })}
        </tbody>

        <tfoot>
          <tr>
            <th
              scope="row"
              className={`${celula} ${rodape} sticky left-0 z-30 text-left font-medium`}
            >
              Total
            </th>
            <td className={`${celula} ${rodape} text-[var(--color-tinta-3)]`}>
              {totais.unidades} de {TOTAL_UNIDADES} unidades
            </td>
            {colunas.map((coluna) => {
              const valor = totais.porNumero[coluna.numero] ?? CELULA_ZERO
              return (
                <td key={coluna.numero} className={`${numerica} ${rodape} font-medium`}>
                  <span className="block">{doisDecimais.format(valor.pct)}%</span>
                  <span className="block text-xs font-normal text-[var(--color-tinta-3)]">
                    {inteiro.format(valor.votos)}
                  </span>
                </td>
              )
            })}
            <td className={`${numerica} ${rodape} font-medium`}>
              {inteiro.format(totais.votosValidos)}
            </td>
            <td className={`${numerica} ${rodape} font-medium`}>
              {doisDecimais.format(totais.percentualSecoes)}%
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default TabelaEstados

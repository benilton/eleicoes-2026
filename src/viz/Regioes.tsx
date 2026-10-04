import { useId } from 'react'
import type { ResultadoRegiao } from '../analise/regioes'
import type { Candidatura } from '../tse/tipos'
import { COR_CONTEXTO, corDaCandidatura, numerosComIdentidade, registrarOrdem } from './cores'

export interface RegioesProps {
  regioes: ResultadoRegiao[]
  candidaturas: Candidatura[]
}

const inteiro = new Intl.NumberFormat('pt-BR')
const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const umDecimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/**
 * Largura minima, em pontos percentuais, para um rotulo caber dentro do
 * segmento empilhado. O criterio e geometrico e nao medido: com a coluna de
 * rotulo e a calha da direita descontadas, a faixa util fica em torno de 240px
 * no celular, de modo que 15% valem cerca de 36px, folga suficiente para
 * "45,2%" em 10px com respiro dos dois lados. Abaixo disso o rotulo nao e
 * desenhado dentro, porque texto cortado e pior que texto ausente.
 */
const LIMIAR_ROTULO_INTERNO = 15

/** Marcas do eixo de cem por cento, declaradas uma unica vez acima do conjunto. */
const MARCAS_EIXO = [0, 25, 50, 75, 100]

/** Respiro de superficie entre segmentos vizinhos, em pixels de tela. */
const RESPIRO_PX = 2

const EPSILON = 0.0001

interface Serie {
  numero: string
  nomeUrna: string
  partido: string
  cor: string
}

/** Um segmento da barra empilhada, ja posicionado. */
interface Segmento {
  chave: string
  rotulo: string
  cor: string
  /** Rotulo claro sobre o preenchimento; falso usa tinta escura. */
  rotuloClaro: boolean
  votos: number
  pct: number
  inicio: number
}

/** Uma linha de barra dentro do bloco da regiao. */
interface LinhaRegiao {
  numero: string
  nomeUrna: string
  partido: string
  cor: string
  votos: number
  pct: number
}

/**
 * As tres candidaturas com cor de identidade, na ordem fixada em cores.ts.
 *
 * Antes da ordem ser fixada o recuo e o ranking nacional por voto, que e o que
 * `registrarOrdem` usaria de qualquer modo.
 */
function seriesDeIdentidade(candidaturas: Candidatura[]): Serie[] {
  const identidade = numerosComIdentidade()
  const escolhidas =
    identidade.length > 0
      ? identidade
          .map((numero) => candidaturas.find((c) => c.numero === numero))
          .filter((c): c is Candidatura => c !== undefined)
      : [...candidaturas].sort((a, b) => b.votos - a.votos).slice(0, 3)

  return escolhidas.map((c) => ({
    numero: c.numero,
    nomeUrna: c.nomeUrna,
    partido: c.partido,
    cor: corDaCandidatura(c.numero),
  }))
}

/**
 * Segmentos da barra empilhada: as tres identidades mais o resto agrupado.
 *
 * O percentual de "Outros" sai da diferenca de votos, nao da diferenca de
 * percentuais, para que a soma feche nos cem por cento sem acumular erro.
 */
function segmentosDaRegiao(regiao: ResultadoRegiao, series: Serie[]): Segmento[] {
  const segmentos: Segmento[] = []
  let acumulado = 0
  let votosIdentidade = 0

  for (const serie of series) {
    const votos = regiao.votosPorCandidato[serie.numero] ?? 0
    const pct = regiao.pctPorCandidato[serie.numero] ?? 0
    votosIdentidade += votos
    segmentos.push({
      chave: serie.numero,
      rotulo: serie.nomeUrna,
      cor: serie.cor,
      rotuloClaro: false,
      votos,
      pct,
      inicio: acumulado,
    })
    acumulado += pct
  }

  const votosOutros = Math.max(0, regiao.votosNominais - votosIdentidade)
  segmentos.push({
    chave: 'outros',
    rotulo: 'Outros',
    cor: COR_CONTEXTO,
    // A cor de contexto e escura: so texto claro passa no contraste sobre ela.
    rotuloClaro: true,
    votos: votosOutros,
    pct: regiao.votosNominais > 0 ? (votosOutros / regiao.votosNominais) * 100 : 0,
    inicio: acumulado,
  })

  return segmentos
}

/** Candidaturas ordenadas pelo voto da propria regiao, nao pelo nacional. */
function linhasDaRegiao(regiao: ResultadoRegiao, candidaturas: Candidatura[]): LinhaRegiao[] {
  return candidaturas
    .map((c) => ({
      numero: c.numero,
      nomeUrna: c.nomeUrna,
      partido: c.partido,
      cor: corDaCandidatura(c.numero),
      votos: regiao.votosPorCandidato[c.numero] ?? 0,
      pct: regiao.pctPorCandidato[c.numero] ?? 0,
    }))
    .sort((a, b) => b.votos - a.votos)
}

/**
 * Fronteiras internas onde entra o respiro de superficie.
 *
 * Sao as posicoes de inicio dos segmentos visiveis, menos a primeira, mais o
 * fim do ultimo quando a barra nao chega aos cem por cento.
 */
function fronteiras(segmentos: Segmento[]): number[] {
  const visiveis = segmentos.filter((s) => s.pct > EPSILON)
  if (visiveis.length === 0) return []
  const marcas = visiveis.slice(1).map((s) => s.inicio)
  const ultimo = visiveis[visiveis.length - 1]
  const fim = ultimo.inicio + ultimo.pct
  if (fim < 100 - EPSILON) marcas.push(fim)
  return marcas
}

/** Deslocamento horizontal do rotulo do eixo, que nao pode vazar nas pontas. */
function deslocamentoDaMarca(valor: number): string {
  if (valor <= 0) return 'translateX(0)'
  if (valor >= 100) return 'translateX(-100%)'
  return 'translateX(-50%)'
}

/**
 * Resultado por grande regiao.
 *
 * Duas leituras do mesmo dado. Os cinco blocos respondem "quem ganhou em cada
 * regiao", com a barra de cada candidatura na escala de zero a cem. A barra
 * empilhada responde "como a composicao muda de uma regiao para outra", que e
 * uma comparacao de perfis e por isso usa cem por cento em todas as linhas. A
 * tabela ao fim repete tudo em texto, entao nenhuma informacao depende de
 * enxergar cor ou comprimento.
 */
export function Regioes({ regioes, candidaturas }: RegioesProps) {
  const idBase = useId()
  const idBlocos = `${idBase}-blocos`
  const idComparacao = `${idBase}-comparacao`

  // Idempotente e travada na primeira lista nao vazia, como em BarrasCandidatos.
  registrarOrdem(candidaturas)

  const series = seriesDeIdentidade(candidaturas)
  const dados = regioes.map((regiao) => ({
    regiao,
    linhas: linhasDaRegiao(regiao, candidaturas),
    segmentos: segmentosDaRegiao(regiao, series),
  }))

  return (
    <div className="space-y-8">
      <section aria-labelledby={idBlocos}>
        <h2 id={idBlocos} className="mb-3 text-sm font-medium text-[var(--color-tinta-3)]">
          Votos nominais por grande região
        </h2>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {dados.map(({ regiao, linhas }) => (
            <article
              key={regiao.id}
              className="rounded-lg border border-white/5 bg-[var(--color-superficie)] p-3"
              aria-label={`Resultado na região ${regiao.nome}`}
            >
              <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-sm font-medium">{regiao.nome}</h3>
                <p className="tabular text-xs text-[var(--color-tinta-3)]">
                  {doisDecimais.format(regiao.percentualSecoes)}% das seções
                  <span className="mx-1.5">·</span>
                  {regiao.ufsComDado} de {regiao.ufs.length} UFs
                </p>
              </header>

              {regiao.votosNominais === 0 ? (
                <p className="py-3 text-xs text-[var(--color-tinta-3)]">
                  Nenhuma unidade desta região totalizou votos até agora.
                </p>
              ) : (
                <ol className="space-y-1.5">
                  {linhas.map((linha, posicao) => {
                    const largura = Math.max(0, Math.min(100, linha.pct))
                    const comRotulo = posicao < 3
                    const rotuloInterno = largura > 78

                    return (
                      <li
                        key={linha.numero}
                        aria-label={
                          `${posicao + 1}º lugar: ${linha.nomeUrna}, ${linha.partido}, ` +
                          `número ${linha.numero}, ${inteiro.format(linha.votos)} votos, ` +
                          `${doisDecimais.format(linha.pct)} por cento`
                        }
                      >
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-baseline gap-1.5">
                            <span
                              className="size-2 shrink-0 translate-y-px rounded-full"
                              style={{ backgroundColor: linha.cor }}
                              aria-hidden="true"
                            />
                            <span className="tabular text-[var(--color-tinta-3)]">
                              {linha.numero}
                            </span>
                            <span className="truncate">{linha.nomeUrna}</span>
                            <span className="shrink-0 text-[var(--color-tinta-3)]">
                              {linha.partido}
                            </span>
                          </span>
                          <span className="tabular shrink-0 text-[var(--color-tinta-2)]">
                            {inteiro.format(linha.votos)}
                            <span className="ml-2 font-medium text-[var(--color-tinta)]">
                              {doisDecimais.format(linha.pct)}%
                            </span>
                          </span>
                        </div>

                        <div className="relative mt-1">
                          <svg
                            viewBox="0 0 100 10"
                            preserveAspectRatio="none"
                            className="block h-2.5 w-full"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <rect x="0" y="0" width="100" height="10" fill="var(--color-grade)" />
                            {largura > 0 && (
                              <rect x="0" y="0" width={largura} height="10" fill={linha.cor} />
                            )}
                          </svg>

                          {comRotulo && (
                            <span
                              className="tabular pointer-events-none absolute top-1/2 -translate-y-1/2 text-[10px] font-medium"
                              style={
                                rotuloInterno
                                  ? { right: '0.25rem', color: 'var(--color-plano)' }
                                  : {
                                      left: `calc(${largura}% + 0.25rem)`,
                                      color: 'var(--color-tinta)',
                                    }
                              }
                              aria-hidden="true"
                            >
                              {doisDecimais.format(linha.pct)}%
                            </span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby={idComparacao}>
        <h2 id={idComparacao} className="mb-1 text-sm font-medium text-[var(--color-tinta-3)]">
          Composição do voto em cada região
        </h2>
        <p className="mb-3 text-xs text-[var(--color-tinta-3)]">
          Cada barra é o total de votos nominais daquela região, repartido entre as três
          candidaturas com cor de identidade e o conjunto das demais.
        </p>

        <div className="rounded-lg border border-white/5 bg-[var(--color-superficie)] p-3">
          <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-tinta-2)]">
            {series.map((serie) => (
              <li key={serie.numero} className="flex items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: serie.cor }}
                  aria-hidden="true"
                />
                {serie.nomeUrna}
                <span className="text-[var(--color-tinta-3)]">{serie.partido}</span>
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: COR_CONTEXTO }}
                aria-hidden="true"
              />
              Outros
              <span className="text-[var(--color-tinta-3)]">demais candidaturas</span>
            </li>
          </ul>

          <div
            className="flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-3"
            aria-hidden="true"
          >
            <span className="hidden shrink-0 sm:block sm:w-24" />
            <div className="flex min-w-0 flex-1 items-end gap-2">
              <div className="relative min-w-0 flex-1 border-b border-[var(--color-base)] pb-1">
                {MARCAS_EIXO.map((marca) => (
                  <span
                    key={marca}
                    className="tabular absolute bottom-1 text-[10px] text-[var(--color-tinta-3)]"
                    style={{ left: `${marca}%`, transform: deslocamentoDaMarca(marca) }}
                  >
                    {marca}%
                  </span>
                ))}
                {/* Reserva a altura da faixa de marcas, que e absoluta. */}
                <span className="block text-[10px] leading-4">&nbsp;</span>
              </div>
              <span className="w-10 shrink-0" />
            </div>
          </div>

          <ul className="mt-2 space-y-2">
            {dados.map(({ regiao, segmentos }) => {
              const marcasRespiro = fronteiras(segmentos)
              const ultimo = segmentos[segmentos.length - 1]
              // O unico segmento com ponta livre e o ultimo: quando o rotulo
              // dele nao cabe dentro, ele vai para a calha da direita. Segmento
              // interior que nao cabe fica sem rotulo inline, e a legenda e a
              // tabela respondem por ele.
              const rotuloNaCalha =
                ultimo.pct > EPSILON && ultimo.pct < LIMIAR_ROTULO_INTERNO
                  ? `${umDecimal.format(ultimo.pct)}%`
                  : ''

              return (
                <li
                  key={regiao.id}
                  className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
                >
                  <span className="shrink-0 text-xs text-[var(--color-tinta-2)] sm:w-24">
                    {regiao.nome}
                  </span>

                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                      <svg
                        viewBox="0 0 100 16"
                        preserveAspectRatio="none"
                        className="block h-4 w-full"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <rect x="0" y="0" width="100" height="16" fill="var(--color-grade)" />
                        {segmentos
                          .filter((segmento) => segmento.pct > EPSILON)
                          .map((segmento) => (
                            <rect
                              key={segmento.chave}
                              x={segmento.inicio}
                              y="0"
                              width={segmento.pct}
                              height="16"
                              fill={segmento.cor}
                            />
                          ))}
                        {/* Respiro de superficie: traco em cima da fronteira, com
                            largura fixa em pixels de tela, porque a escala
                            horizontal do viewBox e distorcida. */}
                        {marcasRespiro.map((marca) => (
                          <line
                            key={marca}
                            x1={marca}
                            x2={marca}
                            y1="0"
                            y2="16"
                            stroke="var(--color-superficie)"
                            strokeWidth={RESPIRO_PX}
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                      </svg>

                      {regiao.votosNominais === 0 ? (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-[var(--color-tinta-3)]">
                          sem dados
                        </span>
                      ) : (
                        segmentos
                          .filter((segmento) => segmento.pct >= LIMIAR_ROTULO_INTERNO)
                          .map((segmento) => (
                            <span
                              key={segmento.chave}
                              className="tabular pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-medium"
                              style={{
                                left: `${segmento.inicio + segmento.pct / 2}%`,
                                color: segmento.rotuloClaro
                                  ? 'var(--color-tinta)'
                                  : 'var(--color-plano)',
                              }}
                              aria-hidden="true"
                            >
                              {umDecimal.format(segmento.pct)}%
                            </span>
                          ))
                      )}
                    </div>

                    <span
                      className="tabular w-10 shrink-0 text-right text-[10px] text-[var(--color-tinta-3)]"
                      aria-hidden="true"
                    >
                      {rotuloNaCalha}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="tabular w-full min-w-[44rem] border-collapse text-left text-xs">
            <caption className="mb-2 text-left text-xs text-[var(--color-tinta-3)]">
              Votos nominais por grande região e por candidatura. O percentual de cada
              candidatura é o voto somado da região dividido pelos votos nominais da própria
              região.
            </caption>
            <thead>
              <tr className="border-b border-[var(--color-base)] text-[var(--color-tinta-3)]">
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Região
                </th>
                {series.map((serie) => (
                  <th
                    key={serie.numero}
                    scope="col"
                    className="py-1.5 pr-3 text-right font-medium"
                  >
                    {serie.nomeUrna} ({serie.numero})
                  </th>
                ))}
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Outros
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Votos nominais
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Seções totalizadas
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  UFs com dado
                </th>
              </tr>
            </thead>
            <tbody>
              {dados.map(({ regiao, segmentos }) => (
                <tr key={regiao.id} className="border-b border-[var(--color-grade)]">
                  <th scope="row" className="py-1.5 pr-3 font-normal">
                    {regiao.nome}
                  </th>
                  {segmentos.map((segmento) => (
                    <td key={segmento.chave} className="py-1.5 pr-3 text-right">
                      {inteiro.format(segmento.votos)}
                      <span className="ml-2 text-[var(--color-tinta-3)]">
                        {doisDecimais.format(segmento.pct)}%
                      </span>
                    </td>
                  ))}
                  <td className="py-1.5 pr-3 text-right">{inteiro.format(regiao.votosNominais)}</td>
                  <td className="py-1.5 pr-3 text-right">
                    {doisDecimais.format(regiao.percentualSecoes)}%
                  </td>
                  <td className="py-1.5 text-right">
                    {regiao.ufsComDado} de {regiao.ufs.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default Regioes

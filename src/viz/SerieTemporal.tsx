import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Estimativa } from '../analise/projecao'
import type { PontoHistorico } from '../estado/useHistorico'
import type { Candidatura } from '../tse/tipos'
import { corDaCandidatura, numerosComIdentidade } from './cores'

export interface SerieTemporalProps {
  /** Serie ja emendada: o que veio do repositorio seguido do que o navegador acumulou. */
  pontos: PontoHistorico[]
  candidaturas: Candidatura[]
  estimativa?: Estimativa | null
  faixa?: Record<string, { min: number; max: number }>
  origem: 'repositorio' | 'local' | 'misto' | 'vazio'
}

const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const umDecimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

// Geometria compartilhada pelos dois graficos. A margem esquerda e a direita
// sao as mesmas nos dois, entao a coluna de cada percentual de secoes cai no
// mesmo lugar em ambos: e isso que permite ler um sobre o outro.
const LARGURA = 760
const ESQUERDA = 48
const DIREITA = 112
const X0 = ESQUERDA
const X1 = LARGURA - DIREITA

const ALTURA_A = 316
const TOPO_A = 18
const Y0_A = TOPO_A
const Y1_A = 278

const ALTURA_B = 222
const TOPO_B = 20
const Y0_B = TOPO_B
const Y1_B = 170

const MARCAS_X = [0, 25, 50, 75, 100]
const LIMITE_SEGUNDO_TURNO = 50

const escalaX = (percentualSecoes: number): number =>
  X0 + (Math.max(0, Math.min(100, percentualSecoes)) / 100) * (X1 - X0)

interface Linha {
  numero: string
  nomeUrna: string
  partido: string
  cor: string
}

/** Mantem o rotulo de ponta preso a sua curva quando as linhas convergem. */
interface RotuloPonta {
  numero: string
  cor: string
  texto: string
  yReal: number
  yRotulo: number
}

/** Um ponto do grafico de margem, com os dois valores em pontos percentuais. */
interface PontoMargem {
  pst: number
  diferenca: number | null
  ateMetade: number | null
}

const finito = (valor: number | undefined): number | null =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : null

/** Quebra a curva em segmentos para que um buraco na serie nao vire reta falsa. */
function segmentos(amostras: { x: number; y: number | null }[]): string[] {
  const saida: string[] = []
  let atual: string[] = []
  for (const amostra of amostras) {
    if (amostra.y === null) {
      if (atual.length > 1) saida.push(atual.join(' '))
      atual = []
      continue
    }
    atual.push(`${amostra.x},${amostra.y}`)
  }
  if (atual.length > 1) saida.push(atual.join(' '))
  return saida
}

/** Afasta rotulos que se sobrepoem, sem perder a ligacao com a curva de origem. */
function afastar(rotulos: RotuloPonta[], minimo: number): RotuloPonta[] {
  const ordenados = [...rotulos].sort((a, b) => a.yReal - b.yReal)
  for (let i = 1; i < ordenados.length; i += 1) {
    const anterior = ordenados[i - 1]
    const corrente = ordenados[i]
    if (anterior === undefined || corrente === undefined) continue
    if (corrente.yRotulo - anterior.yRotulo < minimo) {
      corrente.yRotulo = anterior.yRotulo + minimo
    }
  }
  return ordenados
}

/** Passo de grade legivel para a escala da margem, que atravessa o zero. */
function passoDaMargem(amplitude: number): number {
  const candidatos = [1, 2, 5, 10, 20, 25, 50]
  for (const passo of candidatos) {
    if (amplitude / passo <= 5) return passo
  }
  return 100
}

/**
 * Convergencia da apuracao, em dois graficos empilhados e em SVG inline.
 *
 * O eixo horizontal e o percentual de secoes totalizadas, fixo de 0 a 100, e
 * nao o relogio: o que se quer ler e como o resultado se estabiliza conforme a
 * apuracao avanca. Com o eixo fixo a curva ocupa o quadro aos poucos, entao a
 * propria largura preenchida ja informa quanto falta.
 *
 * Os dois graficos nunca viram um so com dois eixos verticais. O primeiro esta
 * em percentual de votos, o segundo em pontos percentuais de margem: sao
 * escalas diferentes, logo sao figuras diferentes, alinhadas coluna a coluna.
 */
export function SerieTemporal({
  pontos,
  candidaturas,
  estimativa = null,
  faixa,
  origem,
}: SerieTemporalProps) {
  const svgA = useRef<SVGSVGElement | null>(null)
  const svgB = useRef<SVGSVGElement | null>(null)
  const [indice, setIndice] = useState<number | null>(null)

  const identidade = numerosComIdentidade()
  const porVoto = [...candidaturas].sort((a, b) => b.votos - a.votos)
  const desenhadas: Candidatura[] =
    identidade.length > 0
      ? identidade
          .map((numero) => candidaturas.find((c) => c.numero === numero))
          .filter((c): c is Candidatura => c !== undefined)
      : porVoto.slice(0, 3)

  const foraDaFigura = candidaturas.length - desenhadas.length
  const linhas: Linha[] = desenhadas.map((c) => ({
    numero: c.numero,
    nomeUrna: c.nomeUrna,
    partido: c.partido,
    cor: corDaCandidatura(c.numero),
  }))

  const ordenados = [...pontos].sort((a, b) => a.pst - b.pst || a.t - b.t)

  const cobreANoite = origem === 'repositorio' || origem === 'misto'
  const notaDeOrigem = cobreANoite
    ? 'A curva cobre a noite inteira: o historico publicado no repositorio vem antes do que este navegador acumulou desde que a pagina foi aberta.'
    : 'A curva comeca no momento em que esta pagina foi aberta porque o historico do repositorio ainda nao existe. O TSE publica apenas a fotografia corrente da apuracao: o acumulo e feito aqui, no seu navegador, a cada coleta.'

  if (ordenados.length < 2) {
    return (
      <section aria-label="Convergência da apuração">
        <h2 className="mb-2 text-sm font-medium text-[var(--color-tinta-3)]">
          Convergência conforme a apuração avança
        </h2>
        <p className="rounded-xl border border-white/10 bg-[var(--color-superficie)] p-6 text-sm text-[var(--color-tinta-2)]">
          {notaDeOrigem}{' '}
          {ordenados.length === 0
            ? 'Ainda não há ponto registrado, então não há linha a desenhar.'
            : 'Há apenas um ponto registrado, então ainda não há linha a desenhar.'}{' '}
          A próxima coleta acrescenta o ponto que falta.
        </p>
      </section>
    )
  }

  // -------------------------------------------------------------------------
  // Grafico A: percentual por candidatura
  // -------------------------------------------------------------------------

  const valoresDeA: number[] = []
  for (const ponto of ordenados) {
    for (const linha of linhas) {
      const valor = finito(ponto.porCandidato[linha.numero])
      if (valor !== null) valoresDeA.push(valor)
    }
  }
  for (const linha of linhas) {
    const estimado = estimativa === null ? null : finito(estimativa.porCandidato[linha.numero])
    if (estimado !== null) valoresDeA.push(estimado)
    const intervalo = faixa === undefined ? undefined : faixa[linha.numero]
    if (intervalo !== undefined) {
      valoresDeA.push(intervalo.min)
      valoresDeA.push(intervalo.max)
    }
  }

  const maximoA = valoresDeA.length > 0 ? Math.max(...valoresDeA) : LIMITE_SEGUNDO_TURNO
  // O teto nunca fica abaixo de 60 para que a linha dos 50 por cento caiba
  // dentro do quadro desde o primeiro ponto, sem reescalar a cada coleta.
  const tetoA = Math.min(100, Math.max(60, Math.ceil((maximoA * 1.1) / 10) * 10))
  const passoA = tetoA / 5
  const marcasA = [0, 1, 2, 3, 4, 5].map((i) => i * passoA)
  const escalaA = (valor: number): number =>
    Y1_A - (Math.max(0, Math.min(tetoA, valor)) / tetoA) * (Y1_A - Y0_A)

  const ultimo = ordenados[ordenados.length - 1]
  const xUltimo = ultimo === undefined ? X0 : escalaX(ultimo.pst)
  const temEstimativa = estimativa !== null

  const rotulosA = afastar(
    linhas
      .map((linha): RotuloPonta | null => {
        const observado = ultimo === undefined ? null : finito(ultimo.porCandidato[linha.numero])
        const estimado =
          estimativa === null ? null : finito(estimativa.porCandidato[linha.numero])
        const ancora = estimado ?? observado
        if (ancora === null) return null
        const y = escalaA(ancora)
        return {
          numero: linha.numero,
          cor: linha.cor,
          texto: `${doisDecimais.format(ancora)}%`,
          yReal: y,
          yRotulo: y,
        }
      })
      .filter((r): r is RotuloPonta => r !== null),
    15,
  )

  // -------------------------------------------------------------------------
  // Grafico B: margem, em pontos percentuais
  // -------------------------------------------------------------------------

  // O indice e o mesmo nos dois graficos, entao a margem guarda nulo onde o
  // ponto nao tem dois valores, em vez de encolher o vetor.
  const margem: PontoMargem[] = ordenados.map((ponto) => {
    const valores = Object.values(ponto.porCandidato)
      .map((valor) => finito(valor))
      .filter((valor): valor is number => valor !== null)
      .sort((a, b) => b - a)
    const primeiro = valores[0]
    const segundo = valores[1]
    if (primeiro === undefined || segundo === undefined) {
      return { pst: ponto.pst, diferenca: null, ateMetade: null }
    }
    return {
      pst: ponto.pst,
      diferenca: primeiro - segundo,
      ateMetade: primeiro - LIMITE_SEGUNDO_TURNO,
    }
  })

  const valoresDeB = margem
    .flatMap((ponto) => [ponto.diferenca, ponto.ateMetade])
    .filter((valor): valor is number => valor !== null)
  const minimoB = valoresDeB.length > 0 ? Math.min(0, ...valoresDeB) : -10
  const maximoB = valoresDeB.length > 0 ? Math.max(0, ...valoresDeB) : 10
  const passoB = passoDaMargem(Math.max(1, maximoB - minimoB))
  const baixoB = Math.floor(minimoB / passoB) * passoB
  const altoB = Math.max(baixoB + passoB, Math.ceil(maximoB / passoB) * passoB)
  const escalaB = (valor: number): number =>
    Y1_B - ((Math.max(baixoB, Math.min(altoB, valor)) - baixoB) / (altoB - baixoB)) * (Y1_B - Y0_B)

  const marcasB: number[] = []
  for (let valor = baixoB; valor <= altoB + 1e-9; valor += passoB) marcasB.push(valor)

  const COR_DIFERENCA = 'var(--color-tinta-2)'
  const COR_ATE_METADE = 'var(--color-tinta)'

  // -------------------------------------------------------------------------
  // Leitura por ponteiro e por teclado, compartilhada pelos dois graficos
  // -------------------------------------------------------------------------

  const ativo = indice === null ? null : (ordenados[indice] ?? null)
  const margemAtiva = indice === null ? null : (margem[indice] ?? null)

  const localizar = (elemento: SVGSVGElement | null, clienteX: number): void => {
    if (elemento === null) return
    const caixa = elemento.getBoundingClientRect()
    if (caixa.width === 0) return
    const x = ((clienteX - caixa.left) * LARGURA) / caixa.width
    let melhor = 0
    let distancia = Number.POSITIVE_INFINITY
    for (let i = 0; i < ordenados.length; i += 1) {
      const ponto = ordenados[i]
      if (ponto === undefined) continue
      const d = Math.abs(escalaX(ponto.pst) - x)
      if (d < distancia) {
        distancia = d
        melhor = i
      }
    }
    setIndice(melhor)
  }

  const aoTeclado = (evento: KeyboardEvent<SVGSVGElement>): void => {
    const atual = indice ?? ordenados.length - 1
    if (evento.key === 'ArrowRight') {
      evento.preventDefault()
      setIndice(Math.min(ordenados.length - 1, atual + 1))
    } else if (evento.key === 'ArrowLeft') {
      evento.preventDefault()
      setIndice(Math.max(0, atual - 1))
    } else if (evento.key === 'Home') {
      evento.preventDefault()
      setIndice(0)
    } else if (evento.key === 'End') {
      evento.preventDefault()
      setIndice(ordenados.length - 1)
    } else if (evento.key === 'Escape') {
      setIndice(null)
    }
  }

  const resumoDoAtivo =
    ativo === null
      ? ''
      : `${doisDecimais.format(ativo.pst)}% das seções. ` +
        linhas
          .map((linha) => {
            const valor = finito(ativo.porCandidato[linha.numero])
            const texto = valor === null ? 'sem dado' : `${doisDecimais.format(valor)} por cento`
            return `${linha.nomeUrna}: ${texto}`
          })
          .join('. ') +
        (margemAtiva === null || margemAtiva.diferenca === null || margemAtiva.ateMetade === null
          ? ''
          : `. Diferença do primeiro para o segundo: ${umDecimal.format(margemAtiva.diferenca)} pontos. ` +
            `Líder em relação aos 50 por cento: ${umDecimal.format(margemAtiva.ateMetade)} pontos.`)

  const larguraCaixa = 192
  const alturaCaixa = 26 + linhas.length * 17
  const xAtivo = ativo === null ? 0 : escalaX(ativo.pst)
  const xCaixa = xAtivo > X1 - larguraCaixa - 12 ? xAtivo - larguraCaixa - 10 : xAtivo + 10

  const caixaB = 206
  const xCaixaB = xAtivo > X1 - caixaB - 12 ? xAtivo - caixaB - 10 : xAtivo + 10

  const nomes = linhas.map((l) => l.nomeUrna).join(', ')

  return (
    <section aria-label="Convergência da apuração">
      <h2 className="mb-1 text-sm font-medium text-[var(--color-tinta-3)]">
        Convergência conforme a apuração avança
      </h2>

      <ul className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[var(--color-tinta-2)]">
        {linhas.map((linha) => (
          <li key={linha.numero} className="flex items-center gap-2">
            <svg width="16" height="2" aria-hidden="true" focusable="false">
              <rect width="16" height="2" fill={linha.cor} />
            </svg>
            {linha.nomeUrna}
            <span className="text-[var(--color-tinta-3)]">{linha.partido}</span>
          </li>
        ))}
        {temEstimativa && (
          <li className="flex items-center gap-2 text-[var(--color-tinta-3)]">
            <svg width="22" height="10" aria-hidden="true" focusable="false">
              <line
                x1="0"
                x2="12"
                y1="5"
                y2="5"
                stroke="var(--color-tinta-3)"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <circle
                cx="17"
                cy="5"
                r="4"
                fill="var(--color-superficie)"
                stroke="var(--color-tinta-3)"
                strokeWidth="2"
              />
            </svg>
            Estimativa em 100% das seções
          </li>
        )}
      </ul>

      <svg
        ref={svgA}
        viewBox={`0 0 ${LARGURA} ${ALTURA_A}`}
        className="h-auto w-full rounded-xl border border-white/10 bg-[var(--color-superficie)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-tinta-2)]"
        role="img"
        tabIndex={0}
        aria-label={
          `Percentual de votos de ${nomes} contra o percentual de seções totalizadas, ` +
          `de 0 a 100, com ${ordenados.length} coletas. ` +
          (temEstimativa
            ? 'À direita, a estimativa de cada candidatura em 100% das seções. '
            : '') +
          'Use as setas para percorrer as coletas.'
        }
        onKeyDown={aoTeclado}
        onPointerMove={(evento) => localizar(svgA.current, evento.clientX)}
        onPointerLeave={() => setIndice(null)}
      >
        {marcasA.map((marca) => (
          <g key={marca}>
            <line
              x1={X0}
              x2={X1}
              y1={escalaA(marca)}
              y2={escalaA(marca)}
              stroke="var(--color-grade)"
              strokeWidth="1"
            />
            <text
              x={X0 - 8}
              y={escalaA(marca)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="11"
              className="tabular"
              fill="var(--color-tinta-3)"
            >
              {Math.round(marca)}%
            </text>
          </g>
        ))}

        <line
          x1={X0}
          x2={X1}
          y1={escalaA(LIMITE_SEGUNDO_TURNO)}
          y2={escalaA(LIMITE_SEGUNDO_TURNO)}
          stroke="var(--color-base)"
          strokeWidth="1"
        />
        <text
          x={X0 + 6}
          y={escalaA(LIMITE_SEGUNDO_TURNO) - 5}
          fontSize="10"
          fill="var(--color-tinta-3)"
        >
          50%: limite do segundo turno
        </text>

        <line x1={X0} x2={X1} y1={Y1_A} y2={Y1_A} stroke="var(--color-base)" strokeWidth="1" />

        {MARCAS_X.map((marca) => (
          <text
            key={marca}
            x={escalaX(marca)}
            y={Y1_A + 16}
            textAnchor="middle"
            fontSize="11"
            className="tabular"
            fill="var(--color-tinta-3)"
          >
            {marca}%
          </text>
        ))}

        {faixa !== undefined && (
          <text
            x={LARGURA - 6}
            y={Y1_A + 32}
            textAnchor="end"
            fontSize="10"
            fill="var(--color-tinta-3)"
          >
            Barra vertical à direita: variação recente da estimativa
          </text>
        )}

        {linhas.map((linha) => {
          const amostras = ordenados.map((ponto) => {
            const valor = finito(ponto.porCandidato[linha.numero])
            return { x: escalaX(ponto.pst), y: valor === null ? null : escalaA(valor) }
          })
          return segmentos(amostras).map((caminho, i) => (
            <polyline
              key={`${linha.numero}-${i}`}
              points={caminho}
              fill="none"
              stroke={linha.cor}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))
        })}

        {/* Ligacao pontilhada ate a estimativa. Aqui o pontilhado diz projecao,
            que e exatamente o que a marca significa; a grade continua solida. */}
        {temEstimativa &&
          linhas.map((linha) => {
            const observado = ultimo === undefined ? null : finito(ultimo.porCandidato[linha.numero])
            const estimado =
              estimativa === null ? null : finito(estimativa.porCandidato[linha.numero])
            if (observado === null || estimado === null) return null
            return (
              <line
                key={`projecao-${linha.numero}`}
                x1={xUltimo}
                x2={X1}
                y1={escalaA(observado)}
                y2={escalaA(estimado)}
                stroke={linha.cor}
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
            )
          })}

        {faixa !== undefined &&
          linhas.map((linha) => {
            const intervalo = faixa[linha.numero]
            if (intervalo === undefined) return null
            const yAlto = escalaA(intervalo.max)
            const yBaixo = escalaA(intervalo.min)
            return (
              <g key={`faixa-${linha.numero}`}>
                <line
                  x1={X1}
                  x2={X1}
                  y1={yAlto}
                  y2={yBaixo}
                  stroke={linha.cor}
                  strokeWidth="2"
                />
                <line x1={X1 - 4} x2={X1 + 4} y1={yAlto} y2={yAlto} stroke={linha.cor} strokeWidth="1.5" />
                <line x1={X1 - 4} x2={X1 + 4} y1={yBaixo} y2={yBaixo} stroke={linha.cor} strokeWidth="1.5" />
              </g>
            )
          })}

        {rotulosA.map((rotulo) => {
          // Com estimativa o rotulo acompanha o marcador em 100%; sem ela,
          // fica colado no ultimo ponto observado, que e onde a curva termina.
          const ancoraX = temEstimativa ? X1 : xUltimo
          const xRotulo = ancoraX + 14
          return (
            <g key={rotulo.numero}>
              {Math.abs(rotulo.yRotulo - rotulo.yReal) > 1 && (
                <polyline
                  points={`${ancoraX},${rotulo.yReal} ${ancoraX + 6},${rotulo.yReal} ${ancoraX + 11},${rotulo.yRotulo}`}
                  fill="none"
                  stroke="var(--color-base)"
                  strokeWidth="1"
                />
              )}
              {temEstimativa ? (
                <circle
                  cx={X1}
                  cy={rotulo.yReal}
                  r="5"
                  fill="var(--color-superficie)"
                  stroke={rotulo.cor}
                  strokeWidth="2"
                />
              ) : (
                <circle
                  cx={xUltimo}
                  cy={rotulo.yReal}
                  r="4"
                  fill={rotulo.cor}
                  stroke="var(--color-superficie)"
                  strokeWidth="2"
                />
              )}
              <text
                x={xRotulo}
                y={rotulo.yRotulo}
                dominantBaseline="middle"
                fontSize="12"
                fontWeight="600"
                className="tabular"
                fill="var(--color-tinta)"
              >
                {rotulo.texto}
              </text>
            </g>
          )
        })}

        {ativo !== null && (
          <g>
            <line
              x1={xAtivo}
              x2={xAtivo}
              y1={Y0_A}
              y2={Y1_A}
              stroke="var(--color-tinta-3)"
              strokeWidth="1"
            />
            {linhas.map((linha) => {
              const valor = finito(ativo.porCandidato[linha.numero])
              if (valor === null) return null
              return (
                <circle
                  key={linha.numero}
                  cx={xAtivo}
                  cy={escalaA(valor)}
                  r="4"
                  fill={linha.cor}
                  stroke="var(--color-superficie)"
                  strokeWidth="2"
                />
              )
            })}

            <g transform={`translate(${xCaixa}, ${Y0_A + 8})`}>
              <rect
                width={larguraCaixa}
                height={alturaCaixa}
                rx="6"
                fill="var(--color-plano)"
                stroke="var(--color-grade)"
                strokeWidth="1"
              />
              <text x="10" y="16" fontSize="11" className="tabular" fill="var(--color-tinta-3)">
                {doisDecimais.format(ativo.pst)}% das seções
              </text>
              {linhas.map((linha, i) => {
                const valor = finito(ativo.porCandidato[linha.numero])
                const y = 32 + i * 17
                return (
                  <g key={linha.numero}>
                    <rect x="10" y={y - 1} width="14" height="2" fill={linha.cor} />
                    <text
                      x="30"
                      y={y}
                      fontSize="11"
                      dominantBaseline="middle"
                      fill="var(--color-tinta-2)"
                    >
                      {linha.nomeUrna}
                    </text>
                    <text
                      x={larguraCaixa - 10}
                      y={y}
                      textAnchor="end"
                      fontSize="12"
                      fontWeight="600"
                      dominantBaseline="middle"
                      className="tabular"
                      fill="var(--color-tinta)"
                    >
                      {valor === null ? '—' : `${doisDecimais.format(valor)}%`}
                    </text>
                  </g>
                )
              })}
            </g>
          </g>
        )}
      </svg>

      {temEstimativa && (
        <p className="mt-2 text-xs text-[var(--color-tinta-3)]">
          A estimativa pondera cada unidade federativa pelo eleitorado e pelo comparecimento,
          o que corrige o fato de algumas unidades totalizarem mais rápido que outras. Ela não
          corrige o fato de municípios pequenos totalizarem antes dos grandes dentro de cada
          unidade. A barra vertical é a variação recente da própria estimativa: não é intervalo
          de confiança e não mede erro amostral.
          {estimativa !== null && !estimativa.confiavel && (
            <>
              {' '}
              A cobertura ainda é baixa: a estimativa cobre{' '}
              {umDecimal.format(estimativa.coberturaEleitorado * 100)}% do eleitorado, em{' '}
              {estimativa.ufsComDado} unidades com seção totalizada, então ela ainda deve mudar.
            </>
          )}
        </p>
      )}

      <h3 className="mt-5 mb-1 text-sm font-medium text-[var(--color-tinta-3)]">
        Margem, em pontos percentuais
      </h3>

      <ul className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[var(--color-tinta-2)]">
        <li className="flex items-center gap-2">
          <svg width="16" height="2" aria-hidden="true" focusable="false">
            <rect width="16" height="2" fill={COR_DIFERENCA} />
          </svg>
          Diferença do primeiro para o segundo colocado
        </li>
        <li className="flex items-center gap-2">
          <svg width="16" height="2" aria-hidden="true" focusable="false">
            <rect width="16" height="2" fill={COR_ATE_METADE} />
          </svg>
          Líder em relação aos 50%
        </li>
      </ul>

      <svg
        ref={svgB}
        viewBox={`0 0 ${LARGURA} ${ALTURA_B}`}
        className="h-auto w-full rounded-xl border border-white/10 bg-[var(--color-superficie)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-tinta-2)]"
        role="img"
        tabIndex={0}
        aria-label={
          'Margem em pontos percentuais contra o percentual de seções totalizadas, na mesma ' +
          'escala horizontal do gráfico acima. Duas séries: a diferença do primeiro para o ' +
          'segundo colocado e a distância do líder até os 50%. Acima de zero o líder passou ' +
          'de 50%; abaixo, ainda não. Use as setas para percorrer as coletas.'
        }
        onKeyDown={aoTeclado}
        onPointerMove={(evento) => localizar(svgB.current, evento.clientX)}
        onPointerLeave={() => setIndice(null)}
      >
        {marcasB.map((marca) => (
          <g key={marca}>
            <line
              x1={X0}
              x2={X1}
              y1={escalaB(marca)}
              y2={escalaB(marca)}
              stroke="var(--color-grade)"
              strokeWidth="1"
            />
            <text
              x={X0 - 8}
              y={escalaB(marca)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="11"
              className="tabular"
              fill="var(--color-tinta-3)"
            >
              {umDecimal.format(marca)}
            </text>
          </g>
        ))}

        {/* O zero e linha de base explicita, com rotulo dos dois lados: a
            leitura nao pode depender so de estar acima ou abaixo. */}
        <line
          x1={X0}
          x2={X1}
          y1={escalaB(0)}
          y2={escalaB(0)}
          stroke="var(--color-base)"
          strokeWidth="1"
        />
        <text x={X0 + 6} y={escalaB(0) - 6} fontSize="10" fill="var(--color-tinta-3)">
          acima de zero: o líder passou de 50%
        </text>
        <text x={X0 + 6} y={escalaB(0) + 14} fontSize="10" fill="var(--color-tinta-3)">
          abaixo de zero: o líder ainda não chegou a 50%
        </text>

        <line x1={X0} x2={X1} y1={Y1_B} y2={Y1_B} stroke="var(--color-base)" strokeWidth="1" />

        {MARCAS_X.map((marca) => (
          <text
            key={marca}
            x={escalaX(marca)}
            y={Y1_B + 16}
            textAnchor="middle"
            fontSize="11"
            className="tabular"
            fill="var(--color-tinta-3)"
          >
            {marca}%
          </text>
        ))}
        <text
          x={(X0 + X1) / 2}
          y={Y1_B + 36}
          textAnchor="middle"
          fontSize="11"
          fill="var(--color-tinta-3)"
        >
          Seções totalizadas: mesma escala horizontal dos dois gráficos
        </text>

        {[
          { chave: 'diferenca' as const, cor: COR_DIFERENCA },
          { chave: 'ateMetade' as const, cor: COR_ATE_METADE },
        ].map((serie) => {
          const amostras = margem.map((ponto) => {
            const valor = ponto[serie.chave]
            return { x: escalaX(ponto.pst), y: valor === null ? null : escalaB(valor) }
          })
          return segmentos(amostras).map((caminho, i) => (
            <polyline
              key={`${serie.chave}-${i}`}
              points={caminho}
              fill="none"
              stroke={serie.cor}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))
        })}

        {(() => {
          const fim = margem[margem.length - 1]
          if (fim === undefined) return null
          const marcas: { chave: string; cor: string; valor: number }[] = []
          if (fim.diferenca !== null) {
            marcas.push({ chave: 'diferenca', cor: COR_DIFERENCA, valor: fim.diferenca })
          }
          if (fim.ateMetade !== null) {
            marcas.push({ chave: 'ateMetade', cor: COR_ATE_METADE, valor: fim.ateMetade })
          }
          const rotulos = afastar(
            marcas.map((marca) => ({
              numero: marca.chave,
              cor: marca.cor,
              texto: `${umDecimal.format(marca.valor)} p.p.`,
              yReal: escalaB(marca.valor),
              yRotulo: escalaB(marca.valor),
            })),
            15,
          )
          const xFim = escalaX(fim.pst)
          return rotulos.map((rotulo) => (
            <g key={rotulo.numero}>
              <circle
                cx={xFim}
                cy={rotulo.yReal}
                r="4"
                fill={rotulo.cor}
                stroke="var(--color-superficie)"
                strokeWidth="2"
              />
              <text
                x={X1 + 18}
                y={rotulo.yRotulo}
                dominantBaseline="middle"
                fontSize="12"
                fontWeight="600"
                className="tabular"
                fill="var(--color-tinta)"
              >
                {rotulo.texto}
              </text>
            </g>
          ))
        })()}

        {ativo !== null && margemAtiva !== null && (
          <g>
            <line
              x1={xAtivo}
              x2={xAtivo}
              y1={Y0_B}
              y2={Y1_B}
              stroke="var(--color-tinta-3)"
              strokeWidth="1"
            />
            {margemAtiva.diferenca !== null && (
              <circle
                cx={xAtivo}
                cy={escalaB(margemAtiva.diferenca)}
                r="4"
                fill={COR_DIFERENCA}
                stroke="var(--color-superficie)"
                strokeWidth="2"
              />
            )}
            {margemAtiva.ateMetade !== null && (
              <circle
                cx={xAtivo}
                cy={escalaB(margemAtiva.ateMetade)}
                r="4"
                fill={COR_ATE_METADE}
                stroke="var(--color-superficie)"
                strokeWidth="2"
              />
            )}
            <g transform={`translate(${xCaixaB}, ${Y0_B})`}>
              <rect
                width={caixaB}
                height="60"
                rx="6"
                fill="var(--color-plano)"
                stroke="var(--color-grade)"
                strokeWidth="1"
              />
              <text x="10" y="16" fontSize="11" className="tabular" fill="var(--color-tinta-3)">
                {doisDecimais.format(ativo.pst)}% das seções
              </text>
              <rect x="10" y="30" width="14" height="2" fill={COR_DIFERENCA} />
              <text x="30" y="31" fontSize="11" dominantBaseline="middle" fill="var(--color-tinta-2)">
                1º menos 2º
              </text>
              <text
                x={caixaB - 10}
                y="31"
                textAnchor="end"
                fontSize="12"
                fontWeight="600"
                dominantBaseline="middle"
                className="tabular"
                fill="var(--color-tinta)"
              >
                {margemAtiva.diferenca === null
                  ? '—'
                  : `${umDecimal.format(margemAtiva.diferenca)} p.p.`}
              </text>
              <rect x="10" y="47" width="14" height="2" fill={COR_ATE_METADE} />
              <text x="30" y="48" fontSize="11" dominantBaseline="middle" fill="var(--color-tinta-2)">
                Líder até 50%
              </text>
              <text
                x={caixaB - 10}
                y="48"
                textAnchor="end"
                fontSize="12"
                fontWeight="600"
                dominantBaseline="middle"
                className="tabular"
                fill="var(--color-tinta)"
              >
                {margemAtiva.ateMetade === null
                  ? '—'
                  : `${umDecimal.format(margemAtiva.ateMetade)} p.p.`}
              </text>
            </g>
          </g>
        )}
      </svg>

      <p className="sr-only" aria-live="polite">
        {resumoDoAtivo}
      </p>

      <p className="mt-2 text-xs text-[var(--color-tinta-3)]">
        {notaDeOrigem}
        {foraDaFigura > 0 &&
          ` As outras ${foraDaFigura} candidaturas ficam fora destas figuras: a tabela completa traz todas.`}
      </p>
    </section>
  )
}

export default SerieTemporal

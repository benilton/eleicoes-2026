import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { PontoSerie } from '../estado/useSerieTemporal'
import type { Candidatura } from '../tse/tipos'
import { corDaCandidatura, numerosComIdentidade } from './cores'

export interface SerieTemporalProps {
  serie: PontoSerie[]
  candidaturas: Candidatura[]
}

const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const LARGURA = 760
const ALTURA = 340
const MARGEM = { topo: 16, direita: 96, base: 40, esquerda: 46 }
const X0 = MARGEM.esquerda
const X1 = LARGURA - MARGEM.direita
const Y0 = MARGEM.topo
const Y1 = ALTURA - MARGEM.base

const MARCAS_X = [0, 25, 50, 75, 100]

interface Linha {
  numero: string
  nomeUrna: string
  partido: string
  cor: string
}

/** Mantem o rotulo de ponta preso a sua linha quando as curvas convergem. */
interface RotuloPonta {
  numero: string
  cor: string
  texto: string
  yReal: number
  yRotulo: number
}

/**
 * Convergencia da apuracao, em SVG inline.
 *
 * O eixo horizontal e o percentual de secoes totalizadas, nao o relogio: o que
 * se quer ler e como o resultado se estabiliza conforme a apuracao avanca, e o
 * TSE nao publica em ritmo constante. Apenas as tres candidaturas com cor de
 * identidade sao desenhadas; as demais ficam de fora, com nota dizendo isso.
 */
export function SerieTemporal({ serie, candidaturas }: SerieTemporalProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
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

  const pontos = [...serie].sort((a, b) => a.percentualSecoes - b.percentualSecoes)

  if (pontos.length < 2) {
    return (
      <section aria-label="Convergência da apuração">
        <h2 className="mb-2 text-sm font-medium text-[var(--color-tinta-3)]">
          Convergência conforme a apuração avança
        </h2>
        <p className="rounded-xl border border-white/10 bg-[var(--color-superficie)] p-6 text-sm text-[var(--color-tinta-2)]">
          A curva começa no momento em que esta página foi aberta. O TSE publica apenas a
          fotografia corrente da apuração: o histórico é acumulado aqui, no seu navegador,
          a cada nova coleta. {pontos.length === 0 ? 'Ainda não há' : 'Há apenas um'} ponto
          registrado, então ainda não há linha a desenhar.
        </p>
      </section>
    )
  }

  const valores = pontos.flatMap((ponto) =>
    linhas
      .map((linha) => ponto.porCandidato[linha.numero])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v)),
  )
  const maximo = valores.length > 0 ? Math.max(...valores) : 10
  const tetoY = Math.min(100, Math.max(10, Math.ceil((maximo * 1.1) / 10) * 10))
  const passoY = tetoY / 5
  const marcasY = [0, 1, 2, 3, 4, 5].map((i) => i * passoY)

  const escalaX = (percentualSecoes: number) =>
    X0 + (Math.max(0, Math.min(100, percentualSecoes)) / 100) * (X1 - X0)
  const escalaY = (valor: number) =>
    Y1 - (Math.max(0, Math.min(tetoY, valor)) / tetoY) * (Y1 - Y0)

  // Rotulos de ponta: quando as curvas convergem nao se empilha numero sobre
  // numero. Afasta-se o minimo e puxa-se uma linha de chamada ate a curva.
  const ultimo = pontos[pontos.length - 1]
  const rotulos: RotuloPonta[] = linhas
    .map((linha) => {
      const valor = ultimo.porCandidato[linha.numero]
      if (typeof valor !== 'number' || !Number.isFinite(valor)) return null
      const y = escalaY(valor)
      return {
        numero: linha.numero,
        cor: linha.cor,
        texto: `${doisDecimais.format(valor)}%`,
        yReal: y,
        yRotulo: y,
      }
    })
    .filter((r): r is RotuloPonta => r !== null)
    .sort((a, b) => a.yReal - b.yReal)

  const AFASTAMENTO = 15
  for (let i = 1; i < rotulos.length; i += 1) {
    const anterior = rotulos[i - 1].yRotulo
    if (rotulos[i].yRotulo - anterior < AFASTAMENTO) {
      rotulos[i].yRotulo = anterior + AFASTAMENTO
    }
  }

  const ativo = indice === null ? null : (pontos[indice] ?? null)

  const localizar = (clienteX: number) => {
    const elemento = svgRef.current
    if (elemento === null) return
    const caixa = elemento.getBoundingClientRect()
    if (caixa.width === 0) return
    const x = ((clienteX - caixa.left) * LARGURA) / caixa.width
    let melhor = 0
    let distancia = Number.POSITIVE_INFINITY
    for (let i = 0; i < pontos.length; i += 1) {
      const d = Math.abs(escalaX(pontos[i].percentualSecoes) - x)
      if (d < distancia) {
        distancia = d
        melhor = i
      }
    }
    setIndice(melhor)
  }

  const aoTeclado = (evento: KeyboardEvent<SVGSVGElement>) => {
    const atual = indice ?? pontos.length - 1
    if (evento.key === 'ArrowRight') {
      evento.preventDefault()
      setIndice(Math.min(pontos.length - 1, atual + 1))
    } else if (evento.key === 'ArrowLeft') {
      evento.preventDefault()
      setIndice(Math.max(0, atual - 1))
    } else if (evento.key === 'Home') {
      evento.preventDefault()
      setIndice(0)
    } else if (evento.key === 'End') {
      evento.preventDefault()
      setIndice(pontos.length - 1)
    } else if (evento.key === 'Escape') {
      setIndice(null)
    }
  }

  const resumoDoAtivo =
    ativo === null
      ? ''
      : `${doisDecimais.format(ativo.percentualSecoes)}% das seções. ` +
        linhas
          .map((linha) => {
            const valor = ativo.porCandidato[linha.numero]
            const texto =
              typeof valor === 'number' ? `${doisDecimais.format(valor)} por cento` : 'sem dado'
            return `${linha.nomeUrna}: ${texto}`
          })
          .join('. ')

  const larguraCaixa = 186
  const alturaCaixa = 26 + linhas.length * 17
  const xAtivo = ativo === null ? 0 : escalaX(ativo.percentualSecoes)
  const xCaixa =
    xAtivo > X1 - larguraCaixa - 12 ? xAtivo - larguraCaixa - 10 : xAtivo + 10

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
      </ul>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="h-auto w-full rounded-xl border border-white/10 bg-[var(--color-superficie)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-tinta-2)]"
        role="img"
        tabIndex={0}
        aria-label={
          `Linhas do percentual de votos de ${linhas.map((l) => l.nomeUrna).join(', ')} ` +
          `contra o percentual de seções totalizadas, com ${pontos.length} coletas. ` +
          'Use as setas para percorrer as coletas.'
        }
        onKeyDown={aoTeclado}
        onPointerMove={(evento) => localizar(evento.clientX)}
        onPointerLeave={() => setIndice(null)}
      >
        {marcasY.map((marca) => (
          <g key={marca}>
            <line
              x1={X0}
              x2={X1}
              y1={escalaY(marca)}
              y2={escalaY(marca)}
              stroke="var(--color-grade)"
              strokeWidth="1"
            />
            <text
              x={X0 - 8}
              y={escalaY(marca)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="11"
              className="tabular"
              fill="var(--color-tinta-3)"
            >
              {marca}%
            </text>
          </g>
        ))}

        <line x1={X0} x2={X1} y1={Y1} y2={Y1} stroke="var(--color-base)" strokeWidth="1" />

        {MARCAS_X.map((marca) => (
          <text
            key={marca}
            x={escalaX(marca)}
            y={Y1 + 16}
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
          y={ALTURA - 6}
          textAnchor="middle"
          fontSize="11"
          fill="var(--color-tinta-3)"
        >
          Seções totalizadas
        </text>

        {linhas.map((linha) => {
          const caminho = pontos
            .map((ponto) => {
              const valor = ponto.porCandidato[linha.numero]
              if (typeof valor !== 'number' || !Number.isFinite(valor)) return null
              return `${escalaX(ponto.percentualSecoes)},${escalaY(valor)}`
            })
            .filter((p): p is string => p !== null)
            .join(' ')
          if (caminho === '') return null
          return (
            <polyline
              key={linha.numero}
              points={caminho}
              fill="none"
              stroke={linha.cor}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )
        })}

        {rotulos.map((rotulo) => (
          <g key={rotulo.numero}>
            {Math.abs(rotulo.yRotulo - rotulo.yReal) > 1 && (
              <polyline
                points={`${X1},${rotulo.yReal} ${X1 + 8},${rotulo.yReal} ${X1 + 14},${rotulo.yRotulo}`}
                fill="none"
                stroke="var(--color-base)"
                strokeWidth="1"
              />
            )}
            <circle
              cx={X1}
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
        ))}

        {ativo !== null && (
          <g>
            <line
              x1={xAtivo}
              x2={xAtivo}
              y1={Y0}
              y2={Y1}
              stroke="var(--color-tinta-3)"
              strokeWidth="1"
            />
            {linhas.map((linha) => {
              const valor = ativo.porCandidato[linha.numero]
              if (typeof valor !== 'number' || !Number.isFinite(valor)) return null
              return (
                <circle
                  key={linha.numero}
                  cx={xAtivo}
                  cy={escalaY(valor)}
                  r="4"
                  fill={linha.cor}
                  stroke="var(--color-superficie)"
                  strokeWidth="2"
                />
              )
            })}

            <g transform={`translate(${xCaixa}, ${Y0 + 8})`}>
              <rect
                width={larguraCaixa}
                height={alturaCaixa}
                rx="6"
                fill="var(--color-plano)"
                stroke="var(--color-grade)"
                strokeWidth="1"
              />
              <text
                x="10"
                y="16"
                fontSize="11"
                className="tabular"
                fill="var(--color-tinta-3)"
              >
                {doisDecimais.format(ativo.percentualSecoes)}% das seções
              </text>
              {linhas.map((linha, i) => {
                const valor = ativo.porCandidato[linha.numero]
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
                      {typeof valor === 'number' ? `${doisDecimais.format(valor)}%` : '—'}
                    </text>
                  </g>
                )
              })}
            </g>
          </g>
        )}
      </svg>

      <p className="sr-only" aria-live="polite">
        {resumoDoAtivo}
      </p>

      <p className="mt-2 text-xs text-[var(--color-tinta-3)]">
        Eixo horizontal: percentual de seções totalizadas. Eixo vertical: percentual de
        votos válidos. A curva começa no momento em que esta página foi aberta, porque o
        TSE publica apenas a fotografia corrente.
        {foraDaFigura > 0 &&
          ` As outras ${foraDaFigura} candidaturas ficam fora desta figura: a tabela completa traz todas.`}
      </p>
    </section>
  )
}

export default SerieTemporal

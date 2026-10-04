import type { SerieUf } from '../estado/useHistorico'
import type { Candidatura } from '../tse/tipos'
import { corDaCandidatura, numerosComIdentidade } from './cores'

export interface ConvergenciaUFProps {
  ufs: Record<string, SerieUf>
  candidaturas: Candidatura[]
  ufSelecionada: string | null
  aoSelecionar: (uf: string) => void
}

const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// Geometria da miniatura. A escala e a mesma em todas: horizontal de 0 a 100 de
// secoes totalizadas, vertical de 0 a 100 de percentual de votos. Escala
// compartilhada e o que torna pequenos multiplos comparaveis: se cada quadro
// tivesse o proprio teto, a forma da curva deixaria de significar alguma coisa.
const MINI_LARGURA = 120
const MINI_ALTURA = 64
const MINI_MARGEM = 3
const MINI_X0 = MINI_MARGEM
const MINI_X1 = MINI_LARGURA - MINI_MARGEM
const MINI_Y0 = MINI_MARGEM
const MINI_Y1 = MINI_ALTURA - MINI_MARGEM

const LIMITE_SEGUNDO_TURNO = 50

const miniX = (percentualSecoes: number): number =>
  MINI_X0 + (Math.max(0, Math.min(100, percentualSecoes)) / 100) * (MINI_X1 - MINI_X0)

const miniY = (percentualVotos: number): number =>
  MINI_Y1 - (Math.max(0, Math.min(100, percentualVotos)) / 100) * (MINI_Y1 - MINI_Y0)

interface Linha {
  numero: string
  nomeUrna: string
  partido: string
  cor: string
}

/** Uma miniatura pronta para desenhar, ja com as curvas e o rotulo resolvidos. */
interface Miniatura {
  chave: string
  sigla: string
  pstAtual: number
  suficiente: boolean
  curvas: { numero: string; cor: string; caminho: string; ultimo: number | null }[]
}

const finito = (valor: number | undefined): number | null =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : null

/** Identidades desenhadas, com o teto de tres candidaturas da disciplina de cor. */
function linhasDeIdentidade(candidaturas: Candidatura[]): Linha[] {
  const identidade = numerosComIdentidade()
  const porVoto = [...candidaturas].sort((a, b) => b.votos - a.votos)
  const escolhidas =
    identidade.length > 0
      ? identidade
          .map((numero) => candidaturas.find((c) => c.numero === numero))
          .filter((c): c is Candidatura => c !== undefined)
      : porVoto.slice(0, 3)

  return escolhidas.map((c) => ({
    numero: c.numero,
    nomeUrna: c.nomeUrna,
    partido: c.partido,
    cor: corDaCandidatura(c.numero),
  }))
}

/** Monta a miniatura de uma unidade federativa, ordenando os pontos por seções. */
function montarMiniatura(chave: string, serie: SerieUf, linhas: Linha[]): Miniatura {
  const indices = serie.pst
    .map((pst, indice) => ({ pst, indice }))
    .filter((item): item is { pst: number; indice: number } => Number.isFinite(item.pst))
    .sort((a, b) => a.pst - b.pst)

  const ultimoIndice = indices[indices.length - 1]
  const pstAtual = ultimoIndice === undefined ? 0 : ultimoIndice.pst

  const curvas = linhas.map((linha) => {
    const valores = serie.porCandidato[linha.numero]
    const pares: string[] = []
    let ultimo: number | null = null
    if (valores !== undefined) {
      for (const item of indices) {
        const valor = finito(valores[item.indice])
        if (valor === null) continue
        pares.push(`${miniX(item.pst)},${miniY(valor)}`)
        ultimo = valor
      }
    }
    return {
      numero: linha.numero,
      cor: linha.cor,
      caminho: pares.length > 1 ? pares.join(' ') : '',
      ultimo,
    }
  })

  const suficiente = indices.length > 1 && curvas.some((curva) => curva.caminho !== '')

  return {
    chave,
    sigla: (serie.sigla === '' ? chave : serie.sigla).toUpperCase(),
    pstAtual,
    suficiente,
    curvas,
  }
}

/**
 * Pequenos multiplos da convergencia por unidade federativa.
 *
 * Uma miniatura por unidade, todas na mesma escala e sem eixo proprio. O eixo
 * de referencia aparece uma unica vez, fora da grade: repetir eixo em vinte e
 * sete quadros gastaria tinta de cromo onde deveria haver dado. A ordem e por
 * secoes totalizadas decrescente, de modo que as unidades ja estabilizadas
 * aparecem primeiro.
 */
export function ConvergenciaUF({
  ufs,
  candidaturas,
  ufSelecionada,
  aoSelecionar,
}: ConvergenciaUFProps) {
  const linhas = linhasDeIdentidade(candidaturas)
  const selecionada = ufSelecionada === null ? null : ufSelecionada.toUpperCase()

  const miniaturas = Object.entries(ufs)
    .map(([chave, serie]) => montarMiniatura(chave, serie, linhas))
    .sort((a, b) => b.pstAtual - a.pstAtual || a.sigla.localeCompare(b.sigla, 'pt-BR'))

  if (miniaturas.length === 0) {
    return (
      <section aria-label="Convergência por unidade federativa">
        <h2 className="mb-2 text-sm font-medium text-[var(--color-tinta-3)]">
          Convergência por unidade federativa
        </h2>
        <p className="rounded-xl border border-white/10 bg-[var(--color-superficie)] p-6 text-sm text-[var(--color-tinta-2)]">
          Ainda não há série por unidade federativa. O histórico publicado no repositório é a
          origem desses quadros: enquanto ele não existir, não há o que desenhar aqui. A tabela
          completa continua trazendo a fotografia corrente de cada unidade.
        </p>
      </section>
    )
  }

  const comDado = miniaturas.filter((mini) => mini.suficiente).length

  return (
    <section aria-label="Convergência por unidade federativa">
      <h2 className="mb-1 text-sm font-medium text-[var(--color-tinta-3)]">
        Convergência por unidade federativa
      </h2>

      <div className="mb-3 flex flex-wrap items-start gap-x-8 gap-y-3">
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[var(--color-tinta-2)]">
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

        {/* Eixo de referencia unico: explica a escala uma vez, em vez de repetir
            eixo em cada miniatura. */}
        <figure className="m-0 flex items-center gap-3">
          <svg
            viewBox="0 0 176 104"
            width="176"
            height="104"
            role="img"
            aria-label="Eixo de referência das miniaturas: horizontal de 0 a 100 por cento de seções totalizadas, vertical de 0 a 100 por cento de votos, com a linha dos 50 por cento."
          >
            <rect
              x="30"
              y="8"
              width="134"
              height="64"
              fill="none"
              stroke="var(--color-grade)"
              strokeWidth="1"
            />
            <line
              x1="30"
              x2="164"
              y1={8 + 64 / 2}
              y2={8 + 64 / 2}
              stroke="var(--color-base)"
              strokeWidth="1"
            />
            <text
              x="26"
              y="12"
              textAnchor="end"
              fontSize="9"
              className="tabular"
              fill="var(--color-tinta-3)"
            >
              100%
            </text>
            <text
              x="26"
              y={8 + 64 / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="9"
              className="tabular"
              fill="var(--color-tinta-3)"
            >
              50%
            </text>
            <text
              x="26"
              y="72"
              textAnchor="end"
              fontSize="9"
              className="tabular"
              fill="var(--color-tinta-3)"
            >
              0%
            </text>
            <text x="30" y="84" fontSize="9" className="tabular" fill="var(--color-tinta-3)">
              0%
            </text>
            <text
              x="164"
              y="84"
              textAnchor="end"
              fontSize="9"
              className="tabular"
              fill="var(--color-tinta-3)"
            >
              100%
            </text>
            <text x="97" y="98" textAnchor="middle" fontSize="9" fill="var(--color-tinta-3)">
              seções totalizadas
            </text>
          </svg>
          <figcaption className="max-w-50 text-xs text-[var(--color-tinta-3)]">
            Todas as miniaturas usam esta escala. A linha do meio marca os 50% dos votos.
          </figcaption>
        </figure>
      </div>

      <ul className="grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {miniaturas.map((mini) => {
          const ehSelecionada = selecionada !== null && mini.sigla === selecionada
          const resumo = mini.suficiente
            ? mini.curvas
                .map((curva) => {
                  const linha = linhas.find((l) => l.numero === curva.numero)
                  const nome = linha === undefined ? curva.numero : linha.nomeUrna
                  return curva.ultimo === null
                    ? `${nome} sem dado`
                    : `${nome} ${doisDecimais.format(curva.ultimo)} por cento`
                })
                .join(', ')
            : 'sem série suficiente para desenhar a curva'

          return (
            <li key={mini.chave}>
              <button
                type="button"
                onClick={() => aoSelecionar(mini.chave)}
                aria-pressed={ehSelecionada}
                aria-label={
                  `${mini.sigla}: ${doisDecimais.format(mini.pstAtual)} por cento das seções ` +
                  `totalizadas. ${resumo}.`
                }
                className={`w-full rounded-lg border bg-[var(--color-superficie)] p-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-tinta-2)] ${
                  ehSelecionada
                    ? 'border-[var(--color-tinta-2)] ring-1 ring-[var(--color-tinta-2)]'
                    : 'border-white/10'
                }`}
              >
                <svg
                  viewBox={`0 0 ${MINI_LARGURA} ${MINI_ALTURA}`}
                  className="h-auto w-full"
                  aria-hidden="true"
                  focusable="false"
                >
                  <rect
                    x={MINI_X0}
                    y={MINI_Y0}
                    width={MINI_X1 - MINI_X0}
                    height={MINI_Y1 - MINI_Y0}
                    fill="none"
                    stroke="var(--color-grade)"
                    strokeWidth="1"
                  />
                  <line
                    x1={MINI_X0}
                    x2={MINI_X1}
                    y1={miniY(LIMITE_SEGUNDO_TURNO)}
                    y2={miniY(LIMITE_SEGUNDO_TURNO)}
                    stroke="var(--color-base)"
                    strokeWidth="1"
                  />
                  {mini.suficiente ? (
                    mini.curvas.map((curva) =>
                      curva.caminho === '' ? null : (
                        <polyline
                          key={curva.numero}
                          points={curva.caminho}
                          fill="none"
                          stroke={curva.cor}
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      ),
                    )
                  ) : (
                    // Moldura vazia, nunca uma curva inventada para preencher.
                    <text
                      x={MINI_LARGURA / 2}
                      y={MINI_ALTURA / 2 + 4}
                      textAnchor="middle"
                      fontSize="10"
                      fill="var(--color-contexto)"
                    >
                      sem dado
                    </text>
                  )}
                </svg>
                <div className="mt-1 flex items-baseline justify-between gap-1">
                  <span
                    className={`text-xs font-medium ${
                      mini.suficiente ? 'text-[var(--color-tinta)]' : 'text-[var(--color-tinta-3)]'
                    }`}
                  >
                    {mini.sigla}
                  </span>
                  <span className="tabular text-[10px] text-[var(--color-tinta-3)]">
                    {doisDecimais.format(mini.pstAtual)}%
                  </span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="mt-2 text-xs text-[var(--color-tinta-3)]">
        Cada quadro é uma unidade federativa, na ordem decrescente de seções totalizadas: as
        unidades já estabilizadas aparecem primeiro. O percentual ao lado da sigla é o de seções
        totalizadas daquela unidade, não o de votos. {comDado} das {miniaturas.length} unidades
        têm série suficiente para desenhar a curva.
      </p>
    </section>
  )
}

export default ConvergenciaUF

import { useEffect, useMemo, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent, MouseEvent } from 'react'

// Rampa sequencial de uma cor so, do claro ao escuro, documentada na
// disciplina de visualizacao do projeto. Sete classes e o teto util: acima
// disso as classes vizinhas deixam de ser distinguiveis.
const RAMPA_AZUL = [
  '#cde2fb',
  '#9ec5f4',
  '#6da7ec',
  '#3987e5',
  '#256abf',
  '#184f95',
  '#0d366b',
] as const

const COR_BASE_PADRAO = '#3987e5'
const CLASSES = RAMPA_AZUL.length
const COR_SEM_DADO = 'var(--color-grade)'

// Fatores medidos na rampa azul: o passo 4 e a propria cor base, os tres
// anteriores caminham para o branco e os tres seguintes para o preto.
const PARA_CLARO = [0.78, 0.52, 0.27]
const PARA_ESCURO = [0.22, 0.42, 0.6]

interface UfMalha {
  sigla: string
  nome: string
  d: string
}

interface Malha {
  viewBox: string
  ufs: UfMalha[]
}

interface Dica {
  sigla: string
  nome: string
  valor: number | null
  x: number
  y: number
}

export interface MapaUFProps {
  /** Sigla minuscula da unidade federativa para o percentual da candidatura escolhida. */
  percentualPorUf: Record<string, number | null>
  ufSelecionada: string | null
  aoSelecionar: (uf: string) => void
  rotuloCandidatura: string
  /** Cor base da rampa sequencial, em hexadecimal. Padrao: a rampa azul. */
  corBase?: string
}

const percentual = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function hexParaRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = Number.parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mistura(rgb: [number, number, number], alvo: number, t: number): string {
  const canal = (c: number) => Math.round(c + (alvo - c) * t)
  return `rgb(${canal(rgb[0])} ${canal(rgb[1])} ${canal(rgb[2])})`
}

/**
 * Deriva sete passos claro-escuro a partir da cor base. Quando a base e a
 * documentada, devolve a rampa validada tal como esta, sem recalcular.
 */
function rampaDe(corBase: string): readonly string[] {
  if (corBase.toLowerCase() === COR_BASE_PADRAO) return RAMPA_AZUL
  const rgb = hexParaRgb(corBase)
  if (!rgb) return RAMPA_AZUL
  return [
    ...PARA_CLARO.map((t) => mistura(rgb, 255, t)).reverse(),
    corBase,
    ...PARA_ESCURO.map((t) => mistura(rgb, 0, t)),
  ]
}

function ehMalha(valor: unknown): valor is Malha {
  if (typeof valor !== 'object' || valor === null) return false
  const obj = valor as Record<string, unknown>
  if (typeof obj.viewBox !== 'string' || !Array.isArray(obj.ufs)) return false
  return obj.ufs.every((uf) => {
    if (typeof uf !== 'object' || uf === null) return false
    const u = uf as Record<string, unknown>
    return typeof u.sigla === 'string' && typeof u.nome === 'string' && typeof u.d === 'string'
  })
}

export default function MapaUF({
  percentualPorUf,
  ufSelecionada,
  aoSelecionar,
  rotuloCandidatura,
  corBase = COR_BASE_PADRAO,
}: MapaUFProps) {
  const [malha, setMalha] = useState<Malha | null>(null)
  const [falhaMalha, setFalhaMalha] = useState(false)
  const [dica, setDica] = useState<Dica | null>(null)
  const [ufAtiva, setUfAtiva] = useState<string | null>(null)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controlador = new AbortController()
    fetch(`${import.meta.env.BASE_URL}uf-geo.json`, { signal: controlador.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((corpo: unknown) => {
        if (!ehMalha(corpo)) throw new Error('malha em formato inesperado')
        setMalha(corpo)
      })
      .catch(() => {
        if (!controlador.signal.aborted) setFalhaMalha(true)
      })
    return () => controlador.abort()
  }, [])

  const rampa = useMemo(() => rampaDe(corBase), [corBase])

  // Dominio arredondado para ponto percentual inteiro. O arredondamento
  // segura a escala entre duas coletas: ruido de centesimos nao repinta o
  // mapa inteiro a cada atualizacao do TSE.
  const escala = useMemo(() => {
    const valores = Object.values(percentualPorUf).filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v),
    )
    if (valores.length === 0) return null
    const piso = Math.floor(Math.min(...valores))
    const teto = Math.ceil(Math.max(...valores))
    return { piso, teto: teto > piso ? teto : piso + 1 }
  }, [percentualPorUf])

  const corDe = (valor: number | null): string => {
    if (valor === null || !escala) return COR_SEM_DADO
    const razao = (valor - escala.piso) / (escala.teto - escala.piso)
    const classe = Math.min(CLASSES - 1, Math.max(0, Math.floor(razao * CLASSES)))
    return rampa[classe]
  }

  const valorDe = (sigla: string): number | null => {
    const v = percentualPorUf[sigla]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }

  const textoValor = (valor: number | null) =>
    valor === null ? 'sem dado' : `${percentual.format(valor)}%`

  const posicionar = (sigla: string, nome: string, x: number, y: number) => {
    const area = caixa.current?.getBoundingClientRect()
    if (!area) return
    setDica({ sigla, nome, valor: valorDe(sigla), x: x - area.left, y: y - area.top })
  }

  const aoPassar = (e: MouseEvent<SVGPathElement>, uf: UfMalha) => {
    posicionar(uf.sigla, uf.nome, e.clientX, e.clientY)
  }

  const aoFocar = (e: FocusEvent<SVGPathElement>, uf: UfMalha) => {
    const r = e.currentTarget.getBoundingClientRect()
    setUfAtiva(uf.sigla)
    posicionar(uf.sigla, uf.nome, r.left + r.width / 2, r.top)
  }

  const aoTeclar = (e: KeyboardEvent<SVGPathElement>, sigla: string) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    aoSelecionar(sigla)
  }

  const limpar = () => {
    setDica(null)
    setUfAtiva(null)
  }

  if (falhaMalha) {
    return (
      <p className="text-sm text-[var(--color-alerta)]">
        Não foi possível carregar a malha das unidades federativas. O mapa fica
        indisponível; os números por estado seguem na tabela da apuração.
      </p>
    )
  }

  if (!malha) {
    return (
      <p className="text-sm text-[var(--color-tinta-3)]">Carregando a malha do mapa…</p>
    )
  }

  const destaque = malha.ufs.filter((u) => u.sigla === ufAtiva || u.sigla === ufSelecionada)

  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-sm text-[var(--color-tinta-2)]">
        Percentual de votos de {rotuloCandidatura} por unidade federativa
      </figcaption>

      <div ref={caixa} className="relative">
        <svg
          viewBox={malha.viewBox}
          className="h-auto w-full max-w-xl"
          role="group"
          aria-label={`Mapa do Brasil com o percentual de ${rotuloCandidatura} em cada unidade federativa. Selecione uma unidade para detalhar.`}
        >
          <g>
            {malha.ufs.map((uf) => {
              const valor = valorDe(uf.sigla)
              const selecionada = uf.sigla === ufSelecionada
              return (
                <path
                  key={uf.sigla}
                  d={uf.d}
                  fill={corDe(valor)}
                  stroke="var(--color-plano)"
                  strokeWidth={1}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  role="button"
                  tabIndex={0}
                  aria-pressed={selecionada}
                  className="cursor-pointer outline-none"
                  onClick={() => aoSelecionar(uf.sigla)}
                  onKeyDown={(e) => aoTeclar(e, uf.sigla)}
                  onMouseMove={(e) => aoPassar(e, uf)}
                  onMouseEnter={() => setUfAtiva(uf.sigla)}
                  onMouseLeave={limpar}
                  onFocus={(e) => aoFocar(e, uf)}
                  onBlur={limpar}
                >
                  <title>{`${uf.nome} (${uf.sigla.toUpperCase()}): ${textoValor(valor)}`}</title>
                </path>
              )
            })}
          </g>

          {/* Contorno de selecao e anel de foco ficam numa camada acima, porque
              o traco de um estado seria coberto pelo preenchimento do vizinho. */}
          <g pointerEvents="none">
            {destaque.map((uf) => (
              <path
                key={uf.sigla}
                d={uf.d}
                fill="none"
                stroke="var(--color-tinta)"
                strokeWidth={uf.sigla === ufSelecionada ? 2.5 : 1.5}
                strokeDasharray={uf.sigla === ufSelecionada ? undefined : '4 3'}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </svg>

        {dica && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md border border-white/10 bg-[var(--color-superficie)] px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
            style={{ left: dica.x, top: dica.y }}
            role="presentation"
          >
            <span className="font-medium">{dica.sigla.toUpperCase()}</span>
            <span className="ml-1.5 text-[var(--color-tinta-2)]">{dica.nome}</span>
            <span className="tabular ml-2.5">{textoValor(dica.valor)}</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-tinta-3)]">
        <div className="flex items-center gap-2">
          <span className="tabular">
            {escala ? `${percentual.format(escala.piso)}%` : '—'}
          </span>
          <span className="flex" aria-hidden="true">
            {rampa.map((cor) => (
              <span key={cor} className="h-3 w-6" style={{ backgroundColor: cor }} />
            ))}
          </span>
          <span className="tabular">
            {escala ? `${percentual.format(escala.teto)}%` : '—'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-6 border border-white/10"
            style={{ backgroundColor: COR_SEM_DADO }}
            aria-hidden="true"
          />
          <span>sem dado</span>
        </div>
      </div>

      {/* Gêmea em tabela: o valor de cada unidade federativa precisa ser
          legível sem depender de cor nem de passar o ponteiro. */}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-[var(--color-tinta-3)]">
          Ver os valores em tabela
        </summary>
        <table className="mt-3 w-full border-collapse text-sm">
          <caption className="sr-only">
            Percentual de {rotuloCandidatura} por unidade federativa
          </caption>
          <thead>
            <tr className="border-b border-[var(--color-grade)] text-left text-xs text-[var(--color-tinta-3)]">
              <th scope="col" className="py-1.5 font-medium">
                Unidade federativa
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Percentual
              </th>
            </tr>
          </thead>
          <tbody>
            {malha.ufs.map((uf) => (
              <tr key={uf.sigla} className="border-b border-[var(--color-grade)]">
                <th scope="row" className="py-1 font-normal">
                  <button
                    type="button"
                    className="cursor-pointer text-left underline-offset-2 hover:underline"
                    aria-pressed={uf.sigla === ufSelecionada}
                    onClick={() => aoSelecionar(uf.sigla)}
                  >
                    <span className="tabular mr-2 text-[var(--color-tinta-3)]">
                      {uf.sigla.toUpperCase()}
                    </span>
                    {uf.nome}
                  </button>
                </th>
                <td className="tabular py-1 text-right text-[var(--color-tinta-2)]">
                  {textoValor(valorDe(uf.sigla))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

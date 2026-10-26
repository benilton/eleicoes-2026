import type { CandidatoReplay, PontoReplay } from '../estado/useReplay'
import { corDaCandidatura } from './cores'

export interface LinhaDoTempoProps {
  pontos: PontoReplay[]
  candidatos: CandidatoReplay[]
  /** Ponto em que a reprodução está, marcado por uma guia vertical. */
  indiceAtual: number
  /** Chamado ao clicar no gráfico, com o índice do ponto mais próximo. */
  aoEscolher?: (indice: number) => void
}

const LARGURA = 1000
const ALTURA = 420
const MARGEM = { topo: 16, direita: 16, baixo: 38, esquerda: 46 }
const X0 = MARGEM.esquerda
const X1 = LARGURA - MARGEM.direita
const Y0 = MARGEM.topo
const Y1 = ALTURA - MARGEM.baixo

/** Janela padrão do eixo vertical, a mesma do gráfico de convergência. */
const JANELA_PISO = 42
const JANELA_TETO = 58

/**
 * Pausa, em segundos, a partir da qual o trecho anterior é descartado.
 *
 * Na noite de 25 de outubro de 2026 o TSE publicou às 17h06 e ficou quase
 * duas horas sem publicar de novo. Com o eixo em hora, aquele trecho virava
 * uma reta ocupando metade da largura, sem informação nenhuma. A regra é
 * geométrica, não uma hora escrita à mão: o gráfico começa no ponto que
 * encerra a maior pausa, quando ela passa deste limite. Assim não depende do
 * fuso de quem está lendo nem da data do pleito.
 */
const PAUSA_QUE_CORTA = 20 * 60

const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const horaMinuto = (t: number) =>
  new Date(t * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/**
 * Apurado e projeção no mesmo eixo, contra o relógio.
 *
 * Os dois são percentual sobre voto nominal, então dividem o eixo vertical de
 * propósito: escalas separadas para a mesma unidade fariam duas curvas
 * comparáveis parecerem distantes, ou o contrário, conforme o corte de cada
 * eixo. A distinção fica no traço, cheio para o apurado e tracejado para a
 * projeção, e na faixa sombreada em volta da projeção.
 */
export default function LinhaDoTempo({
  pontos,
  candidatos,
  indiceAtual,
  aoEscolher,
}: LinhaDoTempoProps) {
  // Antes da primeira seção totalizada não há apurado: o ponto entraria como
  // zero e esmagaria a escala.
  const comApuracao = pontos.map((_, i) => i).filter((i) => pontos[i].pst > 0)

  // Maior pausa entre coletas consecutivas. O gráfico começa logo depois dela.
  let corte = 0
  let maiorPausa = 0
  for (let k = 1; k < comApuracao.length; k += 1) {
    const pausa = pontos[comApuracao[k]].t - pontos[comApuracao[k - 1]].t
    if (pausa > maiorPausa) {
      maiorPausa = pausa
      corte = k
    }
  }
  const recortado = maiorPausa >= PAUSA_QUE_CORTA ? comApuracao.slice(corte) : comApuracao
  const indices = recortado.length >= 2 ? recortado : comApuracao

  if (indices.length < 2) {
    return (
      <p className="text-sm text-[var(--color-tinta-3)]">
        Ainda não há pontos suficientes para desenhar a linha do tempo.
      </p>
    )
  }

  const t0 = pontos[indices[0]].t
  const t1 = pontos[indices[indices.length - 1]].t
  const escalaX = (t: number) =>
    t1 === t0 ? X0 : X0 + ((t - t0) / (t1 - t0)) * (X1 - X0)

  const valores: number[] = []
  for (const i of indices) {
    for (const cand of candidatos) {
      const apurado = pontos[i].pct[cand.numero] ?? 0
      if (apurado > 0) valores.push(apurado)
      const proj = pontos[i].proj[cand.numero] ?? 0
      if (proj > 0) {
        const meia = pontos[i].faixa[cand.numero] ?? 0
        valores.push(proj + meia)
        valores.push(proj - meia)
      }
    }
  }
  const piso = Math.max(0, Math.min(JANELA_PISO, Math.floor(Math.min(...valores) - 1)))
  const teto = Math.min(100, Math.max(JANELA_TETO, Math.ceil(Math.max(...valores) + 1)))
  const escalaY = (p: number) =>
    Y1 - ((Math.max(piso, Math.min(teto, p)) - piso) / (teto - piso)) * (Y1 - Y0)

  const marcasY = [0, 1, 2, 3, 4].map((k) => piso + ((teto - piso) / 4) * k)

  // Uma marca por hora cheia dentro do intervalo coberto.
  const marcasX: number[] = []
  const passo = 3600
  const primeira = Math.ceil(t0 / passo) * passo
  for (let t = primeira; t <= t1; t += passo) marcasX.push(t)

  const caminhoDe = (campo: 'pct' | 'proj', numero: string) =>
    indices
      .filter((i) => (pontos[i][campo][numero] ?? 0) > 0)
      .map((i, ordem) => {
        const x = escalaX(pontos[i].t)
        const y = escalaY(pontos[i][campo][numero])
        return `${ordem === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')

  const areaDaFaixa = (numero: string) => {
    const comProjecao = indices.filter((i) => (pontos[i].proj[numero] ?? 0) > 0)
    if (comProjecao.length < 2) return ''
    const alto = comProjecao.map((i) => {
      const x = escalaX(pontos[i].t)
      const y = escalaY(pontos[i].proj[numero] + (pontos[i].faixa[numero] ?? 0))
      return `${x.toFixed(1)} ${y.toFixed(1)}`
    })
    const baixo = [...comProjecao].reverse().map((i) => {
      const x = escalaX(pontos[i].t)
      const y = escalaY(pontos[i].proj[numero] - (pontos[i].faixa[numero] ?? 0))
      return `${x.toFixed(1)} ${y.toFixed(1)}`
    })
    return `M${alto.join(' L')} L${baixo.join(' L')} Z`
  }

  const atual = pontos[Math.max(0, Math.min(pontos.length - 1, indiceAtual))]
  const xAtual = atual !== undefined && atual.pst > 0 ? escalaX(atual.t) : null

  const aoClicar = (evento: React.MouseEvent<SVGSVGElement>) => {
    if (aoEscolher === undefined) return
    const caixa = evento.currentTarget.getBoundingClientRect()
    const proporcao = (evento.clientX - caixa.left) / caixa.width
    const alvo = t0 + proporcao * (t1 - t0)
    let melhor = indices[0]
    for (const i of indices) {
      if (Math.abs(pontos[i].t - alvo) < Math.abs(pontos[melhor].t - alvo)) melhor = i
    }
    aoEscolher(melhor)
  }

  return (
    <figure className="m-0">
      <figcaption className="mb-2 text-sm text-[var(--color-tinta-2)]">
        Apurado e projeção ao longo da noite. Linha cheia é o apurado, linha tracejada é a
        projeção e a faixa sombreada é a dispersão em volta dela.
      </figcaption>

      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="h-auto w-full cursor-crosshair"
        role="img"
        aria-label="Percentual apurado e projetado de cada candidatura ao longo da noite"
        onClick={aoClicar}
      >
        {marcasY.map((marca) => (
          <g key={marca}>
            <line
              x1={X0}
              x2={X1}
              y1={escalaY(marca)}
              y2={escalaY(marca)}
              stroke="var(--color-grade)"
              strokeWidth={1}
            />
            <text
              x={X0 - 8}
              y={escalaY(marca)}
              fill="var(--color-tinta-3)"
              fontSize={13}
              textAnchor="end"
              dominantBaseline="central"
            >
              {Math.round(marca)}%
            </text>
          </g>
        ))}

        <line
          x1={X0}
          x2={X1}
          y1={escalaY(50)}
          y2={escalaY(50)}
          stroke="var(--color-tinta-3)"
          strokeWidth={1}
          strokeDasharray="5 4"
        />

        {marcasX.map((t) => (
          <text
            key={t}
            x={escalaX(t)}
            y={Y1 + 22}
            fill="var(--color-tinta-3)"
            fontSize={13}
            textAnchor="middle"
          >
            {horaMinuto(t)}
          </text>
        ))}

        {candidatos.map((cand) => (
          <path
            key={`faixa-${cand.numero}`}
            d={areaDaFaixa(cand.numero)}
            fill={corDaCandidatura(cand.numero)}
            opacity={0.18}
          />
        ))}

        {candidatos.map((cand) => (
          <path
            key={`proj-${cand.numero}`}
            d={caminhoDe('proj', cand.numero)}
            fill="none"
            stroke={corDaCandidatura(cand.numero)}
            strokeWidth={1.75}
            strokeDasharray="6 4"
            strokeLinejoin="round"
          />
        ))}

        {candidatos.map((cand) => (
          <path
            key={`apur-${cand.numero}`}
            d={caminhoDe('pct', cand.numero)}
            fill="none"
            stroke={corDaCandidatura(cand.numero)}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        ))}

        {xAtual !== null && (
          <g>
            <line
              x1={xAtual}
              x2={xAtual}
              y1={Y0}
              y2={Y1}
              stroke="var(--color-tinta)"
              strokeWidth={1.5}
            />
            {candidatos.map((cand) => {
              const p = atual.pct[cand.numero] ?? 0
              if (!(p > 0)) return null
              return (
                <circle
                  key={`ponto-${cand.numero}`}
                  cx={xAtual}
                  cy={escalaY(p)}
                  r={4.5}
                  fill={corDaCandidatura(cand.numero)}
                  stroke="var(--color-plano)"
                  strokeWidth={1.5}
                />
              )
            })}
          </g>
        )}
      </svg>

      <ul className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[var(--color-tinta-2)]">
        {candidatos.map((cand) => (
          <li key={cand.numero} className="flex items-center gap-2">
            <svg width="22" height="10" aria-hidden="true">
              <line
                x1="0"
                x2="22"
                y1="5"
                y2="5"
                stroke={corDaCandidatura(cand.numero)}
                strokeWidth="2.5"
              />
            </svg>
            {cand.nomeUrna}, apurado
          </li>
        ))}
        {candidatos.map((cand) => (
          <li key={`l-${cand.numero}`} className="flex items-center gap-2">
            <svg width="22" height="10" aria-hidden="true">
              <line
                x1="0"
                x2="22"
                y1="5"
                y2="5"
                stroke={corDaCandidatura(cand.numero)}
                strokeWidth="1.75"
                strokeDasharray="6 4"
              />
            </svg>
            {cand.nomeUrna}, projeção
          </li>
        ))}
      </ul>

      <p className="tabular mt-2 text-xs text-[var(--color-tinta-3)]">
        {atual !== undefined && atual.pst > 0 && (
          <>
            Guia em {horaMinuto(atual.t)}, com {doisDecimais.format(atual.pst)}% das
            seções. Clicar no gráfico leva a reprodução para aquele instante.{' '}
          </>
        )}
        {indices.length < comApuracao.length && (
          <>
            O gráfico começa em {horaMinuto(pontos[indices[0]].t)}, logo depois da pausa
            de {Math.round(maiorPausa / 60)} minutos em que o TSE não publicou. Os{' '}
            {comApuracao.length - indices.length} pontos anteriores estão na reprodução,
            mas ficariam como uma reta sem informação neste eixo.
          </>
        )}
      </p>
    </figure>
  )
}

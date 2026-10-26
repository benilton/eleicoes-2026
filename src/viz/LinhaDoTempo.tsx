import type { CandidatoReplay, PontoReplay } from '../estado/useReplay'
import { corDaCandidatura } from './cores'

export interface LinhaDoTempoProps {
  pontos: PontoReplay[]
  candidatos: CandidatoReplay[]
  /** Ponto em que a reprodução está, marcado por uma guia vertical. */
  indiceAtual: number
  /** Chamado ao clicar no painel da esquerda, com o índice do ponto mais próximo. */
  aoEscolher?: (indice: number) => void
}

const LARGURA = 1000
const ALTURA = 430
const MARGEM = { topo: 18, direita: 56, baixo: 40, esquerda: 46 }

/** Painel da esquerda: a série contra o relógio. */
const XA0 = MARGEM.esquerda
const XA1 = 700
/** Painel da direita: o retrato do instante corrente, em escala ampliada. */
const XB0 = 790
const XB1 = LARGURA - MARGEM.direita
const Y0 = MARGEM.topo
const Y1 = ALTURA - MARGEM.baixo

/** Janela vertical, comum aos dois painéis, a mesma do gráfico de convergência. */
const ESQ_PISO = 42
const ESQ_TETO = 58

/**
 * Pausa, em segundos, a partir da qual o trecho anterior é descartado.
 *
 * Na noite de 25 de outubro de 2026 o TSE publicou às 17h06 e ficou quase
 * duas horas sem publicar de novo. Com o eixo em hora, aquele trecho virava
 * uma reta ocupando metade da largura. A regra é geométrica, não uma hora
 * escrita à mão: o gráfico começa no ponto que encerra a maior pausa, quando
 * ela passa deste limite.
 */
const PAUSA_QUE_CORTA = 20 * 60

/** Cobertura do intervalo: verde quando contém o resultado final. */
const VERDE = '#3f9e5a'
const CINZA = '#6b6b66'

const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const horaMinuto = (t: number) =>
  new Date(t * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/**
 * Dois painéis lado a lado, com escalas verticais diferentes de propósito.
 *
 * À esquerda, a preferência apurada de cada candidatura contra o relógio, numa
 * janela larga o bastante para caber a noite inteira. À direita, o retrato do
 * instante corrente numa janela de cinco pontos percentuais: o resultado final
 * de cada candidatura, a projeção daquele momento e a barra do intervalo.
 *
 * A ampliação da direita é o motivo de haver duas escalas. A pergunta ali é se
 * o intervalo cobre o resultado final, e responder isso exige resolução de
 * décimos de ponto, que a escala da esquerda não tem. A barra fica verde
 * enquanto o intervalo contém o resultado final e cinza quando não contém.
 */
export default function LinhaDoTempo({
  pontos,
  candidatos,
  indiceAtual,
  aoEscolher,
}: LinhaDoTempoProps) {
  const comApuracao = pontos.map((_, i) => i).filter((i) => pontos[i].pst > 0)
  if (comApuracao.length < 2) {
    return (
      <p className="text-sm text-[var(--color-tinta-3)]">
        Ainda não há pontos suficientes para desenhar a linha do tempo.
      </p>
    )
  }

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

  // Resultado final: o último ponto da série, que é onde a apuração parou.
  const ultimoPonto = pontos[comApuracao[comApuracao.length - 1]]
  const finalDe = (numero: string) => ultimoPonto.pct[numero] ?? 0

  const t0 = pontos[indices[0]].t
  const t1 = pontos[indices[indices.length - 1]].t
  const escalaX = (t: number) =>
    t1 === t0 ? XA0 : XA0 + ((t - t0) / (t1 - t0)) * (XA1 - XA0)

  const escalaEsq = (p: number) =>
    Y1 - ((Math.max(ESQ_PISO, Math.min(ESQ_TETO, p)) - ESQ_PISO) / (ESQ_TETO - ESQ_PISO)) * (Y1 - Y0)

  // Os dois painéis dividem a mesma escala vertical, de propósito: assim a
  // altura de qualquer marca do painel da direita pode ser lida direto contra
  // a série do painel da esquerda, na horizontal.
  const escalaDir = escalaEsq
  const dirPiso = ESQ_PISO
  const dirTeto = ESQ_TETO

  const marcasEsq = [0, 1, 2, 3, 4].map((k) => ESQ_PISO + ((ESQ_TETO - ESQ_PISO) / 4) * k)
  const marcasDir = marcasEsq

  const marcasX: number[] = []
  const passo = 3600
  for (let t = Math.ceil(t0 / passo) * passo; t <= t1; t += passo) marcasX.push(t)

  const caminhoApurado = (numero: string) =>
    indices
      .filter((i) => (pontos[i].pct[numero] ?? 0) > 0)
      .map((i, ordem) => {
        const x = escalaX(pontos[i].t)
        const y = escalaEsq(pontos[i].pct[numero])
        return `${ordem === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')

  const atual = pontos[Math.max(0, Math.min(pontos.length - 1, indiceAtual))]
  const xAtual = atual !== undefined && atual.pst > 0 ? escalaX(atual.t) : null

  const aoClicar = (evento: React.MouseEvent<SVGSVGElement>) => {
    if (aoEscolher === undefined) return
    const caixa = evento.currentTarget.getBoundingClientRect()
    const emUnidades = ((evento.clientX - caixa.left) / caixa.width) * LARGURA
    if (emUnidades > XA1) return
    const proporcao = (emUnidades - XA0) / (XA1 - XA0)
    const alvo = t0 + Math.max(0, Math.min(1, proporcao)) * (t1 - t0)
    let melhor = indices[0]
    for (const i of indices) {
      if (Math.abs(pontos[i].t - alvo) < Math.abs(pontos[melhor].t - alvo)) melhor = i
    }
    aoEscolher(melhor)
  }

  /** Coluna de cada candidatura dentro do painel da direita. */
  const colunaDe = (ordem: number) => {
    const largura = XB1 - XB0
    const fatia = largura / Math.max(1, candidatos.length)
    return XB0 + fatia * (ordem + 0.5)
  }

  const cobertos = candidatos.filter((c) => {
    const proj = atual?.proj[c.numero] ?? 0
    if (!(proj > 0)) return false
    const meia = atual?.faixa[c.numero] ?? 0
    const alvo = finalDe(c.numero)
    return alvo >= proj - meia && alvo <= proj + meia
  }).length

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="h-auto w-full"
        role="img"
        aria-label="À esquerda, a preferência apurada de cada candidatura ao longo da noite. À direita, no instante corrente, o resultado final, a projeção e o intervalo de cada candidatura."
        onClick={aoClicar}
      >
        {/* -------------------------------- painel da esquerda */}
        {marcasEsq.map((marca) => (
          <g key={`e-${marca}`}>
            <line
              x1={XA0}
              x2={XA1}
              y1={escalaEsq(marca)}
              y2={escalaEsq(marca)}
              stroke="var(--color-grade)"
              strokeWidth={1}
            />
            <text
              x={XA0 - 8}
              y={escalaEsq(marca)}
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
          x1={XA0}
          x2={XA1}
          y1={escalaEsq(50)}
          y2={escalaEsq(50)}
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
            key={`apur-${cand.numero}`}
            d={caminhoApurado(cand.numero)}
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
                  key={`pt-${cand.numero}`}
                  cx={xAtual}
                  cy={escalaEsq(p)}
                  r={4.5}
                  fill={corDaCandidatura(cand.numero)}
                  stroke="var(--color-plano)"
                  strokeWidth={1.5}
                />
              )
            })}
          </g>
        )}

        {/* -------------------------------- painel da direita */}
        <line
          x1={XB0 - 24}
          x2={XB0 - 24}
          y1={Y0}
          y2={Y1}
          stroke="var(--color-grade)"
          strokeWidth={1}
        />

        {marcasDir.map((marca) => (
          <g key={`d-${marca}`}>
            <line
              x1={XB0}
              x2={XB1}
              y1={escalaDir(marca)}
              y2={escalaDir(marca)}
              stroke="var(--color-grade)"
              strokeWidth={1}
            />
            <text
              x={XB1 + 8}
              y={escalaDir(marca)}
              fill="var(--color-tinta-3)"
              fontSize={13}
              textAnchor="start"
              dominantBaseline="central"
            >
              {Math.round(marca)}%
            </text>
          </g>
        ))}

        {candidatos.map((cand, ordem) => {
          const x = colunaDe(ordem)
          const cor = corDaCandidatura(cand.numero)
          const alvo = finalDe(cand.numero)
          const proj = atual?.proj[cand.numero] ?? 0
          const meia = atual?.faixa[cand.numero] ?? 0
          const temProjecao = proj > 0
          const cobre = temProjecao && alvo >= proj - meia && alvo <= proj + meia
          const topo = escalaDir(proj + meia)
          const base = escalaDir(proj - meia)
          const cortadoEmCima = proj + meia > dirTeto
          const cortadoEmBaixo = proj - meia < dirPiso

          return (
            <g key={`dir-${cand.numero}`}>
              {temProjecao && (
                <>
                  <rect
                    x={x - 9}
                    y={
                      Math.abs(base - topo) >= 7
                        ? Math.min(topo, base)
                        : escalaDir(proj) - 3.5
                    }
                    width={18}
                    height={Math.max(7, Math.abs(base - topo))}
                    rx={3}
                    fill={cobre ? VERDE : CINZA}
                    opacity={0.55}
                  />
                  {cortadoEmCima && (
                    <polygon
                      points={`${x - 9},${Y0} ${x + 9},${Y0} ${x},${Y0 - 7}`}
                      fill={cobre ? VERDE : CINZA}
                    />
                  )}
                  {cortadoEmBaixo && (
                    <polygon
                      points={`${x - 9},${Y1} ${x + 9},${Y1} ${x},${Y1 + 7}`}
                      fill={cobre ? VERDE : CINZA}
                    />
                  )}
                  <circle
                    cx={x}
                    cy={escalaDir(proj)}
                    r={4}
                    fill={cor}
                    stroke="var(--color-plano)"
                    strokeWidth={1.25}
                  />
                </>
              )}

              {/* Resultado final: a verdade contra a qual tudo ali é medido. */}
              <line
                x1={x - 17}
                x2={x + 17}
                y1={escalaDir(alvo)}
                y2={escalaDir(alvo)}
                stroke="var(--color-tinta)"
                strokeWidth={2}
              />

              <text
                x={x}
                y={Y1 + 22}
                fill="var(--color-tinta-3)"
                fontSize={13}
                textAnchor="middle"
              >
                {cand.numero}
              </text>
            </g>
          )
        })}

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
        <li className="flex items-center gap-2">
          <svg width="22" height="10" aria-hidden="true">
            <line x1="2" x2="20" y1="5" y2="5" stroke="var(--color-tinta)" strokeWidth="2" />
          </svg>
          resultado final
        </li>
        <li className="flex items-center gap-2">
          <svg width="22" height="10" aria-hidden="true">
            <rect width="22" height="10" rx="2" fill={VERDE} opacity="0.55" />
          </svg>
          intervalo contém o resultado
        </li>
        <li className="flex items-center gap-2">
          <svg width="22" height="10" aria-hidden="true">
            <rect width="22" height="10" rx="2" fill={CINZA} opacity="0.55" />
          </svg>
          intervalo não contém
        </li>
      </ul>

      <p className="tabular mt-2 text-xs text-[var(--color-tinta-3)]">
        O painel da direita mostra, no instante da guia, o resultado final de cada
        candidatura, a projeção daquele momento e o intervalo em volta dela. Os dois
        painéis usam a mesma escala vertical, de {ESQ_PISO}% a {ESQ_TETO}%, então a
        altura de qualquer marca da direita pode ser lida na horizontal contra a série da
        esquerda. Perto do fim da apuração o intervalo fica menor que a espessura mínima
        da barra, e aí só a cor responde se ele contém o resultado.
        {atual !== undefined && atual.pst > 0 && (
          <>
            {' '}
            Guia em {horaMinuto(atual.t)}, com {doisDecimais.format(atual.pst)}% das
            seções, e {cobertos} de {candidatos.length} intervalos contendo o resultado.
            Clicar no painel da esquerda leva a reprodução para aquele instante.
          </>
        )}
        {indices.length < comApuracao.length && (
          <>
            {' '}
            A série começa em {horaMinuto(pontos[indices[0]].t)}, logo depois da pausa de{' '}
            {Math.round(maiorPausa / 60)} minutos em que o TSE não publicou.
          </>
        )}
      </p>
    </figure>
  )
}

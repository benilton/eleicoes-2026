import type { DadosAnimacao, EventoAnimacao, MalhaUf } from '../dados/animacao'
import { hexDaCandidatura } from './cores'

/**
 * Motor da animacao da apuracao, em canvas puro.
 *
 * Fica fora do React de proposito: o laco roda a 60 quadros por segundo e
 * nenhuma dessas atualizacoes precisa passar por estado de componente. O
 * componente cria o motor, manda comandos e recebe o relogio de volta pelo
 * retorno de chamada aoQuadro, que escreve direto no DOM.
 *
 * Duas formas sobre a mesma base: o mapa com os municipios no lugar
 * geografico e o enxame, em que cada municipio ocupa a posicao horizontal do
 * seu resultado final.
 */

export type Variante = 'mapa' | 'enxame'

export interface EstadoQuadro {
  progresso: number
  instante: number
  pst: number
  /** Evento que acabou de entrar, ou nulo quando nada mudou. */
  evento: EventoAnimacao | null
  /** Verdadeiro quando a reproducao chegou ao fim neste quadro. */
  terminou: boolean
}

export interface Motor {
  /** Votos que cada bolinha em voo representa. */
  votosPorBolinha: number
  redimensionar(): void
  definirVariante(v: Variante): void
  definirProgresso(p: number): void
  definirDuracao(segundos: number): void
  tocar(): void
  pausar(): void
  destruir(): void
}

export interface OpcoesMotor {
  canvas: HTMLCanvasElement
  dados: DadosAnimacao
  malha: MalhaUf[]
  aoQuadro: (estado: EstadoQuadro) => void
  /** Sem animacao continua: o desenho responde so ao arraste do instante. */
  reduzirMovimento?: boolean
}

/** Projecao de public/uf-geo.json: equirretangular com latitude base -14. */
const MAPA_L = 1000
const MAPA_A = 1026.1
const LON_OESTE = -73.9904
const LAT_NORTE = 5.2718
const ESCALA_LON = 0.970296 * 26.293
const ESCALA_LAT = 26.295

/** Teto do intervalo entre dois pontos, para a pausa de publicacao nao parar a tela. */
const TETO_INTERVALO_S = 75
/** Cobertura minima para a projecao valer desenho. */
const COBERTURA_MINIMA = 3
/** Quantas bolinhas a noite inteira deve emitir. */
const BOLINHAS_NA_NOITE = 6000
const TETO_PARTICULAS = 1600
const TETO_EMISSOES_POR_QUADRO = 70

const FONTE = 'system-ui, -apple-system, "Segoe UI", sans-serif'
const TINTA = '#ffffff'
const TINTA_2 = '#c3c2b7'
const TINTA_3 = '#898781'
const TINTA_4 = '#6b6a66'
/** Verde de acerto, o mesmo da cobertura do intervalo na linha do tempo. */
const VERDE = '#3f9e5a'

const inteiro = new Intl.NumberFormat('pt-BR')
const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

interface Particula {
  x: number
  y: number
  x0: number
  y0: number
  cx: number
  cy: number
  ax: number
  ay: number
  cor: string
  vida: number
  dur: number
}

interface Caixa {
  x: number
  y: number
  w: number
  h: number
}

interface Projecao {
  v: number
  lo: number
  hi: number
  p: number
  f: number
}

/** "#3987e5" para "57,135,229", uma vez por cor. */
function componentes(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

export function criarMotor({
  canvas,
  dados,
  malha,
  aoQuadro,
  reduzirMovimento = false,
}: OpcoesMotor): Motor {
  const contexto = canvas.getContext('2d')
  if (contexto === null) throw new Error('canvas sem contexto 2d')
  const ctx: CanvasRenderingContext2D = contexto

  const T = dados.t
  const N = T.length
  const MUN = dados.mun
  const M = MUN.length
  const CAP = dados.cap

  const hex: [string, string] = [
    hexDaCandidatura(dados.finalistas[0]),
    hexDaCandidatura(dados.finalistas[1]),
  ]
  const rgb: [string, string] = [componentes(hex[0]), componentes(hex[1])]
  const cor = (i: 0 | 1, a: number) => `rgba(${rgb[i]},${a})`
  const nomes: [string, string] = [
    `${dados.candidatos[0].numero} · ${dados.candidatos[0].nomeUrna}`,
    `${dados.candidatos[1].numero} · ${dados.candidatos[1].nomeUrna}`,
  ]

  // ---- pre-calculo ------------------------------------------------------
  const fracao = new Float32Array(M * N)
  const votos: [Float64Array, Float64Array] = [new Float64Array(M), new Float64Array(M)]
  const px = new Float32Array(M)
  const py = new Float32Array(M)
  const raioBase = new Float32Array(M)
  const vencedor = new Uint8Array(M)
  const margem = new Float32Array(M)
  const total: [Float64Array, Float64Array] = [new Float64Array(N), new Float64Array(N)]
  const semMapa: number[] = []

  let maiorEleitorado = 1
  for (let m = 0; m < M; m += 1) maiorEleitorado = Math.max(maiorEleitorado, MUN[m][4])

  for (let m = 0; m < M; m += 1) {
    const entrada = MUN[m]
    const secoes = entrada[3]
    votos[0][m] = entrada[5]
    votos[1][m] = entrada[6]
    const soma = entrada[5] + entrada[6]
    margem[m] = soma > 0 ? (entrada[5] - entrada[6]) / soma : 0
    vencedor[m] = margem[m] >= 0 ? 0 : 1
    raioBase[m] = Math.sqrt(entrada[4] / maiorEleitorado)
    if (entrada[7] === null || entrada[8] === null) {
      semMapa.push(m)
      px[m] = Number.NaN
      py[m] = Number.NaN
    } else {
      px[m] = (entrada[8] - LON_OESTE) * ESCALA_LON
      py[m] = (LAT_NORTE - entrada[7]) * ESCALA_LAT
    }
    const curva = entrada[9]
    let j = 0
    let contadas = 0
    for (let i = 0; i < N; i += 1) {
      while (j < curva.length && curva[j][0] <= i) {
        contadas = curva[j][1]
        j += 1
      }
      const f = secoes > 0 ? contadas / secoes : 0
      fracao[m * N + i] = f
      total[0][i] += entrada[5] * f
      total[1][i] += entrada[6] * f
    }
  }

  const UNIDADE = (total[0][N - 1] + total[1][N - 1]) / BOLINHAS_NA_NOITE
  /** Resultado final, que a linha branca marca no vaso. */
  const finalVotos: [number, number] = [total[0][N - 1], total[1][N - 1]]
  const finalPct: [number, number] = [dados.pct[0][N - 1], dados.pct[1][N - 1]]

  // ---- relogio da reproducao -------------------------------------------
  const passo = new Float64Array(N)
  const acumulado = new Float64Array(N)
  let somaPassos = 0
  for (let i = 1; i < N; i += 1) {
    passo[i] = Math.min(T[i] - T[i - 1], TETO_INTERVALO_S)
    somaPassos += passo[i]
    acumulado[i] = somaPassos
  }

  function indiceDe(p: number): number {
    const alvo = p * somaPassos
    let lo = 0
    let hi = N - 1
    while (lo < hi) {
      const meio = (lo + hi) >> 1
      if (acumulado[meio] < alvo) lo = meio + 1
      else hi = meio
    }
    if (lo === 0) return 0
    const largura = acumulado[lo] - acumulado[lo - 1]
    return lo - 1 + (largura > 0 ? (alvo - acumulado[lo - 1]) / largura : 0)
  }

  // ---- estado -----------------------------------------------------------
  let variante: Variante = 'mapa'
  let tocando = false
  let progresso = 0
  let duracao = 90
  let quadroAnterior = 0
  let pedido = 0
  let vivo = true
  let eventoAtivo = -1

  const particulas: Particula[] = []
  const debito = new Float64Array(M * 2)
  const ultimaFracao = new Float32Array(M)
  const pulso = new Float32Array(M)

  let L = 0
  let A = 0
  let retrato = false
  let totalAtual: [number, number] = [0, 0]

  const caminhos = malha.map((uf) => new Path2D(uf.d))

  // ---- caixas -----------------------------------------------------------
  function caixaMapa(): { x: number; y: number; e: number } {
    if (retrato) {
      const escala = Math.min((L - 32) / MAPA_L, (A * 0.62) / MAPA_A)
      return { x: (L - MAPA_L * escala) / 2, y: 14, e: escala }
    }
    const escala = Math.min((L * 0.56) / MAPA_L, (A - 40) / MAPA_A)
    return { x: L * 0.3 - (MAPA_L * escala) / 2, y: (A - MAPA_A * escala) / 2, e: escala }
  }

  function caixaEnxame(): Caixa {
    if (retrato) return { x: 18, y: 36, w: L - 36, h: A * 0.6 - 36 }
    return { x: 26, y: 40, w: L * 0.58 - 26, h: A - 108 }
  }

  function caixaVasos(): Caixa & { horizontal: boolean } {
    if (retrato) {
      return { horizontal: true, x: 16, y: A * 0.68, w: L - 32, h: A * 0.25 }
    }
    return { horizontal: false, x: L * 0.665, y: 136, w: L * 0.295, h: A - 236 }
  }

  // ---- enxame: empacotamento -------------------------------------------
  const ex = new Float32Array(M)
  const ey = new Float32Array(M)
  const eraio = new Float32Array(M)
  const porTamanho = Array.from({ length: M }, (_, m) => m).sort(
    (a, b) => MUN[b][4] - MUN[a][4],
  )
  /** Alcance da margem no eixo do enxame, fixo para a escala nao dancar. */
  const ALCANCE_MARGEM = 0.85

  function empacotar(altura: number, raioMaximo: number): void {
    const FAIXAS = 120
    let raio = raioMaximo
    for (let tentativa = 0; tentativa < 10; tentativa += 1) {
      const alturas = new Float32Array(FAIXAS)
      let maior = 0
      for (const m of porTamanho) {
        const r = Math.max(0.9, raioBase[m] * raio)
        ex[m] = Math.max(0, Math.min(1, (margem[m] / ALCANCE_MARGEM + 1) / 2))
        eraio[m] = r
        const faixa = Math.max(0, Math.min(FAIXAS - 1, Math.round(ex[m] * (FAIXAS - 1))))
        ey[m] = alturas[faixa] + r
        alturas[faixa] += 2 * r + 0.6
        maior = Math.max(maior, alturas[faixa])
      }
      if (maior > altura) {
        if (raio < 2) return
        raio *= Math.max(0.55, Math.sqrt(altura / maior))
        continue
      }
      if (maior > altura * 0.88 || raio > 34) return
      raio *= Math.min(1.5, Math.sqrt((altura * 0.9) / maior))
    }
  }

  // ---- desenho ----------------------------------------------------------
  function caminhoArredondado(x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  function projecaoEm(i: number, contados: number): Projecao[] | null {
    const cobertura = dados.cob[i]
    if (!(cobertura >= COBERTURA_MINIMA) || !(contados > 0)) return null
    const estimado = contados / (cobertura / 100)
    return [0, 1].map((c) => {
      const p = dados.proj[c][i]
      const f = dados.faixa[c][i]
      return {
        v: (estimado * p) / 100,
        lo: (estimado * (p - f)) / 100,
        hi: (estimado * (p + f)) / 100,
        p,
        f,
      }
    })
  }

  function tracejado(x1: number, y1: number, x2: number, y2: number, c: 0 | 1): void {
    ctx.save()
    ctx.setLineDash([5, 4])
    ctx.strokeStyle = cor(c, 0.75)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.restore()
  }

  function desenhaVaso(
    c: 0 | 1,
    x: number,
    y: number,
    w: number,
    h: number,
    votosAtuais: number,
    proj: Projecao | null,
    horizontal: boolean,
  ): void {
    const f = Math.max(0, Math.min(1, votosAtuais / CAP))
    ctx.fillStyle = 'rgba(255,255,255,0.025)'
    caminhoArredondado(x, y, w, h, 12)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    caminhoArredondado(x, y, w, h, 12)
    ctx.stroke()

    ctx.save()
    caminhoArredondado(x, y, w, h, 12)
    ctx.clip()

    if (proj !== null) {
      ctx.fillStyle = cor(c, 0.14)
      if (horizontal) {
        const xlo = x + w * Math.min(1, proj.lo / CAP)
        const xhi = x + w * Math.min(1, proj.hi / CAP)
        ctx.fillRect(xlo, y, Math.max(2, xhi - xlo), h)
        const xv = x + w * Math.min(1, proj.v / CAP)
        tracejado(xv, y, xv, y + h, c)
      } else {
        const ylo = y + h * (1 - Math.min(1, proj.lo / CAP))
        const yhi = y + h * (1 - Math.min(1, proj.hi / CAP))
        ctx.fillRect(x, yhi, w, Math.max(2, ylo - yhi))
        ctx.fillStyle = cor(c, 0.3)
        ctx.fillRect(x, yhi, w, 1)
        ctx.fillRect(x, Math.max(yhi + 1, ylo - 1), w, 1)
        const yv = y + h * (1 - Math.min(1, proj.v / CAP))
        tracejado(x, yv, x + w, yv, c)
      }
    }

    // Linha do resultado final, desenhada por cima do liquido: no fim da
    // noite a superficie encosta nela, e no meio da noite ela mostra quanto
    // ainda falta.
    const marca = Math.max(0, Math.min(1, finalVotos[c] / CAP))
    if (horizontal) {
      const grad = ctx.createLinearGradient(x, 0, x + w * f, 0)
      grad.addColorStop(0, cor(c, 0.78))
      grad.addColorStop(1, cor(c, 0.42))
      ctx.fillStyle = grad
      ctx.fillRect(x, y, w * f, h)
      ctx.fillStyle = cor(c, 0.95)
      ctx.fillRect(x + w * f - 1.5, y, 1.5, h)
    } else {
      const topo = y + h * (1 - f)
      const grad = ctx.createLinearGradient(0, y + h, 0, topo)
      grad.addColorStop(0, cor(c, 0.8))
      grad.addColorStop(1, cor(c, 0.4))
      ctx.fillStyle = grad
      ctx.fillRect(x, topo, w, h * f)
      ctx.fillStyle = cor(c, 0.95)
      ctx.fillRect(x, topo, w, 1.5)
    }

    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    if (horizontal) ctx.fillRect(x + w * marca - 1, y, 1.5, h)
    else ctx.fillRect(x, y + h * (1 - marca) - 1, w, 1.5)
    ctx.restore()

    if (!horizontal) {
      // Rotulo curto, encostado na borda esquerda: o da projecao e centrado.
      // Quando as duas linhas quase coincidem, este desce para o outro lado
      // da linha, senao os dois textos se montam um sobre o outro.
      const yMarca = y + h * (1 - marca)
      const yProjecao =
        proj === null ? Number.NEGATIVE_INFINITY : Math.max(y + 12, y + h * (1 - Math.min(1, proj.v / CAP)) - 7)
      const acima = Math.abs(yMarca - 5 - yProjecao) >= 12
      ctx.textAlign = 'left'
      ctx.font = `500 9px ${FONTE}`
      ctx.fillStyle = 'rgba(255,255,255,0.72)'
      ctx.fillText('final', x + 7, acima ? yMarca - 5 : yMarca + 11)
    }

    if (proj !== null && !horizontal) {
      const yv = y + h * (1 - Math.min(1, proj.v / CAP))
      ctx.textAlign = 'center'
      ctx.font = `500 10px ${FONTE}`
      ctx.fillStyle = cor(c, 0.9)
      ctx.fillText(
        `projeção ${doisDecimais.format(proj.p)}% ± ${doisDecimais.format(proj.f)}`,
        x + w / 2,
        Math.max(y + 12, yv - 7),
      )
    }

    const pct = (votosAtuais / Math.max(1, totalAtual[0] + totalAtual[1])) * 100
    ctx.fillStyle = TINTA
    ctx.font = `600 ${horizontal ? 17 : 20}px ${FONTE}`
    ctx.textAlign = horizontal ? 'left' : 'center'
    const cxTexto = horizontal ? x + 14 : x + w / 2
    const cyTexto = horizontal ? y + 25 : y + h + 26
    ctx.fillText(`${doisDecimais.format(pct)}%`, cxTexto, cyTexto)
    ctx.fillStyle = TINTA_2
    ctx.font = `400 11px ${FONTE}`
    if (horizontal) {
      ctx.font = `400 10px ${FONTE}`
      ctx.fillText(nomes[c], x + 14, y + h - 14)
      ctx.textAlign = 'right'
      ctx.font = `400 11px ${FONTE}`
      ctx.fillText(`${inteiro.format(Math.round(votosAtuais))} votos`, x + w - 12, y + 24)
      if (proj !== null) {
        ctx.fillStyle = cor(c, 0.9)
        ctx.font = `500 10px ${FONTE}`
        ctx.fillText(
          `projeção ${doisDecimais.format(proj.p)}% ± ${doisDecimais.format(proj.f)}`,
          x + w - 12,
          y + h - 14,
        )
      }
    } else {
      ctx.fillText(nomes[c], cxTexto, cyTexto + 17)
      ctx.fillStyle = TINTA_3
      ctx.fillText(`${inteiro.format(Math.round(votosAtuais))} votos`, cxTexto, cyTexto + 32)
    }
  }

  function desenhaEscala(caixa: Caixa): void {
    ctx.textAlign = 'right'
    ctx.font = `400 10px ${FONTE}`
    for (let v = 2e7; v < CAP; v += 2e7) {
      const y = caixa.y + caixa.h * (1 - v / CAP)
      ctx.strokeStyle = 'rgba(137,135,129,0.16)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(caixa.x, y)
      ctx.lineTo(caixa.x + caixa.w, y)
      ctx.stroke()
      ctx.fillStyle = '#5c5b57'
      ctx.fillText(`${v / 1e6} mi`, caixa.x - 6, y + 3)
    }
  }

  function desenhaVasos(proj: Projecao[] | null, cobertura: number): void {
    const caixa = caixaVasos()
    if (caixa.horizontal) {
      const altura = (caixa.h - 12) / 2
      desenhaVaso(0, caixa.x, caixa.y, caixa.w, altura, totalAtual[0], proj?.[0] ?? null, true)
      desenhaVaso(
        1,
        caixa.x,
        caixa.y + altura + 12,
        caixa.w,
        altura,
        totalAtual[1],
        proj?.[1] ?? null,
        true,
      )
    } else {
      const largura = (caixa.w - 24) / 2
      desenhaVaso(0, caixa.x, caixa.y, largura, caixa.h, totalAtual[0], proj?.[0] ?? null, false)
      desenhaVaso(
        1,
        caixa.x + largura + 24,
        caixa.y,
        largura,
        caixa.h,
        totalAtual[1],
        proj?.[1] ?? null,
        false,
      )
      desenhaEscala(caixa)
    }
    ctx.textAlign = caixa.horizontal ? 'left' : 'center'
    ctx.font = `400 11px ${FONTE}`
    ctx.fillStyle = TINTA_4
    // Exige que a faixa dos dois contenha o respectivo final. O erro absoluto
    // e o mesmo nos dois, porque os percentuais somam cem, mas as faixas sao
    // calculadas em separado.
    const contem =
      proj !== null &&
      Math.abs(proj[0].p - finalPct[0]) <= proj[0].f &&
      Math.abs(proj[1].p - finalPct[1]) <= proj[1].f
    // Com a apuracao encerrada a faixa vale zero, entao o veredito perderia o
    // sentido: o rodape passa a dizer que acabou.
    const encerrada = cobertura >= 99.9
    const rodape = encerrada
      ? 'apuração encerrada · a linha branca é o resultado final'
      : proj === null
        ? 'projeção indisponível: cobertura ainda baixa'
        : `cobertura ${doisDecimais.format(cobertura)}% · faixa ` +
          `${contem ? 'contém' : 'não contém'} o resultado final`
    if (proj !== null && !encerrada) {
      ctx.fillStyle = contem ? VERDE : TINTA_4
    }
    ctx.fillText(
      rodape,
      caixa.horizontal ? caixa.x : caixa.x + caixa.w / 2,
      caixa.y + caixa.h + (caixa.horizontal ? 22 : 80),
    )
  }

  function alvoVaso(c: 0 | 1): { x: number; y: number } {
    const caixa = caixaVasos()
    const f = Math.max(0, Math.min(1, totalAtual[c] / CAP))
    if (caixa.horizontal) {
      const altura = (caixa.h - 12) / 2
      return {
        x: caixa.x + caixa.w * f,
        y: c === 0 ? caixa.y + altura / 2 : caixa.y + altura + 12 + altura / 2,
      }
    }
    const largura = (caixa.w - 24) / 2
    return {
      x: c === 0 ? caixa.x + largura / 2 : caixa.x + largura + 24 + largura / 2,
      y: caixa.y + caixa.h * (1 - f) + 6,
    }
  }

  /** Canto reservado ao exterior, que nao tem lugar no mapa. */
  function pontoExterior(): { x: number; y: number } {
    const caixa = caixaMapa()
    return { x: caixa.x + MAPA_L * caixa.e * 0.08, y: caixa.y + MAPA_A * caixa.e * 0.94 }
  }

  function desenhaMapa(idx: number): void {
    const caixa = caixaMapa()
    ctx.save()
    // Ilha oceanica e o ponto do exterior ficam fora da caixa da projecao:
    // o recorte impede que invadam a area dos vasos.
    ctx.beginPath()
    ctx.rect(0, 0, retrato ? L : L * 0.625, retrato ? A * 0.66 : A)
    ctx.clip()

    const cx = caixa.x + MAPA_L * caixa.e * 0.5
    const cy = caixa.y + MAPA_A * caixa.e * 0.52
    const raioFundo = MAPA_A * caixa.e * 0.62
    const fundo = ctx.createRadialGradient(cx, cy, 0, cx, cy, raioFundo)
    fundo.addColorStop(0, 'rgba(255,255,255,0.030)')
    fundo.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = fundo
    ctx.beginPath()
    ctx.arc(cx, cy, raioFundo, 0, Math.PI * 2)
    ctx.fill()

    ctx.save()
    ctx.translate(caixa.x, caixa.y)
    ctx.scale(caixa.e, caixa.e)
    ctx.strokeStyle = 'rgba(195,194,183,0.14)'
    ctx.lineWidth = 1 / caixa.e
    for (const caminho of caminhos) ctx.stroke(caminho)
    ctx.restore()

    const exterior = pontoExterior()
    const b = Math.floor(idx)
    const t = idx - b
    const b2 = Math.min(N - 1, b + 1)

    // Soma de luz: onde ha muitos municipios proximos a cor ganha brilho por
    // acumulo, em vez de empilhar disco opaco.
    ctx.globalCompositeOperation = 'lighter'
    for (let m = 0; m < M; m += 1) {
      const f = fracao[m * N + b] * (1 - t) + fracao[m * N + b2] * t
      if (f <= 0.001) continue
      const temLugar = !Number.isNaN(px[m])
      const x = temLugar ? caixa.x + px[m] * caixa.e : exterior.x
      const y = temLugar ? caixa.y + py[m] * caixa.e : exterior.y
      const raio = (1.1 + raioBase[m] * 13) * (retrato ? 0.8 : 1)
      const c = vencedor[m] as 0 | 1
      if (pulso[m] > 0.01) {
        const halo = ctx.createRadialGradient(x, y, 0, x, y, raio * 3 + 8)
        halo.addColorStop(0, cor(c, 0.13 * pulso[m]))
        halo.addColorStop(1, cor(c, 0))
        ctx.fillStyle = halo
        ctx.beginPath()
        ctx.arc(x, y, raio * 3 + 8, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(x, y, raio * (0.45 + 0.55 * f), 0, Math.PI * 2)
      ctx.fillStyle = cor(c, 0.07 + 0.23 * f)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'

    if (semMapa.length > 0) {
      ctx.fillStyle = TINTA_4
      ctx.font = `400 10px ${FONTE}`
      ctx.textAlign = 'center'
      ctx.fillText('exterior', exterior.x, exterior.y + 16)
    }
    ctx.restore()
  }

  function desenhaEnxame(idx: number): void {
    const caixa = caixaEnxame()
    ctx.strokeStyle = 'rgba(195,194,183,0.14)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(caixa.x + caixa.w / 2, caixa.y - 12)
    ctx.lineTo(caixa.x + caixa.w / 2, caixa.y + caixa.h)
    ctx.stroke()
    ctx.fillStyle = TINTA_3
    ctx.font = `400 11px ${FONTE}`
    ctx.textAlign = 'left'
    ctx.fillText(`vence o ${dados.finalistas[1]}`, caixa.x, caixa.y + caixa.h + 18)
    ctx.textAlign = 'right'
    ctx.fillText(`vence o ${dados.finalistas[0]}`, caixa.x + caixa.w, caixa.y + caixa.h + 18)
    ctx.textAlign = 'center'
    ctx.fillText('empate', caixa.x + caixa.w / 2, caixa.y + caixa.h + 18)

    const b = Math.floor(idx)
    const t = idx - b
    const b2 = Math.min(N - 1, b + 1)
    ctx.globalCompositeOperation = 'lighter'
    for (let m = 0; m < M; m += 1) {
      const f = fracao[m * N + b] * (1 - t) + fracao[m * N + b2] * t
      if (f <= 0.001) continue
      ctx.beginPath()
      ctx.arc(
        caixa.x + ex[m] * caixa.w,
        caixa.y + caixa.h - ey[m],
        eraio[m] * (0.45 + 0.55 * f),
        0,
        Math.PI * 2,
      )
      ctx.fillStyle = cor(vencedor[m] as 0 | 1, 0.22 + 0.42 * f)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  function origem(m: number): { x: number; y: number } {
    if (variante === 'mapa') {
      if (Number.isNaN(px[m])) return pontoExterior()
      const caixa = caixaMapa()
      return { x: caixa.x + px[m] * caixa.e, y: caixa.y + py[m] * caixa.e }
    }
    const caixa = caixaEnxame()
    return { x: caixa.x + ex[m] * caixa.w, y: caixa.y + caixa.h - ey[m] }
  }

  function emitir(idx: number, dt: number): void {
    const b = Math.floor(idx)
    const t = idx - b
    const b2 = Math.min(N - 1, b + 1)
    let emitidas = 0
    for (let m = 0; m < M; m += 1) {
      const f = fracao[m * N + b] * (1 - t) + fracao[m * N + b2] * t
      const d = f - ultimaFracao[m]
      if (d <= 0) {
        pulso[m] *= 0.9
        continue
      }
      ultimaFracao[m] = f
      pulso[m] = 1
      debito[m * 2] += votos[0][m] * d
      debito[m * 2 + 1] += votos[1][m] * d
      for (let c = 0; c < 2; c += 1) {
        if (
          debito[m * 2 + c] >= UNIDADE &&
          emitidas < TETO_EMISSOES_POR_QUADRO &&
          particulas.length < TETO_PARTICULAS
        ) {
          const n = Math.min(4, Math.floor(debito[m * 2 + c] / UNIDADE))
          debito[m * 2 + c] -= n * UNIDADE
          const o = origem(m)
          const alvo = alvoVaso(c as 0 | 1)
          for (let k = 0; k < n; k += 1) {
            const ax = alvo.x + (Math.random() - 0.5) * 18
            const ay = alvo.y + (Math.random() - 0.5) * 18
            particulas.push({
              x: o.x,
              y: o.y,
              x0: o.x,
              y0: o.y,
              ax,
              ay,
              cx: (o.x + ax) / 2 + (Math.random() - 0.5) * 120,
              cy: (o.y + ay) / 2 - 60 - Math.random() * 80,
              cor: hex[c],
              vida: 0,
              dur: 0.75 + Math.random() * 0.5,
            })
            emitidas += 1
          }
        }
      }
      pulso[m] = Math.max(0, pulso[m] - dt * 1.6)
    }
  }

  const bezier = (u: number, a: number, c: number, b: number) =>
    (1 - u) * (1 - u) * a + 2 * (1 - u) * u * c + u * u * b

  function moverParticulas(dt: number): void {
    ctx.globalCompositeOperation = 'lighter'
    for (let i = particulas.length - 1; i >= 0; i -= 1) {
      const p = particulas[i]
      p.vida += dt
      const u = p.vida / p.dur
      if (u >= 1) {
        particulas.splice(i, 1)
        continue
      }
      const e = u * u * (3 - 2 * u)
      p.x = bezier(e, p.x0, p.cx, p.ax)
      p.y = bezier(e, p.y0, p.cy, p.ay)
      const c = p.cor === hex[0] ? 0 : 1
      for (let k = 3; k >= 1; k -= 1) {
        const ek = Math.max(0, e - k * 0.035)
        ctx.beginPath()
        ctx.arc(
          bezier(ek, p.x0, p.cx, p.ax),
          bezier(ek, p.y0, p.cy, p.ay),
          2.4 - k * 0.45,
          0,
          Math.PI * 2,
        )
        ctx.fillStyle = cor(c as 0 | 1, 0.1 * (4 - k) * (1 - e * 0.6))
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2)
      ctx.fillStyle = cor(c as 0 | 1, Math.min(0.95, 1.1 * (1 - e) + 0.3))
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  /**
   * Relogio, percentual de urnas apuradas e a barra de avanco. O percentual
   * ganhou corpo proprio porque e a pergunta mais frequente de quem olha uma
   * apuracao: quanto ja foi contado.
   */
  function desenhaRelogio(i: number): void {
    const caixa = caixaVasos()
    const pst = dados.pst[i]
    const largura = retrato ? Math.min(220, L * 0.5) : caixa.w
    const x = retrato ? L - 20 - largura : caixa.x
    const y = retrato ? 34 : 56

    ctx.textAlign = 'left'
    ctx.fillStyle = TINTA
    ctx.font = `600 26px ${FONTE}`
    const hora = formatarHora(T[i])
    ctx.fillText(hora, x, y)
    const larguraHora = ctx.measureText(hora).width
    ctx.fillStyle = TINTA_3
    ctx.font = `400 11px ${FONTE}`
    ctx.fillText('de 25 de outubro', x + larguraHora + 8, y)

    ctx.fillStyle = TINTA
    ctx.font = `600 26px ${FONTE}`
    const texto = `${doisDecimais.format(pst)}%`
    ctx.fillText(texto, x, y + 32)
    const larguraTexto = ctx.measureText(texto).width
    ctx.fillStyle = TINTA_3
    ctx.font = `400 11px ${FONTE}`
    // Em retrato nao cabe ao lado do numero: o rotulo desce uma linha.
    if (retrato) ctx.fillText('das urnas apuradas', x, y + 48)
    else ctx.fillText('das urnas apuradas', x + larguraTexto + 8, y + 32)

    const yBarra = y + (retrato ? 58 : 44)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    caminhoArredondado(x, yBarra, largura, 6, 3)
    ctx.fill()
    const cheio = Math.max(0, Math.min(1, pst / 100)) * largura
    if (cheio > 0) {
      ctx.fillStyle = TINTA_2
      caminhoArredondado(x, yBarra, Math.max(3, cheio), 6, 3)
      ctx.fill()
    }
  }

  function desenhar(idx: number, dt: number): void {
    ctx.clearRect(0, 0, L, A)
    if (variante === 'mapa') desenhaMapa(idx)
    else desenhaEnxame(idx)
    const b = Math.floor(idx)
    const t = idx - b
    const b2 = Math.min(N - 1, b + 1)
    totalAtual = [
      total[0][b] * (1 - t) + total[0][b2] * t,
      total[1][b] * (1 - t) + total[1][b2] * t,
    ]
    const i = Math.round(idx)
    desenhaVasos(projecaoEm(i, totalAtual[0] + totalAtual[1]), dados.cob[i])
    desenhaRelogio(i)
    moverParticulas(dt)
  }

  // ---- laco -------------------------------------------------------------
  function laco(agora: number): void {
    if (!vivo) return
    const dt = quadroAnterior === 0 ? 0 : Math.min(0.05, (agora - quadroAnterior) / 1000)
    quadroAnterior = agora
    let terminou = false
    if (tocando) {
      progresso += dt / duracao
      if (progresso >= 1) {
        progresso = 1
        tocando = false
        terminou = true
      }
    }
    const idx = indiceDe(progresso)
    emitir(idx, dt)
    desenhar(idx, dt)

    const instante = T[Math.round(idx)]
    let evento: EventoAnimacao | null = null
    for (let k = 0; k < dados.eventos.length; k += 1) {
      if (dados.eventos[k][0] <= instante && k > eventoAtivo) {
        eventoAtivo = k
        evento = dados.eventos[k]
      }
    }
    aoQuadro({
      progresso,
      instante,
      pst: dados.pst[Math.round(idx)],
      evento,
      terminou,
    })
    pedido = requestAnimationFrame(laco)
  }

  function redimensionar(): void {
    const pai = canvas.parentElement
    const largura = pai === null ? 800 : pai.clientWidth
    retrato = largura < 720
    L = largura
    A = Math.round(largura * (retrato ? 1.3 : 0.6))
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(L * dpr)
    canvas.height = Math.round(A * dpr)
    canvas.style.height = `${A}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    empacotar(caixaEnxame().h, retrato ? 9 : 13)
  }

  function reiniciar(): void {
    particulas.length = 0
    debito.fill(0)
    pulso.fill(0)
    eventoAtivo = -1
    const b = Math.floor(indiceDe(progresso))
    for (let m = 0; m < M; m += 1) ultimaFracao[m] = fracao[m * N + b]
    for (let k = 0; k < dados.eventos.length; k += 1) {
      if (dados.eventos[k][0] <= T[b]) eventoAtivo = k
    }
  }

  function formatarHora(instante: number): string {
    return new Date(instante * 1000).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })
  }

  redimensionar()
  reiniciar()
  if (!reduzirMovimento) tocando = true
  pedido = requestAnimationFrame(laco)

  return {
    votosPorBolinha: UNIDADE,
    redimensionar,
    definirVariante(v) {
      variante = v
      particulas.length = 0
    },
    definirProgresso(p) {
      const voltou = p < progresso
      progresso = Math.max(0, Math.min(1, p))
      if (voltou) reiniciar()
      else {
        const b = Math.floor(indiceDe(progresso))
        for (let m = 0; m < M; m += 1) ultimaFracao[m] = fracao[m * N + b]
      }
    },
    definirDuracao(segundos) {
      duracao = Math.max(10, segundos)
    },
    tocar() {
      if (progresso >= 1) {
        progresso = 0
        reiniciar()
      }
      tocando = true
    },
    pausar() {
      tocando = false
    },
    destruir() {
      vivo = false
      cancelAnimationFrame(pedido)
    },
  }

}

/** Posicao de cada evento na barra de reproducao, em fracao de 0 a 1. */
export function posicoesDosEventos(dados: DadosAnimacao): number[] {
  const T = dados.t
  const N = T.length
  let soma = 0
  const acumulado = new Float64Array(N)
  for (let i = 1; i < N; i += 1) {
    soma += Math.min(T[i] - T[i - 1], TETO_INTERVALO_S)
    acumulado[i] = soma
  }
  return dados.eventos.map(([instante]) => {
    let indice = N - 1
    for (let i = 0; i < N; i += 1) {
      if (T[i] >= instante) {
        indice = i
        break
      }
    }
    return soma > 0 ? acumulado[indice] / soma : 0
  })
}

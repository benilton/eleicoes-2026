import { useEffect, useMemo, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent, MouseEvent } from 'react'
import type { Apuracao } from '../tse/tipos'
import { corDaCandidatura, hexDaCandidatura } from './cores'

// Rampa sequencial de uma cor so, do claro ao escuro, documentada na
// disciplina de visualizacao do projeto. So vale no modo percentual: no modo
// lider a cor e identidade de candidatura, chapada, sem gradacao por margem.
//
// Cinco classes, nao sete. Os dois passos mais escuros da rampa documentada
// (#184f95 e #0d366b) rendem 2,15 e 1,46 de contraste contra a superficie
// escura #1a1a19: nessa faixa as classes vizinhas deixam de se distinguir e o
// estado se confunde com o fundo. Com cinco passos o pior caso fica em 3,23.
const RAMPA_AZUL = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf'] as const

const COR_BASE_PADRAO = '#3987e5'
const CLASSES = RAMPA_AZUL.length

/** Unidade sem dado, ou sem nenhuma secao totalizada. */
const COR_SEM_DADO = 'var(--color-grade)'

/** Lideranca indefinida: empate exato, ou lider fora das candidaturas em destaque. */
const COR_INDEFINIDA = 'var(--color-contexto)'

// Tintas da sigla desenhada sobre o preenchimento. Sao as duas disponiveis, e
// a escolha por unidade e medida, nao estimada: vale a que render o maior
// contraste sobre aquele preenchimento.
//
// Medidas sobre as tres cores de identidade desta eleicao: #3987e5 rende 5,34
// com a tinta escura e 3,64 com a clara; #e66767 rende 6,02 e 3,23; #008300
// rende 3,93 e 4,95. O azul e o vermelho pedem tinta escura, o verde pede
// clara. Sobre #4a4a46 (contexto) e #2c2c2a (grade) a tinta clara rende 8,90 e
// 13,99, entao ali nao ha escolha a fazer.
const TINTA_CLARA = 'var(--color-tinta)'
const TINTA_ESCURA = 'var(--color-plano)'

/** Piso de contraste da sigla. Abaixo disso a sigla e omitida, nunca encolhida. */
const CONTRASTE_MINIMO = 4.5

// Fatores medidos na rampa azul: o passo 4 e a propria cor base, os tres
// anteriores caminham para o branco e o seguinte caminha para o preto.
// PARA_CLARO esta em ordem decrescente de mistura, que e a ordem do mais
// claro para o menos claro, igual a da rampa documentada.
const PARA_CLARO = [0.78, 0.52, 0.27]
const PARA_ESCURO = [0.22]

// Sigla sobre o preenchimento, em unidades do viewBox, que tem 1000 de
// largura. Tamanho unico: unidade apertada perde a sigla, nunca ganha uma
// sigla menor.
const FONTE_SIGLA = 21
/** Largura media do glifo da sans do sistema, em ems, para estimar a caixa do rotulo. */
const LARGURA_GLIFO = 0.62
/** Folga entre a caixa do rotulo e o contorno da unidade. */
const FOLGA_SIGLA = 1.2

export type ModoMapa = 'lider' | 'percentual'

type Situacao = 'lider' | 'empate' | 'outra' | 'sem-dado'

interface UfMalha {
  sigla: string
  nome: string
  d: string
}

interface Malha {
  viewBox: string
  ufs: UfMalha[]
}

interface Ponto {
  x: number
  y: number
}

/** Anel de pontos de um subcaminho fechado. */
type Anel = Ponto[]

interface LinhaDestaque {
  numero: string
  nomeUrna: string
  votos: number
  percentual: number
  cor: string
  ehLider: boolean
}

interface Detalhe {
  sigla: string
  nome: string
  percentualSecoes: number | null
  situacao: Situacao
  /** Nome de urna da lider quando ela esta fora das candidaturas em destaque. */
  liderExterna: string | null
  linhas: LinhaDestaque[]
}

interface Dica {
  detalhe: Detalhe
  x: number
  y: number
}

export interface MapaUFProps {
  /** Apuracao completa de cada unidade federativa, pela sigla minuscula. */
  dadosPorUf: Record<string, Apuracao>
  /** Candidaturas com cor propria, na ordem de numerosComIdentidade(). */
  numerosDestaque: string[]
  modo: ModoMapa
  aoTrocarModo: (modo: ModoMapa) => void
  /** Candidatura pintada no modo percentual. O seletor fica fora do mapa. */
  numeroPercentual: string | null
  ufSelecionada: string | null
  aoSelecionar: (uf: string) => void
}

const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

function hexParaRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = Number.parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbParaHex(rgb: [number, number, number]): string {
  const canal = (c: number) =>
    Math.max(0, Math.min(255, c))
      .toString(16)
      .padStart(2, '0')
  return `#${canal(rgb[0])}${canal(rgb[1])}${canal(rgb[2])}`
}

// A mistura devolve hexadecimal, e nao rgb(), porque o passo derivado tambem
// precisa ser medido: e sobre ele que a sigla e desenhada.
function mistura(rgb: [number, number, number], alvo: number, t: number): string {
  const canal = (c: number) => Math.round(c + (alvo - c) * t)
  return rgbParaHex([canal(rgb[0]), canal(rgb[1]), canal(rgb[2])])
}

/**
 * Deriva cinco passos claro-escuro a partir da cor base. Quando a base e a
 * documentada, devolve a rampa validada tal como esta, sem recalcular.
 */
function rampaDe(corBase: string): readonly string[] {
  if (corBase.toLowerCase() === COR_BASE_PADRAO) return RAMPA_AZUL
  const rgb = hexParaRgb(corBase)
  if (!rgb) return RAMPA_AZUL
  // Sem reverter: PARA_CLARO ja esta do mais claro para o menos claro.
  // Reverter aqui quebrava a monotonicidade da rampa derivada, defeito que
  // ficava escondido enquanto a cor base era a documentada.
  return [
    ...PARA_CLARO.map((t) => mistura(rgb, 255, t)),
    corBase,
    ...PARA_ESCURO.map((t) => mistura(rgb, 0, t)),
  ]
}

/** Luminancia relativa da WCAG 2.1. */
function luminancia(rgb: [number, number, number]): number {
  const canal = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * canal(rgb[0]) + 0.7152 * canal(rgb[1]) + 0.0722 * canal(rgb[2])
}

function contraste(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

// Luminancia das duas tintas: #ffffff e #0d0d0d, os valores de --color-tinta e
// --color-plano em index.css. Trocar um desses tokens exige refazer a conta.
const LUZ_TINTA_CLARA = 1
const LUZ_TINTA_ESCURA = luminancia([13, 13, 13])

/**
 * Tinta de maior contraste sobre o preenchimento. Devolve null quando nenhuma
 * das duas alcanca o piso: nesse caso a sigla nao e desenhada, e o dado segue
 * no balao, no title e na tabela.
 */
function tintaSobre(hex: string): string | null {
  const rgb = hexParaRgb(hex)
  if (!rgb) return null
  const fundo = luminancia(rgb)
  const comClara = contraste(fundo, LUZ_TINTA_CLARA)
  const comEscura = contraste(fundo, LUZ_TINTA_ESCURA)
  if (Math.max(comClara, comEscura) < CONTRASTE_MINIMO) return null
  return comClara >= comEscura ? TINTA_CLARA : TINTA_ESCURA
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

/**
 * Converte o atributo d em aneis de pontos. A malha do projeto usa apenas M, L
 * e Z: diante de qualquer outro comando a funcao devolve null, e a unidade
 * fica sem sigla, em vez de receber uma sigla fora do lugar.
 */
function aneisDe(d: string): Anel[] | null {
  const simbolos = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g)
  if (simbolos === null) return null

  const aneis: Anel[] = []
  let atual: Anel = []
  let comando = ''
  let cursor: Ponto = { x: 0, y: 0 }
  let i = 0

  const fechar = () => {
    if (atual.length >= 3) aneis.push(atual)
    atual = []
  }

  while (i < simbolos.length) {
    const simbolo = simbolos[i]
    if (/^[A-Za-z]$/.test(simbolo)) {
      i += 1
      if (simbolo === 'z' || simbolo === 'Z') {
        fechar()
        comando = ''
        continue
      }
      if (simbolo !== 'M' && simbolo !== 'L' && simbolo !== 'm' && simbolo !== 'l') return null
      comando = simbolo
      continue
    }
    if (comando === '') return null

    const x = Number(simbolos[i])
    const y = Number(simbolos[i + 1])
    i += 2
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null

    const relativo = comando === 'm' || comando === 'l'
    const ponto: Ponto = relativo ? { x: cursor.x + x, y: cursor.y + y } : { x, y }
    if (comando === 'M' || comando === 'm') {
      fechar()
      // Depois de um M, os pares seguintes sao L implicito.
      comando = comando === 'M' ? 'L' : 'l'
    }
    atual.push(ponto)
    cursor = ponto
  }

  fechar()
  return aneis.length === 0 ? null : aneis
}

/** Dobro da area orientada do anel. O sinal nao importa aqui, so a grandeza. */
function areaDupla(anel: Anel): number {
  let soma = 0
  for (let i = 0; i < anel.length; i += 1) {
    const a = anel[i]
    const b = anel[(i + 1) % anel.length]
    soma += a.x * b.y - b.x * a.y
  }
  return soma
}

function centroDe(anel: Anel): Ponto | null {
  const area = areaDupla(anel)
  if (Math.abs(area) < 1e-6) return null
  let somaX = 0
  let somaY = 0
  for (let i = 0; i < anel.length; i += 1) {
    const a = anel[i]
    const b = anel[(i + 1) % anel.length]
    const cruzado = a.x * b.y - b.x * a.y
    somaX += (a.x + b.x) * cruzado
    somaY += (a.y + b.y) * cruzado
  }
  return { x: somaX / (3 * area), y: somaY / (3 * area) }
}

/** Lancamento de raio: ponto dentro do anel. */
function dentroDe(anel: Anel, p: Ponto): boolean {
  let dentro = false
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i, i += 1) {
    const a = anel[i]
    const b = anel[j]
    const cruza = a.y > p.y !== b.y > p.y
    if (cruza && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro
  }
  return dentro
}

function caixaDe(anel: Anel): { x: number; y: number; largura: number; altura: number } {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of anel) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  return { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 }
}

/** Verdadeiro quando a caixa do rotulo cabe inteira dentro do anel. */
function cabeNoAnel(anel: Anel, centro: Ponto, meiaLargura: number, meiaAltura: number): boolean {
  const cantos: Ponto[] = [
    centro,
    { x: centro.x - meiaLargura, y: centro.y - meiaAltura },
    { x: centro.x + meiaLargura, y: centro.y - meiaAltura },
    { x: centro.x - meiaLargura, y: centro.y + meiaAltura },
    { x: centro.x + meiaLargura, y: centro.y + meiaAltura },
  ]
  return cantos.every((p) => dentroDe(anel, p))
}

/**
 * Onde desenhar a sigla, ou null quando ela nao cabe. Mede o maior anel da
 * unidade, que e a parte continental e nao uma ilha, e tenta primeiro o centro
 * de massa, depois o centro da caixa envolvente: em unidade comprida e torta,
 * caso do Acre, o centro da caixa cai fora do proprio estado.
 */
function ancoraDaSigla(d: string, letras: number): Ponto | null {
  const aneis = aneisDe(d)
  if (aneis === null) return null

  let maior = aneis[0]
  for (const anel of aneis) {
    if (Math.abs(areaDupla(anel)) > Math.abs(areaDupla(maior))) maior = anel
  }

  const meiaLargura = (letras * FONTE_SIGLA * LARGURA_GLIFO * FOLGA_SIGLA) / 2
  const meiaAltura = (FONTE_SIGLA * FOLGA_SIGLA) / 2
  const caixa = caixaDe(maior)
  if (caixa.largura < meiaLargura * 2 || caixa.altura < meiaAltura * 2) return null

  const candidatos: (Ponto | null)[] = [
    centroDe(maior),
    { x: caixa.x + caixa.largura / 2, y: caixa.y + caixa.altura / 2 },
  ]
  for (const candidato of candidatos) {
    if (candidato === null) continue
    if (cabeNoAnel(maior, candidato, meiaLargura, meiaAltura)) return candidato
  }
  return null
}

function textoSecoes(percentualSecoes: number | null): string {
  if (percentualSecoes === null) return 'sem seções totalizadas'
  return `${doisDecimais.format(percentualSecoes)}% das seções totalizadas`
}

function textoSituacao(detalhe: Detalhe): string | null {
  if (detalhe.situacao === 'sem-dado') return 'sem dado'
  if (detalhe.situacao === 'empate') return 'empate: liderança indefinida'
  if (detalhe.situacao === 'outra') {
    const nome = detalhe.liderExterna ?? 'outra candidatura'
    return `liderança de ${nome}, fora das candidaturas em destaque`
  }
  return null
}

/** Mesmo conteudo do balao, em texto, para o title e para a regiao aria-live. */
function textoDetalhe(detalhe: Detalhe): string {
  const linhas = [
    `${detalhe.sigla.toUpperCase()} ${detalhe.nome}: ${textoSecoes(detalhe.percentualSecoes)}`,
  ]
  const situacao = textoSituacao(detalhe)
  if (situacao !== null) linhas.push(situacao)
  for (const linha of detalhe.linhas) {
    const marca = linha.ehLider ? ', líder' : ''
    linhas.push(
      `${linha.nomeUrna} (${linha.numero}): ${inteiro.format(linha.votos)} votos, ` +
        `${doisDecimais.format(linha.percentual)}%${marca}`,
    )
  }
  return linhas.join('\n')
}

export default function MapaUF({
  dadosPorUf,
  numerosDestaque,
  modo,
  aoTrocarModo,
  numeroPercentual,
  ufSelecionada,
  aoSelecionar,
}: MapaUFProps) {
  const [malha, setMalha] = useState<Malha | null>(null)
  const [falhaMalha, setFalhaMalha] = useState(false)
  const [dica, setDica] = useState<Dica | null>(null)
  const [ufAtiva, setUfAtiva] = useState<string | null>(null)
  const [ufFoco, setUfFoco] = useState<string | null>(null)
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

  // A ancora sai da geometria, em unidades do viewBox: nao depende do tamanho
  // na tela, entao redimensionar a janela nao invalida a conta.
  const ancoras = useMemo(() => {
    const medidas: Record<string, Ponto> = {}
    if (malha === null) return medidas
    for (const uf of malha.ufs) {
      const ancora = ancoraDaSigla(uf.d, uf.sigla.length)
      if (ancora !== null) medidas[uf.sigla] = ancora
    }
    return medidas
  }, [malha])

  /** Nome de urna por numero, colhido de qualquer unidade que ja tenha respondido. */
  const nomesPorNumero = useMemo(() => {
    const nomes: Record<string, string> = {}
    for (const apuracao of Object.values(dadosPorUf)) {
      for (const candidatura of apuracao.candidaturas) {
        if (nomes[candidatura.numero] === undefined) {
          nomes[candidatura.numero] = candidatura.nomeUrna
        }
      }
    }
    return nomes
  }, [dadosPorUf])

  const nomeDe = (numero: string): string => nomesPorNumero[numero] ?? `candidatura ${numero}`

  const detalhes = useMemo(() => {
    const mapa: Record<string, Detalhe> = {}
    const destaque = new Set(numerosDestaque)

    for (const [sigla, apuracao] of Object.entries(dadosPorUf)) {
      const semSecao = apuracao.secoesTotalizadas <= 0
      let maiorVoto = 0
      let lider: string | null = null
      let empatadas = 0
      for (const candidatura of apuracao.candidaturas) {
        if (candidatura.votos > maiorVoto) {
          maiorVoto = candidatura.votos
          lider = candidatura.numero
          empatadas = 1
        } else if (candidatura.votos === maiorVoto && maiorVoto > 0) {
          empatadas += 1
        }
      }

      // Lideranca com zero voto apurado nao e lideranca. Empate exato no topo
      // tambem nao: no inicio da apuracao ele acontece.
      let situacao: Situacao
      if (semSecao || maiorVoto <= 0 || lider === null) situacao = 'sem-dado'
      else if (empatadas > 1) situacao = 'empate'
      else if (destaque.has(lider)) situacao = 'lider'
      else situacao = 'outra'

      const linhas: LinhaDestaque[] = []
      for (const numero of numerosDestaque) {
        const candidatura = apuracao.candidaturas.find((c) => c.numero === numero)
        linhas.push({
          numero,
          nomeUrna: candidatura?.nomeUrna ?? nomesPorNumero[numero] ?? `candidatura ${numero}`,
          votos: candidatura?.votos ?? 0,
          percentual: candidatura?.percentual ?? 0,
          cor: corDaCandidatura(numero),
          ehLider: situacao === 'lider' && numero === lider,
        })
      }

      mapa[sigla] = {
        sigla,
        nome: '',
        percentualSecoes: semSecao ? null : apuracao.percentualSecoes,
        situacao,
        liderExterna:
          situacao === 'outra' && lider !== null
            ? `${nomesPorNumero[lider] ?? `candidatura ${lider}`} (${lider})`
            : null,
        linhas,
      }
    }
    return mapa
  }, [dadosPorUf, numerosDestaque, nomesPorNumero])

  const detalheDe = (uf: UfMalha): Detalhe => {
    const base = detalhes[uf.sigla]
    if (base !== undefined) return { ...base, nome: uf.nome }
    return {
      sigla: uf.sigla,
      nome: uf.nome,
      percentualSecoes: null,
      situacao: 'sem-dado',
      liderExterna: null,
      linhas: [],
    }
  }

  /** Numero da candidatura que lidera a unidade, quando ela esta em destaque. */
  const liderEmDestaque = (sigla: string): string | null => {
    const detalhe = detalhes[sigla]
    if (detalhe === undefined || detalhe.situacao !== 'lider') return null
    return detalhe.linhas.find((l) => l.ehLider)?.numero ?? null
  }

  const corBase = numeroPercentual === null ? COR_BASE_PADRAO : hexDaCandidatura(numeroPercentual)
  const rampa = useMemo(() => rampaDe(corBase), [corBase])

  const percentuais = useMemo(() => {
    const valores: Record<string, number | null> = {}
    if (numeroPercentual === null) return valores
    for (const [sigla, apuracao] of Object.entries(dadosPorUf)) {
      if (apuracao.secoesTotalizadas <= 0) {
        valores[sigla] = null
        continue
      }
      const alvo = apuracao.candidaturas.find((c) => c.numero === numeroPercentual)
      valores[sigla] = alvo === undefined ? null : alvo.percentual
    }
    return valores
  }, [dadosPorUf, numeroPercentual])

  // Dominio arredondado para ponto percentual inteiro. O arredondamento
  // segura a escala entre duas coletas: ruido de centesimos nao repinta o
  // mapa inteiro a cada atualizacao do TSE.
  const escala = useMemo(() => {
    const valores = Object.values(percentuais).filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v),
    )
    if (valores.length === 0) return null
    const piso = Math.floor(Math.min(...valores))
    const teto = Math.ceil(Math.max(...valores))
    return { piso, teto: teto > piso ? teto : piso + 1 }
  }, [percentuais])

  const valorDe = (sigla: string): number | null => {
    const v = percentuais[sigla]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }

  /** Preenchimento e tinta da sigla andam juntos: a tinta e medida sobre o preenchimento. */
  const pinturaDe = (sigla: string): { cor: string; tinta: string | null } => {
    if (modo === 'percentual') {
      const valor = valorDe(sigla)
      if (valor === null || escala === null) return { cor: COR_SEM_DADO, tinta: TINTA_CLARA }
      const razao = (valor - escala.piso) / (escala.teto - escala.piso)
      const classe = Math.min(CLASSES - 1, Math.max(0, Math.floor(razao * CLASSES)))
      return { cor: rampa[classe], tinta: tintaSobre(rampa[classe]) }
    }

    const detalhe = detalhes[sigla]
    if (detalhe === undefined || detalhe.situacao === 'sem-dado') {
      return { cor: COR_SEM_DADO, tinta: TINTA_CLARA }
    }
    if (detalhe.situacao !== 'lider') return { cor: COR_INDEFINIDA, tinta: TINTA_CLARA }
    const numero = liderEmDestaque(sigla)
    if (numero === null) return { cor: COR_INDEFINIDA, tinta: TINTA_CLARA }
    return { cor: corDaCandidatura(numero), tinta: tintaSobre(hexDaCandidatura(numero)) }
  }

  const textoValor = (valor: number | null) =>
    valor === null ? 'sem dado' : `${doisDecimais.format(valor)}%`

  const textoLider = (sigla: string): string => {
    const detalhe = detalhes[sigla]
    if (detalhe === undefined || detalhe.situacao === 'sem-dado') return 'sem dado'
    if (detalhe.situacao === 'empate') return 'empate'
    if (detalhe.situacao === 'outra') return detalhe.liderExterna ?? 'outra candidatura'
    const numero = liderEmDestaque(sigla)
    return numero === null ? 'outra candidatura' : `${nomeDe(numero)} (${numero})`
  }

  const posicionar = (uf: UfMalha, x: number, y: number) => {
    const area = caixa.current?.getBoundingClientRect()
    if (!area) return
    setDica({ detalhe: detalheDe(uf), x: x - area.left, y: y - area.top })
  }

  const aoPassar = (e: MouseEvent<SVGPathElement>, uf: UfMalha) => {
    posicionar(uf, e.clientX, e.clientY)
  }

  const aoFocar = (e: FocusEvent<SVGPathElement>, uf: UfMalha) => {
    const r = e.currentTarget.getBoundingClientRect()
    setUfAtiva(uf.sigla)
    setUfFoco(uf.sigla)
    posicionar(uf, r.left + r.width / 2, r.top)
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

  const aoSair = () => {
    limpar()
    setUfFoco(null)
  }

  const rotuloPercentual =
    numeroPercentual === null
      ? 'uma candidatura'
      : `${nomeDe(numeroPercentual)} (${numeroPercentual})`

  const legenda =
    modo === 'lider'
      ? 'Candidatura mais votada em cada unidade federativa'
      : `Percentual de votos de ${rotuloPercentual} por unidade federativa`

  const controles = (
    <div
      className="mb-3 flex flex-wrap items-center gap-2 text-xs"
      role="group"
      aria-label="Modo de leitura do mapa"
    >
      {(
        [
          ['lider', 'Líder'],
          ['percentual', 'Percentual de um candidato'],
        ] as const
      ).map(([valor, rotulo]) => (
        <button
          key={valor}
          type="button"
          aria-pressed={modo === valor}
          onClick={() => aoTrocarModo(valor)}
          className={`cursor-pointer rounded-md border px-2.5 py-1 ${
            modo === valor
              ? 'border-[var(--color-tinta-3)] bg-[var(--color-base)] text-[var(--color-tinta)]'
              : 'border-[var(--color-grade)] text-[var(--color-tinta-3)]'
          }`}
        >
          {rotulo}
        </button>
      ))}
    </div>
  )

  if (falhaMalha) {
    return (
      <figure className="m-0">
        {controles}
        <p className="text-sm text-[var(--color-alerta)]">
          Não foi possível carregar a malha das unidades federativas. O mapa fica
          indisponível; os números por estado seguem na tabela da apuração.
        </p>
      </figure>
    )
  }

  if (!malha) {
    return (
      <figure className="m-0">
        {controles}
        <p className="text-sm text-[var(--color-tinta-3)]">Carregando a malha do mapa…</p>
      </figure>
    )
  }

  const contornos = malha.ufs.filter((u) => u.sigla === ufAtiva || u.sigla === ufSelecionada)
  const ufEmFoco = ufFoco === null ? undefined : malha.ufs.find((u) => u.sigla === ufFoco)

  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-sm text-[var(--color-tinta-2)]">{legenda}</figcaption>

      {controles}

      <div ref={caixa} className="relative">
        <svg
          viewBox={malha.viewBox}
          className="mx-auto h-auto w-full max-w-xl"
          role="group"
          aria-label={
            modo === 'lider'
              ? 'Mapa do Brasil com a candidatura mais votada em cada unidade federativa. Selecione uma unidade para detalhar.'
              : `Mapa do Brasil com o percentual de ${rotuloPercentual} em cada unidade federativa. Selecione uma unidade para detalhar.`
          }
        >
          <g>
            {malha.ufs.map((uf) => {
              const selecionada = uf.sigla === ufSelecionada
              const { cor } = pinturaDe(uf.sigla)
              return (
                <path
                  key={uf.sigla}
                  d={uf.d}
                  fill={cor}
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
                  onBlur={aoSair}
                >
                  <title>{textoDetalhe(detalheDe(uf))}</title>
                </path>
              )
            })}
          </g>

          {/* Codificacao secundaria: a sigla sobre o preenchimento, para quem
              compara unidades distantes sem conseguir separar as cores. Sai
              apenas onde a caixa do rotulo cabe inteira dentro da unidade, em
              tamanho unico; unidade apertada perde a sigla e mantem o dado no
              balao, no title e na tabela. */}
          <g pointerEvents="none" aria-hidden="true">
            {malha.ufs.map((uf) => {
              const ancora = ancoras[uf.sigla]
              if (ancora === undefined) return null
              const { tinta } = pinturaDe(uf.sigla)
              if (tinta === null) return null
              return (
                <text
                  key={uf.sigla}
                  x={ancora.x}
                  y={ancora.y}
                  fill={tinta}
                  fontSize={FONTE_SIGLA}
                  fontWeight={600}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {uf.sigla.toUpperCase()}
                </text>
              )
            })}
          </g>

          {/* Contorno de selecao e anel de foco ficam numa camada acima, porque
              o traco de um estado seria coberto pelo preenchimento do vizinho. */}
          <g pointerEvents="none">
            {contornos.map((uf) => (
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
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md border border-white/10 bg-[var(--color-superficie)] px-2.5 py-2 text-xs whitespace-nowrap shadow-lg"
            style={{ left: dica.x, top: dica.y }}
            role="presentation"
          >
            <div>
              <span className="font-medium">{dica.detalhe.sigla.toUpperCase()}</span>
              <span className="ml-1.5 text-[var(--color-tinta-2)]">{dica.detalhe.nome}</span>
              <span className="tabular ml-2.5 text-[var(--color-tinta-3)]">
                {textoSecoes(dica.detalhe.percentualSecoes)}
              </span>
            </div>
            {textoSituacao(dica.detalhe) !== null && (
              <div className="mt-1 text-[var(--color-tinta-3)]">{textoSituacao(dica.detalhe)}</div>
            )}
            {dica.detalhe.linhas.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {dica.detalhe.linhas.map((linha) => (
                  <li
                    key={linha.numero}
                    className={`flex items-center gap-1.5 ${
                      linha.ehLider ? 'font-semibold' : 'font-normal'
                    }`}
                  >
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: linha.cor }}
                      aria-hidden="true"
                    />
                    <span>{linha.nomeUrna}</span>
                    <span className="tabular ml-auto pl-3">{inteiro.format(linha.votos)}</span>
                    <span className="tabular w-14 text-right text-[var(--color-tinta-2)]">
                      {doisDecimais.format(linha.percentual)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* O balao nao chega a quem navega por teclado: o mesmo texto sai aqui. */}
      <div aria-live="polite" className="sr-only">
        {ufEmFoco === undefined ? '' : textoDetalhe(detalheDe(ufEmFoco))}
      </div>

      {modo === 'lider' ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-tinta-3)]">
          {numerosDestaque.map((numero) => (
            <div key={numero} className="flex items-center gap-2">
              <span
                className="h-3 w-6 border border-white/10"
                style={{ backgroundColor: corDaCandidatura(numero) }}
                aria-hidden="true"
              />
              <span>
                {nomeDe(numero)} ({numero})
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-6 border border-white/10"
              style={{ backgroundColor: COR_INDEFINIDA }}
              aria-hidden="true"
            />
            <span>outra candidatura, ou empate</span>
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
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-tinta-3)]">
          <div className="flex items-center gap-2">
            <span className="tabular">
              {escala ? `${doisDecimais.format(escala.piso)}%` : '—'}
            </span>
            <span className="flex" aria-hidden="true">
              {rampa.map((cor) => (
                <span key={cor} className="h-3 w-6" style={{ backgroundColor: cor }} />
              ))}
            </span>
            <span className="tabular">
              {escala ? `${doisDecimais.format(escala.teto)}%` : '—'}
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
      )}

      {/* Gêmea em tabela: o valor de cada unidade federativa precisa ser
          legível sem depender de cor nem de passar o ponteiro. */}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-[var(--color-tinta-3)]">
          Ver os valores em tabela
        </summary>
        <table className="mt-3 w-full border-collapse text-sm">
          <caption className="sr-only">{legenda}</caption>
          <thead>
            <tr className="border-b border-[var(--color-grade)] text-left text-xs text-[var(--color-tinta-3)]">
              <th scope="col" className="py-1.5 font-medium">
                Unidade federativa
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                {modo === 'lider' ? 'Mais votada' : 'Percentual'}
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
                  {modo === 'lider' ? textoLider(uf.sigla) : textoValor(valorDe(uf.sigla))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

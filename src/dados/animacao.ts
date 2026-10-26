import { useEffect, useState } from 'react'

/**
 * Leitura do arquivo da animacao da apuracao, gerado por
 * scripts/montar-animacao.mjs e versionado em public/animacao-2turno.json.
 *
 * O arquivo pesa cerca de 800 KB em texto, entao a aba que o usa e carregada
 * sob demanda e este modulo guarda a promessa: quem voltar para a aba nao
 * baixa de novo.
 */

export interface CandidatoAnimacao {
  numero: string
  nomeUrna: string
  partido: string
}

/**
 * Entrada de um municipio, em vetor para economizar bytes:
 * [codigo, nome, uf, secoes, eleitorado, votos do 1o finalista,
 *  votos do 2o finalista, latitude, longitude, curva]
 *
 * A curva e uma lista de pares [indice do instante, secoes acumuladas],
 * gravada apenas nos instantes em que o numero mudou. O exterior entra como
 * uma entrada unica, com uf "zz" e sem coordenada.
 */
export type EntradaMunicipio = [
  string,
  string,
  string,
  number,
  number,
  number,
  number,
  number | null,
  number | null,
  [number, number][],
]

/** Evento da linha do tempo: [instante, texto, fonte]. */
export type EventoAnimacao = [number, string, string]

export interface DadosAnimacao {
  eleicao: string
  cargo: string
  geradoEm: string
  candidatos: CandidatoAnimacao[]
  finalistas: string[]
  /** Teto dos vasos, em votos. */
  cap: number
  /** Instante de cada ponto da serie, em segundos desde a epoca. */
  t: number[]
  /** Percentual de secoes totalizadas no Brasil. */
  pst: number[]
  /** Percentual de cada finalista no Brasil. */
  pct: number[][]
  /** Projecao por variacao entre turnos, por finalista. */
  proj: number[][]
  /** Meia faixa da projecao, em pontos percentuais, por finalista. */
  faixa: number[][]
  /** Cobertura do volume de votos, em percentual. */
  cob: number[]
  eventos: EventoAnimacao[]
  mun: EntradaMunicipio[]
}

export interface MalhaUf {
  sigla: string
  d: string
}

export interface PacoteAnimacao {
  dados: DadosAnimacao
  malha: MalhaUf[]
}

let cache: PacoteAnimacao | null = null
let promessa: Promise<PacoteAnimacao> | null = null

function ehPacote(valor: unknown): valor is DadosAnimacao {
  if (valor === null || typeof valor !== 'object') return false
  const d = valor as Partial<DadosAnimacao>
  return (
    Array.isArray(d.t) &&
    Array.isArray(d.mun) &&
    Array.isArray(d.pst) &&
    Array.isArray(d.candidatos) &&
    typeof d.cap === 'number'
  )
}

async function baixar(): Promise<PacoteAnimacao> {
  const base = import.meta.env.BASE_URL
  const [respostaDados, respostaMalha] = await Promise.all([
    fetch(`${base}animacao-2turno.json`),
    fetch(`${base}uf-geo.json`),
  ])
  if (!respostaDados.ok) throw new Error(`animacao-2turno.json respondeu ${respostaDados.status}`)
  if (!respostaMalha.ok) throw new Error(`uf-geo.json respondeu ${respostaMalha.status}`)
  const dados: unknown = await respostaDados.json()
  if (!ehPacote(dados)) throw new Error('animacao-2turno.json em formato inesperado')
  const malhaBruta = (await respostaMalha.json()) as { ufs?: MalhaUf[] }
  const pacote: PacoteAnimacao = { dados, malha: malhaBruta.ufs ?? [] }
  cache = pacote
  return pacote
}

export function carregarAnimacao(): Promise<PacoteAnimacao> {
  if (cache !== null) return Promise.resolve(cache)
  if (promessa === null) {
    promessa = baixar().catch((erro: unknown) => {
      // Uma falha nao pode envenenar a promessa guardada: a proxima visita
      // precisa poder tentar de novo.
      promessa = null
      throw erro
    })
  }
  return promessa
}

export interface EstadoAnimacao {
  pacote: PacoteAnimacao | null
  erro: string | null
}

export function useAnimacao(): EstadoAnimacao {
  const [estado, definir] = useState<EstadoAnimacao>({ pacote: cache, erro: null })

  useEffect(() => {
    if (cache !== null) return
    let vivo = true
    carregarAnimacao()
      .then((pacote) => {
        if (vivo) definir({ pacote, erro: null })
      })
      .catch((erro: unknown) => {
        if (vivo) {
          definir({
            pacote: null,
            erro: erro instanceof Error ? erro.message : 'falha ao carregar a animação',
          })
        }
      })
    return () => {
      vivo = false
    }
  }, [])

  return estado
}

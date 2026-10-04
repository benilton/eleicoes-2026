import { useEffect, useMemo, useState } from 'react'
import type { PontoSerie } from './useSerieTemporal'

/**
 * Historico da apuracao publicado no proprio repositorio.
 *
 * A leitura e feita em raw.githubusercontent.com, e nao nos assets publicados,
 * porque o workflow que grava o snapshot nao dispara novo deploy: o arquivo
 * publicado ficaria congelado na versao do ultimo build. O raw responde a
 * requisicao de outra origem com CORS liberado e `cache-control: max-age=300`,
 * o mesmo periodo usado aqui para reconsultar.
 */

const INTERVALO_ATUALIZACAO_MS = 300_000

const BASE_HISTORICO = 'https://raw.githubusercontent.com/benilton/eleicoes-2026/main/historico'

const preencher = (valor: string, tamanho: number): string => valor.padStart(tamanho, '0')

const urlHistorico = (eleicao: string, cargo: string): string =>
  `${BASE_HISTORICO}/e${preencher(eleicao, 6)}-c${preencher(cargo, 4)}.json`

/** Ponto da serie nacional, ja desempacotado do formato colunar do arquivo. */
export interface PontoHistorico {
  t: number
  pst: number
  porCandidato: Record<string, number>
  /**
   * Total de votos nominais apurados no instante, denominador do percentual.
   * Opcional: arquivo de historico gravado antes da serie `vnom` nao tem o
   * numero, e ponto sem ele apenas fica sem intervalo de confianca.
   */
  n?: number
}

/** Serie de uma unidade federativa, com cada candidatura em vetor proprio. */
export interface SerieUf {
  sigla: string
  pst: number[]
  porCandidato: Record<string, number[]>
}

export interface EstadoHistorico {
  br: PontoHistorico[]
  ufs: Record<string, SerieUf>
  origem: 'repositorio' | 'local' | 'misto' | 'vazio'
  carregando: boolean
  erro: string | null
}

// ---------------------------------------------------------------------------
// Contrato do arquivo e validacao de formato
// ---------------------------------------------------------------------------

interface CandidatoHistorico {
  numero: string
  nomeUrna: string
  partido: string
}

interface SerieBrutaBr {
  t: number[]
  idg?: string[]
  pst: number[]
  pct: number[][]
  /** Votos nominais por ponto, alinhado posicionalmente com `t`. */
  vnom?: number[]
}

interface SerieBrutaUf {
  pst: number[]
  pct: number[][]
  te?: number
  pc?: number
}

interface ArquivoHistorico {
  eleicao: string
  cargo: string
  atualizadoEm: string
  candidatos: CandidatoHistorico[]
  br: SerieBrutaBr
  ufs: Record<string, SerieBrutaUf>
}

const ehObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)

const ehVetorDeNumeros = (valor: unknown): valor is number[] =>
  Array.isArray(valor) && valor.every((item) => typeof item === 'number' && Number.isFinite(item))

const ehMatrizDeNumeros = (valor: unknown): valor is number[][] =>
  Array.isArray(valor) && valor.every(ehVetorDeNumeros)

const ehVetorDeTextos = (valor: unknown): valor is string[] =>
  Array.isArray(valor) && valor.every((item) => typeof item === 'string')

function ehCandidatos(valor: unknown): valor is CandidatoHistorico[] {
  if (!Array.isArray(valor)) return false
  return valor.every((item) => {
    if (!ehObjeto(item)) return false
    return (
      typeof item.numero === 'string' &&
      typeof item.nomeUrna === 'string' &&
      typeof item.partido === 'string'
    )
  })
}

/**
 * Confere se cada candidatura tem uma linha de percentuais do tamanho da serie.
 * Linha sobrando e aceita e depois ignorada, porque sem nome em `candidatos` ela
 * nao tem a quem ser atribuida. Linha faltando reprova o arquivo: a leitura
 * posicional atribuiria a serie errada a alguma candidatura.
 */
function matrizAlinhada(pct: number[][], candidatos: number, comprimento: number): boolean {
  if (pct.length < candidatos) return false
  return pct.every((linha) => linha.length === comprimento)
}

function ehSerieBrutaBr(valor: unknown, candidatos: number): valor is SerieBrutaBr {
  if (!ehObjeto(valor)) return false
  if (!ehVetorDeNumeros(valor.t)) return false
  if (!ehVetorDeNumeros(valor.pst)) return false
  if (!ehMatrizDeNumeros(valor.pct)) return false
  if (valor.idg !== undefined && !ehVetorDeTextos(valor.idg)) return false
  // `vnom` e opcional. Presente e fora do passo com `t`, o arquivo reprova: a
  // leitura posicional atribuiria o denominador errado a algum ponto.
  if (valor.vnom !== undefined) {
    if (!ehVetorDeNumeros(valor.vnom)) return false
    if (valor.vnom.length !== valor.t.length) return false
  }
  if (valor.t.length !== valor.pst.length) return false
  return matrizAlinhada(valor.pct, candidatos, valor.t.length)
}

function ehSerieBrutaUf(valor: unknown, candidatos: number): valor is SerieBrutaUf {
  if (!ehObjeto(valor)) return false
  if (!ehVetorDeNumeros(valor.pst)) return false
  if (!ehMatrizDeNumeros(valor.pct)) return false
  if (valor.te !== undefined && typeof valor.te !== 'number') return false
  if (valor.pc !== undefined && typeof valor.pc !== 'number') return false
  return matrizAlinhada(valor.pct, candidatos, valor.pst.length)
}

function ehArquivoHistorico(valor: unknown): valor is ArquivoHistorico {
  if (!ehObjeto(valor)) return false
  if (typeof valor.eleicao !== 'string') return false
  if (typeof valor.cargo !== 'string') return false
  if (typeof valor.atualizadoEm !== 'string') return false
  if (!ehCandidatos(valor.candidatos)) return false

  const candidatos = valor.candidatos.length
  if (!ehSerieBrutaBr(valor.br, candidatos)) return false
  if (!ehObjeto(valor.ufs)) return false

  return Object.values(valor.ufs).every((serie) => ehSerieBrutaUf(serie, candidatos))
}

// ---------------------------------------------------------------------------
// Desempacotamento e emenda
// ---------------------------------------------------------------------------

/** Converte o formato colunar do arquivo na serie nacional ponto a ponto. */
function pontosDoRepositorio(arquivo: ArquivoHistorico): PontoHistorico[] {
  const pontos: PontoHistorico[] = []
  for (let indice = 0; indice < arquivo.br.t.length; indice += 1) {
    const porCandidato: Record<string, number> = {}
    for (let ordem = 0; ordem < arquivo.candidatos.length; ordem += 1) {
      const candidato = arquivo.candidatos[ordem]
      const linha = arquivo.br.pct[ordem]
      if (candidato === undefined || linha === undefined) continue
      const percentual = linha[indice]
      if (percentual === undefined) continue
      porCandidato[candidato.numero] = percentual
    }
    const ponto: PontoHistorico = {
      t: arquivo.br.t[indice] ?? 0,
      pst: arquivo.br.pst[indice] ?? 0,
      porCandidato,
    }
    const n = arquivo.br.vnom?.[indice]
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) ponto.n = n
    pontos.push(ponto)
  }
  return pontos
}

function seriesDasUfs(arquivo: ArquivoHistorico): Record<string, SerieUf> {
  const ufs: Record<string, SerieUf> = {}
  for (const [sigla, bruta] of Object.entries(arquivo.ufs)) {
    const porCandidato: Record<string, number[]> = {}
    for (let ordem = 0; ordem < arquivo.candidatos.length; ordem += 1) {
      const candidato = arquivo.candidatos[ordem]
      const linha = bruta.pct[ordem]
      if (candidato === undefined || linha === undefined) continue
      porCandidato[candidato.numero] = linha
    }
    ufs[sigla] = { sigla, pst: bruta.pst, porCandidato }
  }
  return ufs
}

function pontoDoLocal(ponto: PontoSerie): PontoHistorico {
  const convertido: PontoHistorico = {
    t: ponto.horario,
    pst: ponto.percentualSecoes,
    porCandidato: ponto.porCandidato,
  }
  const n = ponto.votosNominais
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) convertido.n = n
  return convertido
}

/**
 * Emenda as duas origens: primeiro o que veio do repositorio, depois os pontos
 * locais que avancaram alem do ultimo percentual de secoes ja publicado. Um
 * mesmo instante nunca entra duas vezes, e o resultado sai ordenado por `pst`.
 */
function emendar(doRepositorio: PontoHistorico[], locais: PontoSerie[]): PontoHistorico[] {
  const ordenadosDoRepositorio = [...doRepositorio].sort((a, b) => a.pst - b.pst || a.t - b.t)

  const ultimo = ordenadosDoRepositorio[ordenadosDoRepositorio.length - 1]
  const tetoPst = ultimo === undefined ? Number.NEGATIVE_INFINITY : ultimo.pst

  const instantes = new Set<number>(ordenadosDoRepositorio.map((ponto) => ponto.t))
  const acrescidos: PontoHistorico[] = []

  for (const bruto of locais) {
    if (!(bruto.percentualSecoes > tetoPst)) continue
    if (instantes.has(bruto.horario)) continue
    instantes.add(bruto.horario)
    acrescidos.push(pontoDoLocal(bruto))
  }

  return [...ordenadosDoRepositorio, ...acrescidos].sort((a, b) => a.pst - b.pst || a.t - b.t)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const UFS_VAZIAS: Record<string, SerieUf> = {}

/** O alvo viaja junto do dado, para que a troca de eleicao descarte o anterior. */
interface BuscaDoAlvo {
  alvo: string
  arquivo: ArquivoHistorico | null
  carregando: boolean
  erro: string | null
}

/**
 * Le o historico publicado no repositorio e o emenda com a serie que o proprio
 * navegador acumulou. A ausencia do arquivo nao e falha: enquanto o snapshot
 * nao existir, a serie local responde sozinha.
 */
export function useHistorico(
  eleicao: string,
  cargo: string,
  serieLocal: PontoSerie[],
): EstadoHistorico {
  const alvo = `${eleicao}:${cargo}`
  const [busca, setBusca] = useState<BuscaDoAlvo>({
    alvo,
    arquivo: null,
    carregando: true,
    erro: null,
  })

  useEffect(() => {
    const controlador = new AbortController()
    const sinal = controlador.signal
    let temporizador: number | undefined

    // Nao ha reinicio de estado aqui: o alvo viaja junto da busca e a derivacao
    // durante o render ja devolve carregando enquanto o alvo gravado for outro.
    const consultar = async (): Promise<void> => {
      try {
        const resposta = await fetch(urlHistorico(eleicao, cargo), {
          cache: 'no-store',
          signal: sinal,
        })
        if (sinal.aborted) return

        // Snapshot ainda nao publicado. Nao e erro: a serie local basta.
        if (resposta.status === 404) {
          setBusca({ alvo, arquivo: null, carregando: false, erro: null })
          return
        }
        if (!resposta.ok) {
          setBusca({
            alvo,
            arquivo: null,
            carregando: false,
            erro: `Historico respondeu ${resposta.status}`,
          })
          return
        }

        const bruto: unknown = await resposta.json()
        if (sinal.aborted) return

        // Arquivo fora do formato vale por arquivo ausente, com aviso.
        if (!ehArquivoHistorico(bruto)) {
          setBusca({
            alvo,
            arquivo: null,
            carregando: false,
            erro: 'Historico em formato inesperado; usando apenas a serie local',
          })
          return
        }

        setBusca({ alvo, arquivo: bruto, carregando: false, erro: null })
      } catch (erro) {
        if (sinal.aborted) return
        const mensagem = erro instanceof Error ? erro.message : 'Falha ao ler o historico'
        setBusca({ alvo, arquivo: null, carregando: false, erro: mensagem })
      }
    }

    const rodar = async (): Promise<void> => {
      await consultar()
      if (sinal.aborted) return
      temporizador = window.setTimeout(() => {
        void rodar()
      }, INTERVALO_ATUALIZACAO_MS)
    }

    void rodar()

    return () => {
      controlador.abort()
      if (temporizador !== undefined) window.clearTimeout(temporizador)
    }
  }, [alvo, eleicao, cargo])

  const corrente = busca.alvo === alvo ? busca : null
  const arquivo = corrente === null ? null : corrente.arquivo
  const carregando = corrente === null ? true : corrente.carregando
  const erro = corrente === null ? null : corrente.erro

  return useMemo<EstadoHistorico>(() => {
    const doRepositorio = arquivo === null ? [] : pontosDoRepositorio(arquivo)
    const ufs = arquivo === null ? UFS_VAZIAS : seriesDasUfs(arquivo)
    const br = emendar(doRepositorio, serieLocal)

    const acrescidos = br.length - doRepositorio.length
    let origem: EstadoHistorico['origem'] = 'vazio'
    if (doRepositorio.length > 0 && acrescidos > 0) origem = 'misto'
    else if (doRepositorio.length > 0) origem = 'repositorio'
    else if (br.length > 0) origem = 'local'

    return { br, ufs, origem, carregando, erro }
  }, [arquivo, serieLocal, carregando, erro])
}

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Apuracao } from '../tse/tipos'

const NOME_BANCO = 'apuracao-2026'
const NOME_DEPOSITO = 'series'
const VERSAO_BANCO = 1

/** Teto de pontos por chave. Acima disso, os mais antigos sao descartados. */
const TETO_PONTOS = 2000

/** Fotografia de um instante da apuracao, acumulada no navegador do visitante. */
export interface PontoSerie {
  idg: string
  horario: number
  percentualSecoes: number
  porCandidato: Record<string, number>
  /**
   * Total de votos nominais apurados no instante, denominador do percentual.
   * Opcional de proposito: ponto gravado antes desta versao nao tem o campo, e
   * precisa continuar carregando. Ausente significa intervalo indisponivel.
   */
  votosNominais?: number
}

export interface EstadoSerieTemporal {
  serie: PontoSerie[]
  disponivel: boolean
}

/** Referencia estavel para a serie vazia, que evita memo invalidado a cada render. */
const SERIE_VAZIA: PontoSerie[] = []

// A serie fica gravada junto da chave a que pertence. Assim a troca de alvo
// descarta o acumulado durante o render, sem setState dentro do efeito.
interface SerieDaChave {
  chave: string
  pontos: PontoSerie[]
}

const chaveDe = (apuracao: Apuracao): string =>
  `${apuracao.eleicao}:${apuracao.uf}:${apuracao.cargo}`

function montarPonto(apuracao: Apuracao): PontoSerie {
  const porCandidato: Record<string, number> = {}
  for (const candidatura of apuracao.candidaturas) {
    porCandidato[candidatura.numero] = candidatura.percentual
  }
  const ponto: PontoSerie = {
    idg: apuracao.idGeracao,
    horario: Date.now(),
    percentualSecoes: apuracao.percentualSecoes,
    porCandidato,
  }
  if (Number.isFinite(apuracao.votosNominais) && apuracao.votosNominais > 0) {
    ponto.votosNominais = apuracao.votosNominais
  }
  return ponto
}

function promessaDeRequisicao<T>(requisicao: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolver, rejeitar) => {
    requisicao.onsuccess = () => resolver(requisicao.result)
    requisicao.onerror = () => rejeitar(requisicao.error ?? new Error('Falha no IndexedDB'))
  })
}

// Uma unica tentativa de abertura por carregamento da pagina. Em janela privada
// ou com armazenamento bloqueado a promessa resolve nulo e o hook segue em memoria.
let aberturaDoBanco: Promise<IDBDatabase | null> | null = null

function abrirBanco(): Promise<IDBDatabase | null> {
  if (aberturaDoBanco !== null) return aberturaDoBanco

  aberturaDoBanco = new Promise<IDBDatabase | null>((resolver) => {
    try {
      if (typeof indexedDB === 'undefined' || indexedDB === null) {
        resolver(null)
        return
      }
      const requisicao = indexedDB.open(NOME_BANCO, VERSAO_BANCO)
      requisicao.onupgradeneeded = () => {
        const banco = requisicao.result
        if (!banco.objectStoreNames.contains(NOME_DEPOSITO)) {
          banco.createObjectStore(NOME_DEPOSITO)
        }
      }
      requisicao.onsuccess = () => resolver(requisicao.result)
      requisicao.onerror = () => resolver(null)
      requisicao.onblocked = () => resolver(null)
    } catch {
      resolver(null)
    }
  })

  return aberturaDoBanco
}

/** Devolve os pontos guardados, ou nulo quando o armazenamento nao responde. */
async function lerPontos(chave: string): Promise<PontoSerie[] | null> {
  try {
    const banco = await abrirBanco()
    if (banco === null) return null
    const transacao = banco.transaction(NOME_DEPOSITO, 'readonly')
    const requisicao: IDBRequest<unknown> = transacao.objectStore(NOME_DEPOSITO).get(chave)
    const bruto = await promessaDeRequisicao<unknown>(requisicao)
    if (!Array.isArray(bruto)) return []
    const pontos = bruto as PontoSerie[]
    return [...pontos].sort((a, b) => a.horario - b.horario)
  } catch {
    return null
  }
}

/** Grava a serie inteira sob a chave. Devolve se a persistencia funcionou. */
async function gravarPontos(chave: string, pontos: PontoSerie[]): Promise<boolean> {
  try {
    const banco = await abrirBanco()
    if (banco === null) return false
    const transacao = banco.transaction(NOME_DEPOSITO, 'readwrite')
    const requisicao: IDBRequest<IDBValidKey> = transacao
      .objectStore(NOME_DEPOSITO)
      .put(pontos, chave)
    await promessaDeRequisicao<IDBValidKey>(requisicao)
    return true
  } catch {
    return false
  }
}

/**
 * Acumula a serie historica da apuracao no navegador do visitante, ja que o
 * TSE publica apenas a fotografia corrente. Sem IndexedDB o hook continua
 * funcionando em memoria, com `disponivel` em falso.
 */
export function useSerieTemporal(apuracao: Apuracao | null): EstadoSerieTemporal {
  const [guardado, setGuardado] = useState<SerieDaChave>({ chave: '', pontos: SERIE_VAZIA })
  const [disponivel, setDisponivel] = useState(false)

  const montado = useRef(true)
  const pontosCorrentes = useRef<PontoSerie[]>(SERIE_VAZIA)
  const idgsVistos = useRef<Set<string>>(new Set<string>())
  // Carga unica por chave, compartilhada entre execucoes concorrentes do efeito.
  const carga = useRef<{ chave: string; promessa: Promise<void> } | null>(null)

  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  useEffect(() => {
    if (apuracao === null) return
    const chave = chaveDe(apuracao)
    let cancelado = false

    /** Recupera o que ja estava guardado, uma vez so por chave. */
    const garantirCarga = (): Promise<void> => {
      const emAndamento = carga.current
      if (emAndamento !== null && emAndamento.chave === chave) return emAndamento.promessa

      const promessa = (async () => {
        pontosCorrentes.current = SERIE_VAZIA
        idgsVistos.current = new Set<string>()

        const guardados = await lerPontos(chave)
        if (!montado.current || carga.current?.chave !== chave) return

        setDisponivel(guardados !== null)
        if (guardados !== null && guardados.length > 0) {
          pontosCorrentes.current = guardados
          idgsVistos.current = new Set<string>(guardados.map((ponto) => ponto.idg))
          setGuardado({ chave, pontos: guardados })
        }
      })()

      carga.current = { chave, promessa }
      return promessa
    }

    const acumular = async () => {
      await garantirCarga()
      if (cancelado || !montado.current || carga.current?.chave !== chave) return

      // Deduplicacao: o mesmo idg nunca gera dois pontos.
      if (idgsVistos.current.has(apuracao.idGeracao)) return

      const ponto = montarPonto(apuracao)
      const anteriores = pontosCorrentes.current
      const atualizada = [...anteriores, ponto].slice(-TETO_PONTOS)

      // Se houve descarte do inicio, o conjunto de idgs precisa ser refeito.
      if (atualizada.length < anteriores.length + 1) {
        idgsVistos.current = new Set<string>(atualizada.map((item) => item.idg))
      } else {
        idgsVistos.current.add(ponto.idg)
      }

      pontosCorrentes.current = atualizada
      setGuardado({ chave, pontos: atualizada })

      const gravou = await gravarPontos(chave, atualizada)
      if (!montado.current || carga.current?.chave !== chave) return
      setDisponivel(gravou)
    }

    void acumular()

    return () => {
      cancelado = true
    }
  }, [apuracao])

  const chave = apuracao === null ? null : chaveDe(apuracao)
  const serie = chave !== null && guardado.chave === chave ? guardado.pontos : SERIE_VAZIA

  return useMemo(() => ({ serie, disponivel }), [serie, disponivel])
}

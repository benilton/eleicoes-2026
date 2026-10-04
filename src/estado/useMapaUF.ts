import { useEffect, useMemo, useState } from 'react'
import { atrasoDeRecuo, buscarResultado } from '../tse/cliente'
import type { Apuracao } from '../tse/tipos'
import { UFS } from '../tse/urls'

/** Ciclo completo sobre as 27 unidades federativas a cada tres minutos. */
const PERIODO_CICLO_MS = 180_000

/** Nunca mais de seis requisicoes simultaneas, para nao disparar rajada de 27. */
const TAMANHO_LOTE = 6

/** Respiro entre lotes, que espalha as requisicoes ao longo do ciclo. */
const INTERVALO_ENTRE_LOTES_MS = 1_500

/** Piso entre o inicio de dois ciclos, alinhado ao teto local do cliente. */
const INTERVALO_MINIMO_CICLO_MS = 30_000

/** Referencia estavel para o mapa vazio, que evita memo invalidado a cada render. */
const MAPA_VAZIO: Record<string, Apuracao> = {}

export interface EstadoMapaUF {
  porUf: Record<string, Apuracao>
  carregadas: number
  total: number
  erro: string | null
}

// O alvo fica gravado junto do dado. Assim a troca de eleicao ou de cargo
// descarta o acumulado durante o render, sem setState dentro do efeito.
interface AcumuladoUF {
  alvo: string
  mapa: Record<string, Apuracao>
}

interface ErroDoAlvo {
  alvo: string
  erro: string | null
}

/** Espera cancelavel: o aborto resolve de imediato e limpa o temporizador. */
function espera(ms: number, sinal: AbortSignal): Promise<void> {
  return new Promise<void>((resolver) => {
    if (sinal.aborted) {
      resolver()
      return
    }
    let temporizador: number | undefined
    const aoAbortar = () => {
      if (temporizador !== undefined) window.clearTimeout(temporizador)
      resolver()
    }
    temporizador = window.setTimeout(() => {
      sinal.removeEventListener('abort', aoAbortar)
      resolver()
    }, ms)
    sinal.addEventListener('abort', aoAbortar, { once: true })
  })
}

/**
 * Coleta o resultado das 27 unidades federativas para um mesmo cargo.
 * A falha de uma unidade nao derruba as demais nem apaga o dado anterior
 * daquela unidade: o estado so recebe mesclagem do que voltou com sucesso.
 */
export function useMapaUF(eleicao: string, cargo: string): EstadoMapaUF {
  const alvo = `${eleicao}:${cargo}`
  const [acumulado, setAcumulado] = useState<AcumuladoUF>({ alvo, mapa: MAPA_VAZIO })
  const [erroDoAlvo, setErroDoAlvo] = useState<ErroDoAlvo>({ alvo, erro: null })

  useEffect(() => {
    const controlador = new AbortController()
    const sinal = controlador.signal
    let temporizador: number | undefined
    let tentativas = 0

    const registrar = (novos: Record<string, Apuracao>) => {
      setAcumulado((anterior) =>
        anterior.alvo === alvo
          ? { alvo, mapa: { ...anterior.mapa, ...novos } }
          : { alvo, mapa: novos },
      )
    }

    /** Percorre as unidades em lotes e devolve quantas falharam no ciclo. */
    const executarCiclo = async (): Promise<number> => {
      let falhas = 0

      for (let inicio = 0; inicio < UFS.length; inicio += TAMANHO_LOTE) {
        if (sinal.aborted) return falhas
        const lote = UFS.slice(inicio, inicio + TAMANHO_LOTE)

        const resultados = await Promise.all(
          lote.map(async (uf) => {
            try {
              return { uf, apuracao: await buscarResultado(eleicao, uf, cargo, sinal) }
            } catch {
              return { uf, apuracao: null }
            }
          }),
        )
        if (sinal.aborted) return falhas

        const novos: Record<string, Apuracao> = {}
        for (const resultado of resultados) {
          if (resultado.apuracao === null) falhas += 1
          else novos[resultado.uf] = resultado.apuracao
        }
        if (Object.keys(novos).length > 0) registrar(novos)

        if (inicio + TAMANHO_LOTE < UFS.length) {
          await espera(INTERVALO_ENTRE_LOTES_MS, sinal)
        }
      }

      return falhas
    }

    const agendar = (ms: number) => {
      temporizador = window.setTimeout(() => {
        void rodar()
      }, ms)
    }

    const rodar = async (): Promise<void> => {
      if (sinal.aborted) return
      const inicioCiclo = Date.now()
      const falhas = await executarCiclo()
      if (sinal.aborted) return

      // Ciclo inteiro perdido: recuo exponencial antes de tentar de novo.
      if (falhas === UFS.length) {
        tentativas += 1
        setErroDoAlvo({ alvo, erro: 'Nenhuma unidade federativa respondeu no ciclo atual' })
        agendar(atrasoDeRecuo(tentativas))
        return
      }

      tentativas = 0
      setErroDoAlvo({
        alvo,
        erro:
          falhas > 0
            ? `${falhas} de ${UFS.length} unidades federativas falharam no ciclo atual`
            : null,
      })

      const decorrido = Date.now() - inicioCiclo
      agendar(Math.max(INTERVALO_MINIMO_CICLO_MS, PERIODO_CICLO_MS - decorrido))
    }

    void rodar()

    return () => {
      controlador.abort()
      if (temporizador !== undefined) window.clearTimeout(temporizador)
    }
  }, [alvo, eleicao, cargo])

  const porUf = acumulado.alvo === alvo ? acumulado.mapa : MAPA_VAZIO
  const erro = erroDoAlvo.alvo === alvo ? erroDoAlvo.erro : null

  return useMemo(
    () => ({ porUf, carregadas: Object.keys(porUf).length, total: UFS.length, erro }),
    [porUf, erro],
  )
}

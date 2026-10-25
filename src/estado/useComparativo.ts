import { useCallback, useEffect, useRef, useState } from 'react'
import { atrasoDeRecuo, buscarResultado } from '../tse/cliente'
import type { Apuracao } from '../tse/tipos'
import { CARGO, ELEICAO, type Uf } from '../tse/urls'

/**
 * Intervalo de consulta do 2o turno. A borda da CDN do TSE guarda cada
 * arquivo por cerca de sessenta segundos, entao consultar mais rapido nao
 * deixa o dado mais novo; o ganho e ver a virada logo que a borda renova.
 */
const PERIODO_MS = 8_000
const RECUO_MAXIMO_MS = 60_000

export type Escopo = 'municipio' | 'uf' | 'brasil'

export interface EstadoComparativo {
  municipio: Apuracao | null
  uf: Apuracao | null
  brasil: Apuracao | null
  erro: string | null
  carregando: boolean
}

const VAZIO: EstadoComparativo = {
  municipio: null,
  uf: null,
  brasil: null,
  erro: null,
  carregando: true,
}

/**
 * Tres alvos do 2o turno: o municipio escolhido, a uf dele e o Brasil.
 *
 * O 1o turno nao entra aqui. Ele vem do arquivo estatico lido por
 * dados/primeiroTurno.ts, o que mantem a carga em tres requisicoes por ciclo.
 * Deduplica por idg, como useApuracao, para nao repintar sem mudanca.
 */
export function useComparativo(uf: Uf, municipio: string | null): EstadoComparativo {
  const [estado, definir] = useState<EstadoComparativo>(VAZIO)

  const idgs = useRef<Record<string, string>>({})
  const tentativas = useRef(0)

  const coletar = useCallback(
    async (sinal: AbortSignal) => {
      const pedidos: { escopo: Escopo; uf: Uf; municipio?: string }[] = [
        ...(municipio ? [{ escopo: 'municipio' as Escopo, uf, municipio }] : []),
        { escopo: 'uf' as Escopo, uf },
        { escopo: 'brasil' as Escopo, uf: 'br' as Uf },
      ]

      try {
        const lidos = await Promise.all(
          pedidos.map(async (pedido) => ({
            escopo: pedido.escopo,
            dados: await buscarResultado(
              ELEICAO.federal2,
              pedido.uf,
              CARGO.presidente,
              sinal,
              pedido.municipio,
            ),
          })),
        )
        if (sinal.aborted) return

        tentativas.current = 0
        definir((anterior) => {
          const proximo: EstadoComparativo = {
            ...anterior,
            erro: null,
            carregando: false,
          }
          for (const lido of lidos) {
            const repetido =
              idgs.current[lido.escopo] === lido.dados.idGeracao &&
              anterior[lido.escopo] !== null
            if (repetido) continue
            idgs.current[lido.escopo] = lido.dados.idGeracao
            proximo[lido.escopo] = lido.dados
          }
          return proximo
        })
      } catch (erro) {
        if (sinal.aborted) return
        tentativas.current += 1
        definir((anterior) => ({
          ...anterior,
          carregando: false,
          erro: erro instanceof Error ? erro.message : 'Falha ao consultar o TSE',
        }))
      }
    },
    [uf, municipio],
  )

  useEffect(() => {
    let cancelado = false
    let controlador = new AbortController()
    let temporizador = 0

    idgs.current = {}
    tentativas.current = 0
    definir(VAZIO)

    const ciclo = async () => {
      controlador.abort()
      controlador = new AbortController()
      await coletar(controlador.signal)
      if (cancelado) return
      const espera =
        tentativas.current > 0
          ? Math.min(RECUO_MAXIMO_MS, atrasoDeRecuo(tentativas.current))
          : PERIODO_MS
      temporizador = window.setTimeout(ciclo, espera)
    }

    void ciclo()

    return () => {
      cancelado = true
      controlador.abort()
      window.clearTimeout(temporizador)
    }
  }, [coletar])

  return estado
}

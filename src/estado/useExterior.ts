import { useEffect, useState } from 'react'
import { buscarResultado } from '../tse/cliente'
import type { Apuracao } from '../tse/tipos'
import { CARGO, ELEICAO, EXTERIOR } from '../tse/urls'

/**
 * Varredura dos postos de votacao no exterior.
 *
 * Sao 186 arquivos, um por posto, entao a leitura nao pode seguir o ritmo de
 * oito segundos do painel principal. A varredura anda em lotes pequenos, com
 * pausa entre eles, e recomeca a cada dois minutos. Mesma disciplina do mapa
 * das unidades federativas, que le 27 arquivos por ciclo.
 */
const PERIODO_CICLO_MS = 120_000
const TAMANHO_LOTE = 6
const INTERVALO_ENTRE_LOTES_MS = 1_200

export interface EstadoExterior {
  porPosto: Record<string, Apuracao>
  carregados: number
  total: number
}

export function useExterior(codigos: string[]): EstadoExterior {
  const [porPosto, setPorPosto] = useState<Record<string, Apuracao>>({})

  // O alvo viaja como texto: a lista chega nova a cada render, e comparar a
  // identidade do vetor reiniciaria a varredura sem necessidade.
  const alvo = codigos.join(',')

  useEffect(() => {
    const lista = alvo.length === 0 ? [] : alvo.split(',')
    if (lista.length === 0) return

    let cancelado = false
    const controlador = new AbortController()
    let temporizador = 0

    const varrer = async () => {
      const inicio = Date.now()
      for (let i = 0; i < lista.length; i += TAMANHO_LOTE) {
        if (cancelado) return
        const lote = lista.slice(i, i + TAMANHO_LOTE)
        const lidos = await Promise.all(
          lote.map(async (codigo) => {
            try {
              const dados = await buscarResultado(
                ELEICAO.federal2,
                EXTERIOR,
                CARGO.presidente,
                controlador.signal,
                codigo,
              )
              return { codigo, dados }
            } catch {
              // Posto que falhou mantem o valor anterior e volta no proximo ciclo.
              return null
            }
          }),
        )
        if (cancelado) return
        setPorPosto((anterior) => {
          const proximo = { ...anterior }
          for (const lido of lidos) {
            if (lido !== null) proximo[lido.codigo] = lido.dados
          }
          return proximo
        })
        await new Promise((pronto) => setTimeout(pronto, INTERVALO_ENTRE_LOTES_MS))
      }
      if (cancelado) return
      const espera = Math.max(5_000, PERIODO_CICLO_MS - (Date.now() - inicio))
      temporizador = window.setTimeout(varrer, espera)
    }

    void varrer()

    return () => {
      cancelado = true
      controlador.abort()
      window.clearTimeout(temporizador)
    }
  }, [alvo])

  return {
    porPosto,
    carregados: Object.keys(porPosto).length,
    total: alvo.length === 0 ? 0 : alvo.split(',').length,
  }
}

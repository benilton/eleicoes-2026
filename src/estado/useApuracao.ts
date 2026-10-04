import { useCallback, useEffect, useRef, useState } from 'react'
import { atrasoDeRecuo, buscarResultado } from '../tse/cliente'
import type { Apuracao } from '../tse/tipos'
import type { Uf } from '../tse/urls'

const PERIODO_MS = 60_000
const LIMITE_DEFASAGEM_MS = 180_000

export interface EstadoApuracao {
  dados: Apuracao | null
  carregando: boolean
  erro: string | null
  defasado: boolean
  ultimaColeta: number | null
}

/**
 * Agendador unico. Deduplica por idg para nao renderizar de novo quando o
 * TSE ainda nao gerou arquivo novo, o que evita animacao falsa de mudanca.
 */
export function useApuracao(eleicao: string, uf: Uf, cargo: string): EstadoApuracao {
  const [dados, setDados] = useState<Apuracao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ultimaColeta, setUltimaColeta] = useState<number | null>(null)
  const [defasado, setDefasado] = useState(false)

  const idgAnterior = useRef<string | null>(null)
  const tentativas = useRef(0)

  const coletar = useCallback(
    async (sinal: AbortSignal) => {
      try {
        const resultado = await buscarResultado(eleicao, uf, cargo, sinal)
        tentativas.current = 0
        setErro(null)
        setUltimaColeta(Date.now())
        if (resultado.idGeracao !== idgAnterior.current) {
          idgAnterior.current = resultado.idGeracao
          setDados(resultado)
        }
      } catch (e) {
        if (sinal.aborted) return
        tentativas.current += 1
        setErro(e instanceof Error ? e.message : 'Falha ao consultar o TSE')
      } finally {
        if (!sinal.aborted) setCarregando(false)
      }
    },
    [eleicao, uf, cargo],
  )

  useEffect(() => {
    let cancelado = false
    let controlador = new AbortController()
    let temporizador: number

    const ciclo = async () => {
      controlador.abort()
      controlador = new AbortController()
      await coletar(controlador.signal)
      if (cancelado) return
      const espera = tentativas.current > 0 ? atrasoDeRecuo(tentativas.current) : PERIODO_MS
      temporizador = window.setTimeout(ciclo, espera)
    }

    idgAnterior.current = null
    setCarregando(true)
    void ciclo()

    return () => {
      cancelado = true
      controlador.abort()
      window.clearTimeout(temporizador)
    }
  }, [coletar])

  useEffect(() => {
    const id = window.setInterval(() => {
      setDefasado(ultimaColeta !== null && Date.now() - ultimaColeta > LIMITE_DEFASAGEM_MS)
    }, 10_000)
    return () => window.clearInterval(id)
  }, [ultimaColeta])

  return { dados, carregando, erro, defasado, ultimaColeta }
}

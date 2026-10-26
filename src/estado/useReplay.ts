import { useEffect, useState } from 'react'
import { urlHistorico } from './useHistorico'

/**
 * Serie bruta do historico, para a reproducao da noite.
 *
 * O useHistorico emenda o que veio do repositorio com o que o navegador
 * acumulou e entrega so a serie nacional ponto a ponto, que e o que o grafico
 * de convergencia precisa. A reproducao precisa de mais: a projecao, a faixa,
 * a cobertura e o estado de cada unidade federativa em cada instante. Por
 * isso este modulo le o mesmo arquivo por conta propria, sem emendar nada. O
 * navegador serve a segunda leitura do proprio cache.
 */

export interface PontoReplay {
  /** Instante da coleta, em segundos desde a epoca. */
  t: number
  /** Percentual de secoes totalizadas no Brasil. */
  pst: number
  /** Percentual apurado por numero de candidatura. */
  pct: Record<string, number>
  /** Projecao por numero de candidatura. */
  proj: Record<string, number>
  /** Meia faixa da projecao, em pontos percentuais. */
  faixa: Record<string, number>
  /** Cobertura do volume de votos, em percentual. */
  cob: number
  /** Estado de cada unidade federativa naquele instante. */
  ufs: Record<string, { pst: number; pct: Record<string, number> }>
}

export interface CandidatoReplay {
  numero: string
  nomeUrna: string
  partido: string
}

export interface EstadoReplay {
  candidatos: CandidatoReplay[]
  pontos: PontoReplay[]
  carregando: boolean
  erro: string | null
}

const VAZIO: EstadoReplay = {
  candidatos: [],
  pontos: [],
  carregando: true,
  erro: null,
}

const numero = (valor: unknown): number =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : 0

const vetor = (valor: unknown): number[] => (Array.isArray(valor) ? valor.map(numero) : [])

const matriz = (valor: unknown): number[][] =>
  Array.isArray(valor) ? valor.map((linha) => vetor(linha)) : []

export function useReplay(eleicao: string, cargo: string): EstadoReplay {
  const [estado, definir] = useState<EstadoReplay>(VAZIO)

  useEffect(() => {
    let vivo = true
    const controlador = new AbortController()

    const ler = async () => {
      try {
        const resposta = await fetch(urlHistorico(eleicao, cargo), {
          signal: controlador.signal,
          cache: 'no-cache',
        })
        if (!resposta.ok) throw new Error(`histórico respondeu ${resposta.status}`)
        const bruto = (await resposta.json()) as Record<string, unknown>
        if (!vivo) return

        const listaCandidatos = Array.isArray(bruto.candidatos) ? bruto.candidatos : []
        const candidatos: CandidatoReplay[] = listaCandidatos.map((c) => {
          const item = (c ?? {}) as Record<string, unknown>
          return {
            numero: String(item.numero ?? ''),
            nomeUrna: String(item.nomeUrna ?? ''),
            partido: String(item.partido ?? ''),
          }
        })

        const br = (bruto.br ?? {}) as Record<string, unknown>
        const t = vetor(br.t)
        const pst = vetor(br.pst)
        const cob = vetor(br.cob)
        const pct = matriz(br.pct)
        const proj = matriz(br.proj)
        const faixa = matriz(br.faixa)

        const ufsBrutas = (bruto.ufs ?? {}) as Record<string, Record<string, unknown>>

        const pontos: PontoReplay[] = []
        for (let k = 0; k < t.length; k += 1) {
          const porNumero = (fonte: number[][]) => {
            const saida: Record<string, number> = {}
            candidatos.forEach((cand, ordem) => {
              saida[cand.numero] = fonte[ordem]?.[k] ?? 0
            })
            return saida
          }

          const ufs: Record<string, { pst: number; pct: Record<string, number> }> = {}
          for (const [sigla, serie] of Object.entries(ufsBrutas)) {
            const pstUf = vetor(serie?.pst)[k]
            if (pstUf === undefined) continue
            const pctUf: Record<string, number> = {}
            const matrizUf = matriz(serie?.pct)
            candidatos.forEach((cand, ordem) => {
              pctUf[cand.numero] = matrizUf[ordem]?.[k] ?? 0
            })
            ufs[sigla] = { pst: pstUf, pct: pctUf }
          }

          pontos.push({
            t: t[k],
            pst: pst[k] ?? 0,
            pct: porNumero(pct),
            proj: porNumero(proj),
            faixa: porNumero(faixa),
            cob: cob[k] ?? 0,
            ufs,
          })
        }

        definir({ candidatos, pontos, carregando: false, erro: null })
      } catch (erro) {
        if (!vivo || controlador.signal.aborted) return
        definir({
          candidatos: [],
          pontos: [],
          carregando: false,
          erro: erro instanceof Error ? erro.message : 'falha ao ler o histórico',
        })
      }
    }

    void ler()
    return () => {
      vivo = false
      controlador.abort()
    }
  }, [eleicao, cargo])

  return estado
}

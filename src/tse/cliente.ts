import type { Apuracao, TseArquivoUnificado } from './tipos'
import { normalizar } from './normaliza'
import { urlResultado, type Uf } from './urls'

/**
 * Teto rigido de uma requisicao por alvo a cada 30 segundos.
 * O TSE bloqueia o IP por dez minutos acima de cem requisicoes por segundo,
 * entao o limite fica no cliente, nao apenas no agendador.
 */
const INTERVALO_MINIMO_MS = 30_000
const ultimaChamada = new Map<string, number>()

export class ErroTse extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ErroTse'
    this.status = status
  }
}

export async function buscarResultado(
  eleicao: string,
  uf: Uf,
  cargo: string,
  sinal?: AbortSignal,
): Promise<Apuracao> {
  const chave = `${eleicao}:${uf}:${cargo}`
  const agora = Date.now()
  const anterior = ultimaChamada.get(chave) ?? 0
  if (agora - anterior < INTERVALO_MINIMO_MS) {
    throw new ErroTse(`Chamada a ${chave} bloqueada pelo limite local de taxa`)
  }
  ultimaChamada.set(chave, agora)

  const resposta = await fetch(urlResultado(eleicao, uf, cargo), {
    cache: 'no-store',
    signal: sinal,
  })
  if (!resposta.ok) {
    throw new ErroTse(`TSE respondeu ${resposta.status} para ${chave}`, resposta.status)
  }
  const bruto = (await resposta.json()) as TseArquivoUnificado
  return normalizar(bruto, cargo)
}

/** Recuo exponencial com teto de cinco minutos. */
export const atrasoDeRecuo = (tentativa: number): number =>
  Math.min(300_000, 2 ** tentativa * 1000)

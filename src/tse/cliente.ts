import type { Apuracao, TseArquivoUnificado } from './tipos'
import { normalizar } from './normaliza'
import { urlResultado, type Uf } from './urls'

/**
 * Teto rigido de uma requisicao por alvo a cada 30 segundos.
 * O TSE bloqueia o IP por dez minutos acima de cem requisicoes por segundo,
 * entao o limite fica no cliente, nao apenas no agendador.
 */
const INTERVALO_MINIMO_MS = 4_000
const ultimaChamada = new Map<string, number>()
/** Ultimo resultado por alvo, servido a quem chega dentro da janela. */
const ultimoResultado = new Map<string, Apuracao>()

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
  municipio?: string,
): Promise<Apuracao> {
  const chave = `${eleicao}:${uf}${municipio ?? ''}:${cargo}`

  // Dois consumidores podem pedir o mesmo alvo, caso do Brasil, que aparece
  // no painel nacional e no comparativo. Dentro da janela o segundo recebe o
  // resultado guardado em vez de um erro: o alvo e o mesmo, o dado tambem.
  const espera = INTERVALO_MINIMO_MS - (Date.now() - (ultimaChamada.get(chave) ?? 0))
  if (espera > 0) {
    const guardado = ultimoResultado.get(chave)
    if (guardado) return guardado
    await new Promise((pronto) => setTimeout(pronto, espera))
    const depois = ultimoResultado.get(chave)
    if (depois) return depois
  }
  ultimaChamada.set(chave, Date.now())

  const resposta = await fetch(urlResultado(eleicao, uf, cargo, municipio), {
    cache: 'no-cache',
    signal: sinal,
  })
  if (!resposta.ok) {
    throw new ErroTse(`TSE respondeu ${resposta.status} para ${chave}`, resposta.status)
  }
  const bruto = (await resposta.json()) as TseArquivoUnificado
  const normalizado = normalizar(bruto, cargo, uf)
  ultimoResultado.set(chave, normalizado)
  return normalizado
}

/** Recuo exponencial com teto de cinco minutos. */
export const atrasoDeRecuo = (tentativa: number): number =>
  Math.min(300_000, 2 ** tentativa * 1000)

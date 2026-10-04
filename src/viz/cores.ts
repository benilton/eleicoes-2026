import type { Candidatura } from '../tse/tipos'

/**
 * Convencao partidaria desta eleicao, escolhida pelo usuario. Nao e paleta
 * generica: amarra o painel ao pleito de 2026. Para outra eleicao, troque
 * apenas esta tabela.
 */
const CORES_FIXAS: Record<string, { variavel: string; hex: string }> = {
  '22': { variavel: 'var(--color-serie-1)', hex: '#3987e5' },
  '13': { variavel: 'var(--color-serie-2)', hex: '#e66767' },
  '70': { variavel: 'var(--color-serie-3)', hex: '#008300' },
}

/**
 * Ordem das legendas e das colunas. Precisa ser escrita a mao: Object.keys
 * devolveria '13' antes de '22', porque o JavaScript ordena as chaves que
 * parecem inteiro em ordem numerica crescente. Acrescentar uma linha a
 * CORES_FIXAS exige acrescentar o numero aqui tambem.
 */
const NUMEROS_FIXOS: string[] = ['22', '13', '70']

/**
 * Mapa estavel de cor por numero de candidatura.
 *
 * A cor segue a candidatura, nunca a colocacao. Os numeros de CORES_FIXAS tem
 * cor propria antes de qualquer apuracao. Os demais recebem o slot que sobrar,
 * fixado na primeira chamada de registrarOrdem com uma lista nao vazia: se
 * houver ultrapassagem durante a apuracao, as barras e as linhas mantem a
 * mesma tinta.
 *
 * Teto de tres cores de identidade, contando as fixas que aparecem no
 * resultado. Da quarta candidatura em diante a cor e a de contexto, que nao
 * individualiza.
 */

const SLOTS: string[] = [
  'var(--color-serie-1)',
  'var(--color-serie-2)',
  'var(--color-serie-3)',
]

export const COR_CONTEXTO = 'var(--color-contexto)'

/**
 * Os mesmos slots em hexadecimal, nos passos do modo escuro declarados em
 * index.css. Servem a quem precisa do valor literal, caso do mapa, que deriva
 * uma rampa sequencial misturando a cor base com branco e com preto. Os tres
 * valores sao os de CORES_FIXAS na mesma ordem: mexer em um exige mexer no
 * token correspondente de index.css.
 */
const SLOTS_HEX: string[] = ['#3987e5', '#e66767', '#008300']
const HEX_CONTEXTO = '#4a4a46'

const corPorNumero = new Map<string, string>()
const hexPorNumero = new Map<string, string>()
/** Numeros de CORES_FIXAS que apareceram no resultado, na ordem da tabela. */
const fixasPresentes: string[] = []
/** Numeros fora de CORES_FIXAS que ganharam um slot livre, na ordem da lista. */
const ordemReserva: string[] = []
let fixada = false

const ehFixa = (numero: string): boolean => Object.hasOwn(CORES_FIXAS, numero)

/**
 * Fixa a ordem de cor das candidaturas de reserva. Chamadas posteriores nao
 * tem efeito. As candidaturas de CORES_FIXAS nao disputam slot: elas apenas
 * consomem o proprio, e so quando estao na lista.
 */
export function registrarOrdem(candidaturas: Candidatura[]): void {
  if (fixada || candidaturas.length === 0) return

  const presentes = new Set<string>()
  for (const candidatura of candidaturas) {
    if (candidatura === undefined) continue
    presentes.add(candidatura.numero)
  }

  const slotsOcupados = new Set<string>()
  for (const numero of NUMEROS_FIXOS) {
    const fixa = CORES_FIXAS[numero]
    if (fixa === undefined || !presentes.has(numero)) continue
    slotsOcupados.add(fixa.variavel)
    fixasPresentes.push(numero)
  }

  const livres: number[] = []
  for (let i = 0; i < SLOTS.length; i += 1) {
    const slot = SLOTS[i]
    if (slot === undefined || slotsOcupados.has(slot)) continue
    livres.push(i)
  }

  let proximoLivre = 0
  for (const candidatura of candidaturas) {
    if (candidatura === undefined) continue
    const numero = candidatura.numero
    if (ehFixa(numero) || corPorNumero.has(numero)) continue
    const indice = livres[proximoLivre]
    const slot = indice === undefined ? undefined : SLOTS[indice]
    const slotHex = indice === undefined ? undefined : SLOTS_HEX[indice]
    if (slot !== undefined && slotHex !== undefined) {
      corPorNumero.set(numero, slot)
      hexPorNumero.set(numero, slotHex)
      ordemReserva.push(numero)
      proximoLivre += 1
    } else {
      corPorNumero.set(numero, COR_CONTEXTO)
      hexPorNumero.set(numero, HEX_CONTEXTO)
    }
  }

  fixada = true
}

/** Cor fixa da candidatura. Numero desconhecido recebe a cor de contexto. */
export function corDaCandidatura(numero: string): string {
  const fixa = CORES_FIXAS[numero]
  if (fixa !== undefined) return fixa.variavel
  return corPorNumero.get(numero) ?? COR_CONTEXTO
}

/** Cor fixa da candidatura em hexadecimal, para quem nao pode usar var(). */
export function hexDaCandidatura(numero: string): string {
  const fixa = CORES_FIXAS[numero]
  if (fixa !== undefined) return fixa.hex
  return hexPorNumero.get(numero) ?? HEX_CONTEXTO
}

/** Verdadeiro quando a candidatura tem cor propria: fixa ou slot de reserva. */
export function temIdentidade(numero: string): boolean {
  return ehFixa(numero) || ordemReserva.includes(numero)
}

/**
 * Numeros com cor de identidade: primeiro as fixas que apareceram no
 * resultado, na ordem de CORES_FIXAS, depois as de reserva. O mapa e a tabela
 * usam esta lista para ordenar colunas e legendas.
 */
export function numerosComIdentidade(): string[] {
  return [...fixasPresentes, ...ordemReserva]
}

/** Verdadeiro depois que a ordem foi fixada. */
export function ordemFixada(): boolean {
  return fixada
}

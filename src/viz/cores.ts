import type { Candidatura } from '../tse/tipos'

/**
 * Mapa estavel de cor por numero de candidatura.
 *
 * A cor segue a candidatura, nunca a colocacao. A ordem e fixada na primeira
 * chamada de registrarOrdem com uma lista nao vazia e nao muda mais: se houver
 * ultrapassagem durante a apuracao, as barras e as linhas mantem a mesma tinta.
 *
 * Teto de tres cores de identidade. Da quarta candidatura em diante a cor e a
 * de contexto, que nao individualiza.
 */

const SLOTS: string[] = [
  'var(--color-serie-1)',
  'var(--color-serie-2)',
  'var(--color-serie-3)',
]

export const COR_CONTEXTO = 'var(--color-contexto)'

const corPorNumero = new Map<string, string>()
const ordemIdentidade: string[] = []
let fixada = false

/** Fixa a ordem de cor. Chamadas posteriores nao tem efeito. */
export function registrarOrdem(candidaturas: Candidatura[]): void {
  if (fixada || candidaturas.length === 0) return
  for (let i = 0; i < candidaturas.length; i += 1) {
    const candidatura = candidaturas[i]
    if (corPorNumero.has(candidatura.numero)) continue
    if (i < SLOTS.length) {
      corPorNumero.set(candidatura.numero, SLOTS[i])
      ordemIdentidade.push(candidatura.numero)
    } else {
      corPorNumero.set(candidatura.numero, COR_CONTEXTO)
    }
  }
  fixada = true
}

/** Cor fixa da candidatura. Numero desconhecido recebe a cor de contexto. */
export function corDaCandidatura(numero: string): string {
  return corPorNumero.get(numero) ?? COR_CONTEXTO
}

/** Verdadeiro quando a candidatura ocupa um dos tres slots de identidade. */
export function temIdentidade(numero: string): boolean {
  return ordemIdentidade.includes(numero)
}

/** Numeros com cor de identidade, na ordem em que foram fixados. */
export function numerosComIdentidade(): string[] {
  return [...ordemIdentidade]
}

/** Verdadeiro depois que a ordem foi fixada. */
export function ordemFixada(): boolean {
  return fixada
}

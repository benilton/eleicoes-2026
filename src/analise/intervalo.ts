/**
 * Intervalo de confianca de 95% para a proporcao de votos, pela definicao
 * formal do intervalo de Wald:
 *
 *     pc +- z * raiz( pc * (1 - pc) / n )
 *
 * com z = 1,96 e n igual ao total de votos nominais apurados no instante, que
 * e o denominador de pc.
 *
 * RESSALVA DE METODO. A formula pressupoe amostra aleatoria de tamanho n. A
 * apuracao nao e amostra aleatoria: e enumeracao parcial em ordem que nao e
 * aleatoria, porque secoes e municipios pequenos totalizam antes dos grandes.
 * Logo o intervalo aqui calculado mede erro amostral, e erro amostral nao e a
 * fonte dominante de incerteza nesta leitura. A fonte dominante e o vies de
 * ordem de totalizacao, que este intervalo nao mede e nao corrige.
 *
 * ORDEM DE GRANDEZA MEDIDA. Com p = 0,5, que e o pior caso da variancia, a
 * meia-largura vale 0,057 ponto percentual com 3 milhoes de votos, 0,020 ponto
 * percentual com 25 milhoes e 0,014 ponto percentual com 48 milhoes. Ou seja,
 * na escala de um grafico de percentual de votos a faixa e imperceptivel, e
 * esse e o resultado correto, nao um defeito do desenho.
 *
 * SOBRE ALTERNATIVAS. Existem variantes com melhor cobertura perto de 0 e de 1,
 * entre elas o intervalo de Wilson e o de Agresti-Coull. Nenhuma delas e usada
 * aqui: o comportamento implementado e o de Wald, pedido explicitamente. Este
 * paragrafo registra a existencia das alternativas sem alterar o calculo.
 */

export interface IntervaloConfianca {
  /** Proporcao estimada, entre 0 e 1. */
  pc: number
  /** Meia-largura em PROPORCAO, nao em pontos percentuais. */
  meiaLargura: number
  /** Limite inferior, truncado em 0. */
  inferior: number
  /** Limite superior, truncado em 1. */
  superior: number
}

/** Valor padrao de z, correspondente a 95% sob a aproximacao normal. */
export const Z_95 = 1.96

/**
 * Intervalo de Wald para proporcao, 95%. Devolve nulo quando n nao e
 * utilizavel, isto e, quando nao e finito ou nao e positivo, e tambem quando a
 * contagem de votos nao e finita ou e negativa.
 */
export function intervaloWald(votos: number, n: number, z: number = Z_95): IntervaloConfianca | null {
  if (!Number.isFinite(n) || n <= 0) return null
  if (!Number.isFinite(votos) || votos < 0) return null

  // Votos acima de n nao e situacao esperada, mas chega a acontecer em leitura
  // intermediaria do TSE. O limite em 1 mantem a variancia bem definida.
  const pc = Math.min(1, Math.max(0, votos / n))
  const meiaLargura = z * Math.sqrt((pc * (1 - pc)) / n)

  // O truncamento em 0 e em 1 e consequencia conhecida do intervalo de Wald
  // perto dos extremos: sem ele o intervalo sairia do espaco da proporcao.
  // Perto de 0 ou de 1 a cobertura efetiva do intervalo de Wald fica abaixo dos
  // 95% nominais, e o truncamento nao corrige isso, apenas evita o absurdo.
  return {
    pc,
    meiaLargura,
    inferior: Math.max(0, pc - meiaLargura),
    superior: Math.min(1, pc + meiaLargura),
  }
}

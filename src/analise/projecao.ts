import type { Apuracao } from '../tse/tipos'
import type { SerieUf } from '../estado/useHistorico'

/**
 * Estimativa do resultado final por pos-estratificacao pelas unidades federativas.
 *
 * O vies dominante no inicio da noite e que algumas unidades federativas
 * totalizam mais rapido que outras, de modo que o percentual nacional corrente
 * reflete a composicao das unidades ja apuradas, nao a do eleitorado. A
 * pos-estratificacao corrige exatamente esse vies: cada unidade entra com o
 * peso do seu eleitorado que compareceu, e nao com o peso dos votos que ja
 * foram totalizados.
 *
 * LIMITACAO RESIDUAL: dentro de cada unidade federativa os municipios pequenos
 * totalizam antes dos grandes, e o metodo nao corrige esse vies, porque
 * corrigi-lo exigiria o resultado por municipio, que nao e lido aqui.
 *
 * SOBRE A FAIXA DEVOLVIDA POR `faixaRecente`: aquilo NAO E INTERVALO DE
 * CONFIANCA. E a variacao recente da propria estimativa, ou seja, o minimo e o
 * maximo que a estimativa pos-estratificada assumiu nos ultimos pontos do
 * historico. Nao tem interpretacao probabilistica e nao mede erro amostral.
 *
 * NOTA DE IMPLEMENTACAO: quando o comparecimento de uma unidade ainda e zero, o
 * peso dela cai para o eleitorado apto sozinho. Isso superestima o peso dessa
 * unidade enquanto a urna nao devolve comparecimento. A interface `Estimativa`
 * acordada nao tem campo para sinalizar o caso, entao ele fica registrado aqui.
 *
 * NOTA SOBRE A COBERTURA: o denominador de `coberturaEleitorado` deve ser o
 * eleitorado apto do pais inteiro, passado em `eleitoradoNacional`. O painel le
 * esse numero do arquivo nacional do TSE, que ja vem completo desde o comeco da
 * apuracao, de modo que a cobertura nao depende de quantas unidades federativas
 * o mapa ja carregou. Sem esse argumento o denominador recua para a soma do
 * eleitorado das unidades presentes no mapa, e entao a cobertura sai
 * superestimada enquanto o mapa tiver menos de 27 unidades, porque o eleitorado
 * das unidades ausentes e desconhecido.
 */

export interface Estimativa {
  porCandidato: Record<string, number>
  coberturaEleitorado: number
  ufsComDado: number
  confiavel: boolean
}

/** Cobertura minima do eleitorado para que a estimativa seja rotulada confiavel. */
const COBERTURA_CONFIAVEL = 0.9

/** Uma unidade federativa ja pronta para entrar na media ponderada. */
interface UnidadePonderada {
  peso: number
  eleitoresAptos: number
  porCandidato: Record<string, number>
}

const finito = (valor: number | undefined): number =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : 0

/**
 * Peso da unidade: eleitorado apto vezes a fracao que compareceu. Sem
 * comparecimento ainda publicado, o eleitorado apto responde sozinho.
 */
function pesoDaUnidade(eleitoresAptos: number, percentualComparecimento: number): number {
  const aptos = finito(eleitoresAptos)
  const comparecimento = finito(percentualComparecimento)
  if (aptos <= 0) return 0
  if (comparecimento <= 0) return aptos
  return aptos * (comparecimento / 100)
}

/** Media ponderada das unidades, renormalizada pelo peso total das que entraram. */
function combinar(
  unidades: UnidadePonderada[],
  eleitoradoTotal: number,
  numeros: string[],
): Estimativa | null {
  if (unidades.length === 0) return null

  let pesoTotal = 0
  let eleitoradoComDado = 0
  for (const unidade of unidades) {
    pesoTotal += unidade.peso
    eleitoradoComDado += unidade.eleitoresAptos
  }
  if (pesoTotal <= 0) return null

  const porCandidato: Record<string, number> = {}
  for (const numero of numeros) {
    let acumulado = 0
    for (const unidade of unidades) {
      acumulado += unidade.peso * finito(unidade.porCandidato[numero])
    }
    porCandidato[numero] = acumulado / pesoTotal
  }

  const coberturaEleitorado = eleitoradoTotal > 0 ? eleitoradoComDado / eleitoradoTotal : 0

  return {
    porCandidato,
    coberturaEleitorado,
    ufsComDado: unidades.length,
    confiavel: coberturaEleitorado >= COBERTURA_CONFIAVEL,
  }
}

/**
 * Estima o resultado final a partir da fotografia corrente de cada unidade
 * federativa. Devolve nulo quando nenhuma unidade tem secao totalizada ou
 * quando a soma dos pesos e zero.
 */
export function estimarPosEstratificado(
  porUf: Record<string, Apuracao>,
  eleitoradoNacional?: number,
): Estimativa | null {
  const unidades: UnidadePonderada[] = []
  const numeros = new Set<string>()
  let eleitoradoDoMapa = 0

  for (const apuracao of Object.values(porUf)) {
    if (apuracao === undefined) continue
    const aptos = finito(apuracao.eleitoresAptos)
    eleitoradoDoMapa += aptos

    // Unidade sem secao totalizada nao informa nada sobre o resultado dela.
    if (!(finito(apuracao.percentualSecoes) > 0)) continue

    const porCandidato: Record<string, number> = {}
    for (const candidatura of apuracao.candidaturas) {
      porCandidato[candidatura.numero] = finito(candidatura.percentual)
      numeros.add(candidatura.numero)
    }

    unidades.push({
      peso: pesoDaUnidade(aptos, apuracao.percentualComparecimento),
      eleitoresAptos: aptos,
      porCandidato,
    })
  }

  // O total nacional publicado pelo TSE tem precedencia; a soma do mapa e so o
  // recuo para quando ele nao for informado.
  const informado = finito(eleitoradoNacional)
  const eleitoradoTotal = informado > 0 ? informado : eleitoradoDoMapa

  return combinar(unidades, eleitoradoTotal, [...numeros])
}

/**
 * Recalcula a estimativa pos-estratificada em cada um dos ultimos `ultimos`
 * pontos do historico por unidade federativa e devolve o minimo e o maximo que
 * cada candidatura assumiu. Repetindo: isso nao e intervalo de confianca, e a
 * variacao recente da propria estimativa.
 */
export function faixaRecente(
  historicoUfs: Record<string, SerieUf>,
  eleitoradoPorUf: Record<string, number>,
  comparecimentoPorUf: Record<string, number>,
  ultimos: number,
): Record<string, { min: number; max: number }> {
  const faixa: Record<string, { min: number; max: number }> = {}
  if (!Number.isFinite(ultimos) || ultimos <= 0) return faixa

  const series = Object.values(historicoUfs)
  if (series.length === 0) return faixa

  // Uniao das candidaturas vistas em qualquer unidade, para que todas tenham
  // valor em todos os deslocamentos e o minimo e o maximo sejam comparaveis.
  const numeros = new Set<string>()
  let eleitoradoTotal = 0
  for (const serie of series) {
    eleitoradoTotal += finito(eleitoradoPorUf[serie.sigla])
    for (const numero of Object.keys(serie.porCandidato)) numeros.add(numero)
  }
  const listaDeNumeros = [...numeros]
  if (listaDeNumeros.length === 0) return faixa

  // Deslocamento zero e o ponto mais recente de cada serie.
  for (let recuo = 0; recuo < Math.floor(ultimos); recuo += 1) {
    const unidades: UnidadePonderada[] = []

    for (const serie of series) {
      const indice = serie.pst.length - 1 - recuo
      if (indice < 0) continue
      const pst = serie.pst[indice]
      if (pst === undefined || !(pst > 0)) continue

      const aptos = finito(eleitoradoPorUf[serie.sigla])
      const porCandidato: Record<string, number> = {}
      for (const numero of listaDeNumeros) {
        const valores = serie.porCandidato[numero]
        porCandidato[numero] = valores === undefined ? 0 : finito(valores[indice])
      }

      unidades.push({
        peso: pesoDaUnidade(aptos, finito(comparecimentoPorUf[serie.sigla])),
        eleitoresAptos: aptos,
        porCandidato,
      })
    }

    const estimativa = combinar(unidades, eleitoradoTotal, listaDeNumeros)
    if (estimativa === null) continue

    for (const numero of listaDeNumeros) {
      const valor = estimativa.porCandidato[numero]
      if (valor === undefined) continue
      const anterior = faixa[numero]
      if (anterior === undefined) faixa[numero] = { min: valor, max: valor }
      else {
        if (valor < anterior.min) anterior.min = valor
        if (valor > anterior.max) anterior.max = valor
      }
    }
  }

  return faixa
}

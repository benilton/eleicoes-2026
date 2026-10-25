import type { BaseEstatica } from '../dados/primeiroTurno'
import { resumoPrimeiroTurno } from '../dados/primeiroTurno'
import type { Apuracao } from '../tse/tipos'
import { UFS } from '../tse/urls'

/**
 * Projecao do resultado por variacao entre turnos, com pos-estratificacao.
 *
 * A grandeza estavel entre dois turnos nao e o nivel, e a variacao. Para o
 * estrato i, com p1 a proporcao do 1o turno e p2 a de agora, a quantidade
 * delta_i = p2_i - p1_i varia bem menos entre estratos do que o proprio p2_i.
 * O estimador usa o observado onde ja houve apuracao e imputa o que falta
 * pelo nivel do 1o turno daquele estrato somado a variacao comum:
 *
 *   p_chapeu = soma_i V_i [ f_i p2obs_i + (1 - f_i)(p1_i + delta_chapeu) ]
 *              / soma_i V_i
 *
 *   delta_chapeu = soma_i w_i delta_i / soma_i w_i,  com w_i = V_i f_i
 *
 * f_i e a fracao de secoes ja totalizadas no estrato e V_i o volume de votos
 * nominais do estrato no 1o turno, usado como peso. Um fator comum de
 * comparecimento entre turnos se cancela na razao, entao nao entra na conta.
 *
 * LIMITACAO: o estrato aqui e a unidade federativa. Enquanto f_i e pequeno, o
 * p2obs_i da unidade vem dos municipios que totalizam primeiro, que sao os
 * menores, de modo que delta_i ainda carrega vies de composicao interna. Por
 * isso unidades com f_i abaixo de COBERTURA_MINIMA ficam fora do calculo de
 * delta_chapeu, e as demais entram ponderadas por f_i. Trocar o estrato por
 * municipio elimina esse residuo, pois cada municipio nao apurado passa a ser
 * imputado pelo proprio nivel dele.
 *
 * A FAIXA NAO E INTERVALO DE CONFIANCA. Ela e a dispersao ponderada dos
 * delta_i observados, multiplicada pela fracao do eleitorado que falta
 * apurar. Mede heterogeneidade da variacao entre unidades, nao erro amostral,
 * e nao tem leitura probabilistica.
 */

export interface Projecao {
  /** Proporcao projetada, em percentual, por numero de candidatura. */
  porCandidato: Record<string, number>
  /** Variacao comum estimada, em pontos percentuais, por numero. */
  variacao: Record<string, number>
  /** Metade da faixa de heterogeneidade, em pontos percentuais, por numero. */
  faixa: Record<string, number>
  /** Fracao do volume de votos de 1o turno ja coberta pela apuracao. */
  cobertura: number
  /** Unidades que entraram no calculo da variacao comum. */
  unidadesNaVariacao: number
  confiavel: boolean
}

/** Fracao minima de secoes totalizadas para a unidade entrar na variacao. */
const COBERTURA_MINIMA = 0.05
/** Cobertura a partir da qual a projecao deixa de ser mera indicacao. */
const COBERTURA_CONFIAVEL = 0.2

const finito = (valor: number | undefined): number =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : 0

interface Unidade {
  uf: string
  peso: number
  fracao: number
  p1: Record<string, number>
  p2: Record<string, number>
}

export function projetarPorVariacao(
  porUf: Record<string, Apuracao>,
  base: BaseEstatica,
  numeros: string[],
): Projecao | null {
  if (numeros.length === 0 || base.primeiroTurno === null) return null

  const unidades: Unidade[] = []

  for (const uf of UFS) {
    const resumo = resumoPrimeiroTurno(base, uf)
    if (resumo === null || resumo.votosNominais <= 0) continue

    const p1: Record<string, number> = {}
    for (const numero of numeros) {
      p1[numero] = finito(resumo.porNumero[numero]) / resumo.votosNominais
    }

    const apuracao = porUf[uf]
    const totais = finito(apuracao?.secoesTotais)
    const fracao =
      apuracao === undefined || totais <= 0
        ? 0
        : Math.max(0, Math.min(1, finito(apuracao.secoesTotalizadas) / totais))

    const p2: Record<string, number> = {}
    for (const numero of numeros) {
      const candidatura = apuracao?.candidaturas.find((c) => c.numero === numero)
      p2[numero] = finito(candidatura?.percentual) / 100
    }

    unidades.push({ uf, peso: resumo.votosNominais, fracao, p1, p2 })
  }

  if (unidades.length === 0) return null

  // Variacao comum, ponderada por volume e por quanto a unidade ja apurou.
  const variacao: Record<string, number> = {}
  const faixa: Record<string, number> = {}
  const usadas = unidades.filter((u) => u.fracao >= COBERTURA_MINIMA)

  for (const numero of numeros) {
    let soma = 0
    let pesos = 0
    for (const u of usadas) {
      const w = u.peso * u.fracao
      soma += w * (u.p2[numero] - u.p1[numero])
      pesos += w
    }
    const delta = pesos > 0 ? soma / pesos : 0
    variacao[numero] = delta

    let variancia = 0
    for (const u of usadas) {
      const w = u.peso * u.fracao
      const desvio = u.p2[numero] - u.p1[numero] - delta
      variancia += w * desvio * desvio
    }
    faixa[numero] = pesos > 0 ? Math.sqrt(variancia / pesos) : 0
  }

  // Projecao por unidade e agregacao ponderada pelo volume do 1o turno.
  const porCandidato: Record<string, number> = {}
  let pesoTotal = 0
  let pesoApurado = 0
  for (const u of unidades) {
    pesoTotal += u.peso
    pesoApurado += u.peso * u.fracao
  }
  if (pesoTotal <= 0) return null

  for (const numero of numeros) {
    let acumulado = 0
    for (const u of unidades) {
      const imputado = Math.max(0, Math.min(1, u.p1[numero] + variacao[numero]))
      acumulado += u.peso * (u.fracao * u.p2[numero] + (1 - u.fracao) * imputado)
    }
    porCandidato[numero] = acumulado / pesoTotal
  }

  // Renormaliza para que as candidaturas informadas somem cem. No 2o turno
  // sao duas, e a soma das proporcoes sobre votos nominais vale um.
  const somaProjetada = numeros.reduce((s, n) => s + porCandidato[n], 0)
  const cobertura = pesoApurado / pesoTotal

  const saida: Record<string, number> = {}
  const faixaPp: Record<string, number> = {}
  for (const numero of numeros) {
    saida[numero] = somaProjetada > 0 ? (porCandidato[numero] / somaProjetada) * 100 : 0
    // A faixa encolhe com o que ja foi apurado: so a parte imputada carrega
    // a incerteza da variacao comum.
    faixaPp[numero] = faixa[numero] * (1 - cobertura) * 100
  }

  return {
    porCandidato: saida,
    variacao: Object.fromEntries(numeros.map((n) => [n, variacao[n] * 100])),
    faixa: faixaPp,
    cobertura,
    unidadesNaVariacao: usadas.length,
    confiavel: cobertura >= COBERTURA_CONFIAVEL && usadas.length >= 5,
  }
}

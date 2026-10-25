import { useEffect, useState } from 'react'

/**
 * Resultado final do 1o turno, congelado em public/primeiro-turno.json.
 *
 * O 1o turno terminou em 04/10/2026 e nao muda mais, entao nao ha motivo
 * para consultar o TSE ao vivo durante o 2o turno. O arquivo foi gerado por
 * scripts/baixar-1turno.mjs com o Brasil, as 27 unidades federativas e os
 * 5.570 municipios, e serve de linha de base do comparativo.
 */

/** [vnom, v22, v13, voutros, ts, te, comparecimento, abstencao, brancos, nulos] */
export type Vetor = [
  number, number, number, number, number,
  number, number, number, number, number,
]

export interface ArquivoPrimeiroTurno {
  eleicao: string
  cargo: string
  finalistas: string[]
  br: Vetor | null
  uf: Record<string, Vetor>
  mun: Record<string, Record<string, Vetor>>
}

export interface ResumoTurno {
  votosNominais: number
  porNumero: Record<string, number>
  outros: number
  secoesTotais: number
  eleitoresAptos: number
  comparecimento: number
  abstencao: number
  votosBrancos: number
  votosNulos: number
}

export type Municipio = readonly [codigo: string, nome: string]
export type MapaMunicipios = Record<string, Municipio[]>

/** Lista vazia estavel, para nao gerar identidade nova a cada render. */
export const SEM_MUNICIPIOS: Municipio[] = []

/**
 * Pais de cada posto do exterior, pelo codigo TSE.
 *
 * A configuracao do TSE lista os postos so por nome de cidade. Este arquivo
 * vem da lista de locais de votacao no exterior publicada pelo proprio TSE,
 * casada pelo nome. O campo fonte registra a procedencia de cada linha:
 * 'lista-tse' casou direto, 'lista-tse-grafia' casou por variante de grafia,
 * 'a-confirmar' foi preenchido fora da lista e aguarda conferencia humana.
 */
export interface PaisesExterior {
  pais: Record<string, string>
  fonte: Record<string, string>
}

export interface BaseEstatica {
  primeiroTurno: ArquivoPrimeiroTurno | null
  municipios: MapaMunicipios
  paisesExterior: PaisesExterior
}

const VAZIA: BaseEstatica = {
  primeiroTurno: null,
  municipios: {},
  paisesExterior: { pais: {}, fonte: {} },
}

let cache: BaseEstatica | null = null
let promessa: Promise<BaseEstatica> | null = null

async function lerJson<T>(nome: string): Promise<T> {
  const resposta = await fetch(`${import.meta.env.BASE_URL}${nome}`)
  if (!resposta.ok) throw new Error(`${nome} respondeu ${resposta.status}`)
  return (await resposta.json()) as T
}

export function carregarBase(): Promise<BaseEstatica> {
  if (cache) return Promise.resolve(cache)
  if (!promessa) {
    promessa = Promise.all([
      lerJson<ArquivoPrimeiroTurno>('primeiro-turno.json'),
      lerJson<MapaMunicipios>('municipios.json'),
      // O agrupamento por pais e acessorio: se faltar, a tabela do exterior
      // segue funcionando sem o seletor.
      lerJson<PaisesExterior>('paises-exterior.json').catch(() => ({
        pais: {},
        fonte: {},
      })),
    ])
      .then(([primeiroTurno, municipios, paisesExterior]) => {
        cache = { primeiroTurno, municipios, paisesExterior }
        return cache
      })
      .catch(() => VAZIA)
  }
  return promessa
}

export function useBaseEstatica(): BaseEstatica {
  const [base, definir] = useState<BaseEstatica>(cache ?? VAZIA)

  useEffect(() => {
    let vivo = true
    void carregarBase().then((lida) => {
      if (vivo) definir(lida)
    })
    return () => {
      vivo = false
    }
  }, [])

  return base
}

function converter(vetor: Vetor | null | undefined, finalistas: string[]): ResumoTurno | null {
  if (!vetor) return null
  const porNumero: Record<string, number> = {}
  porNumero[finalistas[0] ?? '22'] = vetor[1]
  porNumero[finalistas[1] ?? '13'] = vetor[2]
  return {
    votosNominais: vetor[0],
    porNumero,
    outros: vetor[3],
    secoesTotais: vetor[4],
    eleitoresAptos: vetor[5],
    comparecimento: vetor[6],
    abstencao: vetor[7],
    votosBrancos: vetor[8],
    votosNulos: vetor[9],
  }
}

/** Abrangencia: 'br', a sigla de uma uf, ou sigla mais codigo do municipio. */
export function resumoPrimeiroTurno(
  base: BaseEstatica,
  uf: string,
  municipio?: string | null,
): ResumoTurno | null {
  const arquivo = base.primeiroTurno
  if (!arquivo) return null
  const finalistas = arquivo.finalistas ?? ['22', '13']
  if (uf === 'br') return converter(arquivo.br, finalistas)
  if (municipio) return converter(arquivo.mun[uf]?.[municipio], finalistas)
  return converter(arquivo.uf[uf], finalistas)
}

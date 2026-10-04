export const BASE_TSE = 'https://resultados.tse.jus.br/oficial'
export const CICLO = 'ele2026'

// Codigos confirmados no arquivo de configuracao do TSE em 04/10/2026.
export const ELEICAO = {
  federal1: '6257',
  federal2: '6258',
  estadual1: '6259',
  estadual2: '6260',
} as const

export const CARGO = {
  presidente: '1',
  governador: '3',
  senador: '5',
} as const

export const UFS = [
  'ac','al','am','ap','ba','ce','df','es','go','ma','mg','ms','mt','pa',
  'pb','pe','pi','pr','rj','rn','ro','rr','rs','sc','se','sp','to',
] as const

export type Uf = (typeof UFS)[number] | 'br'

const pad = (valor: string, tamanho: number) => valor.padStart(tamanho, '0')

/** Monta a URL do arquivo de resultado unificado, com quebra de cache. */
export function urlResultado(eleicao: string, uf: Uf, cargo: string): string {
  const arquivo = `${uf}-c${pad(cargo, 4)}-e${pad(eleicao, 6)}-u.json`
  return `${BASE_TSE}/${CICLO}/${eleicao}/dados/${uf}/${arquivo}?nocache=${Date.now()}`
}

export function urlFoto(eleicao: string, uf: Uf, sqcand: string): string {
  return `${BASE_TSE}/${CICLO}/${eleicao}/fotos/${uf}/${sqcand}.jpeg`
}

export const urlConfiguracao = () =>
  `${BASE_TSE}/comum/config/ele-c.json?nocache=${Date.now()}`

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

/** Codigo do exterior na divulgacao do TSE. Os postos vem como municipios. */
export const EXTERIOR = 'zz'

export type Uf = (typeof UFS)[number] | 'br' | 'zz'

/**
 * Abrangencias que o seletor oferece. O exterior entra aqui, nao em UFS,
 * porque UFS alimenta a varredura do mapa, e o exterior nao tem geometria.
 */
export const ABRANGENCIAS: Uf[] = [...UFS]

export const rotuloAbrangencia = (uf: Uf): string =>
  uf === EXTERIOR ? 'Exterior' : uf.toUpperCase()

const pad = (valor: string, tamanho: number) => valor.padStart(tamanho, '0')

/**
 * Monta a URL do arquivo de resultado unificado.
 *
 * O parametro municipio e o codigo TSE de cinco digitos. Quando presente, a
 * abrangencia do nome do arquivo passa a ser a sigla seguida do codigo; o
 * diretorio continua sendo o da unidade federativa.
 *
 * Nao ha mais quebra de cache por query. Medicao em 25/10/2026: tres pedidos
 * com valores diferentes de nocache devolveram max-age de 50, 12 e 52, logo a
 * chave de cache da borda ignora a query. O parametro so impedia a
 * revalidacao condicional, sem ganhar frescor.
 */
export function urlResultado(
  eleicao: string,
  uf: Uf,
  cargo: string,
  municipio?: string,
): string {
  const abrangencia = municipio ? `${uf}${municipio}` : uf
  const arquivo = `${abrangencia}-c${pad(cargo, 4)}-e${pad(eleicao, 6)}-u.json`
  return `${BASE_TSE}/${CICLO}/${eleicao}/dados/${uf}/${arquivo}`
}

export function urlFoto(eleicao: string, uf: Uf, sqcand: string): string {
  return `${BASE_TSE}/${CICLO}/${eleicao}/fotos/${uf}/${sqcand}.jpeg`
}

export const urlConfiguracao = () =>
  `${BASE_TSE}/comum/config/ele-c.json?nocache=${Date.now()}`

// Contratos dos arquivos de divulgacao do TSE.
// Verificados por inspecao direta das respostas em 04/10/2026.
// Todos os campos numericos chegam como texto. Os percentuais usam virgula decimal.

export interface TseCandidato {
  seq: string
  sqcand: string
  n: string
  nm: string
  nmu: string
  vap: string
  pvap: string
  pvapn: string
  e: string
  st: string
  dvt?: string
  dt?: string
  vs?: { nm: string; nmu: string; sgp: string; sqcand: string; tp: string }[]
}

export interface TsePartido {
  n: string
  sg: string
  nm: string
  nfed?: string
  tvtn?: string
  tvan?: string
  cand: TseCandidato[]
}

export interface TseAgremiacao {
  n: string
  nm: string
  tp: string
  com: string
  par: TsePartido[]
}

export interface TseCargo {
  cd: string
  nmn: string
  nmm: string
  nmf: string
  nv: string
  fed?: unknown[]
  agr: TseAgremiacao[]
}

export interface TseSecoes {
  ts: string
  st: string
  pst: string
  pstn: string
  snt: string
  psnt: string
  sa: string
  si: string
}

export interface TseEleitorado {
  te: string
  c: string
  pc: string
  a: string
  pa: string
}

export interface TseVotacao {
  tv: string
  vv: string
  vb: string
  pvb: string
  vn: string
  pvn: string
  vnom: string
}

export interface TseArquivoUnificado {
  ele: string
  t: string
  tpabr: string
  cdabr: string
  dg: string
  hg: string
  idg: string
  carg: TseCargo[]
  s: TseSecoes
  e: TseEleitorado
  v: TseVotacao
}

// Forma normalizada, usada por toda a camada de apresentacao.
export interface Candidatura {
  numero: string
  nomeUrna: string
  nomeCompleto: string
  partido: string
  sqcand: string
  votos: number
  percentual: number
  eleito: boolean
  fotoUrl: string
}

export interface Apuracao {
  eleicao: string
  turno: string
  abrangencia: string
  uf: string
  cargo: string
  geradoEm: string
  idGeracao: string
  secoesTotalizadas: number
  secoesTotais: number
  percentualSecoes: number
  eleitoresAptos: number
  comparecimento: number
  percentualComparecimento: number
  abstencao: number
  percentualAbstencao: number
  votosValidos: number
  votosBrancos: number
  votosNulos: number
  /** Total de votos nominais apurados: campo v.vnom, denominador de pvap. */
  votosNominais: number
  candidaturas: Candidatura[]
}

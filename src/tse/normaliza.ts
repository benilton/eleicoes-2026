import type { Apuracao, Candidatura, TseArquivoUnificado } from './tipos'
import { urlFoto, type Uf } from './urls'

/** Converte texto do TSE para numero. Percentuais vem com virgula decimal. */
export const paraNumero = (valor: string | undefined): number => {
  if (!valor) return 0
  const limpo = valor.replace(/\./g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? n : 0
}

/**
 * Achata as tres camadas de aninhamento do arquivo do TSE.
 * A hierarquia e carg[] -> agr[] -> par[] -> cand[].
 */
export function normalizar(bruto: TseArquivoUnificado, cargo: string): Apuracao {
  const dadosCargo = bruto.carg.find((c) => c.cd === cargo) ?? bruto.carg[0]
  const uf = bruto.cdabr as Uf

  const candidaturas: Candidatura[] = (dadosCargo?.agr ?? [])
    .flatMap((agremiacao) =>
      agremiacao.par.flatMap((partido) =>
        (partido.cand ?? []).map((cand) => ({
          numero: cand.n,
          nomeUrna: cand.nmu,
          nomeCompleto: cand.nm,
          partido: partido.sg,
          sqcand: cand.sqcand,
          votos: paraNumero(cand.vap),
          percentual: paraNumero(cand.pvapn || cand.pvap),
          eleito: cand.e === 's',
          fotoUrl: urlFoto(bruto.ele, uf, cand.sqcand),
        })),
      ),
    )
    .sort((a, b) => b.votos - a.votos)

  return {
    eleicao: bruto.ele,
    turno: bruto.t,
    abrangencia: bruto.tpabr,
    uf,
    cargo: dadosCargo?.nmn ?? '',
    geradoEm: `${bruto.dg} ${bruto.hg}`,
    idGeracao: bruto.idg,
    secoesTotalizadas: paraNumero(bruto.s?.st),
    secoesTotais: paraNumero(bruto.s?.ts),
    percentualSecoes: paraNumero(bruto.s?.pstn || bruto.s?.pst),
    eleitoresAptos: paraNumero(bruto.e?.te),
    comparecimento: paraNumero(bruto.e?.c),
    percentualComparecimento: paraNumero(bruto.e?.pc),
    abstencao: paraNumero(bruto.e?.a),
    percentualAbstencao: paraNumero(bruto.e?.pa),
    votosValidos: paraNumero(bruto.v?.vv),
    votosBrancos: paraNumero(bruto.v?.vb),
    votosNulos: paraNumero(bruto.v?.vn),
    candidaturas,
  }
}

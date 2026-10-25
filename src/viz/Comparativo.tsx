import type { ResumoTurno } from '../dados/primeiroTurno'
import type { Apuracao } from '../tse/tipos'
import { corDaCandidatura, ordenarParaExibir, registrarOrdem } from './cores'

export interface ComparativoProps {
  titulo: string
  subtitulo?: string
  primeiro: ResumoTurno | null
  segundo: Apuracao | null
}

const inteiro = new Intl.NumberFormat('pt-BR')
const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const comSinal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

const parte = (valor: number, total: number) => (total > 0 ? (valor / total) * 100 : 0)

function Linha({
  rotulo,
  antes,
  agora,
  percentual = false,
}: {
  rotulo: string
  antes: number | null
  agora: number | null
  percentual?: boolean
}) {
  const formatar = (valor: number | null) => {
    if (valor === null) return '—'
    return percentual ? `${doisDecimais.format(valor)}%` : inteiro.format(valor)
  }
  return (
    <tr className="border-t border-white/10">
      <td className="py-1 text-left text-[var(--color-tinta-3)]">{rotulo}</td>
      <td className="py-1 text-right">{formatar(antes)}</td>
      <td className="py-1 text-right">{formatar(agora)}</td>
    </tr>
  )
}

/**
 * Resultado corrente do 2o turno ao lado do resultado final do 1o turno,
 * para uma abrangencia.
 *
 * A diferenca aparece em pontos percentuais sobre a mesma base nos dois
 * turnos, que e o voto nominal apurado. A linha "demais candidaturas" mostra
 * quanto voto ficou disponivel depois da eliminacao no 1o turno.
 */
export function Comparativo({ titulo, subtitulo, primeiro, segundo }: ComparativoProps) {
  if (!segundo) {
    return (
      <section aria-label={titulo} className="rounded-xl border border-white/10 p-4">
        <h3 className="mb-2 text-sm font-medium text-[var(--color-tinta)]">{titulo}</h3>
        <p className="text-sm text-[var(--color-tinta-3)]">Consultando o TSE…</p>
      </section>
    )
  }

  registrarOrdem(segundo.candidaturas)
  const ordenadas = ordenarParaExibir(segundo.candidaturas)
  const iniciou = segundo.secoesTotalizadas > 0

  return (
    <section aria-label={titulo} className="rounded-xl border border-white/10 p-4">
      <div className="mb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-[var(--color-tinta)]">{titulo}</h3>
          <p className="tabular text-xs text-[var(--color-tinta-3)]">
            {doisDecimais.format(segundo.percentualSecoes)}% das seções
          </p>
        </div>
        <p className="tabular mt-0.5 text-xs text-[var(--color-tinta-3)]">
          {subtitulo ? `${subtitulo} · ` : ''}
          {inteiro.format(segundo.secoesTotalizadas)} de{' '}
          {inteiro.format(segundo.secoesTotais)} seções
        </p>
      </div>

      <ol className="space-y-3">
        {ordenadas.map((candidatura) => {
          const votosAntes = primeiro?.porNumero[candidatura.numero] ?? null
          const pctAntes =
            votosAntes !== null && primeiro
              ? parte(votosAntes, primeiro.votosNominais)
              : null
          const diferenca = pctAntes !== null ? candidatura.percentual - pctAntes : null
          const largura = Math.max(0, Math.min(100, candidatura.percentual))
          return (
            <li key={candidatura.numero}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm">
                  <span className="tabular mr-1.5 text-[var(--color-tinta-3)]">
                    {candidatura.numero}
                  </span>
                  {candidatura.nomeUrna}
                </span>
                <span className="tabular text-lg font-semibold">
                  {doisDecimais.format(candidatura.percentual)}%
                </span>
              </div>
              <div className="my-1 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${largura}%`,
                    background: corDaCandidatura(candidatura.numero),
                  }}
                />
              </div>
              <div className="tabular flex flex-wrap justify-between gap-2 text-xs text-[var(--color-tinta-3)]">
                <span>{inteiro.format(candidatura.votos)} votos</span>
                <span>
                  1º turno{' '}
                  {pctAntes !== null
                    ? `${doisDecimais.format(pctAntes)}%`
                    : 'sem registro'}
                  {diferenca !== null && iniciou && (
                    <span className="ml-1.5 text-[var(--color-tinta-2)]">
                      {comSinal.format(diferenca)} p.p.
                    </span>
                  )}
                </span>
              </div>
            </li>
          )
        })}
      </ol>

      <table className="tabular mt-4 w-full border-collapse text-xs">
        <thead>
          <tr className="text-[var(--color-tinta-3)]">
            <th className="py-1 text-left font-normal"> </th>
            <th className="py-1 text-right font-normal">1º turno</th>
            <th className="py-1 text-right font-normal">2º turno</th>
          </tr>
        </thead>
        <tbody>
          <Linha
            rotulo="Eliminados no 1º turno"
            antes={primeiro ? parte(primeiro.outros, primeiro.votosNominais) : null}
            agora={null}
            percentual
          />
          <Linha
            rotulo="Comparecimento"
            antes={
              primeiro ? parte(primeiro.comparecimento, primeiro.eleitoresAptos) : null
            }
            agora={segundo.percentualComparecimento}
            percentual
          />
          <Linha
            rotulo="Abstenção"
            antes={primeiro ? parte(primeiro.abstencao, primeiro.eleitoresAptos) : null}
            agora={segundo.percentualAbstencao}
            percentual
          />
          <Linha
            rotulo="Brancos"
            antes={
              primeiro ? parte(primeiro.votosBrancos, primeiro.comparecimento) : null
            }
            agora={parte(segundo.votosBrancos, segundo.comparecimento)}
            percentual
          />
          <Linha
            rotulo="Nulos"
            antes={primeiro ? parte(primeiro.votosNulos, primeiro.comparecimento) : null}
            agora={parte(segundo.votosNulos, segundo.comparecimento)}
            percentual
          />
          <Linha
            rotulo="Votos válidos"
            antes={primeiro ? primeiro.votosNominais : null}
            agora={segundo.votosValidos}
          />
        </tbody>
      </table>
    </section>
  )
}

export default Comparativo

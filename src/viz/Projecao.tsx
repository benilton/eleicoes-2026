import type { Projecao as DadosProjecao } from '../analise/swing'
import { corDaCandidatura, ordenarParaExibir } from './cores'
import type { Candidatura } from '../tse/tipos'

export interface ProjecaoProps {
  projecao: DadosProjecao | null
  /** Candidaturas do arquivo nacional, para nome e para o valor corrente. */
  candidaturas: Candidatura[]
}

const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const comSinal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

/**
 * Projecao por variacao entre turnos.
 *
 * Mostra, lado a lado, o percentual corrente do arquivo nacional e o
 * percentual projetado. A diferenca entre os dois e o tamanho da correcao de
 * composicao: cedo na noite ela e grande, e encolhe conforme a apuracao
 * avanca, ate os dois numeros se encontrarem no fim.
 */
export default function Projecao({ projecao, candidaturas }: ProjecaoProps) {
  if (projecao === null) {
    return null
  }

  const numeros = Object.keys(projecao.porCandidato)
  const comNome = ordenarParaExibir(
    numeros.map((numero) => {
      const candidatura = candidaturas.find((c) => c.numero === numero)
      return {
        numero,
        votos: candidatura?.votos ?? 0,
        nomeUrna: candidatura?.nomeUrna ?? numero,
        atual: candidatura?.percentual ?? 0,
      }
    }),
  )

  const cobertura = projecao.cobertura * 100

  return (
    <section
      aria-label="Projeção do resultado por variação entre turnos"
      className="rounded-xl border border-white/10 p-5"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-[var(--color-tinta-3)]">
          Projeção por variação entre turnos
        </h2>
        <p className="tabular text-xs text-[var(--color-tinta-3)]">
          {doisDecimais.format(cobertura)}% do volume de votos coberto ·{' '}
          {projecao.unidadesNaVariacao} de 27 unidades na variação
        </p>
      </div>

      {!projecao.confiavel && (
        <p className="mb-4 text-xs text-[var(--color-alerta)]">
          Cobertura ainda baixa. Nesta fase a projeção é indicação de direção,
          não estimativa do resultado.
        </p>
      )}

      <ol className="space-y-4">
        {comNome.map((c) => {
          const projetado = projecao.porCandidato[c.numero]
          const meia = projecao.faixa[c.numero]
          return (
            <li key={c.numero}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm">
                  <span className="tabular mr-1.5 text-[var(--color-tinta-3)]">
                    {c.numero}
                  </span>
                  {c.nomeUrna}
                </span>
                <span
                  className="tabular text-2xl font-semibold"
                  style={{ color: corDaCandidatura(c.numero) }}
                >
                  {doisDecimais.format(projetado)}%
                </span>
              </div>
              <div className="tabular mt-1 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-[var(--color-tinta-3)]">
                <span>
                  apurado agora {doisDecimais.format(c.atual)}% · variação sobre o
                  1º turno{' '}
                  <b className="font-semibold text-[var(--color-tinta-2)]">
                    {comSinal.format(projecao.variacao[c.numero])}
                  </b>{' '}
                  p.p.
                </span>
                <span>
                  faixa {doisDecimais.format(Math.max(0, projetado - meia))}% a{' '}
                  {doisDecimais.format(Math.min(100, projetado + meia))}%
                </span>
              </div>
            </li>
          )
        })}
      </ol>

      <p className="mt-4 text-xs text-[var(--color-tinta-3)]">
        Cada unidade federativa entra com o peso do seu volume de votos no 1º
        turno. Onde já houve apuração vale o resultado observado; o que falta é
        imputado pelo nível daquela unidade no 1º turno somado à variação comum.
        A faixa é a dispersão da variação entre unidades, reduzida pelo que já
        foi apurado. Ela mede heterogeneidade, não erro amostral, e não é
        intervalo de confiança nem probabilidade de vitória.
      </p>
    </section>
  )
}

import type { Apuracao } from '../tse/tipos'

export interface FaixaEstadoProps {
  apuracao: Apuracao
  defasado: boolean
}

const inteiro = new Intl.NumberFormat('pt-BR')
const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Figura heroica da apuracao: o percentual de secoes totalizadas.
 *
 * O numero grande usa algarismos proporcionais, nao tabulares: largura igual de
 * digito afrouxa o desenho em corpo de display. Os indicadores do rodape, que
 * se alinham em coluna, ficam com a classe tabular.
 */
export function FaixaEstado({ apuracao, defasado }: FaixaEstadoProps) {
  const percentual = Math.max(0, Math.min(100, apuracao.percentualSecoes))
  const rotuloPercentual = `${doisDecimais.format(apuracao.percentualSecoes)}% das seções totalizadas`

  return (
    <section
      className="rounded-xl border border-white/10 bg-[var(--color-superficie)] p-6"
      aria-label="Estado da apuração"
    >
      <p className="text-sm text-[var(--color-tinta-3)]">Seções totalizadas</p>

      <p className="mt-1 text-5xl font-semibold leading-none">
        {doisDecimais.format(apuracao.percentualSecoes)}
        <span className="text-2xl text-[var(--color-tinta-2)]">%</span>
      </p>

      <div
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--color-grade)]"
        role="progressbar"
        aria-label="Progresso da totalização de seções"
        aria-valuenow={Number(percentual.toFixed(2))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={rotuloPercentual}
      >
        <div
          className="h-full rounded-full bg-[var(--color-serie-1)] transition-[width] duration-300"
          style={{ width: `${percentual}%` }}
        />
      </div>

      <dl className="tabular mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[var(--color-tinta-3)]">Seções</dt>
          <dd className="mt-0.5">
            {inteiro.format(apuracao.secoesTotalizadas)} de{' '}
            {inteiro.format(apuracao.secoesTotais)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-tinta-3)]">Comparecimento</dt>
          <dd className="mt-0.5">
            {doisDecimais.format(apuracao.percentualComparecimento)}%
            <span className="ml-2 text-[var(--color-tinta-3)]">
              {inteiro.format(apuracao.comparecimento)}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-tinta-3)]">Abstenção</dt>
          <dd className="mt-0.5">
            {doisDecimais.format(apuracao.percentualAbstencao)}%
            <span className="ml-2 text-[var(--color-tinta-3)]">
              {inteiro.format(apuracao.abstencao)}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-tinta-3)]">Gerado pelo TSE</dt>
          <dd className="mt-0.5">{apuracao.geradoEm}</dd>
        </div>
      </dl>

      {defasado && (
        <p
          role="status"
          className="mt-5 border-l-2 border-[var(--color-alerta)] pl-3 text-sm text-[var(--color-alerta)]"
        >
          <strong className="font-semibold">Atenção:</strong> sem atualização há mais de
          três minutos. Os números desta página podem estar defasados em relação ao TSE.
        </p>
      )}
    </section>
  )
}

export default FaixaEstado

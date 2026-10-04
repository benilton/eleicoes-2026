import { useApuracao } from './estado/useApuracao'
import type { Candidatura } from './tse/tipos'
import { CARGO, ELEICAO } from './tse/urls'

// A cor segue a candidatura, nunca a colocacao: uma ultrapassagem nao
// pode repintar as barras. O mapa e fixado na primeira coleta.
const slots = ['var(--color-serie-1)', 'var(--color-serie-2)', 'var(--color-serie-3)']
const coresPorNumero = new Map<string, string>()

function corDa(candidatura: Candidatura, posicao: number): string {
  const existente = coresPorNumero.get(candidatura.numero)
  if (existente) return existente
  const cor = posicao < slots.length ? slots[posicao] : 'var(--color-contexto)'
  coresPorNumero.set(candidatura.numero, cor)
  return cor
}

const inteiro = new Intl.NumberFormat('pt-BR')
const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export default function App() {
  const { dados, carregando, erro, defasado } = useApuracao(
    ELEICAO.federal1,
    'br',
    CARGO.presidente,
  )

  return (
    <div className="mx-auto min-h-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">
          Eleições 2026 · Presidente da República
        </h1>
        <p className="mt-1 text-sm text-[var(--color-tinta-3)]">
          Dados do Tribunal Superior Eleitoral. Projeto independente, sem vínculo com a
          Justiça Eleitoral.
        </p>
      </header>

      {carregando && !dados && (
        <p className="text-sm text-[var(--color-tinta-2)]">Consultando o TSE…</p>
      )}

      {dados && (
        <>
          <section
            className="mb-10 rounded-xl border border-white/10 bg-[var(--color-superficie)] p-6"
            aria-label="Estado da apuração"
          >
            <p className="text-sm text-[var(--color-tinta-3)]">Seções totalizadas</p>
            <p className="tabular mt-1 text-5xl font-semibold leading-none">
              {doisDecimais.format(dados.percentualSecoes)}
              <span className="text-2xl text-[var(--color-tinta-2)]">%</span>
            </p>
            <div
              className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--color-grade)]"
              role="progressbar"
              aria-valuenow={Math.round(dados.percentualSecoes)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-[var(--color-serie-1)] transition-[width] duration-300"
                style={{ width: `${Math.min(100, dados.percentualSecoes)}%` }}
              />
            </div>
            <dl className="tabular mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-[var(--color-tinta-3)]">Seções</dt>
                <dd>
                  {inteiro.format(dados.secoesTotalizadas)} de{' '}
                  {inteiro.format(dados.secoesTotais)}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-tinta-3)]">Comparecimento</dt>
                <dd>{doisDecimais.format(dados.percentualComparecimento)}%</dd>
              </div>
              <div>
                <dt className="text-[var(--color-tinta-3)]">Abstenção</dt>
                <dd>{doisDecimais.format(dados.percentualAbstencao)}%</dd>
              </div>
              <div>
                <dt className="text-[var(--color-tinta-3)]">Gerado pelo TSE</dt>
                <dd>{dados.geradoEm}</dd>
              </div>
            </dl>
            {defasado && (
              <p className="mt-4 text-sm text-[var(--color-alerta)]">
                Sem atualização há mais de três minutos. O número abaixo pode estar
                defasado.
              </p>
            )}
          </section>

          <section aria-label="Votação por candidatura">
            <h2 className="mb-4 text-sm font-medium text-[var(--color-tinta-3)]">
              Votos nominais apurados
            </h2>
            <ol className="space-y-3">
              {dados.candidaturas.map((c, i) => (
                <li key={c.numero}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate">
                      <span className="tabular mr-2 text-[var(--color-tinta-3)]">
                        {c.numero}
                      </span>
                      {c.nomeUrna}
                      <span className="ml-2 text-[var(--color-tinta-3)]">{c.partido}</span>
                    </span>
                    <span className="tabular shrink-0 text-[var(--color-tinta-2)]">
                      {inteiro.format(c.votos)}
                      <span className="ml-3 font-medium text-[var(--color-tinta)]">
                        {doisDecimais.format(c.percentual)}%
                      </span>
                    </span>
                  </div>
                  <div className="relative mt-1.5 h-3 w-full rounded-sm bg-[var(--color-grade)]">
                    <div
                      className="h-full rounded-sm transition-[width] duration-300"
                      style={{
                        width: `${Math.min(100, c.percentual)}%`,
                        backgroundColor: corDa(c, i),
                      }}
                    />
                    <div
                      className="absolute inset-y-[-3px] w-px bg-[var(--color-base)]"
                      style={{ left: '50%' }}
                      aria-hidden="true"
                    />
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-[var(--color-tinta-3)]">
              A marca vertical indica 50% dos votos válidos, limite do segundo turno.
            </p>
          </section>
        </>
      )}

      {erro && (
        <p className="mt-6 text-sm text-[var(--color-alerta)]">
          Falha na última consulta ao TSE. Mantendo o último dado válido. Detalhe: {erro}
        </p>
      )}

      <footer className="mt-12 border-t border-white/10 pt-4 text-xs text-[var(--color-tinta-3)]">
        Fonte oficial:{' '}
        <a className="underline" href="https://resultados.tse.jus.br">
          resultados.tse.jus.br
        </a>
        . Este painel é independente e não substitui a divulgação oficial.
      </footer>
    </div>
  )
}

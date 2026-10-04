import { useEffect, useMemo, useState } from 'react'
import { useApuracao } from './estado/useApuracao'
import { useMapaUF } from './estado/useMapaUF'
import { useSerieTemporal } from './estado/useSerieTemporal'
import FaixaEstado from './viz/FaixaEstado'
import BarrasCandidatos from './viz/BarrasCandidatos'
import SerieTemporal from './viz/SerieTemporal'
import TabelaCompleta from './viz/TabelaCompleta'
import MapaUF from './viz/MapaUF'
import { registrarOrdem } from './viz/cores'
import { CARGO, ELEICAO } from './tse/urls'

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
  const { porUf, carregadas, total } = useMapaUF(ELEICAO.federal1, CARGO.presidente)
  const { serie } = useSerieTemporal(dados)

  const [ufSelecionada, setUfSelecionada] = useState<string | null>(null)
  const [numeroMapa, setNumeroMapa] = useState<string | null>(null)

  // Fixa a identidade de cor assim que o primeiro dado chega, antes de
  // qualquer componente montar, para que nenhuma barra troque de cor depois.
  useEffect(() => {
    if (dados) registrarOrdem(dados.candidaturas)
  }, [dados])

  // Derivado no render, nao em efeito: a primeira candidatura e o padrao
  // ate que o leitor escolha outra.
  const numeroEfetivo = numeroMapa ?? dados?.candidaturas[0]?.numero ?? null

  const candidaturaMapa = useMemo(
    () => dados?.candidaturas.find((c) => c.numero === numeroEfetivo) ?? null,
    [dados, numeroEfetivo],
  )

  const percentualPorUf = useMemo(() => {
    const mapa: Record<string, number | null> = {}
    for (const [uf, apuracao] of Object.entries(porUf)) {
      const alvo = apuracao.candidaturas.find((c) => c.numero === numeroEfetivo)
      mapa[uf] = alvo ? alvo.percentual : null
    }
    return mapa
  }, [porUf, numeroEfetivo])

  const apuracaoUf = ufSelecionada ? (porUf[ufSelecionada] ?? null) : null

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
        <div className="space-y-12">
          <FaixaEstado apuracao={dados} defasado={defasado} />

          <section aria-label="Votação por candidatura">
            <h2 className="mb-4 text-sm font-medium text-[var(--color-tinta-3)]">
              Votos nominais apurados no Brasil
            </h2>
            <BarrasCandidatos candidaturas={dados.candidaturas} />
          </section>

          <section aria-label="Evolução da apuração">
            <h2 className="mb-4 text-sm font-medium text-[var(--color-tinta-3)]">
              Evolução conforme a apuração avança
            </h2>
            <SerieTemporal serie={serie} candidaturas={dados.candidaturas} />
          </section>

          <section aria-label="Resultado por unidade federativa">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium text-[var(--color-tinta-3)]">
                Percentual por unidade federativa
              </h2>
              <p className="text-xs text-[var(--color-tinta-3)]">
                {carregadas} de {total} unidades carregadas
              </p>
            </div>

            <div
              className="mb-5 flex flex-wrap gap-2"
              role="group"
              aria-label="Escolha da candidatura mostrada no mapa"
            >
              {dados.candidaturas.slice(0, 6).map((c) => {
                const ativo = c.numero === numeroEfetivo
                return (
                  <button
                    key={c.numero}
                    type="button"
                    onClick={() => setNumeroMapa(c.numero)}
                    aria-pressed={ativo}
                    className={[
                      'rounded-full border px-3 py-1.5 text-sm transition-colors',
                      'focus-visible:outline focus-visible:outline-2',
                      'focus-visible:outline-offset-2 focus-visible:outline-[var(--color-tinta)]',
                      ativo
                        ? 'border-[var(--color-tinta)] bg-[var(--color-superficie)] text-[var(--color-tinta)]'
                        : 'border-white/10 text-[var(--color-tinta-2)] hover:border-white/25',
                    ].join(' ')}
                  >
                    <span className="tabular mr-1.5 text-[var(--color-tinta-3)]">
                      {c.numero}
                    </span>
                    {c.nomeUrna}
                  </button>
                )
              })}
            </div>

            {candidaturaMapa && (
              <MapaUF
                percentualPorUf={percentualPorUf}
                ufSelecionada={ufSelecionada}
                aoSelecionar={(uf) => setUfSelecionada(uf === ufSelecionada ? null : uf)}
                rotuloCandidatura={`${candidaturaMapa.nomeUrna} (${candidaturaMapa.numero})`}
              />
            )}
          </section>

          {apuracaoUf && (
            <section aria-label={`Resultado em ${apuracaoUf.uf.toUpperCase()}`}>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-sm font-medium text-[var(--color-tinta-3)]">
                  Presidente em {apuracaoUf.uf.toUpperCase()}
                </h2>
                <p className="tabular text-xs text-[var(--color-tinta-3)]">
                  {doisDecimais.format(apuracaoUf.percentualSecoes)}% das seções
                  totalizadas · gerado em {apuracaoUf.geradoEm}
                </p>
              </div>
              <BarrasCandidatos candidaturas={apuracaoUf.candidaturas} />
            </section>
          )}

          <section aria-label="Tabela completa">
            <h2 className="mb-4 text-sm font-medium text-[var(--color-tinta-3)]">
              Todos os números
            </h2>
            <TabelaCompleta apuracao={apuracaoUf ?? dados} />
          </section>
        </div>
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
        . Malha das unidades federativas:{' '}
        <a className="underline" href="https://github.com/fititnt/gis-dataset-brasil">
          fititnt/gis-dataset-brasil
        </a>
        . Este painel é independente e não substitui a divulgação oficial.
      </footer>
    </div>
  )
}

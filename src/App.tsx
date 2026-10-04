import { useMemo, useState } from 'react'
import { useApuracao } from './estado/useApuracao'
import { useMapaUF } from './estado/useMapaUF'
import { useSerieTemporal } from './estado/useSerieTemporal'
import { useHistorico } from './estado/useHistorico'
import { estimarPosEstratificado, faixaRecente } from './analise/projecao'
import { agregarPorRegiao } from './analise/regioes'
import FaixaEstado from './viz/FaixaEstado'
import BarrasCandidatos from './viz/BarrasCandidatos'
import SerieTemporal from './viz/SerieTemporal'
import TabelaCompleta from './viz/TabelaCompleta'
import MapaUF from './viz/MapaUF'
import type { ModoMapa } from './viz/MapaUF'
import TabelaEstados from './viz/TabelaEstados'
import ConvergenciaUF from './viz/ConvergenciaUF'
import Regioes from './viz/Regioes'
import { Abas } from './ui/Abas'
import type { Aba } from './ui/Abas'
import { numerosComIdentidade, registrarOrdem } from './viz/cores'
import { CARGO, ELEICAO } from './tse/urls'

const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const tituloSecao = 'mb-4 text-sm font-medium text-[var(--color-tinta-3)]'

export default function App() {
  const { dados, carregando, erro, defasado } = useApuracao(
    ELEICAO.federal1,
    'br',
    CARGO.presidente,
  )
  const { porUf, carregadas, total } = useMapaUF(ELEICAO.federal1, CARGO.presidente)
  const { serie } = useSerieTemporal(dados)
  const historico = useHistorico(ELEICAO.federal1, CARGO.presidente, serie)

  // O estado de selecao mora aqui, e nao dentro de uma aba: Abas monta
  // apenas o painel ativo, entao um estado guardado la dentro se perderia
  // na troca de aba.
  const [ufSelecionada, setUfSelecionada] = useState<string | null>(null)
  const [numeroMapa, setNumeroMapa] = useState<string | null>(null)
  const [modoMapa, setModoMapa] = useState<ModoMapa>('lider')

  // Idempotente. Precisa rodar antes de numerosComIdentidade, porque a aba
  // de Estados pode ser a primeira a montar quando a pagina abre em #estados.
  if (dados) registrarOrdem(dados.candidaturas)
  const numerosDestaque = numerosComIdentidade()

  const numeroEfetivo = numeroMapa ?? dados?.candidaturas[0]?.numero ?? null

  const apuracaoUf = ufSelecionada ? (porUf[ufSelecionada] ?? null) : null

  const estimativa = useMemo(
    () => estimarPosEstratificado(porUf, dados?.eleitoresAptos),
    [porUf, dados],
  )

  const faixa = useMemo(() => {
    const eleitorado: Record<string, number> = {}
    const comparecimento: Record<string, number> = {}
    for (const [uf, apuracao] of Object.entries(porUf)) {
      eleitorado[uf] = apuracao.eleitoresAptos
      comparecimento[uf] = apuracao.percentualComparecimento
    }
    return faixaRecente(historico.ufs, eleitorado, comparecimento, 6)
  }, [historico.ufs, porUf])

  const regioes = useMemo(() => agregarPorRegiao(porUf), [porUf])

  if (!dados) {
    return (
      <div className="mx-auto min-h-full max-w-5xl px-4 py-8 sm:px-6">
        <Cabecalho />
        <p className="text-sm text-[var(--color-tinta-2)]">
          {carregando ? 'Consultando o TSE…' : (erro ?? 'Sem dados do TSE no momento.')}
        </p>
      </div>
    )
  }

  const abas: Aba[] = [
    {
      id: 'brasil',
      rotulo: 'Brasil',
      conteudo: (
        <div className="space-y-10">
          <FaixaEstado apuracao={dados} defasado={defasado} />
          <BarrasCandidatos
            candidaturas={dados.candidaturas}
            titulo="Votos nominais apurados no Brasil"
          />
          <section aria-label="Todos os números do Brasil">
            <h2 className={tituloSecao}>Todos os números</h2>
            <TabelaCompleta apuracao={dados} />
          </section>
        </div>
      ),
    },
    {
      id: 'estados',
      rotulo: 'Estados',
      conteudo: (
        <div className="space-y-10">
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
              className={`mb-5 flex-wrap gap-2 ${modoMapa === 'percentual' ? 'flex' : 'hidden'}`}
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

            <MapaUF
              dadosPorUf={porUf}
              numerosDestaque={numerosDestaque}
              modo={modoMapa}
              aoTrocarModo={setModoMapa}
              numeroPercentual={numeroEfetivo}
              ufSelecionada={ufSelecionada}
              aoSelecionar={(uf) => setUfSelecionada(uf === ufSelecionada ? null : uf)}
            />
          </section>

          <section aria-label="Votos por unidade federativa">
            <h2 className={tituloSecao}>Votos por unidade federativa</h2>
            <TabelaEstados
              dadosPorUf={porUf}
              numerosDestaque={numerosDestaque}
              candidaturas={dados.candidaturas}
              ufSelecionada={ufSelecionada}
              aoSelecionar={(uf) => setUfSelecionada(uf === ufSelecionada ? null : uf)}
            />
          </section>

          {apuracaoUf ? (
            <>
              <p className="tabular text-xs text-[var(--color-tinta-3)]">
                {doisDecimais.format(apuracaoUf.percentualSecoes)}% das seções totalizadas
                em {apuracaoUf.uf.toUpperCase()} · gerado em {apuracaoUf.geradoEm}
              </p>
              <BarrasCandidatos
                candidaturas={apuracaoUf.candidaturas}
                titulo={`Votos nominais em ${apuracaoUf.uf.toUpperCase()}`}
              />
              <section aria-label={`Todos os números de ${apuracaoUf.uf.toUpperCase()}`}>
                <h2 className={tituloSecao}>
                  Todos os números de {apuracaoUf.uf.toUpperCase()}
                </h2>
                <TabelaCompleta apuracao={apuracaoUf} />
              </section>
            </>
          ) : (
            <p className="text-sm text-[var(--color-tinta-3)]">
              Escolha uma unidade federativa no mapa para ver o resultado detalhado.
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'regioes',
      rotulo: 'Regiões',
      conteudo: (
        <section aria-label="Resultado por região">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium text-[var(--color-tinta-3)]">
              Resultado por região do Brasil
            </h2>
            <p className="text-xs text-[var(--color-tinta-3)]">
              Soma dos votos absolutos das unidades de cada região
            </p>
          </div>
          <Regioes regioes={regioes} candidaturas={dados.candidaturas} />
        </section>
      ),
    },
    {
      id: 'convergencia',
      rotulo: 'Convergência',
      conteudo: (
        <div className="space-y-10">
          <section aria-label="Evolução da apuração">
            <h2 className={tituloSecao}>Evolução conforme a apuração avança</h2>
            <SerieTemporal
              pontos={historico.br}
              candidaturas={dados.candidaturas}
              estimativa={estimativa}
              faixa={faixa}
              origem={historico.origem}
            />
          </section>

          {Object.keys(historico.ufs).length > 0 && (
            <section aria-label="Convergência por unidade federativa">
              <h2 className={tituloSecao}>Convergência em cada unidade federativa</h2>
              <ConvergenciaUF
                ufs={historico.ufs}
                candidaturas={dados.candidaturas}
                ufSelecionada={ufSelecionada}
                aoSelecionar={(uf) =>
                  setUfSelecionada(
                    uf.toLowerCase() === ufSelecionada ? null : uf.toLowerCase(),
                  )
                }
              />
            </section>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="mx-auto min-h-full max-w-5xl px-4 py-8 sm:px-6">
      <Cabecalho />
      <Abas abas={abas} />

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
        . Divisão regional do IBGE. Este painel é independente e não substitui a
        divulgação oficial.
      </footer>
    </div>
  )
}

function Cabecalho() {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight">
        Eleições 2026 · Presidente da República
      </h1>
      <p className="mt-1 text-sm text-[var(--color-tinta-3)]">
        Dados do Tribunal Superior Eleitoral. Projeto independente, sem vínculo com a
        Justiça Eleitoral.
      </p>
    </header>
  )
}

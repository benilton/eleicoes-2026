import { lazy, Suspense, useMemo, useState } from 'react'
import type { Apuracao } from './tse/tipos'
import { useApuracao } from './estado/useApuracao'
import { useMapaUF } from './estado/useMapaUF'
import { useSerieTemporal } from './estado/useSerieTemporal'
import { useHistorico } from './estado/useHistorico'
import type { Estimativa } from './analise/projecao'
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
import TabelaExterior from './viz/TabelaExterior'
import { useExterior } from './estado/useExterior'
import Projecao from './viz/Projecao'
// Carregada sob demanda: o KaTeX, a folha de estilo e as fontes dele so
// chegam ao visitante que abrir a guia de metodologia.
const Metodologia = lazy(() => import('./ui/Metodologia'))
// Também sob demanda: a reprodução baixa o histórico inteiro, que não
// interessa a quem só quer o número da noite.
const Replay = lazy(() => import('./ui/Replay'))
// Também sob demanda: a animação baixa public/animacao-2turno.json, que tem
// cerca de 800 KB e só interessa a quem abrir esta guia.
const ApuracaoEmMovimento = lazy(() => import('./ui/ApuracaoEmMovimento'))
import { projetarPorVariacao } from './analise/swing'
import SeletorMunicipio from './ui/SeletorMunicipio'
import Comparativo from './viz/Comparativo'
import { useComparativo } from './estado/useComparativo'
import { resumoPrimeiroTurno, useBaseEstatica } from './dados/primeiroTurno'
import { rotuloAbrangencia, type Uf } from './tse/urls'
import type { Aba } from './ui/Abas'
import { numerosComIdentidade, registrarOrdem } from './viz/cores'
import { CARGO, ELEICAO } from './tse/urls'

const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const inteiro = new Intl.NumberFormat('pt-BR')

const tituloSecao = 'mb-4 text-sm font-medium text-[var(--color-tinta-3)]'

export default function App() {
  // Eleicao ativa do painel. 6258 e o 2o turno federal. O 1o turno, usado como
  // linha de base do comparativo, nao e consultado ao vivo: vem congelado de
  // public/primeiro-turno.json, gerado por scripts/baixar-1turno.mjs.
  const { dados, carregando, erro, defasado } = useApuracao(
    ELEICAO.federal2,
    'br',
    CARGO.presidente,
  )
  const { porUf, carregadas, total } = useMapaUF(ELEICAO.federal2, CARGO.presidente)
  const { serie } = useSerieTemporal(dados)
  const historico = useHistorico(ELEICAO.federal2, CARGO.presidente, serie)

  // O estado de selecao mora aqui, e nao dentro de uma aba: Abas monta
  // apenas o painel ativo, entao um estado guardado la dentro se perderia
  // na troca de aba.
  const [ufSelecionada, setUfSelecionada] = useState<string | null>(null)
  // Mora aqui pelo mesmo motivo do comentario acima: Abas monta apenas o
  // painel ativo, entao estado guardado dentro da aba se perderia na troca.
  const [ufMunicipio, setUfMunicipio] = useState<Uf>('sp')
  const [codigoMunicipio, setCodigoMunicipio] = useState<string | null>('62910')
  const base = useBaseEstatica()
  const comparativo = useComparativo(ufMunicipio, codigoMunicipio)

  // Exterior: o agregado vem pelo mesmo agendador do painel nacional, e os
  // 186 postos por varredura propria, em ritmo mais lento.
  const exterior = useApuracao(ELEICAO.federal2, 'zz', CARGO.presidente)
  const postosExterior = base.municipios.zz ?? []
  const codigosExterior = useMemo(
    () => postosExterior.map(([codigo]) => codigo),
    [postosExterior],
  )
  const varreduraExterior = useExterior(codigosExterior)
  const [numeroMapa, setNumeroMapa] = useState<string | null>(null)
  const [modoMapa, setModoMapa] = useState<ModoMapa>('margem')

  // Idempotente. Precisa rodar antes de numerosComIdentidade, porque a aba
  // de Estados pode ser a primeira a montar quando a pagina abre em #estados.
  if (dados) registrarOrdem(dados.candidaturas)
  const numerosDestaque = numerosComIdentidade()

  const numeroEfetivo = numeroMapa ?? dados?.candidaturas[0]?.numero ?? null

  const apuracaoUf = ufSelecionada ? (porUf[ufSelecionada] ?? null) : null

  const regioes = useMemo(() => agregarPorRegiao(porUf), [porUf])

  // Projecao por variacao entre turnos. Depende do mapa das 27 unidades, que
  // e varrido a cada 180 segundos, e do 1o turno congelado.
  const numerosProjecao = useMemo(
    () => (dados?.candidaturas ?? []).slice(0, 2).map((c) => c.numero),
    [dados],
  )
  const projecao = useMemo(
    () => projetarPorVariacao(porUf, base, numerosProjecao),
    [porUf, base, numerosProjecao],
  )

  // A guia Convergência usa a mesma projeção da guia Brasil. Dois estimadores
  // diferentes no mesmo site dariam dois números para a mesma pergunta, e o
  // leitor não teria como saber em qual acreditar.
  const estimativa = useMemo<Estimativa | null>(() => {
    if (projecao === null) return null
    return {
      porCandidato: projecao.porCandidato,
      coberturaEleitorado: projecao.cobertura,
      ufsComDado: projecao.unidadesNaVariacao,
      confiavel: projecao.confiavel,
    }
  }, [projecao])

  const faixa = useMemo(() => {
    const saida: Record<string, { min: number; max: number }> = {}
    if (projecao === null) return saida
    for (const [numero, valor] of Object.entries(projecao.porCandidato)) {
      const meia = projecao.faixa[numero] ?? 0
      saida[numero] = {
        min: Math.max(0, valor - meia),
        max: Math.min(100, valor + meia),
      }
    }
    return saida
  }, [projecao])

  // Percentual do 1o turno por unidade federativa, para o balao do mapa.
  const primeiroPorUf = useMemo(() => {
    const mapa: Record<string, Record<string, number>> = {}
    const arquivo = base.primeiroTurno
    if (!arquivo) return mapa
    for (const sigla of Object.keys(arquivo.uf)) {
      const resumo = resumoPrimeiroTurno(base, sigla)
      if (!resumo || resumo.votosNominais <= 0) continue
      const porNumero: Record<string, number> = {}
      for (const [numero, votos] of Object.entries(resumo.porNumero)) {
        porNumero[numero] = (votos / resumo.votosNominais) * 100
      }
      mapa[sigla] = porNumero
    }
    return mapa
  }, [base])

  if (!dados) {
    return (
      <div className="mx-auto min-h-full max-w-5xl px-4 py-8 sm:px-6">
        <Cabecalho apuracao={dados} />
        <p className="text-sm text-[var(--color-tinta-2)]">
          {carregando ? 'Consultando o TSE…' : (erro ?? 'Sem dados do TSE no momento.')}
        </p>
      </div>
    )
  }

  const listaMunicipios = base.municipios[ufMunicipio] ?? []
  const nomeMunicipio =
    listaMunicipios.find(([cd]) => cd === codigoMunicipio)?.[1] ?? 'Município'

  const abas: Aba[] = [
    {
      id: 'municipio',
      rotulo: 'Município',
      conteudo: (
        <div>
          <SeletorMunicipio
            municipios={base.municipios}
            uf={ufMunicipio}
            codigo={codigoMunicipio}
            aoTrocarUf={setUfMunicipio}
            aoTrocarMunicipio={setCodigoMunicipio}
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <Comparativo
              titulo={nomeMunicipio}
              subtitulo={rotuloAbrangencia(ufMunicipio)}
              primeiro={resumoPrimeiroTurno(base, ufMunicipio, codigoMunicipio)}
              segundo={comparativo.municipio}
            />
            <Comparativo
              titulo={rotuloAbrangencia(ufMunicipio)}
              subtitulo={ufMunicipio === 'zz' ? 'Votos no exterior' : 'Unidade federativa'}
              primeiro={resumoPrimeiroTurno(base, ufMunicipio)}
              segundo={comparativo.uf}
            />
            <Comparativo
              titulo="Brasil"
              primeiro={resumoPrimeiroTurno(base, 'br')}
              segundo={comparativo.brasil}
            />
          </div>

          <p className="mt-4 text-xs text-[var(--color-tinta-3)]">
            O 2º turno vem do TSE a cada oito segundos. O 1º turno é o resultado
            final de 04/10/2026, congelado no repositório, então o comparativo
            aparece sem espera.
          </p>

          {comparativo.erro && (
            <p className="mt-2 text-sm text-[var(--color-alerta)]">
              Falha na última consulta ao TSE. Mantendo o último dado válido.
              Detalhe: {comparativo.erro}
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'exterior',
      rotulo: 'Exterior',
      conteudo: (
        <div className="space-y-8">
          <div className="grid gap-4 lg:grid-cols-2">
            <Comparativo
              titulo="Exterior"
              subtitulo="Soma dos 186 postos"
              primeiro={resumoPrimeiroTurno(base, 'zz')}
              segundo={exterior.dados}
            />
            <Comparativo
              titulo="Brasil"
              subtitulo="Inclui os votos do exterior"
              primeiro={resumoPrimeiroTurno(base, 'br')}
              segundo={comparativo.brasil}
            />
          </div>

          <TabelaExterior
            postos={postosExterior}
            paises={base.paisesExterior.pais}
            porPosto={varreduraExterior.porPosto}
            primeiroDe={(codigo) => resumoPrimeiroTurno(base, 'zz', codigo)}
            numeros={numerosDestaque.length > 0 ? numerosDestaque : ['13', '22']}
            nomeDe={(numero) =>
              dados.candidaturas.find((c) => c.numero === numero)?.nomeUrna ?? numero
            }
            carregados={varreduraExterior.carregados}
            total={varreduraExterior.total}
          />

          <p className="text-xs text-[var(--color-tinta-3)]">
            A votação no exterior termina antes da brasileira, porém o TSE só
            publica o resultado quando as urnas fecham no Brasil. Até lá os
            arquivos existem zerados. Os postos são lidos em varredura própria,
            a cada dois minutos, por serem 186 arquivos.
          </p>
        </div>
      ),
    },
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
          {/* Depois do resultado apurado, nunca antes: o número real tem
              precedência de leitura sobre a estimativa. */}
          <Projecao projecao={projecao} candidaturas={dados.candidaturas} />
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
                Mapa por unidade federativa
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
              percentuaisPrimeiroTurno={primeiroPorUf}
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

  abas.push({
    id: 'replay',
    rotulo: 'Reprodução',
    conteudo: (
      <Suspense
        fallback={
          <p className="text-sm text-[var(--color-tinta-3)]">Carregando a reprodução…</p>
        }
      >
        <Replay />
      </Suspense>
    ),
  })

  abas.push({
    id: 'animacao',
    rotulo: 'Em movimento',
    conteudo: (
      <Suspense
        fallback={
          <p className="text-sm text-[var(--color-tinta-3)]">Carregando a animação…</p>
        }
      >
        <ApuracaoEmMovimento />
      </Suspense>
    ),
  })

  abas.push({
    id: 'metodologia',
    rotulo: 'Metodologia',
    conteudo: (
      <Suspense
        fallback={
          <p className="text-sm text-[var(--color-tinta-3)]">
            Carregando a metodologia…
          </p>
        }
      >
        <Metodologia />
      </Suspense>
    ),
  })

  // Ordem de leitura das guias. Fica aqui, e nao na ordem em que os objetos
  // foram escritos acima, para que mexer na sequencia seja uma linha so.
  // A primeira da lista e a que abre quando nao ha fragmento no endereco.
  const ORDEM_DAS_ABAS = [
    'brasil',
    'regioes',
    'estados',
    'municipio',
    'exterior',
    'convergencia',
    'replay',
    'animacao',
    'metodologia',
  ]
  abas.sort(
    (a, b) => ORDEM_DAS_ABAS.indexOf(a.id) - ORDEM_DAS_ABAS.indexOf(b.id),
  )

  return (
    <div className="mx-auto min-h-full max-w-5xl px-4 py-8 sm:px-6">
      <Cabecalho apuracao={dados} />
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

/**
 * Cabecalho com o andamento nacional sempre a vista.
 *
 * Cada guia mostra o andamento do proprio nivel, porem quem esta lendo o
 * exterior ou um municipio perde a referencia do pais. A faixa fica aqui,
 * fora das guias, para acompanhar qualquer leitura.
 */
function Cabecalho({ apuracao }: { apuracao: Apuracao | null }) {
  const percentual =
    apuracao === null ? 0 : Math.max(0, Math.min(100, apuracao.percentualSecoes))

  return (
    <header className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight">
        Eleições 2026 · Presidente da República
      </h1>
      <p className="mt-1 text-sm text-[var(--color-tinta-3)]">
        Dados do Tribunal Superior Eleitoral. Projeto independente, sem vínculo com a
        Justiça Eleitoral.
      </p>

      {apuracao !== null && (
        <div className="mt-4">
          <div className="tabular flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-[var(--color-tinta-3)]">
            <span>
              Brasil:{' '}
              <b className="font-semibold text-[var(--color-tinta)]">
                {doisDecimais.format(apuracao.percentualSecoes)}%
              </b>{' '}
              das seções totalizadas ·{' '}
              {inteiro.format(apuracao.secoesTotalizadas)} de{' '}
              {inteiro.format(apuracao.secoesTotais)} urnas
            </span>
            <span>arquivo do TSE gerado em {apuracao.geradoEm}</span>
          </div>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-grade)]"
            role="progressbar"
            aria-label="Progresso da totalização no Brasil"
            aria-valuenow={Number(percentual.toFixed(2))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${doisDecimais.format(apuracao.percentualSecoes)}% das seções totalizadas no Brasil`}
          >
            <div
              className="h-full rounded-full bg-[var(--color-tinta-2)] transition-[width] duration-500"
              style={{ width: `${percentual}%` }}
            />
          </div>
        </div>
      )}
    </header>
  )
}

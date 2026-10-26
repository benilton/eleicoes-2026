import { useEffect, useMemo, useState } from 'react'
import type { CandidatoReplay, PontoReplay } from '../estado/useReplay'
import { useReplay } from '../estado/useReplay'
import type { Apuracao, Candidatura } from '../tse/tipos'
import { CARGO, ELEICAO } from '../tse/urls'
import MapaUF from '../viz/MapaUF'
import type { ModoMapa } from '../viz/MapaUF'
import Projecao from '../viz/Projecao'
import { corDaCandidatura, numerosComIdentidade, ordenarParaExibir, registrarOrdem } from '../viz/cores'

const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Passos por segundo em cada velocidade oferecida. */
const VELOCIDADES = [2, 6, 20] as const

const hora = (t: number) =>
  new Date(t * 1000).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

/**
 * Monta um objeto de apuracao a partir do que o historico guardou.
 *
 * O historico nao grava voto absoluto nem eleitorado por unidade em cada
 * ponto, apenas o percentual de secoes e o percentual de cada candidatura.
 * Isso basta para o mapa, que pinta por percentual e trata secoes zeradas
 * como ausencia de dado. Os campos que faltam ficam em zero de proposito, e
 * nenhum componente usado aqui depende deles.
 */
function comoApuracao(
  sigla: string,
  estado: { pst: number; pct: Record<string, number> },
  candidatos: CandidatoReplay[],
): Apuracao {
  const candidaturas: Candidatura[] = candidatos.map((c) => ({
    numero: c.numero,
    nomeUrna: c.nomeUrna,
    nomeCompleto: c.nomeUrna,
    partido: c.partido,
    sqcand: '',
    votos: Math.round((estado.pct[c.numero] ?? 0) * 1000),
    percentual: estado.pct[c.numero] ?? 0,
    eleito: false,
    fotoUrl: '',
  }))

  return {
    eleicao: ELEICAO.federal2,
    turno: '2',
    abrangencia: 'uf',
    uf: sigla,
    cargo: 'Presidente',
    geradoEm: '',
    idGeracao: '',
    secoesTotalizadas: estado.pst > 0 ? 1 : 0,
    secoesTotais: 1,
    percentualSecoes: estado.pst,
    eleitoresAptos: 0,
    comparecimento: 0,
    percentualComparecimento: 0,
    abstencao: 0,
    percentualAbstencao: 0,
    votosValidos: 0,
    votosBrancos: 0,
    votosNulos: 0,
    votosNominais: 0,
    candidaturas,
  }
}

function Barra({
  numero,
  nome,
  partido,
  percentual,
}: {
  numero: string
  nome: string
  partido: string
  percentual: number
}) {
  const largura = Math.max(0, Math.min(100, percentual))
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">
          <span className="tabular mr-1.5 text-[var(--color-tinta-3)]">{numero}</span>
          {nome}
          <span className="ml-1.5 text-xs text-[var(--color-tinta-3)]">{partido}</span>
        </span>
        <span
          className="tabular text-2xl font-semibold"
          style={{ color: corDaCandidatura(numero) }}
        >
          {doisDecimais.format(percentual)}%
        </span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${largura}%`, background: corDaCandidatura(numero) }}
        />
      </div>
    </li>
  )
}

/**
 * Reproducao da noite de apuracao a partir do historico gravado.
 *
 * Cada passo e um ponto de coleta, nao um intervalo fixo de tempo: os pontos
 * sao mais densos quando o TSE publica mais, que e justamente quando a
 * apuracao anda. A barra de progresso mostra o percentual de secoes, nao a
 * posicao no tempo, pelo mesmo motivo.
 */
export default function Replay() {
  const { candidatos, pontos, carregando, erro } = useReplay(
    ELEICAO.federal2,
    CARGO.presidente,
  )

  const [indice, setIndice] = useState(0)
  const [tocando, setTocando] = useState(false)
  const [velocidade, setVelocidade] = useState<number>(VELOCIDADES[1])
  const [modoMapa, setModoMapa] = useState<ModoMapa>('margem')
  const [ufSelecionada, setUfSelecionada] = useState<string | null>(null)

  const ultimo = pontos.length - 1

  useEffect(() => {
    if (!tocando || pontos.length === 0) return
    const id = window.setInterval(() => {
      setIndice((atual) => {
        if (atual >= ultimo) {
          setTocando(false)
          return ultimo
        }
        return atual + 1
      })
    }, 1000 / velocidade)
    return () => window.clearInterval(id)
  }, [tocando, velocidade, ultimo, pontos.length])

  const ponto: PontoReplay | undefined = pontos[indice]

  const dadosPorUf = useMemo(() => {
    if (ponto === undefined) return {}
    const saida: Record<string, Apuracao> = {}
    for (const [sigla, estado] of Object.entries(ponto.ufs)) {
      saida[sigla] = comoApuracao(sigla, estado, candidatos)
    }
    return saida
  }, [ponto, candidatos])

  if (carregando) {
    return <p className="text-sm text-[var(--color-tinta-3)]">Lendo o histórico…</p>
  }
  if (erro !== null || ponto === undefined) {
    return (
      <p className="text-sm text-[var(--color-alerta)]">
        Não foi possível ler o histórico da apuração. {erro ?? ''}
      </p>
    )
  }

  const candidaturas: Candidatura[] = candidatos.map((c) => ({
    numero: c.numero,
    nomeUrna: c.nomeUrna,
    nomeCompleto: c.nomeUrna,
    partido: c.partido,
    sqcand: '',
    votos: Math.round((ponto.pct[c.numero] ?? 0) * 1000),
    percentual: ponto.pct[c.numero] ?? 0,
    eleito: false,
    fotoUrl: '',
  }))
  registrarOrdem(candidaturas)
  const ordenadas = ordenarParaExibir(candidaturas)

  const projecao = {
    porCandidato: ponto.proj,
    variacao: {},
    faixa: ponto.faixa,
    cobertura: ponto.cob / 100,
    unidadesNaVariacao: Object.values(ponto.ufs).filter((u) => u.pst >= 5).length,
    confiavel: ponto.cob >= 20,
  }

  const botao =
    'cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
    'focus-visible:outline-[var(--color-tinta)]'

  return (
    <div className="space-y-8">
      <section
        aria-label="Controles da reprodução"
        className="rounded-xl border border-white/10 p-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (indice >= ultimo) setIndice(0)
              setTocando((v) => !v)
            }}
            className={`${botao} border-[var(--color-tinta)] bg-[var(--color-superficie)] text-[var(--color-tinta)]`}
          >
            {tocando ? 'Pausar' : indice >= ultimo ? 'Repetir' : 'Reproduzir'}
          </button>

          <button
            type="button"
            onClick={() => {
              setTocando(false)
              setIndice(0)
            }}
            className={`${botao} border-white/10 text-[var(--color-tinta-2)]`}
          >
            Voltar ao início
          </button>

          <div className="flex items-center gap-1.5" role="group" aria-label="Velocidade">
            {VELOCIDADES.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={velocidade === v}
                onClick={() => setVelocidade(v)}
                className={`${botao} ${
                  velocidade === v
                    ? 'border-[var(--color-tinta-3)] text-[var(--color-tinta)]'
                    : 'border-white/10 text-[var(--color-tinta-3)]'
                }`}
              >
                {v} passos/s
              </button>
            ))}
          </div>

          <span className="tabular ml-auto text-sm text-[var(--color-tinta-3)]">
            passo {indice + 1} de {pontos.length} · {hora(ponto.t)}
          </span>
        </div>

        <label className="mt-4 block">
          <span className="sr-only">Posição na apuração</span>
          <input
            type="range"
            min={0}
            max={ultimo}
            value={indice}
            onChange={(e) => {
              setTocando(false)
              setIndice(Number(e.target.value))
            }}
            className="w-full accent-[var(--color-tinta-2)]"
          />
        </label>

        <p className="tabular mt-1 text-sm text-[var(--color-tinta-2)]">
          <b className="text-lg font-semibold text-[var(--color-tinta)]">
            {doisDecimais.format(ponto.pst)}%
          </b>{' '}
          das seções totalizadas · cobertura da projeção{' '}
          {doisDecimais.format(ponto.cob)}%
        </p>
      </section>

      <section aria-label="Resultado apurado naquele instante">
        <h2 className="mb-3 text-sm font-medium text-[var(--color-tinta-3)]">
          Votos nominais apurados
        </h2>
        <ol className="space-y-4">
          {ordenadas.map((c) => (
            <Barra
              key={c.numero}
              numero={c.numero}
              nome={c.nomeUrna}
              partido={c.partido}
              percentual={c.percentual}
            />
          ))}
        </ol>
      </section>

      <Projecao projecao={projecao} candidaturas={candidaturas} />

      <section aria-label="Mapa naquele instante">
        <h2 className="mb-3 text-sm font-medium text-[var(--color-tinta-3)]">
          Mapa no mesmo instante
        </h2>
        <MapaUF
          dadosPorUf={dadosPorUf}
          numerosDestaque={numerosComIdentidade()}
          modo={modoMapa}
          aoTrocarModo={setModoMapa}
          numeroPercentual={ordenadas[0]?.numero ?? null}
          ufSelecionada={ufSelecionada}
          aoSelecionar={(uf) => setUfSelecionada(uf === ufSelecionada ? null : uf)}
        />
      </section>

      <p className="text-xs text-[var(--color-tinta-3)]">
        Cada passo é um ponto de coleta, não um intervalo fixo de tempo. Os pontos são
        mais densos quando o TSE publica mais, que é justamente quando a apuração anda.
        A projeção mostrada em cada passo foi recalculada a partir do estado das unidades
        federativas naquele instante, pelo mesmo estimador descrito na guia Metodologia.
      </p>
    </div>
  )
}

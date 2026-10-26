import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAnimacao } from '../dados/animacao'
import type { EventoAnimacao } from '../dados/animacao'
import { criarMotor, posicoesDosEventos } from '../viz/motorAnimacao'
import type { Motor, Variante } from '../viz/motorAnimacao'

/**
 * Aba da reproducao visual da noite: os municipios entrando na conta ao longo
 * do tempo, com os votos escorrendo para dois vasos.
 *
 * O componente nao guarda o instante corrente em estado do React. O motor roda
 * o laco em canvas e devolve o relogio por retorno de chamada, que escreve
 * direto nos nos do DOM: sessenta renderizacoes por segundo em React seriam
 * desperdicio puro.
 */

const DURACAO_PADRAO = 90

const horaDe = (instante: number) =>
  new Date(instante * 1000).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })

const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const inteiro = new Intl.NumberFormat('pt-BR')

/** "FLAVIO BOLSONARO" para "Flavio Bolsonaro", so em frase corrida. */
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
const nomeProprio = (nome: string) =>
  nome
    .toLowerCase()
    .split(/\s+/)
    .map((parte, i) =>
      i > 0 && PARTICULAS.has(parte)
        ? parte
        : parte.charAt(0).toUpperCase() + parte.slice(1),
    )
    .join(' ')

const classeAba =
  'rounded-full border px-3.5 py-1.5 text-sm transition-colors ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-[var(--color-tinta)]'

export default function ApuracaoEmMovimento() {
  const { pacote, erro } = useAnimacao()
  const canvas = useRef<HTMLCanvasElement>(null)
  const motor = useRef<Motor | null>(null)
  const relogio = useRef<HTMLSpanElement>(null)
  const apurado = useRef<HTMLSpanElement>(null)
  const barra = useRef<HTMLInputElement>(null)
  const legenda = useRef<HTMLParagraphElement>(null)
  const marcas = useRef<HTMLDivElement>(null)
  const ateQuando = useRef(0)

  const [variante, setVariante] = useState<Variante>('mapa')
  const [tocando, setTocando] = useState(true)
  const [duracao, setDuracao] = useState(DURACAO_PADRAO)
  const [evento, setEvento] = useState<EventoAnimacao | null>(null)

  const dados = pacote?.dados ?? null

  const posicoes = useMemo(
    () => (dados === null ? [] : posicoesDosEventos(dados)),
    [dados],
  )

  const aoQuadro = useCallback(
    (estado: {
      progresso: number
      instante: number
      pst: number
      evento: EventoAnimacao | null
      terminou: boolean
    }) => {
      if (relogio.current !== null) relogio.current.textContent = horaDe(estado.instante)
      if (apurado.current !== null) {
        apurado.current.textContent = `${doisDecimais.format(estado.pst)}% apurado`
      }
      if (barra.current !== null && document.activeElement !== barra.current) {
        barra.current.value = String(Math.round(estado.progresso * 1000))
      }
      if (marcas.current !== null) {
        const filhos = marcas.current.children
        for (let i = 0; i < filhos.length; i += 1) {
          const marca = filhos[i] as HTMLElement
          const quando = Number(marca.dataset.quando ?? '0')
          marca.dataset.passou = String(quando <= estado.instante)
        }
      }
      if (estado.evento !== null) {
        setEvento(estado.evento)
        ateQuando.current = performance.now() + 5200
      } else if (ateQuando.current > 0 && performance.now() > ateQuando.current) {
        ateQuando.current = 0
        setEvento(null)
      }
      if (estado.terminou) setTocando(false)
    },
    [],
  )

  useEffect(() => {
    if (pacote === null || canvas.current === null) return
    const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const criado = criarMotor({
      canvas: canvas.current,
      dados: pacote.dados,
      malha: pacote.malha,
      aoQuadro,
      reduzirMovimento: reduzir,
    })
    motor.current = criado
    setTocando(!reduzir)
    const aoRedimensionar = () => criado.redimensionar()
    window.addEventListener('resize', aoRedimensionar)
    return () => {
      window.removeEventListener('resize', aoRedimensionar)
      criado.destruir()
      motor.current = null
    }
  }, [pacote, aoQuadro])

  useEffect(() => {
    motor.current?.definirVariante(variante)
  }, [variante])

  useEffect(() => {
    motor.current?.definirDuracao(duracao)
  }, [duracao])

  useEffect(() => {
    if (tocando) motor.current?.tocar()
    else motor.current?.pausar()
  }, [tocando])

  useEffect(() => {
    if (legenda.current === null || dados === null) return
    legenda.current.textContent =
      variante === 'mapa'
        ? 'Cada ponto é um município, com área pelo eleitorado. Cada bolinha em voo vale cerca de ' +
          `${inteiro.format(Math.round(motor.current?.votosPorBolinha ?? 0))} votos. ` +
          `Os vasos vão até ${inteiro.format(dados.cap / 1e6)} milhões de votos.`
        : 'Cada bolha é um município, com área pelo eleitorado. A posição horizontal é o resultado ' +
          'final daquele município, não o resultado parcial do instante.'
  }, [variante, dados])

  if (erro !== null) {
    return (
      <p className="text-sm text-[var(--color-alerta)]">
        Não consegui carregar os dados da reprodução. Detalhe: {erro}
      </p>
    )
  }

  if (pacote === null || dados === null) {
    return (
      <p className="text-sm text-[var(--color-tinta-3)]">Carregando a reprodução…</p>
    )
  }

  const nomes = dados.candidatos.map((c) => nomeProprio(c.nomeUrna)).join(' e ')

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-[62ch] text-sm leading-relaxed text-[var(--color-tinta-2)]">
        A noite de apuração do 2º turno entre {nomes}, refeita instante a instante. Cada
        bolinha que parte de um município é um lote de votos entrando na conta nacional.
        Dentro de cada vaso, a faixa clara é a projeção do painel com o seu intervalo, que
        se estreita conforme a apuração avança.
      </p>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Forma da animação">
        {(
          [
            ['mapa', 'Mapa e vasos'],
            ['enxame', 'Enxame por margem'],
          ] as [Variante, string][]
        ).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={variante === id}
            onClick={() => setVariante(id)}
            className={
              `${classeAba} ` +
              (variante === id
                ? 'border-[var(--color-base)] bg-[var(--color-superficie)] text-[var(--color-tinta)]'
                : 'border-white/10 text-[var(--color-tinta-2)]')
            }
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[var(--color-superficie)]">
        <canvas ref={canvas} className="block w-full" />
        <div
          className={
            'pointer-events-none absolute inset-x-0 top-[104px] px-5 pt-6 pb-8 transition-opacity duration-300 ' +
            'md:top-0 md:right-[36%] md:pt-14 ' +
            (evento === null ? 'opacity-0' : 'opacity-100')
          }
          style={{
            background:
              'linear-gradient(to bottom, rgba(13,13,13,0.94) 0%, rgba(13,13,13,0.80) 52%, rgba(13,13,13,0) 100%)',
            maskImage: 'linear-gradient(to right, #000 58%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, #000 58%, transparent 100%)',
          }}
        >
          <span className="mb-1 block text-xs font-semibold tracking-[0.12em] text-[var(--color-alerta)] uppercase">
            {evento === null ? '' : horaDe(evento[0])}
          </span>
          <span className="block max-w-[24ch] text-xl leading-tight font-semibold text-balance text-[var(--color-tinta)] sm:text-2xl md:text-[2rem]">
            {evento?.[1] ?? ''}
          </span>
        </div>
      </div>

      <p ref={legenda} className="text-xs leading-relaxed text-[var(--color-tinta-3)]" />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setTocando((v) => !v)}
          className="min-w-[7rem] rounded-lg border border-[var(--color-base)] bg-[var(--color-superficie)] px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-tinta)]"
        >
          {tocando ? 'Pausar' : 'Reproduzir'}
        </button>
        <p className="tabular text-base font-semibold">
          <span ref={relogio}>{horaDe(dados.t[0])}</span>{' '}
          <span ref={apurado} className="text-xs font-normal text-[var(--color-tinta-3)]">
            0,00% apurado
          </span>
        </p>
        <input
          ref={barra}
          type="range"
          min={0}
          max={1000}
          defaultValue={0}
          aria-label="Instante da noite"
          onChange={(evt) => motor.current?.definirProgresso(Number(evt.target.value) / 1000)}
          className="min-w-[14rem] flex-1"
        />
        <label className="flex items-center gap-2 text-xs text-[var(--color-tinta-3)]">
          Duração
          <input
            type="range"
            min={30}
            max={180}
            step={10}
            value={duracao}
            aria-label="Duração da reprodução em segundos"
            onChange={(evt) => setDuracao(Number(evt.target.value))}
          />
          <span className="tabular">{duracao} s</span>
        </label>
      </div>

      <div
        ref={marcas}
        className="relative h-14 border-t border-[var(--color-grade)]"
        aria-hidden="true"
      >
        {dados.eventos.map((ev, i) => (
          <div
            key={ev[0]}
            data-quando={ev[0]}
            data-passou="false"
            className="absolute top-0 h-2.5 w-px bg-[var(--color-base)] data-[passou=true]:bg-[var(--color-alerta)]"
            style={{ left: `${posicoes[i] * 100}%` }}
          >
            <span
              className="absolute left-0 block -translate-x-1/2 text-[0.68rem] whitespace-nowrap text-[var(--color-tinta-3)]"
              style={{ top: `${13 + (i % 2) * 16}px` }}
            >
              {horaDe(ev[0])}
            </span>
          </div>
        ))}
      </div>

      <section className="border-t border-[var(--color-grade)] pt-4 text-sm leading-relaxed text-[var(--color-tinta-2)]">
        <h2 className="mb-2 text-xs font-semibold tracking-[0.08em] text-[var(--color-tinta-3)] uppercase">
          O que é medido e o que é reconstruído
        </h2>
        <p className="mb-2.5 max-w-[72ch]">
          <strong className="font-semibold text-[var(--color-tinta)]">Medido.</strong> O
          avanço da apuração de cada unidade federativa, ponto a ponto, vem da série que o
          coletor deste painel gravou durante a noite, a cada 60 segundos. O resultado final
          de cada município vem do arquivo do TSE. A hora em que cada seção entrou na
          totalização vem do arquivo de urna do TSE, que registra data e hora por seção.
        </p>
        <p className="mb-2.5 max-w-[72ch]">
          <strong className="font-semibold text-[var(--color-tinta)]">Reconstruído.</strong>{' '}
          O TSE não publica o resultado parcial de cada município ao longo da noite: publica
          apenas a fotografia corrente. A animação supõe que, dentro de um município, cada
          seção contribui com a mesma divisão de votos do município inteiro. A ordem em que
          as seções entram vem do arquivo de urna, enquanto a quantidade de seções contadas
          em cada instante é ajustada para bater com o percentual medido da unidade
          federativa naquele instante.
        </p>
        <p className="mb-2.5 max-w-[72ch]">
          <strong className="font-semibold text-[var(--color-tinta)]">Projeção.</strong> A
          faixa dentro de cada vaso é a projeção por variação entre turnos que o painel já
          calcula, gravada ponto a ponto pelo coletor. O valor em percentual vem dessa
          série, enquanto a conversão para votos usa o total final estimado no próprio
          instante, que é o volume já contado dividido pela cobertura registrada. A linha
          branca marca o resultado final de cada candidatura, de modo que dá para acompanhar
          a projeção se aproximando dela ao longo da noite.
        </p>
        <p className="mb-2.5 max-w-[72ch]">
          <strong className="font-semibold text-[var(--color-tinta)]">
            A faixa não é intervalo de confiança.
          </strong>{' '}
          Ela é a dispersão ponderada da variação entre as unidades federativas,
          multiplicada pela fração do eleitorado que falta apurar, portanto mede
          heterogeneidade entre unidades, não erro amostral. Medida contra o resultado desta
          noite, a faixa conteve o valor final em 36% dos instantes com cobertura acima de
          5%: acerta no começo da apuração, depois passa a errar. O motivo está documentado
          no próprio módulo de projeção: os municípios menores totalizam primeiro, o que
          desloca a projeção em cerca de nove décimos de ponto percentual, enquanto a faixa
          encolhe junto com o que falta apurar.
        </p>
        <p className="max-w-[72ch]">
          <strong className="font-semibold text-[var(--color-tinta)]">Exterior.</strong> Os
          votos do exterior entram como um grupo único, fora do mapa. O coletor nunca gravou
          a série da abrangência do exterior, apenas a das 27 unidades federativas, portanto
          o relógio desse grupo é o percentual nacional de seções. É a única parte da
          animação cujo instante não foi medido na própria abrangência.
        </p>
      </section>
    </div>
  )
}

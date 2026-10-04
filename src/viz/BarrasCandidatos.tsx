import { useState } from 'react'
import type { Candidatura } from '../tse/tipos'
import { corDaCandidatura, registrarOrdem } from './cores'

export interface BarrasCandidatosProps {
  candidaturas: Candidatura[]
  marca50?: boolean
}

const inteiro = new Intl.NumberFormat('pt-BR')
const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Largura da foto somada ao vao, usada para alinhar o rotulo da marca de 50%. */
const RECUO = 'pl-[3.25rem]'

/**
 * Barras horizontais ordenadas por voto.
 *
 * A cor vem de cores.ts e segue a candidatura: uma ultrapassagem reordena as
 * linhas, nunca a tinta. O percentual aparece em texto em toda linha, entao
 * nenhuma informacao depende de enxergar a barra ou a cor.
 */
export function BarrasCandidatos({ candidaturas, marca50 = true }: BarrasCandidatosProps) {
  const [fotoQuebrada, setFotoQuebrada] = useState<Record<string, boolean>>({})
  const [ativo, setAtivo] = useState<string | null>(null)

  // Idempotente e travado na primeira lista nao vazia. Fica no corpo do render
  // para que a primeira pintura ja saia com a cor definitiva.
  registrarOrdem(candidaturas)

  const ordenadas = [...candidaturas].sort((a, b) => b.votos - a.votos)

  return (
    <section aria-label="Votação por candidatura">
      <div className={`${RECUO} relative mb-2`}>
        <h2 className="text-sm font-medium text-[var(--color-tinta-3)]">
          Votos nominais apurados
        </h2>
        {marca50 && (
          <p
            className="absolute bottom-0 left-1/2 hidden -translate-x-1/2 text-xs text-[var(--color-tinta-3)] sm:block"
            aria-hidden="true"
          >
            50% dos votos válidos
          </p>
        )}
      </div>

      <ol className="space-y-1">
        {ordenadas.map((candidatura, posicao) => {
          const cor = corDaCandidatura(candidatura.numero)
          const largura = Math.max(0, Math.min(100, candidatura.percentual))
          const destacada = posicao < 3
          const rotuloInterno = largura > 88
          const aberta = ativo === candidatura.numero

          return (
            <li
              key={candidatura.numero}
              // O alvo de interacao e a linha inteira, muito maior que a marca
              // de 12px: ninguem precisa mirar na barra.
              className="relative rounded-lg px-2 py-2 outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[var(--color-tinta-2)] data-[aberta=true]:bg-white/5"
              data-aberta={aberta}
              tabIndex={0}
              onMouseEnter={() => setAtivo(candidatura.numero)}
              onMouseLeave={() => setAtivo((atual) => (atual === candidatura.numero ? null : atual))}
              onFocus={() => setAtivo(candidatura.numero)}
              onBlur={() => setAtivo((atual) => (atual === candidatura.numero ? null : atual))}
              aria-label={
                `${posicao + 1}º lugar: ${candidatura.nomeUrna}, ${candidatura.partido}, ` +
                `número ${candidatura.numero}, ${inteiro.format(candidatura.votos)} votos, ` +
                `${doisDecimais.format(candidatura.percentual)} por cento` +
                (candidatura.eleito ? ', eleito' : '')
              }
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 size-10 shrink-0 overflow-hidden rounded-md bg-[var(--color-grade)]"
                  aria-hidden="true"
                >
                  {candidatura.fotoUrl && !fotoQuebrada[candidatura.numero] ? (
                    <img
                      src={candidatura.fotoUrl}
                      alt=""
                      width={40}
                      height={40}
                      loading="lazy"
                      className="size-10 object-cover"
                      onError={() =>
                        setFotoQuebrada((atual) => ({ ...atual, [candidatura.numero]: true }))
                      }
                    />
                  ) : (
                    <span className="tabular flex size-10 items-center justify-center text-xs text-[var(--color-tinta-3)]">
                      {candidatura.numero}
                    </span>
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span
                        className="size-2 shrink-0 translate-y-px rounded-full"
                        style={{ backgroundColor: cor }}
                        aria-hidden="true"
                      />
                      <span className="tabular text-[var(--color-tinta-3)]">
                        {candidatura.numero}
                      </span>
                      <span className="truncate">{candidatura.nomeUrna}</span>
                      <span className="shrink-0 text-[var(--color-tinta-3)]">
                        {candidatura.partido}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-[var(--color-tinta-2)]">
                      {inteiro.format(candidatura.votos)}
                      <span className="ml-3 font-medium text-[var(--color-tinta)]">
                        {doisDecimais.format(candidatura.percentual)}%
                      </span>
                    </span>
                  </div>

                  <div className="relative mt-2">
                    <svg
                      viewBox="0 0 100 12"
                      preserveAspectRatio="none"
                      className="block h-3 w-full"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <rect x="0" y="0" width="100" height="12" fill="var(--color-grade)" />
                      {largura > 0 && (
                        <rect x="0" y="0" width={largura} height="12" fill={cor} />
                      )}
                      {marca50 && (
                        <line
                          x1="50"
                          x2="50"
                          y1="0"
                          y2="12"
                          stroke="var(--color-base)"
                          strokeWidth="1"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    </svg>

                    {destacada && (
                      <span
                        className="tabular pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs font-medium"
                        style={
                          rotuloInterno
                            ? { right: '0.375rem', color: 'var(--color-plano)' }
                            : { left: `calc(${largura}% + 0.375rem)`, color: 'var(--color-tinta)' }
                        }
                        aria-hidden="true"
                      >
                        {doisDecimais.format(candidatura.percentual)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {aberta && (
                <div
                  className="tabular absolute left-2 right-2 top-full z-10 mt-1 rounded-md border border-white/10 bg-[var(--color-superficie)] px-3 py-2 text-xs text-[var(--color-tinta-2)] shadow-lg"
                  aria-hidden="true"
                >
                  <span className="font-medium text-[var(--color-tinta)]">
                    {inteiro.format(candidatura.votos)} votos
                  </span>
                  <span className="mx-2 text-[var(--color-tinta-3)]">·</span>
                  {doisDecimais.format(candidatura.percentual)}% dos votos válidos
                  <span className="mx-2 text-[var(--color-tinta-3)]">·</span>
                  {candidatura.nomeCompleto}
                  {candidatura.eleito && (
                    <span className="ml-2 text-[var(--color-alerta)]">Eleito</span>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {marca50 && (
        <p className="mt-3 text-xs text-[var(--color-tinta-3)]">
          A marca vertical no meio de cada barra indica 50% dos votos válidos. Acima desse
          limite a eleição se decide em primeiro turno.
        </p>
      )}
    </section>
  )
}

export default BarrasCandidatos

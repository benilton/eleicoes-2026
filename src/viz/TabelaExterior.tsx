import { useMemo, useState } from 'react'
import type { Municipio, ResumoTurno } from '../dados/primeiroTurno'
import type { Apuracao } from '../tse/tipos'
import { corDaCandidatura } from './cores'

export interface TabelaExteriorProps {
  postos: Municipio[]
  porPosto: Record<string, Apuracao>
  /** Resultado final do 1o turno de cada posto, pelo codigo. */
  primeiroDe: (codigo: string) => ResumoTurno | null
  /** Numeros das candidaturas, na ordem de apresentacao. */
  numeros: string[]
  nomeDe: (numero: string) => string
  carregados: number
  total: number
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

interface Linha {
  codigo: string
  nome: string
  apurado: number
  secoes: string
  votos: Record<string, number>
  pct: Record<string, number>
  pctAntes: Record<string, number | null>
}

/**
 * Tabela dos postos de votacao no exterior.
 *
 * Os postos com apuracao iniciada sobem para o topo, porque e neles que ha o
 * que ler. O filtro por texto serve de busca por cidade enquanto a fonte do
 * TSE nao traz o pais de cada posto.
 */
export default function TabelaExterior({
  postos,
  porPosto,
  primeiroDe,
  numeros,
  nomeDe,
  carregados,
  total,
}: TabelaExteriorProps) {
  const [filtro, setFiltro] = useState('')
  const [soComApuracao, setSoComApuracao] = useState(true)

  const linhas = useMemo(() => {
    const saida: Linha[] = []
    for (const [codigo, nome] of postos) {
      const apuracao = porPosto[codigo]
      const antes = primeiroDe(codigo)
      const votos: Record<string, number> = {}
      const pct: Record<string, number> = {}
      const pctAntes: Record<string, number | null> = {}
      for (const numero of numeros) {
        const candidatura = apuracao?.candidaturas.find((c) => c.numero === numero)
        votos[numero] = candidatura?.votos ?? 0
        pct[numero] = candidatura?.percentual ?? 0
        const votosAntes = antes?.porNumero[numero]
        pctAntes[numero] =
          antes && votosAntes !== undefined ? parte(votosAntes, antes.votosNominais) : null
      }
      saida.push({
        codigo,
        nome,
        apurado: apuracao?.percentualSecoes ?? 0,
        secoes: apuracao
          ? `${inteiro.format(apuracao.secoesTotalizadas)} de ${inteiro.format(apuracao.secoesTotais)}`
          : '—',
        votos,
        pct,
        pctAntes,
      })
    }
    return saida
  }, [postos, porPosto, primeiroDe, numeros])

  const visiveis = useMemo(() => {
    const alvo = filtro.trim().toLocaleUpperCase('pt-BR')
    return linhas
      .filter((l) => (alvo.length === 0 ? true : l.nome.toLocaleUpperCase('pt-BR').includes(alvo)))
      .filter((l) => (soComApuracao ? l.apurado > 0 : true))
      .sort((a, b) => b.apurado - a.apurado || a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [linhas, filtro, soComApuracao])

  const comApuracao = linhas.filter((l) => l.apurado > 0).length

  return (
    <section aria-label="Resultado por posto de votação no exterior">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-[var(--color-tinta-3)]">
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar por posto, por exemplo LISBOA"
          aria-label="Filtrar postos pelo nome"
          className="rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-sm text-[var(--color-tinta)] placeholder:text-[var(--color-tinta-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-tinta)]"
        />
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={soComApuracao}
            onChange={(e) => setSoComApuracao(e.target.checked)}
          />
          Só postos com apuração iniciada
        </label>
        <span className="tabular ml-auto">
          {comApuracao} de {postos.length} postos com apuração · {carregados} de {total} lidos
        </span>
      </div>

      {visiveis.length === 0 ? (
        <p className="text-sm text-[var(--color-tinta-3)]">
          {soComApuracao
            ? 'Nenhum posto com apuração iniciada até agora. O TSE começa a publicar o exterior junto com a totalização no Brasil.'
            : 'Nenhum posto corresponde ao filtro.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabular w-full border-collapse text-sm">
            <caption className="sr-only">
              Votos por posto de votação no exterior, com o percentual do 1º turno ao lado
            </caption>
            <thead>
              <tr className="text-xs text-[var(--color-tinta-3)]">
                <th className="py-2 pr-3 text-left font-normal">Posto</th>
                <th className="py-2 pr-3 text-right font-normal">Seções</th>
                {numeros.map((numero) => (
                  <th key={numero} className="py-2 pr-3 text-right font-normal">
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ backgroundColor: corDaCandidatura(numero) }}
                      aria-hidden="true"
                    />
                    {nomeDe(numero)} {numero}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((linha) => (
                <tr key={linha.codigo} className="border-t border-white/10">
                  <td className="py-2 pr-3 text-left">{linha.nome}</td>
                  <td className="py-2 pr-3 text-right text-[var(--color-tinta-3)]">
                    {doisDecimais.format(linha.apurado)}%
                    <span className="ml-1.5 text-[var(--color-tinta-3)]">{linha.secoes}</span>
                  </td>
                  {numeros.map((numero) => {
                    const antes = linha.pctAntes[numero]
                    const delta = antes === null ? null : linha.pct[numero] - antes
                    return (
                      <td key={numero} className="py-2 pr-3 text-right">
                        <div>{doisDecimais.format(linha.pct[numero])}%</div>
                        <div className="text-xs text-[var(--color-tinta-3)]">
                          {inteiro.format(linha.votos[numero])} votos
                        </div>
                        <div className="text-xs text-[var(--color-tinta-3)]">
                          1º turno {antes === null ? '—' : `${doisDecimais.format(antes)}%`}
                          {delta !== null && linha.apurado > 0 && (
                            <b className="ml-1 font-semibold text-[var(--color-tinta-2)]">
                              {comSinal.format(delta)}
                            </b>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

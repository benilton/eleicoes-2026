import type { Apuracao } from '../tse/tipos'

export interface TabelaCompletaProps {
  apuracao: Apuracao
}

const inteiro = new Intl.NumberFormat('pt-BR')
const doisDecimais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const celula = 'px-3 py-2 align-baseline'
const cabecalho =
  'px-3 py-2 text-left font-medium text-[var(--color-tinta-3)] border-b border-white/10'
const numerica = `${celula} tabular text-right`

/**
 * Tabela com todos os numeros em texto.
 *
 * E o caminho de acesso que nao depende de cor nem de enxergar figura alguma:
 * tudo o que as barras e as linhas mostram esta aqui, escrito, com algarismos
 * tabulares para que as colunas alinhem.
 */
export function TabelaCompleta({ apuracao }: TabelaCompletaProps) {
  const ordenadas = [...apuracao.candidaturas].sort((a, b) => b.votos - a.votos)

  return (
    <section aria-label="Tabela completa da apuração" className="space-y-8">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="mb-2 text-left text-sm font-medium text-[var(--color-tinta-3)]">
            Votação por candidatura, em ordem decrescente de votos. Percentual calculado
            sobre os votos válidos apurados até o momento.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`${cabecalho} w-12`}>
                Nº
              </th>
              <th scope="col" className={cabecalho}>
                Candidatura
              </th>
              <th scope="col" className={cabecalho}>
                Partido
              </th>
              <th scope="col" className={`${cabecalho} text-right`}>
                Votos
              </th>
              <th scope="col" className={`${cabecalho} text-right`}>
                % válidos
              </th>
              <th scope="col" className={`${cabecalho} text-right`}>
                Situação
              </th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((candidatura) => (
              <tr key={candidatura.numero} className="border-b border-white/5">
                <td className={`${celula} tabular text-[var(--color-tinta-3)]`}>
                  {candidatura.numero}
                </td>
                <th scope="row" className={`${celula} text-left font-normal`}>
                  {candidatura.nomeUrna}
                  <span className="block text-xs text-[var(--color-tinta-3)]">
                    {candidatura.nomeCompleto}
                  </span>
                </th>
                <td className={`${celula} text-[var(--color-tinta-2)]`}>
                  {candidatura.partido}
                </td>
                <td className={numerica}>{inteiro.format(candidatura.votos)}</td>
                <td className={`${numerica} font-medium`}>
                  {doisDecimais.format(candidatura.percentual)}%
                </td>
                <td className={`${celula} text-right text-[var(--color-tinta-2)]`}>
                  {candidatura.eleito ? 'Eleito' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="mb-2 text-left text-sm font-medium text-[var(--color-tinta-3)]">
            Totais da apuração, conforme o arquivo gerado pelo TSE em {apuracao.geradoEm}.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={cabecalho}>
                Indicador
              </th>
              <th scope="col" className={`${cabecalho} text-right`}>
                Quantidade
              </th>
              <th scope="col" className={`${cabecalho} text-right`}>
                Percentual
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-white/5">
              <th scope="row" className={`${celula} text-left font-normal`}>
                Seções totalizadas
              </th>
              <td className={numerica}>
                {inteiro.format(apuracao.secoesTotalizadas)} de{' '}
                {inteiro.format(apuracao.secoesTotais)}
              </td>
              <td className={numerica}>{doisDecimais.format(apuracao.percentualSecoes)}%</td>
            </tr>
            <tr className="border-b border-white/5">
              <th scope="row" className={`${celula} text-left font-normal`}>
                Eleitores aptos
              </th>
              <td className={numerica}>{inteiro.format(apuracao.eleitoresAptos)}</td>
              <td className={numerica}>—</td>
            </tr>
            <tr className="border-b border-white/5">
              <th scope="row" className={`${celula} text-left font-normal`}>
                Comparecimento
              </th>
              <td className={numerica}>{inteiro.format(apuracao.comparecimento)}</td>
              <td className={numerica}>
                {doisDecimais.format(apuracao.percentualComparecimento)}%
              </td>
            </tr>
            <tr className="border-b border-white/5">
              <th scope="row" className={`${celula} text-left font-normal`}>
                Abstenção
              </th>
              <td className={numerica}>{inteiro.format(apuracao.abstencao)}</td>
              <td className={numerica}>
                {doisDecimais.format(apuracao.percentualAbstencao)}%
              </td>
            </tr>
            <tr className="border-b border-white/5">
              <th scope="row" className={`${celula} text-left font-normal`}>
                Votos válidos
              </th>
              <td className={numerica}>{inteiro.format(apuracao.votosValidos)}</td>
              <td className={numerica}>—</td>
            </tr>
            <tr className="border-b border-white/5">
              <th scope="row" className={`${celula} text-left font-normal`}>
                Votos em branco
              </th>
              <td className={numerica}>{inteiro.format(apuracao.votosBrancos)}</td>
              <td className={numerica}>—</td>
            </tr>
            <tr className="border-b border-white/5">
              <th scope="row" className={`${celula} text-left font-normal`}>
                Votos nulos
              </th>
              <td className={numerica}>{inteiro.format(apuracao.votosNulos)}</td>
              <td className={numerica}>—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default TabelaCompleta

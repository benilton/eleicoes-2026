import type { ReactNode } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { COBERTURA_CONFIAVEL, COBERTURA_MINIMA } from '../analise/swing'

const pct = (fracao: number) => `${(fracao * 100).toFixed(0)}%`

/**
 * Formula em bloco, composta pelo KaTeX.
 *
 * O TeX e escrito aqui no proprio modulo, nunca vem de fora, entao a
 * insercao de HTML e segura. Este arquivo e carregado sob demanda: a folha de
 * estilo e as fontes do KaTeX so chegam ao visitante que abrir esta guia.
 */
function Bloco({ tex }: { tex: string }) {
  const html = katex.renderToString(tex, {
    displayMode: true,
    throwOnError: false,
    strict: false,
  })
  return (
    <div
      className="overflow-x-auto rounded-lg border border-white/10 bg-[var(--color-superficie)] px-4 py-3"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** Formula no meio da frase. */
function Linha({ tex }: { tex: string }) {
  const html = katex.renderToString(tex, { throwOnError: false, strict: false })
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-[var(--color-tinta)]">{titulo}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-[var(--color-tinta-2)]">
        {children}
      </div>
    </section>
  )
}

/**
 * Metodologia da projecao, escrita para quem vai conferir a conta.
 *
 * Os dois limiares citados sao importados de analise/swing.ts, para que a
 * pagina nao descreva parametros diferentes dos que o codigo usa.
 */
export default function Metodologia() {
  return (
    <div className="max-w-3xl space-y-10">
      <Secao titulo="O problema que a projeção resolve">
        <p>
          O percentual nacional corrente não é uma estimativa do resultado final.
          Ele é a proporção de votos entre as seções que já foram totalizadas, e
          essas seções não formam uma amostra aleatória do país. As unidades
          federativas totalizam em ritmos diferentes, então o número bruto reflete
          a composição do que já foi apurado, não a do eleitorado.
        </p>
        <p>
          O efeito é grande no início da noite. Às 17h41 de 25 de outubro de 2026,
          com 0,25% das seções totalizadas e a apuração concentrada no Pará, no
          Maranhão, na Bahia, em Goiás e no Ceará, o arquivo nacional do TSE
          marcava 57,66% para a candidatura 13. A projeção, na mesma hora,
          devolvia 48,98%, e a diferença de quase nove pontos era inteiramente
          viés de composição.
        </p>
        <p>
          A correção clássica é a pós-estratificação: dar a cada unidade o peso do
          eleitorado dela, não o peso dos votos que já chegaram. A projeção desta
          página vai um passo além, usando o resultado final do 1º turno como
          linha de base de cada unidade. O que se estima deixa de ser o nível e
          passa a ser a variação entre os dois turnos.
        </p>
      </Secao>

      <Secao titulo="O estimador">
        <p>
          Seja <Linha tex="i" /> uma unidade federativa,{' '}
          <Linha tex="p^{(1)}_i" /> a proporção da candidatura no 1º turno naquela
          unidade, <Linha tex="p^{(2)}_i" /> a proporção corrente do 2º turno e{' '}
          <Linha tex="f_i \in [0,1]" /> a fração de seções já totalizadas ali. A
          quantidade de interesse é a variação, não o nível:
        </p>
        <Bloco tex="\delta_i \;=\; p^{(2)}_i - p^{(1)}_i" />
        <p>
          A variação é muito mais homogênea entre unidades do que o próprio nível,
          que é o motivo de ela servir de base. A variação comum sai de uma média
          ponderada sobre as unidades que já apuraram o bastante, com peso igual ao
          volume de votos nominais da unidade no 1º turno, <Linha tex="V_i" />,
          multiplicado pela fração já totalizada:
        </p>
        <Bloco tex="w_i \;=\; V_i\,f_i \qquad\qquad \hat{\delta} \;=\; \frac{\sum_i w_i\,\delta_i}{\sum_i w_i}" />
        <p>
          Com a variação comum em mãos, cada unidade recebe uma projeção própria.
          A parte já apurada entra pelo que foi observado, e a parte que falta é
          imputada pelo nível daquela unidade no 1º turno somado à variação comum.
          O resultado nacional é a média ponderada pelo volume de votos:
        </p>
        <Bloco tex="\hat{p}_i \;=\; f_i\,p^{(2)}_i \;+\; (1-f_i)\left(p^{(1)}_i + \hat{\delta}\right)" />
        <Bloco tex="\hat{p} \;=\; \frac{\sum_i V_i\,\hat{p}_i}{\sum_i V_i}" />
      </Secao>

      <Secao titulo="Os pesos e as escolhas de parâmetro">
        <p>
          O peso <Linha tex="V_i" /> é o total de votos nominais da unidade no 1º
          turno. Um fator comum de variação de comparecimento entre os dois turnos
          se cancela na razão, então ele não entra na conta. Variação de
          comparecimento específica de uma unidade não é corrigida, e isso está
          listado entre as limitações abaixo.
        </p>
        <p>
          Unidades com <Linha tex={`f_i < ${COBERTURA_MINIMA}`} /> ficam fora do
          cálculo da variação comum. O motivo é que, com pouca apuração, as seções
          já contadas vêm dos municípios menores, que totalizam primeiro, de modo
          que a variação observada ali ainda carrega viés interno. As unidades que
          entram são ponderadas por <Linha tex="f_i" />, o que dá peso maior a
          quem já apurou mais.
        </p>
        <p>
          A projeção só é rotulada como estimativa quando a cobertura de volume
          passa de {pct(COBERTURA_CONFIAVEL)} e pelo menos cinco unidades entram
          no cálculo da variação. Abaixo disso a página exibe um aviso de que
          aquilo é indicação de direção. No limite inicial, com{' '}
          <Linha tex="\hat{\delta} = 0" />, a projeção é o resultado do 1º turno
          reponderado entre as duas candidaturas que foram ao returno.
        </p>
      </Secao>

      <Secao titulo="A faixa, e o que ela não é">
        <p>
          A faixa exibida ao lado de cada projeção é a dispersão ponderada das
          variações observadas, multiplicada pela fração do volume que ainda não
          foi apurada. Escrevendo <Linha tex="c" /> para a cobertura, ou seja a
          fração do volume de votos já totalizada:
        </p>
        <Bloco tex="s \;=\; \sqrt{\frac{\sum_i w_i\left(\delta_i - \hat{\delta}\right)^2}{\sum_i w_i}} \qquad\qquad \text{faixa} \;=\; s\,(1-c)" />
        <p>
          Essa faixa mede heterogeneidade da variação entre unidades. Ela não é
          intervalo de confiança, porque o erro dominante aqui não é amostral, e
          não é probabilidade de vitória, porque isso exigiria modelar a
          correlação entre o que falta apurar, coisa que uma eleição só não
          permite estimar.
        </p>
        <p>
          A leitura honesta é a seguinte: se a variação nas unidades que faltam se
          parecer com a variação já observada, o resultado deve cair dentro da
          faixa. Se a ordem de apuração estiver correlacionada com a variação, o
          resultado pode cair fora, e a faixa não avisa.
        </p>
      </Secao>

      <Secao titulo="Limitações conhecidas">
        <p>
          O estrato é a unidade federativa. Dentro de cada unidade os municípios
          pequenos totalizam antes dos grandes, então a variação observada numa
          unidade parcialmente apurada ainda tem viés de composição interna. O
          limiar de {pct(COBERTURA_MINIMA)} e a ponderação por{' '}
          <Linha tex="f_i" /> atenuam esse resíduo, mas não o eliminam.
        </p>
        <p>
          A troca do estrato de unidade federativa para município resolveria esse
          ponto, porque cada município não apurado passaria a ser imputado pelo
          próprio nível dele no 1º turno. O resultado final do 1º turno dos 5.570
          municípios já está congelado neste repositório. O que falta é a leitura
          ao vivo dos 5.570 arquivos, que não cabe no navegador do visitante e
          exigiria uma varredura do lado do servidor.
        </p>
        <p>
          Há ainda duas hipóteses embutidas que convém declarar. A primeira é que
          a variação é comum a todas as unidades, quando na prática ela tem
          estrutura regional que o modelo atual não separa. A segunda é que a
          mudança de comparecimento entre turnos é uniforme, o que deixa de valer
          se alguma região tiver abstenção muito diferente da do 1º turno.
        </p>
      </Secao>

      <Secao titulo="Dados usados">
        <p>
          O 2º turno vem da divulgação oficial do TSE, lida diretamente pelo
          navegador de cada visitante, sem servidor intermediário. O arquivo
          nacional e o de cada unidade federativa são os mesmos que alimentam o
          restante do painel.
        </p>
        <p>
          O 1º turno não é consultado ao vivo. Ele foi baixado da mesma divulgação
          oficial depois do encerramento da totalização e está congelado no
          repositório, cobrindo o Brasil, as 27 unidades federativas, os 5.570
          municípios e os 186 postos do exterior. Como o resultado do 1º turno não
          muda mais, isso torna a comparação instantânea e reduz pela metade as
          consultas ao TSE.
        </p>
        <p>
          O código do estimador está em <code>src/analise/swing.ts</code>, e os
          dois limiares citados nesta página são importados de lá. Quem quiser
          conferir a conta pode ler o arquivo e reproduzir os números a partir dos
          mesmos arquivos públicos do TSE.
        </p>
      </Secao>
    </div>
  )
}

# Apuração 2026

Painel de acompanhamento da apuração das Eleições Gerais de 2026, para o cargo de
Presidente da República, com extensão prevista para Governador por unidade
federativa.

**Projeto independente, sem vínculo com a Justiça Eleitoral.** Os números são
publicados pelo Tribunal Superior Eleitoral. A fonte oficial é
[resultados.tse.jus.br](https://resultados.tse.jus.br).

## Como funciona

O site é estático. O navegador de cada visitante consulta diretamente os arquivos
JSON de divulgação do TSE, sem servidor intermediário. A atualização ocorre a cada
sessenta segundos, com deduplicação pelo identificador de geração do arquivo.

## Desenvolvimento

```bash
npm install
npm run dev
```

O build de produção usa `base: '/eleicoes-2026/'` no `vite.config.ts`, porque o
GitHub Pages serve o site em um subdiretório. Alterar o nome do repositório exige
alterar esse valor.

```bash
npm run build
npm run preview
```

## Publicação

O deploy é feito pelo workflow `.github/workflows/deploy.yml` a cada push na branch
`main`. É necessário definir, em Settings, Pages, a origem como GitHub Actions.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `src/tse/` | contratos, montagem de URLs, cliente HTTP e normalização |
| `src/estado/` | agendador de coleta e estado da apuração |
| `src/viz/` | componentes de visualização |
| `src/ui/` | estrutura de página e controles |
| `fixtures/` | respostas reais do TSE, para desenvolvimento fora do período de apuração |

## Fonte dos dados

Arquivo de resultado unificado, especificação EA20 do TSE:

```
https://resultados.tse.jus.br/oficial/ele2026/{eleicao}/dados/{uf}/{uf}-c{cargo}-e{eleicao}-u.json
```

O TSE limita o acesso a cem requisições por segundo por endereço IP. O cliente
aplica teto próprio de uma requisição por alvo a cada trinta segundos.

Documentação técnica:
[Informações técnicas sobre a divulgação de resultados 2026](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados).

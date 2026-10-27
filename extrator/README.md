# Extrator de vereadores eleitos — somente eleição de 2004

Esta versão processa exclusivamente a eleição de 2004. Mantém os filtros por
estado e município e a regra específica para associar as fotos históricas aos
vereadores eleitos. Não baixa nem processa as eleições de 2008 a 2024.

## Instalação

Instale o Node.js 18 ou superior e execute na pasta do programa:

```cmd
npm install
```

## Brasil inteiro (26 estados, somente 2004)

```cmd
node extrair-estado.js --all
```

O Distrito Federal não entra porque não possui eleições municipais.

## Um estado (somente 2004)

```cmd
node extrair-estado.js --uf SC
```

## Um município (somente 2004)

```cmd
node extrair-estado.js --uf SC --municipio "Tijucas"
```

Sem argumentos, o estado padrão é MG. O comando `npm start` também processa MG.

## Arquivos gerados

- Fotos: `fotos_vereadores_UF/MUNICIPIO/2004/NOME_DO_VEREADOR.ext`
- Relatório: `fotos_vereadores_UF/vereadores_eleitos_UF.csv`
- Downloads reutilizáveis: `trabalho_tse_uf/2004/`

O CSV contém os dados dos eleitos e indica as fotos não encontradas.
Mesmo ao selecionar um município, o programa baixa os pacotes de candidaturas
e fotos necessários e extrai somente as fotos dos eleitos desse município.
Fotos já extraídas de outros anos não são apagadas.

## NOVO: extrair usando pastas locais por estado

Não depende de acesso ao TSE durante a extração local. Execute `npm install`
uma vez para instalar suporte a Excel. Depois abra `EXTRAIR-PASTAS.bat` e informe
UF, ano e os caminhos das duas pastas, sem aspas. O ano padrão é 2004.

Alternativa pelo terminal:

```cmd
node extrair-pastas.js --uf RS --ano 2004 --planilhas "C:\Dados\RS\Planilhas" --fotos "C:\Dados\RS\Fotos"
```

Filtro opcional: `--municipio "Erechim"`. Saída opcional: `--saida "C:\Resultados\RS"`.

- Aceita CSV e XLSX, lendo subpastas. XLS antigo precisa ser convertido para XLSX.
- Descompacte os ZIPs da consulta e das fotos antes de começar.
- Use a consulta de candidatos do mesmo ano das fotos, com os cabeçalhos do TSE.
- Filtra UF, ano, cargo VEREADOR e resultado eleito; deduplica candidatos.
- Em 2004 associa F + UF + unidade eleitoral + identificador do candidato + _div.
- Não associa por nome nem por número de urna isolado.
- Fotos duplicadas com o mesmo identificador ficam como ambíguas para revisão.
- Copia as fotos, preservando os arquivos originais e sua resolução.
- Nome da foto contém somente o nome completo, sem identificador no final.
- Homônimos no mesmo município ficam em subpastas HOMONIMOS/identificador, preservando o nome das fotos.
- Gera `fotos_eleitos_RS_2004/MUNICIPIO/2004/` e relatório CSV na raiz da saída.
- Para outros anos, a busca usa tokens numéricos do identificador sequencial e
  exige uma única correspondência; formatos históricos diferentes podem exigir ajustes.
- A consulta de 2022 não contém vereadores eleitos em 2004 e será rejeitada nesse fluxo.

# Verificação — JP Minato 1.23.2

Caso recebido: diagnóstico Tenente Portela, prompt custom revisão 2, 2 chamadas/respostas IA, página Contatos seguida de Presidente, sem falha de rede. Arquivo antigo não registra candidato/resposta nem prova bruta; não permite afirmar se o modelo retornou null ou se a validação o rejeitou. Rótulo 1.22 era string fixa no exportador, não prova da versão Python ativa.

Texto público conferido: https://www.cmtenenteportela.rs.gov.br/site/conteudos/1680-ppresidentep — Presidente em Exercício / 2026; Vereadora Micheli Vargas PDT; Fone (55) 9.9166-5758. O teste anterior com candidato correto retornava name_accepted=false, period_accepted=false, phone_accepted=false. Esse defeito foi reproduzido independentemente de chamada IA.

Mudanças:
- Associação nome/cargo permite até dois anos 20xx entre cargo e nome; demais números e palavras de pessoas/cargos diferentes continuam bloqueados. Validação do período continua exigindo ano solicitado, citação literal e fonte válida; não presume exercício antigo como atual.
- Removida segunda verificação redundante de nome/cargo que rejeitava ano entre eles mesmo após identificação correta. Etiqueta Presidente também pode qualificar ano; publicação/data de atualização e legislatura continuam excluídas.
- Prova de telefone admite primeiro dígito separado por ponto/espaço/traço, como 9.9166-5758, comparando número integral normalizado e sem inferir WhatsApp.
- Navegação observada por link exatamente Presidente/Presidência pode classificar a página como ficha de presidência mesmo com purpose mesa. Não usa domínio externo nem URL não observada. Duplicados institucionais continuam filtrados.
- Resultado/diagnóstico armazenam candidato, período, citação curta e decisões da validação; navegação registra quantidade de caracteres e classificação/períodos lidos. Persistido em presidency_validation.decision e navigation.validation. Não contém chave/model reasoning. Exportador usa versão correta 1.23.2.
- Prompt personalizado não é substituído. Protocolo esclarece precedência do schema e dados reais no payload sobre placeholders/JSON de saída da estratégia. GUIA-EXTRACAO e PROMPT-ESTRATEGIA incluídos.

Testes:
- Suíte completa Python com novos casos do ano entre cargo/nome, telefone pontuado, vice/ano antigo/pessoa vizinha, publicação/legislatura, ausência de candidato versus citação rejeitada, telefone errado e fluxo direto Presidência visitado como Mesa.
- Chromium com Python/Node/SQLite temporários: texto de presidência no formato do caso, link Presidente visitado como Mesa, duas respostas API simuladas, nome/partido/período 2026/telefone gravados, confirmed=true, nenhum WhatsApp inventado, revisão 4 do prompt personalizado comprovada e novo diagnóstico com candidato/citação/validações verdadeiras. Editor/histórico/race/falhas 503/404 preservados; zero erros JavaScript.
- Teste Node da interface e sintaxes Python/JS aprovados. Sem chamada paga OpenAI, chave real, conta/mensagem ou banco de produção. O site público foi lido pela ferramenta de consulta; não foi feita extração real com a chave do usuário. Windows/VBS, menu nativo e VPN física não executados.

Pacote completo incorpora 1.23.1; interface/servidor/iniciador 1.23.2, estratégia padrão identificada como 1.23, extensão 1.16.1. Preservar dados/chaves/prompt, reiniciar servidor após mesclar todos os arquivos e executar uma nova extração. Resultado anterior não é recalculado ao instalar.

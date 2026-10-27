# Verificação 1.24 — Envio por destinatário

- Dois blocos Câmara/Presidente, com seções WhatsApp/e-mail e modelos próprios, mantendo contatos, seleção padrão, prioridade dos celulares e avisos de duplicidade. Contato manual recolhido em seção opcional.
- Botão Enviar individual branco antes do registro e verde após gravar. Persistência via histórico existente; desmarcar registro retira o verde, sem apagar o histórico. Pendência de gravação fica amarela e permite repetir sem abrir outra conversa.
- Lote por bloco/canal não inclui contatos do outro papel nem contato manual. Botão manual envia somente o contato manual.
- Suíte Python: 278 testes executados, OK (1 ignorado por condição de ambiente), após instalar e compilar o motor Node.
- Teste DOM com LinkeDOM executa as funções reais de montagem, modelos, fila e pintura: quatro seções, contatos/modelos corretos, seleção padrão, abertura e registro, lote isolado, reabertura, desmarcação, falha de gravação/repetição e popup bloqueado. APIs de persistência e abertura de janela simuladas; nenhum envio real.
- Sintaxe JavaScript e Python, arquivos e integridade do ZIP conferidos. Windows e envio/entrega reais não executados neste ambiente. Nenhuma migração ou exclusão de dados. Extensão sem mudança.

Atualização: parar o servidor, copiar dados inteiros para backup, mesclar todo o conteúdo de mvp-jp-minato na pasta atual, preservando dados, iniciar e Ctrl+F5.

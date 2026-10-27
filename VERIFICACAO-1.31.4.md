# Verificação 1.31.4

333 testes Python executados; OK, um ignorado. Dois novos cenários verificam preenchimento automático de e-mail, reaproveitamento da senha, ausência de cópia da senha para credencial IMAP, troca posterior da conta/senha SMTP, servidor IMAP preservado e falta de credencial. Sintaxe de web/inbox131.js conferida com Node. Testes sem conexão a conta de e-mail real; nenhum envio ou leitura de caixa do usuário. Interface não foi retestada em navegador real nesta alteração.

O modo vinculado já existente passa a compartilhar também o endereço da conta, preenchido e somente leitura na tela de recebimento. Credenciais são obtidas da configuração de envio na conexão. Servidor IMAP e SMTP permanecem separados, sem adivinhar endereço do provedor. Configurações independentes antigas são preservadas; conta vinculada é padrão e recomendada. Dados e mensagens importadas não são excluídos.

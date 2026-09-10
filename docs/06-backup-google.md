# Configuração do backup Google

A PWA pode enviar snapshots do histórico para a pasta privada `appDataFolder` da conta Google. Essa pasta não aparece no Google Drive nem é acessível por outros aplicativos.

## Configurar uma vez

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie ou selecione um projeto pessoal.
2. Em **APIs e serviços → Biblioteca**, habilite **Google Drive API**.
3. Em **APIs e serviços → Tela de consentimento OAuth**, configure o app para uso externo/pessoal e adicione seu próprio e-mail como usuário de teste enquanto o app não estiver publicado.
4. Em **Credenciais → Criar credenciais → ID do cliente OAuth**, selecione **Aplicativo da Web**.
5. Em **Origens JavaScript autorizadas**, adicione a origem do GitHub Pages, por exemplo `https://SEU_USUARIO.github.io`. Não inclua o caminho `/shape/` nesse campo.
6. Copie o **ID do cliente** para `app/google-config.mjs`, na constante `GOOGLE_CLIENT_ID`. O Client ID é público; nunca copie ou publique um client secret.
7. Publique a versão atualizada no GitHub Pages. Na aba **Dados** da app, toque em **Conectar ao Google** e aprove o acesso solicitado.

## Como funciona

- O único escopo solicitado é `drive.appdata`, limitado à pasta privada desta PWA.
- O primeiro backup é criado na conexão. Depois, cada treino concluído cria uma versão automaticamente enquanto houver internet e a autorização estiver válida.
- São mantidas as 7 versões mais recentes. A restauração é manual e substitui o banco local após duas confirmações.
- O token do Google vive apenas na memória do navegador; ao expirar, toque em **Fazer backup agora** ou **Autorizar Google novamente**.
- Sem internet ou autorização válida, o treino continua salvo no iPhone e a app marca o backup como pendente.

## Cuidados

Use também a exportação JSON local como cópia adicional. Se você remover o acesso da PWA na conta Google, desinstalar a app/dados dela no Drive ou apagar o histórico no Safari antes de restaurar, poderá perder cópias que não tenham sido exportadas.

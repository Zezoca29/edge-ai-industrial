# Roteiro da demonstração — alertas no celular

O push exige contexto seguro. `localhost` serve para o notebook; o celular
precisa de HTTPS de verdade, e por isso a demonstração usa um túnel.

## Antes de começar

1. Suba a infraestrutura: `docker compose up -d`
2. Suba o backend: `cd backend`, `.\gradlew.bat bootRun`
3. Suba o frontend: `cd frontend`, `npm run dev`
4. Suba o túnel apontando para a porta 3000:
   `cloudflared tunnel --url http://localhost:3000`
5. Anote a URL HTTPS que o túnel imprimiu.

## Gerar as chaves VAPID (uma vez só)

Com Node instalado:

    npx web-push generate-vapid-keys

Exporte antes de subir o backend, **sem commitar**:

    $env:PUSH_VAPID_PUBLIC_KEY  = "<chave publica>"
    $env:PUSH_VAPID_PRIVATE_KEY = "<chave privada>"

Sem as chaves o sistema continua funcionando: os alertas são gravados e
aparecem na tela, apenas não viram notificação.

## No celular, a cada nova sessão de túnel

A inscrição de push é vinculada à origem, e a URL do túnel muda a cada vez.
Então, **toda vez**:

1. Abra a URL do túnel no celular e faça login.
2. Instale na tela de início — no iPhone isso é obrigatório para receber push.
3. Abra Alertas e toque em "Ativar alertas neste aparelho".
4. Aceite a permissão.

## Provocar a ruptura

Retire pacotes da bandeja até cruzar o mínimo configurado. O alerta aparece
na lista em até 10 segundos e chega como notificação mesmo com o app fechado.

Repor os pacotes resolve o alerta sozinho — vale mostrar, porque é o que
diferencia um aviso de um registro que alguém tem que limpar depois.

## Se a bancada falhar no dia

O simulador Python substitui o hardware:

    cd firmware/simulator
    python esp32_sensor_simulator.py --interval 5

Ele reduz o peso periodicamente e dispara a mesma regra.

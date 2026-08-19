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

O simulador Python substitui o hardware. Ele **precisa publicar no mesmo broker
que o backend escuta**: por padrão o simulador usa `localhost:1883` (o EMQX do
`docker-compose.yml`) enquanto o backend assina `tcp://broker.emqx.io:1883`, e
nesse caso as mensagens simplesmente não se encontram. Aponte o simulador para
o broker público:

    cd firmware/simulator
    python esp32_sensor_simulator.py --broker-host broker.emqx.io --interval 5 --device-id wokwi-shelf-001

O `--device-id` também importa: o backend identifica o dispositivo pelo nome e
cadastra um novo se não conhecer. Use o nome do dispositivo que já está na loja
com produto e mínimo configurados (`wokwi-shelf-001` na bancada); com o padrão
`esp32-sim-001` o simulador só criaria uma prateleira vazia, sem produto, e
nenhum alerta de estoque sairia.

Ele reduz o peso periodicamente e dispara a mesma regra.

Se preferir o EMQX local, é o backend que tem de mudar de lado — suba-o com
`$env:MQTT_BROKER_URL = "tcp://localhost:1883"` — mas aí o Wokwi, que roda na
nuvem, deixa de alcançar o backend. Na demonstração, o mais seguro é manter
todo mundo no broker público.

## Limitação conhecida

O backend assina `sensor/data/#` em um broker de teste **público e sem
autenticação** (`broker.emqx.io`). Isso tem duas consequências honestas durante
a janela da apresentação:

- Qualquer pessoa que publique em `sensor/data/<nome do dispositivo>`, sabendo
  ou adivinhando o nome, consegue provocar um alerta falso na tela.
- Tráfego alheio no mesmo curinga é possível; leituras estranhas na lista não
  significam necessariamente defeito no sistema.

Autenticação no broker e TLS são escopo do próximo subprojeto, junto com o
firmware definitivo. Aqui a escolha foi deliberada: o Wokwi roda na nuvem e
precisa de um broker alcançável pela internet para que exista um caminho de
dispositivo funcionando de ponta a ponta.

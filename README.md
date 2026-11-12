Сервіс, що реалізує CRUD операції для котів. 

Зроблено на TypeScript, Node.js, Express. 

Для запуску тестів потрібно мати встановлений рантайм Node.js(https://nodejs.org/en/download), відкрити термінал у корені проекта (там, де лежить package.json), та виконати npm run test. 

Для запуску контейнера потрібно мати встановленний Docker. У корені проекту щоб зібрати образ потрібно виконати 

docker build -t express-app .

Та потім виконати команду, щоб з образа запустити контейнер:

docker run -d -p 3000:3000 --name running-app express-app

Після успішного запуску можна буде отримати доступ до API за http://localhost:3000.
Наприклад, на http://localhost:3000/docs можна подивитися Swagger інтерфейс для API.

## Веб-інтерфейс

Односторінковий React-інтерфейс у `web-app` дозволяє переглядати, створювати,
редагувати та видаляти котів. Для локальної розробки запустіть API, а потім:

```sh
cd web-app
npm ci
npm run dev
```

Vite проксуює `/api/cats` на `localhost:3000`. Production-образ використовує
nginx для обслуговування сторінки та проксі до API. Змінна `API_URL` задає
адресу API для nginx; Helm налаштовує її автоматично.

## Захищений клієнт

Запустіть API, а потім виконайте `npm start -w client-app`. За потреби задайте
змінну `SERVER_URL`; типова адреса — `http://localhost:3000`. Клієнт повторно
використовує сесію для повідомлень. Сесія діє одну секунду з моменту створення;
після відповіді `440` з `{ "error": "Session expired." }` клієнт створює нову
сесію та один раз повторює повідомлення. Інші помилки не спричиняють повтору.
Запит повідомлення містить `hash` — SHA-256 хеш відкритого тексту у форматі
hex, який сервер перевіряє після розшифрування.
Сесії зберігаються в пам'яті процесу сервера та після завершення залишаються
позначеними як прострочені. `GET /api/sessions` повертає всі сесії з полями
`sessionId`, `expiresAt` і `expired`, без ключів шифрування. Стан оновлюється
під час перегляду списку або звернення до сесії. Після перезапуску сервера
сесії невідомі; список без автентифікації доступний усім, хто має доступ до API.

## Helm та Kubernetes

Chart `helm/cats` створює PostgreSQL з постійним томом, окремий Job міграції,
API, веб-інтерфейс та відповідні Services. Потрібні Helm 3, Kubernetes з
доступним StorageClass і можливість створювати Role та RoleBinding. Окремі
маніфести в `k8` не потрібні для встановлення chart і мають власні налаштування.

Перед встановленням створіть namespace і Secret `cats-db` у ньому. Secret
повинен містити ключі `password` і `DATABASE_URL`; пароль у них має бути
однаковим. За значень chart за замовчуванням URL має вигляд
`postgres://cats:<password>@cats-db:5432/cats` для release `cats`. Спеціальні
символи в імені користувача та паролі URL потрібно percent-encode. Для іншого
release хостом є `<release>-db` (для імен понад 40 символів див. відрендерену
назву Service через `helm template`).

Наприклад, надайте файли без кінцевого переводу рядка через захищений механізм,
не додаючи їх у Git, і створіть Secret:

```sh
kubectl create namespace cats
kubectl -n cats create secret generic cats-db \
  --from-file=password=/secure/path/password \
  --from-file=DATABASE_URL=/secure/path/database-url
```

Замініть шляхи на власні. Для іншого Secret задайте
`database.existingSecret`. Значення `database.name` та `database.user` мають
відповідати URL і застосовуються PostgreSQL лише під час першої ініціалізації
тому. Зміна цих значень або пароля в Secret не змінює вже створені облікові
дані у базі; для ротації потрібна окрема операція в PostgreSQL.

Використовуйте однакові незмінні теги образів API, мігратора й веб-інтерфейсу
від потрібного запуску CI:

```sh
helm upgrade --install cats ./helm/cats -n cats \
  --set images.api.tag=BUILD_NUMBER \
  --set images.migrator.tag=BUILD_NUMBER \
  --set images.web.tag=BUILD_NUMBER \
  --wait --wait-for-jobs --timeout 12m
kubectl -n cats port-forward service/cats-web 8080:80
```

Відкрийте `http://localhost:8080`. Для доступу поза кластером налаштуйте
`web.serviceType` або власний Ingress і TLS. Кожне встановлення чи оновлення
створює Job із номером ревізії; нові pod API чекають на його успішне
завершення. У разі помилки перевірте `kubectl -n cats get jobs,pods` та
`kubectl -n cats logs job/cats-migrate-REVISION -c migrator`. Старі pod API
можуть обслуговувати запити під час оновлення, тому міграції мають бути
сумісні з попередньою версією API.

PVC навмисно зберігається після `helm uninstall`; його видалення знищує дані.
Цей одноінстансний PostgreSQL не забезпечує HA, резервне копіювання або TLS —
налаштуйте їх окремо для production. Для приватних образів також налаштуйте
доступ до registry у кластері.

GitHub Actions перевіряє backend і frontend, виконує `helm lint`, рендерить та
пакує chart і зберігає архів як артефакт `helm-chart-<run_number>`. Smoke-тест
на kind встановлює та оновлює chart і перевіряє CRUD через веб-проксі та
збереження даних. На `main` три образи публікуються в Docker Hub з тегом
номера запуску; в інших гілках та pull request вони зберігаються як артефакти.
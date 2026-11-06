Сервіс, що реалізує CRUD операції для котів. 

Зроблено на TypeScript, Node.js, Express. 

Для запуску тестів потрібно мати встановлений рантайм Node.js(https://nodejs.org/en/download), відкрити термінал у корені проекта (там, де лежить package.json), та виконати npm run test. 

## PostgreSQL

Коти зберігаються у PostgreSQL за допомогою Sequelize. Створіть базу даних та
задайте змінну середовища `DATABASE_URL` у форматі
`postgres://USER:PASSWORD@HOST:5432/DATABASE`. Не зберігайте реальні облікові
дані у репозиторії. Сервер не запуститься, якщо змінна відсутня або підключення
неможливе.

### Конфігурація для різних середовищ

Для кожного середовища задайте власний `DATABASE_URL`. API та мігратор мають
отримувати адресу однієї і тієї самої бази даних цього середовища.

Для старих окремих маніфестів Kubernetes використайте `k8/secret.example.yaml` як шаблон: скопіюйте його,
наприклад, у `secret-prod.yaml`, і замініть адресу та облікові дані реальними
значеннями для production. Файли `secret-*.yaml` виключені з Git і контексту
Docker-збірки. Створіть окремий Secret у namespace кожного середовища:

```sh
kubectl apply -n production -f secret-prod.yaml
```

Для іншого середовища використайте інший файл зі своєю адресою та відповідний
namespace. У конфігурації контейнерів API та завдання міграції додайте:

```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: db-credentials
        key: DATABASE_URL
```

Secret має існувати в тому самому namespace, що й відповідний workload.
Значення в `secret.example.yaml` є лише заповнювачем. Не додавайте реальні
облікові дані до репозиторію; Kubernetes Secret також потребує належних
обмежень доступу та шифрування. Параметри TLS задаються в `DATABASE_URL`
(наприклад, `?sslmode=require`); змінна `DB_SSL` не використовується.

Встановіть залежності (`npm ci`), після чого застосуйте міграції окремо від
запуску сервера:

```sh
npm run db:migrate
npm run build
npm start
```

Для локальної розробки замість останніх двох команд можна виконати `npm run dev`.
Команда `npm run db:migrate:undo` відкочує останню міграцію і видаляє таблицю
котів разом з її даними. Міграції не виконуються автоматично при старті.
У deployment запускайте міграції перед запуском нової версії, використовуючи
окремий образ `konopus/ci_cd_lab1-migrator` з тим самим номером збірки, що й
образ API. Production-образ API не містить CLI та файлів міграцій.
Для локальної збірки і запуску мігратора:

```sh
docker build -f Dockerfile.migrator -t cats-migrator .
docker run --rm --env DATABASE_URL cats-migrator
```

`DATABASE_URL` має вказувати на PostgreSQL, доступний з контейнера. Контейнер
повертає ненульовий код завершення у разі помилки; запуск сервера слід
продовжувати лише після успішного виконання міграцій. Workflow публікує образи
API і мігратора в Docker Hub для `main`, а для інших гілок зберігає їх як
окремі артефакти.

API зберігає колишні маршрути та формат відповіді. `name` і `color` мають бути
непорожніми рядками, `age` — цілим числом від 0 до 2147483647 включно. `PUT`
підтримує часткове оновлення; некоректні поля повертають HTTP 400. Дані, які
залишалися лише в пам'яті попереднього процесу, не переносяться автоматично.
Тести використовують імітацію доступу до бази та не потребують PostgreSQL.

Для запуску контейнера потрібно мати встановленний Docker. У корені проекту щоб зібрати образ потрібно виконати 

docker build -t express-app .

Та потім виконати команду, щоб з образа запустити контейнер:

docker run -d -p 3000:3000 --env DATABASE_URL --name running-app express-app

`DATABASE_URL` має бути задано у середовищі, з якого запускається Docker, і
містити адресу PostgreSQL, доступну з контейнера (не `localhost` хоста). Перед
запуском контейнера застосуйте міграції, як описано вище.

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
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

### Підключення demo до бази даних для backup

У локальному прикладі джерело PostgreSQL — Service `cats-db` у namespace
`cats`. Для workload у namespace `demo` використовуйте DNS-ім'я
`cats-db.cats.svc.cluster.local` і Secret `users-db-connection` з такими
значеннями:

| Ключ | Demo value |
| --- | --- |
| `PGHOST` | `cats-db.cats.svc.cluster.local` |
| `PGPORT` | `5432` |
| `PGDATABASE` | `cats` |
| `PGUSER` | `cats` |
| `PGPASSWORD` | пароль з Secret `cats-db` у namespace `cats` |

Створіть namespace, якщо його ще немає. Передайте пароль через захищений файл
без кінцевого переводу рядка; не додавайте файл або реальний пароль до Git:

```sh
kubectl create namespace demo --dry-run=client -o yaml | kubectl apply -f -
kubectl -n demo create secret generic users-db-connection \
  --from-literal=PGHOST=cats-db.cats.svc.cluster.local \
  --from-literal=PGPORT=5432 \
  --from-literal=PGDATABASE=cats \
  --from-literal=PGUSER=cats \
  --from-file=PGPASSWORD=/secure/path/postgres-password \
  --dry-run=client -o yaml | kubectl apply -f -
```

Замініть шлях на файл із тим самим паролем, що й у `cats-db`. Secret має бути
в namespace workload, а PostgreSQL Service може бути в іншому namespace, якщо
`PGHOST` містить його DNS-ім'я. Для локального кластера PVC архівів
`postgres-backups` окремий від тому PostgreSQL; у поточному kind-кластері він
використовує StorageClass `standard` і запитує `1Gi`. Через режим
`WaitForFirstConsumer` PVC отримає стан `Bound`, коли workload змонтує його.
Якщо PVC ще не існує, створіть його (для іншого кластера за потреби змініть
StorageClass та розмір):

```sh
kubectl -n demo create -f - <<'YAML'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-backups
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: standard
  resources:
    requests:
      storage: 1Gi
YAML
```

### Контролер DatabaseBackup

Контролер працює лише в namespace `demo`. Встановіть CRD з
`databasebackup-crd.yaml`, створіть у `demo` Secret з ключами `PGHOST`, `PGPORT`,
`PGDATABASE`, `PGUSER`, `PGPASSWORD` і PVC з ім'ям, указаним у
`spec.backupPVCName`. Застосуйте приклад `databasebackup.yaml`. Kubernetes 1.27+
потрібен для `spec.timeZone` CronJob.

Для локального kind-кластера зберіть і завантажте окремий образ, а потім
встановіть контролер і його обмежені namespace права:

```sh
docker build -f Dockerfile.backup-controller -t databasebackup-controller:local .
kind load docker-image databasebackup-controller:local --name lectures
kubectl apply -f databasebackup-crd.yaml
kubectl apply -f k8/backup-controller.yaml
kubectl apply -f databasebackup.yaml
kubectl -n demo rollout status deployment/databasebackup-controller
```

Для іншого кластера опублікуйте образ у доступному registry і змініть image у
`k8/backup-controller.yaml`. Для локального запуску замість Deployment:
`npm run build:backup-controller` та `npm run start:backup-controller`;
потрібен Node.js 24 і поточний kubeconfig з тими самими правами.

При старті контролер обробляє список ресурсів і продовжує watch з його
resourceVersion; при 410 отримує новий список. Повна повторна перевірка кожні
60 секунд відновлює видалені CronJob і повторює невдалі операції. CronJob має
посилання ownerReference на DatabaseBackup; сторонній CronJob з тим самим ім'ям
не змінюється, а конфлікт записується в log. Видалення DatabaseBackup залишає
видалення CronJob Kubernetes garbage collector. Наявні архіви на PVC не
видаляються.

CronJob запускає `postgres:17` і `pg_dump -Fc`, записує архів з UTC-часом та
унікальним іменем pod у `/backups` на PVC; незавершений файл має суфікс
`.tmp`. Шлях до успішно створеного архіву записується в log контейнера;
невдалий `pg_dump` або rename завершує Job з помилкою. Паралельні запуски
одного CronJob заборонені. Образ `pg_dump` має
підтримувати версію вихідного PostgreSQL (не новішу за 17). Це приклад:
налаштуйте захист та зберігання архівів, retention, TLS і перевірку
відновлення окремо. Користувачі, які можуть створювати DatabaseBackup у `demo`,
можуть запускати workload з указаним Secret та PVC, тому обмежте ці права.

#### Демонстраційна перевірка

Приклади нижче виконуються в Bash після встановлення контролера; вони змінюють
наявний `users-db-backup` і видаляють його керований CronJob. Не запускайте їх
для production-даних. Для `--as` потрібне право impersonate ServiceAccount.

Перевірте створення та оновлення того самого CronJob. Дочекайтеся кожної зміни;
після перевірки обов'язково відновіть початковий розклад:

```sh
kubectl -n demo get databasebackup users-db-backup
kubectl -n demo get cronjob users-db-backup
ORIGINAL=$(kubectl -n demo get databasebackup users-db-backup -o jsonpath='{.spec.schedule}')
UID_BEFORE=$(kubectl -n demo get cronjob users-db-backup -o jsonpath='{.metadata.uid}')
kubectl -n demo patch databasebackup users-db-backup --type=merge \
  -p '{"spec":{"schedule":"1 2 * * *"}}'
kubectl -n demo wait cronjob/users-db-backup \
  --for='jsonpath={.spec.schedule}=1 2 * * *' --timeout=90s
kubectl -n demo get cronjob users-db-backup \
  -o custom-columns=NAME:.metadata.name,UID:.metadata.uid,SCHEDULE:.spec.schedule
test "$UID_BEFORE" = "$(kubectl -n demo get cronjob users-db-backup -o jsonpath='{.metadata.uid}')"
kubectl -n demo patch databasebackup users-db-backup --type=merge \
  -p "{\"spec\":{\"schedule\":\"$ORIGINAL\"}}"
kubectl -n demo wait cronjob/users-db-backup \
  --for="jsonpath={.spec.schedule}=$ORIGINAL" --timeout=90s
```

Для прикладу початковий розклад має відрізнятися від `1 2 * * *`; інакше
виберіть інший розклад в обох командах. Якщо перевірку перервано, відновіть
початкове значення вручну. Для перевірки відновлення запишіть старий UID,
видаліть CronJob і дочекайтеся появи нового UID (до 60 секунд плюс затримка API):

```sh
kubectl -n demo get cronjob users-db-backup -o custom-columns=NAME:.metadata.name,UID:.metadata.uid
kubectl -n demo delete cronjob users-db-backup
for i in $(seq 1 90); do
  kubectl -n demo get cronjob users-db-backup -o custom-columns=NAME:.metadata.name,UID:.metadata.uid \
    2>/dev/null && break
  sleep 1
done
```

Створіть Job вручну і збережіть log. Наведені нижче команди запускайте з
`set -o pipefail`, щоб помилка в конвеєрі не приховувалася:

```sh
set -o pipefail
JOB="backup-check-$(date +%Y%m%d%H%M%S)"
kubectl -n demo create job --from=cronjob/users-db-backup "$JOB"
kubectl -n demo wait --for=condition=complete "job/$JOB" --timeout=240s
kubectl -n demo logs "job/$JOB" | tee backup-job.log
ARCHIVE=$(sed -n 's/^Backup created: //p' backup-job.log)
test -n "$ARCHIVE"
```

`k8/backup-restore-check.yaml` створює тимчасовий окремий сервер PostgreSQL з
порожньою базою `backup_restore_check` на `emptyDir` та клієнтський Pod із
PVC `postgres-backups`, змонтованим лише для читання. Маніфест використовує
`users-db-connection` як джерело пароля; для інших назв Secret або PVC змініть
маніфест. Це лише локальна перевірка: ізольована база містить копію даних і
доступна в кластері, а після видалення Pod її дані зникнуть. Обмежте доступ до
неї та до log відповідно до чутливості даних.

```sh
kubectl create -f k8/backup-restore-check.yaml
kubectl -n demo wait --for=condition=Ready \
  pod/databasebackup-restore-db pod/databasebackup-restore-client --timeout=240s
kubectl -n demo exec databasebackup-restore-client -- pg_restore --list "$ARCHIVE" | tee backup-archive-list.log
kubectl -n demo exec databasebackup-restore-client -- psql -X -v ON_ERROR_STOP=1 \
  -c "SELECT current_database();" \
  -c "SELECT count(*) AS user_tables FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema');"
# user_tables має дорівнювати 0 перед відновленням.
kubectl -n demo exec databasebackup-restore-client -- pg_restore --verbose \
  --exit-on-error --single-transaction --no-owner --no-acl \
  -d backup_restore_check "$ARCHIVE" 2>&1 | tee backup-restore.log
kubectl -n demo exec databasebackup-restore-client -- psql -X -v ON_ERROR_STOP=1 \
  -c "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_name;" \
  -c "SELECT count(*) AS restored_cats FROM public.cats;"
```

Log `backup-restore.log` містить послідовність відновлення об'єктів і даних.
Після перевірки видаліть лише тестові ресурси командою
`kubectl delete -f k8/backup-restore-check.yaml`; PVC та архів залишаться.
Для повторного тесту створіть їх знову, щоб база була порожньою.

Перевірка мінімальних прав:

```sh
kubectl auth can-i impersonate serviceaccounts -n demo
SA=system:serviceaccount:demo:databasebackup-controller
kubectl auth can-i list databasebackups.backup.example.com -n demo --as="$SA" # yes
kubectl auth can-i create cronjobs.batch -n demo --as="$SA"                   # yes
kubectl auth can-i list secrets -n demo --as="$SA"                            # no
```

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
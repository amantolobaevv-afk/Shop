# AMAN BREND — Render + Supabase

Бекенд Node.js 24 LTS менен иштейт. PostgreSQL базасы жана товар сүрөттөрү Supabase'те сакталат. Render сервери кайра иштегенде же уктап ойгонгондо товарлар, буйрутмалар жана сүрөттөр жоголбойт.

## 1. Supabase даярдоо

1. Supabase'те жаңы долбоор түзүңүз. Бул долбоорду дүкөнгө гана арнаганыңыз жакшы.
2. **Connect → Session pooler** бөлүмүнөн PostgreSQL байланышын көчүрүңүз (порт **5432**). Парольдогу атайын белгилер URL-encoded болушу керек. IPv4 үчүн Session pooler ылайыктуу.
3. Project Settings / API бөлүмүнөн долбоордун URL'ин жана сервердик `service_role` же `sb_secret_...` ачкычын алыңыз. Publishable/anon ачкычы бул бекенд үчүн жарабайт.
4. Storage бөлүмүндө **product-images** аттуу **private** bucket түзүңүз. Public өчүк болсун. File size limit: 2 MB. MIME: `image/jpeg`, `image/png`, `image/webp`. Кардарларга upload/read policy кошпоңуз: Storage'га сервер гана кирет.
5. База таблицаларын кол менен public схемасында түзбөңүз. `npm run migrate` аларды жабык `aman_shop` схемасында түзөт. Бул схеманы Supabase Data API'нин exposed schemas тизмесине кошпоңуз.

Ачкычтарды жана база паролун чатка же GitHub'га жайгаштырбаңыз. Аларды Render'дин Environment/Secrets бөлүмүнө киргизиңиз.

## 2. Render'ге жайгаштыруу

Репозиторийде `render.yaml` даяр:

1. Render → **New → Blueprint**.
2. `amantolobaevv-afk/Shop` репозиторийин, **backend/shop-api** бутагын тандаңыз. PR main'ге кошулса, main бутагын тандап, Blueprint'теги branch маанисин да main кылыңыз.
3. План: **Free**. Туруктуу диск же Render Postgres түзүүнүн кереги жок.
4. Суралган өзгөрмөлөрдү толтуруңуз:

| Аты | Мааниси |
|---|---|
| `DATABASE_URL` | Supabase Session pooler connection string |
| `SUPABASE_URL` | `https://PROJECT_REF.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Сервердик жашыруун ачкыч |
| `SUPABASE_STORAGE_BUCKET` | `product-images` |
| `ADMIN_PASSWORD` | Өзүңүз тандаган уникалдуу пароль, кеминде 16 белги |

`NODE_ENV=production`, `HOST=0.0.0.0` жана Node 24 Blueprint'те бар. `PORT` Render тарабынан берилет. `PUBLIC_ORIGIN` көрсөтүлбөсө, Render берген `RENDER_EXTERNAL_URL` автоматтык колдонулат. Өз домениңизди кошкондо `PUBLIC_ORIGIN=https://your-domain.example` деп так коюңуз (аягында slash жок).

Build: `npm install --omit=dev --ignore-scripts`.
Start: `npm run migrate && npm start`.
Health check: `/api/health`.

Биринчи ишке кирүүдө миграция жаңы таблицаларды түзөт. Кийинки deploy'лор маалыматты кайра түзбөйт жана seed автоматтык аткарылбайт. Storage bucket табылбаса сервер атайын ишке кирбейт — туура private bucket жана ачкычтарды текшериңиз.

TLS сертификат текшерүүсү дайыма күйүк. Эгер Supabase сертификатына байланыштуу ката чыкса, Dashboard'дон CA сертификатын жүктөп, толук PEM маанисин `DATABASE_CA_CERT` өзгөрмөсүнө киргизиңиз. Literal `\n` форматындагы саптар да колдоого алынат. `rejectUnauthorized:false` же `sslmode=no-verify` колдонулбайт.

## 3. Компьютерде иштетүү

Node **24.15+ (24 LTS)** талап кылынат.

```sh
npm install --ignore-scripts
```

`.env.example` → `.env` көчүрүп, Supabase маалыматын жана парольду толтуруңуз:

```sh
npm run migrate
npm run storage:setup
npm start
```

`storage:setup` — bucket'ти Dashboard аркылуу даярдап койсоңуз милдеттүү эмес. Ал жок private bucket'ти түзө алат, бирок public bucket'ти унчукпай өзгөртпөйт.

Сайт: `http://localhost:3000`.
Ээсинин панели: `http://localhost:3000/admin.html`.
HTML'ди `file://` менен ачпаңыз.

Демо-каталог кааласаңыз гана:

```sh
npm run seed
```

Seed 12 демо товарды **нөлдүк калдыктар** менен кошот. База толтурулган болсо токтойт. Чыныгы товарларды, сүрөттөрдү жана калдыктарды ээсинин панелинен киргизиңиз.

## Сатып алуу логикасы

Каталог → издөө/категория/өлчөм → товар → түс жана өлчөм → себет → форма → PostgreSQL'де сакталган буйрутма → WhatsApp аркылуу менеджерге жөнөтүү.

- Сумманы сервер учурдагы баалардан эсептейт.
- Кампада жетпеген товарга буйрутма кабыл алынбайт.
- Ар бир түс жана өлчөмдүн өз калдыгы бар.
- Буйрутма түзүлгөндө товар 24 саатка резервге алынат.
- Менеджер ырастабаса резерв бүтүп, товар кампага кайтарылат.
- Ырасталган буйрутма автоматтык бүтпөйт: менеджер аны аткарат же жокко чыгарат.
- Бир эле `Idempotency-Key` менен кайталанган сурам бир гана буйрутма түзөт.
- Жокко чыгаруу/мөөнөт бүтүү калдыктарды бир эле жолу кайтарат.
- PostgreSQL транзакциясы жана жалпы write-lock катар келген эки сурамдын акыркы бир товарды ашыкча сатуусуна жол бербейт. Бул чакан дүкөнгө эсептелген; жогорку жүктө write-lock'ту майда кулпуларга бөлүүгө болот.
- Жеткирүү акысы суммага кирбейт, менеджер менен макулдашылат.
- `pending → confirmed → completed`; `pending/confirmed → cancelled`; `pending → expired`.
- Онлайн-төлөм азырынча өчүк. API `onlinePayment:false` берет; төлөм өттү деген жалган статус жок.

Render уктап турганда фондук таймер иштебейт. Мөөнөтү бүткөн резервдер кийинки каталог/буйрутма сурамында тазаланат. Системаны ойготуп туруу үчүн өзүнчө автоматтык ping талап кылынбайт.

## Сактоо жана коопсуздук

- PostgreSQL `aman_shop` схемасы: products, variants, orders, order_items, sessions, rate_limits, schema_migrations жана write_lock.
- Таблицаларга браузер түз кирбейт. Колдонмо PostgreSQL'ге серверден TLS аркылуу туташат; max 4 connection.
- Схемага PUBLIC/anon/authenticated/service_role укуктары берилбейт; бизнес таблицаларда RLS күйүк, кардар policy'лери жок. Миграция жана runtime үчүн схеманын ээси болгон DB ролун колдонуңуз (Session pooler'деги postgres.PROJECT_REF).
- Supabase Storage ачкычы Node серверинде гана калат. Сүрөт `/uploads/<random-name>.jpg` аркылуу серверден берилет; bucket private бойдон калат.
- Фото JPG/PNG/WebP, максимум 2 MB, товарга 1–6 сүрөт. Форматтын сигнатурасы текшерилет. Файлдар кокус ат менен сакталат, үстүнөн жазылбайт.
- Сүрөттөр сервер аркылуу өтөт: Render жана Supabase трафик лимиттери экөөнө тең колдонулат. Шилтемесиз калган жүктөөлөрдү убакыт өткөн сайын текшериңиз; автоматтык өчүрүү жок.
- Ээсинин сырсөзү чөйрөдөн алынат; scrypt колдонулат. Cookie HttpOnly, SameSite=Strict, production'до Secure.
- Сессия жана сурам чектөөлөрү PostgreSQL'де сакталат, deploy'дон кийин жоголбойт. Сырсөз өзгөрсө эски сессиялар жараксыз болот.
- Өзгөртүүлөргө Origin жана CSRF талап кылынат. Бир эле доменден кызмат көрсөтүлөт, CORS ачылган эмес.
- `TRUST_PROXY_HOPS=1` Render proxy үчүн. Түз Интернетке ачылган серверде `0` коюңуз; кардар берген forwarded header'ге ишенбеңиз.
- Жеке маалыматтар — кардардын аты, телефону, дареги — ээсине гана жеткиликтүү. Буйрутманын статусу өзүнчө кокус токен менен алынат.

## API

JSON, баалар бүтүн сом менен:

| Метод | Жол | Милдет |
|---|---|---|
| GET | `/api/health` | DB байланышын текшерүү |
| GET | `/api/config` | Категориялар, байланыштар, төлөм жеткиликтүүлүгү |
| GET | `/api/products?category=&q=&size=&sort=asc` | Каталог |
| GET | `/api/products/:id` | Товар жана варианттары |
| POST | `/api/orders` | Буйрутма; `Idempotency-Key` керек |
| GET | `/api/orders/:id` | Статус; `X-Order-Token` керек |
| POST | `/api/auth/login` | `{ "password": "..." }` |
| GET | `/api/auth/session` | Сессия жана CSRF токен |
| POST | `/api/auth/logout` | Чыгуу |
| GET/POST | `/api/admin/products` | Тизме / товар кошуу |
| PUT/DELETE | `/api/admin/products/:id` | Өзгөртүү / жашыруу |
| POST | `/api/admin/uploads` | Data URL аркылуу сүрөт жүктөө |
| GET | `/api/admin/orders` | Акыркы 200 буйрутма |
| PATCH | `/api/admin/orders/:id` | Статусун өзгөртүү |
| POST | `/api/payments/checkout` | 503 — төлөм туташкан эмес |

```json
{
  "customer": "Аман",
  "phone": "+996503331717",
  "address": "Бишкек, көчө, үй",
  "note": "Келээрден мурда чалыңыз",
  "items": [{"variantId": 1, "qty": 1}]
}
```

Бардык өзгөртүү сурамдарына `Origin: PUBLIC_ORIGIN`; ээсинин сурамдарына cookie жана `X-CSRF-Token` керек. Редактирлөөдө учурдагы `version` берилет; эски версия менен маалымат үстүнөн жазылбайт.

## Тесттер

```sh
npm run test:unit
npm test
```

Толук интеграциялык тесттерге өзүнчө PostgreSQL тест базасы керек:

```dotenv
TEST_DATABASE_URL=postgresql://shop:test-only-password@localhost:5432/shop_test
```

Аты **_test** менен аяктаган убактылуу базаны гана колдонуңуз: тесттер анда таблицаларды тазалайт. Чыныгы Supabase базаңызды TEST_DATABASE_URL кылбаңыз. URL жок болсо DB тесттер skipped деп белгиленет, бирок валидация жана storage adapter тесттери аткарылат.

GitHub Actions PostgreSQL 16 service менен толук тесттерди иштетет: катар келген сурамдар, кайра жөнөтүлгөн сурам, резерв/отмена, баанын snapshot'у, сессия, CSRF, TLS, Storage adapter жана жүктөө жолу. Actions dependency-lock artifact'ын да сактайт.

Булуттагы өз Supabase аккаунту менен туташуу жана браузердик текшерүү аккаунттар жөндөлгөндөн кийин өзүнчө аткарылат.

## Мурунку маалымат жана резервдик көчүрмө

Мурунку SQLite файл автоматтык өчүрүлбөйт жана автоматтык импорттолбойт. Эгер анда чыныгы буйрутма/товар бар болсо, эски серверди токтотуп, базаны жана uploads папкасын көчүрүп сактап, көчүрүү планын түзмөйүнчө жаңы базага сатууну баштабаңыз. Эски браузердик localStorage каталогу да автоматтык көчпөйт.

Supabase PostgreSQL үчүн логикалык backup (`pg_dump`) жана Storage объекттери үчүн өзүнчө көчүрмө керек; база dump'у сүрөттөрдүн өзүн камтыбайт. Акысыз планда акы төлөнүүчү резервдик көчүрмөлөрдүн кепилдигин күтпөңүз. Төлөм, SMS/email, сатып алуучунун аккаунту жана толук котормо азырынча кошула элек.

## Документтер

- [Supabase PostgreSQL connection](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Render Blueprint](https://render.com/docs/blueprint-spec)
- [Render Free limits](https://render.com/docs/free)

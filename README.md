# GitLab Scout

Веб-приложение для сбора и визуализации статистики из GitLab-репозиториев.

![CI](https://github.com/YOUR_USERNAME/iit-gitlab-scout/actions/workflows/ci.yml/badge.svg)

## Быстрый старт

```bash
git clone https://github.com/YOUR_USERNAME/iit-gitlab-scout.git
cd iit-gitlab-scout

# Конфигурация
cp .env.example .env
cp backend/.env.example backend/.env
# Заполнить .env и backend/.env

# Запуск
make dev
```

## Модули

| Вкладка | Описание |
|---------|----------|
| **Языки** | Сбор языков из GitLab API, визуализация соотношения |
| **Активность** | Коммиты, MR, пайплайны по дням/неделям |
| **Контрибьюторы** | Статистика контрибьюторов, тепловая карта, таймлайн |
| **Настройки** | Проекты, Пользователи, Периодичность обновления |

## Конфигурация проектов

Проекты добавляются через UI (вкладка «Настройки» → «Проекты»):

| Поле | Описание |
|------|----------|
| `path` | Путь к проекту (`owner/repo`) |
| `label` | Читаемое имя |
| `tag` | Тег для группировки |
| `token` | Токен GitLab (AES-256-GCM шифрование) |
| `base_url` | URL API |

## Учётные записи

| Логин | Пароль | Роль |
|-------|--------|------|
| `admin` | `admin` | Полный доступ |
| `user` | `user` | Только просмотр |

---

## Деплой на VM

### Требования

- Ubuntu 22.04+ / Debian 12+ / any Linux
- Docker + Docker Compose v2
- 2+ CPU, 2GB+ RAM
- Порт 80 (frontend) и 5432 (PostgreSQL) доступны

### 1. Установка Docker

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Проверка
docker --version
docker compose version
```

### 2. Клонирование репозитория

```bash
git clone https://github.com/YOUR_USERNAME/iit-gitlab-scout.git
cd iit-gitlab-scout
```

### 3. Настройка окружения

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Отредактируйте `.env`:

```bash
# Сгенерировать безопасные ключи
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Записать в .env
sed -i "s/changeme/$JWT_SECRET/" .env
sed -i "s/00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff/$ENCRYPTION_KEY/" .env

# Записать пароль PostgreSQL в .env
sed -i "s/changeme/$(openssl rand -hex 16)/" .env
```

### 4. Запуск

```bash
docker compose up -d
```

### 5. Миграции БД

```bash
docker compose exec backend npm run migrate
```

### 6. Проверка

```bash
# Healthcheck
curl http://localhost:3000/health

# Открыть в браузере
open http://YOUR_VM_IP
```

### 7. Настройка reverse proxy (nginx)

Если нужно разместить за nginx:

```nginx
server {
    listen 80;
    server_name gitlab-scout.your-domain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 8. Автозапуск (systemd)

```bash
sudo tee /etc/systemd/system/gitlab-scout.service <<EOF
[Unit]
Description=GitLab Scout
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/iit-gitlab-scout
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable gitlab-scout
sudo systemctl start gitlab-scout
```

---

## GitHub Actions CI/CD

Пайплайн автоматически:
- **lint** — typecheck + ESLint
- **test** — Vitest + PostgreSQL
- **build** — Docker image (только на main)

### Настройка

1. Fork/Clone репозиторий в GitHub
2. В Settings → Secrets добавьте:
   - `DOCKER_USERNAME` — Docker Hub логин (опционально)
   - `DOCKER_PASSWORD` — Docker Hub пароль (опционально)
3. Пуш в `main` запускает полный пайплайн

---

## Переменные окружения

| Переменная | Описание | По умолчанию |
|-----------|----------|--------------|
| `DATABASE_URL` | URL PostgreSQL | — |
| `JWT_SECRET` | Секрет JWT (≥16 символов) | — |
| `ENCRYPTION_KEY` | Ключ шифрования (64 hex) | — |
| `GITLAB_BASE_URL` | Base URL GitLab API | `https://gitlab.com/api/v4` |
| `PORT` | Порт backend | `3000` |
| `REQUEST_TIMEOUT` | Таймаут запросов (мс) | `30000` |
| `RATE_LIMIT_RPS` | Лимит запросов/сек | `10` |

## Структура проекта

```
├── .github/workflows/ci.yml   # GitHub Actions
├── backend/                    # Node.js + Fastify + TypeScript
│   ├── src/                    # API, services, db, utils
│   ├── migrations/             # SQL-миграции (001–008)
│   ├── Dockerfile
│   └── package.json
├── frontend/                   # React + TypeScript + Ant Design
│   ├── src/                    # Components, API, types
│   ├── Dockerfile
│   └── package.json
├── .env.example                # Переменные окружения
├── docker-compose.yml          # PostgreSQL + backend + frontend
├── Makefile                    # Команды сборки
└── README.md
```

# Gobii Results Manager

Sistema para gerenciar workflows e resultados de processos de negócio do Gobii.

## Stack Tecnológica

- **Framework**: Next.js 15+ (App Router)
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Package Manager**: npm

## Pré-requisitos (Windows)

Antes de começar, certifique-se de ter instalado:

1. **Node.js 20 LTS ou superior**
   - Download: https://nodejs.org/
   - Verifique a instalação: `node --version` e `npm --version`

2. **PostgreSQL 15 ou superior**
   - Download: https://www.postgresql.org/download/windows/
   - Durante a instalação, anote a senha do utilizador `postgres`
   - Verifique a instalação: `psql --version`

3. **Git** (opcional, mas recomendado)
   - Download: https://git-scm.com/download/win

## Setup Local (Windows)

### 1. Clone o repositório (ou extraia os ficheiros)

```bash
git clone <repository-url>
cd gobii-results-manager_clean
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure a base de dados PostgreSQL

#### Opção A: Usando pgAdmin (GUI)
1. Abra o pgAdmin
2. Crie uma nova base de dados chamada `gobii_results_manager`
3. Anote o host, porta, utilizador e senha

#### Opção B: Usando linha de comandos
```bash
# Conecte-se ao PostgreSQL
psql -U postgres

# Crie a base de dados
CREATE DATABASE gobii_results_manager;

# Saia do psql
\q
```

### 4. Configure as variáveis de ambiente

Copie o ficheiro `.env.example` para `.env`:

```bash
copy .env.example .env
```

Edite o ficheiro `.env` e atualize a `DATABASE_URL` com as suas credenciais:

```env
DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/gobii_results_manager?schema=public"
```

**Formato da DATABASE_URL:**
```
postgresql://[UTILIZADOR]:[SENHA]@[HOST]:[PORTA]/[NOME_DB]?schema=public
```

Exemplo:
```
DATABASE_URL="postgresql://postgres:minhasenha123@localhost:5432/gobii_results_manager?schema=public"
```

### 5. Execute as migrations do Prisma

```bash
# Gera o Prisma Client
npm run db:generate

# Executa as migrations (cria as tabelas)
npm run db:migrate

# (Opcional) Popula a base de dados com dados iniciais
npm run db:seed
```

### 6. Inicie o servidor de desenvolvimento

```bash
npm run dev
```

A aplicação estará disponível em: **http://localhost:3000**

## Scripts Disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm run build` | Cria a build de produção |
| `npm run start` | Inicia o servidor de produção |
| `npm run lint` | Executa o linter |
| `npm run db:generate` | Gera o Prisma Client |
| `npm run db:migrate` | Executa migrations do Prisma |
| `npm run db:seed` | Popula a base de dados com dados iniciais |
| `npm run db:studio` | Abre o Prisma Studio (GUI para a BD) |
| `npm run db:push` | Sincroniza o schema sem criar migration |
| `npm run db:reset` | Reseta a base de dados (⚠️ apaga todos os dados) |

## Estrutura do Projeto

```
gobii-results-manager_clean/
├── app/                    # Next.js App Router
│   ├── globals.css        # Estilos globais
│   ├── layout.tsx         # Layout principal
│   └── page.tsx           # Página inicial
├── components/            # Componentes React reutilizáveis
│   └── ui/               # Componentes shadcn/ui (a adicionar)
├── lib/                   # Utilitários e configurações
│   ├── prisma.ts         # Prisma Client singleton
│   └── utils.ts          # Funções utilitárias
├── prisma/               # Prisma ORM
│   ├── schema.prisma     # Schema da base de dados
│   └── seed.ts           # Script de seed
├── plans/                # Documentação de arquitetura
│   └── architecture-summary.md
├── .env.example          # Exemplo de variáveis de ambiente
├── .gitignore           # Ficheiros ignorados pelo Git
├── components.json      # Configuração shadcn/ui
├── next.config.ts       # Configuração Next.js
├── package.json         # Dependências e scripts
├── postcss.config.mjs   # Configuração PostCSS
├── tailwind.config.ts   # Configuração Tailwind CSS
└── tsconfig.json        # Configuração TypeScript
```

## Troubleshooting (Windows)

### Erro: "psql não é reconhecido como comando"
- Adicione o PostgreSQL ao PATH do Windows:
  - Painel de Controlo → Sistema → Configurações avançadas do sistema
  - Variáveis de ambiente → PATH
  - Adicione: `C:\Program Files\PostgreSQL\15\bin`

### Erro: "Cannot connect to database"
- Verifique se o PostgreSQL está a correr:
  - Abra "Serviços" (services.msc)
  - Procure por "postgresql-x64-15"
  - Certifique-se que está "Em execução"

### Erro: "Port 3000 already in use"
- Mate o processo na porta 3000:
  ```bash
  netstat -ano | findstr :3000
  taskkill /PID [PID_NUMBER] /F
  ```

### Erro de permissões no Prisma
- Execute o terminal como Administrador
- Ou use: `npm run db:migrate -- --skip-generate`

## Próximos Passos

Este é o **Milestone 0: Foundation**. Os próximos milestones incluirão:

1. **Milestone 1**: Schema completo da base de dados
2. **Milestone 2**: Sistema de autenticação e autorização
3. **Milestone 3**: Workflow Engine
4. **Milestone 4**: Results Management
5. **Milestone 5**: Analytics e Reporting

## Suporte

Para questões ou problemas, consulte a documentação em [`plans/architecture-summary.md`](plans/architecture-summary.md).

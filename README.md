# Lezgo Suite — Panel interno

Panel de operaciones para una agencia que revende **GoHighLevel en marca
blanca**. Reúne en un solo lugar los clientes, las implementaciones, la
facturación y un copiloto de IA que opera la API de GoHighLevel.

## Arrancar

```bash
pnpm install
cp .env.example .env.local   # opcional: el panel corre sin variables
pnpm dev
```

Abre <http://localhost:3000>. Sin `DATABASE_URL` el panel sirve los datos de
ejemplo de `src/data/demo.ts`, así que todas las vistas se pueden recorrer
completas desde el primer minuto.

## Vistas

| Ruta | Qué muestra |
|---|---|
| `/` | Tablero: telemetría de la cartera, ingreso recurrente, movimiento, pendientes |
| `/clientes` | Cartera completa con búsqueda, filtros y salud por cuenta |
| `/clientes/[slug]` | Ficha del cliente: subcuenta, implementaciones, facturas, actividad |
| `/implementaciones` | Tablero por etapa, con filtro por responsable y por bloqueo |
| `/facturacion` | Cobrado, por cobrar, vencido, concentración y listado de facturas |
| `/copiloto` | Chat con el agente, con aprobación para acciones sensibles |
| `/ajustes` | Estado de conexiones, origen de datos y permisos del copiloto |

`⌘K` abre la paleta para saltar a cualquier cliente o sección.

## Conectar Neon

Crea una rama **nueva** en Neon para este proyecto, cópiala a `.env.local` y:

```bash
pnpm db:push    # crea las tablas
pnpm db:seed    # carga los datos de ejemplo
```

El panel cambia de origen solo, sin tocar código: `src/lib/repository.ts` lee de
Postgres en cuanto `DATABASE_URL` existe.

## Conectar GoHighLevel

Genera un *Private Integration Token* de agencia en GoHighLevel y ponlo en
`GHL_API_KEY`. Scopes mínimos:

```
contacts.readonly  contacts.write
opportunities.readonly  opportunities.write
locations.readonly  conversations/message.write
workflows.readonly  calendars.readonly
```

El cliente tipado vive en `src/lib/ghl/client.ts` y cubre contactos,
oportunidades, pipelines, subcuentas, automatizaciones, calendarios y envío de
mensajes, con `ghl.request()` como escape para lo que falte.

## El modelo del copiloto

Define **una** de estas dos en `.env.local`:

- `ANTHROPIC_API_KEY` — va directo a la API de Anthropic. Es el camino más
  corto y no depende de la facturación de Vercel.
- `AI_GATEWAY_API_KEY` — pasa por Vercel AI Gateway. Ojo: los créditos gratis
  no dan acceso a los modelos aunque haya tarjeta registrada; hay que comprar
  créditos en `vercel.com/[equipo]/~/ai`.

`COPILOT_MODEL` cambia el modelo sin tocar código.

## El copiloto

Usa el AI SDK con un `ToolLoopAgent` y 19 herramientas: cuatro leen la cartera
del panel y el resto operan GoHighLevel. Tres de ellas —eliminar contacto,
eliminar oportunidad y enviar mensaje— se detienen y piden confirmación en la
interfaz antes de ejecutarse.

## Comandos

```bash
pnpm dev  ·  pnpm build  ·  pnpm typecheck  ·  pnpm lint
pnpm db:push  ·  pnpm db:seed  ·  pnpm db:studio
```

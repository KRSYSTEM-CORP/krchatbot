# Facturación de mantenimiento (manual)

Mismo modelo que usan KYRA CITAS y APP NEW/KR POS — sin pasarela de pago
(Chargebee, Stripe, etc.): un ADMIN reporta su comprobante de pago desde
`/facturacion` y un super admin de KR System lo aprueba desde `/admin`. Se
eligió este camino porque Venezuela queda fuera de la cobertura de Stripe (ni
siquiera registrando el negocio en Panamá — lo que importa es el país de
registro del negocio, no el país del banco) y las alternativas con soporte
real para Pago Móvil/Zelle/transferencias locales (Cobrix, EBANX) requieren
onboarding propio que todavía no se ha hecho.

## Cómo funciona el bloqueo

El estado vive en tres campos de `Org`: `isExempt`, `monthlyFeeUsdCents`,
`nextPaymentDueDate`. La regla exacta está en `isOrgBlocked()`
(`lib/billing.ts`):

- `isExempt: true` → nunca bloquea, sin importar la fecha.
- `nextPaymentDueDate: null` → nunca bloquea (org recién creada, aunque en la
  práctica esto no debería pasar: el trial se arranca solo al crear la org,
  ver más abajo).
- En cualquier otro caso: bloquea cuando ya pasaron más de 5 días
  (`GRACE_DAYS`) desde `nextPaymentDueDate`.

`requireSession()` (usada por casi toda página autenticada) redirige a
`/facturacion` cuando `billingBlocked` es `true`. Esa página se lee con
`getSession()`, no con `requireSession()`, para no crear un ciclo de
redirecciones sobre sí misma. Un `isSuperAdmin` nunca queda bloqueado, para
poder entrar siempre a gestionar la facturación de cualquiera.

## El alta con Google es automática, el trial también

A diferencia de KYRA CITAS/APP NEW (donde un super admin aprueba cada alta
nueva a mano), aquí el registro es "completamente automatizado" por diseño
— con Google o con correo/clave. Por eso el trial de `TRIAL_DAYS` (14 días)
se arranca directo en `createOrgWithOwner()` (`lib/org-provisioning.ts`), no
en un paso de aprobación aparte que aquí no existe.

## El flujo completo

1. El ADMIN de una org ve en `/facturacion` cuánto debe (`monthlyFeeUsdCents`),
   cuándo vence, y las instrucciones de pago (`PlatformSettings.paymentInstructions`,
   texto libre que configura el super admin desde `/admin`).
2. Paga por fuera de la app (Transferencia, Pago Móvil o Zelle) y sube un
   `PaymentReport` con foto del comprobante — obligatorio — más una o varias
   líneas de método de pago. La página también le pide mandar el mismo
   comprobante por WhatsApp, porque es como el super admin realmente se
   entera de que hay algo que revisar.
3. Un super admin ve los reportes pendientes en `/admin` y los aprueba o
   rechaza. Aprobar crea un `Payment` (el registro real de "esto sí se
   cobró") y adelanta `nextPaymentDueDate` según cuántos meses cubre el
   monto reportado — un año prepagado de una vez (múltiplo exacto de 12
   meses) gana 2 meses de regalo (`monthsCoveredWithBonus` en
   `lib/billing.ts`).
4. El super admin también puede registrar un pago directo
   (`recordMaintenancePayment`, sin pasar por un reporte) o exonerar una org
   por completo (`isExempt`) — para cuentas internas de KR System, demos,
   etc.

## `User.isSuperAdmin`

No es un rol de organización (`Role` sigue siendo sólo `ADMIN`/`MEMBER`) —
es una bandera de plataforma, ortogonal a cualquier org, y **no se puede
activar desde la app**: sólo se cambia directo en la base de datos (ver
`prisma/seed.ts`).

## Los planes

El precio no vive en el código — lo define el super admin en
`PlatformSettings.defaultMonthlyFeeUsdCents` desde `/admin`, y se aplica
automáticamente a toda org nueva. Punto de partida sugerido: **$30/mes**
(mismo precio que el plan Basic original). 14 días de prueba gratis antes de
pedir el primer pago.

La tasa Bs/USD para previsualizar montos en bolívares
(`PlatformSettings.billingExchangeRate`) se actualiza sola una vez al día
contra el BCV (`app/api/cron/bcv-rate/route.ts`, mismo origen —
ve.dolarapi.com— que usan KYRA CITAS y APP NEW), y también hay un botón
manual en `/admin` para no esperar al próximo disparo.

## Qué NO hace todavía este código

- No hay límites de plan (números de WhatsApp, agentes) que se hagan cumplir
  en la aplicación — sólo existe un precio mensual plano por org.
- Sigue pendiente evaluar Cobrix (plataforma de cobros recurrentes hecha
  para Venezuela, con Pago Móvil/Zelle/Binance nativos) como una vía para
  automatizar este flujo más adelante — por ahora el reporte manual es
  deliberadamente la solución más simple que funciona hoy.

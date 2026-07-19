# Roadmap y deuda técnica

Inventario honesto del estado del proyecto. Está ordenado por impacto, no por esfuerzo.

Lo marcado como ✅ ya se corrigió al preparar la publicación del repositorio.

---

## Seguridad

- [x] **Secretos hardcodeados.** La clave privada de la wallet, la dirección del contrato y la URL RPC estaban escritas en `tracing.service.ts`. Ahora se leen del entorno y el servicio falla al arrancar si faltan.
- [x] **Cuenta privilegiada hardcodeada.** El seed promovía a `admin` un email concreto escrito en el código. Ahora el administrador se define únicamente por `ADMIN_EMAIL`.
- [x] **Validación de entrada inactiva.** Los DTOs usaban `class-validator` pero nunca se registró un `ValidationPipe` global, así que ningún decorador se ejecutaba. Ya está activo con `whitelist` y `forbidNonWhitelisted`.
- [ ] **Verificación de propiedad de recursos (IDOR).** La mayoría de endpoints de `farms`/`crops`/`activities`/`harvests` comprueban el JWT pero no que el recurso pertenezca a quien lo pide: con un `farmId` ajeno se accede a datos de otro productor. Es el fallo abierto más serio.
- [ ] **Autorización por roles ad-hoc.** El rol es un campo `string` libre y la única comprobación (`rol !== 'admin'`) está escrita a mano dentro de `ReportService`. Falta un `RolesGuard` con un decorador `@Roles()` y un enum de roles.
- [ ] **Sin rotación ni revocación de refresh tokens.** `refreshToken()` reemite el access token sin invalidar el refresh usado. Un refresh token filtrado sirve durante 7 días.
- [ ] `FarmEntity.name` es único a nivel global en vez de por usuario: un productor puede bloquear nombres de granja a los demás.

## Fiabilidad

- [x] **`PATCH /activities` colgaba la petición.** El endpoint estaba expuesto en el gateway pero su handler estaba comentado, así que el mensaje nunca se respondía y el cliente esperaba hasta el timeout. Handler restaurado.
- [x] **El servicio `tracing` no compilaba.** Faltaba `resolveJsonModule` en `tsconfig.json` para importar el ABI. Los cuatro servicios compilan ahora.
- [ ] **Ack antes de procesar.** Cada handler llama a `acknowledgeMessage()` al inicio, así que un fallo posterior pierde el mensaje definitivamente. Debe confirmarse tras procesar con éxito, y añadirse DLQ y reintentos.
- [ ] **Escrituras no transaccionales entre BD e IPFS.** Si Pinata falla después de guardar la actividad en Postgres, la metadata queda desincronizada sin compensación. Hace falta outbox o reintentos idempotentes.
- [ ] **Condición de carrera al leer el `tokenId`.** Tras el mint se hace `queryFilter('Transfer')` sobre todo el historial y se toma el último evento, que puede ser el mint de otro usuario. Debe leerse del recibo de la propia transacción.
- [ ] **`gasPrice` fijo hardcodeado** (1000 gwei): sobrepaga o falla según la congestión de la red.
- [ ] Los archivos subidos van a `uploads/` en disco local, lo que impide escalar a más de una instancia.
- [ ] Sin filtro global de excepciones: los servicios devuelven `{status:'error'}` con HTTP 200 y los códigos son inconsistentes entre `farms` y `tracing`.

## Calidad y arquitectura

- [ ] **Cobertura de tests: 0%.** Sólo existen los cuatro `app.e2e-spec.ts` de plantilla de NestJS, que además `testRegex` ni siquiera ejecuta. Prioridad: tests unitarios del flujo de trazabilidad y e2e de autenticación.
- [ ] **Sin CI.** Falta un workflow que ejecute lint, build y tests en cada push.
- [ ] **Acoplamiento entre microservicios.** `tracing` importa `CropsService` y `HarvestService` de `farms` por ruta relativa (`../../farms/src/...`) en vez de comunicarse por RabbitMQ, lo que rompe el aislamiento. Los tres servicios comparten además una única base de datos.
- [ ] **Lógica de trazabilidad duplicada.** `getMetadataPinata`, `setMetadataPinata` y `formatActivityMetadata` están copiadas entre `activities`, `harvests`, `crops` y `tracing`. Deberían vivir en un único módulo compartido.
- [ ] **Capa de repositorios sin usar.** `libs/common/src/repositories` define un patrón Base que casi nadie consume: en `farms` los tokens `CropsRepositoryInterface`, `ActivitiesRepository` y `HarvestRepository` apuntan todos por copy-paste a `FarmsRepository`, mientras los servicios usan `@InjectRepository` directo. O se adopta o se elimina.
- [ ] **`synchronize: true` en TypeORM**, con el aviso de "no usar en producción" en el propio código. Debe migrarse al flujo de migraciones que ya está configurado en los scripts.
- [ ] Quedan `console.log` en código de producción; debe usarse el `Logger` de Nest de forma consistente.
- [ ] Relaciones inversas mal declaradas en las entidades (`(x) => x.id` en vez de la propiedad relacional). TypeORM lo tolera, pero es incorrecto.
- [ ] El reporte se exporta con `workbook.csv.write()` y cabecera `.csv` pese a usar ExcelJS: o se genera `.xlsx` real o se elimina la dependencia.
- [ ] Typos de contrato: `CreateHarvestDto.categroy`, `@IsNumber()` sobre un `string`, y `activitiesByFarm` que en realidad busca por `cropId`.
- [ ] `GET /tracing/getHello` es un endpoint público de prueba que debería eliminarse.

## Producto

- [ ] Consulta pública de trazabilidad por QR, para que el consumidor final verifique un lote sin cuenta.
- [ ] Migrar la lectura de metadata a un gateway IPFS propio o verificación local del CID, en vez de depender del gateway de Pinata.
- [ ] Internacionalización: los atributos de metadata y las cabeceras de los reportes están fijados en español.

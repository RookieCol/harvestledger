# Estudio: panorama de la trazabilidad agroalimentaria (2025–2026)

> Investigación que motivó la decisión de retirar blockchain del proyecto y reenfocarlo como laboratorio de arquitectura distribuida. Se conserva aquí para no perderla.
>
> **Método.** Tres pasadas con un harness de investigación adversarial (~320 subagentes en total). Cada afirmación pasó por verificación de 3 votos contra fuentes primarias; una afirmación necesitaba ≥2 refutaciones para descartarse. Fecha de verificación: **19–20 de julio de 2026**.
>
> **Cómo leer la confianza.** `alta` = corroborada por fuente primaria releída directamente. `media` = fuente única o con matiz. Las secciones "Refutado" listan afirmaciones que *sonaban_ correctas y no sobrevivieron — igual de útiles para no repetirlas.

---

## Resumen ejecutivo

El sector de la trazabilidad agroalimentaria se **de-blockchainizó** de forma silenciosa. El vendor insignia (IBM) retiró su producto; la startup más citada (Provenance) borró toda mención a blockchain de su web; el framework open source de referencia (Hyperledger Grid) está End-of-Life. Los estándares que **sí** gobiernan la interoperabilidad hoy —GS1 EPCIS 2.0, W3C Verifiable Credentials 2.0, UN/CEFACT UNTP— no requieren token, NFT ni ledger. La presión regulatoria (EUDR, FSMA 204, EU DPP) es real pero se ha retrasado. Y la premisa técnica del proyecto original —"metadata en IPFS ⇒ inmutable"— confunde integridad con disponibilidad: IPFS da lo primero, no lo segundo.

**Posición defendible en 2026:** EPCIS 2.0 está asentado; las VCs están ratificadas pero inmaduras en despliegue; los tokens no forman parte de ninguna de las dos historias.

---

## Pasada 1 — Panorama, estándares y regulación

### 1. IBM Food Trust retirado como producto · `alta`
`ibm.com/products/food-trust` → 301 a la portada genérica de productos; toda la subrama `/products/blockchain-*` colapsa igual, e `ibm.com/blockchain` redirige a un artículo editorial. IBM Blockchain Platform llegó a fin de soporte el 30-abr-2023; en enero de 2025 IBM publicó la retirada del Supply Chain Intelligence Suite (que empaquetaba Food Trust).
**Matiz:** prueba retirada *comercial* en un vendor, no que el servicio esté apagado para clientes existentes.
Fuentes: ibm.com/products/food-trust · [fin de soporte IBM Blockchain Platform](https://www.ibm.com/support/pages/ibm-blockchain-platform-software-reaches-end-support-april-30-2023) · [retirada SCIS](https://www.ibm.com/support/pages/cloud-service-program-withdrawal-ibm-supply-chain-intelligence-suite-and-ibm-blockchain-transparent-supply-and-select-parts-withdrawal-ibm-sterling-order-management)

### 2. UN/CEFACT UNTP se construye sobre VCs y DIDs, y declina token/ledger · `alta`
Texto de la spec: *"the W3C Verifiable Credentials and DID standards that underpin all UNTP credentials"* y *"a connected graph of verifiable data that supports automated compliance assessment without any central authority or data store"*. Pruebas con JOSE; DIDs `did:web` y `did:webvh`; revocación con W3C Bitstring Status List; requisito de diseño **VC-08**: *"Avoid driving users towards closed ecosystems or proprietary ledgers."* Vocabulario de credenciales: DPP, DFR, DTE, DCC, DIA.
Fuentes: [untp.unece.org/docs/specification](https://untp.unece.org/docs/specification/) · [.../VerifiableCredentials](https://untp.unece.org/docs/specification/VerifiableCredentials/)

### 3. GS1 EPCIS 2.0 / CBV 2.0 es el estándar asentado · `alta`
Ratificado jun-2022; adoptado como **ISO/IEC 19987:2024** (CBV como ISO/IEC 19988). Artefacto vigente EPCIS 2.0.1 / CBV 2.0.0 (no hay 2.1/3.0 a jul-2026). La 2.0 añade JSON/JSON-LD normativo (con JSON Schema y SHACL publicados), bindings REST además de SOAP/AS2, y OpenAPI 3 en el repo de GS1. Digital Link integrado normativamente (§7.3.3.1.2, §6.4 del PDF ratificado de 229 páginas).
Fuentes: [gs1.org/standards/epcis](https://www.gs1.org/standards/epcis) · [ISO/IEC 19987:2024](https://www.iso.org/standard/85557.html) · [OpenAPI en GitHub](https://github.com/gs1/EPCIS/blob/master/REST%20Bindings/openapi.yaml)

### 4. W3C VC 2.0 es estándar web terminado, con confianza basada en firmas · `alta`
Siete W3C Recommendations el 15-may-2025 (VC Data Model 2.0, Securing VCs using JOSE/COSE, VC Data Integrity, Controlled Identifiers 1.0, Bitstring Status List…). Modelo de confianza, verbatim: *"The authenticity and integrity of a verifiable credential come from using cryptography, especially through the use of digital signatures and related mathematical proofs."* Blockchain no aparece en la ruta normativa de aseguramiento.
Fuentes: [comunicado W3C](https://www.w3.org/press-releases/2025/verifiable-credentials-2-0/) · [VC Data Model 2.0](https://www.w3.org/TR/vc-data-model-2.0/)

### 5. GS1 + W3C convergen en VCs sobre identificadores GS1, sin ledger obligatorio · `alta`
Phil Archer (GS1 Global Office) en el comunicado del W3C: GS1 "ya está implementando muchos de los estándares actualizados, con cautela por ahora". El perfil W3C CCG "Traceability Interoperability v1.0" exige `did:web`, OAuth 2.0 Client Credentials y ES256 — infraestructura web pura. Los métodos DID con ledger están permitidos pero en ningún punto requeridos.
Fuentes: [W3C CCG Traceability Interop v1.0](https://www.w3.org/community/reports/credentials/CG-FINAL-traceability-interop-20241204/)

### 6. No sobreafirmar la madurez de VC/DID · `alta`
Informe de panorama técnico de **GS1 (feb-2025)**, verbatim: *"there is no dominant approach or widespread adoption"*, *"many 'flavours' of VC-based solutions… not necessarily interoperable"*, *"ubiquitous use may be a decade away. Proceed with caution!"* El perfil W3C CCG es un Community Group Final Report — **no** es W3C Standard ni está en la vía de estándares. (VCDM 2.0 sí es Recommendation; el perfil de trazabilidad encima, no.) UNTP a la fecha estaba en v0.7.x, apto para pilotos pre-producción.
Fuentes: [GS1 VCs & DIDs tech landscape](https://ref.gs1.org/docs/2025/VCs-and-DIDs-tech-landscape)

### 7. EUDR: fecha vigente 30-dic-2026 · `alta`
Reglamento (UE) 2025/2650 (DO 23-dic-2025) mueve la aplicación general de la EUDR al **30-dic-2026**, y al **30-jun-2027** para microempresas/pequeñas y personas físicas establecidas antes del 31-dic-2024. Ya se ha retrasado dos veces (2024/3234 → dic-2025; 2025/2650 → dic-2026).
Fuentes: [EUR-Lex 2025/2650](https://eur-lex.europa.eu/eli/reg/2025/2650/oj/eng) · [Consejo UE](https://www.consilium.europa.eu/en/press/press-releases/2025/12/18/deforestation-council-signs-off-targeted-revision-to-simplify-and-postpone-the-regulation/)

### Refutado en la pasada 1 (no repetir)
- Que GS1 declare que blockchain no es necesario para identidad descentralizada, o que favorezca KERI/did:webs/did:tdw.
- Que la "arquitectura oficial" de GS1 empareje EPCIS con VCs y peer-DIDs como cuatro building blocks nombrados.
- Que la confidencialidad comercial sea "el bloqueador central que GS1 identifica".
- Que el JSON-LD de EPCIS 2.0 se diseñara para compatibilidad directa como payload de VC.
- Que el perfil W3C CCG sea "la alternativa en vía de estándar al patrón NFT-por-lote".
- El white paper GS1 End-to-End Traceability falló verificación como fuente 4 veces — tratar como no verificado.

---

## Pasada 2 — Estado operativo de plataformas y open source

### 8. Provenance: vivo, pero sin blockchain en su posicionamiento · `alta`
Home: "The independent source of proven product claims"; plataforma de claims con IA. **Cero** menciones a blockchain/DLT/web3 en home ni /about; "blockchain" solo sobrevive en posts de archivo anteriores a 2023. Escala autorreportada: 1.600+ marcas, 81.000+ productos.
**Matiz:** de-énfasis documentada, no un pivote publicado; el silencio de marketing prueba cambio de mensaje, no necesariamente de backend.
Fuentes: [provenance.org](https://www.provenance.org/) · /about · /news

### 9. Farmer Connect absorbida por Agridence (ago-2025) · `alta`
Adquisición anunciada el 20-ago-2025; `farmerconnect.com` → 301 a `agridence.com`. Posicionamiento a la adquisición: SaaS de cumplimiento EUDR/DDS con integración a EU TRACES, sin mención a blockchain. Farmer Connect se había lanzado sobre IBM Food Trust.
Fuentes: [Baker McKenzie](https://www.bakermckenzie.com/en/newsroom/2025/08/agridence-acquires-farmer-connect) · [agridence.com](https://agridence.com/)

### 10. Los proveedores EUDR de nueva generación son SaaS cloud convencional · `alta`
osapiens HUB documenta su arquitectura como cinco motores nombrados (IoT, Event Streaming, iPaaS/DataHUB, AI, App-Development) — ninguno es DLT. Datos en servidores UE; ISO 9001/27001, SOC 2 Type II. Enumerar cinco motores y omitir el ledger es evidencia afirmativa, no mero silencio.
**Matiz:** describe el producto *actual*, no que nunca comercializara blockchain.
Fuentes: [osapiens EUDR](https://osapiens.com/solutions/eudr/) · [osapiens platform](https://osapiens.com/platform/)

### 11. Hyperledger Grid: End-of-Life, archivado desde 2023-03-23 · `alta`
README: *"Hyperledger Grid has moved to End of life status."* Repo en `hyperledger-archives`, 11.069 commits congelados. La LFDT atribuye el desenlace de Sawtooth (del que Grid dependía) a *"complexity, competition with other blockchain platforms and issues with growing the number of contributors and maintainers"*.
Fuentes: [hyperledger-archives/grid](https://github.com/hyperledger-archives/grid) · [retrospectiva LFDT](https://www.lfdecentralizedtrust.org/blog/blockchain-pioneers-hyperledger-sawtooth-grid-and-transact)

### 12. Lo vivo en open source es lo basado en estándares, no en blockchain · `alta`
**OpenEPCIS** (implementación EPCIS 2.0, Apache-2.0): 6 repos con pushes de código en los 10 días previos al 19-jul-2026, y módulo `openepcis-dpp-ready` alineado a ESPR 2024/1781 que cubre EUDR y FSMA 204. *Matiz:* parece proyecto de un solo vendor (benelog GmbH) — prueba que está vivo, no adopción multi-vendor. **UNTP** migró a GitLab de la ONU (UNICC), ~473 commits adicionales sobre el repo GitHub archivado. **GS1 Digital Link Resolver CE**: vivo (Apache-2.0) pero GS1 declina mantenerlo y no es implementación de referencia normativa. **OriginTrail DKG**: muy activo pero repivotado a "memoria para agentes de IA", ya no a trazabilidad.
Fuentes: [OpenEPCIS](https://github.com/orgs/openepcis/repositories) · [openepcis-dpp-ready](https://github.com/openepcis/openepcis-dpp-ready) · [UNTP GitLab](https://opensource.unicc.org/un/unece/uncefact/spec-untp)

### 13. FSMA Rule 204: fecha genuinamente sin resolver · `alta`
La extensión a 20-jul-2028 fue solo una regla **propuesta** (Federal Register 2025-14967, 7-ago-2025). A 19-jul-2026 no se había publicado regla final, mientras la fecha original de 20-ene-2026 ya venció. Un reunión pública de la FDA (28-may-2026) sobre trazabilidad a nivel de lote sugiere que la implementación seguía en revisión. **No** afirmar "el plazo de FSMA 204 es jul-2028".
Fuentes: [Federal Register 2025-14967](https://www.federalregister.gov/documents/2025/08/07/2025-14967/requirements-for-additional-traceability-records-for-certain-foods-compliance-date-extension)

### Huecos que la pasada 2 NO cerró
TE-FOOD, AgriDigital, Bext360, OpenSC, Connecting Food, Ripe.io, Transparent Path, Trace Labs (ausencia de hallazgo ≠ muerte); los KDE/CTE y la Food Traceability List de FSMA 204; los actos delegados del EU Digital Product Passport; Open Food Facts; Trace Foundation.

---

## Pasada 3 — Inmutabilidad sin blockchain y crítica citable

### 14. IPFS da integridad, no disponibilidad · `alta`
Documentación oficial, verbatim: *"While IPFS guarantees that any content on the network is discoverable, it doesn't guarantee that any content is persistently available."* Un CID da tamper-evidence (los bytes no cambian en silencio bajo el mismo CID); no da permanencia. Formulación correcta: "IPFS da integridad, no disponibilidad" — NO "IPFS no da inmutabilidad".
Fuentes: [docs.ipfs.tech/concepts/persistence](https://docs.ipfs.tech/concepts/persistence/)

### 15. La persistencia exige pinning continuado; sin pago, GC · `alta`
Los bloques no pinneados son elegibles para garbage collection. Pinata: al despinnear, el archivo *"gets placed into a queue to be handled by Garbage Collection… This process deletes all unpinned content from an IPFS storage node."* IPFS docs: *"if that one sponsor stops paying for that pinning, the content may be lost entirely."*
**Matiz:** el vínculo impago→borrado es inferencia lógica, no política publicada de Pinata.
Fuentes: [docs.ipfs.tech/concepts/persistence](https://docs.ipfs.tech/concepts/persistence/) · [Pinata: unpinning](https://knowledge.pinata.cloud/en/articles/5506024-what-does-unpinning-a-file-mean)

### 16. Filecoin cubre el hueco de incentivos de IPFS con pruebas periódicas · `alta`
PoRep valida al inicio que se creó y almacenó una copia única; PoSt valida que el proveedor *sigue* almacenándola. Deals contractuales acotados (mín. 180 / máx. 540 días). WindowPoSt: cada sector se prueba en un proving period de 24 h subdividido en 48 deadlines de 30 min.
**Matices:** es periódico, no continuo; es atestiguado y penalizado económicamente, no una garantía absoluta; almacenamiento ≠ recuperabilidad.
Fuentes: [docs.filecoin.io proofs](https://docs.filecoin.io/core-concepts/filecoin-virtual-machine/proofs) · [spec.filecoin.io PoSt](https://spec.filecoin.io/algorithms/pos/post/)

### 17. El estado del arte sin blockchain: el modelo tlog · `alta`
Certificate Transparency demuestra la propiedad append-only con árboles de Merkle firmados, sin blockchain (RFC 6962 §2.1.2). Pruebas de inclusión logarítmicas (`ceil(log2(n))+1` nodos). En producción: Trillian y **Sigstore Rekor** (v2 GA oct-2025), usados por PyPI (nov-2024) y npm (jul-2025).
Fuentes: [RFC 6962](https://www.rfc-editor.org/rfc/rfc6962.html) · [RFC 9162](https://www.rfc-editor.org/rfc/rfc9162.html) · [transparency.dev](https://transparency.dev/verifiable-data-structures/) · [Sigstore Rekor](https://docs.sigstore.dev/logging/overview/)

### 18. La respuesta a la pregunta clave: tamper-evident, no tamper-proof · `alta`
Un log append-only da **tamper-evidence**, no **tamper-prevention**, y su garantía es condicional a que existan monitores/witnesses que comparen y retengan tree heads firmados. El hueco residual es el **ataque de split-view** — exactamente lo que el consenso de una blockchain pública cierra por construcción, y lo que una witness network o el anclaje agregado (OpenTimestamps) cierran más barato. Sigstore lo admite: *"If no third parties monitor the logs, then any misbehavior by Rekor and Fulcio might go undetected."* Además, la presencia en el log no confiere veracidad al contenido — la formulación técnica del *garbage-in-garbage-out* / oracle problem.
Fuentes: [RFC 6962](https://www.rfc-editor.org/rfc/rfc6962.html) · [transparency.dev](https://transparency.dev/verifiable-data-structures/) · [Sigstore security model](https://docs.sigstore.dev/about/security/) · Chuat et al., IEEE CNS 2015 ([arXiv:1511.01514](https://arxiv.org/abs/1511.01514))

### Sobreafirmaciones a evitar (detectadas en verificación)
1. "IPFS no da inmutabilidad" — falso; da integridad, no disponibilidad.
2. "Pinata borra tus archivos si dejas de pagar" — no documentado como política; es inferencia.
3. "Filecoin garantiza persistencia continuamente" — es periódico y penalizado, no absoluto.
4. "GC borra automáticamente" — en Kubo la GC automática está off por defecto.
5. "Un tlog equivale a anclar en blockchain" — solo si hay witnesses; si no, queda el split-view.

### Hueco declarado de la pasada 3
No sobrevivió **ningún** paper citable sobre el oracle problem con autor/año/venue, ninguna cifra de fracaso de pilotos blockchain (Gartner/Deloitte/Forrester), ni ningún análisis publicado con números del patrón NFT-por-lote. Único rastro útil: [arXiv:2210.11166](https://arxiv.org/abs/2210.11166) (pérdida real de metadatos de NFTs). Tampoco sobrevivieron claims sobre Arweave ni OpenTimestamps pese a estar en el encargo. Estos temas quedan abiertos para una futura pasada dedicada.

---

## Sesgos y límites del estudio

- **Sesgo de fuentes:** buena parte de la evidencia técnica se apoya en documentación primaria de vendors/protocolos (docs.ipfs.tech, Pinata, docs.filecoin.io, sigstore.dev). Es fuerte cuando la fuente admite una *limitación propia* (admisión contra interés), pero Protocol Labs desarrolla tanto IPFS como Filecoin — declarado. Las excepciones no-vendor de máxima calidad son los RFC del IETF (6962/9162) y EUR-Lex.
- **Sensibilidad temporal:** FSMA 204 es lo más volátil (una regla final cambiaría la fecha); el ecosistema Sigstore se mueve rápido; el informe GS1 "wait and see" es de feb-2025 y predata la ratificación de VC 2.0. Todo verificado a 2026-07-19/20.
- **Cobertura asimétrica:** la primera pasada cubrió estándares/regulación; la segunda, estado de plataformas; la tercera, persistencia sin blockchain. Los huecos declarados arriba (empresas de primera ola, KDE/CTE de FSMA, actos delegados del DPP, literatura del oracle problem con cifras) siguen abiertos.

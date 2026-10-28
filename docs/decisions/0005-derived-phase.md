# 0005 · Fase del proyecto derivada, no almacenada

Fecha: 2026-10-28 · Estado: aceptada

## Contexto
La fase depende de varias entidades (resumen, sesiones, hipótesis, experimentos). Guardarla aparte invita a que se desincronice.

## Decisión
`derivePhase` y `deriveDiagnosisStatus` calculan el estado en cada lectura a partir de los datos.

## Consecuencias
- Imposible que la fase contradiga los datos.
- Cálculo en cada carga; trivial al tamaño actual. Si se necesita filtrar por fase en SQL, crear una vista.

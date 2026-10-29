import type { MentorResource } from "@/types/domain";

export const DEFAULT_MENTOR_RESOURCES: MentorResource[] = [
  {
    id: "minto",
    title: "Principio de la Pirámide de Minto",
    category: "guide",
    description: "Aprende a estructurar tus ideas empezando por la conclusión principal, seguida de argumentos de apoyo y finalmente los datos y detalles.",
    tags: ["guía", "comunicación", "estrategia", "minto"],
    content: `### Principio de la Pirámide de Minto

#### 1. Conclusión Principal
Empieza siempre por la recomendación, decisión o tesis central en una sola frase contundente.

#### 2. Argumentos de Apoyo
Agrupa tus razones en máximo 3 pilares clave estructurados de manera lógica y mutuamente excluyente:
- Facilidad de implementación y costo marginal bajo.
- Soporte personalizado y validación directa con primeros clientes.
- Integración ágil con herramientas ya adoptadas.

#### 3. Datos y Evidencia
Aporta métricas cuantitativas, casos reales o testimonios para sustentar cada argumento sin abrumar con detalles prematuros.`,
    isPublic: true,
    createdAt: "2026-10-29T12:00:00.000Z",
    updatedAt: "2026-10-29T12:00:00.000Z",
  },
  {
    id: "business-plan",
    title: "Plantilla de Plan de Negocio",
    category: "template",
    description: "Formato sintético para presentar propuesta de valor, estructura de costos, proyecciones de tracción y necesidades de capital.",
    tags: ["plantilla", "estructura", "finanzas", "estrategia"],
    content: `### Plantilla Ejecutiva de Plan de Negocio

1. **Resumen Ejecutivo**: El propósito de la empresa y la oportunidad insatisfecha en el mercado actual.
2. **Problema y Propuesta Única de Valor**: La tensión que sufre el usuario y el beneficio diferenciador comprobado.
3. **Modelo de Monetización**: Mecanismos de captura de valor, precios unitarios y márgenes brutos estimados.
4. **Plan Operativo y Proyección Financiera**: Metas e hitos trimestrales a 12 meses con supuestos de costo y adquisición.`,
    isPublic: true,
    createdAt: "2026-10-29T12:00:00.000Z",
    updatedAt: "2026-10-29T12:00:00.000Z",
  },
  {
    id: "prep-exercise",
    title: "Ejercicio PREP - Objeciones de clientes",
    category: "framework",
    description: "Estructura respuestas contundentes ante dudas comerciales usando la fórmula Punto, Razón, Ejemplo y Punto final.",
    tags: ["ejercicio", "ventas", "validación", "prep"],
    content: `### Método PREP para Argumentación Comercial

- **P (Punto)**: Formula tu afirmación o respuesta directa en una sola oración concisa.
- **R (Razón)**: Explica el porqué subyacente de tu solución y la lógica detrás del precio o funcionalidad.
- **E (Ejemplo)**: Comparte una experiencia real, caso de estudio o métrica demostrable que valide la razón.
- **P (Punto final)**: Reitera la conclusión y haz un llamado a la acción concreto hacia el cliente o mentor.`,
    isPublic: true,
    createdAt: "2026-10-29T12:00:00.000Z",
    updatedAt: "2026-10-29T12:00:00.000Z",
  },
  {
    id: "res-canvas-lean-01",
    title: "Lean Business Model Canvas para Validación Rápida",
    category: "framework",
    description: "Adaptación del Canvas enfocado en problemas reales, propuesta única de valor y canales tempranos antes de escalar.",
    tags: ["modelo de negocio", "lean", "propuesta de valor", "clientes"],
    content: `### Lean Business Model Canvas

1. **Problema**: Los 3 problemas principales del segmento objetivo. ¿Qué alternativas existentes usan hoy?
2. **Segmento de clientes**: Primeros adoptantes (early adopters) con características demográficas y psicográficas concretas.
3. **Propuesta Única de Valor**: Mensaje claro, simple y convincente que explica por qué eres diferente y vale la pena prestar atención.
4. **Solución**: Las 3 características mínimas indispensables para resolver el problema principal.
5. **Canales**: Rutas directas hacia los clientes (sin depender de pauta masiva).
6. **Flujos de ingreso**: Modelo de monetización, precio inicial y frecuencia.
7. **Estructura de costos**: Costos fijos y variables indispensables para poner a prueba la oferta.
8. **Métricas clave**: La señal vital que demuestra tracción semanal.
9. **Ventaja injusta**: Algo que no se pueda copiar ni comprar fácilmente.`,
    isPublic: true,
    createdAt: "2026-10-29T12:00:00.000Z",
    updatedAt: "2026-10-29T12:00:00.000Z",
  },
  {
    id: "mece",
    title: "Marco MECE - Análisis de mercado",
    category: "guide",
    description: "Principio de exclusión mutua y exhaustividad colectiva para segmentar clientes y competidores sin solapamientos ni omisiones.",
    tags: ["guía", "estrategia", "análisis", "mece"],
    content: `### Principio MECE (Mutually Exclusive, Collectively Exhaustive)

- **Mutuamente Excluyentes (ME)**: Cada categoría, segmento o hipótesis debe ser única e independiente. Ningún dato puede pertenecer a dos clasificaciones a la vez.
- **Colectivamente Exhaustivos (CE)**: La suma total de todas las categorías debe cubrir el 100% del universo de análisis sin dejar cabos sueltos.
- **Aplicación**: Úsalo al diagnosticar causas de baja tracción, segmentar perfiles de comprador o priorizar competidores directos e indirectos.`,
    isPublic: true,
    createdAt: "2026-10-29T12:00:00.000Z",
    updatedAt: "2026-10-29T12:00:00.000Z",
  },
  {
    id: "res-mom-test-02",
    title: "Guía de Entrevista Cualitativa (The Mom Test)",
    category: "questionnaire",
    description: "Marco de entrevista para aprender de los clientes sin inducir respuestas complacientes ni vender prematuramente.",
    tags: ["entrevistas", "clientes", "validación", "descubrimiento"],
    content: `### Protocolo The Mom Test

#### Reglas de oro:
- **No preguntes por el futuro**: " ¿Pagarías por X?" siempre genera respuestas positivas falsas. Pregunta por el pasado real: "¿Cómo resolviste este problema la última vez?".
- **Habla de su vida, no de tu idea**: Haz que el entrevistado hable el 80% del tiempo sobre sus dolores cotidianos.
- **Busca hechos y cifras concretas**: Pregunta cuánto tiempo o dinero gastaron en resolverlo en los últimos 3 meses.

#### Preguntas recomendadas:
1. "¿Qué fue lo más frustrante que te ocurrió la última vez que intentaste [hacer la actividad]?"
2. "¿Por qué fue tan molesto y qué consecuencias tuvo para tu negocio o rutina?"
3. "¿Intentaste alguna solución o herramienta alternativa? Si no intentaste nada, ¿por qué no fue prioritario?"
4. "¿Cuánto dinero o tiempo te costó esa alternativa?"
5. "¿Dónde sueles buscar información cuando surge este problema?"`,
    isPublic: true,
    createdAt: "2026-10-29T12:00:00.000Z",
    updatedAt: "2026-10-29T12:00:00.000Z",
  },
  {
    id: "res-matriz-ice-03",
    title: "Matriz ICE de Priorización de Iniciativas",
    category: "framework",
    description: "Método simple y numérico para desempatar ideas y elegir las 2 acciones prioritarias de la semana.",
    tags: ["priorización", "productividad", "decisiones", "estrategia"],
    content: `### Matriz ICE (Impact, Confidence, Ease)

Calcula el puntaje para cada tarea, hipótesis o experimento en una escala del 1 al 10:

- **Impacto (I)**: Si tiene éxito absoluto, ¿cuánto mueve la aguja de los objetivos del proyecto? (1 = marginal, 10 = transformador)
- **Confianza (C)**: ¿Qué tan seguros estamos basados en evidencia previa (no en intuición) de que funcionará? (1 = disparo al aire, 10 = validado previamente)
- **Facilidad (E)**: ¿Qué tan rápido y con qué pocos recursos podemos ejecutarlo? (1 = meses y gran presupuesto, 10 = menos de 48 horas sin costo)

$$\\text{ICE Score} = \\frac{I + C + E}{3}$$

> **Criterio de acción**: Ordena de mayor a menor y ejecuta solo las iniciativas con puntaje $\\ge 7$. Si la confianza es baja (< 4), antes de construir haz una investigación rápida de 2 horas.`,
    isPublic: true,
    createdAt: "2026-10-29T12:00:00.000Z",
    updatedAt: "2026-10-29T12:00:00.000Z",
  },
  {
    id: "res-costos-unitarios-04",
    title: "Plantilla de Costo Unitario y Margen de Contribución",
    category: "template",
    description: "Esquema financiero para asegurar que cada venta genere margen positivo antes de buscar volumen.",
    tags: ["finanzas", "costos", "precios", "rentabilidad"],
    content: `### Análisis de Margen Unitario

1. **Precio de Venta al Público (PVP)**: $_______ (sin impuestos)
2. **Costos Variables Directos por Unidad**:
   - Insumos o materias primas: $_______
   - Mano de obra directa o tiempo de entrega: $_______
   - Costo de pasarela de pago o comisiones (% + fijo): $_______
   - Empaque, flete o envío: $_______
   **Total Costo Variable Unitario (CVU)**: $_______
3. **Margen de Contribución Unitario (MCU)**:
   $$MCU = PVP - CVU$$
4. **Porcentaje de Margen**:
   $$\\%MCU = \\frac{MCU}{PVP} \\times 100$$
5. **Punto de Equilibrio Operativo (unidades/mes)**:
   $$Q_{equilibrio} = \\frac{\\text{Costos Fijos Mensuales}}{MCU}$$`,
    isPublic: true,
    createdAt: "2026-10-29T12:00:00.000Z",
    updatedAt: "2026-10-29T12:00:00.000Z",
  },
  {
    id: "res-diagnostico-retraso-05",
    title: "Protocolo Empático de Diagnóstico de Retrasos",
    category: "guide",
    description: "Guía de conversación para desarmar la culpa y encontrar el obstáculo real cuando un compromiso no se cumple.",
    tags: ["accountability", "bloqueos", "mentoría", "ejecución"],
    content: `### Protocolo de Accountability No Punitivo

Cuando un compromiso o tarea no se cumplió a la fecha prevista:

1. **Apertura sin juicio**:
   - Evita: "¿Por qué no hiciste la tarea?"
   - Usa: "Veo que esta tarea quedó pendiente. Antes de reprogramarla, me interesa entender qué te frenó para que encontremos la forma de destrabarlo juntos."
2. **Clasificación de la causa raíz**:
   - **Claridad**: ¿La definición de la tarea era demasiado ambigua? (Solución: partirla en pasos de < 30 min).
   - **Tiempo / Capacidad**: ¿Surgieron urgencias operativas que devoraron la semana? (Solución: reducir el alcance).
   - **Recursos**: ¿Faltó una herramienta, dinero o acceso? (Solución: buscar alternativa de bajo costo).
   - **Factores Externos**: ¿Dependías de una respuesta que no llegó? (Solución: seguimiento proactivo).
   - **Dificultad Metodológica**: ¿No sabías cómo empezar el primer párrafo o llamada? (Solución: hacer los primeros 10 minutos juntos en sesión).
3. **Redefinición del compromiso**:
   - Formular una versión reducida ("micro-tarea") ejecutable en las próximas 48 horas.`,
    isPublic: true,
    createdAt: "2026-10-29T12:00:00.000Z",
    updatedAt: "2026-10-29T12:00:00.000Z",
  },
  {
    id: "res-smoke-test-06",
    title: "Patrón de Experimento: Preventa / Smoke Test",
    category: "experiment_pattern",
    description: "Estructura para verificar disposición a pagar real con una página de preventa o depósito anticipado.",
    tags: ["experimentos", "smoke test", "preventa", "validación"],
    content: `### Ficha de Experimento: Smoke Test de Preventa

- **Hipótesis central**: "Al menos 5 clientes ideales del segmento X pagarán un anticipo o harán clic en 'Comprar ahora' a un precio de $Y cuando vean nuestra oferta explicada en una landing page."
- **Métrica primaria**: Tasa de conversión a 'Comprar ahora' o cantidad absoluta de pagos de anticipo recibidos.
- **Criterio de éxito**: $\\ge 5$ transacciones o $\\ge 8\\%$ de conversión sobre al menos 50 visitas calificadas.
- **Criterio de rechazo**: $< 2$ transacciones con más de 100 visitas de clientes del segmento objetivo.
- **Riesgos y mitigación**: Si el producto no se va a producir inmediatamente, mostrar mensaje honesto: *"Estamos terminando la primera partida. Déjanos tu correo y no cobraremos tu tarjeta hasta que el pedido esté listo para envío"*.`,
    isPublic: true,
    createdAt: "2026-10-29T12:00:00.000Z",
    updatedAt: "2026-10-29T12:00:00.000Z",
  },
];

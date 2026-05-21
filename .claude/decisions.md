# Architecture Decision Records — kentia_calibration

## ADR-001: Stack inicial
**Fecha**: 2026-05-05
**Estado**: aceptada
**Contexto**: App de gestión de calibraciones para HERKO
**Decisión**: FastAPI + Motor async + MongoDB + React 18 + Tailwind + shadcn/ui + JWT
**Razón**: Stack ágil para prototipar rápido, MongoDB flexible para documentos de calibración complejos
**Consecuencias**:
- + Iteración rápida
- + Documentos anidados naturales para labels/datasets
- − Sin tipado fuerte en BD (compensar con Pydantic)

## ADR-002: Arquitectura multi-ECU preparada desde inicio
**Fecha**: 2026-05-21
**Estado**: pendiente de implementar
**Contexto**: Roadmap exige soporte para 2 ECUs en Q4/26 y n ECUs en el futuro
**Decisión**: Todos los modelos deben tener campo `ecu_id` desde el principio
**Razón**: Migrar después es costoso; prepararlo ahora es barato
**Consecuencias**:
- + Escalable al roadmap sin refactor
- − Ligera complejidad extra en fase inicial (aceptable)

## ADR-003: WorkPackages como entidad de primer nivel
**Fecha**: 2026-05-21
**Estado**: pendiente de implementar
**Contexto**: Requisito BeGas #4 — labels agrupados por workpackage/subworkpackage sin solapamiento
**Decisión**: WorkPackage como colección MongoDB independiente con referencia en Label
**Razón**: Permite queries eficientes y validación de no-solapamiento en servidor
**Consecuencias**:
- + Cumple requisito de no-solapamiento validable
- − Nueva colección a gestionar

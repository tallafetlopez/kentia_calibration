# Glossary — kentia_calibration

**Label**: Parámetro de calibración del ECU. Tiene nombre, valor, tipo, unidad, madurez, responsable.
**Dataset (DS)**: Conjunto de labels con valores en un momento dado, vinculado a una SW Release.
**SW Release**: Versión identificada del software del ECU (binario S37 + A2L asociado).
**A2L**: Fichero ASAP2 — define labels, tipos, direcciones de memoria, escalado. Generado por Matlab/Simulink.
**S37**: Fichero binario de calibración — valores actuales de los labels. Fichero master en producción.
**DCM**: Fichero INCA — sobreescritura de valores sobre S37. Usado en desarrollo/ingeniería.
**C file**: Fichero PiSnoop — calibración para flashing en EOL/producción.
**DLL**: Librería ECM-específica para challenge/response + configuración estática + logs de flashing.
**LAB file**: Lista de labels para filtrar visibilidad en revisiones/DCMs. Formato: secciones [LABEL] y [RAMCELL].
**ECM**: Engine Control Module — ECU de gestión del motor.
**VCU**: Vehicle Control Unit — segunda ECU a incorporar en BIOS42 (Q4/26).
**WorkPackage (WP)**: Agrupación funcional de labels. Labels no pueden pertenecer a múltiples WPs. Ej: AIR_ADM, AIR_VCP, TRQ_ADM, OVR_OVR, FUE_DFC.
**Madurez**: Estado de evolución de un label: 0% (inicial) → 25% → 75% → 100% (homologación) → Deprecated.
**HERKO**: OEM fabricante de camiones. Responsable de labels relacionados con operación del vehículo.
**BeGas**: Proveedor del SW del ECM. Responsable de labels relacionados con operación del motor.
**Shared**: Labels cuya responsabilidad es compartida entre BeGas y HERKO.
**R156**: Regulación UNECE sobre actualizaciones de software en vehículos. Exige trazabilidad completa.
**INCA**: Herramienta de calibración de AVL/ETAS. Trabaja con A2L + DCM.
**PiSnoop**: Herramienta de flashing de producción usada por HERKO. Trabaja con S37 + DLL + .c file.
**CRETA**: Herramienta AVL de estado del arte para calibration management (referencia del mercado).
**EOL**: End Of Line — proceso de producción/flashing en línea de fabricación.
**SUMS**: Sistema de gestión de homologación/producción de HERKO.
**RXSWIN**: Regulatory eXtension Software Identification Number — identificador para R156.
**VIN**: Vehicle Identification Number — para calibraciones VIN-específicas (post-sales).
**BIOS35**: Plataforma de SW actual del ECM (hoy).
**BIOS42**: Próxima plataforma de SW (Q4/26), introduce VCU + ECM dual.
**B430LG**: Plataforma/variante de vehículo específica (camión HERKO con motor BeGas).
**Label Sharing**: Proceso de transferencia de responsabilidad de labels de BeGas a HERKO según madurez.

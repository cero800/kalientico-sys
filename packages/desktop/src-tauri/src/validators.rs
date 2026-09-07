// Validaciones centralizadas. Todas devuelven Result<(), String> con mensaje
// legible para el usuario. Un error nunca debe llegar a comprometer la BD.

// Límites de seguridad (evitar input desmedido).
pub const MAX_MONTO: i64 = 99_999_999_999; // 999,999,999.99 (centavos)
pub const MAX_CANTIDAD: f64 = 1_000_000.0;

/// Monto no atómico general (precio, subtotal, total, pago).
pub fn validar_monto(monto: i64, campo: &str) -> Result<(), String> {
    if monto < 0 {
        return Err(format!("{campo} no puede ser negativo"));
    }
    if monto > MAX_MONTO {
        return Err(format!("{campo} excede el máximo permitido"));
    }
    Ok(())
}

/// Monto estrictamente positivo (un precio de venta nunca es 0/negativo).
pub fn validar_monto_positivo(monto: i64, campo: &str) -> Result<(), String> {
    if monto <= 0 {
        return Err(format!("{campo} debe ser mayor que 0"));
    }
    validar_monto(monto, campo)
}

/// Cantidad (puede ser decimal para kg, entera para unidad).
pub fn validar_cantidad(cantidad: f64, unidad: &str) -> Result<(), String> {
    if !cantidad.is_finite() {
        return Err("Cantidad no válida".to_string());
    }
    if cantidad <= 0.0 {
        return Err("La cantidad debe ser mayor que 0".to_string());
    }
    if cantidad > MAX_CANTIDAD {
        return Err("La cantidad excede el máximo permitido".to_string());
    }
    if unidad == "unidad" && cantidad.fract() != 0.0 {
        return Err("En 'unidad' la cantidad debe ser un número entero".to_string());
    }
    Ok(())
}

/// Cantidad de un detalle de venta: además de los checks, exige entero para unidad.
pub fn validar_cantidad_venta(cantidad: f64, unidad: &str) -> Result<(), String> {
    if unidad == "unidad" && cantidad.fract() != 0.0 {
        return Err("No se pueden vender fracciones de un producto en 'unidad'".to_string());
    }
    validar_cantidad(cantidad, "Cantidad")
}

/// Descuento entre 0 y subtotal (para que el total nunca quede negativo).
pub fn validar_descuento(descuento: i64, subtotal: i64) -> Result<(), String> {
    validar_monto(descuento, "Descuento")?;
    if descuento > subtotal {
        return Err("El descuento no puede superar el subtotal".to_string());
    }
    Ok(())
}

/// Tipo de pago en el enumerado cerrado.
pub fn validar_tipo_pago(t: &str) -> Result<(), String> {
    match t {
        "efectivo" | "pago_movil" | "punto" | "biopago" => Ok(()),
        _ => Err(format!("Tipo de pago inválido: {t}")),
    }
}

/// Combina la regla de negocio entre tipo de pago y moneda:
/// - En US$ el pago solo puede ser efectivo (divisas).
/// - Pago móvil y biopago requieren el número de referencia (el punto no).
pub fn validar_combinacion_pago(
    tipo: &str,
    moneda: &str,
    numero_referencia: Option<&str>,
) -> Result<(), String> {
    if moneda == "usd" && tipo != "efectivo" {
        return Err("En US$ el pago debe ser en efectivo (divisas)".to_string());
    }
    if (tipo == "pago_movil" || tipo == "biopago")
        && numero_referencia.is_none_or(|r| r.trim().is_empty())
    {
        return Err("El pago móvil y biopago requieren el número de referencia".to_string());
    }
    Ok(())
}

/// Moneda soportada (por ahora US$ base y Bs).
pub fn validar_moneda(m: &str) -> Result<(), String> {
    match m {
        "usd" | "ves" => Ok(()),
        _ => Err(format!("Moneda inválida: {m}")),
    }
}

/// Convierte un monto en céntimos de su moneda a céntimos de US$ (base).
/// La tasa es la del parámetro (`tasa_cambio` = Bs por 1 US$).
pub fn a_usd(monto: i64, moneda: &str, tasa: f64) -> Result<i64, String> {
    validar_moneda(moneda)?;
    if moneda == "usd" {
        return Ok(monto);
    }
    if !tasa.is_finite() || tasa <= 0.0 {
        return Err("Tasa de cambio inválida".to_string());
    }
    Ok((monto as f64 / tasa).round() as i64)
}

/// Unidad de medida válida.
pub fn validar_unidad_medida(u: &str) -> Result<(), String> {
    match u {
        "unidad" | "kg" | "paquete" | "bandeja" | "caja" => Ok(()),
        _ => Err(format!("Unidad de medida inválida: {u}")),
    }
}

/// Rol de operador válido.
pub fn validar_rol(r: &str) -> Result<(), String> {
    match r {
        "admin" | "cajero" => Ok(()),
        _ => Err(format!("Rol inválido: {r}")),
    }
}

/// PIN numérico de 4 dígitos.
pub fn validar_pin(pin: &str) -> Result<(), String> {
    let p = pin.trim();
    if p.len() != 4 || !p.chars().all(|c| c.is_ascii_digit()) {
        return Err("El PIN debe tener exactamente 4 dígitos".to_string());
    }
    Ok(())
}

/// Tipo de venta válido.
pub fn validar_tipo_venta(t: &str) -> Result<(), String> {
    match t {
        "contado" | "credito" => Ok(()),
        _ => Err(format!("Tipo de venta inválido: {t}")),
    }
}

/// Normaliza la clave única (código de producto, NIT) para evitar duplicados
/// "casi iguales" por espacios/capitalización.
pub fn normalizar_clave(s: &str) -> String {
    s.trim().to_uppercase().split_whitespace().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monedas_validas() {
        validar_moneda("usd").unwrap();
        validar_moneda("ves").unwrap();
        let err = validar_moneda("eur").unwrap_err();
        assert!(err.contains("eur"));
    }

    #[test]
    fn combinacion_pago_acepta_solo_los_métodos_vigentes() {
        validar_tipo_pago("efectivo").unwrap();
        validar_tipo_pago("pago_movil").unwrap();
        validar_tipo_pago("punto").unwrap();
        validar_tipo_pago("biopago").unwrap();
        assert!(validar_tipo_pago("transferencia").is_err());
        assert!(validar_tipo_pago("cheque").is_err());
        assert!(validar_tipo_pago("mixto").is_err());
    }

    #[test]
    fn usd_solo_efectivo() {
        validar_combinacion_pago("efectivo", "usd", None).unwrap();
        let err = validar_combinacion_pago("pago_movil", "usd", Some("REF1")).unwrap_err();
        assert!(err.contains("US$"), "{err}");
        let err = validar_combinacion_pago("biopago", "usd", Some("REF1")).unwrap_err();
        assert!(err.contains("US$"), "{err}");
        let err = validar_combinacion_pago("punto", "usd", Some("REF2")).unwrap_err();
        assert!(err.contains("US$"), "{err}");
        validar_combinacion_pago("pago_movil", "ves", Some("REF1")).unwrap();
        validar_combinacion_pago("biopago", "ves", Some("REF3")).unwrap();
        validar_combinacion_pago("punto", "ves", Some("REF2")).unwrap();
        validar_combinacion_pago("punto", "ves", None).unwrap();
        validar_combinacion_pago("efectivo", "ves", None).unwrap();
    }

    #[test]
    fn pago_movil_y_biopago_exigen_referencia_pero_punto_no() {
        let err = validar_combinacion_pago("pago_movil", "ves", None).unwrap_err();
        assert!(err.contains("referencia"), "{err}");
        let err = validar_combinacion_pago("pago_movil", "ves", Some("  ")).unwrap_err();
        assert!(err.contains("referencia"), "{err}");
        let err = validar_combinacion_pago("biopago", "ves", None).unwrap_err();
        assert!(err.contains("referencia"), "{err}");
        let err = validar_combinacion_pago("biopago", "ves", Some("  ")).unwrap_err();
        assert!(err.contains("referencia"), "{err}");
        // El punto ya no exige número de referencia.
        validar_combinacion_pago("punto", "ves", None).unwrap();
        validar_combinacion_pago("punto", "ves", Some("  ")).unwrap();
    }

    #[test]
    fn a_usd_es_identidad_en_usd() {
        assert_eq!(a_usd(1234, "usd", 36.85).unwrap(), 1234);
    }

    #[test]
    fn a_usd_convierte_ves() {
        // Bs 368.50 (36.850 céntimos) / 36.85 = $ 10.00 (1.000 céntimos)
        assert_eq!(a_usd(36_850, "ves", 36.85).unwrap(), 1000);
    }

    #[test]
    fn a_usd_rechaza_tasa_y_moneda_invalidas() {
        assert!(a_usd(100, "ves", 0.0).is_err());
        assert!(a_usd(100, "ves", -3.0).is_err());
        assert!(a_usd(100, "eur", 36.85).is_err());
    }

    #[test]
    fn montos_y_descuentos() {
        assert!(validar_monto_positivo(1, "X").is_ok());
        assert!(validar_monto_positivo(0, "X").is_err());
        assert!(validar_descuento(50, 100).is_ok());
        assert!(validar_descuento(101, 100).is_err());
    }
}

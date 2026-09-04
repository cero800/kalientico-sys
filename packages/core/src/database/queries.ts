// Consultas de referencia — la fuente de verdad vive en Rust (src-tauri/src/db.rs).
// Este archivo es documentación / posibles usos en herramientas auxiliares.

export const QUERIES = {
  LIST_EMPRESAS: "SELECT * FROM empresas WHERE activo = 1 ORDER BY nombre_comercial ASC",
  LIST_PRODUCTOS: "SELECT * FROM productos WHERE activo = 1 ORDER BY nombre ASC",
  LIST_STOCK: "SELECT p.id, p.nombre, p.codigo, COALESCE(s.cantidad_disponible, 0) as cantidad, p.unidad_medida FROM productos p LEFT JOIN stock s ON s.producto_id = p.id WHERE p.activo = 1",
  PRECIO_EFECTIVO: "SELECT COALESCE(pc.precio_especial, p.precio_base) FROM productos p LEFT JOIN precios_cliente pc ON pc.producto_id = p.id AND pc.empresa_id = ? WHERE p.id = ?",
  ESTADO_CUENTA: "SELECT e.id, e.nombre_comercial, (SELECT COALESCE(SUM(total),0) FROM ventas WHERE empresa_id = e.id AND estado = 'entregada') as facturado, (SELECT COALESCE(SUM(monto),0) FROM pagos WHERE empresa_id = e.id) as pagado FROM empresas e WHERE e.activo = 1",
  RESUMEN_DIA: "SELECT v.numero_factura, e.nombre_comercial, v.tipo, v.total FROM ventas v JOIN empresas e ON e.id = v.empresa_id WHERE date(v.fecha) = date(?) AND v.estado = 'entregada'",
};

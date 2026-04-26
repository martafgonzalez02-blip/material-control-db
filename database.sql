-- ================================================================
-- CLUB DE ESPELEOLOGÍA — Base de datos completa
-- Supabase / PostgreSQL
-- Modelo nativo multi-material por préstamo
-- ================================================================
 
 
-- ================================================================
-- 1. TABLAS
-- ================================================================
 
-- Categorías de material (con soporte de subcategorías)
CREATE TABLE categorias_material (
    id        SERIAL PRIMARY KEY,
    nombre    VARCHAR(100) NOT NULL,
    padre_id  INTEGER REFERENCES categorias_material(id),
    UNIQUE (nombre, padre_id)
);
 
-- Material del club
CREATE TABLE material (
    id                  SERIAL PRIMARY KEY,
    codigo              VARCHAR(20)  NOT NULL UNIQUE,
    nombre              VARCHAR(150) NOT NULL,
    descripcion         TEXT,
    categoria_id        INTEGER      NOT NULL REFERENCES categorias_material(id),
    cantidad_total      INTEGER      NOT NULL DEFAULT 1 CHECK (cantidad_total > 0),
    estado              VARCHAR(20)  NOT NULL DEFAULT 'bueno'
                            CHECK (estado IN ('bueno', 'revision', 'baja')),
    fecha_adquisicion   DATE,
    notas               TEXT,
    creado_en           TIMESTAMPTZ  DEFAULT NOW()
);
 
-- Socios del club
CREATE TABLE miembros (
    id                SERIAL PRIMARY KEY,
    numero_socio      VARCHAR(20)  NOT NULL UNIQUE,
    nombre            VARCHAR(100) NOT NULL,
    apellidos         VARCHAR(150) NOT NULL,
    email             VARCHAR(200),
    telefono          VARCHAR(20),
    tipo              VARCHAR(10)  NOT NULL CHECK (tipo IN ('adulto', 'juvenil')),
    fecha_alta        DATE         NOT NULL DEFAULT CURRENT_DATE,
    fecha_nacimiento  DATE,
    dni               VARCHAR(9)   UNIQUE,
    activo            BOOLEAN      NOT NULL DEFAULT TRUE,
    tutor_nombre      VARCHAR(200),
    tutor_telefono    VARCHAR(20),
    tutor_email       VARCHAR(200),
    CONSTRAINT chk_tutor_juvenil CHECK (
        tipo = 'adulto' OR (tipo = 'juvenil' AND tutor_nombre IS NOT NULL)
    )
);
 
-- Préstamos (una fila por evento de salida)
CREATE TABLE prestamos (
    id                      SERIAL PRIMARY KEY,
    miembro_id              INTEGER      REFERENCES miembros(id),
    visitante_nombre        VARCHAR(200),
    visitante_telefono      VARCHAR(20),
    fecha_salida            DATE         NOT NULL DEFAULT CURRENT_DATE,
    fecha_retorno_prevista  DATE         NOT NULL,
    fecha_retorno_real      DATE,
    estado                  VARCHAR(20)  NOT NULL DEFAULT 'activo'
                                CHECK (estado IN ('activo', 'devuelto', 'vencido')),
    notas                   TEXT,
    creado_en               TIMESTAMPTZ  DEFAULT NOW(),
    CONSTRAINT chk_prestamo_persona CHECK (
        (miembro_id IS NOT NULL AND visitante_nombre IS NULL) OR
        (miembro_id IS NULL     AND visitante_nombre IS NOT NULL)
    ),
    CONSTRAINT chk_fechas CHECK (fecha_retorno_prevista >= fecha_salida)
);
 
-- Items de cada préstamo (un material por fila)
CREATE TABLE prestamo_items (
    id           SERIAL  PRIMARY KEY,
    prestamo_id  INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
    material_id  INTEGER NOT NULL REFERENCES material(id),
    cantidad     INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0)
);
 
-- Inventarios semanales (cabecera)
CREATE TABLE inventarios (
    id         SERIAL PRIMARY KEY,
    fecha      DATE        NOT NULL DEFAULT CURRENT_DATE,
    notas      TEXT,
    creado_en  TIMESTAMPTZ DEFAULT NOW()
);
 
-- Inventarios semanales (detalle por material)
CREATE TABLE inventario_detalle (
    id                 SERIAL PRIMARY KEY,
    inventario_id      INTEGER NOT NULL REFERENCES inventarios(id),
    material_id        INTEGER NOT NULL REFERENCES material(id),
    cantidad_esperada  INTEGER NOT NULL,
    cantidad_contada   INTEGER NOT NULL,
    diferencia         INTEGER GENERATED ALWAYS AS (cantidad_contada - cantidad_esperada) STORED,
    notas              TEXT,
    UNIQUE (inventario_id, material_id)
);
 
 
-- ================================================================
-- 2. FUNCIÓN Y TRIGGER — Número de socio automático
-- ================================================================
 
CREATE OR REPLACE FUNCTION generar_numero_socio()
RETURNS TRIGGER AS $$
DECLARE
    prefijo   TEXT;
    siguiente INT;
BEGIN
    prefijo := CASE NEW.tipo WHEN 'adulto' THEN 'ADU' ELSE 'JUV' END;
    SELECT COUNT(*) + 1 INTO siguiente FROM miembros WHERE tipo = NEW.tipo;
    NEW.numero_socio := prefijo || '-' || LPAD(siguiente::TEXT, 3, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER trigger_numero_socio
BEFORE INSERT ON miembros
FOR EACH ROW
WHEN (NEW.numero_socio IS NULL OR NEW.numero_socio = '')
EXECUTE FUNCTION generar_numero_socio();
 
 
-- ================================================================
-- 3. CATEGORÍAS
-- ================================================================
 
INSERT INTO categorias_material (nombre, padre_id) VALUES
    ('Cuerdas',              NULL),
    ('Cascos',               NULL),
    ('Equipo Espeleología',  NULL),
    ('Equipo Escalada',      NULL),
    ('Mosquetones',          NULL),
    ('Otros',                NULL);
 
INSERT INTO categorias_material (nombre, padre_id)
SELECT sub.nombre, c.id
FROM (VALUES
    ('Cuerda Espeleología'),
    ('Cuerda Barranco'),
    ('Cuerda Acuática'),
    ('Cuerda Escalada')
) AS sub(nombre)
CROSS JOIN (SELECT id FROM categorias_material WHERE nombre = 'Cuerdas') AS c;
 

 
 
-- ================================================================
-- 7. VISTAS
-- ================================================================
 
-- Material con disponibilidad actual
CREATE OR REPLACE VIEW v_material_disponible AS
SELECT
    m.id,
    m.codigo,
    m.nombre,
    c.nombre                                                                                         AS categoria,
    m.cantidad_total,
    COALESCE(SUM(pi.cantidad) FILTER (WHERE p.estado IN ('activo','vencido')), 0)                    AS cantidad_prestada,
    m.cantidad_total - COALESCE(SUM(pi.cantidad) FILTER (WHERE p.estado IN ('activo','vencido')), 0) AS cantidad_disponible,
    m.estado
FROM material m
JOIN categorias_material c   ON c.id = m.categoria_id
LEFT JOIN prestamo_items pi  ON pi.material_id = m.id
LEFT JOIN prestamos p        ON p.id = pi.prestamo_id
WHERE m.estado != 'baja'
GROUP BY m.id, c.nombre
ORDER BY c.nombre, m.nombre;
 
-- Préstamos activos con detalle por material
CREATE OR REPLACE VIEW v_prestamos_activos AS
SELECT
    p.id                                                                 AS prestamo_id,
    COALESCE(s.nombre || ' ' || s.apellidos, p.visitante_nombre)         AS persona,
    COALESCE(s.numero_socio, 'Visitante')                                AS socio,
    mat.codigo,
    mat.nombre                                                           AS material,
    pi.cantidad,
    p.fecha_salida,
    p.fecha_retorno_prevista,
    (CURRENT_DATE - p.fecha_retorno_prevista)                            AS dias_retraso
FROM prestamos p
JOIN prestamo_items pi  ON pi.prestamo_id = p.id
JOIN material mat       ON mat.id = pi.material_id
LEFT JOIN miembros s    ON s.id = p.miembro_id
WHERE p.estado IN ('activo', 'vencido')
ORDER BY p.fecha_retorno_prevista;
 
-- Solo los préstamos vencidos
CREATE OR REPLACE VIEW v_prestamos_vencidos AS
SELECT * FROM v_prestamos_activos WHERE dias_retraso > 0;
 
-- Socios activos con resumen de préstamos
CREATE OR REPLACE VIEW v_miembros_activos AS
SELECT
    m.numero_socio,
    m.nombre || ' ' || m.apellidos                                       AS nombre_completo,
    m.tipo,
    m.email,
    m.telefono,
    m.fecha_alta,
    COUNT(DISTINCT p.id)                                                 AS prestamos_historico,
    COUNT(DISTINCT p.id) FILTER (WHERE p.estado IN ('activo','vencido')) AS prestamos_activos
FROM miembros m
LEFT JOIN prestamos p ON p.miembro_id = m.id
WHERE m.activo = TRUE
GROUP BY m.id
ORDER BY m.tipo, m.apellidos;
 
-- Último inventario con resultado por material
CREATE OR REPLACE VIEW v_ultimo_inventario AS
SELECT
    mat.codigo,
    mat.nombre                  AS material,
    c.nombre                    AS categoria,
    d.cantidad_esperada,
    d.cantidad_contada,
    d.diferencia,
    CASE
        WHEN d.diferencia = 0  THEN 'OK'
        WHEN d.diferencia > 0  THEN 'Sobra'
        WHEN d.diferencia < 0  THEN 'Falta'
    END                         AS resultado,
    d.notas
FROM inventario_detalle d
JOIN inventarios i          ON i.id = d.inventario_id
JOIN material mat           ON mat.id = d.material_id
JOIN categorias_material c  ON c.id = mat.categoria_id
WHERE i.id = (SELECT MAX(id) FROM inventarios)
ORDER BY c.nombre, mat.codigo;
 
 
-- ================================================================
-- 8. FUNCIONES
-- ================================================================
 
-- Marcar como vencidos los préstamos activos cuya fecha ya pasó
CREATE OR REPLACE FUNCTION actualizar_prestamos_vencidos()
RETURNS INTEGER AS $$
DECLARE n INTEGER;
BEGIN
    UPDATE prestamos
    SET estado = 'vencido'
    WHERE estado = 'activo'
      AND fecha_retorno_prevista < CURRENT_DATE;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$ LANGUAGE plpgsql;
 
-- Crear un inventario semanal con cantidades esperadas pre-calculadas
CREATE OR REPLACE FUNCTION crear_inventario_semanal(p_notas TEXT DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE v_id INTEGER;
BEGIN
    INSERT INTO inventarios (fecha, notas) VALUES (CURRENT_DATE, p_notas)
    RETURNING id INTO v_id;
 
    INSERT INTO inventario_detalle (inventario_id, material_id, cantidad_esperada, cantidad_contada)
    SELECT
        v_id,
        m.id,
        m.cantidad_total - COALESCE(SUM(pi.cantidad) FILTER (WHERE p.estado IN ('activo','vencido')), 0),
        0
    FROM material m
    LEFT JOIN prestamo_items pi ON pi.material_id = m.id
    LEFT JOIN prestamos p       ON p.id = pi.prestamo_id
    WHERE m.estado != 'baja'
    GROUP BY m.id;
 
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;
 
 
-- ================================================================
-- 9. RLS (Row Level Security)
-- ================================================================
 
ALTER TABLE miembros            ENABLE ROW LEVEL SECURITY;
ALTER TABLE material            ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE prestamos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE prestamo_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventarios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_detalle  ENABLE ROW LEVEL SECURITY;
 
-- Lectura pública
CREATE POLICY "lectura_miembros"            ON miembros            FOR SELECT USING (true);
CREATE POLICY "lectura_material"            ON material            FOR SELECT USING (true);
CREATE POLICY "lectura_categorias"          ON categorias_material FOR SELECT USING (true);
CREATE POLICY "lectura_prestamos"           ON prestamos           FOR SELECT USING (true);
CREATE POLICY "lectura_prestamo_items"      ON prestamo_items      FOR SELECT USING (true);
CREATE POLICY "lectura_inventarios"         ON inventarios         FOR SELECT USING (true);
CREATE POLICY "lectura_inventario_detalle"  ON inventario_detalle  FOR SELECT USING (true);
 
-- Escritura
CREATE POLICY "insertar_prestamos"          ON prestamos           FOR INSERT WITH CHECK (true);
CREATE POLICY "actualizar_prestamos"        ON prestamos           FOR UPDATE USING (true);
CREATE POLICY "insertar_prestamo_items"     ON prestamo_items      FOR INSERT WITH CHECK (true);
CREATE POLICY "insertar_inventarios"        ON inventarios         FOR INSERT WITH CHECK (true);
CREATE POLICY "insertar_inventario_det"     ON inventario_detalle  FOR INSERT WITH CHECK (true);
CREATE POLICY "actualizar_inventario_det"   ON inventario_detalle  FOR UPDATE USING (true);
<<<<<<< HEAD
# Club de Espeleología — Gestión de Material

## Formularios

Solicitud préstamo de material: https://docs.google.com/forms/d/1XkOXKj5GsY7JHJ3cM8BOu2VXl8SLXzIjRvDQ4b_QEKc/viewform

Devolución de material: https://docs.google.com/forms/d/1-kOBO4JhIiL9O4LfQ9vMKKxfmFtjUOuPljswbV3Wa4w/viewform

---

## Modelo de datos

```
categorias_material
├── id  PK
├── nombre
└── padre_id  FK → categorias_material.id   (subcategorías)

material
├── id  PK
├── codigo  UNIQUE
├── nombre
├── descripcion
├── categoria_id  FK → categorias_material.id
├── cantidad_total
├── estado  (bueno | revision | baja)
├── fecha_adquisicion
└── notas

miembros
├── id  PK
├── numero_socio  UNIQUE  (generado automáticamente)
├── nombre / apellidos
├── email / telefono
├── tipo  (adulto | juvenil)
├── fecha_alta / fecha_nacimiento
├── dni  UNIQUE
├── activo
└── tutor_nombre / tutor_telefono / tutor_email  (solo juveniles)

prestamos
├── id  PK
├── miembro_id  FK → miembros.id   ┐ uno de los dos
├── visitante_nombre / telefono    ┘ obligatorio
├── fecha_salida
├── fecha_retorno_prevista
├── fecha_retorno_real
├── estado  (activo | devuelto | vencido)
└── notas

prestamo_items
├── id  PK
├── prestamo_id  FK → prestamos.id  (CASCADE DELETE)
├── material_id  FK → material.id
└── cantidad

inventarios
├── id  PK
├── fecha
└── notas

inventario_detalle
├── id  PK
├── inventario_id  FK → inventarios.id
├── material_id    FK → material.id
├── cantidad_esperada
├── cantidad_contada
└── diferencia  (calculada)
```

### Relaciones principales

```
categorias_material ──< material
miembros ──< prestamos >──< prestamo_items >── material
inventarios ──< inventario_detalle >── material
```

### Vistas para el seguimiento y control del material

| Vista | Descripción |
|-------|-------------|
| `v_material_disponible` | Stock disponible por material (total − prestado) |
| `v_prestamos_activos` | Préstamos en estado activo o vencido con detalle de material |
| `v_prestamos_vencidos` | Subconjunto de activos con fecha de retorno superada |
| `v_miembros_activos` | Socios activos con conteo de préstamos |
| `v_ultimo_inventario` | Resultado del último inventario (OK / Sobra / Falta) |
=======
# material-control-db
A structured PostgreSQL database designed to manage the full lifecycle of equipment loans in a climbing and caving club. Tracks gear availability in real time, automates loan and return workflows through Google Forms and Apps Script, sends email notifications to members and club managers, and handles weekly overdue reminders.

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function validateProduction(body, isUpdate = false) {
  const errors = [];
  const producto          = typeof body.producto           === 'string' ? body.producto.trim()         : null;
  const codigo_produccion = typeof body.codigo_produccion  === 'string' ? body.codigo_produccion.trim() : null;
  const fecha_estimada    = typeof body.fecha_estimada === 'string' && body.fecha_estimada ? body.fecha_estimada.trim() : null;
  const cantidad_unidades = body.cantidad_unidades !== undefined ? parseInt(body.cantidad_unidades, 10) : null;

  if (!isUpdate) {
    if (!producto || producto.length === 0)          errors.push('El producto es requerido.');
    if (!codigo_produccion || codigo_produccion.length === 0) errors.push('El código de producción es requerido.');
    if (!fecha_estimada)                             errors.push('La fecha estimada es requerida.');
    if (cantidad_unidades === null || isNaN(cantidad_unidades)) errors.push('La cantidad de unidades es requerida.');
  }
  if (producto && producto.length > 255)             errors.push('Nombre demasiado largo (máx 255).');
  if (codigo_produccion && codigo_produccion.length > 100) errors.push('Código demasiado largo (máx 100).');
  if (fecha_estimada && isNaN(Date.parse(fecha_estimada))) errors.push('Fecha inválida. Usar YYYY-MM-DD.');
  if (cantidad_unidades !== null && !isNaN(cantidad_unidades) && cantidad_unidades < 0) errors.push('La cantidad no puede ser negativa.');

  return { errors, data: { producto, codigo_produccion, fecha_estimada, cantidad_unidades } };
}

// GET /api/productions
router.get('/', (req, res) => {
  try {
    const db = getDB();
    const productions = db.prepare(
      'SELECT * FROM productions ORDER BY fecha_estimada ASC, created_at ASC'
    ).all();
    res.json({ ok: true, productions });
  } catch (err) {
    console.error('[GET /productions]', err);
    res.status(500).json({ error: 'No se pudieron obtener las producciones.' });
  }
});

// POST /api/productions
router.post('/', (req, res) => {
  try {
    const { errors, data } = validateProduction(req.body, false);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const db  = getDB();
    const id  = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO productions (id, producto, codigo_produccion, fecha_estimada, cantidad_unidades, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.producto, data.codigo_produccion, data.fecha_estimada, data.cantidad_unidades, req.session.userName || null, now, now);

    const production = db.prepare('SELECT * FROM productions WHERE id = ?').get(id);
    res.status(201).json({ ok: true, production });
  } catch (err) {
    console.error('[POST /productions]', err);
    res.status(500).json({ error: 'No se pudo crear la producción.' });
  }
});

// PATCH /api/productions/:id
router.patch('/:id', (req, res) => {
  try {
    const db       = getDB();
    const existing = db.prepare('SELECT * FROM productions WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Producción no encontrada.' });

    const { errors, data } = validateProduction(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const fields = [], values = [];
    if (data.producto !== null)          { fields.push('producto = ?');           values.push(data.producto); }
    if (data.codigo_produccion !== null) { fields.push('codigo_produccion = ?');  values.push(data.codigo_produccion); }
    if (data.fecha_estimada !== null)    { fields.push('fecha_estimada = ?');     values.push(data.fecha_estimada); }
    if (data.cantidad_unidades !== null && !isNaN(data.cantidad_unidades)) {
      fields.push('cantidad_unidades = ?'); values.push(data.cantidad_unidades);
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar.' });

    const now = new Date().toISOString();
    fields.push('updated_at = ?');
    values.push(now, req.params.id);

    db.prepare(`UPDATE productions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM productions WHERE id = ?').get(req.params.id);
    res.json({ ok: true, production: updated });
  } catch (err) {
    console.error('[PATCH /productions/:id]', err);
    res.status(500).json({ error: 'No se pudo actualizar la producción.' });
  }
});

// DELETE /api/productions/:id
router.delete('/:id', (req, res) => {
  try {
    const db       = getDB();
    const existing = db.prepare('SELECT id FROM productions WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Producción no encontrada.' });
    db.prepare('DELETE FROM productions WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /productions/:id]', err);
    res.status(500).json({ error: 'No se pudo eliminar la producción.' });
  }
});

module.exports = router;

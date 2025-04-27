const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const app = express();
const PORT = 3001;
app.use(cors());
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json());






// Con esto se conecta ala BD ZPROVAHSA
const dbConfig = {
  user: 'prueba1',
  password: 'Araya2024',
  server: 'SVRSOFT00',
  database: 'ZPROVAHSA',
  options: {
    encrypt: true,
    trustServerCertificate: true    
  }
};

//Con esto se conecta Ala BD ArayaHermanos
const dbConfigAraya = {
  user: 'CarlosJamett',
  password: 'Araya2024',
  server: '192.168.0.197',
  database: 'ArayaHermanos',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};







//inicio de sesion 
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const pool = await sql.connect(dbConfigAraya);
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .input('password', sql.VarChar, password)
      .query(`
        SELECT * FROM dbo.Usuarios
        WHERE Usuario = @username AND Contraseña = @password
      `);

    if (result.recordset.length > 0) {
      const user = result.recordset[0];
      res.json({
        success: true,
        username: user.Usuario,
        rol: user.Rol
      });
    } else {
      res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

  } catch (err) {
    console.error('Error en login:', err.message);
    res.status(500).send('Error en el login');
  }
  
});






//el estado de la solicitud
app.put('/api/solped/:id/estado', async (req, res) => {
  const { id } = req.params;
  const { nuevoEstado } = req.body;

  try {
    const pool = await sql.connect(dbConfigAraya);
    await pool.request()
      .input('id', sql.Int, id)
      .input('estado', sql.VarChar, nuevoEstado)
      .query('UPDATE SolPed SET Estado = @estado WHERE NumeroSolicitud = @id');
    res.send('Estado actualizado');
  } catch (err) {
    console.error('Error al actualizar estado:', err.message);
    res.status(500).send('Error al actualizar estado');
  }
});








//Guarda las Solicitudes en La BD AH y En la tabla SolPed
// POST: guardar solicitud incluyendo el usuario que la envió
app.post('/api/solped', async (req, res) => {
  let pool;
  try {
    pool = await new sql.ConnectionPool(dbConfigAraya).connect();
    const solicitudes = req.body.solicitudes;
    const usuario = req.body.usuario;

    const request = pool.request();

    for (const item of solicitudes) {
      const observacionSegura = item.observacion?.replace(/'/g, "''") || '';
      await request.query(`
        INSERT INTO dbo.SolPed (
          CodProd, DesProd, Cantidad, Stock, CentroCosto, Observacion,
          Empresa, FechaSolicitud, NumeroSolicitud, Usuario
        ) VALUES (
          '${item.codProd}', '${item.desProd}', ${parseInt(item.cantidad)},
          ${parseInt(item.stock)}, '${item.centroCosto}', '${observacionSegura}',
          '${item.empresa}', '${item.fechaSolicitud}', ${parseInt(item.numeroSolicitud)},
          '${usuario}'
        )
      `);
    }

    res.status(200).send('Solicitudes guardadas correctamente.');
  } catch (err) {
    console.error('Error al guardar en SolPed:', err.message);
    res.status(500).send('Error al guardar en SolPed: ' + err.message);
  } finally {
    if (pool) pool.close();
  }
});

// GET: historial de solicitudes filtrado por usuario/rol
app.get('/api/solped', async (req, res) => {
  const usuario = req.query.usuario;
  const rol = req.query.rol;
  try {
    const pool = await sql.connect(dbConfigAraya);
    let query = 'SELECT * FROM dbo.SolPed';
    if (rol === 'trabajador') {
      query += ` WHERE Usuario = '${usuario}'`;
    }
    const result = await pool.request().query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error al obtener solicitudes:', err.message);
    res.status(500).send('Error al obtener solicitudes');
  }
});



//Nos Muestra El Numero Que Sigue en la Tabla SolPed
app.get('/api/solped/ultimo', async (req, res) => {
  try {
    const pool = await new sql.ConnectionPool(dbConfigAraya).connect();
    const result = await pool.request().query(`
      SELECT MAX(NumeroSolicitud) AS ultimo FROM dbo.SolPed
    `);
    const ultimo = result.recordset[0].ultimo || 0;
    res.json({ siguiente: ultimo + 1 });
  } catch (err) {
    console.error('Error al obtener número de solicitud:', err.message);
    res.status(500).send('Error al obtener el número de solicitud');
  }
});

// Nos Muestra que la BD Esta Funcionando
app.get('/', (req, res) => {
  res.send('Servidor backend funcionando correctamente ');
});








//productos con stock desde ZPROVAHSA
app.get('/api/productos', async (req, res) => {
  let pool;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();

    const currentDb = await pool.request().query('SELECT DB_NAME() AS base');
    console.log("🧠 Consulta de productos conectada a:", currentDb.recordset[0].base);

    const result = await pool.request().query(`
      SELECT 
        p.CodProd, 
        p.DesProd,
        ISNULL(SUM(m.Ingresos), 0) - ISNULL(SUM(m.Egresos), 0) AS stock_actual
      FROM softland.iw_tprod p
      LEFT JOIN softland.IW_MovimStock m ON p.CodProd = m.CodProd
      GROUP BY p.CodProd, p.DesProd
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error('❌ Error productos:', err.message);
    res.status(500).send('Error productos: ' + err.message);
  } finally {
    if (pool) pool.close();
  }
});







//Ruta stock desde ZPROVAHSA
app.get('/api/stock', async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig );
    const result = await pool.request().query(`
      SELECT 
        p.CodProd,
        p.DesProd,
        SUM(ISNULL(m.Ingresos, 0)) - SUM(ISNULL(m.Egresos, 0)) AS stock_actual
      FROM softland.IW_MovimStock m
      INNER JOIN softland.iw_tprod p ON m.CodProd = p.CodProd
      GROUP BY p.CodProd, p.DesProd
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error stock:', err.message);
    res.status(500).send('Error stock: ' + err.message);
  }
});






//Ruta centros de costo desde ZPROVAHSA
app.get('/api/centrocostos', async (req, res) => {
  try {
    await sql.connect(dbConfig );
    const result = await sql.query(`
      SELECT CodiCC, DescCC
      FROM softland.cwtccos
      WHERE NivelCC = 3 AND Activo = 'S'
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error centros de costo:', err.message);
    res.status(500).send('Error centros de costo: ' + err.message);
  }
});







// Obtener solicitudes por trabajador
app.get('/api/solicitudes/:usuario', async (req, res) => {
  const { usuario } = req.params;

  try {
    const pool = await new sql.ConnectionPool(dbConfigAraya).connect();
    const result = await pool.request()
      .input('usuario', sql.VarChar, usuario)
      .query(`
        SELECT * FROM dbo.SolPed
        WHERE Usuario = @usuario
        ORDER BY FechaSolicitud DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Error al obtener historial de solicitudes:', err.message);
    res.status(500).send('Error al obtener historial');
  }
});





app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor backend corriendo en http://192.168.0.197:${PORT}`);
});
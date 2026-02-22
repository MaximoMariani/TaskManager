# 📋 Team Task Manager

Panel interno de gestión de tareas tipo Kanban.

---

## 🚀 Cómo ejecutarlo (3 pasos)

### 1. Instalar dependencias
```bash
npm install
```

### 2. Crear el archivo .env
```bash
cp .env.example .env
```
El `.env` ya tiene valores por defecto que funcionan para desarrollo.
La contraseña por defecto es: **`changeme`**

### 3. Correr el servidor
```bash
npm start
```

Abrí el navegador en: **http://localhost:3000/pages/index.html**

---

## 🔐 Login

- **Nombre:** cualquier nombre (ej: "Ana García")
- **Contraseña:** `changeme` (o lo que pusiste en `TEAM_PASSWORD`)

---

## 📁 Estructura

```
├── src/
│   ├── server.js           # Servidor Express
│   ├── db/database.js      # SQLite + auto-migración
│   ├── middleware/auth.js  # Protección de rutas
│   └── routes/
│       ├── auth.js         # Login / Logout / Me
│       ├── tasks.js        # CRUD de tareas
│       └── stats.js        # Métricas dashboard
└── public/
    ├── pages/
    │   ├── index.html      # Login
    │   ├── board.html      # Tablero Kanban
    │   └── dashboard.html  # Dashboard
    ├── css/styles.css
    └── js/
        ├── board.js
        └── dashboard.js
```

---

## 🌐 Deploy en Render

1. Subí el proyecto a GitHub
2. En render.com → New → Web Service
3. Conectá el repo
4. Build command: `npm install`
5. Start command: `npm start`
6. Agregá variables de entorno:
   - `TEAM_PASSWORD` = tu contraseña
   - `SESSION_SECRET` = string largo aleatorio
   - `TEAM_NAME` = nombre del equipo
   - `NODE_ENV` = production

---

## 🔄 Cambiar contraseña

Editá `TEAM_PASSWORD` en `.env` y reiniciá el servidor.
La nueva contraseña se hashea automáticamente.

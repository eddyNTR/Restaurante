# Broastería – Demo Flask + Google Sheets

Esta demo crea una interfaz web simple para tomar pedidos (ej. "Pollo Económico") y los envía a un backend Flask.
El backend registra cada pedido en una hoja de Google Sheets usando una **Cuenta de Servicio**.

## 1) Preparación en Google
1. Crea una Hoja de cálculo en Google Sheets y nómbrala, por ejemplo: `Broasteria`.
2. Copia el **ID de la hoja** desde la URL (lo que está entre `/d/` y `/edit`).
3. En Google Cloud, crea un proyecto (si no tienes), habilita **Google Sheets API**.
4. Crea una **Cuenta de servicio** y genera una **clave JSON**. Descarga el archivo y guárdalo como `service_account.json` en la raíz de este proyecto.
5. Comparte tu Google Sheet con el correo de la cuenta de servicio (permiso Editor). Ejemplo: `broasteria@mi-proyecto.iam.gserviceaccount.com`.

## 2) Configurar variables de entorno
1. Duplica el archivo `.env.example` como `.env` y completa:
   - `SHEET_ID` = ID de tu hoja
   - `GOOGLE_SERVICE_ACCOUNT_FILE` = `service_account.json`
   - `SHEET_TAB` = nombre de la pestaña (por defecto `Pedidos`)

## 3) Instalar dependencias y ejecutar
```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux/Mac
source .venv/bin/activate

pip install -r requirements.txt
flask --app app.py run --port 5000 --debug
```
Abre `http://localhost:5000` en tu navegador.

## 4) Estructura
- `app.py` – servidor Flask con endpoint `/api/order` para guardar pedidos.
- `templates/index.html` – interfaz simple con opciones y formulario.
- `static/main.js` – lógica de envío al backend.
- `service_account.json` – **No incluido**. Tu clave de la cuenta de servicio.
- `.env` – **No incluido**. Configura tus variables.
- `requirements.txt` – dependencias.

## 5) Personalización rápida
- Agrega/edita opciones de menú en `templates/index.html` (sección “Opciones rápidas”).
- Agrega campos (por ejemplo, teléfono, mesa) y en `app.py` añade columnas nuevas en `append_row` para registrarlos.
- Cambia la pestaña/Sheet con `SHEET_TAB` en `.env`.

## 6) Seguridad y despliegue
- Para producción, configura un proxy (Nginx) y ejecuta Flask con Gunicorn.
- No subas `service_account.json` a repos públicos.
- Limita CORS a tu dominio en `app.py` si lo expones en Internet.

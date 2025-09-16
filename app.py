from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import threading, uuid, json, os
from datetime import datetime, timedelta
from io import BytesIO
import qrcode

app = Flask(__name__, static_folder="static", template_folder="templates")

DATA_FILE = "pending.json"
PAY_FILE = "payments.json"

_lock = threading.Lock()
_pending = []
_payments = []

MERCHANT_FAKE = {
    "nombre": "Broastería Demo",
    "banco": "Banco Ficticio",
    "cuenta": "999-000-12345",
    "nit": "123456789"
}

def _load_file(fn):
    if os.path.exists(fn):
        try:
            with open(fn, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"No se pudo cargar {fn}:", e)
    return []

def _save_file(fn, data):
    try:
        tmp = fn + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)
        os.replace(tmp, fn)
    except Exception as e:
        print(f"Error guardando {fn}:", e)

def _load():
    global _pending, _payments
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                _pending = json.load(f)
        except Exception as e:
            print("No se pudo cargar pending.json:", e)
            _pending = []
    else:
        _pending = []
    _payments = _load_file(PAY_FILE)

def _save():
    try:
        with open(DATA_FILE + ".tmp", "w", encoding="utf-8") as f:
            json.dump(_pending, f, ensure_ascii=False, indent=2, default=str)
        os.replace(DATA_FILE + ".tmp", DATA_FILE)
    except Exception as e:
        print("Error guardando pending.json:", e)

# carga inicial
_load()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/meseros")
def meseros():
    return render_template("meseros.html")

# Obtener la cola de pedidos (FIFO)
@app.route("/api/pending", methods=["GET"])
def get_pending():
    with _lock:
        return jsonify({"ok": True, "orders": _pending})

# Crear nuevo pedido (desde index)
@app.route("/api/pending", methods=["POST"])
def create_pending():
    data = request.get_json(force=True)
    item = (data.get("item") or "").strip()
    quantity = int(data.get("quantity") or 1)
    notes = (data.get("notes") or "").strip()
    price = data.get("price") or ""
    if not item:
        return jsonify({"ok": False, "error": "Falta item"}), 400
    if quantity <= 0:
        return jsonify({"ok": False, "error": "Cantidad inválida"}), 400

    order = {
        "id": uuid.uuid4().hex[:8],
        "ts": datetime.now().isoformat(sep=" "),
        "item": item,
        "quantity": quantity,
        "notes": notes,
        "price": price
    }
    with _lock:
        _pending.append(order)
        _save()
    return jsonify({"ok": True, "order": order}), 201

# Marcar entregado (elimina de la cola)
@app.route("/api/pending/<order_id>/delivered", methods=["POST"])
def deliver(order_id):
    with _lock:
        idx = next((i for i,o in enumerate(_pending) if o["id"]==order_id), None)
        if idx is None:
            return jsonify({"ok": False, "error": "ID no encontrado"}), 404
        _pending.pop(idx)
        _save()
    return jsonify({"ok": True, "id": order_id})

# ====== NUEVAS RUTAS (debían estar antes de app.run) ======

@app.post("/api/checkout")
def checkout():
    """
    Body JSON:
    {
      "order_id": "...",
      "with_invoice": true/false,
      "nit": "1234567",
      "razon_social": "Mi Empresa SRL",
      "payment_method": "qr"|"card"|"cash"
    }
    """
    data = request.get_json(force=True)
    order_id = (data.get("order_id") or "").strip()
    method   = (data.get("payment_method") or "qr").lower()
    with_invoice = bool(data.get("with_invoice", False))
    nit = (data.get("nit") or "").strip()
    rs  = (data.get("razon_social") or "").strip()

    if not order_id:
        return jsonify({"ok": False, "error": "Falta order_id"}), 400
    if method not in ("qr","card","cash"):
        return jsonify({"ok": False, "error": "Método inválido"}), 400

    with _lock:
        order = next((o for o in _pending if o["id"] == order_id), None)
        if not order:
            return jsonify({"ok": False, "error": "Orden no encontrada"}), 404

        try:
            unit_price = float(order.get("price") or 0)
        except:
            unit_price = 0.0
        qty = int(order.get("quantity") or 1)
        amount = round(unit_price * qty, 2)

        pid = uuid.uuid4().hex[:10]
        now = datetime.now().isoformat(sep=" ")

        intent = {"payment_id": pid, "method": method}
        if method == "qr":
            # para tu front; si usas QR estático, esto no es necesario
            intent["qr_payload"] = f"pay://mock/qr/{pid}"
        elif method == "card":
            intent["redirect_url"] = f"/mock/checkout/{pid}"
        else:  # cash
            intent["voucher"] = {
                "code": pid[:8].upper(),
                "expires_at": (datetime.now() + timedelta(hours=1)).isoformat(sep=" ")
            }

        payment = {
            "id": pid,
            "order_id": order_id,
            "amount": amount,
            "currency": "BOB",
            "method": method,
            "status": "PENDING",
            "with_invoice": with_invoice,
            "nit": nit if with_invoice else "",
            "razon_social": rs if with_invoice else "",
            "provider": "mock",
            "created_at": now,
            "updated_at": now
        }
        _payments.append(payment)
        _save_file(PAY_FILE, _payments)

    return jsonify({"ok": True, **intent}), 201

@app.get("/pay/qr/<payment_id>")
def qr_pay_page(payment_id):
    with _lock:
        p = next((x for x in _payments if x["id"] == payment_id), None)
    if not p:
        return "<h3>Pago no encontrado</h3>", 404

    html = f"""<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pagar a {MERCHANT_FAKE['nombre']}</title>
<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 16px;">
  <h2>Pagar a {MERCHANT_FAKE['nombre']}</h2>
  <p>
    <strong>Monto:</strong> {p['amount']} {p['currency']}<br>
    <strong>Cuenta:</strong> {MERCHANT_FAKE['cuenta']} ({MERCHANT_FAKE['banco']})<br>
    <strong>NIT:</strong> {MERCHANT_FAKE['nit']}<br>
    <strong>ID de pago:</strong> {p['id']}
  </p>
  <p style="color:#555">Cuenta ficticia para pruebas. Este flujo marca el pago como <em>PAID</em> en tu servidor.</p>

  <button id="btnPay" style="padding:10px 16px; border-radius:8px; border:0; background:#0a0; color:#fff; font-weight:700;">
    Pagar ahora
  </button>

  <script>
    document.getElementById('btnPay').addEventListener('click', async () => {{
      try {{
        const res = await fetch('/api/payments/{p['id']}/mock-paid', {{ method: 'POST' }});
        const data = await res.json();
        if (data.ok) {{
          alert('¡Pago realizado (mock)!');
          window.location.href = '/';
        }} else {{
          alert(data.error || 'No se pudo completar el pago');
        }}
      }} catch (err) {{
        alert('Error: ' + err.message);
      }}
    }});
  </script>
</body>
</html>"""
    return html

@app.get("/qr")
def qr_png():
    data = request.args.get("data", "")
    if not data:
        return "Falta parámetro data", 400
    img = qrcode.make(data)  # requiere pillow
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")

# ====== FIN DE RUTAS ======

# (Opcional) CORS si tu front corre en otro origen/puerto
# CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173","http://localhost:3000"]}}, supports_credentials=True)

if __name__ == "__main__":
    # deja app.run AL FINAL, después de registrar TODAS las rutas
    app.run(host="0.0.0.0", port=5000, debug=True)